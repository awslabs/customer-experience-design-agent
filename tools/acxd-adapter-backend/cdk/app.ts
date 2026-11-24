#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ACXD Adapter Integration — CDK App Entry Point
 *
 * Deploy this ONLY when a live upstream API needs translation (auth exchange, response flattening,
 * private-VPC reach). If the customer's live API fits the ACXD contract directly, deploy NOTHING here —
 * just point the ACXD Data Request at it with a Secret. If there is no live API yet, use mock-integration/.
 *
 * Region is pinned explicitly (never the ambient AWS_REGION). Stack name = acxd-<projectName>-<env>.
 *   npx cdk deploy --context environment=dev --context projectName=<name> --context region=<region>
 */
import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { AcxdAdapterStack } from './stack';

const app = new cdk.App();
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const environment = (app.node.tryGetContext('environment') as string) || 'dev';
const projectName = (app.node.tryGetContext('projectName') as string) || 'xx-project';
const region = (app.node.tryGetContext('region') as string) || process.env.CDK_DEFAULT_REGION;
const account = process.env.CDK_DEFAULT_ACCOUNT;

new AcxdAdapterStack(app, `acxd-${projectName}-${environment}`, {
  environment,
  projectName,
  env: { account, region },
});
