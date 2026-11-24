// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Deterministic tests for the path tracer and the cross-flow warnings (dead data, shared-tier Generative Journey).
// Uses a tiny inline flow set: entry -> (new: shared) | (member: auth -> member -> shared).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceScenario, listBranchInputs, checkScenario } from '../../tools/acxd-deploy-engine/lib/trace-flows';
import { checkFlowSetWarnings, callerTiers } from '../../tools/acxd-deploy-engine/lib/flowset-warnings';
import { checkFlowSet } from '../../tools/acxd-deploy-engine/lib/flowset-checks';
import { undefinedAnalyticsTags, validateFlowRefs, buildVocabulary } from '../../tools/acxd-deploy-engine/lib/validate-flow-refs';

const status = (v: string) => [{ left: { type: 'node_status' }, operator: 'eq', right: { type: 'constant', value: v } }];
const redirect = (id: string, to: string) =>
  ({ nodeId: id, type: 'redirect', childNodes: [], metadata: { name: `to ${to}`, redirect: { flowId: to, type: 'flow' } } });

const flows: Record<string, Record<string, unknown>> = {
  entry: { flowId: 'entry', nodes: {
    s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'c', conditions: [] }] },
    c: { nodeId: 'c', type: 'split', metadata: { name: 'Member?' }, childNodes: [
      { nodeId: 'ra', conditions: [{ left: { type: 'context', name: 'isMember' }, operator: 'eq', right: { type: 'constant', value: true } }] },
      { nodeId: 'rn', conditions: [] }] },
    ra: redirect('ra', 'gate'), rn: redirect('rn', 'shared') } },
  gate: { flowId: 'gate', nodes: {
    s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'v', conditions: [] }] },
    v: { nodeId: 'v', type: 'data_request', metadata: { name: 'Check gate' }, dataRequests: [{ dataRequestId: 'checkGate' }],
      childNodes: [{ conditions: status('in_progress') }, { nodeId: 'k', conditions: status('success') },
        { nodeId: 'e', conditions: status('timeout') }, { nodeId: 'e', conditions: status('failure') }] },
    k: { nodeId: 'k', type: 'split', metadata: { name: 'Passed?' }, childNodes: [
      { nodeId: 'm', conditions: [{ left: { type: 'variable', name: 'checkGate.verified' }, operator: 'eq', right: { type: 'constant', value: true } }] },
      { nodeId: 'e', conditions: [] }] },
    m: { nodeId: 'm', type: 'basic', metadata: { name: 'Mark passed', stateModifications: [
      { type: 'context', name: 'memberRef', modification: 'set', value: { type: 'variable', name: 'checkGate.memberRef' } }] },
      childNodes: [{ nodeId: 'r', conditions: [] }] },
    r: redirect('r', 'member'), e: { nodeId: 'e', type: 'escalate', childNodes: [] } } },
  member: { flowId: 'member', nodes: {
    s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'p', conditions: [] }] },
    p: { nodeId: 'p', type: 'data_request', metadata: { name: 'Get member data' }, dataRequests: [{ dataRequestId: 'memberData' }],
      childNodes: [{ conditions: status('in_progress') }, { nodeId: 'r', conditions: status('success') },
        { nodeId: 'r', conditions: status('timeout') }, { nodeId: 'r', conditions: status('failure') }] },
    r: redirect('r', 'shared') } },
  shared: { flowId: 'shared', nodes: {
    s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'g', conditions: [] }] },
    g: { nodeId: 'g', type: 'generative_journey', metadata: { name: 'Coverage shared', generativeJourney: {
      prompt: 'Help the caller. Account {memberRef:NLX.Context}.',
      tools: [{ type: 'knowledgeBase', knowledgeBaseId: '{generalKb}' }, { type: 'dataRequest', dataRequest: { dataRequestId: 'memberData' } }],
      exitConditions: [{ name: 'done', prompt: 'finished' }] } },
      childNodes: [{ nodeId: 't', conditions: status('done') }] },
    t: { nodeId: 't', type: 'terminate', childNodes: [] } } },
};
const set = Object.values(flows);
const opts = { authFlowId: 'gate', entryFlows: ['entry'] };

