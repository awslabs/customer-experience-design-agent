// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: FLOW-DSL CLI — build every FlowSpec in a directory, then run the cross-flow checks. //
//   npx --yes tsx <engine>/flow-dsl/build-specs.ts <flowsDir>
//
// Reads   <flowsDir>/specs/*.flowspec.json   (one FlowSpec per flow — the authoring INPUT)
//         <flowsDir>/flowset.json            (optional cross-flow options: externalVars, identityVars, authFlagVar, entryFlows, sinks)
// Writes  <flowsDir>/<flowId>.flow.json      (DSL OUTPUT — never hand-edit)
// Exit 0 = every spec built and the flow set is clean. Exit 1 = problems listed (nothing is half-written:
// .flow.json files are only written when EVERY spec builds and the cross-flow checks pass).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { buildFromSpec, FlowSpecError, type FlowSpec } from './spec';
import { checkFlowSet, requireAuthFlagVar, type FlowSetOptions } from '../lib/flowset-checks';
import { checkFlowSetWarnings, FINDING_RESOLUTION, type FlowSetWarningOptions } from '../lib/flowset-warnings';
import type { FlowDoc } from './builder';
import { setContextVarTypes } from './nodes';
import { undefinedAnalyticsTags, buildVocabulary, validateFlowRefs } from '../lib/validate-flow-refs';

export interface BuildSpecsResult { built: FlowDoc[]; problems: string[] }

/** Pure core (used by the CLI and tests): build specs + cross-flow checks, no file writes. */
export function buildSpecs(specs: FlowSpec[], opts: FlowSetOptions = {},
  contextVarTypes: Record<string, string> = {}): BuildSpecsResult {
  setContextVarTypes(contextVarTypes);   // number/boolean body tokens become typed operands
  const built: FlowDoc[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of specs) {
    if (s?.flowId && seen.has(s.flowId)) { problems.push(`duplicate flowId "${s.flowId}" across specs`); continue; }
    if (s?.flowId) seen.add(s.flowId);
    try {
      built.push(buildFromSpec(s));
    } catch (e) {
      if (e instanceof FlowSpecError) problems.push(...e.problems.map((p) => `[${e.flowId}] ${p}`));
      else problems.push(`[${s?.flowId ?? '?'}] ${(e as Error).message}`);
    }
  }
  if (!problems.length) problems.push(...checkFlowSet(built, opts).map((p) => `[flow set] ${p}`));
  return { built, problems };
}

