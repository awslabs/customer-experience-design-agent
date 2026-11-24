// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: FLOWSPEC TEST — proves the declarative FlowSpec path builds the SAME verified shapes as the TypeScript
// DSL path, reports clear errors, and that the cross-flow checks catch the design-contract bugs.
// Run: npx tsx ../../tests/acxd-deploy-engine/flow-dsl/spec.test.ts   (from tools/acxd-deploy-engine/)
// Self-contained assertion script — exits non-zero on failure.

import { buildFromSpec, FlowSpecError, type FlowSpec, type NodesFlowSpec } from '../../../tools/acxd-deploy-engine/flow-dsl/spec';
import { buildSpecs } from '../../../tools/acxd-deploy-engine/flow-dsl/build-specs';
import { checkFlowSet } from '../../../tools/acxd-deploy-engine/lib/flowset-checks';
import { buildCallback } from '../../../tools/acxd-deploy-engine/flow-dsl/components';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  ✗ ${msg}`); failures++; } else { console.log(`  ✓ ${msg}`); }
}
function throws(fn: () => unknown, re: RegExp, msg: string): void {
  try { fn(); assert(false, `${msg} (did not throw)`); }
  catch (e) { const m = (e as Error).message; assert(re.test(m), `${msg}${re.test(m) ? '' : ` — got: ${m.split('\n')[0]}`}`); }
}

// ── 1. A bespoke agentic auth flow (shape) built from a spec ──────────────────────────────────────────
const authSpec: NodesFlowSpec = {
  flowId: 'billingSignIn',
  aiDescription: 'Verifies the caller by account number and PIN, then forwards to policies or escalation.',
  slots: [
    { name: 'accountNumber', type: 'NLX.AlphaNumeric', sensitive: true },
    { name: 'pin', type: 'NLX.AlphaNumeric', sensitive: true },
  ],
  nodes: [
    { id: 'start', type: 'start', next: 'zero' },
    { id: 'zero', type: 'define', local: 'constZero', value: 0, next: 'init' },
    { id: 'init', type: 'basic', name: 'Init attempts', set: [{ set: 'authAttempts', from: 'local:constZero' }], next: 'collect' },
    { id: 'collect', type: 'generative_journey', name: 'Collect identity factors',
      prompt: 'ROLE: identity check. Ask for the account number and PIN.',
      dataCapture: [{ slot: 'accountNumber' }, { slot: 'pin' }],
      exits: [{ name: 'humanHandoff', prompt: 'The caller asks for a person.' }],
      routes: { captured: 'verify', humanHandoff: 'toEsc', timeout: 'toEsc', failure: 'toEsc' } },
    { id: 'verify', type: 'data_request', name: 'Verify identity', dataRequest: 'verifyAccount',
      params: { accountNumber: '{accountNumber:NLX.AlphaNumeric}', pin: '{pin:NLX.AlphaNumeric}' },
      exits: { success: 'verified', timeout: 'authErr', failure: 'authErr' } },
    { id: 'authErr', type: 'basic', name: 'Verification unavailable', messages: ['Sorry, we are unable to verify right now.'],
      set: [{ set: 'escalationReason', from: 'const:systemUnavailable' }], next: 'toEsc' },
    { id: 'verified', type: 'split', name: 'Verified?',
      branches: [{ name: 'yes', when: { var: 'verifyAccount.customerName', op: 'exists' } }],
      exits: { yes: 'mark', default: 'wrong' } },
    { id: 'mark', type: 'basic', name: 'Mark verified',
      set: [{ set: 'authStatus', from: 'const:verified' }, { set: 'accountRef', from: 'var:verifyAccount.accountRef' }],
      next: 'proceed' },
    { id: 'proceed', type: 'redirect', name: 'Proceed to policies', to: 'billingAccountDetails' },
    { id: 'wrong', type: 'basic', name: 'Wrong details', messages: ['That did not match our records.'],
      set: [{ increment: 'authAttempts' }, { clearSlot: 'accountNumber' }, { clearSlot: 'pin' }], next: 'exhausted' },
    { id: 'exhausted', type: 'split', name: 'Attempts exhausted?',
      branches: [{ name: 'out', when: { ctx: 'authAttempts', op: 'gte', value: 3 } }],
      exits: { out: 'toEsc', default: 'collect' } },
    { id: 'toEsc', type: 'redirect', name: 'To escalation', to: 'billingEscalation',
      set: [{ set: 'escalationReason', from: 'const:authFailed' }] },
  ],
};

console.log('FlowSpec: bespoke auth flow');
const auth = buildFromSpec(authSpec);
const nodes = Object.values(auth.nodes);
const byName = (n: string) => nodes.find((x) => x.metadata?.name === n)!;
assert(auth.flowId === 'billingSignIn', 'flowId preserved');
assert(nodes.length === authSpec.nodes.length, `one emitted node per spec node (${nodes.length})`);
const dr = byName('Verify identity');
assert(dr.childNodes.map((c) => c.conditions[0].right?.value).join(',') === 'in_progress,success,timeout,failure',
  'data_request edges in console order, in_progress first (factory guarantees it)');
const ipEdge = dr.childNodes.find((c) => c.conditions[0].right?.value === 'in_progress');
assert(!!ipEdge && !ipEdge.nodeId, 'in_progress edge is present but disconnected (no target)');
const authErr = byName('Verification unavailable');
const tgt = (v: string) => dr.childNodes.find((c) => c.conditions[0].right?.value === v)?.nodeId;
assert(tgt('failure') === authErr.nodeId && tgt('timeout') === authErr.nodeId, 'failure + timeout both route to the error node');
assert(authErr.childNodes[0]?.nodeId === byName('To escalation').nodeId, 'error node routes to escalation');
const gj = byName('Collect identity factors');
assert(gj.childNodes.length === 4, 'GJ has captured + 1 named + timeout + failure edges');
assert(byName('Proceed to policies').childNodes[0]?.conditions[0]?.right?.value === 'continuation', 'redirect gets the continuation edge');
assert(auth.slots.map((s) => s.name).sort().join(',') === 'accountNumber,pin', 'declared slots attached');
const mark = byName('Mark verified');
assert(mark.metadata?.stateModifications?.some((m) => m.name === 'accountRef' && m.value?.type === 'variable') === true,
  'accountRef set from the verify response on Mark verified');
assert(Object.values(auth.nodes).every((n) => n.canvasMetadata), 'every node has canvas metadata');

// ── 2. Component spec ───────────────────────────────────────────────────────────────────────────────────────
console.log('FlowSpec: component');
const esc = buildFromSpec({ flowId: 'billingEscalation', component: 'escalation',
  params: { aiDescription: 'Summarises the conversation and hands over to a human agent.' } });
assert(Object.values(esc.nodes).some((n) => n.type === 'escalate'), 'escalation component builds an escalate node');

// ── 3. Clear errors ─────────────────────────────────────────────────────────────────────────────────────────
console.log('FlowSpec: errors');
const bad = (mut: (s: typeof authSpec) => void): FlowSpec => { const s = JSON.parse(JSON.stringify(authSpec)); mut(s); return s; };
throws(() => buildFromSpec(bad((s) => { (s.nodes[4] as { exits: Record<string, string> }).exits = { sucess: 'verified', timeout: 'authErr', failure: 'authErr' }; })),
  /has no exit "sucess" — valid exits: in_progress, success, timeout, failure/, 'misspelt exit names the valid exits');
throws(() => buildFromSpec(bad((s) => { delete (s.nodes[4] as { exits: Record<string, string> }).exits.timeout; })),
  /exit "timeout" is not wired/, 'missing exit is reported');
throws(() => buildFromSpec(bad((s) => { (s.nodes[4] as { exits: Record<string, string> }).exits.in_progress = 'verified'; })),
  /in_progress/, 'declaring in_progress on a data_request is rejected');
throws(() => buildFromSpec(bad((s) => { const m = s.nodes.find((x: { id: string }) => x.id === 'mark') as { next: string }; m.next = 'nowhere'; })),
  /targets unknown node "nowhere"/, 'unknown target is reported');
throws(() => buildFromSpec(bad((s) => { s.nodes.push({ id: 'start', type: 'start', next: 'zero' }); })),
  /duplicate node id "start"/, 'duplicate id is reported');
throws(() => buildFromSpec(bad((s) => { const m = s.nodes.find((x: { id: string }) => x.id === 'mark') as { set: unknown[] }; m.set = [{ set: 'authStatus', from: 'verified' }]; })),
  /needs a prefix/, 'unprefixed reference is reported');
try { buildFromSpec(bad((s) => { const z = s.nodes.find((x: { id: string }) => x.id === 'zero') as { next: string }; z.next = 'gone'; const i = s.nodes.find((x: { id: string }) => x.id === 'init') as { next: string }; i.next = 'nowhere'; })); }
catch (e) { assert(e instanceof FlowSpecError && e.problems.length >= 2, 'ALL problems reported in one error, not just the first'); }

// ── 4. Cross-flow checks ────────────────────────────────────────────────────────────────────────────────────
console.log('Flow set: cross-flow checks');
const welcome: FlowSpec = { flowId: 'billingMain', aiDescription: 'Entry flow; asks if existing, routes.', nodes: [
  { id: 'start', type: 'start', next: 'ask' },
  { id: 'ask', type: 'user_choice', slot: 'isExisting', slotType: 'xxYesNo', values: ['yes', 'no'],
    elicit: 'Are you an existing customer?', exits: { yes: 'toAuth', no: 'toNew', 'no-match': 'toAuth' } },
  { id: 'toAuth', type: 'redirect', to: 'billingSignIn' },
  { id: 'toNew', type: 'redirect', to: 'billingNewAccount' },
] };
const policies: FlowSpec = { flowId: 'billingAccountDetails', aiDescription: 'Gets held policies for a verified customer.', nodes: [
  { id: 'start', type: 'start', next: 'get' },
  { id: 'get', type: 'data_request', dataRequest: 'getAccountDetails', params: { accountRef: '{accountRef:NLX.Context}' },
    exits: { success: 'done', timeout: 'esc', failure: 'esc' } },
  { id: 'done', type: 'redirect', to: 'billingPaymentPlan' },
  { id: 'esc', type: 'redirect', to: 'billingEscalation' },
] };
const newIntake: FlowSpec = { flowId: 'billingNewAccount', aiDescription: 'New customer intake and base quote.', nodes: [
  { id: 'start', type: 'start', next: 'q' },
  { id: 'q', type: 'basic', set: [{ set: 'baseQuote', from: 'const:100' }], next: 'go' },
  { id: 'go', type: 'redirect', to: 'billingPaymentPlan' },
] };
const discounts: FlowSpec = { flowId: 'billingPaymentPlan', aiDescription: 'Applies discounts to the base quote.', nodes: [
  { id: 'start', type: 'start', next: 'say' },
  { id: 'say', type: 'basic', messages: ['Your base quote is {baseQuote:NLX.Context}.'], next: 'terminate' },
] };
const opts = { identityVars: ['accountRef'], authFlowId: 'billingSignIn', externalVars: ['escalationReason'] };
const escSpec: FlowSpec = { flowId: 'billingEscalation', component: 'escalation', params: { aiDescription: 'Hands over to a human.' } };
const set1 = buildSpecs([welcome, authSpec, policies, newIntake, discounts, escSpec], opts);
assert(set1.problems.some((p) => /reads context var "baseQuote", but it can be reached without "baseQuote" being set/.test(p)),
  'reachability: baseQuote missing on the existing-customer path is caught');
assert(!set1.problems.some((p) => /"accountRef"/.test(p)), 'accountRef set on Mark verified (after auth) is accepted');

// class: pre-auth lookup sets accountRef in the entry flow.
const docs = [buildFromSpec(welcome), auth, buildFromSpec(policies)];
const mainDoc = docs[0] as { nodes: Record<string, { type?: string; metadata?: { stateModifications?: unknown[] } }> };
const firstRedirect = Object.values(mainDoc.nodes).find((n) => n.type === 'redirect')!;
firstRedirect.metadata!.stateModifications = [{ type: 'context', name: 'accountRef', modification: 'set', value: { type: 'field', name: 'customerLookup.accountRef' } }];
const p2 = checkFlowSet(docs as never, { identityVars: ['accountRef'], authFlowId: 'billingSignIn', externalVars: ['escalationReason'] });
assert(p2.some((p) => /flow "billingMain" sets identity var "accountRef" but is reachable before auth/.test(p)),
  'identity: accountRef set before auth is caught');
const p3 = checkFlowSet([buildFromSpec(policies)] as never, {});
assert(p3.some((p) => /reads context var "accountRef", but no flow sets it/.test(p)), 'no-setter: accountRef with no setter is caught');
assert(p3.some((p) => /redirects to "billingPaymentPlan", which is not in the flow set/.test(p)), 'unknown redirect target is caught');

// ── Terminal sink: buildCallback (both modes) + sink enforcement (C + D) ───────────────────────
// A sink MUST NOT redirect onward and every path must end in a terminal (escalate or terminate). A sink MAY mix
// the two (terminate on success, escalate on an error/capture-fail path). `variant` is an intent label only.
const cbNative = buildCallback({
  exitMode: 'nativeEscalate', flowId: 'billingCallback', aiDescription: 'Capture a callback number and hand to the native queued callback.',
  numberSlot: 'callbackNumber', choosePrompt: 'What is the best number to call you back on?',
  confirmMessage: 'Thanks, we will call you back shortly.', numberContextVar: 'callbackNumber', reasonContextVar: 'callbackReason',
});
const cbTypes = Object.values(cbNative.nodes).map((n) => (n as { type?: string }).type);
assert(cbTypes.includes('escalate') && !cbTypes.includes('redirect'),
  'callback nativeEscalate: converges on escalate, no redirect onward');
assert(checkFlowSet([cbNative] as never, { sinks: [{ flowId: 'billingCallback', variant: 'escalate' }] }).length === 0,
  'callback nativeEscalate passes sink enforcement');

const cbExternal = buildCallback({
  exitMode: 'externalRecord', flowId: 'billingCallbackExt', aiDescription: 'Capture a callback request and record it to the external system.',
  numberSlot: 'callbackNumber', choosePrompt: 'What is the best number to call you back on?',
  confirmMessage: 'Thanks, we have logged your callback request.', recordVariableId: 'recordCallback', recordUrlParams: { number: '{callbackNumber:NLX.AlphaNumeric}' },
});
const cbxTypes = Object.values(cbExternal.nodes).map((n) => (n as { type?: string }).type);
assert(cbxTypes.includes('terminate') && !cbxTypes.includes('redirect'),
  'callback externalRecord: ends via terminate (happy path) with no redirect onward');
// externalRecord mixes terminate (success) + escalate (capture-fail/error) — a VALID sink. Enforcement passes.
assert(checkFlowSet([cbExternal] as never, { sinks: [{ flowId: 'billingCallbackExt', variant: 'terminate' }] }).length === 0,
  'callback externalRecord passes sink enforcement (mixed terminate+escalate terminals are allowed)');

// D negative: a sink that redirects onward MUST be caught. Build a flow that terminates but also redirects.
const leaky = { flowId: 'leakySink', nodes: {
  n1: { type: 'start' }, n2: { type: 'redirect' }, n3: { type: 'terminate' },
} };
const leakyProblems = checkFlowSet([leaky] as never, { sinks: [{ flowId: 'leakySink', variant: 'terminate' }] });
assert(leakyProblems.some((p) => /contains a redirect node/.test(p)),
  'sink enforcement catches a sink that redirects onward (loop-prevention)');

// D negative: a declared sink with no terminal node at all MUST be caught.
const noTerm = { flowId: 'noTermSink', nodes: { n1: { type: 'start' }, n2: { type: 'basic' } } };
assert(checkFlowSet([noTerm] as never, { sinks: [{ flowId: 'noTermSink' }] }).some((p) => /has no terminal node/.test(p)),
  'sink enforcement catches a declared sink with no escalate/terminate node');

// C guard: a callback spec with a missing/old exitMode must FAIL LOUDLY (not silently take a branch).
let cbGuardThrew = false;
try {
  buildCallback({ flowId: 'badCb', aiDescription: 'x', numberSlot: 'n', choosePrompt: 'q?', confirmMessage: 'ok' } as never);
} catch { cbGuardThrew = true; }
assert(cbGuardThrew, 'buildCallback throws on a missing/invalid exitMode (old-shape spec caught loudly)');

// Typed body tokens: a lone context token for a number/boolean variable becomes a typed context operand;
// string variables, literals and mixed text stay constants.
{
  const typedSpec = {
    flowId: 'typedBody', aiDescription: 'Sends typed values in a JSON body.',
    nodes: [
      { id: 'start', type: 'start', next: 'dr' },
      { id: 'dr', type: 'data_request', name: 'Apply', dataRequest: 'applyDiscounts',
        body: { level: '{level:NLX.Context}', multi: '{multi:NLX.Context}', ref: '{ref:NLX.Context}',
          note: 'level {level:NLX.Context}', nested: { flag: '{multi:NLX.Context}' } },
        exits: { success: 'end', timeout: 'end', failure: 'end' } },
      { id: 'end', type: 'terminate' },
    ],
  } as unknown as FlowSpec;
  const res = buildSpecs([typedSpec], {}, { level: 'number', multi: 'boolean', ref: 'string' });
  assert(res.problems.length === 0, `typed-body spec builds${res.problems.length ? ' — ' + res.problems.join('; ') : ''}`);
  const drNode = Object.values((res.built[0] as unknown as { nodes: Record<string, { type: string; dataRequests?: Array<{ payload: { value: Record<string, any> } }> }> }).nodes)
    .find((x) => x.type === 'data_request');
  const pv = drNode?.dataRequests?.[0]?.payload?.value ?? {};
  assert(pv.level?.type === 'context' && pv.level?.name === 'level', 'number var token -> typed context operand');
  assert(pv.multi?.type === 'context' && pv.multi?.name === 'multi', 'boolean var token -> typed context operand');
  assert(pv.ref?.type === 'constant', 'string var token stays a constant');
  assert(pv.note?.type === 'constant', 'mixed text stays a constant');
  assert(pv.nested?.value?.flag?.type === 'context', 'nested boolean token -> typed context operand');
  buildSpecs([], {}, {});   // reset the type map for any later builds
}

// Built-in slot types other than NLX.AlphaNumeric are rejected at build time (ACXD does not provide them).
{
  const freeText = {
    flowId: 'freeTextSlot', aiDescription: 'Captures a free-text answer.',
    slots: [{ name: 'riskSummarySlot', type: 'NLX.FreeText' }],
    nodes: [{ id: 'start', type: 'start', next: 'end' }, { id: 'end', type: 'terminate' }],
  } as unknown as FlowSpec;
  throws(() => buildFromSpec(freeText), /NLX\.FreeText.*NLX\.AlphaNumeric/, 'NLX.FreeText slot rejected with an AlphaNumeric hint');
  const alpha = { ...(freeText as object), flowId: 'alphaSlot', slots: [{ name: 'riskSummarySlot', type: 'NLX.AlphaNumeric' }] } as unknown as FlowSpec;
  let ok = true; try { buildFromSpec(alpha); } catch { ok = false; }
  assert(ok, 'NLX.AlphaNumeric slot accepted');
}

// Slot keys: "slotType" (wrong key) and a missing type are rejected at build time.
{
  const base = { aiDescription: 'Captures a value.', nodes: [{ id: 'start', type: 'start', next: 'end' }, { id: 'end', type: 'terminate' }] };
  const wrongKey = { ...base, flowId: 'wrongKeySlot', slots: [{ name: 'pin', slotType: 'NLX.AlphaNumeric' }] } as unknown as FlowSpec;
  throws(() => buildFromSpec(wrongKey), /unknown key.*slotType/, 'slot with "slotType" key rejected');
  const noType = { ...base, flowId: 'noTypeSlot', slots: [{ name: 'pin' }] } as unknown as FlowSpec;
  throws(() => buildFromSpec(noType), /needs a name and a "type"/, 'slot with no type rejected');
}

// Generative Text output names: derived as camelCase from the display name; an illegal explicit name fails.
{
  const gt = {
    flowId: 'gtName', aiDescription: 'Presents a summary.',
    nodes: [
      { id: 'start', type: 'start', next: 'g' },
      { id: 'g', type: 'generative_text', name: 'Present quote', prompt: 'Say hello.', model: 'amazon-nova-2-lite',
        exits: { success: 'end', timeout: 'end', failure: 'end' } },
      { id: 'end', type: 'terminate' },
    ],
  } as unknown as FlowSpec;
  const doc = buildFromSpec(gt) as unknown as { nodes: Record<string, { type: string; metadata: { name: string; generativeText?: { name: string } } }> };
  const g = Object.values(doc.nodes).find((x) => x.type === 'generative_text')!;
  assert(g.metadata.generativeText?.name === 'presentQuote', 'generative_text output derived as presentQuote');
  assert(g.metadata.name === 'Present quote', 'node display name keeps its spaces');
  const bad = { ...(gt as object), flowId: 'gtBad', nodes: (gt as any).nodes.map((n: any) => n.id === 'g' ? { ...n, local: 'Present quote' } : n) } as unknown as FlowSpec;
  throws(() => buildFromSpec(bad), /not a legal variable name/, 'illegal explicit output name rejected');
}

console.log(failures ? `\n${failures} FLOWSPEC ASSERTION(S) FAILED` : '\nALL FLOWSPEC ASSERTIONS PASSED');
process.exit(failures ? 1 : 0);