test('tracer: member customer reaches the shared with memberRef carried as context', () => {
  const t = traceScenario(flows as never, {
    name: 'member', entry: 'entry', context: { isMember: true },
    dataRequests: { checkGate: { response: { verified: true, memberRef: 'REF1' } }, memberData: { response: { itemCount: 2 } } },
  });
  assert.equal(t.end, 'terminate');
  assert.deepEqual(t.redirects.map((r) => r.to), ['gate', 'member', 'shared']);
  assert.equal(t.journeys[0].contextTokens[0].value, 'REF1');
  assert.equal(t.context.memberRef, 'REF1');
});

test('tracer: a failed gate check ends in escalation', () => {
  const t = traceScenario(flows as never, { entry: 'entry', context: { isMember: true }, dataRequests: { checkGate: { status: 'failure' } } });
  assert.equal(t.end, 'escalate');
});

test('tracer: a non-member reaches the shared with memberRef unset', () => {
  const t = traceScenario(flows as never, { entry: 'entry', context: { isMember: false } });
  assert.equal(t.journeys[0].contextTokens[0].value, undefined);
});

test('warnings: unread data-request fields are reported as dead data', () => {
  const w = checkFlowSetWarnings(set as never, { ...opts, dataRequestFields: { memberData: ['itemCount', 'hasExtra'], checkGate: ['verified', 'memberRef'] } });
  assert.ok(w.some((x) => x.includes('dead data') && x.includes('"member"') && x.includes('memberData')));
  assert.ok(!w.some((x) => x.includes('dead data') && x.includes('"gate"')));
});

test('warnings: shared-tier Generative Journey is reported and a privileged tool is flagged', () => {
  const tiers = callerTiers(set as never, opts);
  assert.deepEqual([...(tiers.get('shared') ?? [])].sort(), ['auth', 'unauth']);
  assert.deepEqual([...(tiers.get('member') ?? [])], ['auth']);
  const w = checkFlowSetWarnings(set as never, { ...opts, privilegedTools: ['memberData'] });
  const shared = w.find((x) => x.startsWith('shared-tier'));
  assert.ok(shared && shared.includes('PRIVILEGED TOOL(S) ATTACHED: memberData'));
});

test('findings: a shared-tier journey with only safe tools is not reported once privilegedTools is declared', () => {
  const w = checkFlowSetWarnings(set as never, { ...opts, privilegedTools: [] });
  assert.ok(!w.some((x) => x.startsWith('shared-tier')));
});

test('findings: a shared-tier journey with data-request tools needs privilegedTools declared', () => {
  const w = checkFlowSetWarnings(set as never, opts);
  assert.ok(w.some((x) => x.startsWith('shared-tier') && x.includes('does not declare "privilegedTools"')));
});

test('findings: unusedFields with a reason records intended unused fields; without a reason it is a finding', () => {
  const fields = { memberData: ['itemCount', 'hasExtra'], checkGate: ['verified', 'memberRef'] };
  const ok = checkFlowSetWarnings(set as never, { ...opts, privilegedTools: [], dataRequestFields: fields,
    unusedFields: { memberData: { fields: ['itemCount', 'hasExtra'], reason: 'echo of the request' } } });
  assert.ok(!ok.some((x) => x.includes('dead data') && x.includes('memberData')));
  const noReason = checkFlowSetWarnings(set as never, { ...opts, privilegedTools: [], dataRequestFields: fields,
    unusedFields: { memberData: { fields: ['itemCount'] } } as never });
  assert.ok(noReason.some((x) => x.startsWith('unusedFields: "memberData" needs')));
});

test('branch inputs: lists splits, journey exits and data-request fields read', () => {
  const bi = listBranchInputs(flows as never);
  const gate = bi.find((b) => b.flow === 'gate')!;
  assert.deepEqual(gate.dataRequests[0].fieldsRead.sort(), ['memberRef', 'verified']);
  const shared = bi.find((b) => b.flow === 'shared')!;
  assert.ok(shared.journeys[0].exits.includes('done'));
  assert.deepEqual(shared.journeys[0].tools, ['{generalKb}', 'memberData']);
  const entry = bi.find((b) => b.flow === 'entry')!;
  assert.equal(entry.splits[0].branches.length, 2);
});

