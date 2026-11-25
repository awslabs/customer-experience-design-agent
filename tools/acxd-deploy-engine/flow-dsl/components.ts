// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: FLOW-DSL COMPONENT BUILDERS — parameterised whole-flow builders that assemble a verified component
// FlowDoc from the node factories. They replace the former component-pattern prose with typed builder signatures and
// are FULLY PARAMETERISED by construction —
// all domain wording (prompts, messages) is a CALLER-SUPPLIED argument, so a component builder cannot bake in
// use-case specifics ('quote'/'insurance'/'policy'). The builder guarantees the verified graph shape (bounded
// retries, escalation exit, slot attach, every edge wired); the caller supplies the domain text and flow ids.
//
// Each builder returns a FlowDoc ready for flows/<flowId>.flow.json. Assembled through the FlowBuilder, an
// unwired exit is a build-time error — a component can never ship a dangling edge. Verified against the
// deployed billingSignIn / billingEscalation console exports.

import { flow, type FlowDoc } from './builder';
import {
  startNode, basicNode, userChoice, dataRequest, split, redirect, escalate, define, terminateNode,
  setContext, clearSlot, increment, setNumber, generativeText, knowledgeBaseNode, type GenerativeModelType,
  type BodyValue,
} from './nodes';
import { variableRef, localRef, constant, slotRef, variableExistsCondition, ctxGteCondition } from './core';

