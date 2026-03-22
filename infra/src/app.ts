#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MeridianStack } from './stacks/meridian-stack.js';

const app = new cdk.App();

// Resolve environment: CDK context (`--context env=dev`) takes precedence,
// then APP_ENV env var, then default to 'dev'.
const appEnv =
  (app.node.tryGetContext('env') as 'dev' | 'staging' | 'prod') ??
  (process.env['APP_ENV'] as 'dev' | 'staging' | 'prod') ??
  'dev';

const env: cdk.Environment = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: process.env['CDK_DEFAULT_REGION'] ?? 'ap-southeast-1',
};

new MeridianStack(app, `MeridianStack-${appEnv}`, {
  appEnv,
  env,
  description: `Meridian AI support ticket system — ${appEnv}`,
});

app.synth();
