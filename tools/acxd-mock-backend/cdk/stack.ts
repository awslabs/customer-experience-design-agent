// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * AcxdMockStack — SHIPPED, FIXED deployed backend for the APIs this solution generates.
 *
 * ONE parent stack (acxd-<projectName>-<env>-mock-apis), deployed with one command, holding ONE NESTED STACK PER
 * API (one per generated OpenAPI file). Each nested stack is a separate API Gateway (REST, x-api-key + usage plan)
 * and its own Python 3.12 Lambda, routing /{operation} at the stage root and serving that API's bundled JSON
 * (apis/<apiId>/data + ops). Separate APIs keep logs, metrics and faults per API. Applied even for one API.
 * No data store. Do NOT edit per engagement: variation comes from the apis/<apiId>/ folders and .env.
 *
 * CommonJS module (see package.json — no "type":"module"), so `__dirname` resolves natively.
 * cdk-nag is intentionally NOT applied to this throwaway synthetic-data backend (see README).
 */
import { Stack, StackProps, NestedStack, NestedStackProps, Duration, CfnOutput, CfnParameter, RemovalPolicy } from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as path from "path";

export interface MockApiDef {
  /** API id from the OpenAPI file (x-acxd-api-id), e.g. "authApi". Also the folder name under apis/. */
  apiId: string;
  /** API key value (20+ characters) from .env (<API>_KEY). When set, API Gateway uses it. */
  apiKeyValue?: string;
}

export interface AcxdMockApiProps extends NestedStackProps {
  /** Resource name prefix, e.g. "anyCareInsurance-authApi". Names the Lambda, API, key, usage plan. */
  name: string;
  apiId: string;
  /** Every API id in the app, so this API's Lambda bundles only its own folder. */
  allApiIds: string[];
  stageName: string;
  memoryMb?: number;
  timeoutSeconds?: number;
  apiKeyValue?: string;
}

/** One API: API Gateway + its own Lambda, as a nested stack. */
export class AcxdMockApi extends NestedStack {
  public readonly url: string;
  public readonly keyId: string;

  constructor(scope: Construct, id: string, props: AcxdMockApiProps) {
    super(scope, id, props);
    const name = props.name;

    // Lambda logs: own log group with a fixed retention (the default /aws/lambda group never expires).
    const fnLogs = new logs.LogGroup(this, "MockFnLogs", {
      logGroupName: `/aws/lambda/acxd-mock-${name}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const others = props.allApiIds.filter((a) => a !== props.apiId).map((a) => `apis/${a}`);
    const mockFn = new lambda.Function(this, "MockFn", {
      logGroup: fnLogs,
      functionName: `acxd-mock-${name}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.lambda_handler",
      code: lambda.Code.fromAsset(path.join(__dirname, ".."), {
        exclude: ["cdk", "tests", "*.md", "node_modules", "*.pyc", "__pycache__", "mock.config.json", ...others],
      }),
      environment: { MOCK_API_DIR: `apis/${props.apiId}` },
      timeout: Duration.seconds(props.timeoutSeconds ?? 10),
      memorySize: props.memoryMb ?? 128,
    });

    const accessLogs = new logs.LogGroup(this, "MockApiAccessLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const api = new apigw.RestApi(this, "MockApi", {
      restApiName: `acxd-mock-${name}`,
      description: `ACXD deployed API ${props.apiId} — synthetic data, throwaway.`,
      cloudWatchRole: true,
      deployOptions: {
        stageName: props.stageName,
        accessLogDestination: new apigw.LogGroupLogDestination(accessLogs),
        accessLogFormat: apigw.AccessLogFormat.jsonWithStandardFields(),
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        metricsEnabled: true,
        throttlingBurstLimit: 20,
        throttlingRateLimit: 10,
      },
    });

    const validator = api.addRequestValidator("QueryValidator", {
      validateRequestParameters: true,
      validateRequestBody: false,
    });

    // ONE wildcard resource at the stage root routes every operation of this API to its Lambda.
    const integration = new apigw.LambdaIntegration(mockFn);
    const op = api.root.addResource("{operation}");
    for (const method of ["GET", "POST"]) {
      op.addMethod(method, integration, {
        apiKeyRequired: true,
        requestValidator: validator,
        requestParameters: { "method.request.path.operation": true },
      });
    }

    const key = api.addApiKey("MockApiKey", {
      apiKeyName: `acxd-mock-${name}-key`,
      ...(props.apiKeyValue ? { value: props.apiKeyValue } : {}),
    });
    api.addUsagePlan("MockUsagePlan", {
      name: `acxd-mock-${name}-plan`,
      throttle: { burstLimit: 20, rateLimit: 10 },
      apiStages: [{ api, stage: api.deploymentStage }],
    }).addApiKey(key);

    this.url = api.url;
    this.keyId = key.keyId;
  }
}

export interface AcxdMockStackProps extends StackProps {
  /** Project name, e.g. "anyCareInsurance". */
  mockName: string;
  /** One entry per generated API (at least one). */
  apis: MockApiDef[];
  stageName?: string;
  memoryMb?: number;
  timeoutSeconds?: number;
}

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Parent stack: one nested AcxdMockApi per API, deployed together. */
export class AcxdMockStack extends Stack {
  public readonly apis: Record<string, AcxdMockApi> = {};

  constructor(scope: Construct, id: string, props: AcxdMockStackProps) {
    super(scope, id, props);
    if (!props.apis.length) throw new Error("AcxdMockStack needs at least one API");
    const allApiIds = props.apis.map((a) => a.apiId);
    for (const def of props.apis) {
      // The key is a NoEcho parameter of the parent stack, so it never appears in the template body.
      const keyValue = def.apiKeyValue
        ? new CfnParameter(this, `${pascal(def.apiId)}KeyValue`, { type: "String", noEcho: true, minLength: 20, default: def.apiKeyValue }).valueAsString
        : undefined;
      const nested = new AcxdMockApi(this, pascal(def.apiId), {
        name: `${props.mockName}-${def.apiId}`,
        apiId: def.apiId,
        allApiIds,
        stageName: props.stageName ?? "dev",
        memoryMb: props.memoryMb,
        timeoutSeconds: props.timeoutSeconds,
        apiKeyValue: keyValue,
      });
      this.apis[def.apiId] = nested;
      new CfnOutput(this, `${pascal(def.apiId)}Url`, {
        value: nested.url,
        description: `${def.apiId} base URL - paste into its _URL key in .env as shown (a trailing slash is trimmed by the deploy engine).`,
      });
      new CfnOutput(this, `${pascal(def.apiId)}KeyId`, {
        value: nested.keyId,
        description: `${def.apiId} API key id. The key value is the one in .env (generated in Backend Build).`,
      });
    }
  }
}