// ── buildAuthVerify ─────────────────────────────────────────────────────────────────────────────────────────
// Reusable identity-verification component. Captures an identifier INTO A SLOT, calls a verify data request,
// and on failure retries up to maxRetries (clearing the slot each time) before escalating. FULLY PARAMETERISED.
// COLLECTION MODALITY: DETERMINISTIC ONLY. Factors are captured with sequential user_choice nodes. Use this
// builder when the approved design specifies deterministic capture. When the design specifies AGENTIC capture
// (a Generative Journey with dataCapture), author the flow bespoke with the node factories, keeping this same
// verify / retry / escalate structure (see acxd-agentic-and-prompting.md "Agentic auth capture").
// Matches the deployed billingSignIn export exactly:
//   start → Init attempts (define const 0 → set attempts) → capture (user_choice into slot)
//     · captured → verify (data_request)
//         · success → Verified? split { variable(verifyId.<verifiedField>) exists }
//               · verified → mark (set authenticated + captureFields) → redirect onVerified
//               · default  → Wrong details (increment attempts, clear slot) → Attempts exhausted? split
//                     · exhausted { attempts gte maxRetries } → escalate (via redirect to escalation flow)
//                     · default → back to capture
//         · in_progress → LEFT DISCONNECTED (async out of scope; builder auto-terminates it)
//         · timeout/failure → error message → escalation (self-managed by ACXD; NO flow-level retry)
//         · success → Verified? split; a wrong account/PIN is a success whose verify-check fails → retry
//     · no-match → re-prompt once WITHOUT using an attempt ("didn't catch that"); a second miss →
//       Capture failed (counts one attempt) → Attempts exhausted? split
export interface AuthVerifyParams {
  flowId: string;
  aiDescription: string;
  identifierSlot: string;                // slot the identifier is captured into (e.g. 'accountNumber')
  identifierSlotType: string;            // slot type id (e.g. 'NLX.AlphaNumeric')
  verifyVariableId: string;              // data request that verifies the identifier (e.g. 'xxVerifyIdentity')
  verifyUrlParams?: Record<string, string>;   // values substituted into {placeholders} in the verify URL
  verifyBody?: BodyValue;                    // JSON request body for the verify call (preferred for a PIN: keeps it out of the URL)
  verifyErrorMessage?: string;           // shown when the verify call fails/times out, before escalation. Default provided.
  verifiedField: string;                 // response field proving verification (e.g. 'customerName')
  captureFields: { contextVar: string; field: string }[];  // context vars set from verify output, ONLY after verification passes (on Mark verified)
  noMatchMessage?: string;               // re-prompt prefix when a factor isn't captured (default "Sorry, I didn't catch that.")
  captureFailedMessage?: string;         // shown when a factor is missed twice; counts one attempt
  authenticatedContextVar: string;       // string context var set to literal 'verified' on success (presence-safe flag)
  attemptsContextVar: string;            // number context var counting attempts
  maxRetries: number;                    // bounded-retry ceiling
  capturePrompt: string;                 // caller-supplied elicitation wording
  retryMessage: string;                  // caller-supplied "that didn't match, try again" wording
  onVerified: { toFlowId: string };      // where a verified caller forward-chains
  escalationFlowId: string;              // shared escalation flow to redirect to when exhausted/timeout
  identifierExamples?: string[];
  // Optional SECOND factor (2FA), e.g. a PIN or security number captured after the identifier and before
  // verify. When set, a second capture node is inserted (identifier -> secondFactor -> verify). Add the
  // second factor's token to the verify inputs yourself: `verifyBody` for a JSON-body verify call (preferred, e.g.
  // { accountNumber: '{accountNumber:NLX.AlphaNumeric}', pin: '{pin:NLX.AlphaNumeric}' }), or `verifyUrlParams`
  // when the verify URL carries {placeholders}. Omit all three for single-factor.
  secondFactorSlot?: string;             // slot the 2nd factor is captured into (e.g. 'pin')
  secondFactorSlotType?: string;         // slot type id (e.g. 'NLX.AlphaNumeric')
  secondFactorCapturePrompt?: string;    // elicitation wording for the 2nd factor
  secondFactorExamples?: string[];
}
export function buildAuthVerify(p: AuthVerifyParams): FlowDoc {
  // Captures a FREE-TEXT identifier (e.g. an account number into an NLX.AlphaNumeric slot). The identifier
  // userChoice omits `values`, so the factory emits the VERIFIED free-text shape (captured/no-match on the
  // populated slot name) — confirmed from the a test NLX.AlphaNumeric console export.
  const f = flow(p.flowId, p.aiDescription);

  const start = f.add(startNode());
  // Seed the attempts counter to 0 via a define-local (ACXD cannot set a literal number directly).
  const initEmit = setNumber(p.attemptsContextVar, 0);
  const initAttempts = f.add(define(initEmit.defineLocals[0].name, initEmit.defineLocals[0].value, {
    name: 'Init attempts', stateMods: initEmit.stateMods,
  }));
  const capture = f.add(userChoice({
    name: 'Capture identifier',
    slotName: p.identifierSlot,
    slotType: p.identifierSlotType,
    elicit: p.capturePrompt,
    examples: p.identifierExamples,
    sensitive: true,
  }));
  // Optional second factor (2FA): inserted between identifier capture and verify when configured.
  const secondCapture = p.secondFactorSlot
    ? f.add(userChoice({
        name: 'Capture second factor',
        slotName: p.secondFactorSlot,
        slotType: p.secondFactorSlotType ?? 'NLX.AlphaNumeric',
        elicit: p.secondFactorCapturePrompt ?? 'Please provide your PIN or security number.',
        examples: p.secondFactorExamples,
        sensitive: true,
      }))
    : null;
  // A missed capture is NOT a failed verification. First miss → one free re-prompt (no attempt
  // used, no "did not match our records" message). Second miss → Capture failed (counts one attempt). Bounded
  // without a new context variable.
  const noMatch = p.noMatchMessage ?? "Sorry, I didn't catch that.";
  const recapture = f.add(userChoice({
    name: 'Re-capture identifier',
    slotName: p.identifierSlot,
    slotType: p.identifierSlotType,
    elicit: `${noMatch} ${p.capturePrompt}`,
    examples: p.identifierExamples,
    sensitive: true,
  }));
  const secondRecapture = p.secondFactorSlot
    ? f.add(userChoice({
        name: 'Re-capture second factor',
        slotName: p.secondFactorSlot,
        slotType: p.secondFactorSlotType ?? 'NLX.AlphaNumeric',
        elicit: `${noMatch} ${p.secondFactorCapturePrompt ?? 'Please provide your PIN or security number.'}`,
        examples: p.secondFactorExamples,
        sensitive: true,
      }))
    : null;
  const verify = f.add(dataRequest({
    name: 'Verify identifier',
    variableId: p.verifyVariableId,
    urlParams: p.verifyUrlParams,
    body: p.verifyBody,
    // No stateMods here: setting captureFields on the data request stored account data before the
    // Verified? decision (even on a wrong PIN). They are set on 'Mark verified' instead.
  }));
  const verifiedSplit = f.add(split({
    name: 'Verified?',
    branches: [{ name: 'verified', condition: variableExistsCondition(`${p.verifyVariableId}.${p.verifiedField}`) }],
    withDefault: true,
  }));
  const markVerified = f.add(basicNode({
    name: 'Mark verified',
    // Set the auth flag to a LITERAL 'verified' string (authenticatedContextVar is schemaType:string, so
    // constant() is valid — no define-local needed). Do NOT set it from fieldRef(verifiedField): that would copy
    // the customer name into the flag (downstream `== "verified"` checks fail, and PII leaks into the flag).
    // verifiedField's ONLY job is the presence-check in the `Verified?` split above (variableExistsCondition).
    stateMods: [
      setContext(p.authenticatedContextVar, constant('verified')),
      // captureFields set ONLY after verification passes. The verify response is still in scope
      // here (same flow), so the read resolves. [CONSOLE-VERIFIED] Use variableRef (type:'variable'),
      // NOT fieldRef (type:'field'): a type:'field' read of a data-request output carries a redaction wrapper, so
      // the context var gets the literal token `<<<...||redact>>>` and every downstream request sends that, not
      // the real value. type:'variable' propagates the real value. (Flow Builder UI: tan = variable = correct;
      // purple = field = broken.)
      ...p.captureFields.map((c) => setContext(c.contextVar, variableRef(`${p.verifyVariableId}.${c.field}`))),
    ],
  }));
  const proceed = f.add(redirect({ name: 'Proceed (verified)', toFlowId: p.onVerified.toFlowId }));
  const wrongDetails = f.add(basicNode({
    name: 'Wrong details',
    messages: [p.retryMessage],
    stateMods: [increment(p.attemptsContextVar), clearSlot(p.identifierSlot),
      ...(p.secondFactorSlot ? [clearSlot(p.secondFactorSlot)] : [])],
  }));
  // timeout + failure are SELF-MANAGED by ACXD (console-verified: re-entering a failed/timed-out
  // data_request re-evaluates locally without re-calling the API, regardless of Always Retrigger). So there is
  // NO flow-level retry on them: both route to this brief error message, then straight to escalation. The only
  // auth retry is a wrong account/PIN — a `success` response whose Verified? check fails — looping back to
  // capture under the attempts limit. in_progress is left disconnected (the builder auto-terminates it).
  const authError = f.add(basicNode({
    name: 'Verification unavailable',
    messages: [p.verifyErrorMessage ?? "Sorry, we're unable to verify your details right now."],
    stateMods: [setContext('escalationReason', constant('systemUnavailable'))],
  }));
  const captureFailed = f.add(basicNode({
    name: 'Capture failed',
    messages: [p.captureFailedMessage ?? "Sorry, I still didn't catch that. Let's start again."],
    stateMods: [increment(p.attemptsContextVar), clearSlot(p.identifierSlot),
      ...(p.secondFactorSlot ? [clearSlot(p.secondFactorSlot)] : [])],
  }));
  const exhaustedSplit = f.add(split({
    name: 'Attempts exhausted?',
    branches: [{ name: 'exhausted', condition: ctxGteCondition(p.attemptsContextVar, p.maxRetries) }],
    withDefault: true,
  }));
  const escalateRedirect = f.add(redirect({
    name: 'To escalation',
    toFlowId: p.escalationFlowId,
    stateMods: [setContext('escalationReason', constant('authFailed'))],
  }));

  // Wire every exit.
  start.exit('next').to(initAttempts);
  initAttempts.exit('next').to(capture);
  const afterIdentifier = secondCapture ?? verify;
  capture.exit('captured').to(afterIdentifier);
  capture.exit('no-match').to(recapture);
  recapture.exit('captured').to(afterIdentifier);
  recapture.exit('no-match').to(captureFailed);
  if (secondCapture && secondRecapture) {
    secondCapture.exit('captured').to(verify);
    secondCapture.exit('no-match').to(secondRecapture);
    secondRecapture.exit('captured').to(verify);
    secondRecapture.exit('no-match').to(captureFailed);
  }
  verify.exit('success').to(verifiedSplit);
  // in_progress is NOT wired — left disconnected (builder auto-terminates it). timeout + failure
  // are self-managed control-plane errors (no retry loop) → error message → escalation.
  verify.exit('failure').to(authError);
  verify.exit('timeout').to(authError);
  authError.exit('next').to(escalateRedirect);
  verifiedSplit.exit('verified').to(markVerified);
  verifiedSplit.exit('default').to(wrongDetails);
  markVerified.exit('next').to(proceed);
  wrongDetails.exit('next').to(exhaustedSplit);
  captureFailed.exit('next').to(exhaustedSplit);
  exhaustedSplit.exit('exhausted').to(escalateRedirect);
  exhaustedSplit.exit('default').to(capture);
  // proceed + escalateRedirect are one-way redirects (continuation edge emitted internally).

  return f.emit();
}

