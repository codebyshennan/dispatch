import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
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
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface BeaconStackProps extends cdk.StackProps {
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
 * All resources follow the `beacon-{env}-{resource}` naming convention.
 */
export class BeaconStack extends cdk.Stack {
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

  /** Runbook Executor Lambda — dispatches sidebar action requests to runbook implementations */
  public readonly runbookExecutorLambda: lambda.IFunction;

  constructor(scope: Construct, id: string, props: BeaconStackProps = {}) {
    super(scope, id, props);

    const appEnv = props.appEnv ?? 'dev';
    const isProd = appEnv === 'prod';
    const prefix = `beacon-${appEnv}`;

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
        secretStringTemplate: JSON.stringify({ username: 'beacon' }),
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
      defaultDatabaseName: 'beacon',
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
          database: 'beacon',
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
    // KB articles table + HNSW index init (KB-01)
    // Creates kb_articles table with vector(512) column and cosine HNSW index.
    // Runs on every CDK deploy (idempotent via IF NOT EXISTS).
    // Depends on pgvectorInit so the vector extension is guaranteed present first.
    // ---------------------------------------------------------------
    const kbTableInit = new cr.AwsCustomResource(this, 'KbTableInit', {
      onUpdate: {
        service: 'RDSDataService',
        action: 'executeStatement',
        parameters: {
          resourceArn: this.dbCluster.clusterArn,
          secretArn: dbSecret.secretArn,
          database: 'beacon',
          sql: `
            CREATE TABLE IF NOT EXISTS kb_articles (
              id          BIGSERIAL PRIMARY KEY,
              article_id  BIGINT NOT NULL,
              title       TEXT NOT NULL,
              html_url    TEXT NOT NULL,
              updated_at  TIMESTAMPTZ NOT NULL,
              section_id  BIGINT,
              chunk_index INTEGER NOT NULL,
              text        TEXT NOT NULL,
              embedding   vector(512) NOT NULL,
              indexed_at  TIMESTAMPTZ DEFAULT NOW(),
              UNIQUE (article_id, chunk_index)
            );
            CREATE INDEX IF NOT EXISTS kb_articles_embedding_hnsw
              ON kb_articles USING hnsw (embedding vector_cosine_ops)
              WITH (m = 16, ef_construction = 64);
          `,
        },
        physicalResourceId: cr.PhysicalResourceId.of('kb-table-init'),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
    kbTableInit.node.addDependency(pgvectorInit);

    // ---------------------------------------------------------------
    // IAM execution role for Lambda functions
    // ---------------------------------------------------------------
    this.lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `beacon-lambda-${appEnv}`,
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
    // deps from @beacon/core (e.g. @anthropic-ai/sdk) resolve correctly
    // ---------------------------------------------------------------
    const evalLambda = new NodejsFunction(this, 'EvalLambda', {
      functionName: `${prefix}-eval`,
      runtime: lambda.Runtime.NODEJS_20_X,
      // 3 levels up from infra/dist/stacks → workspace root, then into lambdas
      entry: path.join(__dirname, '../../../lambdas/eval/src/index.ts'),
      handler: 'handler',
      // CRITICAL: must point to root pnpm-lock.yaml for workspace symlink resolution.
      // __dirname resolves to infra/dist/stacks at runtime (or infra/src/stacks in ts-node).
      // 3 levels up from infra/dist/stacks reaches the workspace root (beacon/).
      depsLockFilePath: path.join(__dirname, '../../../pnpm-lock.yaml'),
      bundling: {
        // AWS SDK v3 is pre-installed in Node 20 Lambda runtime
        externalModules: ['@aws-sdk/*'],
        target: 'node20',
        minify: true,
        sourceMap: false,
        // Workspace packages (e.g. @beacon/core) must be bundled — not external
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
    // KB Retrieval Lambda (KB-01) — embeds ticket query and searches pgvector
    // No VPC attachment: uses RDS Data API (HTTPS endpoint, no VPC required).
    // ---------------------------------------------------------------
    const kbRetrievalFn = new NodejsFunction(this, 'KbRetrievalLambda', {
      functionName: `${prefix}-kb-retrieval`,
      entry: path.join(__dirname, '../../../lambdas/kb-retrieval/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      role: this.lambdaExecutionRole,
      environment: {
        DB_CLUSTER_ARN: this.dbCluster.clusterArn,
        DB_SECRET_ARN: dbSecret.secretArn,
        VOYAGE_API_KEY: process.env.VOYAGE_API_KEY ?? '',
      },
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
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        CIRCUIT_BREAKER_TABLE_NAME: this.auditTable.tableName,
      },
    });

    // ---------------------------------------------------------------
    // Response Generator Lambda — GenerateResponse Step Functions task target
    // No VPC attachment: uses Anthropic API (HTTPS), no Aurora access needed.
    // 60s timeout: LLM call (claude-opus-4-5) can take 20-30s.
    // ---------------------------------------------------------------
    const responseGenFn = new NodejsFunction(this, 'ResponseGeneratorLambda', {
      functionName: `${prefix}-response-generator`,
      entry: path.join(__dirname, '../../../lambdas/response-generator/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),  // LLM call can take 20-30s
      memorySize: 256,
      role: this.lambdaExecutionRole,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,  // For invoke() audit logging
        DB_CLUSTER_ARN: this.dbCluster.clusterArn,
        DB_SECRET_ARN: dbSecret.secretArn,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
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
    // Auto Sender Lambda (ROUTE-03)
    // Checks SYSTEM#config ROUTING_MODE at runtime before posting public Zendesk reply.
    // Only sends publicly when both system mode and responseDraft.routing === 'auto_send'.
    // Writes AUTOSEND# DynamoDB audit record on every decision for full auditability.
    // No VPC attachment — Zendesk API is external HTTPS, no Aurora access needed.
    // Declared before Step Functions workflow so autoSenderStep can reference it.
    // ---------------------------------------------------------------
    const autoSenderFn = new NodejsFunction(this, 'AutoSenderLambda', {
      functionName: `${prefix}-auto-sender`,
      entry: path.join(__dirname, '../../../lambdas/auto-sender/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      role: this.lambdaExecutionRole,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN ?? '',
        ZENDESK_API_TOKEN: process.env.ZENDESK_API_TOKEN ?? '',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    this.auditTable.grantReadWriteData(autoSenderFn);

    // ---------------------------------------------------------------
    // Step Functions Express Workflow (INGEST-03)
    // ClassifyTicket → WriteShadowNote; CloudWatch logging at ERROR level
    // ---------------------------------------------------------------
    const workflowLogs = new logs.LogGroup(this, 'WorkflowLogs', {
      logGroupName: `/beacon/${appEnv}/ticket-processing`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const classifyStep = new tasks.LambdaInvoke(this, 'ClassifyTicket', {
      lambdaFunction: classifyFn,
      resultPath: '$.classificationResult',
      retryOnServiceExceptions: true,
      taskTimeout: sfn.Timeout.duration(cdk.Duration.seconds(30)),
    });

    const kbRetrievalStep = new tasks.LambdaInvoke(this, 'KBRetrieval', {
      lambdaFunction: kbRetrievalFn,
      resultPath: '$.kbResult',
      retryOnServiceExceptions: true,
      taskTimeout: sfn.Timeout.duration(cdk.Duration.seconds(15)),
    });

    const shadowStep = new tasks.LambdaInvoke(this, 'WriteShadowNote', {
      lambdaFunction: shadowFn,
      resultPath: '$.shadowResult',
      taskTimeout: sfn.Timeout.duration(cdk.Duration.seconds(10)),
    });

    const responseGenStep = new tasks.LambdaInvoke(this, 'GenerateResponse', {
      lambdaFunction: responseGenFn,
      resultPath: '$.responseResult',
      retryOnServiceExceptions: true,
      taskTimeout: sfn.Timeout.duration(cdk.Duration.seconds(60)),
    });

    // ---------------------------------------------------------------
    // Auto-send routing choice (ROUTE-03)
    // Inserted after responseGenStep. Routes auto_send tickets to AutoSenderLambda;
    // all other routing values (agent_assisted, escalate) fall through to shadowStep.
    // The AutoSenderLambda performs a second mode check at runtime — this Choice state
    // only routes the Step Functions path, not the final send decision.
    // ---------------------------------------------------------------
    const autoSenderStep = new tasks.LambdaInvoke(this, 'AutoSendResponse', {
      lambdaFunction: autoSenderFn,
      resultPath: '$.autoSendResult',
      taskTimeout: sfn.Timeout.duration(cdk.Duration.seconds(30)),
    });

    const routingChoice = new sfn.Choice(this, 'RoutingChoice')
      .when(
        sfn.Condition.stringEquals(
          '$.responseResult.Payload.responseDraft.routing',
          'auto_send',
        ),
        autoSenderStep,
      )
      .otherwise(shadowStep);

    const processingWorkflow = new sfn.StateMachine(this, 'TicketProcessingWorkflow', {
      stateMachineName: `${prefix}-ticket-processing`,
      stateMachineType: sfn.StateMachineType.EXPRESS,
      definitionBody: sfn.DefinitionBody.fromChainable(
        classifyStep
          .next(kbRetrievalStep)
          .next(responseGenStep)
          .next(routingChoice)
      ),
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

    // Batch Classifier Lambda (INGEST-07) — manually invoked, not on schedule
    const batchClassifierFn = new NodejsFunction(this, 'BatchClassifierLambda', {
      functionName: `${prefix}-batch-classifier`,
      entry: path.join(__dirname, '../../../lambdas/batch-classifier/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.minutes(15), // Long-running batch — max Lambda timeout
      environment: {
        ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN ?? '',
        ZENDESK_API_TOKEN: process.env.ZENDESK_API_TOKEN ?? '',
        AUDIT_LOG_TABLE_NAME: this.auditTable.tableName,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      },
    });

    // Suppress unused variable warning — Lambda is registered in CDK construct tree
    void batchClassifierFn;

    // ---------------------------------------------------------------
    // KB Indexer Lambda (KB-04) — manually invoked to bulk-load S3 chunks into pgvector
    // No VPC attachment: dev uses PRIVATE_ISOLATED subnets with no NAT;
    // all Aurora access goes through RDS Data API (HTTPS endpoint, no VPC required).
    // ---------------------------------------------------------------
    const kbIndexerFn = new NodejsFunction(this, 'KbIndexerLambda', {
      functionName: `${prefix}-kb-indexer`,
      entry: path.join(__dirname, '../../../lambdas/kb-indexer/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: this.lambdaExecutionRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 512,
      environment: {
        ASSETS_BUCKET_NAME: this.assetsBucket.bucketName,
        DB_CLUSTER_ARN: this.dbCluster.clusterArn,
        DB_SECRET_ARN: dbSecret.secretArn,
        VOYAGE_API_KEY: process.env.VOYAGE_API_KEY ?? '',
      },
    });

    // Suppress unused variable warning — Lambda is registered in CDK construct tree
    void kbIndexerFn;

    // ---------------------------------------------------------------
    // KB Maintenance Lambda (KB-02, KB-03, KB-04)
    // Weekly gap analysis (ticket categories with zero KB hits) and
    // stale article detection (articles not re-indexed in 90+ days).
    // No VPC attachment: uses RDS Data API (HTTPS) for Aurora access.
    // ---------------------------------------------------------------
    const kbMaintenanceFn = new NodejsFunction(this, 'KbMaintenanceLambda', {
      functionName: `${prefix}-kb-maintenance`,
      entry: path.join(__dirname, '../../../lambdas/kb-maintenance/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      role: this.lambdaExecutionRole,
      environment: {
        AUDIT_LOG_TABLE_NAME: this.auditTable.tableName,
        DB_CLUSTER_ARN: this.dbCluster.clusterArn,
        DB_SECRET_ARN: dbSecret.secretArn,
      },
    });

    // Weekly EventBridge schedule — every Monday at 00:00 UTC
    new events.Rule(this, 'KbMaintenanceSchedule', {
      ruleName: `${prefix}-kb-maintenance-schedule`,
      schedule: events.Schedule.cron({ minute: '0', hour: '0', weekDay: 'MON' }),
      targets: [new targets.LambdaFunction(kbMaintenanceFn)],
    });

    // ---------------------------------------------------------------
    // Proactive Notification Lambda (ROUTE-05)
    // 4-hour EventBridge schedule for delayed payment transaction outreach.
    // Mode gate: only active when SYSTEM#config ROUTING_MODE === 'auto_send'.
    // Stub implementation: Reap Pay API polling deferred pending internal API access.
    // See lambdas/proactive-notification/src/index.ts for full implementation notes.
    // ---------------------------------------------------------------
    const proactiveNotificationFn = new NodejsFunction(this, 'ProactiveNotificationLambda', {
      functionName: `${prefix}-proactive-notification`,
      entry: path.join(__dirname, '../../../lambdas/proactive-notification/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      role: this.lambdaExecutionRole,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    this.auditTable.grantReadWriteData(proactiveNotificationFn);

    // Every 4 hours — cron(minute hour day-of-month month day-of-week year)
    new events.Rule(this, 'ProactiveNotificationSchedule', {
      ruleName: `${prefix}-proactive-notification-4h`,
      schedule: events.Schedule.cron({ minute: '0', hour: '*/4' }),
      targets: [new targets.LambdaFunction(proactiveNotificationFn)],
    });

    void proactiveNotificationFn;

    // ---------------------------------------------------------------
    // Runbook Executor Lambda (RUN-01..08)
    // Dispatches sidebar action requests to Reap API runbooks.
    // Circuit-breaker state shared via audit-log table (CB# key prefix).
    // No VPC attachment — Reap API is external HTTPS; no Aurora access needed.
    // ---------------------------------------------------------------
    const runbookExecutorFn = new NodejsFunction(this, 'RunbookExecutorLambda', {
      functionName: `${prefix}-runbook-executor`,
      entry: path.join(__dirname, '../../../lambdas/runbook-executor/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15), // 5s per runbook + overhead
      memorySize: 256,
      role: this.lambdaExecutionRole,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        NODE_ENV: appEnv,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    this.runbookExecutorLambda = runbookExecutorFn;

    new cdk.CfnOutput(this, 'RunbookExecutorFunctionName', {
      value: runbookExecutorFn.functionName,
      exportName: `${prefix}-runbook-executor-fn`,
      description: 'Runbook executor Lambda function name — invoked by sidebar-api',
    });

    // Grant sidebar-api Lambda invoke permission on runbook-executor
    runbookExecutorFn.grantInvoke(this.lambdaExecutionRole);

    // ---------------------------------------------------------------
    // Monitoring Lambda (EVAL-03, EVAL-04, EVAL-05, CHG-05)
    // Weekly: spot-check sampling, edit distance alerts, re-contact tracking, runbook usage.
    // No VPC attachment — DynamoDB access only, no Aurora needed.
    // ---------------------------------------------------------------
    const monitoringFn = new NodejsFunction(this, 'MonitoringLambda', {
      functionName: `${prefix}-monitoring`,
      entry: path.join(__dirname, '../../../lambdas/monitoring/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      role: this.lambdaExecutionRole,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        NODE_ENV: appEnv,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    // Weekly EventBridge schedule — every Monday at 01:00 UTC (after KB maintenance at 00:00)
    new events.Rule(this, 'MonitoringSchedule', {
      ruleName: `${prefix}-monitoring-schedule`,
      schedule: events.Schedule.cron({ minute: '0', hour: '1', weekDay: 'MON' }),
      targets: [new targets.LambdaFunction(monitoringFn)],
    });

    void monitoringFn;

    // ---------------------------------------------------------------
    // Sidebar API Lambda + API Gateway HTTP API (ZAF-02, CHG-02)
    // ---------------------------------------------------------------
    const sidebarApiLambda = new NodejsFunction(this, 'SidebarApiLambda', {
      functionName: `${prefix}-sidebar-api`,
      entry: path.join(__dirname, '../../../lambdas/sidebar-api/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      role: this.lambdaExecutionRole,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        NODE_ENV: appEnv,
        // Added by Plan 02 — consolidates all sidebar-api env vars to avoid Wave 2 file conflicts
        RUNBOOK_EXECUTOR_FUNCTION_NAME: runbookExecutorFn.functionName,
        ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN ?? '',
        ZENDESK_API_TOKEN: process.env.ZENDESK_API_TOKEN ?? '',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    // API Gateway HTTP API — provides HTTPS endpoint for the sidebar to call
    const httpApi = new apigatewayv2.HttpApi(this, 'SidebarHttpApi', {
      apiName: `${prefix}-sidebar-api`,
      corsPreflight: {
        allowOrigins: ['https://*.zendesk.com', 'https://*.zdassets.com'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST, apigatewayv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: new apigatewayv2integrations.HttpLambdaIntegration('SidebarLambdaIntegration', sidebarApiLambda),
    });

    new cdk.CfnOutput(this, 'SidebarApiUrl', {
      value: httpApi.apiEndpoint,
      exportName: `${prefix}-sidebar-api-url`,
    });

    // ---------------------------------------------------------------
    // DB ARN outputs — used by KB indexer Lambda and future phases
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, 'DbClusterArn', {
      value: this.dbCluster.clusterArn,
      exportName: `${prefix}-db-cluster-arn`,
      description: 'Aurora Serverless v2 cluster ARN for RDS Data API calls',
    });

    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbSecret.secretArn,
      exportName: `${prefix}-db-secret-arn`,
      description: 'Aurora DB credentials secret ARN',
    });

    // ---------------------------------------------------------------
    // VoC Processor Lambda (VOC-01, VOC-02, VOC-03, VOC-04)
    // S3-triggered: processes 1-star reviews → Zendesk tickets + reply drafts
    // Monthly EventBridge schedule: cross-correlation analysis (VOC-04)
    // No VPC attachment — Zendesk API is external HTTPS; DynamoDB via AWS SDK endpoint.
    // ---------------------------------------------------------------
    const vocProcessorFn = new NodejsFunction(this, 'VocProcessorLambda', {
      functionName: `${prefix}-voc-processor`,
      entry: path.join(__dirname, '../../../lambdas/voc-processor/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      role: this.lambdaExecutionRole,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        S3_ASSETS_BUCKET: this.assetsBucket.bucketName,
        ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN ?? '',
        ZENDESK_API_TOKEN: process.env.ZENDESK_API_TOKEN ?? '',
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    this.auditTable.grantReadWriteData(vocProcessorFn);
    this.assetsBucket.grantRead(vocProcessorFn);

    // S3 event notification — trigger VocProcessorLambda on any object created under reviews/
    this.assetsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(vocProcessorFn),
      { prefix: 'reviews/' },
    );

    // Monthly cross-correlation (VOC-04) — first day of each month at 04:00 UTC
    new events.Rule(this, 'VocMonthlyCorrelationSchedule', {
      ruleName: `${prefix}-voc-monthly-correlation`,
      schedule: events.Schedule.cron({ minute: '0', hour: '4', day: '1' }),
      targets: [
        new targets.LambdaFunction(vocProcessorFn, {
          event: events.RuleTargetInput.fromObject({
            type: 'monthly-correlation',
            source: 'eventbridge',
          }),
        }),
      ],
    });

    void vocProcessorFn;

    // ---------------------------------------------------------------
    // Reporting Lambda (RPT-01, EVAL-07)
    // Weekly CX report: ticket volume, automation rate, re-contact trend,
    // KB gaps, VoC summary, prompt performance — delivered via SES + Slack.
    // Monday 02:00 UTC schedule (after monitoring at 01:00 UTC).
    // No VPC attachment — Zendesk + SES + Slack are external HTTPS endpoints.
    // ---------------------------------------------------------------
    const reportingFn = new NodejsFunction(this, 'ReportingLambda', {
      functionName: `${prefix}-reporting`,
      entry: path.join(__dirname, '../../../lambdas/reporting/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      role: this.lambdaExecutionRole,
      environment: {
        AUDIT_TABLE_NAME: this.auditTable.tableName,
        S3_ASSETS_BUCKET: this.assetsBucket.bucketName,
        ZENDESK_SUBDOMAIN: process.env.ZENDESK_SUBDOMAIN ?? '',
        ZENDESK_API_TOKEN: process.env.ZENDESK_API_TOKEN ?? '',
        SES_FROM_ADDRESS: process.env.SES_FROM_ADDRESS ?? '',
        SES_TO_ADDRESSES: process.env.SES_TO_ADDRESSES ?? '',
        SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL ?? '',
      },
      bundling: {
        // pdfkit uses dynamic requires internally — must be included in Lambda bundle
        // not tree-shaken. Add to nodeModules to ensure it is bundled properly.
        nodeModules: ['pdfkit'],
        externalModules: ['@aws-sdk/*'],
      },
    });

    // DynamoDB read/write for REPORT# cache + reading monitoring/metrics records
    this.auditTable.grantReadWriteData(reportingFn);

    // S3 read for VoC review files under reviews/
    this.assetsBucket.grantRead(reportingFn);

    // SES send permission (SES V2 does not have a specific resource ARN pattern — use *)
    reportingFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'sesv2:SendEmail'],
      resources: ['*'],
    }));

    // Weekly EventBridge schedule — Monday 02:00 UTC (after monitoring at 01:00 UTC)
    new events.Rule(this, 'ReportingSchedule', {
      ruleName: `${prefix}-reporting-schedule`,
      schedule: events.Schedule.cron({ minute: '0', hour: '2', weekDay: 'MON' }),
      targets: [
        new targets.LambdaFunction(reportingFn, {
          event: events.RuleTargetInput.fromObject({ type: 'weekly_cx_report' }),
        }),
      ],
    });

    // Monthly EventBridge schedule — first day of month at 03:00 UTC (RPT-02)
    // Payload triggers monthly_executive_summary path: builds PDF + sends via SES v2 attachment
    new events.Rule(this, 'MonthlyReportingSchedule', {
      ruleName: `${prefix}-monthly-reporting-schedule`,
      schedule: events.Schedule.cron({ minute: '0', hour: '3', day: '1', month: '*' }),
      targets: [
        new targets.LambdaFunction(reportingFn, {
          event: events.RuleTargetInput.fromObject({ type: 'monthly_executive_summary' }),
        }),
      ],
    });

    void reportingFn;

    // ---------------------------------------------------------------
    // CloudWatch Ops Dashboard (RPT-03)
    // 4 widgets: SQS queue depth, Lambda error rates, LLM API latency, active escalations.
    // CX ops team can view live operational metrics in the Meridian-Ops CloudWatch dashboard.
    // Custom metrics (LLMAPILatency, ActiveEscalations) are published by Lambdas at runtime;
    // the CDK dashboard widget references them — PutMetricData calls are a separate concern.
    // ---------------------------------------------------------------
    const opsDashboard = new cloudwatch.Dashboard(this, 'MeridianOpsDashboard', {
      dashboardName: 'Meridian-Ops',
    });

    // Widget 1 — SQS Queue Depth (proxy for ticket backlog)
    const queueDepthWidget = new cloudwatch.GraphWidget({
      title: 'SQS Queue Depth',
      width: 12,
      height: 6,
      left: [
        this.ticketsQueue.metricApproximateNumberOfMessagesVisible({
          label: 'Queue Depth (total)',
          color: cloudwatch.Color.BLUE,
        }),
        this.ticketsDlq.metricApproximateNumberOfMessagesVisible({
          label: 'DLQ Depth',
          color: cloudwatch.Color.RED,
        }),
      ],
    });

    // Widget 2 — Lambda Error Rate across all core Lambdas
    const errorRateWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Error Rate',
      width: 12,
      height: 6,
      left: [
        classifyFn.metricErrors({ label: 'Classifier Errors', color: cloudwatch.Color.RED }),
        responseGenFn.metricErrors({ label: 'ResponseGenerator Errors', color: cloudwatch.Color.ORANGE }),
        autoSenderFn.metricErrors({ label: 'AutoSender Errors', color: cloudwatch.Color.PURPLE }),
        vocProcessorFn.metricErrors({ label: 'VocProcessor Errors', color: cloudwatch.Color.GREEN }),
        reportingFn.metricErrors({ label: 'Reporting Errors', color: cloudwatch.Color.BROWN }),
      ],
    });

    // Widget 3 — LLM API p95 Latency (custom metric published by Lambdas at runtime)
    const llmLatencyWidget = new cloudwatch.GraphWidget({
      title: 'LLM API p95 Latency',
      width: 12,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'Meridian',
          metricName: 'LLMAPILatency',
          statistic: 'p95',
          period: cdk.Duration.minutes(5),
          label: 'LLM p95 Latency (ms)',
          color: cloudwatch.Color.BLUE,
        }),
      ],
    });

    // Widget 4 — Active Escalations (custom metric published by RunbookExecutorLambda)
    const escalationsWidget = new cloudwatch.SingleValueWidget({
      title: 'Active Escalations',
      width: 12,
      height: 6,
      metrics: [
        new cloudwatch.Metric({
          namespace: 'Meridian',
          metricName: 'ActiveEscalations',
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
          label: 'Active Escalations',
          color: cloudwatch.Color.RED,
        }),
      ],
    });

    opsDashboard.addWidgets(
      queueDepthWidget,
      errorRateWidget,
      llmLatencyWidget,
      escalationsWidget,
    );
  }
}
