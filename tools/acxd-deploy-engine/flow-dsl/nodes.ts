// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// LAYER: FLOW-DSL FACTORIES — typed node factories. Each returns a NodeResult { node, exits }; exits are
// DERIVED from config so they cannot desync from the wired edges. Every factory emits the verified CONSOLE
// wire shape and encapsulates the platform traps so the author never meets them.
//
// Verified against deployed ACXD console exports (billingSignIn, billingMain, billingAccount, billingNew,
// billingPayment, billingEscalation). NO 'user_input' capture node exists (capture is a user_choice into a slot).
// A 'terminate' node (Exit Application) exists in the GA wire format (see terminateNode() below). [CONSOLE-VERIFIED]
// Flows terminate three ways: terminate (clean end) / redirect (to another flow) / escalate (to a human / Amazon Connect).

import {
  type FlowNode, type FlowMessage, type StateModification, type Operand, type ValueRef,
  type NodeResult, type NodeDataRequest, type Condition, ExitHandle, makeNodeResult, uuid,
  valueCondition, slotNotExistsNamed, slotExistsNamed, deriveValueId, localRef, statusCondition, gjIndexCondition, makeMessage,
} from './core';

// ── state-mod setters ───────────────────────────────────────────────────────────────────────────────────
// setBoolean / setNumber auto-emit the define-node-local pattern: ACXD has no "set a literal boolean/number"
// operand (a constant-into-number/boolean state-mod is rejected). The author writes setBoolean('flag', true);
// the factory hides the define local + {type:local} state-mod. The rejected shape is unreachable.

export interface SetterEmission { stateMods: StateModification[]; defineLocals: DefineLocal[]; }
export interface DefineLocal { name: string; value: Operand; }

/** set a context var from a TYPED ref (context/local/slot/field/variable) — never a raw literal. */
export function setContext(name: string, ref: ValueRef): StateModification {
  return { type: 'context', name, modification: 'set', value: ref };
}
export function clearContext(name: string): StateModification {
  return { type: 'context', name, modification: 'clear' };
}
export function clearSlot(name: string): StateModification {
  return { type: 'slot', name, modification: 'clear' };
}
export function increment(name: string): StateModification {
  return { type: 'context', name, modification: 'increment' };
}
export function decrement(name: string): StateModification {
  return { type: 'context', name, modification: 'decrement' };
}

/**
 * Set a number/boolean context var from a LITERAL. Returns BOTH the define-local to add to the flow AND the
 * state-mod that reads it — ACXD cannot set a literal number/boolean directly. The FlowBuilder collects the
 * define locals into a `define` node placed before the setting node.
 */
export function setLiteral(name: string, literal: number | boolean): SetterEmission {
  const localName = `const_${name}`;
  return {
    defineLocals: [{ name: localName, value: { type: 'constant', value: literal } }],
    stateMods: [{ type: 'context', name, modification: 'set', value: localRef(localName) }],
  };
}
export const setBoolean = (name: string, v: boolean): SetterEmission => setLiteral(name, v);
export const setNumber = (name: string, v: number): SetterEmission => setLiteral(name, v);

// ── start ─────────────────────────────────────────────────────────────────────────────────────────────────
export function startNode(): NodeResult {
  const node: FlowNode = {
    nodeId: uuid(), type: 'start', childNodes: [], messages: [], modalities: {},
    metadata: { name: 'Start', stateModifications: [] },
  };
  return makeNodeResult(node, [new ExitHandle('next', 'unconditional', [])]);
}

// ── basic (message + optional state modifications) ──────────────────────────────────────────────────────────
export interface BasicOpts {
  name?: string;
  messages?: string[];
  stateMods?: StateModification[];
  // Optional analytics tags → metadata.tags:[{label}]. Author bare strings (["milestoneAuthVerified"]);
  // {label} objects are also accepted and normalized (defensive — same contract as generativeJourney).
  tags?: Array<string | { label: string }>;
}
export function basicNode(opts: BasicOpts = {}): NodeResult {
  const node: FlowNode = {
    nodeId: uuid(), type: 'basic', childNodes: [], modalities: {},
    messages: (opts.messages ?? []).map((body): FlowMessage => makeMessage(body)),
    metadata: {
      name: opts.name,
      stateModifications: opts.stateMods ?? [],
      ...(opts.tags && opts.tags.length
        ? { tags: opts.tags.map((t) => (typeof t === 'string' ? { label: t } : { label: t.label })) }
        : {}),
    },
  };
  return makeNodeResult(node, [new ExitHandle('next', 'unconditional', [])]);
}