// ── buildEscalation ─────────────────────────────────────────────────────────────────────────────────────────
// Reusable human-handoff component: optionally summarise the conversation into a handoff context var, then
// escalate. FULLY PARAMETERISED. Matches billingEscalation: generative_text → basic(set handoff) → escalate.
export interface EscalationParams {
  flowId: string;
  aiDescription: string;
  handoffSummaryContextVar?: string;
  summaryPrompt?: string;
  model?: GenerativeModelType;
  partingMessage?: string;
}
// ESCALATION FLOW = A SINK (critical loop-prevention rule): the escalation flow can ONLY ever exit by handing
// over to its Escalate node. It MUST NOT redirect to
// any other flow — not by an explicit redirect node, and not implicitly (it is never the Fallback/Unknown flow
// and never has Routing enabled). EVERY exit here, including every error/exception exit (timeout/failure), routes
// to the final Escalate node. Keeping the no-unconnected-exit rule, there are no dangling exits in this flow.
export function buildEscalation(p: EscalationParams): FlowDoc {
  const f = flow(p.flowId, p.aiDescription);
  const start = f.add(startNode());
  const human = f.add(escalate({ name: 'Escalate to a human agent' }));

  if (p.handoffSummaryContextVar && p.summaryPrompt) {
    const summarise = f.add(generativeText({
      name: 'Summarise for agent',
      producesLocal: 'escalationSummary',
      prompt: p.summaryPrompt,
      model: p.model ?? 'anthropic.claude-haiku-5-5',
    }));
    const store = f.add(basicNode({
      name: 'Transfer message',
      messages: p.partingMessage ? [p.partingMessage] : [],
      stateMods: [setContext(p.handoffSummaryContextVar, localRef(summarise.producesLocal))],
    }));
    start.exit('next').to(summarise);
    summarise.exit('success').to(store);
    // escalation-sink rule: even the summary's timeout/failure route to the handoff (which IS the
    // escalation node here) — never out of the flow. Hand off even if the summary didn't complete.
    summarise.exit('timeout').to(store);
    summarise.exit('failure').to(store);
    store.exit('next').to(human);
  } else {
    const parting = p.partingMessage
      ? f.add(basicNode({ name: 'Parting message', messages: [p.partingMessage] }))
      : null;
    if (parting) { start.exit('next').to(parting); parting.exit('next').to(human); }
    else { start.exit('next').to(human); }
  }
  return f.emit();
}

