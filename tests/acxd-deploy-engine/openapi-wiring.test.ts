// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Tests for API wiring from OpenAPI files: secrets, data-request urls and auth headers, the .env API block
// (golden output and drift check), generated keys and the runbook bullets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wireApi, applyWiring, renderEnvBlock, fillEnvBlock, checkEnvBlock, generateKeys, renderRunbookBullets,
  ENV_BLOCK_START, ENV_BLOCK_END,
} from '../../tools/acxd-deploy-engine/lib/openapi-wiring';

const billing = {
  openapi: '3.0.3',
  info: { title: 'Billing', version: '1', 'x-acxd-generated': true },
  servers: [{ url: 'https://REPLACE_AT_DEPLOY.execute-api.us-east-1.amazonaws.com/prod' }],
  security: [{ ApiKeyAuth: [] }],
  components: { securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' } } },
  paths: {
    '/getBalance': { get: { operationId: 'getBalance', parameters: [{ name: 'accountRef', in: 'query', required: true }] } },
    '/makePayment': { post: { operationId: 'makePayment' } },
  },
};
const meters = {
  openapi: '3.0.3',
  info: { title: 'Meters', version: '1' },
  servers: [{ url: 'https://api.example.com/v2/' }],
  security: [{ BearerAuth: [] }],
  components: { securitySchemes: {
    BearerAuth: { type: 'http', scheme: 'bearer' },
    PartnerKey: { type: 'apiKey', in: 'query', name: 'partner_key' },
  } },
  paths: {
    '/readings': { get: { operationId: 'getReadings' } },
    '/tariff': { get: { operationId: 'getTariff', security: [{ PartnerKey: [] }] } },
    '/status': { get: { operationId: 'getStatus', security: [] } },
  },
};

test('wiring: names, urls and auth headers come from the OpenAPI file', () => {
  const b = wireApi('northwindBilling-openapi.yaml', billing);
  assert.equal(b.apiId, 'northwindBillingApi');
  assert.equal(b.kind, 'generated');
  assert.equal(b.serverUrl, undefined, 'placeholder server is not copied');
  assert.deepEqual(b.credentials.map((c) => [c.secretName, c.envVar, c.kind]), [['northwindBillingApiKey', 'NORTHWIND_BILLING_API_KEY', 'apiKeyHeader']]);
  const gb = b.operations.find((o) => o.operationId === 'getBalance')!;
  assert.equal(gb.method, 'GET');
  assert.equal(gb.url, '{northwindBillingApiUrl:NLX.Secret}/getBalance?accountRef={accountRef}');
  assert.deepEqual(gb.headers, [{ key: 'x-api-key', value: '{northwindBillingApiKey:NLX.Secret}', sensitive: true }]);

  const m = wireApi('meters-openapi.json', meters);
  assert.equal(m.apiId, 'metersApi');
  assert.equal(m.kind, 'real');
  assert.equal(m.serverUrl, 'https://api.example.com/v2', 'trailing slash removed');
  const r = m.operations.find((o) => o.operationId === 'getReadings')!;
  assert.deepEqual(r.headers, [{ key: 'Authorization', value: 'Bearer {metersApiToken:NLX.Secret}', sensitive: true }]);
  const t = m.operations.find((o) => o.operationId === 'getTariff')!;
  assert.equal(t.url, '{metersApiUrl:NLX.Secret}/tariff?partner_key={metersApiKey:NLX.Secret}', 'per-operation query key');
  assert.deepEqual(t.headers, []);
  assert.deepEqual(m.operations.find((o) => o.operationId === 'getStatus')!.headers, [], 'security: [] means no credential');
});

test('wiring: basic, cookie and oauth2 schemes; digest and mutualTLS are rejected', () => {
  const doc = (scheme: Record<string, unknown>) => ({ info: { 'x-acxd-api-id': 'crmApi' }, security: [{ S: [] }],
    components: { securitySchemes: { S: scheme } }, paths: { '/x': { get: { operationId: 'getX' } } } });
  const h = (scheme: Record<string, unknown>) => wireApi('crm.yaml', doc(scheme)).operations[0].headers;
  assert.deepEqual(h({ type: 'http', scheme: 'basic' }), [{ key: 'Authorization', value: 'Basic {crmApiBasic:NLX.Secret}', sensitive: true }]);
  assert.deepEqual(h({ type: 'apiKey', in: 'cookie', name: 'sid' }), [{ key: 'Cookie', value: 'sid={crmApiKey:NLX.Secret}', sensitive: true }]);
  assert.deepEqual(h({ type: 'oauth2', flows: {} }), [{ key: 'Authorization', value: 'Bearer {crmApiToken:NLX.Secret}', sensitive: true }]);
  assert.deepEqual(h({ type: 'openIdConnect', openIdConnectUrl: 'https://x' }), [{ key: 'Authorization', value: 'Bearer {crmApiToken:NLX.Secret}', sensitive: true }]);
  assert.throws(() => wireApi('crm.yaml', doc({ type: 'http', scheme: 'digest' })), /digest|not supported/);
  assert.throws(() => wireApi('crm.yaml', doc({ type: 'mutualTLS' })), /mutualTLS/);
  assert.throws(() => wireApi('crm.yaml', { paths: { '/x': { get: {} } } }), /no operationId/);
});

test('applyWiring: rewrites external data requests and secrets; flags unmatched requests', () => {
  const apis = [wireApi('northwindBilling-openapi.yaml', billing), wireApi('meters-openapi.json', meters)];
  const drs = [
    { dataRequestId: 'getBalance', implementation: 'external', url: '{mockApiUrl:NLX.Secret}/getBalance', headers: [{ key: 'x-api-key', value: '{mockApiKey:NLX.Secret}' }, { key: 'x-trace', value: 'acxd' }] },
    { dataRequestId: 'getReadings', implementation: 'external' },
    { dataRequestId: 'faq', implementation: 'inline-static', code: 'x' },
    { dataRequestId: 'notInSpec', implementation: 'external' },
  ];
  const old = [{ name: 'mockApiUrl', envVar: 'MOCK_API_URL', description: 'x' }, { name: 'crmToken', envVar: 'CRM_TOKEN', description: 'kept' }];
  const out = applyWiring(apis, drs, old);
  const gb = out.dataRequests.find((d) => d.dataRequestId === 'getBalance')!;
  assert.equal(gb.url, '{northwindBillingApiUrl:NLX.Secret}/getBalance?accountRef={accountRef}');
  assert.deepEqual(gb.headers, [{ key: 'x-trace', value: 'acxd' }, { key: 'x-api-key', value: '{northwindBillingApiKey:NLX.Secret}', sensitive: true }]);
  assert.equal(out.dataRequests.find((d) => d.dataRequestId === 'faq')!.code, 'x', 'inline-static untouched');
  assert.ok(out.problems.some((p) => p.includes('notInSpec')));
  const names = out.secrets.map((s) => s.name);
  assert.ok(!names.includes('mockApiUrl'), 'legacy mock secrets removed');
  assert.ok(names.includes('crmToken'), 'unrelated secrets kept');
  assert.deepEqual(names.slice(0, 5), ['metersApiUrl', 'metersApiKey', 'metersApiToken', 'northwindBillingApiUrl', 'northwindBillingApiKey']);
  assert.equal(out.secrets.find((s) => s.name === 'metersApiUrl')!.isSensitive, false);
});

const GOLDEN = [
  ENV_BLOCK_START,
  '#   metersApi: base URL, pre-filled from the OpenAPI servers entry. Change it if your endpoint differs.',
  'METERS_API_URL=https://api.example.com/v2',
  '#   metersApi: your API key for this API (sent as query parameter `partner_key`). A credential: keep it here only.',
  'METERS_API_KEY=',
  '#   metersApi: a current bearer token, without the "Bearer " prefix (sent in the Authorization header).',
  'METERS_API_TOKEN=',
  '',
  '#   northwindBillingApi (deployed by this solution): base URL. Paste the Stage 1 `NorthwindBillingApiUrl` output as shown.',
  'NORTHWIND_BILLING_API_URL=',
  '#   northwindBillingApi: API key (header `x-api-key`). Generated in Backend Build; the Stage 1 stack sets it on API Gateway.',
  'NORTHWIND_BILLING_API_KEY=',
  ENV_BLOCK_END,
].join('\n');

test('.env API block: golden output, values kept, drift detected, keys generated', () => {
  const apis = [wireApi('northwindBilling-openapi.yaml', billing), wireApi('meters-openapi.json', meters)];
  assert.equal(renderEnvBlock(apis), GOLDEN);
  const template = `# head\nAWS_REGION=\n\n${ENV_BLOCK_START}\n${ENV_BLOCK_END}\n\n# tail\nACXD_LOG_LEVEL=objects\n`;
  const filled = fillEnvBlock(template, apis);
  assert.ok(filled.startsWith('# head\nAWS_REGION=\n\n') && filled.endsWith('\n\n# tail\nACXD_LOG_LEVEL=objects\n'), 'outside the block unchanged');
  assert.deepEqual(checkEnvBlock(filled, template, apis), []);
  const withValue = filled.replace('METERS_API_TOKEN=', 'METERS_API_TOKEN=abc');
  assert.ok(fillEnvBlock(withValue, apis).includes('METERS_API_TOKEN=abc'), 're-running keeps entered values');
  assert.deepEqual(checkEnvBlock(withValue, template, apis), [], 'an entered value is not drift');
  assert.ok(checkEnvBlock(filled.replace('# head', '# Head'), template, apis).some((p) => p.includes('outside the API block')));
  assert.ok(checkEnvBlock(filled.replace('METERS_API_TOKEN=', 'METERS_TOKEN='), template, apis).some((p) => p.includes('does not match')));
  assert.throws(() => fillEnvBlock('AWS_REGION=\n', apis), /no API block/);
  const g = generateKeys(filled, apis, (n) => 'k'.repeat(n));
  assert.deepEqual(g.filled, ['NORTHWIND_BILLING_API_KEY'], 'only the generated API key is generated');
  assert.ok(g.text.includes(`NORTHWIND_BILLING_API_KEY=${'k'.repeat(40)}`));
  assert.deepEqual(generateKeys(g.text, apis, (n) => 'z'.repeat(n)).filled, [], 'an existing key is never replaced');
});

test('runbook bullets: one per .env key, worded per API kind', () => {
  const apis = [wireApi('northwindBilling-openapi.yaml', billing), wireApi('meters-openapi.json', meters)];
  const b = renderRunbookBullets(apis);
  assert.ok(b.startsWith('Now update the following variables in `./.env`:'));
  for (const k of ['METERS_API_URL', 'METERS_API_KEY', 'METERS_API_TOKEN', 'NORTHWIND_BILLING_API_URL', 'NORTHWIND_BILLING_API_KEY']) {
    assert.equal(b.split('\n').filter((l) => l.startsWith(`- \`${k}\``)).length, 1, k);
  }
  assert.ok(b.includes('`NORTHWIND_BILLING_API_URL`: the `NorthwindBillingApiUrl` output'));
  assert.ok(b.includes('`NORTHWIND_BILLING_API_KEY`: check it is set (generated in Backend Build)'));
});

test('wiring: a generated API must use /{operationId} paths', () => {
  const bad = { ...billing, paths: { '/balances': { get: { operationId: 'getBalance' } } } };
  assert.throws(() => wireApi('northwindBilling.openapi.yaml', bad), /must be \/getBalance/);
  const real = { ...meters, paths: { '/balances': { get: { operationId: 'getBalance' } } } };
  assert.doesNotThrow(() => wireApi('meters.openapi.yaml', real));
});

test('wiring: a generated API request field may not be a free-form object', () => {
  const bad = { ...billing, paths: { '/makePayment': { post: { operationId: 'makePayment',
    requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { details: { type: 'object' } } } } } } } } } };
  assert.throws(() => wireApi('northwindBilling.openapi.yaml', bad), /object with no properties/);
});
