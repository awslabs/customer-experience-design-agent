// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: FLOW-DSL ROUND-TRIP TEST — proves the exit-handle model end-to-end against the VERIFIED console wire
// format (unbound-vs-bound export diff): build flows via the DSL, emit the FlowDoc, and assert
// (1) it emits without an unwired-exit error, (2) the emitted shapes match the console-validated exports
// (enumerated user_choice: slotId populated + per-value slot_value_id/constant_id branches + no-match edge;
// redirect intent shape; data_request variableId + 4 exits; GJ positional gjConditionIndex exits; full slots[]),
// (3) the edge-completeness gate CATCHES a deliberately-unwired exit.
//
// Run: npx tsx flow-dsl/roundtrip.test.ts   (from tools/acxd-deploy-engine/)
// Self-contained assertion script (no test framework dep) — exits non-zero on failure.

import { startNode, basicNode, userChoice, generativeJourney, escalate, redirect, dataRequestPayload } from '../../../tools/acxd-deploy-engine/flow-dsl/nodes';
import { buildVocabulary, validateFlowRefs } from '../../../tools/acxd-deploy-engine/lib/validate-flow-refs';
import { flow } from '../../../tools/acxd-deploy-engine/flow-dsl/builder';
import { buildAuthVerify, buildEscalation, buildWelcomeRouter, buildCallback, buildFaqLookup } from '../../../tools/acxd-deploy-engine/flow-dsl/components';
import { buildFromSpec } from '../../../tools/acxd-deploy-engine/flow-dsl/spec';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  ✗ ${msg}`); failures++; } else { console.log(`  ✓ ${msg}`); }
}

// ── 1. Build a small but representative flow ────────────────────────────────────────────────────────────────
// start → capture a product line (ENUMERATED slot: vehicle/home) → each captured value routes to the agentic
// journey; no-match escalates. The journey's named exits route to pricing / a human. Everything wired.
const f = flow('billingMainDemo', 'Demo flow that qualifies a quote and routes to an agentic journey or a human.');

const start = f.add(startNode());
const capture = f.add(userChoice({
  name: 'Capture product line',
  slotName: 'productLine',
  slotType: 'xxProductLine',
  values: [{ value: 'vehicle' }, { value: 'home' }],
  elicit: 'Which product line can I help with - vehicle or home?',
}));
const journey = f.add(generativeJourney({
  name: 'Servicing journey',
  prompt: 'Help the customer with their quote. Take the coverageComplete exit when done; take humanHandoff if they ask for a person.',
  exitNames: ['coverageComplete', 'humanHandoff'],
  tags: ['tierSelected'],
}));
const human = f.add(escalate({ name: 'To an agent' }));
const finish = f.add(redirect({ name: 'To pricing', toFlowId: 'billingPayment' }));

// Wire the exit handles: one per enumerated value + no-match (each is DERIVED from node config).
start.exit('next').to(capture);
capture.exit('vehicle').to(journey);
capture.exit('home').to(journey);
capture.exit('no-match').to(human);
journey.exit('coverageComplete').to(finish);   // named exit index 0
journey.exit('humanHandoff').to(human);         // named exit index 1
journey.exit('timeout').to(human);
journey.exit('failure').to(human);
// finish + human are one-way (continuation edge emitted internally)

const doc = f.emit();

// ── 2. Assert the emitted shape matches the verified wire format ────────────────────────────────────────────
console.log('Round-trip: emitted FlowDoc');
assert(doc.flowId === 'billingMainDemo', 'flowId preserved');
assert(doc.type === 'multilingual' && doc.masterLanguageCode === 'en-US' && doc.untrained === true && doc.mirroring === 'none', 'multilingual envelope emitted');
assert(Array.isArray(doc.slots) && doc.slots.length === 1 && doc.slots[0].name === 'productLine', 'productLine slot auto-attached exactly once');
assert(doc.slots[0].type === 'xxProductLine' && Array.isArray(doc.slots[0].examples) && typeof doc.slots[0].sensitive === 'boolean' && doc.slots[0].aiDescription === '', 'attached slot carries full wire shape {type,examples,sensitive,aiDescription}');
assert(Object.keys(doc.nodes).length === 5, 'five nodes emitted');

const choiceNode = Object.values(doc.nodes).find((n) => n.type === 'user_choice')!;
const ch = choiceNode.metadata.choice as { source?: string; slotId?: string; selectedChoiceLabel?: string; showChoices?: boolean; choiceDisplayFormat?: string; associatedSlotIds?: unknown[] };
assert(ch.source === 'slot', 'user_choice uses source:"slot" (WIRE format, not slotType)');
assert(ch.slotId === 'productLine' && ch.selectedChoiceLabel === 'productLine', 'BOUND: slotId + selectedChoiceLabel = the slot name (the Options binding)');
assert(ch.showChoices === false && ch.choiceDisplayFormat === 'dropdown', 'showChoices:false, choiceDisplayFormat dropdown');
assert(Array.isArray(ch.associatedSlotIds) && ch.associatedSlotIds.length === 0, 'associatedSlotIds empty');
assert(choiceNode.childNodes.length === 3, 'capture has 3 edges (2 values + no-match)');
const valEdges = choiceNode.childNodes.filter((c) => c.conditions[0].left?.type === 'slot_value_id');
assert(valEdges.length === 2, 'two per-value slot_value_id branches');
assert(valEdges.some((c) => c.conditions[0].right?.value === 'xxProductLineVehicle') && valEdges.some((c) => c.conditions[0].right?.value === 'xxProductLineHome'), 'per-value branches use deterministic valueIds (xxProductLineVehicle/Home)');
// edge names are emitted as '' since the Sep 28 edgeName() fix, so match on the condition only.
assert(choiceNode.childNodes.some((c) => c.conditions[0].operator === 'not_exists' && (c.conditions[0].left as { name?: string }).name === 'productLine'), 'no-match edge is { slot(productLine) not_exists } (populated name)');

const journeyNode = Object.values(doc.nodes).find((n) => n.type === 'generative_journey')!;
assert(journeyNode.childNodes.length === 4, 'journey wired 4 exits (2 named + timeout + failure)');
const gjIdx = journeyNode.childNodes.filter((c) => (c.conditions[0].left as { name?: string }).name === 'System.gjConditionIndex');
assert(gjIdx.length === 2, 'journey has 2 System.gjConditionIndex edges (the named exits)');
assert(gjIdx.some((c) => c.conditions[0].right?.value === 0) && gjIdx.some((c) => c.conditions[0].right?.value === 1), 'named exits wired POSITIONALLY by index 0 and 1');
assert(!journeyNode.childNodes.some((c) => c.conditions[0].right?.value === 'humanHandoff'), 'named exit is NOT wired as node_status eq "<name>" (the retired desync bug)');
const gjTags = (journeyNode.metadata as { tags?: Array<{ label?: unknown }> }).tags;
assert(Array.isArray(gjTags) && gjTags.length === 1, 'journey carries metadata.tags (one entry)');
assert(gjTags![0].label === 'tierSelected', 'string tag emits {label:"tierSelected"} — NOT double-wrapped {label:{label:...}}');

// Defensive: the {label} OBJECT input shape normalizes identically (an author passing [{label:"x"}] instead of
// ["x"] must NOT produce the double-wrap {label:{label:"x"}} that failed a live deploy).
const gjObjInput = generativeJourney({
  name: 'obj-tag', prompt: 'done → coverageComplete', exitNames: ['coverageComplete'],
  tags: [{ label: 'tierSelected' }],
});
const objTags = (gjObjInput.node.metadata as { tags?: Array<{ label?: unknown }> }).tags;
assert(Array.isArray(objTags) && objTags.length === 1 && objTags[0].label === 'tierSelected',
  'object-shape tag input [{label:"x"}] normalizes to {label:"x"} — same as string input (no double-wrap)');

const redirectNode = Object.values(doc.nodes).find((n) => n.type === 'redirect')!;
const rd = redirectNode.metadata.redirect as { id?: string; intentId?: string; type?: string };
assert(rd.type === 'intent' && rd.id === 'billingPayment' && rd.intentId === 'billingPayment', 'redirect uses intent shape {id,intentId,type:"intent"}');
assert(redirectNode.childNodes.length === 1 && redirectNode.childNodes[0].conditions[0].right?.value === 'continuation', 'redirect has the single continuation edge');

const everyNodeHasUuid = Object.values(doc.nodes).every((n) => /^[0-9a-f-]{36}$/i.test(n.nodeId));
assert(everyNodeHasUuid, 'every nodeId is a UUID');
const everyMsgHasId = Object.values(doc.nodes).every((n) => (n.messages ?? []).every((m) => /^[0-9a-f-]{36}$/i.test(m.messageId)));
assert(everyMsgHasId, 'every message carries a generated messageId');

// ── 3. Edge-completeness gate CATCHES an unwired exit ───────────────────────────────────────────────────────
console.log('Edge-completeness: an unwired exit must throw');
let caught = false;
try {
  const bad = flow('badFlow', 'A flow with an unwired exit.');
  const s2 = bad.add(startNode());
  const c2 = bad.add(userChoice({ name: 'x', slotName: 'yn', slotType: 'xxYesNo', values: [{ value: 'yes' }, { value: 'no' }], elicit: 'yes or no?' }));
  s2.exit('next').to(c2);
  // deliberately leave c2's exits (yes/no/no-match) unwired
  bad.emit();
} catch (e) {
  caught = true;
  console.log(`  ✓ caught: ${(e as Error).message.split('\n')[0]}`);
}
assert(caught, 'emit() throws when an exit is left unwired');

// ── 4. Cannot wire an exit the node does not have ───────────────────────────────────────────────────────────
let caught2 = false;
try { journey.exit('nonexistentExit'); } catch { caught2 = true; }
assert(caught2, 'exit(label) throws for an exit the node config never produced');

// ── 5. buildAuthVerify emits a fully-wired free-text-capture FlowDoc (un-quarantined) ───────────
// Free-text identifier capture (NLX.AlphaNumeric) — the userChoice omits `values`, so the factory emits the
// VERIFIED free-text shape (captured/no-match exists pair, no per-value branches).
console.log('Component: buildAuthVerify');
const auth = buildAuthVerify({
  flowId: 'billingSignIn',
  aiDescription: 'Reusable identity verification with bounded retries and escalation on exhaustion.',
  identifierSlot: 'accountNumber',
  identifierSlotType: 'NLX.AlphaNumeric',
  verifyVariableId: 'xxVerifyIdentity',
  verifyUrlParams: { accountNumber: '{accountNumber:NLX.AlphaNumeric}' },
  verifiedField: 'customerName',
  captureFields: [{ contextVar: 'customerId', field: 'customerId' }, { contextVar: 'customerName', field: 'customerName' }],
  authenticatedContextVar: 'authenticated',
  attemptsContextVar: 'authAttempts',
  maxRetries: 3,
  capturePrompt: 'To access your account, what is your account number?',
  retryMessage: "That didn't match our records. Let's try again.",
  onVerified: { toFlowId: 'billingMain' },
  escalationFlowId: 'billingEscalation',
  identifierExamples: ['ACC-1001'],
});
assert(auth.flowId === 'billingSignIn', 'auth component flowId set');
assert(auth.slots.some((s) => s.name === 'accountNumber' && s.type === 'NLX.AlphaNumeric' && s.sensitive === true), 'auth captures the identifier into a free-text NLX.AlphaNumeric slot');
const authCapture = Object.values(auth.nodes).find((n) => n.type === 'user_choice')!;
assert(!authCapture.childNodes.some((c) => c.conditions[0].left?.type === 'slot_value_id'), 'free-text capture has NO per-value slot_value_id branches');
assert(authCapture.childNodes.some((c) => c.conditions[0].operator === 'exists') && authCapture.childNodes.some((c) => c.conditions[0].operator === 'not_exists'), 'free-text capture routes via exists + not_exists edges');
assert((authCapture.metadata.choice as { slotId?: string }).slotId === 'accountNumber', 'free-text capture slotId is the populated slot name (the Options binding)');
const authDr = Object.values(auth.nodes).find((n) => n.type === 'data_request')!;
assert(authDr.dataRequests![0].variableId === 'xxVerifyIdentity' && authDr.dataRequests![0].name === 'xxVerifyIdentity', 'auth data_request binds via variableId (==name)');
// CreateFlow binds data_request edges by POSITION: emitted in_progress, success, timeout, failure.
assert(
  authDr.childNodes.map((c) => c.conditions[0].right?.value).join(',') === 'in_progress,success,timeout,failure',
  'auth data_request edges in console order, in_progress first',
);
// in_progress MUST be disconnected (builder auto-terminates it); timeout + failure -> error -> escalation.
const ipAuth = authDr.childNodes.find((c) => c.conditions[0].right?.value === 'in_progress');
assert(!!ipAuth && !ipAuth.nodeId, 'auth data_request in_progress edge is present but disconnected (no target)');
assert(authDr.dataRequests![0].alwaysRetrigger === true, 'auth data_request alwaysRetrigger defaults to true');
const authErrNode = Object.values(auth.nodes).find((n) => n.metadata.name === 'Verification unavailable')!;
const atgt = (v: string) => authDr.childNodes.find((c) => c.conditions[0].right?.value === v)?.nodeId;
assert(!!authErrNode && atgt('failure') === authErrNode.nodeId && atgt('timeout') === authErrNode.nodeId,
  'auth failure + timeout both route to the error node (no retry loop)');
assert(Object.values(auth.nodes).some((n) => n.type === 'split'), 'auth routes via splits (Verified? / Attempts exhausted?)');
assert(Object.values(auth.nodes).some((n) => n.type === 'redirect'), 'auth escalates/proceeds via redirects');
assert(Object.values(auth.nodes).every((n) => /^[0-9a-f-]{36}$/i.test(n.nodeId)), 'auth nodes all UUIDs');
// captureFields are set only after verification passes (on Mark verified), never on the data request.
assert(!(authDr.metadata.stateModifications ?? []).length, 'auth data_request sets NO state (captureFields wait for Verified?)');
const authMark = Object.values(auth.nodes).find((n) => n.metadata.name === 'Mark verified')!;
assert(['customerId', 'customerName'].every((v) => (authMark.metadata.stateModifications ?? []).some((m) => m.name === v)), 'captureFields are set on Mark verified');
// A missed capture re-prompts once without using an attempt; it never routes to Wrong details.
const byName = (nm: string) => Object.values(auth.nodes).find((n) => n.metadata.name === nm)!;
const wrongId = byName('Wrong details').nodeId;
assert(!authCapture.childNodes.some((c) => c.conditions[0].operator === 'not_exists' && c.nodeId === wrongId), 'identifier no-match does NOT go to Wrong details');
assert(authCapture.childNodes.some((c) => c.conditions[0].operator === 'not_exists' && c.nodeId === byName('Re-capture identifier').nodeId), 'identifier no-match re-prompts');
assert(byName('Re-capture identifier').childNodes.some((c) => c.conditions[0].operator === 'not_exists' && c.nodeId === byName('Capture failed').nodeId), 'second miss goes to Capture failed');

// ── 6. The remaining component builders each emit a fully-wired FlowDoc ─────────────────────────────────────
console.log('Components: escalation / welcomeRouter / callback / faqLookup');

const esc = buildEscalation({
  flowId: 'billingEscalation',
  aiDescription: 'Reusable human handoff: summarise the conversation, then escalate to an agent.',
  handoffSummaryContextVar: 'handoffSummary',
  summaryPrompt: 'Summarise the conversation so far for the human agent.',
  partingMessage: 'Let me connect you with a specialist.',
});
assert(Object.values(esc.nodes).some((n) => n.type === 'escalate'), 'escalation has the escalate node');
assert(Object.values(esc.nodes).some((n) => n.type === 'generative_text'), 'escalation summarises before handoff');

const wel = buildWelcomeRouter({
  flowId: 'billingWelcome',
  aiDescription: 'Greeting and intent dispatch to the matched flow.',
  greeting: 'Hello, thanks for calling.',
  intentSlot: 'intent',
  intentSlotType: 'xxIntent',
  routes: [{ value: 'newQuote', toFlowId: 'billingNew' }, { value: 'existing', toFlowId: 'billingExisting' }],
  noMatchToFlowId: 'billingMain',
  choosePrompt: 'How can I help you today?',
});
assert(wel.slots.length === 1 && wel.slots[0].name === 'intent', 'welcomeRouter attaches the intent slot');
assert(Object.values(wel.nodes).filter((n) => n.type === 'redirect').length === 3, 'welcomeRouter has 3 redirects (2 routes + no-match)');
const welChoice = Object.values(wel.nodes).find((n) => n.type === 'user_choice')!;
assert(welChoice.childNodes.filter((c) => c.conditions[0].left?.type === 'slot_value_id').length === 2, 'welcomeRouter routes via per-value branches on the choice node (no downstream split)');

// buildCallback is now a configurable TERMINAL SINK (externalRecord mode: record → terminate;
// error/capture-fail → escalate). It NEVER redirects onward.
const cb = buildCallback({
  exitMode: 'externalRecord',
  flowId: 'billingCallback',
  aiDescription: 'Capture a callback number, record it, and confirm.',
  numberSlot: 'callbackNumber',
  recordVariableId: 'xxRecordCallback',
  recordUrlParams: { number: '{callbackNumber:NLX.AlphaNumeric}' },
  choosePrompt: 'What is the best number to call you back on?',
  confirmMessage: 'Your callback is scheduled.',
});
assert(cb.slots.length === 1 && cb.slots[0].name === 'callbackNumber', 'callback attaches the number slot');
assert(Object.values(cb.nodes).some((n) => n.type === 'data_request'), 'callback records via a data_request');
assert(Object.values(cb.nodes).filter((n) => n.type === 'redirect').length === 0, 'callback is a sink — NO redirect onward');
assert(Object.values(cb.nodes).some((n) => n.type === 'terminate'), 'callback externalRecord ends via a terminate node');
assert(Object.values(cb.nodes).some((n) => n.type === 'escalate'), 'callback escalates on capture-fail/error (mixed-terminal sink)');

const faq = buildFaqLookup({
  flowId: 'billingFaq',
  aiDescription: 'Answer a question from the product knowledge base.',
  kbName: 'billingProductFaq',
  noAnswerMessage: 'I could not find that - let me take a note.',
  returnToFlowId: 'billingMain',
  escalationFlowId: 'billingEscalation',
});
const faqKb = Object.values(faq.nodes).find((n) => n.type === 'knowledge_base')!;
assert(!!faqKb, 'faqLookup queries a knowledge_base node');
// KB exits are match / no_match / timeout / failure (console-verified).
assert(faqKb.childNodes.map((c) => c.conditions[0].right?.value).sort().join(',') === 'failure,match,no_match,timeout',
  'KB node emits match/no_match/timeout/failure');
const faqName = (nm: string) => Object.values(faq.nodes).find((n) => n.metadata.name === nm);
const kbErr = faqName('Lookup unavailable')!;
const ktgt = (v: string) => faqKb.childNodes.find((c) => c.conditions[0].right?.value === v)?.nodeId;
assert(ktgt('timeout') === kbErr.nodeId && ktgt('failure') === kbErr.nodeId, 'KB timeout + failure route to the error node (then escalation)');
assert(Object.values(faq.nodes).filter((n) => n.type === 'redirect').length === 2, 'faqLookup redirects: return + escalation');

for (const [nm, d] of [['escalation', esc], ['welcomeRouter', wel], ['callback', cb], ['faqLookup', faq]] as const) {
  assert(Object.values(d.nodes).every((n) => /^[0-9a-f-]{36}$/i.test(n.nodeId)), `${nm}: all node ids are UUIDs`);
}

// ── Terminal basic node → injected type:"terminate" node (regression: billingCallback/billingOutcome) ─
// A terminal basic node (.terminate()) must emit a dedicated type:"terminate" node that its edge points INTO —
// NOT a dangling no-nodeId edge (which ACXD canvas validation rejects as a disconnected node).
{
  const tf = flow('terminalTest', 'A flow whose basic node ends the session.');
  const start = tf.add(startNode());
  const msg = tf.add(basicNode({ name: 'Done', messages: ['All set, goodbye.'] }));
  start.exit('next').to(msg);
  msg.exit('next').terminate();
  const doc = tf.emit();
  const termNodes = Object.values(doc.nodes).filter((n) => n.type === 'terminate');
  assert(termNodes.length === 1, 'terminal basic node injects exactly one type:"terminate" node');
  assert(termNodes[0].childNodes.length === 0, 'the terminate node has empty childNodes (console-verified shape)');
  const basic = Object.values(doc.nodes).find((n) => n.metadata.name === 'Done')!;
  assert(basic.childNodes.length === 1 && basic.childNodes[0].nodeId === termNodes[0].nodeId,
    'the basic node edge points INTO the terminate node (no dangling edge)');
  assert(!basic.childNodes.some((c) => !c.nodeId), 'the basic node has no dangling (no-nodeId) edge');
}

// ── data_request JSON body (payload): flat + nested, and the URL-param / required-body pre-flight checks ─────
{
  const empty = dataRequestPayload(undefined);
  assert(empty.type === 'recursive' && Object.keys(empty.value).length === 0, 'no body -> empty recursive payload');
  const flat = dataRequestPayload({ accountNumber: '{accountNumber:NLX.AlphaNumeric}', pin: '{pin:NLX.AlphaNumeric}' });
  const fv = flat.value as Record<string, { type: string; value: unknown }>;
  assert(fv.pin.type === 'constant' && fv.pin.value === '{pin:NLX.AlphaNumeric}', 'flat body field -> constant operand with the token');
  const dr = dataRequestPayload({ loyaltyLevel: '{getPolicies.loyaltyLevel:NLX.Variable}', note: 'Level {getPolicies.loyaltyLevel:NLX.Variable}' });
  const dv = dr.value as Record<string, { type: string; name?: string; value?: unknown }>;
  assert(dv.loyaltyLevel.type === 'variable' && dv.loyaltyLevel.name === 'getPolicies.loyaltyLevel', 'lone data-request token -> typed variable operand');
  assert(dv.note.type === 'constant', 'data-request token inside text stays a constant');
  const nested = dataRequestPayload({ productLine: 'vehicle', customer: { type: '{customerType:NLX.Context}' }, lines: ['a', 'b'] });
  const nv = nested.value as Record<string, { type: string; value: unknown }>;
  assert(nv.customer.type === 'recursive', 'nested body object -> nested recursive operand');
  assert((nv.customer.value as Record<string, { value: unknown }>).type.value === '{customerType:NLX.Context}', 'nested member keeps its token');
  assert(nv.lines.type === 'json' && Array.isArray(nv.lines.value), 'body array -> json operand');

  const vocab = buildVocabulary([{ name: 'accountRef', schemaType: 'string' }], [], [
    { dataRequestId: 'billingVerify', url: '{billingApiUrl:NLX.Secret}/verify',
      requestSchema: { type: 'object', properties: { accountNumber: {}, pin: {} }, required: ['accountNumber', 'pin'] } },
    { dataRequestId: 'getPolicies', url: '{billingApiUrl:NLX.Secret}/getPolicies?accountRef={accountRef}' },
  ]);
  const node = (id: string, urlParams: Record<string, string>, body?: Record<string, unknown>) => ({
    type: 'data_request', metadata: { name: id },
    dataRequests: [{ dataRequestId: id, variableId: id, name: id, urlParams, payload: dataRequestPayload(body as never) }],
  });
  const run = (nodes: Record<string, unknown>) => {
    const slots = [{ name: 'accountNumber', type: 'NLX.AlphaNumeric' }, { name: 'pin', type: 'NLX.AlphaNumeric' }];
    try { validateFlowRefs('t', { nodes, slots } as never, vocab); return ''; } catch (e) { return String((e as Error).message); }
  };
  assert(run({ a: node('billingVerify', {}, { accountNumber: '{accountNumber:NLX.AlphaNumeric}', pin: '{pin:NLX.AlphaNumeric}' }) }).indexOf('required field') < 0,
    'body supplying every required requestSchema field passes check 17');
  assert(run({ a: node('billingVerify', {}, { accountNumber: '{accountNumber:NLX.AlphaNumeric}' }) }).includes('"pin", a required field'),
    'check 17 flags a required body field the node does not send');
  assert(run({ a: node('billingVerify', { pin: '{pin:NLX.AlphaNumeric}' }, { accountNumber: 'x', pin: 'y' }) }).includes('has no {pin} placeholder'),
    'check 16 flags a urlParams key with no URL placeholder');
  assert(run({ a: node('getPolicies', { accountRef: '{accountRef:NLX.Context}' }) }).indexOf('placeholder') < 0,
    'a urlParams key that matches a URL placeholder passes check 16');
}

// ── typed constants into number/boolean context vars (console-verified) ────────────────────────
{
  const vocab = buildVocabulary([{ name: 'authAttempts', schemaType: 'number' }, { name: 'isMember', schemaType: 'boolean' }], [], []);
  const mods = (value: unknown) => ({ seed: { type: 'basic', metadata: { name: 'Seed', stateModifications: [
    { type: 'context', name: 'authAttempts', modification: 'set', value: { type: 'constant', value } }] } } });
  const run = (nodes: Record<string, unknown>) => {
    try { validateFlowRefs('t', { nodes, slots: [] } as never, vocab); return ''; } catch (e) { return String((e as Error).message); }
  };
  assert(run(mods(0)).indexOf('STRING constant') < 0, 'a numeric constant into a number var passes check 8');
  const copy = (type: string) => ({ c: { type: 'basic', metadata: { name: 'Copy', stateModifications: [
    { type: 'context', name: 'authAttempts', modification: 'set', value: { type, name: 'verify.count' } }] } } });
  assert(run(copy('field')).includes('redaction wrapper'), 'check 19 flags a field-operand copy of a data-request field');
  assert(run(copy('variable')).indexOf('redaction wrapper') < 0, 'check 19 accepts a variable-operand copy');
  assert(run(mods('0')).includes('STRING constant'), 'a string constant into a number var fails check 8');
  const doc = buildFromSpec({ flowId: 'typedSet', aiDescription: 'Typed set test.', nodes: [
    { id: 'start', type: 'start', next: 'seed' },
    { id: 'seed', type: 'basic', name: 'Seed', set: [{ set: 'authAttempts', value: 0 }, { set: 'isMember', value: true }], next: 'done' },
    { id: 'done', type: 'terminate' },
  ] } as never);
  const seed = Object.values(doc.nodes as Record<string, { metadata: { name?: string; stateModifications?: Array<{ value?: { type?: string; value?: unknown } }> } }>)
    .find((n) => n.metadata.name === 'Seed')!;
  const sm = seed.metadata.stateModifications ?? [];
  assert(sm[0]?.value?.type === 'constant' && sm[0]?.value?.value === 0, 'FlowSpec { set, value: 0 } emits a numeric constant');
  assert(sm[1]?.value?.value === true, 'FlowSpec { set, value: true } emits a boolean constant');
}

if (failures > 0) { console.error(`\nFAILED: ${failures} assertion(s)`); process.exit(1); }
console.log('\nALL ROUND-TRIP ASSERTIONS PASSED');