// ── buildWelcomeRouter ──────────────────────────────────────────────────────────────────────────────────────
// Reusable greeting + intent-routing entry component: greet, present an intent choice (captured INTO A SLOT),
// then a DOWNSTREAM split routes on the captured value to a one-way redirect per intent. FULLY PARAMETERISED.
// (No per-value branches on the choice node — routing is a split on the captured slot, matching the wire model.)
export interface WelcomeRouterParams {
  flowId: string;
  aiDescription: string;
  greeting: string;
  intentSlot: string;
  intentSlotType: string;
  routes: { value: string; toFlowId: string }[];   // captured value → target flow
  noMatchToFlowId: string;                          // unrecognised/absent intent → usually the agentic main flow
  choosePrompt: string;
}
export function buildWelcomeRouter(p: WelcomeRouterParams): FlowDoc {
  const f = flow(p.flowId, p.aiDescription);
  const start = f.add(startNode());
  const greet = f.add(basicNode({ name: 'Greeting', messages: [p.greeting] }));
  // Enumerated capture: the intent slot's values ARE the routes. Each per-value exit routes straight to that
  // intent's flow (the value branch IS the routing — no downstream split needed). no-match → the fallback flow.
  const choose = f.add(userChoice({
    name: 'Choose intent',
    slotName: p.intentSlot,
    slotType: p.intentSlotType,
    values: p.routes.map((r) => ({ value: r.value })),
    elicit: p.choosePrompt,
  }));
  start.exit('next').to(greet);
  greet.exit('next').to(choose);
  for (const r of p.routes) {
    const target = f.add(redirect({ name: `Route: ${r.value}`, toFlowId: r.toFlowId }));
    choose.exit(r.value).to(target);
  }
  const noMatch = f.add(redirect({ name: 'No match', toFlowId: p.noMatchToFlowId }));
  choose.exit('no-match').to(noMatch);
  return f.emit();
}