test('warnings: externalReads silences dead state only when it names a reader', () => {
  const named = checkFlowSetWarnings(set as never, { ...opts, externalReads: [{ var: 'memberRef', readBy: 'agent desktop screen pop' }] });
  assert.ok(!named.some((x) => x.startsWith('dead state') && x.includes('"memberRef"')));
  const bare = checkFlowSetWarnings(set as never, { ...opts, externalReads: ['memberRef'] });
  assert.ok(bare.some((x) => x.startsWith('externalReads: "memberRef" does not name its reader')));
});

test('tracer: increment drives a retry counter to its limit', () => {
  const retry: Record<string, Record<string, unknown>> = {
    loop: { flowId: 'loop', nodes: {
      s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'b', conditions: [] }] },
      b: { nodeId: 'b', type: 'basic', metadata: { name: 'Bump', stateModifications: [
        { type: 'context', name: 'tries', modification: 'increment' }] }, childNodes: [{ nodeId: 'k', conditions: [] }] },
      k: { nodeId: 'k', type: 'split', metadata: { name: 'Done?' }, childNodes: [
        { nodeId: 'e', conditions: [{ left: { type: 'context', name: 'tries' }, operator: 'gte', right: { type: 'constant', value: 3 } }] },
        { nodeId: 'b', conditions: [] }] },
      e: { nodeId: 'e', type: 'escalate', childNodes: [] } } },
  };
  const t = traceScenario(retry as never, { entry: 'loop' });
  assert.equal(t.end, 'escalate');
  assert.equal(t.context.tries, 3);
});

test('tracer: a journey exit list is used one entry per visit', () => {
  const docs: Record<string, Record<string, unknown>> = {
    j: { flowId: 'j', nodes: {
      s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'g', conditions: [] }] },
      g: { nodeId: 'g', type: 'generative_journey', metadata: { name: 'Ask', generativeJourney: {
        exitConditions: [{ name: 'again', prompt: 'x' }, { name: 'done', prompt: 'y' }] } },
        childNodes: [
          { nodeId: 'g', conditions: [{ left: { type: 'system', name: 'System.gjConditionIndex' }, operator: 'eq', right: { type: 'constant', value: 0 } }] },
          { nodeId: 't', conditions: [{ left: { type: 'system', name: 'System.gjConditionIndex' }, operator: 'eq', right: { type: 'constant', value: 1 } }] }] },
      t: { nodeId: 't', type: 'terminate', childNodes: [] } } },
  };
  const t = traceScenario(docs as never, { entry: 'j', journeys: { Ask: ['again', 'done'] } });
  assert.equal(t.end, 'terminate');
  assert.equal(t.steps.filter((x) => x.node === 'Ask').length, 2);
});

test('analytics tags: a node tag not defined in analytics-tags.json is reported', () => {
  const f = { flowId: 'tagged', nodes: { n: { nodeId: 'n', type: 'basic', metadata: { name: 'Greeting', tags: [{ label: 'milestoneQuoteIntentCaptured' }, { label: 'milestoneQuotePriced' }] } } } };
  const u = undefinedAnalyticsTags(f as never, new Set(['milestoneQuotePriced']));
  assert.deepEqual(u, [{ node: 'Greeting', tag: 'milestoneQuoteIntentCaptured' }]);
});

test('findings: a Generative Text output that nothing shows is reported; showing it in a message clears it', () => {
  const gt = (msg: string) => ({ flowId: 'present', nodes: {
    s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'g', conditions: [] }] },
    g: { nodeId: 'g', type: 'generative_text', metadata: { name: 'Summary', generativeText: { name: 'summary', prompt: 'Summarise.' } }, childNodes: [{ nodeId: 'q', conditions: [] }] },
    q: { nodeId: 'q', type: 'basic', messages: [{ type: 'text', body: msg }], metadata: { name: 'Ask' }, childNodes: [] } } });
  const hidden = checkFlowSetWarnings([gt('Would you like to go ahead?')] as never, { privilegedTools: [] });
  assert.ok(hidden.some((x) => x.startsWith('unused Generative Text') && x.includes('"summary"')));
  const shown = checkFlowSetWarnings([gt('{summary:NLX.Local} Would you like to go ahead?')] as never, { privilegedTools: [] });
  assert.ok(!shown.some((x) => x.startsWith('unused Generative Text')));
});

