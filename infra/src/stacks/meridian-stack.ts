import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface MeridianStackProps extends cdk.StackProps {
  /**
   * Application environment (dev | staging | prod).
   * Controls retention policies and other env-specific settings.
   */
  appEnv?: 'dev' | 'staging' | 'prod';
}

/**
 * Top-level Meridian CDK stack.
 *
 * Provisions all AWS resources required by the Meridian system:
 * - SQS Tickets Queue + DLQ with CloudWatch alarm (INFRA-05)
 * - DynamoDB tables: audit log + idempotency (INFRA-06, INFRA-07)
 * - S3 assets bucket
 * - EventBridge custom bus
 * - Aurora Serverless v2 with pgvector (INFRA-01)
 * - Lambda eval function with pnpm workspace bundling
 * - IAM execution role for Lambda functions
 *
 * All resources follow the `meridian-{env}-{resource}` naming convention.
 */
export class MeridianStack extends cdk.Stack {
  /** DynamoDB audit log table */
  public readonly auditTable: dynamodb.TableV2;

  /** DynamoDB idempotency table for webhook deduplication */
  public readonly idempotencyTable: dynamodb.TableV2;

  /** SQS tickets queue */
  public readonly ticketsQueue: sqs.Queue;

  /** SQS dead-letter queue */
  public readonly ticketsDlq: sqs.Queue;

  /** S3 assets bucket */
  public readonly assetsBucket: s3.Bucket;

  /** EventBridge custom event bus */
  public readonly eventBus: events.EventBus;

  /** Aurora Serverless v2 cluster */
  public readonly dbCluster: rds.DatabaseCluster;