// ── buildCallback ───────────────────────────────────────────────────────────────────────────────────────────
// Reusable "schedule a callback" component: capture a callback window INTO A SLOT, record it via a data request,
// confirm, then REDIRECT to a caller-supplied return flow (one-way; no terminal node exists). FULLY PARAMETERISED.
// RESOURCE PREREQUISITE: this builder emits a data_request node bound to `recordVariableId` — that data request
// (plus the `windowSlotType` slot type) MUST already be authored in resources/ (context-vars/slot-types/
// data-requests JSON) before the flow is created, or flow creation fails the reference check. Author the
// resources first, then pass their ids here. Same applies to any builder that names a data request or slot type.
// buildCallback is a TERMINAL SINK: it captures a callback request and ends via ONE sanctioned exit — it never
// redirects onward to a service flow. Two exit modes (see "Terminal sink flows" in the flow-design knowledge):
//   • 'nativeEscalate' — VOICE: capture the number into a context var, then ESCALATE. The Connect contact flow
//     downstream of the Agentic CX block runs Set-Customer-Callback-Number → Transfer-to-Queue(Callback), i.e.
//     Connect's native queued callback. No external infra. (Native callback is telephony-only — voice channel.)
//   • 'externalRecord' — ANY CHANNEL (incl. chat) and required for a scheduled window or a trackable list:
//     a data_request writes the callback request to an external system, then the flow TERMINATEs.
// An acknowledge-only callback (a "we'll call you back" message that neither escalates nor records) is NOT a
// valid sink and is not expressible here — a mode must be chosen.
export type CallbackExitMode = 'nativeEscalate' | 'externalRecord';

interface CallbackCommon {
  flowId: string;
  aiDescription: string;
  numberSlot: string;                        // slot capturing the callback phone number (free-text, e.g. NLX.AlphaNumeric)
  choosePrompt: string;                      // eliciting message for the number
  confirmMessage: string;                    // confirmation shown before the single exit
  captureFailMessage?: string;               // optional message before escalating on repeated capture failure
}
export interface CallbackNativeParams extends CallbackCommon {
  exitMode: 'nativeEscalate';
  numberContextVar: string;                  // context var the captured number is promoted to (read by the Connect flow)
  reasonContextVar: string;                  // context var set to distinguish the hand-off reason for the Connect flow:
                                             //   'nativeCallback' (number captured — run Transfer-to-Queue callback) vs
                                             //   'captureFailed' (no number — route to a normal agent queue)
}
export interface CallbackExternalParams extends CallbackCommon {
  exitMode: 'externalRecord';
  recordVariableId: string;                  // data request that records the callback to the external system
  recordUrlParams?: Record<string, string>;  // values for {placeholders} in the record URL
  recordBody?: BodyValue;                    // JSON request body for the record call (preferred for a POST write)
}
export type CallbackParams = CallbackNativeParams | CallbackExternalParams;
export function buildCallback(p: CallbackParams): FlowDoc {
  // Fail loudly on a missing/invalid exitMode (e.g. an old-shape spec authored before the sink rework). Without
  // this, an undefined exitMode would silently fall into the externalRecord branch and fail obscurely on a
  // missing recordVariableId. (buildComponent casts params via `as never`, so TS does not catch the mismatch.)
  if (p.exitMode !== 'nativeEscalate' && p.exitMode !== 'externalRecord') {
    throw new Error(
      `buildCallback: exitMode must be 'nativeEscalate' or 'externalRecord' (got ${JSON.stringify((p as { exitMode?: unknown }).exitMode)}). ` +
      `A callback flow is a terminal sink that must fulfil the callback — see FLOWSPEC.md callback params.`,
    );
  }
  if (p.exitMode === 'nativeEscalate' && (!p.numberContextVar || !p.reasonContextVar)) {
    throw new Error(`buildCallback nativeEscalate: numberContextVar and reasonContextVar are both required.`);
  }
  if (p.exitMode === 'externalRecord' && !p.recordVariableId) {
    throw new Error(`buildCallback externalRecord: recordVariableId is required.`);
  }
  const f = flow(p.flowId, p.aiDescription);
  const start = f.add(startNode());
  // A sink converges on escalate/terminate and NEVER redirects onward (same contract as buildEscalation).
  // Capture failure escalates to a human rather than redirecting to another flow.
  const human = f.add(escalate({ name: 'To a human agent' }));

  // Capture the callback NUMBER (free-text slot). captured → proceed; no-match → human fallback.
  const capture = f.add(userChoice({
    name: 'Capture callback number',
    slotName: p.numberSlot,
    slotType: 'NLX.AlphaNumeric',
    elicit: p.choosePrompt,
    sensitive: true,
  }));
  start.exit('next').to(capture);

  if (p.exitMode === 'nativeEscalate') {
    // VOICE native queued callback: promote the number to a context var, confirm, then ESCALATE.
    // The Connect flow downstream of the Agentic CX block performs the Transfer-to-Queue(callback).
    const confirm = f.add(basicNode({
      name: 'Confirm callback',
      messages: [p.confirmMessage],
      stateMods: [
        setContext(p.numberContextVar, slotRef(p.numberSlot)),
        setContext(p.reasonContextVar, constant('nativeCallback')),
      ],
    }));
    const captureFailed = f.add(basicNode({
      name: 'Capture failed',
      messages: p.captureFailMessage ? [p.captureFailMessage] : [],
      stateMods: [setContext(p.reasonContextVar, constant('captureFailed'))],
    }));
    // Both paths converge on the SINGLE escalate node (one sanctioned sink exit). The Connect flow downstream of
    // the Agentic CX block branches on reasonContextVar: 'nativeCallback' → Transfer-to-Queue(callback) using
    // numberContextVar; 'captureFailed' → a normal agent queue (no number to dial).
    capture.exit('captured').to(confirm);
    capture.exit('no-match').to(captureFailed);
    confirm.exit('next').to(human);
    captureFailed.exit('next').to(human);
  } else {
    // ANY-CHANNEL external record: write the callback request to the external system, confirm, then TERMINATE.
    const record = f.add(dataRequest({
      name: 'Record callback',
      variableId: p.recordVariableId,
      urlParams: p.recordUrlParams,
      body: p.recordBody,
    }));
    const confirm = f.add(basicNode({ name: 'Confirm callback', messages: [p.confirmMessage] }));
    const done = f.add(terminateNode({ name: '' }));
    capture.exit('captured').to(record);
    capture.exit('no-match').to(human);
    record.exit('success').to(confirm);
    // in_progress left disconnected (builder auto-terminates it). timeout + failure are
    // self-managed by ACXD (no flow-level retry) → human fallback.
    record.exit('timeout').to(human);
    record.exit('failure').to(human);
    confirm.exit('next').to(done);
  }
  return f.emit();
}