// ── define (declare a local; used by setBoolean/setNumber and to seed number/boolean context vars) ──────────
export function define(name: string, value: Operand, opts: { name?: string; stateMods?: StateModification[] } = {}): NodeResult {
  if (!LEGAL_VARIABLE_NAME.test(name)) {
    throw new Error(`define: local name "${name}" is not a legal variable name — use camelCase, e.g. "${toVariableName(name)}"`);
  }
  const node: FlowNode = {
    nodeId: uuid(), type: 'define', childNodes: [], messages: [], modalities: {},
    metadata: { name: opts.name ?? `Define ${name}`, define: { name, value }, stateModifications: opts.stateMods ?? [] },
  };
  return makeNodeResult(node, [new ExitHandle('next', 'unconditional', [])]);
}

// ── user_choice — CAPTURE into a slot (the verified wire model) ─────────────────────────────────────────────
// The console wire format captures a value by a user_choice node with source:'slot', showChoices:false, and
// TWO child edges: { slot exists } → forward (name ""), { slot not_exists } → retry (name "no-match"). There
// are NO per-value slot_value_id branches in the wire format — value routing is a DOWNSTREAM split on a
// context var (set from the captured slot or a data-request field). Exits: 'captured' + 'no-match'.
// Value routing is NEVER per-value branches on this node — capture the value, then branch on it DOWNSTREAM
// with a split() on a context var set from the captured slot. showChoices is always false (voice capture).
export interface UserChoiceResult extends NodeResult {
  /** the slot this node captures into — the FlowBuilder adds it to the flow's slots[] (auto-attach). */
  attachSlot: { name: string; type: string; examples?: string[]; sensitive?: boolean };
}
export interface ChoiceValue { value: string; }
export interface UserChoiceOpts {
  name?: string;
  slotName: string;                 // in-flow attached slot NAME (bare camelCase) — becomes choice.slotId
  slotType: string;                 // slot type id: custom (bare, e.g. xxProductLine) or built-in (NLX.AlphaNumeric)
  values?: ChoiceValue[];           // ENUMERATED slot: one per-value branch is emitted. OMIT for free-text
                                    // (e.g. NLX.AlphaNumeric) capture → a captured/no-match exists pair instead.
  elicit: string;                   // REQUIRED: the message asking for the value (ACXD rejects a user_choice with no message)
  examples?: string[];              // slot examples for slots[]
  sensitive?: boolean;              // slot sensitivity for slots[]
}
// VERIFIED (console unbound-vs-bound export diff): a User Choice node capturing an ENUMERATED
// custom slot MUST bind its "Options"/placeholder — in the wire format that is choice.slotId = the slot name
// (+ selectedChoiceLabel = the slot name). A blank slotId is the UNBOUND state and triggers the console
// warning "This node's resolved placeholder must be filled in." The node routes with ONE childNode per slot
// value: { slot_value_id(slotName) eq constant_id(<valueId>) } where valueId = deriveValueId(slotType, value),
// PLUS a final no-match edge { slot(slotName) not_exists }. All names are the REAL slot name (populated).
// FREE-TEXT case (VERIFIED, a test NLX.AlphaNumeric console export): OMIT `values`.
// The node then routes with EXACTLY TWO edges on the populated slot name — { slot(slotName) exists } (the
// 'captured' forward exit) + { slot(slotName) not_exists } (the 'no-match' exit) — no per-value branches
// (a free-text slot has no enumerated values). slotId/selectedChoiceLabel binding is identical to enumerated.
export function userChoice(opts: UserChoiceOpts): UserChoiceResult {
  if (!opts.elicit || !opts.elicit.trim()) {
    throw new Error(`user_choice "${opts.name ?? opts.slotName}" needs an elicit message: ACXD requires at least one message on every user_choice`);
  }
  if (opts.values?.length && opts.slotType.startsWith('NLX.')) {
    throw new Error(`user_choice "${opts.name ?? opts.slotName}" lists values but its slot type ${opts.slotType} is built in and has none: ` +
      'create a custom slot type with these values and use it for the slot');
  }
  const messages: FlowMessage[] = [makeMessage(opts.elicit)];
  const node: FlowNode = {
    nodeId: uuid(), type: 'user_choice', childNodes: [], modalities: {}, messages,
    metadata: {
      name: opts.name,
      stateModifications: [],
      choice: {
        showChoices: false,                       // VERIFIED: deployed captures use showChoices:false (voice).
        choiceDisplayFormat: 'dropdown',
        associatedSlotIds: [],
        idField: '',
        labelField: '',
        source: 'slot',                           // VERIFIED wire field (NOT slotType/slotTypeId).
        slotId: opts.slotName,                    // VERIFIED: the "Options" binding — populated slot name.
        selectedChoiceLabel: opts.slotName,       // VERIFIED: mirrors slotId on a bound node.
      },
    },
  };
  // Exits — two verified shapes:
  //  • ENUMERATED (values given): one 'value' handle per value (slot_value_id/constant_id branch) + 'no-match'.
  //  • FREE-TEXT (no values): a 'captured' handle ({slot exists}) + 'no-match' ({slot not_exists}).
  // All conditions use the populated slot name. The handles are the routing anchors — wire each downstream.
  const exits: ExitHandle[] = [];
  if (opts.values && opts.values.length) {
    for (const v of opts.values) {
      exits.push(new ExitHandle(v.value, 'value', [valueCondition(opts.slotName, deriveValueId(opts.slotType, v.value))]));
    }
  } else {
    exits.push(new ExitHandle('captured', 'status', [slotExistsNamed(opts.slotName)]));
  }
  exits.push(new ExitHandle('no-match', 'status', [slotNotExistsNamed(opts.slotName)]));
  const result = makeNodeResult(node, exits) as UserChoiceResult;
  result.attachSlot = { name: opts.slotName, type: opts.slotType, examples: opts.examples, sensitive: opts.sensitive };
  return result;
}

