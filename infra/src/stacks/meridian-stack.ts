import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { DynamoDbStack } from './dynamodb.js';

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
 * - DynamoDB tables (via DynamoDbStack)
 * - IAM execution role for Lambda functions
 */
export class MeridianStack extends cdk.Stack {
  /** The nested DynamoDB stack */
  public readonly db: DynamoDbStack;

  /** IAM role assumed by Meridian Lambda functions */
  public readonly lambdaExecutionRole: iam.Role;

  constructor(scope: Construct, id: string, props: MeridianStackProps = {}) {
    super(scope, id, props);

    const appEnv = props.appEnv ?? 'dev';
    const retainTables = appEnv === 'prod';

    // --- DynamoDB tables ---
    this.db = new DynamoDbStack(scope, `${id}-DynamoDb`, {
      ...props,
      retainTables,
    });

    // --- Lambda execution role ---
    this.lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `meridian-lambda-${appEnv}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    // Grant read/write to DynamoDB tables
    this.db.auditLogTable.grantReadWriteData(this.lambdaExecutionRole);
    this.db.circuitBreakerTable.grantReadWriteData(this.lambdaExecutionRole);

    // CloudFormation output for the role ARN
    new cdk.CfnOutput(this, 'LambdaExecutionRoleArn', {
      value: this.lambdaExecutionRole.roleArn,
      exportName: `meridian-lambda-execution-role-arn-${appEnv}`,
      description: 'ARN of the IAM role assumed by Meridian Lambda functions',
    });
  }
}
