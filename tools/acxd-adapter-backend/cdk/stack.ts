// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ACXD Backend Stack — CDK Template (TypeScript)
 *
 * One stack per use case. Contains API Gateway, stateless integration-adapter
 * Lambda handlers, CloudWatch alarms + dashboard, and a /health endpoint.
 *
 * DEFAULT ARCHITECTURE: the adapter Lambdas call the customer's EXTERNAL system of
 * record (CRM, core banking, payment gateway, IdP) and flatten the response to the
 * ACXD contract. There is NO data layer by default — the customer's system holds the
 * data. A DynamoDB table is included ONLY for a justified exception (see below).
 *
 * AGENT CUSTOMISATION:
 *   - Replace all 'xx' prefixes with the engagement's short project tag
 *   - Add one Lambda function per data request operation
 *   - Scope IAM policies to the specific secret ARNs (and table ARNs only if a store is added)
 *   - Adjust alarm thresholds per engagement SLA
 *
 * Provenance: [VERIFIED] — integration-adapter pattern (CDK-only, TypeScript).
 */

import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
// import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'; // uncomment only if a justified data store is added
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as path from 'node:path';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface AcxdAdapterStackProps extends cdk.StackProps {
  environment: string;
  projectName: string;
}

/**
 * ACXD backend services for a single use case.
 *
 * Creates:
 *   - REST API Gateway with API key auth
 *   - Stateless integration-adapter Lambda handler(s) per data request operation
 *     (each calls the customer's external system and flattens the response)
 *   - /health endpoint for canary monitoring
 *   - CloudWatch alarms + dashboard for observability
 *   - SNS topic for alarm notifications
 *   - (OPTIONAL) a DynamoDB table — only if a justified store is required
 */
export class AcxdAdapterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AcxdAdapterStackProps) {
    super(scope, id, props);

    const { environment, projectName } = props;