function main(): void {
  const dir = resolve(process.argv[2] ?? 'flows');
  const specDir = join(dir, 'specs');
  if (!existsSync(specDir)) {
    console.error(`no spec directory: ${specDir} (expected <flowsDir>/specs/*.flowspec.json)`);
    process.exit(1);
  }
  const files = readdirSync(specDir).filter((f) => f.endsWith('.flowspec.json')).sort();
  if (!files.length) { console.error(`no *.flowspec.json in ${specDir}`); process.exit(1); }

  const specs: FlowSpec[] = [];
  const parseProblems: string[] = [];
  for (const f of files) {
    try { specs.push(JSON.parse(readFileSync(join(specDir, f), 'utf8')) as FlowSpec); }
    catch (e) { parseProblems.push(`${f}: invalid JSON — ${(e as Error).message}`); }
  }
  const optsPath = join(dir, 'flowset.json');
  let opts: FlowSetOptions = {};
  if (existsSync(optsPath)) {
    try { opts = JSON.parse(readFileSync(optsPath, 'utf8')) as FlowSetOptions; }
    catch (e) { parseProblems.push(`flowset.json: invalid JSON — ${(e as Error).message}`); }
  }
  if (parseProblems.length) {
    console.error(`FlowSpec build failed — ${parseProblems.length} problem(s):\n  • ${parseProblems.join('\n  • ')}`);
    process.exit(1);
  }

  // Resources live beside flows/ in the distribution, but during Flow Authoring they are in the Resource Creation
  // record dir. Use --resources <dir> if given, else the flows dir's parent, else the sibling
  // acxd-resource-creation record dir.
  const resArg = process.argv.indexOf('--resources');
  const candidates = [
    ...(resArg > 0 && process.argv[resArg + 1] ? [resolve(process.argv[resArg + 1])] : []),
    dirname(dir),
    join(dirname(dirname(dir)), 'acxd-resource-creation'),
  ];
  const base = candidates.find((c) => existsSync(join(c, 'acxd-deploy.config.json')) || existsSync(join(c, 'resources'))) ?? dirname(dir);
  // Context variable types: read from the deploy config's resources.contextVariables.
  const varTypes: Record<string, string> = {};
  const cfgPath = join(base, 'acxd-deploy.config.json');
  const cvRel = existsSync(cfgPath)
    ? (JSON.parse(readFileSync(cfgPath, 'utf8')) as { resources?: { contextVariables?: string } }).resources?.contextVariables
    : undefined;
  const cvPath = cvRel ? join(base, cvRel) : join(base, 'resources', 'context-vars.json');
  // Declared response fields per data request, so design findings name the exact unused fields (same as deploy).
  const drRel = existsSync(cfgPath)
    ? (JSON.parse(readFileSync(cfgPath, 'utf8')) as { resources?: { dataRequests?: string } }).resources?.dataRequests
    : undefined;
  const drPath = drRel ? join(base, drRel) : join(base, 'resources', 'data-requests.json');
  const dataRequestFields: Record<string, string[]> = {};
  if (existsSync(drPath)) {
    for (const d of JSON.parse(readFileSync(drPath, 'utf8')) as Array<{ dataRequestId?: string; responseSchema?: { properties?: Record<string, unknown> } }>) {
      const props = d?.responseSchema?.properties;
      if (d?.dataRequestId && props && typeof props === 'object') dataRequestFields[d.dataRequestId] = Object.keys(props);
    }
  }
  if (existsSync(cvPath)) {
    for (const v of JSON.parse(readFileSync(cvPath, 'utf8')) as Array<{ name?: string; schemaType?: string }>)
      if (v?.name && v.schemaType) varTypes[v.name] = v.schemaType;
  } else {
    console.error(`FlowSpec build failed: context variables file not found (${cvPath}). It is needed to send ` +
      'number/boolean values to data requests with their declared types.');
    process.exit(1);
  }

  const { built, problems } = buildSpecs(specs, opts, varTypes);
  problems.push(...requireAuthFlagVar(opts).map((p) => `[flow set] ${p}`));
  // Per-flow reference checks (tokens, slots, data requests, types, names): the same validator deploy runs,
  // so these fail here at authoring time instead of at deploy. Tags are checked below, so not passed here.
  const resPath = (key: string, dflt: string): string => {
    const rel = existsSync(cfgPath)
      ? (JSON.parse(readFileSync(cfgPath, 'utf8')) as { resources?: Record<string, string> }).resources?.[key]
      : undefined;
    return rel ? join(base, rel) : join(base, 'resources', dflt);
  };
  const loadArr = (path: string): never[] => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []) as never[];
  const vocab = buildVocabulary(loadArr(cvPath), loadArr(resPath('slotTypes', 'slot-types.json')), loadArr(drPath));
  for (const doc of built) {
    try { validateFlowRefs(doc.flowId, JSON.parse(JSON.stringify(doc)) as Record<string, unknown>, vocab); }
    catch (e) { problems.push(`[${doc.flowId}] ${(e as Error).message}`); }
  }
  // Every analytics tag a node uses must be defined in the analytics-tags resource file (same check as deploy).
  const tagRel = existsSync(cfgPath)
    ? (JSON.parse(readFileSync(cfgPath, 'utf8')) as { resources?: { analyticsTags?: string } }).resources?.analyticsTags
    : undefined;
  const tagPath = tagRel ? join(base, tagRel) : join(base, 'resources', 'analytics-tags.json');
  if (existsSync(tagPath)) {
    const tagNames = new Set((JSON.parse(readFileSync(tagPath, 'utf8')) as Array<{ name?: string }>).map((t) => t?.name).filter(Boolean) as string[]);
    for (const doc of built) {
      for (const u of undefinedAnalyticsTags(doc as never, tagNames)) {
        problems.push(`[${doc.flowId}] node "${u.node}" uses analytics tag "${u.tag}", which is not defined in ` +
          `${tagRel ?? 'resources/analytics-tags.json'} — add it there or remove the tag from the node`);
      }
    }
  } else {
    problems.push(`analytics tags file not found (${tagPath}); it is needed to check the tags flows use`);
  }
  if (problems.length) {
    console.error(`FlowSpec build failed — ${problems.length} problem(s). No .flow.json files were written:\n  • ` +
      problems.join('\n  • '));
    process.exit(1);
  }
  // Design findings (dead data, dead state, shared-tier Generative Journeys) BLOCK the build: fix the design, or
  // record an intended one in flowset.json with a reason. Nothing is written until the set is clean.
  const findings = checkFlowSetWarnings(built as never, { ...(opts as FlowSetWarningOptions), dataRequestFields });
  if (findings.length) {
    console.error(`FlowSpec build failed — ${findings.length} design finding(s). No .flow.json files were written:\n  • ` +
      findings.join('\n  • ') + `\n\n${FINDING_RESOLUTION}`);
    process.exit(1);
  }
  for (const doc of built) writeFileSync(join(dir, `${doc.flowId}.flow.json`), JSON.stringify(doc, null, 2) + '\n');
  console.log(`✓ built ${built.length} flow(s) from specs; cross-flow checks clean:\n  ` +
    built.map((d) => `${d.flowId}.flow.json`).join('\n  '));
  // The build proves the flows are well formed, not that they deliver the user stories: say what comes next.
  console.log('\nNEXT (required before the Flow Authoring gate): run Build SIT (Step 7b): ' +
    'follow Part A of knowledge/acxd-platform-agent/acxd-sit-method.md, trace every approved user story, and write acxd-sit-results.md.');
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] && /build-specs\.ts$/.test(process.argv[1])) main();