// ── generative_journey — the FLAGSHIP exit-handle case ──────────────────────────────────────────────────────
// A Generative Journey carries author-defined named exits declared IN THE PROMPT TEXT. The wire format wires them
// POSITIONALLY: childNode { System.gjConditionIndex eq <index> } where index is the 0-based order the exit
// is declared in `exitNames`, PLUS node_status timeout + failure edges. The factory returns one handle per
// named exit (by name) + 'timeout' + 'failure'. Because the handles ARE the declared exits wired by index,
// a named exit can never dangle or desync. TOOLS (KB + data requests) attach via the `tools` param below,
// emitting metadata.generativeJourney.tools[] — the ONLY mechanism that lets the Generative Journey query a KB or call a
// data request at runtime (prose alone cannot; the model only has ASSIGNED tools). [CONSOLE-VERIFIED]
export type GenerativeModelType =
  | 'amazon-nova-micro' | 'amazon-nova-2-lite'
  | 'anthropic.claude-haiku-4-5' | 'anthropic.claude-sonnet-5';

export interface GenerativeJourneyExit {
  name?: string;                    // optional label; the wire shape keeps name:"" and routes by index
  prompt: string;                   // natural-language exit criterion shown on the Generative Journey node exit point
}
export interface GenerativeJourneyDataCapture {
  slotName: string;                 // slot to capture (must also be in the flow's slots[])
  required?: boolean;               // default true
}
export interface GenerativeJourneyOpts {
  name?: string;
  prompt: string;                   // ROLE/CONTEXT/ACTIONS/STYLE; also references any KB by prose
  // Named natural-language exits. ORDERED — index here IS the System.gjConditionIndex wired on each edge.
  // [CONSOLE-VERIFIED] each becomes metadata.generativeJourney.exitConditions[i] = {name,prompt}.
  exits?: GenerativeJourneyExit[];
  // Optional deterministic data-capture. When set, emits metadata.generativeJourney.dataCapture
  // {data:[{required,type:'slot',name}], exitEnabled:true} AND a { node_status eq 'data_captured' } exit
  // (the "Exit when complete" switch — the deterministic capture-complete exit). CONSOLE-VERIFIED.
  dataCapture?: GenerativeJourneyDataCapture[];
  // LLM params (console defaults shown). CONSOLE-VERIFIED.
  model?: string;                   // default 'anthropic.claude-sonnet-5'
  maxTokens?: number;               // default 8192
  maxSteps?: number;                // default 10
  temperature?: number;             // default 0.7
  enableZeroTurnMode?: boolean;     // default false
  // Optional analytics tags → metadata.tags:[{label}].
  tags?: Array<string | { label: string }>;
  // Optional TOOLS the Generative Journey can call at runtime — knowledge bases + data requests. Emits
  // metadata.generativeJourney.tools[] in the VERIFIED wire shape. ORDER MATTERS: the array order is the
  // tool selection priority (the ACXD UI's up/down position), so attach in DESCENDING relevance×clarity —
  // sharpest, most-relevant first. See the Generative Journey tool-attachment RULE SET below. [CONSOLE-VERIFIED]
  tools?: GenerativeJourneyTool[];
  // DEPRECATED alias for `exits` names-only (back-compat): treated as exits with empty prompt. Prefer `exits`.
  exitNames?: string[];
}

