#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ACXD Connect Integration — CDK App Entry Point                                     *
 * Deploys the best-practice contact flow (mainflow.json, Agentic CX block), escalation queue, and routing
 * profile into YOUR EXISTING Amazon Connect instance, as one stack: acxd-<projectName>-<env>-connect.
 *
 *   npm run deploy
 *
 * PREREQUISITE: an AWS account with an Amazon Connect instance you have admin access to. This app never
 * creates, owns, or deletes the instance; it only wires into the one in CONNECT_INSTANCE_ARN.
 *
 * DEPLOY LAST — after the ACXD SDK stage. The Agentic CX block references the ACXD Workspace / Application /
 * Deployment key the SDK deploy creates and writes back to the distribution-root .env. Every value comes from
 * that .env (the single source of truth); nothing is typed on the command line.
 */
import { config as loadDotenv } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
// Load the distribution-root .env (same file the ACXD SDK engine reads and writes back) so the ACXD ids and
// the Connect instance ARN are picked up automatically. Resolved relative to THIS file
// (<root>/backend/connect/cdk/app.ts → <root>/.env), not the shell's cwd, so a bare `npx cdk deploy` from
// this folder always finds it. ACXD_ENV_FILE still overrides. The .env is the single source of truth.
const envFile = process.env.ACXD_ENV_FILE
  ? path.resolve(process.env.ACXD_ENV_FILE)
  : path.resolve(__dirname, '..', '..', '..', '.env');
if (fs.existsSync(envFile)) {
  // override: a shell that sourced .env earlier (e.g. the runbook lookup step) exports stale/empty values, and
  // dotenv never overrides an existing env var by default. The .env file is the single source of truth.
  loadDotenv({ path: envFile, override: true });
  console.log(`[acxd-connect] loaded ${envFile}`);
} else {
  console.warn(`[acxd-connect] no .env at ${envFile} — run from the distribution snapshot's backend/connect/cdk`);
}

import * as cdk from 'aws-cdk-lib';
import { AcxdConnectStack } from './connect-stack';

const app = new cdk.App();

// Each value: the .env var (single source of truth), then a default. --context still overrides for one-off
// debugging, but the runbook never uses it.
function resolve(contextKey: string, envVar: string, fallback = ''): string {
  return (
    (app.node.tryGetContext(contextKey) as string) ||
    (process.env[envVar] ?? '') ||
    fallback
  );
}

const fail = (msg: string): never => { throw new Error(`[acxd-connect] ${msg} (checked ${envFile})`); };

const environment = resolve('environment', 'ACXD_ENVIRONMENT', 'dev');
const projectName = resolve('projectName', 'ACXD_PROJECT_NAME');
const region = resolve('region', 'AWS_REGION') || process.env.CDK_DEFAULT_REGION;
const account = process.env.CDK_DEFAULT_ACCOUNT;
const connectInstanceArn = resolve('connectInstanceArn', 'CONNECT_INSTANCE_ARN');

if (!projectName) fail('ACXD_PROJECT_NAME is not set in .env. It names the Connect stack and must match on every run.');
if (!connectInstanceArn) {
  fail('CONNECT_INSTANCE_ARN is not set in .env. This solution needs an EXISTING Amazon Connect instance you have ' +
    'admin access to (same region as AWS_REGION). Create one in the Amazon Connect console if needed, then set ' +
    'its ARN (arn:aws:connect:<region>:<account>:instance/<id>).');
}

const escalationQueueArn = resolve('escalationQueueArn', 'ESCALATION_QUEUE_ARN') || undefined;
const hoursOfOperationArn = resolve('hoursOfOperationArn', 'HOURS_OF_OPERATION_ARN');
if (!escalationQueueArn && !hoursOfOperationArn) {
  fail('HOURS_OF_OPERATION_ARN is not set in .env. The stack creates an escalation queue, which needs an existing ' +
    'hours of operation from your instance (e.g. "Basic Hours"). Find its ARN with: aws connect ' +
    'list-hours-of-operations --instance-id <instance-id> --region <region> (see the runbook). Or set ' +
    'ESCALATION_QUEUE_ARN to reuse an existing queue instead.');
}
if (hoursOfOperationArn && !/^arn:aws[a-z-]*:connect:[^:]+:\d{12}:instance\/[^/]+\/operating-hours\/[^/]+$/.test(hoursOfOperationArn)) {
  fail(`HOURS_OF_OPERATION_ARN "${hoursOfOperationArn}" is not an hours-of-operation ARN ` +
    '(expected arn:aws:connect:<region>:<account>:instance/<id>/operating-hours/<id>).');
}

new AcxdConnectStack(app, `acxd-${projectName}-${environment}-connect`, {
  environment,
  projectName,
  connectInstanceArn,
  acxdWorkspaceId: resolve('acxdWorkspaceId', 'ACXD_WORKSPACE_ID'),
  acxdApplicationId: resolve('acxdApplicationId', 'ACXD_APPLICATION_ID'),
  acxdDeploymentKey: resolve('acxdDeploymentKey', 'ACXD_DEPLOYMENT_KEY'),
  sampleCustomerId: resolve('sampleCustomerId', 'ACXD_SAMPLE_CUSTOMER_ID') || undefined,
  escalationQueueArn,
  hoursOfOperationArn: hoursOfOperationArn || undefined,
  env: { account, region },
});