    cdk.Tags.of(this).add('Project', projectName);
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'acxd-aidlc-plugin');

    // =====================================================================
    // DATA LAYER (OPTIONAL — omit by default)
    // =====================================================================
    //
    // Adapters are STATELESS by default — the customer's external system is the
    // system of record, so there is normally NO table here. Uncomment ONLY for a
    // justified exception: idempotency/dedupe, cross-disconnect session state,
    // cache of a slow/costly upstream, or an ACXD-side audit log.
    //
    // const dataTable = new dynamodb.Table(this, 'XxDataTable', {
    //   tableName: `acxd-${projectName}-${environment}-data`,
    //   partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    //   billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    //   removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    //   timeToLiveAttribute: 'ttl',
    //   pointInTimeRecovery: environment === 'prod',
    // });

    // =====================================================================
    // LAMBDA HANDLERS
    // =====================================================================

    // Shared environment for all handlers
    const commonEnv: Record<string, string> = {
      ENVIRONMENT: environment,
      PROJECT_NAME: projectName,          // with ENVIRONMENT, gives the secret path acxd/<projectName>/<environment>/
      // TABLE_NAME: dataTable.tableName,   // only if a justified store is added above
      POWERTOOLS_SERVICE_NAME: `acxd-${projectName}`,
    };

    const logRetention = environment === 'prod'
      ? logs.RetentionDays.ONE_MONTH
      : logs.RetentionDays.ONE_WEEK;

    // --- Handler: verify-identity (AGENT: one function per operation) ---
    // Explicit log group per function (the deprecated `logRetention` prop is replaced by `logGroup`).
    const xxVerifyIdentityLogs = new logs.LogGroup(this, 'XxVerifyIdentityLogs', {
      logGroupName: `/aws/lambda/acxd-${projectName}-${environment}-verify-identity`,
      retention: logRetention,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
    const xxVerifyIdentityFn = new lambda.Function(this, 'XxVerifyIdentityFn', {
      functionName: `acxd-${projectName}-${environment}-verify-identity`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'functions', 'verify-identity')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnv,
      logGroup: xxVerifyIdentityLogs,   // replaces deprecated logRetention
    });

    // Least-privilege: the adapter reads the upstream credential from Secrets Manager.
    // Add dataTable.grantReadData(...) / grantWriteData(...) ONLY if a justified store was added.
    xxVerifyIdentityFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        // Least privilege: only this project's secrets, by the fixed schema acxd/<projectName>/<environment>/<name>
        // (the trailing -* covers the random suffix Secrets Manager adds to secret ARNs).
        resources: [`arn:${cdk.Aws.PARTITION}:secretsmanager:${this.region}:${this.account}:secret:acxd/${projectName}/${environment}/*`],
      }),
    );

    // AGENT: Add more handler functions here — one per data request operation
    // For each: create an explicit logs.LogGroup (retention: logRetention) and pass `logGroup:` —
    // do NOT use the deprecated `logRetention:` prop. e.g.:
    //   const xxCheckBalanceLogs = new logs.LogGroup(this, 'XxCheckBalanceLogs', { retention: logRetention, removalPolicy: ... });
    //   const xxCheckBalanceFn = new lambda.Function(this, 'XxCheckBalanceFn', { ..., logGroup: xxCheckBalanceLogs });

    // =====================================================================
    // API GATEWAY
    // =====================================================================

    // Access log group for API Gateway
    const apiLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/acxd-${projectName}-${environment}`,
      retention: environment === 'prod' ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Request validator
    const api = new apigateway.RestApi(this, 'XxAcxdApi', {
      restApiName: `acxd-${projectName}-${environment}`,
      description: `ACXD backend API for ${projectName} (${environment})`,
      // APIG1: account-level CloudWatch role so stage access logging works on a fresh account
      cloudWatchRole: true,
      deployOptions: {
        stageName: environment,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false, // Don't log request/response bodies in production
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
      },
    });

    // API key + usage plan
    const apiKey = api.addApiKey('XxAcxdApiKey', {
      apiKeyName: `acxd-${projectName}-${environment}-key`,
    });
    const plan = api.addUsagePlan('XxUsagePlan', {
      name: `acxd-${projectName}-${environment}-plan`,
      apiStages: [{ api, stage: api.deploymentStage }],
      throttle: { rateLimit: 50, burstLimit: 100 },
    });
    plan.addApiKey(apiKey);

    // Request validator for all methods
    const requestValidator = api.addRequestValidator('RequestValidator', {
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    // --- Route: POST /verify-identity ---
    const verifyResource = api.root.addResource('verify-identity');
    verifyResource.addMethod('POST', new apigateway.LambdaIntegration(xxVerifyIdentityFn), {
      apiKeyRequired: true,
      requestValidator,
    });

    // AGENT: Add more routes here — one per data request operation
    // const balanceResource = api.root.addResource('check-balance');
    // balanceResource.addMethod('POST', new apigateway.LambdaIntegration(xxCheckBalanceFn), { apiKeyRequired: true });

    // --- Route: GET /health (no auth — used for canary/smoke testing) ---
    const healthLogs = new logs.LogGroup(this, 'XxHealthCheckLogs', {
      logGroupName: `/aws/lambda/acxd-${projectName}-${environment}-health`,
      retention: logRetention,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });
    const healthFn = new lambda.Function(this, 'XxHealthCheckFn', {
      functionName: `acxd-${projectName}-${environment}-health`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'index.handler',
      code: lambda.Code.fromInline(
        'import json, time\n' +
        'def handler(event, context):\n' +
        '    return {\n' +
        '        "statusCode": 200,\n' +
        '        "headers": {"Content-Type": "application/json"},\n' +
        `        "body": json.dumps({"status": "healthy", "timestamp": int(time.time()), "environment": "${environment}", "project": "${projectName}"})\n` +
        '    }\n',
      ),
      timeout: cdk.Duration.seconds(5),
      logGroup: healthLogs,
    });
    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.LambdaIntegration(healthFn), {
      apiKeyRequired: false,
    });

    // =====================================================================
    // OBSERVABILITY — CloudWatch Alarms + Dashboard
    // =====================================================================

    // SNS topic for alarm notifications — encrypted + SSL-enforced
    const alarmTopicKey = new kms.Key(this, 'AlarmTopicKey', {
      description: `ACXD alarm topic encryption key (${environment})`,
      enableKeyRotation: true,
    });

    const alarmTopic = new sns.Topic(this, 'XxAlarmTopic', {
      topicName: `acxd-${projectName}-${environment}-alarms`,
      displayName: `ACXD ${projectName} ${environment} Alarms`,
      masterKey: alarmTopicKey,
    });

    // Enforce SSL for publishers
    alarmTopic.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'EnforceSSL',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['sns:Publish'],
      resources: [alarmTopic.topicArn],
      conditions: {
        Bool: { 'aws:SecureTransport': 'false' },
      },
    }));

    // AGENT: Add email/Slack subscription per engagement
    // alarmTopic.addSubscription(new subs.EmailSubscription('ops@example.com'));

    // --- Alarm: Lambda errors (per function) ---
    const verifyErrorAlarm = xxVerifyIdentityFn
      .metricErrors({ period: cdk.Duration.minutes(5) })
      .createAlarm(this, 'XxVerifyErrorAlarm', {
        alarmName: `acxd-${projectName}-${environment}-verify-errors`,
        threshold: 3,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    verifyErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // --- Alarm: API Gateway 5xx ---
    const api5xxAlarm = api
      .metricServerError({ period: cdk.Duration.minutes(5) })
      .createAlarm(this, 'XxApi5xxAlarm', {
        alarmName: `acxd-${projectName}-${environment}-api-5xx`,
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    api5xxAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // --- Alarm: API Gateway latency p95 ---
    const apiLatencyAlarm = api
      .metricLatency({ period: cdk.Duration.minutes(5), statistic: 'p95' })
      .createAlarm(this, 'XxApiLatencyAlarm', {
        alarmName: `acxd-${projectName}-${environment}-api-latency-p95`,
        threshold: 5000, // 5 seconds — ACXD data request timeout is ~8s
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    apiLatencyAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // --- Dashboard: backend health at a glance ---
    const dashboard = new cloudwatch.Dashboard(this, 'XxDashboard', {
      dashboardName: `acxd-${projectName}-${environment}-backend`,
    });
    dashboard.addWidgets(
      new cloudwatch.Row(
        new cloudwatch.GraphWidget({
          title: 'Lambda Errors (5min)',
          left: [xxVerifyIdentityFn.metricErrors()],
          width: 8,
        }),
        new cloudwatch.GraphWidget({
          title: 'API Latency p50 / p95 (5min)',
          left: [
            api.metricLatency({ statistic: 'p50' }),
            api.metricLatency({ statistic: 'p95' }),
          ],
          width: 8,
        }),
        new cloudwatch.GraphWidget({
          title: 'API 5xx / 4xx (5min)',
          left: [api.metricServerError(), api.metricClientError()],
          width: 8,
        }),
      ),
      new cloudwatch.Row(
        new cloudwatch.GraphWidget({
          title: 'Lambda Duration p50 / p99 (5min)',
          left: [
            xxVerifyIdentityFn.metricDuration({ statistic: 'p50' }),
            xxVerifyIdentityFn.metricDuration({ statistic: 'p99' }),
          ],
          width: 8,
        }),
        new cloudwatch.GraphWidget({
          title: 'Lambda Invocations (5min)',
          left: [xxVerifyIdentityFn.metricInvocations()],
          width: 8,
        }),
        new cloudwatch.GraphWidget({
          title: 'Lambda Throttles (5min)',
          left: [xxVerifyIdentityFn.metricThrottles()],
          width: 8,
        }),
        // If a justified DynamoDB store was added, add its capacity widget here:
        // new cloudwatch.GraphWidget({
        //   title: 'DynamoDB Read/Write Capacity',
        //   left: [dataTable.metricConsumedReadCapacityUnits(), dataTable.metricConsumedWriteCapacityUnits()],
        //   width: 8,
        // }),
      ),
    );

    // =====================================================================
    // cdk-nag SUPPRESSIONS — deliberate design choices
    // =====================================================================

    // IAM4: Lambda basic execution role + API GW CloudWatch role are CDK-standard managed policies
    NagSuppressions.addResourceSuppressionsByPath(this,
      [`/${id}/XxVerifyIdentityFn/ServiceRole/Resource`],
      [{ id: 'AwsSolutions-IAM4', reason: 'CDK-managed Lambda basic execution role — standard minimal permissions for CloudWatch Logs.', appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'] }],
    );
    NagSuppressions.addResourceSuppressionsByPath(this,
      [`/${id}/XxAcxdApi/CloudWatchRole/Resource`],
      [{ id: 'AwsSolutions-IAM4', reason: 'CDK-managed API Gateway CloudWatch role — standard for stage-level logging.', appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'] }],
    );

    // APIG4 + COG4: ACXD uses API key auth, not IAM/Cognito [GA-GAP]
    NagSuppressions.addResourceSuppressionsByPath(this,
      [`/${id}/XxAcxdApi/Default/verify-identity/POST/Resource`],
      [
        { id: 'AwsSolutions-APIG4', reason: 'ACXD runtime authenticates via x-api-key only [GA-GAP] — no IAM/SigV4/Cognito support. API key + usage plan is the deliberate auth model.' },
        { id: 'AwsSolutions-COG4', reason: 'ACXD runtime authenticates via x-api-key only [GA-GAP] — Cognito not available in this architecture.' },
      ],
    );

    // APIG4 + COG4 for /health endpoint — deliberately public for canary/liveness checks
    NagSuppressions.addResourceSuppressionsByPath(this,
      [`/${id}/XxAcxdApi/Default/health/GET/Resource`],
      [
        { id: 'AwsSolutions-APIG4', reason: '/health endpoint is deliberately unauthenticated — used for canary monitoring and smoke tests.' },
        { id: 'AwsSolutions-COG4', reason: '/health endpoint is deliberately unauthenticated — used for canary monitoring and smoke tests.' },
      ],
    );

    // IAM4 for the health-check Lambda (same CDK-managed basic execution role)
    NagSuppressions.addResourceSuppressionsByPath(this,
      [`/${id}/XxHealthCheckFn/ServiceRole/Resource`],
      [{ id: 'AwsSolutions-IAM4', reason: 'CDK-managed Lambda basic execution role — standard minimal permissions for CloudWatch Logs.', appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'] }],
    );

    // IAM5: the secret read is scoped to this project and environment; the wildcard covers the secret
    // name under that path and the random suffix Secrets Manager adds to every secret ARN.
    NagSuppressions.addResourceSuppressionsByPath(this,
      [`/${id}/XxVerifyIdentityFn/ServiceRole/DefaultPolicy/Resource`],
      [{ id: 'AwsSolutions-IAM5', reason: 'GetSecretValue scoped to acxd/<projectName>/<environment>/*; the wildcard covers secret names under that path and the Secrets Manager random ARN suffix.', appliesTo: [`Resource::arn:<AWS::Partition>:secretsmanager:${this.region}:${this.account}:secret:acxd/${projectName}/${environment}/*`] }],
    );

    // L1: runtime pinned to a supported Python version (matches the mock backend); review on each CDK upgrade.
    NagSuppressions.addResourceSuppressionsByPath(this,
      [`/${id}/XxVerifyIdentityFn/Resource`, `/${id}/XxHealthCheckFn/Resource`],
      [{ id: 'AwsSolutions-L1', reason: 'Runtime pinned to a supported Python version for stability; reviewed on each CDK upgrade.' }],
    );

    // APIG3: WAFv2 is a per-customer production decision, not part of the starter template.
    NagSuppressions.addResourceSuppressionsByPath(this,
      [`/${id}/XxAcxdApi/DeploymentStage.${environment}/Resource`],
      [{ id: 'AwsSolutions-APIG3', reason: 'WAFv2 web ACL is a per-customer production decision based on its threat model; add it for production deployments.' }],
    );

    // =====================================================================
    // OUTPUTS
    // =====================================================================

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Base URL for ACXD data request endpoints',
    });
    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID — retrieve the value from API Gateway console',
    });
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch dashboard for backend health monitoring',
    });
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS topic ARN for alarm notifications — subscribe ops team',
    });
  }
}