// Generative Journey tools — two verified kinds. Each carries a mandatory `prompt`: a one-line usage hint (when to call, what
// it returns, what to do on no-answer). An empty prompt DEPLOYS but is discouraged (the model then selects on
// id alone). [CONSOLE-VERIFIED from reference flows; per-tool prompt guidance per NEURA]
//
// ── Generative Journey TOOL-ATTACHMENT RULE SET (apply when deciding what to attach; authoring/flow-design enforces it) ──
//  1. CAPS (soft guardrails): data-request tools ≤ 6 per Generative Journey (aim 4–6); knowledge bases ≤ 2 (aim 1–2).
//     Beyond the cap, attach ONLY the top-ranked resources by relevance×description-clarity.
//  2. DESCRIPTION-QUALITY GATE (per tool, before attaching): attach only if BOTH (a) plausibly relevant to
//     off-script/divergent user queries this Generative Journey could field, AND (b) its description (this `prompt` + the
//     data-request/KB description) is sharp/unambiguous enough the model won't misfire. Low-relevance OR
//     low-description-accuracy tools are NOT attached.
//  3. ORDER-AWARE PLACEMENT: array order = selection priority. Sharpest/most-relevant first; a weak-but-passing
//     tool goes LAST; never place a low-relevance/ambiguous tool ahead of a clearly-defined one.
//  4. FRAMING TEST: ask "could a diverging user ask something this tool/KB serves", not "does this Generative Journey's task
//     need it". General GET/list (no required filter) are divergence-rich candidates — subject to rule 2 AND a
//     PII/side-effect check (must be access-scoped + read-only; an unfiltered list can leak other customers' data).
//  5. PER-TOOL PROMPT MANDATORY: every attached tool gets a real one-line usage hint; an empty prompt is a
//     rule-2 failure.
export type GenerativeJourneyTool =
  | { kb: string; prompt: string }           // knowledge base — `kb` is the KB NAME; emitted as {kbName} and
                                             //   resolved to the server UUID at deploy by resolveKbPlaceholders().
  | { dataRequest: string; prompt: string }; // data request — `dataRequest` is the stable dataRequestId/name.