test('slot tokens: a custom-type slot token must be attached and use the attached type', () => {
  const vocab = buildVocabulary([], [{ slotTypeId: 'productLineType' }, { slotTypeId: 'coverageTierType' }], []);
  const mk = (slots: Array<{ name: string; type: string }>, body: string) => ({ flowId: 'f', slots, nodes: {
    s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'm', conditions: [] }] },
    m: { nodeId: 'm', type: 'basic', messages: [{ type: 'text', body }], metadata: { name: 'Say' }, childNodes: [] } } });
  const err = (f: unknown) => { try { validateFlowRefs('f', f as never, vocab); return ''; } catch (e) { return (e as Error).message; } };
  assert.ok(/productLine/.test(err(mk([], 'You chose {productLine:productLineType}.'))), 'unattached custom slot is caught');
  assert.equal(err(mk([{ name: 'productLine', type: 'productLineType' }], 'You chose {productLine:productLineType}.')), '');
  assert.ok(/attached with type/.test(err(mk([{ name: 'productLine', type: 'productLineType' }], 'You chose {productLine:coverageTierType}.'))), 'wrong slot type in token is caught');
});

// One flow holding both the pre- and post-sign-in journey: sign-in is the node that sets authStatus.
const single = { flowId: 'main', nodes: {
  s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'greet', conditions: [] }] },
  greet: { nodeId: 'greet', type: 'generative_journey', metadata: { name: 'Greet', generativeJourney: {
    prompt: 'Greet.', tools: [{ type: 'dataRequest', dataRequest: { dataRequestId: 'getPolicies' } }], exitConditions: [] } },
    childNodes: [{ nodeId: 'early', conditions: [] }] },
  early: { nodeId: 'early', type: 'basic', metadata: { name: 'Early set', stateModifications: [
    { type: 'context', name: 'accountRef', modification: 'set', value: { type: 'constant', value: 'x' } }] },
    childNodes: [{ nodeId: 'mark', conditions: [] }] },
  mark: { nodeId: 'mark', type: 'basic', metadata: { name: 'Mark verified', stateModifications: [
    { type: 'context', name: 'authStatus', modification: 'set', value: { type: 'constant', value: 'verified' } },
    { type: 'context', name: 'accountRef', modification: 'set', value: { type: 'variable', name: 'verify.accountRef' } }] },
    childNodes: [{ nodeId: 'service', conditions: [] }] },
  service: { nodeId: 'service', type: 'generative_journey', metadata: { name: 'Signed-in service', generativeJourney: {
    prompt: 'Help.', tools: [{ type: 'dataRequest', dataRequest: { dataRequestId: 'getPolicies' } }], exitConditions: [] } },
    childNodes: [{ nodeId: 't', conditions: [] }] },
  t: { nodeId: 't', type: 'terminate', childNodes: [] } } };

test('single flow: identity var set before the sign-in node is caught; set on the sign-in node is fine', () => {
  const p = checkFlowSet([single] as never, { entryFlows: ['main'], identityVars: ['accountRef'], authFlagVar: 'authStatus' });
  assert.ok(p.some((x) => x.includes('node "Early set" sets identity var "accountRef" before sign-in')));
  assert.ok(!p.some((x) => x.includes('node "Mark verified"')));
});

test('single flow: a privileged tool on a journey reached before sign-in is caught; after sign-in it is fine', () => {
  const loop = JSON.parse(JSON.stringify(single));
  loop.nodes.service.childNodes = [{ nodeId: 'greet', conditions: [] }];   // greet now reachable before AND after sign-in
  const w = checkFlowSetWarnings([loop] as never, { entryFlows: ['main'], authFlagVar: 'authStatus', privilegedTools: ['getPolicies'] });
  assert.ok(w.some((x) => x.startsWith('shared-tier') && x.includes('"Greet"') && x.includes('PRIVILEGED TOOL')));
  assert.ok(!w.some((x) => x.startsWith('shared-tier') && x.includes('"Signed-in service"')));
});

// Split conversation (billingMain shape): Greeting -> state node -> Risk capture -> Coverage, with
// productLine captured twice. Both journeys pairs are findings; a recorded separateJourneys pair is not.
const gjNode = (id: string, name: string, next: string[], capture: string[] = []) => ({
  nodeId: id, type: 'generative_journey', childNodes: next.map((n) => ({ nodeId: n, conditions: [] })),
  metadata: { name, generativeJourney: { tools: [], dataCapture: { data: capture.map((c) => ({ name: c, type: 'slot', required: true })) } } } });
