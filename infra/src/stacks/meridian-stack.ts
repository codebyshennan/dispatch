import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
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
      enableDataApi: true,
    });

    // ---------------------------------------------------------------
    // pgvector extension init (INFRA-01)
    // Runs CREATE EXTENSION IF NOT EXISTS vector; via the RDS Data API
    // on every CDK deploy (idempotent). Requires enableDataApi: true above.
    // ---------------------------------------------------------------
    const pgvectorInit = new cr.AwsCustomResource(this, 'PgvectorInit', {
      onUpdate: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.dbCluster.clusterArn,
          secretArn: dbSecret.secretArn,
          database: 'meridian',
          sql: 'CREATE EXTENSION IF NOT EXISTS vector;',
        },
        physicalResourceId: cr.PhysicalResourceId.of('pgvector-init'),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.dbCluster.clusterArn, dbSecret.secretArn],
      }),
    });
    pgvectorInit.node.addDependency(this.dbCluster);

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

    // ---------------------------------------------------------------
    // VoC Ingestion Lambda (INGEST-05, INGEST-06)
    // ---------------------------------------------------------------
    const vocFn = new NodejsFunction(this, 'VocIngestionLambda', {
      functionName: `${prefix}-voc-ingestion`,
      entry: path.join(__dirname, '../../../lambdas/voc-ingestion/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.minutes(5),
      environment: {
        ASSETS_BUCKET_NAME: this.assetsBucket.bucketName,
        GOOGLE_PLAY_APP_ID: process.env.GOOGLE_PLAY_APP_ID ?? '',
        APP_STORE_APP_ID: process.env.APP_STORE_APP_ID ?? '',
        TRUSTPILOT_API_KEY: process.env.TRUSTPILOT_API_KEY ?? '',
        TRUSTPILOT_BUSINESS_UNIT_ID: process.env.TRUSTPILOT_BUSINESS_UNIT_ID ?? '',
      },
    });

    // Google Play + App Store: 6-hour cadence ({ source: 'all' } triggers both branches in index.ts)
    new events.Rule(this, 'ReviewsSchedule6h', {
      ruleName: `${prefix}-reviews-6h`,
      schedule: events.Schedule.rate(cdk.Duration.hours(6)),
      targets: [new targets.LambdaFunction(vocFn, {
        event: events.RuleTargetInput.fromObject({ source: 'all' }),
      })],
    });

    // Trustpilot: 12-hour cadence
    new events.Rule(this, 'TrustpilotSchedule12h', {
      ruleName: `${prefix}-trustpilot-12h`,
      schedule: events.Schedule.rate(cdk.Duration.hours(12)),
      targets: [new targets.LambdaFunction(vocFn, {
        event: events.RuleTargetInput.fromObject({ source: 'trustpilot' }),
      })],
    });

    // ---------------------------------------------------------------
    // Help Center Ingestion Lambda (INGEST-04)
    // ---------------------------------------------------------------
    const helpCenterFn = new NodejsFunction(this, 'HelpCenterIngestionLambda', {
      functionName: `${prefix}-help-center-ingestion`,
      entry: path.join(__dirname, '../../../lambdas/help-center-ingestion/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.minutes(15),
      environment: {
        ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN ?? '',
        ZENDESK_API_TOKEN: process.env.ZENDESK_API_TOKEN ?? '',
        ASSETS_BUCKET_NAME: this.assetsBucket.bucketName,
        VOYAGE_API_KEY: process.env.VOYAGE_API_KEY ?? '',
      },
    });

    // Daily cadence for Help Center refresh
    new events.Rule(this, 'HelpCenterSchedule', {
      ruleName: `${prefix}-help-center-daily`,
      schedule: events.Schedule.rate(cdk.Duration.hours(24)),
      targets: [new targets.LambdaFunction(helpCenterFn)],
    });

    // ---------------------------------------------------------------
    // Webhook Lambda + Function URL (INGEST-01)
    // No API Gateway — Lambda function URLs forward raw body intact for HMAC
    // ---------------------------------------------------------------
    const webhookFn = new NodejsFunction(this, 'WebhookLambda', {
      functionName: `${prefix}-webhook`,
      entry: path.join(__dirname, '../../../lambdas/webhook/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(10),
      environment: {
        WEBHOOK_SIGNING_SECRET: process.env.WEBHOOK_SIGNING_SECRET ?? '',
        EVENT_BUS_NAME: this.eventBus.eventBusName,
        IDEMPOTENCY_TABLE_NAME: this.idempotencyTable.tableName,
        ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN ?? '',
        ZENDESK_API_TOKEN: process.env.ZENDESK_API_TOKEN ?? '',
      },
    });

    // Function URL (no auth — Zendesk webhooks call this directly; HMAC provides auth)
    const webhookUrl = webhookFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['https://*.zendesk.com'],
        allowedMethods: [lambda.HttpMethod.POST],
      },
    });
    new cdk.CfnOutput(this, 'WebhookFunctionUrl', {
      value: webhookUrl.url,
      description: 'Webhook endpoint URL — configure in Zendesk Admin',
    });

    // ---------------------------------------------------------------
    // Classifier Lambda — classifyHandler Step Functions task target
    // ---------------------------------------------------------------
    const classifyFn = new NodejsFunction(this, 'ClassifierLambda', {
      functionName: `${prefix}-classifier`,
      entry: path.join(__dirname, '../../../lambdas/classifier/src/index.ts'),
      handler: 'classifyHandler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
        AUDIT_LOG_TABLE_NAME: this.auditTable.tableName,
        CIRCUIT_BREAKER_TABLE_NAME: this.auditTable.tableName,
      },
    });

    // ---------------------------------------------------------------
    // Shadow Lambda — shadowHandler Step Functions task target
    // ---------------------------------------------------------------
    const shadowFn = new NodejsFunction(this, 'ShadowLambda', {
      functionName: `${prefix}-shadow`,
      entry: path.join(__dirname, '../../../lambdas/classifier/src/index.ts'),
      handler: 'shadowHandler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN ?? '',
        ZENDESK_API_TOKEN: process.env.ZENDESK_API_TOKEN ?? '',
      },
    });

    // ---------------------------------------------------------------
    // Step Functions Express Workflow (INGEST-03)
    // ClassifyTicket → WriteShadowNote; CloudWatch logging at ERROR level
    // ---------------------------------------------------------------
    const workflowLogs = new logs.LogGroup(this, 'WorkflowLogs', {
      logGroupName: `/meridian/${appEnv}/ticket-processing`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const classifyStep = new tasks.LambdaInvoke(this, 'ClassifyTicket', {
      lambdaFunction: classifyFn,
      resultPath: '$.classificationResult',
      retryOnServiceExceptions: true,
      taskTimeout: sfn.Timeout.duration(cdk.Duration.seconds(30)),
    });

    const shadowStep = new tasks.LambdaInvoke(this, 'WriteShadowNote', {
      lambdaFunction: shadowFn,
      resultPath: '$.shadowResult',
      taskTimeout: sfn.Timeout.duration(cdk.Duration.seconds(10)),
    });

    const processingWorkflow = new sfn.StateMachine(this, 'TicketProcessingWorkflow', {
      stateMachineName: `${prefix}-ticket-processing`,
      stateMachineType: sfn.StateMachineType.EXPRESS,
      definitionBody: sfn.DefinitionBody.fromChainable(classifyStep.next(shadowStep)),
      timeout: cdk.Duration.minutes(5),
      logs: {
        destination: workflowLogs,
        level: sfn.LogLevel.ERROR,
        includeExecutionData: true,
      },
    });
    processingWorkflow.grantStartExecution(this.lambdaExecutionRole);

    // ---------------------------------------------------------------
    // EventBridge Rule → SQS (INGEST-02)
    // Routes ticket.created and ticket.updated to existing ticketsQueue
    // ---------------------------------------------------------------
    const ticketRule = new events.Rule(this, 'TicketEventsRule', {
      eventBus: this.eventBus,
      ruleName: `${prefix}-ticket-events`,
      eventPattern: {
        detailType: ['ticket.created', 'ticket.updated'],
      },
    });
    ticketRule.addTarget(new targets.SqsQueue(this.ticketsQueue));

    // ---------------------------------------------------------------
    // Pipeline Lambda — SQS event source → starts Step Functions execution
    // Thin orchestrator: receives SQS messages and calls sfn.StartExecution
    // ---------------------------------------------------------------
    const pipelineFn = new NodejsFunction(this, 'PipelineLambda', {
      functionName: `${prefix}-pipeline`,
      entry: path.join(__dirname, '../../../lambdas/webhook/src/pipeline.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(15),
      environment: {
        STATE_MACHINE_ARN: processingWorkflow.stateMachineArn,
      },
    });

    pipelineFn.addEventSource(new eventsources.SqsEventSource(this.ticketsQueue, {
      batchSize: 1,
      reportBatchItemFailures: true,
    }));
  }
}