export function generativeJourney(opts: GenerativeJourneyOpts): NodeResult {
  // Normalize named exits: prefer `exits`; fall back to legacy `exitNames` (names-only).
  const namedExits: GenerativeJourneyExit[] = opts.exits
    ? opts.exits
    : (opts.exitNames ?? []).map((nm) => ({ name: nm, prompt: '' }));
  const captures = opts.dataCapture ?? [];

  const gj: Record<string, unknown> = { prompt: opts.prompt };
  if (namedExits.length) {
    gj.exitConditions = namedExits.map((e) => ({ name: e.name ?? '', prompt: e.prompt }));
  }
  // Build tools[] in the VERIFIED wire shape, preserving array order as selection priority (rule 3).
  // KB tools emit knowledgeBaseId:"{kbName}" — the deploy engine's resolveKbPlaceholders() (create-flows.ts)
  // string-replaces {kbName} → server UUID at deploy, the same resolver the knowledge_base node relies on.
  gj.tools = (opts.tools ?? []).map((t) =>
    'kb' in t
      ? { type: 'knowledgeBase', knowledgeBaseId: `{${t.kb}}`, prompt: t.prompt, scopeTags: [] }
      : {
          type: 'dataRequest',
          dataRequest: { type: 'custom', dataRequestId: t.dataRequest, payload: {}, params: {}, headers: {} },
          prompt: t.prompt,
          scopeTags: [],
        },
  );
  gj.maxTokens = opts.maxTokens ?? 8192;
  gj.maxSteps = opts.maxSteps ?? 10;
  gj.temperature = opts.temperature ?? 0.7;
  gj.enableZeroTurnMode = opts.enableZeroTurnMode ?? false;
  gj.modelType = opts.model ?? 'anthropic.claude-sonnet-5';
  if (captures.length) {
    gj.dataCapture = {
      data: captures.map((c) => ({ required: c.required ?? true, type: 'slot', name: c.slotName })),
      exitEnabled: true,
    };
  }

  const node: FlowNode = {
    nodeId: uuid(), type: 'generative_journey', childNodes: [], modalities: {}, messages: [],
    metadata: {
      name: opts.name,
      stateModifications: [],
      ...(opts.tags && opts.tags.length
        ? { tags: opts.tags.map((t) => (typeof t === 'string' ? { label: t } : { label: t.label })) }
        : {}),
      generativeJourney: gj,
    },
  };

  // EXITS — CONSOLE-VERIFIED ordering/shape:
  //  • data-capture-complete exit { node_status eq 'data_captured' } — present iff dataCapture set (label 'captured').
  //  • one handle per NAMED exit, wired by POSITIONAL index { System.gjConditionIndex eq i } (0-based).
  //  • always: { node_status eq 'timeout' } + { node_status eq 'failure' } (the Generative Journey default exits).
  const exits: ExitHandle[] = [];
  if (captures.length) {
    exits.push(new ExitHandle('captured', 'status', [statusCondition('data_captured')]));
  }
  namedExits.forEach((e, i) => {
    exits.push(new ExitHandle(e.name || `exit${i}`, 'named', [gjIndexCondition(i)]));
  });
  exits.push(new ExitHandle('timeout', 'status', [statusCondition('timeout')]));
  exits.push(new ExitHandle('failure', 'status', [statusCondition('failure')]));
  return makeNodeResult(node, exits);
}

// ── data_request — URL params and/or a JSON body ────────────────────────────────────────────────────────────
// Binding field is `variableId` (NOT dataRequestId); type:'custom'; name==variableId; headers:{}. Values reach
// the backend through two channels, usable together on ANY method:
//   urlParams — substituted into `{paramName}` placeholders in the data request's URL (path or query).
//   body      — the JSON request body, emitted as the node `payload` (`{type:'recursive', value:{...}}`). Values
//               may be strings ("{ref:NLX.Kind}" tokens or literal text) or NESTED objects/arrays, so a nested
//               JSON body is supported. [SDK-MODEL: NodeDataRequest.payload is a Document; OperandType includes
//               `recursive`. Payload leaf shape {type:'constant', value:'{token}'} matches the reference flow
//               export; a NESTED recursive member is the model-consistent extension, confirm on first run.]
// FOUR exits: in_progress / success / timeout / failure, EMITTED IN THAT ORDER (see exit-order note below).
export interface DataRequestNodeOpts {
  name?: string;
  variableId: string;               // the data request resource id/name; also the field-ref prefix downstream
  urlParams?: Record<string, string>;   // { paramName: "{ctxX:NLX.Context}" | "{slot:slotTypeId}" } -> URL {paramName}
  // JSON request body. Keys are body field names; values are a token/literal string, or a nested object /
  // array for a nested body. e.g. { accountNumber: '{accountNumber:NLX.AlphaNumeric}', address: { postcode:
  // '{postcode:NLX.Context}' } }. Use for POST/PUT/PATCH writes and for sensitive values (PIN, tokens) that
  // must not appear in the URL or access logs.
  body?: BodyValue;
  stateMods?: StateModification[];  // e.g. setContext(x, variableRef("variableId.field")) on success (variableRef = type:'variable'; a fieldRef/type:'field' read of a DR output redaction-wraps the value)
  // Declared so the factory's existing tags branch type-checks. Whether ACXD honours tags on a
  // data_request node is UNVERIFIED: prefer tagging the basic node its exit leads to.
  tags?: Array<string | { label: string }>;
  // ACXD "Always Retrigger" — a CACHING/latency control, NOT a retry safety switch. When true
  // (the default) the API is called each time the node runs; when false ACXD reuses the first response within
  // the flow. Default TRUE so repeated/looped non-identical calls actually re-call the API. Discovery flips it
  // to false per-API only for static data (latency/backend-load saving). See acxd-cx-discovery.md.
  alwaysRetrigger?: boolean;
}
export type BodyValue = string | number | boolean | BodyValue[] | { [key: string]: BodyValue };

