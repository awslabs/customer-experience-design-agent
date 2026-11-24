// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Sanity check for the wired DSL authoring path (Step 2 of acxd-flow-build.md). Authors ONE real component
// flow (billingSignIn) via a component builder AND one bespoke flow via the node factories + FlowBuilder,
// emits both to flows/*.flow.json under a scratch dir, and asserts each is reference-clean (would pass the
// engine's validateFlowRefs). Proves the authoring-script mechanics the stage instructs, WITHOUT a full PoC.
// Run:  npx tsx flow-dsl/examples/authoring-sanity-check.ts   (from tools/acxd-deploy-engine/)

import { mkdirSync, writeFileSync } from 'node:fs';
import { buildAuthVerify } from '../components';
import { flow } from '../builder';
import { startNode, userChoice, dataRequest, generativeJourney, escalate, redirect, setContext } from '../nodes';
import { variableRef } from '../core';
import { buildVocabulary, validateFlowRefs } from '../../lib/validate-flow-refs';

const OUT = 'flow-dsl/examples/_out';
mkdirSync(OUT, { recursive: true });

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  X ${msg}`); failures++; } else { console.log(`  ok ${msg}`); }
}

// ── Path 1: component builder (the insurance billingSignIn — free-text identifier capture) ───────────────
const authDoc = buildAuthVerify({
  flowId: 'billingSignIn',
  aiDescription: 'Reusable identity verification: capture an identifier, verify it, retry up to a limit, then escalate.',
  identifierSlot: 'accountNumber',
  identifierSlotType: 'NLX.AlphaNumeric',
  verifyVariableId: 'xxVerifyIdentity',
  verifyUrlParams: { accountNumber: '{accountNumber:NLX.AlphaNumeric}' },
  verifiedField: 'customerName',
  captureFields: [{ contextVar: 'customerName', field: 'customerName' }],
  authenticatedContextVar: 'authStatus',
  attemptsContextVar: 'authAttempts',
  maxRetries: 3,
  capturePrompt: 'To access your account, what is your account number?',
  retryMessage: "That didn't match our records. Let's try again.",
  onVerified: { toFlowId: 'billingMain' },
  escalationFlowId: 'billingEscalation',
  identifierExamples: ['ACC-1001'],
});
writeFileSync(`${OUT}/billingSignIn.flow.json`, JSON.stringify(authDoc, null, 2));
console.log('Path 1 — component builder (billingSignIn, free-text capture):');
assert(authDoc.flowId === 'billingSignIn', 'emitted flowId');
assert(authDoc.slots.some((s) => s.name === 'accountNumber' && s.type === 'NLX.AlphaNumeric'), 'identifier captured into a free-text NLX.AlphaNumeric slot');

// ── Path 2: bespoke flow via node factories + FlowBuilder (a small billingMain) ───────────────────────────────
const f = flow('billingMain', 'Qualifies the enquiry and routes to the agentic servicing journey or a human.');
const start = f.add(startNode());
// Enumerated capture: productLine has values vehicle/home/contents — each per-value branch routes forward.
const choose = f.add(userChoice({
  name: 'Product line', slotName: 'productLine', slotType: 'xxProductLine',
  values: [{ value: 'vehicle' }, { value: 'home' }, { value: 'contents' }],
  elicit: 'Which product line can I help with?',
}));
const lookup = f.add(dataRequest({ name: 'Lookup customer', variableId: 'lookupCustomer',
  urlParams: { productLine: '{productLine:xxProductLine}' },
  stateMods: [setContext('customerTier', variableRef('lookupCustomer.tier'))] }));
const journey = f.add(generativeJourney({ name: 'Servicing', prompt: 'Help the customer with their quote. Take humanHandoff if they ask for a person.',
  exits: [{ name: 'humanHandoff', prompt: 'The customer asks to speak to a person.' }] }));
const human = f.add(escalate({ name: 'To an agent' }));
const done = f.add(redirect({ name: 'To pricing', toFlowId: 'billingPayment' }));
start.exit('next').to(choose);
// each captured product line proceeds to the lookup; no-match escalates.
choose.exit('vehicle').to(lookup);
choose.exit('home').to(lookup);
choose.exit('contents').to(lookup);
choose.exit('no-match').to(human);
lookup.exit('success').to(journey);
// in_progress left disconnected (builder auto-terminates it); timeout + failure are
// self-managed by ACXD (no retry loop) -> escalation.
lookup.exit('failure').to(human);
lookup.exit('timeout').to(human);
journey.exit('humanHandoff').to(human);
journey.exit('timeout').to(human);
journey.exit('failure').to(human);
const mainDoc = f.emit();
writeFileSync(`${OUT}/billingMain.flow.json`, JSON.stringify(mainDoc, null, 2));
console.log('Path 2 — bespoke FlowBuilder (billingMain):');
assert(mainDoc.slots.some((s) => s.name === 'productLine'), 'productLine slot auto-attached');
assert(Object.values(mainDoc.nodes).some((n) => n.type === 'generative_journey'), 'has the agentic journey');

// ── Reference-clean check: both flows pass validateFlowRefs against a representative resource vocabulary ─────
// buildVocabulary shapes: contextVars [{name, schemaType?}], slotTypes [{slotTypeId}], dataRequests [{dataRequestId}]
console.log('Reference validation (engine validateFlowRefs):');
const vocab = buildVocabulary(
  [{ name: 'authStatus' }, { name: 'authAttempts', schemaType: 'number' }, { name: 'customerName' },
   { name: 'customerId' }, { name: 'customerTier' },
   { name: 'escalationReason' }, { name: 'authResult' }],
  [{ slotTypeId: 'xxProductLine' }, { slotTypeId: 'NLX.AlphaNumeric' }],
  [{ dataRequestId: 'xxVerifyIdentity', url: '{billingApiUrl:NLX.Secret}/verifyIdentity?accountNumber={accountNumber}' },
   { dataRequestId: 'lookupCustomer', url: '{billingApiUrl:NLX.Secret}/lookupCustomer?productLine={productLine}' }],
);
for (const [nm, doc] of [['billingSignIn', authDoc], ['billingMain', mainDoc]] as const) {
  try { validateFlowRefs(doc.flowId, doc as unknown as Record<string, unknown>, vocab); assert(true, `${nm} is reference-clean`); }
  catch (e) { assert(false, `${nm}: ${(e as Error).message.split('\n')[0]}`); }
}

if (failures > 0) { console.error(`\nSANITY CHECK FAILED: ${failures}`); process.exit(1); }
console.log('\nSANITY CHECK PASSED — the wired DSL authoring path emits reference-clean flows.');