const splitFlow = { flowId: 'billingMain', nodes: {
  s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'g1', conditions: [] }] },
  g1: gjNode('g1', 'Greeting', ['m']),
  m: { nodeId: 'm', type: 'basic', childNodes: [{ nodeId: 'g2', conditions: [] }], metadata: { name: 'Mark new customer' } },
  g2: gjNode('g2', 'Risk capture', ['g3'], ['productLine', 'assetDetails']),
  g3: gjNode('g3', 'Coverage', ['t'], ['productLine', 'selectedTier']),
  t: { nodeId: 't', type: 'terminate', childNodes: [] } } };

test('split conversation: back-to-back journeys and a re-captured slot are findings', () => {
  const w = checkFlowSetWarnings([splitFlow] as never, {});
  assert.ok(w.some((x) => x.includes('"Risk capture" follows "Greeting" with only message or state-setting nodes')));
  assert.ok(w.some((x) => x.includes('"Coverage" follows "Risk capture"')));
  const kept = checkFlowSetWarnings([splitFlow] as never, { separateJourneys: [
    { journeys: ['Greeting', 'Risk capture'], reason: 'test' }, { journeys: ['Risk capture', 'Coverage'], reason: 'test' }] });
  assert.ok(!kept.some((x) => x.startsWith('split conversation')));
  const noReason = checkFlowSetWarnings([splitFlow] as never, { separateJourneys: [{ journeys: ['Greeting', 'Risk capture'] }] });
  assert.ok(noReason.some((x) => x.startsWith('separateJourneys:')));
});

test('thin journey prompt: a prompt missing required sections is a finding; a full one is not', () => {
  const gjFlow = (prompt: string) => ({ flowId: 'main', nodes: {
    s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'g', conditions: [] }] },
    g: { nodeId: 'g', type: 'generative_journey', childNodes: [{ nodeId: 't', conditions: [] }], metadata: { name: 'Journey', generativeJourney: { prompt, tools: [] } } },
    t: { nodeId: 't', type: 'terminate', childNodes: [] } } });
  const thin = checkFlowSetWarnings([gjFlow('You are Sam. Help the caller.')] as never, { privilegedTools: [] });
  assert.ok(thin.some((x) => x.startsWith('thin journey prompt') && x.includes('<use-case>') && x.includes('<exit>')));
  const full = '<use-case>u</use-case><persona>p</persona><previous-context>c</previous-context><task>t</task>' +
    '<data-to-capture>d</data-to-capture><tools>x</tools><rules>r</rules><exit>e</exit>';
  const ok = checkFlowSetWarnings([gjFlow(full)] as never, { privilegedTools: [] });
  assert.ok(!ok.some((x) => x.startsWith('thin journey prompt')));
});

test('scenario check: an unknown dataRequests key is rejected instead of defaulting to success', () => {
  assert.ok(checkScenario({ entry: 'x', dataRequests: { getX: { outcome: 'failure' } as never } }).some((p) => p.includes('unknown key "outcome"')));
  assert.ok(checkScenario({ entry: 'x', dataRequests: { getX: { status: 'failed' as never } } }).some((p) => p.includes('is not success')));
  assert.deepEqual(checkScenario({ entry: 'x', dataRequests: { getX: { status: 'failure' } } }), []);
});