// Declared types of the workspace context variables (name -> schemaType), set by the FlowSpec build from
// resources/context-vars.json. A body value that is exactly ONE context token for a number/boolean variable
// is emitted as a TYPED operand { type:'context', name } so the variable's type reaches the API. A constant
// is always a string, and ACXD rejects a string for a number/boolean field. [VERIFIED: ACXD error "payload.<f>
// has an incorrect type: expected number/boolean, but got string" for constant-wrapped tokens.] String
// variables, literals and mixed text stay constant operands (the verified shape for string fields).
let contextVarTypes: Record<string, string> = {};
export function setContextVarTypes(types: Record<string, string>): void { contextVarTypes = { ...types }; }
const LONE_CONTEXT_TOKEN = /^\{([A-Za-z0-9_]+):NLX\.Context\}$/;
// A lone data-request field token, {dataRequestId.field:NLX.Variable}, becomes a typed `variable` operand so the
// field keeps its API type (number/boolean/object) in another request's body; inside text it stays a token.
// [CONSOLE-VERIFIED] a `variable` operand in a data-request payload deploys and resolves at runtime.
const LONE_VARIABLE_TOKEN = /^\{([A-Za-z0-9_]+\.[A-Za-z0-9_.]+):NLX\.Variable\}$/;

// Convert an authored body value into a payload operand. Objects become nested `recursive` operands; arrays
// become `json` constants; a lone context token for a number/boolean variable becomes a typed `context`
// operand; everything else becomes a constant.
export function toPayloadOperand(v: BodyValue): unknown {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const value: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(v)) value[k] = toPayloadOperand(child);
    return { type: 'recursive', value };
  }
  if (Array.isArray(v)) return { type: 'json', value: v };
  if (typeof v === 'string') {
    const m = LONE_CONTEXT_TOKEN.exec(v);
    const t = m ? contextVarTypes[m[1]] : undefined;
    if (m && (t === 'number' || t === 'boolean')) return { type: 'context', name: m[1] };
    const dv = LONE_VARIABLE_TOKEN.exec(v);
    if (dv) return { type: 'variable', name: dv[1] };
  }
  return { type: 'constant', value: v };
}

export function dataRequestPayload(body: BodyValue | undefined): { type: 'recursive'; value: Record<string, unknown> } {
  if (body === undefined) return { type: 'recursive', value: {} };
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    throw new Error('data_request body must be a JSON object (field name -> value)');
  return toPayloadOperand(body) as { type: 'recursive'; value: Record<string, unknown> };
}

export function dataRequest(opts: DataRequestNodeOpts): NodeResult {
  const nodeDr: NodeDataRequest = {
    type: 'custom',
    variableId: opts.variableId,
    name: opts.variableId,                                     // MUST equal variableId
    payload: dataRequestPayload(opts.body),                    // JSON body (empty recursive when no body)
    urlParams: opts.urlParams ?? {},
    headers: {},
    alwaysRetrigger: opts.alwaysRetrigger ?? true,
  };
  const node: FlowNode = {
    nodeId: uuid(), type: 'data_request', childNodes: [], modalities: {}, messages: [],
    dataRequests: [nodeDr],
    metadata: {
      name: opts.name,
      stateModifications: opts.stateMods ?? [],
      ...(opts.tags && opts.tags.length
        ? { tags: opts.tags.map((t) => (typeof t === 'string' ? { label: t } : { label: t.label })) }
        : {}),
    },
  };
  // EXIT ORDER IS LOAD-BEARING. [CONSOLE-VERIFIED — raw-SDK A/B test, sent vs GetFlow read-back]
  // ACXD CreateFlow binds data_request status edges by POSITION, not by condition value. It expects the
  // console order in_progress, success, timeout, failure. With success first, CreateFlow silently re-points
  // in_progress at the success target; in_progress fires before response fields are set, so a downstream
  // split fails (e.g. a verified customer routed to "Wrong details"). Do not reorder. validate-flow-refs
  // check 14 fails any data_request whose edges are out of this order.
  const exits: ExitHandle[] = [
    new ExitHandle('in_progress', 'status', [statusCondition('in_progress')]),
    new ExitHandle('success', 'status', [statusCondition('success')]),
    new ExitHandle('timeout', 'status', [statusCondition('timeout')]),
    new ExitHandle('failure', 'status', [statusCondition('failure')]),
  ];
  return makeNodeResult(node, exits);
}

