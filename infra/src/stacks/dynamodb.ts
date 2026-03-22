import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DynamoDbStackProps extends cdk.StackProps {
  /**
   * Whether to retain tables on stack deletion.
   * Set to true in production environments.
   */
  retainTables?: boolean;
}

/**
 * Creates the DynamoDB tables used by Meridian.
 *
 * Tables:
 * - AuditLog: Stores LLM call records, runbook executions, and routing decisions.
 *   PK: entityType#entityId (e.g. ticket#12345)
 *   SK: timestamp#ulid (for time-ordered queries)
 *
 * - CircuitBreaker: Tracks circuit breaker state for external services.
 *   PK: service#name (e.g. service#zendesk)
 */
export class DynamoDbStack extends cdk.Stack {
  /** The AuditLog DynamoDB table */
  public readonly auditLogTable: dynamodb.Table;

  /** The CircuitBreaker DynamoDB table */
  public readonly circuitBreakerTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDbStackProps = {}) {
    super(scope, id, props);

    const removalPolicy = props.retainTables
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    // AuditLog table — stores all LLM calls, runbook executions, routing decisions
    this.auditLogTable = new dynamodb.Table(this, 'AuditLogTable', {
      tableName: 'meridian-audit-log',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      // TTL to auto-expire old audit records (e.g. after 90 days)
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: false,
    });

    // CircuitBreaker table — tracks open/closed/half-open state per service
    this.circuitBreakerTable = new dynamodb.Table(this, 'CircuitBreakerTable', {
      tableName: 'meridian-circuit-breaker',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecovery: false,
    });

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'AuditLogTableName', {
      value: this.auditLogTable.tableName,
      exportName: 'meridian-audit-log-table-name',
      description: 'Meridian AuditLog DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'AuditLogTableArn', {
      value: this.auditLogTable.tableArn,
      exportName: 'meridian-audit-log-table-arn',
      description: 'Meridian AuditLog DynamoDB table ARN',
    });

    new cdk.CfnOutput(this, 'CircuitBreakerTableName', {
      value: this.circuitBreakerTable.tableName,
      exportName: 'meridian-circuit-breaker-table-name',
      description: 'Meridian CircuitBreaker DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'CircuitBreakerTableArn', {
      value: this.circuitBreakerTable.tableArn,
      exportName: 'meridian-circuit-breaker-table-arn',
      description: 'Meridian CircuitBreaker DynamoDB table ARN',
    });
  }
}
