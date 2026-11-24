// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// ACXD Deploy Engine — orchestrator.
// LAYER: ORCHESTRATION — sequence, settle, idempotency policy, .env write-back.
//
// ── ARCHITECTURE (three layers) ──────────────────────────────────────────────────────────────
//   ORCHESTRATION  (this file, main.ts) — owns sequence/ordering, the per-type settle delay,
//                  idempotency policy, and .env id write-back. Decides WHAT runs WHEN; delegates
//                  the HOW of each resource to an emitter.
//   EMITTERS       (steps/create-*.ts, steps/ensure-*.ts) — one per resource type. Each reads its
//                  declarative input (resources/*.json, flows/*.flow.json, config, .env), builds the
//                  CreateX command input, and sends it. `create-*` = pure create; `ensure-*` =
//                  presence=intent (reuse an existing id from .env, else create + write the id back).
//   SUPPORT        (lib/*) — shared utilities with no resource knowledge: client factory, .env
//                  read/write, idempotency wrapper, logger, bounded poll, text helpers, and the
//                  author-time flow-reference validator (validate-flow-refs).
// Data flows one way: ORCHESTRATION → EMITTERS → SUPPORT. Emitters never call each other; shared
// logic lives in SUPPORT. Each module header below is tagged with its LAYER.
//
// One command (`npm run deploy`) provisions the whole ACXD SDK solution: workspace → resources → flows →
// application. Consumes declarative JSON (acxd-deploy.config.json + resources/*.json + flows/*.flow.json)
// and .env. All creates are synchronous (create → 2s settle); new ids (workspace, application) are written
// back to .env. No manual ID capture.
//
// BUILD + DEPLOY ARE DELIBERATELY NOT AUTOMATED. The ACXD engineer reviews the
// created resources/flows/application, then triggers Build + Deploy manually in the console (a human review
// gate validates the created solution before it goes live; Build + Deploy are a manual console step).
// Production CI/CD automation is deferred; the removed
// build/deploy step code is recoverable from git history when that path is built.
//
// Design: see DEPLOY-ENGINE-SPEC.md. Validated against the pinned amazon-connect-acxd-sdk (see package.json). One item to confirm
// on first live run: ApplicationSettings field shape.
import { config as loadDotenv } from 'dotenv';
// Load .env from ACXD_ENV_FILE if set (the runbook points this at the distribution-root .env), else the
// conventional ./.env. env-file.ts honours the SAME var for write-back, so read and write stay in lockstep.
loadDotenv({ path: process.env.ACXD_ENV_FILE ?? '.env' });
import { readFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute, join } from 'node:path';
import { makeClient } from './lib/client';
import { validateConfig, DeployConfig } from './lib/validate-config';
import { makeLogger } from './lib/log';
import { validateFieldLengths } from './steps/validate-field-lengths';
import { ensureWorkspace } from './steps/ensure-workspace';
import { ensureApplication } from './steps/ensure-application';
import { createContextVars } from './steps/create-context-vars';
import { assertLegalAcxdName } from './lib/text';
import { createSlotTypes } from './steps/create-slot-types';
import { createSecrets } from './steps/create-secrets';
import { createAnalyticsTags } from './steps/create-analytics-tags';
import { createDataRequests } from './steps/create-data-requests';
import { createKnowledgeBases } from './steps/create-knowledge-bases';
import { loadKnowledgeBaseContent } from './steps/load-kb-content';
import { createGuardrails } from './steps/create-guardrails';
import { createFlows, validateAllFlows } from './steps/create-flows';
import { buildVocabulary } from './lib/validate-flow-refs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function main(): Promise<void> {
  // Resolve the config to an ABSOLUTE path, then resolve every config-relative file (resources/*.json,
  // flows dir) against the CONFIG FILE'S directory — never the current working directory. This makes the
  // engine work no matter where it is invoked from (from acxd-sdk/, from the engine dir, or via any
  // wrapper), so a wrong-cwd invocation can never cause an ENOENT on acxd-deploy.config.json again.
  if (!process.env.ACXD_DEPLOY_CONFIG) {
    throw new Error('ACXD_DEPLOY_CONFIG is not set. Run from acxd-sdk/acxd-deploy-engine/ with: ' +
      'ACXD_ENV_FILE=../../.env ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy');
  }
  const configPath = resolve(process.env.ACXD_DEPLOY_CONFIG);
  const baseDir = dirname(configPath);
  const fromBase = (p: string) => (isAbsolute(p) ? p : join(baseDir, p));
  const cfg = loadJson<DeployConfig>(configPath);
  validateConfig(cfg, configPath);   // FAIL LOUD on a drifted/mis-shaped config before any field is used
  const settle = cfg.settleMs ?? 2000;
  // Rebase all config-relative paths to the config's directory (authoring is relative to the config file).
  for (const k of Object.keys(cfg.resources)) cfg.resources[k] = fromBase(cfg.resources[k]);
  cfg.flows.dir = fromBase(cfg.flows.dir);
  const log = makeLogger(process.env.ACXD_LOG_LEVEL);
  log.stage(
    `ACXD deploy engine — project ${cfg.project} (log level: ${log.level})`,
  );

  let client = makeClient();

  // 0. PRE-FLIGHT VALIDATION — validate ALL flows BEFORE any AWS call, so a flow-authoring error aborts with
  //    the account untouched (no half-deployed workspace). The vocabulary is built from the on-disk resource
  //    JSON (no AWS), and every flow is validated in one pass with a consolidated error list. This same vocab
  //    is reused for flow creation below (built once).
  const vocab = buildVocabulary(
    loadJson(cfg.resources.contextVariables),
    loadJson(cfg.resources.slotTypes),
    loadJson(cfg.resources.dataRequests),
    loadJson(cfg.resources.analyticsTags),
  );
  validateAllFlows(cfg.flows, vocab, log);

  // 0b. AUTHORED-IDENTIFIER PRE-FLIGHT — context-var / slot-type / analytics-tag names must be letters-only
  //     camelCase (ACXD rejects a digit with the opaque "key is not in the expected format"). Validate all
  //     up front so a bad name (e.g. accountNumberLast4) aborts BEFORE the workspace is created — never
  //     mid-loop after some resources exist. `[VERIFIED]`
  {
    const ctxDefs = loadJson<Array<{ name: string }>>(cfg.resources.contextVariables);
    for (const d of ctxDefs) assertLegalAcxdName('context variable', d.name);
    const slotDefs = loadJson<Array<{ slotTypeId: string }>>(cfg.resources.slotTypes);
    for (const d of slotDefs) assertLegalAcxdName('slot type', d.slotTypeId);
    const tagDefs = loadJson<Array<{ name: string }>>(cfg.resources.analyticsTags);
    for (const d of tagDefs) assertLegalAcxdName('analytics tag', d.name);
    log.stage('✓ pre-flight: all authored identifier names are ACXD-legal (letters-only, no digits)');
    // Field-length pre-flight: authored description fields must be within the ACXD limits (canonical table
    // in lib/length-limits.ts). Fails loud listing every offender BEFORE the workspace is created.
    validateFieldLengths({
      slotTypes: loadJson(cfg.resources.slotTypes),
      knowledgeBases: cfg.resources.knowledgeBases ? loadJson(cfg.resources.knowledgeBases) : [],
      dataRequests: loadJson(cfg.resources.dataRequests),
      guardrails: cfg.resources.guardrails ? loadJson(cfg.resources.guardrails) : [],
    });
    log.stage('✓ pre-flight: all authored description fields are within ACXD length limits');

  }

  // 1. WORKSPACE — presence = intent; synchronous create; settle (no poll — no GetWorkspace in SDK)
  const ws = await ensureWorkspace(client, cfg.workspace, log);
  if (ws.created) await sleep(settle);
  client = client.withWorkspace(ws.workspaceId);

  // 2. RESOURCES — dependency order (primitives → higher-order); synchronous; 2s settle between TYPES
  await createContextVars(client, loadJson(cfg.resources.contextVariables), log); await sleep(settle);
  await createSlotTypes(client, loadJson(cfg.resources.slotTypes), log); await sleep(settle);
  await createSecrets(client, loadJson(cfg.resources.secrets), log); await sleep(settle);
  await createAnalyticsTags(client, loadJson(cfg.resources.analyticsTags), log); await sleep(settle);
  await createDataRequests(client, loadJson(cfg.resources.dataRequests), log); await sleep(settle);
  const kbDefs = loadJson<Array<{ name: string; type: string; content?: string }>>(cfg.resources.knowledgeBases);
  const kbResult = await createKnowledgeBases(client, kbDefs as never, log); await sleep(settle);
  // Load each KB's content folder (articles or documents) and re-publish. Paths resolve against the config dir.
  await loadKnowledgeBaseContent(client, kbDefs, kbResult.nameToId, baseDir, log); await sleep(settle);
  // Guardrails: global resources, created before the application so their ids can be attached in settings.
  // Optional resource file — absent (undefined path) means no guardrails authored for this project.
  const guardrailDefs = cfg.resources.guardrails ? loadJson(cfg.resources.guardrails) : [];
  const guardrailResult = await createGuardrails(client, guardrailDefs as never, log); await sleep(settle);

  // 3. FLOWS — component flows first. Build the reference vocabulary from the SAME resource files the
  // create-steps consumed. The `vocab` was already built and every flow already validated up front (Step 0);
  // createFlows re-runs validateFlowRefs per flow as a harmless backstop before each CreateFlowCommand.
  const flowIds = await createFlows(client, cfg.flows, vocab, kbResult.nameToId, log); await sleep(settle);

  // 4. APPLICATION — presence = intent; synchronous create; settle. Attach the flows just created.
  const flowRefs = flowIds.map((flowId) => ({ flowId }));
  const app = await ensureApplication(client, cfg.application, flowRefs, log, guardrailResult.nameToId);
  if (app.created) await sleep(settle);

  // 5. DONE — the engine stops here. Build + Deploy are a MANUAL step for the ACXD engineer (review gate):
  //    review the created resources/flows/application in the ACXD console, then Build + Deploy from the
  //    console (see the runbook Stage 2). Build/deploy are NOT automated while the SDK/workflow are this new.
  log.result({
    project: cfg.project,
    workspaceId: ws.workspaceId,
    applicationId: app.applicationId,
    status: 'provisioned (not built/deployed)',
  });
  log.stage('✓ resources, flows, and application created — review in the ACXD console, then Build + Deploy manually (see runbook Stage 2).');
}

main().catch((err) => {
  console.error(`✗ deploy failed: ${(err as Error)?.message ?? err}`);
  process.exit(1);
});