// ── redirect — one-way intent jump ──────────────────────────────────────────────────────────────────────────
// Wire shape: metadata.redirect { id, intentId, type:'intent' } where id==intentId==toFlowId. The node has a
// single child edge { node_status eq 'continuation' } (fires when the redirected-to flow returns control).
// Redirect is ONE-WAY: it has no author-wireable forward exit (the continuation edge is emitted internally).
// Redirect nodes MAY carry state modifications (e.g. set escalationReason before redirecting to escalation).
export interface RedirectOpts { name?: string; toFlowId: string; stateMods?: StateModification[]; }
export function redirect(opts: RedirectOpts): NodeResult {
  const node: FlowNode = {
    nodeId: uuid(), type: 'redirect', childNodes: [], modalities: {}, messages: [],
    metadata: {
      name: opts.name,
      stateModifications: opts.stateMods ?? [],
      redirect: { id: opts.toFlowId, intentId: opts.toFlowId, type: 'intent' },
    },
  };
  // The continuation edge is emitted internally at build time (see FlowBuilder). No author-wireable exits.
  return makeNodeResult(node, []);
}

// ── split — branch on typed conditions ──────────────────────────────────────────────────────────────────────
// metadata.split carries { modelType } (verified 'amazon-nova-2-lite'). Each branch is a named handle carrying
// its condition; plus a default (unconditional, empty-conditions) handle rendered last.
export interface SplitBranch { name: string; condition: Condition; }
export function split(opts: { name?: string; branches: SplitBranch[]; model?: GenerativeModelType; withDefault?: boolean }): NodeResult {
  const node: FlowNode = {
    nodeId: uuid(), type: 'split', childNodes: [], modalities: {}, messages: [],
    metadata: { name: opts.name, stateModifications: [], split: { modelType: opts.model ?? 'amazon-nova-2-lite' } },
  };
  const exits: ExitHandle[] = opts.branches.map((b) => new ExitHandle(b.name, 'value', [b.condition]));
  if (opts.withDefault !== false) exits.push(new ExitHandle('default', 'unconditional', []));
  return makeNodeResult(node, exits);
}

// ── generative_text — produces a LOCAL from a prompt ────────────────────────────────────────────────────────
// metadata.generativeText { modelType, name:<producesLocal>, prompt, maxTokens, temperature }. Produces a
// local named by `producesLocal`; read it downstream via localRef(producesLocal). Exits: success/timeout/failure.
export interface GenerativeTextResult extends NodeResult { producesLocal: string; }

