// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Deterministic engine tests — no live ACXD account. Run: npm test (from tools/acxd-deploy-engine) or
// via the plugin test runner. Asserts: presence=intent branching, synchronous-create + writeEnvVar,
// resource creation, KB publish, and the generic pollUntil terminal-status/timeout guard (kept for the
// future CI/CD build/deploy path — the engine itself no longer builds/deploys; that is a manual step).
// NOTE: lives under plugin-root tests/ (not tools/) so the plugin build does not copy it into installs.
// Imports reach up into the engine at tools/acxd-deploy-engine/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMockClient } from './mock-client';
import { makeLogger } from '../../tools/acxd-deploy-engine/lib/log';
import { pollUntil } from '../../tools/acxd-deploy-engine/lib/poll';
import { ensureWorkspace } from '../../tools/acxd-deploy-engine/steps/ensure-workspace';
import { createKnowledgeBases } from '../../tools/acxd-deploy-engine/steps/create-knowledge-bases';
import { createSecrets } from '../../tools/acxd-deploy-engine/steps/create-secrets';

const silent = makeLogger('stages');

test('ensureWorkspace: reuse when ACXD_WORKSPACE_ID set (presence = intent, no create)', async () => {
  process.env.ACXD_WORKSPACE_ID = 'ws-existing-123';
  const { client, recorded } = makeMockClient();
  const res = await ensureWorkspace(client, { name: 'proj' }, silent);
  assert.equal(res.workspaceId, 'ws-existing-123');
  assert.equal(res.created, false);
  assert.equal(recorded.filter((r) => r.type === 'CreateWorkspaceCommand').length, 0, 'must NOT create when id present');
  delete process.env.ACXD_WORKSPACE_ID;
});

test('createKnowledgeBases: creates then publishes each KB', async () => {
  const { client, recorded } = makeMockClient();
  const res = await createKnowledgeBases(client, [
    { name: 'coveragePolicyKb', type: 'documents', description: 'coverage docs' },
  ], silent);
  // Returns { created, nameToId } — nameToId feeds the {kbName} -> UUID resolution in create-flows.
  assert.equal(res.created, 1);
  assert.equal(res.nameToId.get('coveragePolicyKb'), 'kb-mock-001');
  assert.ok(recorded.some((r) => r.type === 'CreateKnowledgeBaseCommand'), 'created KB');
  assert.ok(recorded.some((r) => r.type === 'PublishKnowledgeBaseCommand'), 'published KB');
});

test('createSecrets: a base URL is stored without trailing slashes; other values are untouched', async () => {
  process.env.TEST_API_URL = 'https://abc.execute-api.us-east-1.amazonaws.com/dev//';
  process.env.TEST_API_KEY = 'key-ends-with-slash/';
  const { client, recorded } = makeMockClient();
  await createSecrets(client, [
    { name: 'testApiUrl', envVar: 'TEST_API_URL', description: 'url', isSensitive: false },
    { name: 'testApiKey', envVar: 'TEST_API_KEY', description: 'key' },
  ], silent);
  const values = recorded.filter((r) => r.type === 'CreateSecretCommand').map((r) => r.input.secretValue);
  assert.deepEqual(values, ['https://abc.execute-api.us-east-1.amazonaws.com/dev', 'key-ends-with-slash/']);
});

test('pollUntil: throws on terminal failure status', async () => {
  let calls = 0;
  await assert.rejects(() => pollUntil(async () => { calls++; return 'FAILED'; },
    { intervalMs: 1, backoff: 1, maxIntervalMs: 1, timeoutMs: 1000 }, 'build', silent),
    /terminal failure status "FAILED"/);
  assert.ok(calls >= 1);
});

test('pollUntil: throws on timeout when status never terminal (cost guard)', async () => {
  await assert.rejects(() => pollUntil(async () => 'IN_PROGRESS',
    { intervalMs: 1, backoff: 1, maxIntervalMs: 1, timeoutMs: 20 }, 'build', silent),
    /timed out/);
});
