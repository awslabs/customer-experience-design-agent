// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Security assertions for the deployed-mock API (authn/authz at the API edge).
 * Synthesises AcxdMockStack (one nested stack per API) and checks the templates: every method requires an
 * API key, the key is bound to a usage plan with throttling, and nothing is reachable without it.
 * No AWS calls. Lives under tests/ (the plugin build rejects tests under tools/). test_pre_poc.sh copies it
 * into tools/acxd-mock-backend/cdk/ to run (so it resolves ./stack and the CDK packages), then removes the copy.
 */
import assert from "node:assert/strict";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AcxdMockStack } from "./stack";

type Res = { Type: string; Properties?: Record<string, any> };

/** Returns one problem per API method that can be called without an API key. */
export function methodsWithoutApiKey(resources: Record<string, Res>): string[] {
  return Object.entries(resources)
    .filter(([, r]) => r.Type === "AWS::ApiGateway::Method")
    .filter(([, r]) => r.Properties?.HttpMethod !== "OPTIONS")
    .filter(([, r]) => r.Properties?.ApiKeyRequired !== true)
    .map(([id, r]) => `${id} (${r.Properties?.HttpMethod}) does not require an API key`);
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const app = new App();
const stack = new AcxdMockStack(app, "TestMock", {
  mockName: "testMock",
  apis: [{ apiId: "authApi", apiKeyValue: "a".repeat(40) }, { apiId: "pricingApi", apiKeyValue: "b".repeat(40) }],
  env: { region: "us-east-1" },
});
const parent = Template.fromStack(stack);
// Each API is its own nested stack; the security checks run on one of them (they are identical by construction).
const template = Template.fromStack(stack.apis.authApi);
const resources = template.toJSON().Resources as Record<string, Res>;

test("positive: one nested stack per API, each with its own API Gateway and Lambda", () => {
  parent.resourceCountIs("AWS::CloudFormation::Stack", 2);
  for (const id of ["authApi", "pricingApi"]) {
    const t = Template.fromStack(stack.apis[id]);
    t.resourceCountIs("AWS::ApiGateway::RestApi", 1);
    t.resourceCountIs("AWS::Lambda::Function", 1);
    t.hasResourceProperties("AWS::Lambda::Function", { Environment: { Variables: { MOCK_API_DIR: `apis/${id}` } } });
  }
});

test("positive: every GET and POST method requires an API key", () => {
  const methods = Object.values(resources).filter((r) => r.Type === "AWS::ApiGateway::Method");
  assert.ok(methods.length >= 2, "expected GET and POST methods");
  assert.deepEqual(methodsWithoutApiKey(resources), []);
});

test("negative: a method without an API key is detected", () => {
  const tampered = structuredClone(resources);
  const [id] = Object.entries(tampered).find(([, r]) => r.Type === "AWS::ApiGateway::Method")!;
  tampered[id].Properties!.ApiKeyRequired = false;
  assert.equal(methodsWithoutApiKey(tampered).length, 1);
});

test("negative: no method allows unauthenticated access (AuthorizationType NONE needs a key)", () => {
  for (const r of Object.values(resources).filter((x) => x.Type === "AWS::ApiGateway::Method")) {
    if ((r.Properties?.AuthorizationType ?? "NONE") === "NONE") assert.equal(r.Properties?.ApiKeyRequired, true);
  }
});

test("positive: an API key exists and is bound to a usage plan", () => {
  template.resourceCountIs("AWS::ApiGateway::ApiKey", 1);
  template.resourceCountIs("AWS::ApiGateway::UsagePlan", 1);
  template.resourceCountIs("AWS::ApiGateway::UsagePlanKey", 1);
});

test("positive: the usage plan and stage are throttled", () => {
  template.hasResourceProperties("AWS::ApiGateway::UsagePlan", { Throttle: { BurstLimit: 20, RateLimit: 10 } });
  template.hasResourceProperties("AWS::ApiGateway::Stage", {
    MethodSettings: [{ ThrottlingBurstLimit: 20, ThrottlingRateLimit: 10 }],
  });
});

test("positive: access logging is enabled on the stage", () => {
  const stage = Object.values(resources).find((r) => r.Type === "AWS::ApiGateway::Stage")!;
  assert.ok(stage.Properties?.AccessLogSetting?.DestinationArn, "stage has an access log destination");
});

test("positive: Lambda logs have a fixed retention", () => {
  template.hasResourceProperties("AWS::Logs::LogGroup", { LogGroupName: "/aws/lambda/acxd-mock-testMock-authApi", RetentionInDays: 14 });
});

test("negative: the API key value is never in a template or an output", () => {
  assert.ok(!JSON.stringify(template.toJSON()).includes("a".repeat(40)), "nested template never holds the key");
  const params = parent.toJSON().Parameters ?? {};
  assert.equal(params.AuthApiKeyValue?.NoEcho, true, "the key is a NoEcho parameter");
  const outputs = parent.toJSON().Outputs ?? {};
  assert.ok(outputs.AuthApiUrl && outputs.AuthApiKeyId && outputs.PricingApiUrl && outputs.PricingApiKeyId, "a URL + key id per API");
  for (const o of Object.values(outputs) as Array<{ Value?: unknown }>) assert.ok(!JSON.stringify(o.Value).includes("a".repeat(40)));
});

console.log(`mock API security tests: ${passed} passed`);