  /** IAM role assumed by Meridian Lambda functions */
  public readonly lambdaExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: MeridianStackProps = {}) {
    super(scope, id, props);

    const appEnv = props.appEnv ?? 'dev';
    const isProd = appEnv === 'prod';
    const prefix = `meridian-${appEnv}`;

    // ---------------------------------------------------------------
    // SQS — Tickets Queue + DLQ (INFRA-05)
    // ---------------------------------------------------------------
    this.ticketsDlq = new sqs.Queue(this, 'TicketsDlq', {
      queueName: `${prefix}-tickets-dlq`,
      retentionPeriod: cdk.Duration.days(7),
    });

    this.ticketsQueue = new sqs.Queue(this, 'TicketsQueue', {
      queueName: `${prefix}-tickets-queue`,
      deadLetterQueue: { queue: this.ticketsDlq, maxReceiveCount: 3 },
      retentionPeriod: cdk.Duration.days(7),
      visibilityTimeout: cdk.Duration.seconds(300),
    });

    // CloudWatch alarm — fires when DLQ depth exceeds 10 messages
    new cloudwatch.Alarm(this, 'TicketsDlqDepthAlarm', {
      alarmName: `${prefix}-tickets-dlq-depth`,
      metric: this.ticketsDlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // ---------------------------------------------------------------
    // DynamoDB tables (INFRA-06, INFRA-07)
    // ---------------------------------------------------------------

    // Audit log — stores LLM calls, runbook executions, routing decisions
    // Circuit breaker state is also stored here using PK format CB#{key}
    this.auditTable = new dynamodb.TableV2(this, 'AuditTable', {
      tableName: `${prefix}-audit-log`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecovery: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Idempotency table — deduplicates webhook events (INFRA-06)
    this.idempotencyTable = new dynamodb.TableV2(this, 'IdempotencyTable', {
      tableName: `${prefix}-idempotency`,
      partitionKey: { name: 'deduplicationKey', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------
    // S3 bucket — document and asset storage
    // ---------------------------------------------------------------
    this.assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: `${prefix}-assets-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // ---------------------------------------------------------------
    // EventBridge custom bus
    // ---------------------------------------------------------------
    this.eventBus = new events.EventBus(this, 'MeridianEventBus', {
      eventBusName: `${prefix}-event-bus`,
    });

    // ---------------------------------------------------------------
    // VPC for Aurora (isolated subnets in dev to avoid NAT cost)
    // ---------------------------------------------------------------
    const vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${prefix}-vpc`,
      maxAzs: 2,
      natGateways: isProd ? 1 : 0,
      subnetConfiguration: isProd
        ? undefined // default: public + private with egress
        : [
            {
              cidrMask: 24,
              name: 'isolated',
              subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            },
          ],
    });

    // ---------------------------------------------------------------
    // Aurora Serverless v2 with pgvector (INFRA-01)
    // ---------------------------------------------------------------
    const dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      secretName: `${prefix}-db-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'meridian' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    this.dbCluster = new rds.DatabaseCluster(this, 'Database', {
      clusterIdentifier: `${prefix}-db`,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      writer: rds.ClusterInstance.serverlessV2('writer'),
      readers: isProd ? [rds.ClusterInstance.serverlessV2('reader')] : [],
      vpc,
      vpcSubnets: {
        subnetType: isProd
          ? ec2.SubnetType.PRIVATE_WITH_EGRESS
          : ec2.SubnetType.PRIVATE_ISOLATED,
      },
      credentials: rds.Credentials.fromSecret(dbSecret),
      defaultDatabaseName: 'meridian',
      storageEncrypted: true,
      deletionProtection: isProd,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------
    // IAM execution role for Lambda functions
    // ---------------------------------------------------------------
    this.lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `meridian-lambda-${appEnv}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    // Grant Lambda role access to DynamoDB tables
    this.auditTable.grantReadWriteData(this.lambdaExecutionRole);
    this.idempotencyTable.grantReadWriteData(this.lambdaExecutionRole);

    // ---------------------------------------------------------------
    // Eval Lambda with pnpm workspace bundling (CRITICAL esbuild config)
    // depsLockFilePath MUST point to root pnpm-lock.yaml so transitive
    // deps from @meridian/core (e.g. @anthropic-ai/sdk) resolve correctly
    // ---------------------------------------------------------------
    const evalLambda = new NodejsFunction(this, 'EvalLambda', {
      functionName: `${prefix}-eval`,
      runtime: lambda.Runtime.NODEJS_20_X,
      // 3 levels up from infra/dist/stacks → workspace root, then into lambdas
      entry: path.join(__dirname, '../../../lambdas/eval/src/index.ts'),
      handler: 'handler',
      // CRITICAL: must point to root pnpm-lock.yaml for workspace symlink resolution.
      // __dirname resolves to infra/dist/stacks at runtime (or infra/src/stacks in ts-node).
      // 3 levels up from infra/dist/stacks reaches the workspace root (meridian/).
      depsLockFilePath: path.join(__dirname, '../../../pnpm-lock.yaml'),
      bundling: {
        // AWS SDK v3 is pre-installed in Node 20 Lambda runtime
        externalModules: ['@aws-sdk/*'],
        target: 'node20',
        minify: true,
        sourceMap: false,
        // Workspace packages (e.g. @meridian/core) must be bundled — not external
        nodeModules: [],
      },
      environment: {
        NODE_ENV: appEnv,
        AUDIT_TABLE_NAME: this.auditTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant eval Lambda write access to audit table
    this.auditTable.grantWriteData(evalLambda);

    // ---------------------------------------------------------------
    // CloudFormation outputs — key resource names/ARNs for cross-stack reference
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, 'AuditTableName', {
      value: this.auditTable.tableName,
      exportName: `${prefix}-audit-table-name`,
      description: 'Meridian audit log DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'IdempotencyTableName', {
      value: this.idempotencyTable.tableName,
      exportName: `${prefix}-idempotency-table-name`,
      description: 'Meridian idempotency DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'TicketsQueueUrl', {
      value: this.ticketsQueue.queueUrl,
      exportName: `${prefix}-tickets-queue-url`,
      description: 'Meridian tickets SQS queue URL',
    });

    new cdk.CfnOutput(this, 'TicketsDlqUrl', {
      value: this.ticketsDlq.queueUrl,
      exportName: `${prefix}-tickets-dlq-url`,
      description: 'Meridian tickets dead-letter queue URL',
    });

    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      exportName: `${prefix}-event-bus-name`,
      description: 'Meridian EventBridge custom bus name',
    });

    new cdk.CfnOutput(this, 'AssetsBucketName', {
      value: this.assetsBucket.bucketName,
      exportName: `${prefix}-assets-bucket-name`,
      description: 'Meridian S3 assets bucket name',
    });

    new cdk.CfnOutput(this, 'DbClusterEndpoint', {
      value: this.dbCluster.clusterEndpoint.hostname,
      exportName: `${prefix}-db-cluster-endpoint`,
      description: 'Aurora Serverless v2 cluster endpoint',
    });

    new cdk.CfnOutput(this, 'LambdaExecutionRoleArn', {
      value: this.lambdaExecutionRole.roleArn,
      exportName: `${prefix}-lambda-execution-role-arn`,
      description: 'ARN of the IAM role assumed by Meridian Lambda functions',
    });
  }
}