test('journey data request: prompt reference needs the tool; a context copy read only in its own flow is a needless copy', () => {
  const vocab = buildVocabulary([{ name: 'balance', schemaType: 'string' }], [], [{ dataRequestId: 'getBalance' }]);
  const gj = (prompt: string, tools: unknown[]) => ({ nodeId: 'g', type: 'generative_journey', childNodes: [{ nodeId: 't', conditions: [] }],
    metadata: { name: 'Advisor', generativeJourney: { prompt, tools } } });
  const tool = { type: 'dataRequest', dataRequest: { type: 'custom', dataRequestId: 'getBalance' }, prompt: 'x' };
  const err = (f: unknown) => { try { validateFlowRefs('f', f as never, vocab); return ''; } catch (e) { return (e as Error).message; } };
  const flowOf = (nodes: Record<string, unknown>, id = 'f') => ({ flowId: id, nodes: { s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: Object.keys(nodes)[0], conditions: [] }] },
    ...nodes, t: { nodeId: 't', type: 'terminate', childNodes: [] } } });
  // prompt reference with the tool: valid
  assert.equal(err(flowOf({ g: gj('Balance {getBalance.balanceDue:NLX.Variable}.', [tool]) })), '');
  // prompt reference without the tool: check 24
  assert.ok(/not have it attached as a tool/.test(err(flowOf({ g: gj('Balance {getBalance.balanceDue:NLX.Variable}.', []) }))));
  // node -> copy into a context var read only in the same flow: needless copy
  const copy = flowOf({
    d: { nodeId: 'd', type: 'data_request', dataRequests: [{ dataRequestId: 'getBalance' }], childNodes: [{ nodeId: 'k', conditions: [] }], metadata: { name: 'Get balance' } },
    k: { nodeId: 'k', type: 'basic', childNodes: [{ nodeId: 'g', conditions: [] }], metadata: { name: 'Keep', stateModifications: [
      { type: 'context', name: 'balance', modification: 'set', value: { type: 'variable', name: 'getBalance.balanceDue' } }] } },
    g: gj('Balance {balance:NLX.Context}.', [tool]) });
  const w = checkFlowSetWarnings([copy] as never, { privilegedTools: [] });
  assert.ok(w.some((x) => x.startsWith('needless copy') && x.includes('"balance"')));
  // read in another flow: needed, no finding
  const other = flowOf({ m: { nodeId: 'm', type: 'basic', childNodes: [{ nodeId: 't', conditions: [] }], messages: [{ body: 'Balance {balance:NLX.Context}' }], metadata: {} } }, 'g2');
  const w2 = checkFlowSetWarnings([copy, other] as never, { privilegedTools: [] });
  assert.ok(!w2.some((x) => x.startsWith('needless copy')));
  // declared as read by Connect: no finding
  const w3 = checkFlowSetWarnings([copy] as never, { privilegedTools: [], externalReads: [{ var: 'balance', readBy: 'Connect' }] });
  assert.ok(!w3.some((x) => x.startsWith('needless copy')));
  // set on two nodes (one value from two branches): needed, no finding
  const merged = JSON.parse(JSON.stringify(copy));
  merged.nodes.k.metadata.stateModifications.push({ type: 'context', name: 'other', modification: 'set', value: { type: 'constant', value: 'x' } });
  merged.nodes.d2 = { nodeId: 'd2', type: 'basic', childNodes: [], metadata: { name: 'Default', stateModifications: [
    { type: 'context', name: 'balance', modification: 'set', value: { type: 'constant', value: '0' } }] } };
  assert.ok(!checkFlowSetWarnings([merged] as never, { privilegedTools: [] }).some((x) => x.includes('"balance"') && x.startsWith('needless copy')));
  // listing the var in identityVars does not exempt a same-flow copy
  const w4 = checkFlowSetWarnings([copy] as never, { privilegedTools: [], identityVars: ['balance'] });
  assert.ok(w4.some((x) => x.startsWith('needless copy')));
});


test('unbounded re-prompt: a no-match loop back to the choice needs a counter', () => {
  const choiceFlow = (counted: boolean) => ({ flowId: 'main', nodes: {
    s: { nodeId: 's', type: 'start', childNodes: [{ nodeId: 'c', conditions: [] }] },
    c: { nodeId: 'c', type: 'user_choice', metadata: { name: 'Outcome' }, childNodes: [
      { nodeId: 't', conditions: [{ left: { type: 'slot_value_id', name: 'o' }, operator: 'eq', right: { type: 'constant_id', value: 'oYes' } }] },
      { nodeId: 'r', conditions: [{ left: { type: 'slot', name: 'o' }, operator: 'not_exists' }] }] },
    r: { nodeId: 'r', type: 'basic', metadata: { name: 'Reprompt', stateModifications: counted
      ? [{ type: 'context', name: 'tries', modification: 'increment' }] : [] }, childNodes: [{ nodeId: 'c', conditions: [] }] },
    t: { nodeId: 't', type: 'terminate', childNodes: [] } } });
  assert.ok(checkFlowSetWarnings([choiceFlow(false)] as never, { privilegedTools: [] }).some((x) => x.startsWith('unbounded re-prompt') && x.includes('"Outcome"')));
  assert.ok(!checkFlowSetWarnings([choiceFlow(true)] as never, { privilegedTools: [] }).some((x) => x.startsWith('unbounded re-prompt')));
});