// ACXD variable names (Generative Text output, define locals) allow only letters, digits and underscores, and are
// read as {name:Kind} tokens. A node's display name is a label for people and may contain spaces, so it is never
// used as a variable name directly: toVariableName turns it into camelCase ("Present quote" -> "presentQuote").
export const LEGAL_VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
export function toVariableName(label: string): string {
  const words = String(label ?? '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const name = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join('');
  const clean = name.replace(/^[0-9]+/, '');
  if (!clean) throw new Error(`cannot derive a variable name from "${label}" — give the node an explicit output name (e.g. "presentQuote")`);
  return clean;
}
export function generativeText(opts: {
  name: string; producesLocal?: string; prompt: string; model: GenerativeModelType;
  temperature?: number; maxTokens?: number;
}): GenerativeTextResult {
  if (opts.producesLocal !== undefined && !LEGAL_VARIABLE_NAME.test(opts.producesLocal)) {
    throw new Error(`generative_text "${opts.name}": output name "${opts.producesLocal}" is not a legal variable name ` +
      `(letters, digits and underscores only, starting with a letter) — use camelCase, e.g. "${toVariableName(opts.producesLocal)}"`);
  }
  const local = opts.producesLocal ?? toVariableName(opts.name);
  const node: FlowNode = {
    nodeId: uuid(), type: 'generative_text', childNodes: [], modalities: {}, messages: [],
    metadata: {
      name: opts.name, stateModifications: [],
      generativeText: {
        modelType: opts.model, name: local, prompt: opts.prompt,
        maxTokens: opts.maxTokens ?? 4000, temperature: opts.temperature ?? 0.5,
      },
    },
  };
  const exits = [
    new ExitHandle('success', 'status', [statusCondition('success')]),
    new ExitHandle('timeout', 'status', [statusCondition('timeout')]),
    new ExitHandle('failure', 'status', [statusCondition('failure')]),
  ];
  const result = makeNodeResult(node, exits) as GenerativeTextResult;
  result.producesLocal = local;
  return result;
}

// ── knowledge_base — {kbName} placeholder resolved by the engine ────────────────────────────────────────────
// A dedicated KB node (distinct from a Generative Journey referencing a KB by prose). metadata.knowledgeBase.knowledgeBaseId
// carries the {kbName} placeholder the engine resolves to the KB UUID at create time. Exits success/failure.
export function knowledgeBaseNode(opts: { name?: string; kbName: string; question?: string }): NodeResult {
  const node: FlowNode = {
    nodeId: uuid(), type: 'knowledge_base', childNodes: [], modalities: {}, messages: [],
    metadata: {
      name: opts.name, stateModifications: [],
      knowledgeBase: {
        knowledgeBaseId: `{${opts.kbName}}`,
        ...(opts.question != null ? { question: opts.question } : {}),
      },
    },
  };
  // CONSOLE-VERIFIED exits: match / no_match / timeout / failure (was success/failure).
  // match = KB returned an answer; no_match = no answer found (a business negative, NOT an error);
  // timeout + failure = the single self-managed failure mode (wire to escalation per the node-reference rule).
  const exits = [
    new ExitHandle('match', 'status', [statusCondition('match')]),
    new ExitHandle('no_match', 'status', [statusCondition('no_match')]),
    new ExitHandle('timeout', 'status', [statusCondition('timeout')]),
    new ExitHandle('failure', 'status', [statusCondition('failure')]),
  ];
  return makeNodeResult(node, exits);
}

// ── escalate — hand off to a human ──────────────────────────────────────────────────────────────────────────
// No metadata config block. Single child edge { node_status eq 'continuation' } emitted internally. Terminal
// for wiring (no author-wireable forward exit). Set any handoff summary in a PRIOR node's state-mods.
export function escalate(opts: { name?: string } = {}): NodeResult {
  const node: FlowNode = {
    nodeId: uuid(), type: 'escalate', childNodes: [], modalities: {}, messages: [],
    metadata: { name: opts.name, stateModifications: [] },
  };
  return makeNodeResult(node, []);
}

// ── terminate — Exit Application node (clean end of the ACXD session) ────────────────────────────────────────
// [CONSOLE-VERIFIED] The GA console emits a dedicated node type:"terminate" (labelled "Exit
// application") with an EMPTY childNodes array — it is the documented explicit terminator that "ends the
// conversation session / provides a clear explicit ending point for the flow".
// Termination model (all three are real nodes you wire INTO — never a dangling source edge):
//   1. terminate  → clean end, no further action, session closes.
//   2. redirect   → continue the journey in another ACXD flow (must set a valid Destination/toFlowId).
//   3. escalate   → hand to a human / back to the Amazon Connect Escalation branch.
// A `terminate` node has NO author-wireable forward exit and NO continuation edge (unlike redirect/escalate);
// its childNodes stay []. Wire prior nodes to it with .to(terminateNode).
export function terminateNode(opts: { name?: string } = {}): NodeResult {
  const node: FlowNode = {
    nodeId: uuid(), type: 'terminate', childNodes: [], modalities: {}, messages: [],
    metadata: { name: opts.name, stateModifications: [] },
  };
  return makeNodeResult(node, []);
}