// ── buildFaqLookup ──────────────────────────────────────────────────────────────────────────────────────────
// Reusable knowledge-base Q&A component: answer a question from a KB, then REDIRECT to a caller-supplied return
// flow (one-way). FULLY PARAMETERISED. Uses the dedicated knowledge_base node.
export interface FaqLookupParams {
  flowId: string;
  aiDescription: string;
  kbName: string;
  question?: string;
  noAnswerMessage?: string;
  returnToFlowId: string;                    // where the flow forward-chains after answering (one-way)
  escalationFlowId: string;                  // KB timeout/failure (self-managed error mode) redirect here
}
export function buildFaqLookup(p: FaqLookupParams): FlowDoc {
  const f = flow(p.flowId, p.aiDescription);
  const start = f.add(startNode());
  const lookup = f.add(knowledgeBaseNode({
    name: 'KB lookup',
    kbName: p.kbName,
    question: p.question,
  }));
  const done = f.add(redirect({ name: 'Return', toFlowId: p.returnToFlowId }));
  // no_match = a business negative (no answer found), NOT an error: give the no-answer message, then return.
  const noAnswer = f.add(basicNode({
    name: 'No answer',
    messages: [p.noAnswerMessage ?? "I couldn't find an answer to that."],
  }));
  // timeout + failure = the single self-managed error mode → error message → escalation
  // (generalised node-reference rule). No flow-level retry around them.
  const kbError = f.add(basicNode({
    name: 'Lookup unavailable',
    messages: ["Sorry, I'm unable to look that up right now."],
    stateMods: [setContext('escalationReason', constant('systemUnavailable'))],
  }));
  const toEsc = f.add(redirect({ name: 'To escalation', toFlowId: p.escalationFlowId }));

  start.exit('next').to(lookup);
  lookup.exit('match').to(done);
  lookup.exit('no_match').to(noAnswer);
  noAnswer.exit('next').to(done);
  lookup.exit('timeout').to(kbError);
  lookup.exit('failure').to(kbError);
  kbError.exit('next').to(toEsc);
  return f.emit();
}
