// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ACXD SDK Authoring IDL  —  AUTHORITATIVE resource & flow shapes for the harness agent.
 * ============================================================================================
 * amazon-connect-acxd-sdk (pinned in tools/acxd-deploy-engine/package.json)  |  derived from the ACXD SDK
 * definitions + verified live testing.
 *
 * WHY THIS FILE EXISTS (read this first):
 *   This is the single source of truth for the SHAPE of everything the harness authors for the
 *   deterministic deploy engine. Author to THESE types. Two reasons this file — not your own SDK
 *   knowledge — is authoritative:
 *     1. The ACXD SDK is new and churned during GA. If you were trained on an earlier ACXD SDK, some
 *        shapes you "know" are STALE. Every place reality differs from the published SDK is marked
 *        below with a `⚠️ DEVIATES FROM SDK` comment — TRUST THE COMMENT OVER YOUR PRIOR KNOWLEDGE.
 *     2. Comments here are as load-bearing as the types. They encode constraints the type system
 *        cannot express (runtime rejections, unit gotchas, representation mismatches). Read them.
 *
 * DEVIATION FORMAT (also a system-of-record for the SDK developers + version-diff checks):
 *   `⚠️ DEVIATES FROM SDK: The SDK indicates <X>, but real-world testing found <failure> unless <Y>.`
 *
 * SCOPE: these are the shapes the agent AUTHORS (declarative resource JSON + flow node graphs). The
 * engine consumes them and constructs the actual SDK commands (it owns command-input quirks like
 * slots→slotTypes). Universal naming for every authored identifier: camelCase, LETTERS ONLY — no
 * digits, hyphens, underscores, or leading digit (flow ids, context vars, slot type ids, data request
 * ids, analytics tag names, exit conditions, split-matched values). Node-status enums, System.* and
 * NLX.* are fixed platform vocabulary, not authored names.
 */

// ============================================================================================
// CONTENTS  (read this map first — every node/resource shape is defined below; do NOT guess a shape)
// ============================================================================================
//   PART A — RESOURCE AUTHORING SHAPES  (resources/*.json)
//     ContextVarDef · SlotTypeDef · SlotValueDef · SecretDef · AnalyticsTagDef ·
//     KnowledgeBaseDef · DataRequestDef
//   PART B — FLOW AUTHORING SHAPES  (flows/*.flow.json — the flow document + node graph)
//     FlowDoc · AttachedSlot · FlowNodeType · FlowNode · ChildNode · Condition ·
//     ConditionOperator · Operand · OperandType · FlowMessage · NodeDataRequest
//   PART C — NODE METADATA SUB-CONFIGS  (metadata.<key> — per-node-type configuration)
//     FlowNodeMetadata · ChoiceConfig (user_choice) · RedirectConfig (redirect) ·
//     GenerativeJourneyConfig + GenerativeJourneyTool (generative_journey) ·
//     GenerativeTextConfig (generative_text) · KnowledgeBaseNodeConfig (knowledge_base) ·
//     LoopConfig (loop) · DefineConfig (define) · FlowStateModification · GenerativeModelType
//   → A node's per-type config (e.g. generative_journey, loop, choice) lives in PART C, NOT PART B.
//     If you cannot find a node's shape, scroll to PART C — it is defined there, not missing.

// ============================================================================================
// PART A — RESOURCE AUTHORING SHAPES  (one JSON array per file under resources/)
// ============================================================================================

/** resources/context-vars.json — array of ContextVarDef. Primitives; created FIRST.
 *  @example
 *    [
 *      { "name": "customerId", "schemaType": "string", "description": "Set by: authVerify. Used by: quote flows.", "sensitive": true },
 *      { "name": "authenticated", "schemaType": "boolean", "description": "Set by: authVerify. Used by: servicing flows." },
 *      { "name": "preApprovedDiscount", "schemaType": "number", "description": "Set by: getAccountDiscount. Used by: billingMain." }
 *    ] */
// ============================================================================================
// FIELD-LENGTH LIMITS  (authoring reference — mirrors tools/acxd-deploy-engine/lib/length-limits.ts)
// ============================================================================================
// Author every field WITHIN these maxima. The deploy engine ENFORCES them at pre-flight from
// lib/length-limits.ts (validateFieldLengths + the guardrail guard) and FAILS the deploy on any overflow,
// naming each offender — so authoring within range here avoids a redo. These are NOT uniform: description
// fields in particular differ. Keep this table in sync with lib/length-limits.ts (edit the engine table first).
//
//   DESCRIPTION fields (char max):
//     analytics-tag description ....... 64     (printable ASCII; engine truncates)   [SDK]
//     guardrail description ........... 100    (Smithy model; live rejects >100)      [CONSOLE-VERIFIED]
//     guardrail RULE description ...... 100    (Smithy model; live rejects >100)      [CONSOLE-VERIFIED]
//     data-request description ........ 200                                           [SDK]
//     knowledge-base description ...... 200                                           [SDK]
//     slot-type description ........... 200                                           [SDK]
//     flow description ................ 200                                           [SDK]
//     application / role / api-token /
//       live-sync-script description .. 200                                           [SDK]
//     flow aiDescription .............. 1000   (do NOT clip to 200 — much looser)     [SDK]
//   RULE OF THUMB: write ONE tight sentence. A description is a label, not a paragraph. 200 is the common
//     cap; guardrail + guardrail-rule (100) and analytics-tag (64) are the tight exceptions; aiDescription
//     (1000) is the roomy one.
//
//   NAME / ID fields (char max):
//     workspace / analytics-tag name / role name .... 36        application / KB / guardrail / slot-type-id /
//     data-request-id name .......................... 100       flow-id / redirect-target .... 64
//     attached-slot in-flow name .................... 30        programmatic-user name ....... 128
//
//   OTHER TEXT (char max): guardrail detection prompt 4000 · enforcement message 500 · enforcement prompt
//     1000 · detection pattern 200 · keyword 50 · secret value 4096 · resource tag 256 (<=5 tags) ·
//     KB article payload 10000 · conversationTTL 1440 (MINUTES, 24h).
//

export interface ContextVarDef {
  /** camelCase, letters only. The context variable key. Context variables are the ONLY values that
   *  cross a Redirect / flow boundary — flow-locals and {dr.field} references do NOT survive a redirect. */
  name: string;
  /** The scalar type. Engine emits it as schema.type.
   *  ⚠️ DEVIATES FROM SDK: The SDK ContextVariableType enum lists BOTH "text" and "string" (plus
   *  "number","boolean"), and the ACXD console import files use "text". Real-world testing: the engine
   *  authors "string" here and it loads — but if a value fails to register, try "text" (the console's
   *  canonical spelling). Use "string" | "number" | "boolean". */
  schemaType: 'string' | 'number' | 'boolean';
  /** ≤200 chars. Convention: "Set by: <flow>. Used by: <flows>." */
  description: string;
  /** default false → schema.isSensitive. */
  sensitive?: boolean;
}

/** resources/slot-types.json — array of SlotTypeDef.
 *  @example
 *    [
 *      { "slotTypeId": "xxYesNo", "description": "Yes/no confirmation.",
 *        "values": [ { "value": "yes", "synonyms": ["yeah","correct"] }, { "value": "no", "synonyms": ["nope"] } ] }
 *    ]
 *  // engine derives valueId "xxYesNoYes" / "xxYesNoNo"; a flow user_choice branch references that exact id as constant_id. */
export interface SlotTypeDef {
  /** camelCase, letters only. */
  slotTypeId: string;
  /** ≤200 chars. */
  description: string;
  values: SlotValueDef[];
}
export interface SlotValueDef {
  /** 1–256 chars. The canonical value; the enumeration IS the validation and canonicalises casing. */
  value: string;
  /** OPTIONAL to author. Omit it and the engine derives a DETERMINISTIC id = `<slotTypeId><ValuePascalCase>`
   *  (e.g. slotType xxYesNo + value "yes" → "xxYesNoYes"); or set it explicitly to that same form. Either
   *  way the deployed value carries a STABLE, client-side id — the `?` marks the authoring input as optional,
   *  NOT the id itself. A flow's user_choice branch references that exact id as constant_id.
   *  ⚠️ DEVIATES FROM SDK: The SDK marks SlotTypeValue.valueId optional/server-hintable, but real-world
   *  testing found a flow branch FAILS to bind if the id is left server-assigned — the id must be
   *  client-side and deterministic. The engine guarantees this by deriving it when omitted, so a
   *  server-generated id never reaches the flow. */
  valueId?: string;
  synonyms?: string[];
}

/** resources/secrets.json — array of SecretDef. Value is read from .env, NOT stored here.
 *  @example
 *    [
 *      { "name": "billingApiUrl", "envVar": "BILLING_API_URL", "description": "Base URL of billingApi (endpoint, not a credential).", "isSensitive": false },
 *      { "name": "billingApiKey", "envVar": "BILLING_API_KEY", "description": "API key for billingApi.", "isSensitive": true }
 *    ] */
export interface SecretDef {
  /** the secret name; reference it in a data-request URL/header as {name:NLX.Secret} — the validated form
   *  in ALL workshop data requests (e.g. {API_URL_Base:NLX.Secret}, {API_Key:NLX.Secret}). The bare {name}
   *  form is unverified — always author the :NLX.Secret suffix. `[CONSOLE-VERIFIED]` */
  name: string;
  /** which .env var holds the value (e.g. "BILLING_API_URL", "BILLING_API_KEY"). API secrets are written by the API wiring tool from the OpenAPI files.
   *  ⚠️ DEVIATES FROM SDK: Early SDK guidance said secrets must be added by hand in the console. Real-
   *  world testing: CreateSecretCommand works (command field is `secretValue`) — secrets ARE created
   *  programmatically from .env. Do not instruct the user to hand-enter them. */
  envVar: string;
  description: string;
  /** default true. Set false for a non-secret base URL (improves log readability). */
  isSensitive?: boolean;
}

/** resources/analytics-tags.json — array of AnalyticsTagDef.
 *  @example
 *    [
 *      { "name": "completionQuoteSuccess", "type": "positive", "description": "Caller completed a quote." },
 *      { "name": "escalationRequested", "type": "negative", "description": "Caller asked for a human." }
 *    ] */
export interface AnalyticsTagDef {
  /** camelCase, category-prefixed, e.g. completionQuoteSuccess. */
  name: string;
  /** ⚠️ DEVIATES FROM SDK: This is a CLOSED enum of exactly three values. The SDK type is a loose
   *  string in some surfaces; real-world testing rejects anything other than these three. */
  type: 'positive' | 'negative' | 'neutral';
  /** ⚠️ DEVIATES FROM SDK: The SDK shows description as a general string. Real-world testing: it must
   *  be ≤64 chars AND printable ASCII, or create fails ("description must be at most 64 characters").
   *  The engine truncates ASCII-safe to 64. */
  description: string;
}

/** resources/knowledge-bases.json — array of KnowledgeBaseDef.
 *  @example
 *    [
 *      { "name": "coverageFaq", "type": "articles", "description": "Coverage and policy FAQ.", "publish": true,
 *        "content": "resources/kb/coverageFaq" }
 *    ] */
export interface KnowledgeBaseDef {
  name: string;
  type: 'articles' | 'documents';
  /** ≤200 chars, printable ASCII (non-ASCII such as an em-dash is rejected by KB validators). */
  description: string;
  /** default true.
   *  ⚠️ DEVIATES FROM SDK: The SDK lets you create a KB and reference it. Real-world testing: a KB is
   *  INVISIBLE to flows until PUBLISHED (PublishKnowledgeBaseCommand). The engine publishes on create.
   *  Also note PublishKnowledgeBase uses the SHORT field `knowledgeBaseId` (NOT `knowledgeBaseIdentifier`
   *  — only build/deploy commands use the `…Identifier` long form). */
  publish?: boolean;
  /** Folder of content files, relative to the deploy config (e.g. "resources/kb/<kbName>"). The engine loads it
   *  after creating the KB, then re-publishes. articles KB: *.json files, each an array of
   *  { "question": string, "answer": string } (one CreateKnowledgeBaseArticle per entry). documents KB: *.md /
   *  *.txt / *.pdf / *.html files, one PutKnowledgeBaseDocument + pre-signed upload each (documentId = file name).
   *  Omit for a KB whose content is loaded another way. `[SDK-MODEL]` */
  content?: string;
}

/** resources/guardrails.json — array of GuardrailDef. A guardrail is a GLOBAL resource (NOT a flow node — no
 *  exits, never in the node graph); the engine CREATES each then the application REFERENCES it by id in
 *  settings.guardrails. The deploy config's application.guardrails lists the NAMES to attach.
 *  VERIFIED against model/guardrails.smithy + the GA autocare example.
 *  @example
 *    [
 *      { "name": "inputSafety", "trigger": "input", "rules": [
 *          { "name": "StayOnTopic",
 *            "detection": { "method": "llmJudge", "prompt": "Is the message off-topic? yes/no", "threshold": 0.7 },
 *            "enforcement": { "action": "flag", "behavior": { "message": "I can only help with ..." } } } ] }
 *    ]
 *  DETECTION method: "regex" (CUSTOMER-SUPPLIED pattern only — never a shipped/guessed one; country formats
 *  vary) | "keyword" (keywords[]) | "llmJudge" (prompt + threshold). ENFORCEMENT action: "mask" | "modify" |
 *  "route" | "flag". trigger: "input" (caller message) | "output" (agent/model message). */
export interface GuardrailDef {
  name: string;
  trigger: 'input' | 'output';
  rules: Array<{
    name: string;
    detection: { method: 'regex' | 'keyword' | 'llmJudge'; pattern?: string; keywords?: string[]; prompt?: string; threshold?: number };
    enforcement: { action: 'mask' | 'modify' | 'route' | 'flag'; tags?: string[]; behavior?: { message?: string; prompt?: string; flowId?: string; maskChar?: string; maskText?: string } };
    description?: string;
    active?: boolean;
  }>;
  description?: string;
  active?: boolean;
  fallbackBehavior?: { type: 'continue' | 'routeToFlow'; flowId?: string };
}

/** resources/data-requests.json — array of DataRequestDef.
 *  @example
 *    [
 *      {
 *        "dataRequestId": "getPreApprovedDiscount",
 *        "description": "Look up an existing customer's pre-approved discount.",
 *        "implementation": "external",
 *        "method": "GET",
 *        "url": "{billingApiUrl:NLX.Secret}/getPreApprovedDiscount?customerId={customerId}",
 *        "headers": [ { "key": "x-api-key", "value": "{billingApiKey:NLX.Secret}", "sensitive": true } ],   // url + auth headers written by the API wiring tool
 *        "responseSchema": { "type": "object", "properties": {
 *          "found": { "type": "boolean" }, "preApprovedPct": { "type": "number" }, "preApprovedFormatted": { "type": "string" }
 *        } }
 *      }
 *    ]
 *  // URL identifiers go in the url ({param} tokens); a POST's structured input goes in a JSON body (described by requestSchema, sent by the node payload; nesting allowed). base URL is a {secretName:NLX.Secret} token. responseSchema MAY nest —
 *  // only fields a flow reads via {dr.field} must be top-level. To set a NUMBER/BOOLEAN context var from a response field
 *  // use a typed operand { "type": "field", "name": "getPreApprovedDiscount.preApprovedPct" }, NOT a constant wrapper. */
export interface DataRequestDef {
  /** camelCase, letters only. */
  dataRequestId: string;
  description: string;
  /** how the request is served. */
  implementation: 'external' | 'inline-static' | 'mcp';
  /** external only; default GET. Full set: GET | POST | PUT | PATCH | DELETE. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** external only. The full URL with {secretName} and {param} placeholders substituted IN THE URL.
   *  ⚠️ DEVIATES FROM SDK: The SDK WebhookConfig exposes a top-level `url`, so a bare url looks correct.
   *  Real-world testing: for reliable placeholder substitution the runtime substitutes {placeholder}
   *  ONLY when the webhook carries an `environments` map — a bare top-level `url` can pass through the
   *  literal "{param}" and 404. Author the url here; the engine SHOULD place it under
   *  webhook.environments.{production,development}.url (see EngineWebhookNote below). A data request carries three
   *  transfer channels, all usable on any method: URL placeholders (`{param}` in path/query), `headers`, and
   *  a JSON request body (described by `requestSchema`, sent by the node `payload`; may be NESTED). GET is
   *  commonly URL-params + response model; POST/PUT/PATCH commonly send a JSON body. For generated (mock)
   *  contracts prefer a flat JSON body for writes and sensitive inputs: a preference, not an ACXD limit.
   *  URL `{placeholder}` tokens resolve by KEY PRESENCE: an unresolved {placeholder} at runtime → 400
   *  UNSUBSTITUTED_PLACEHOLDER; identifier match is
   *  case-sensitive (wrong case → 200 empty). */
  url?: string;
  headers?: { key: string; value: string; sensitive?: boolean }[];
  /** inline-static only: canned-response JS string. */
  code?: string;
  /** Full JSON Schema — NOT a data sample. { type:"object", properties:{ f:{ type, isSensitive, title, description } } }.
   *  ⚠️ DEVIATES FROM SDK / our own earlier rule: response schema MAY be nested and contain arrays
   *  (validated: getPolicies has a nested policies[] of objects). The "flat only" rule was too strong —
   *  it applies ONLY to how a FLOW references {dr.field} (must resolve top-level), not to the schema. */
  /** JSON Schema for the request body. Optional in the SDK. Describes (and types, and marks sensitive) the body
   *  the node's `payload` sends; it does NOT itself send anything. MAY be nested (objects/arrays). List the fields
   *  the backend needs in `required` and the engine pre-flight checks every node supplies them (check 17). GET:
   *  usually omitted. POST/PUT/PATCH: author the body here AND supply it on the node (`payload` / FlowSpec `body`). */
  requestSchema?: unknown;
  /** JSON Schema for the response body model. Optional in the SDK; author it whenever the flow reads a
   *  response field. MAY nest / contain arrays — only fields a flow reads via {dr.field} must be top-level. */
  responseSchema?: unknown;
}

/**
 * EngineWebhookNote (not authored — documents what the engine builds from DataRequestDef, and the
 * verified SDK WebhookConfig shape for reference / the pending environments fix):
 *   webhook = {
 *     implementation, method, sendContext?,
 *     environments: { production: { url, headers }, development?: { url, headers } },  // preferred
 *     // url?  ← bare top-level url exists in the SDK but see the DEVIATES note on DataRequestDef.url
 *   }
 *   WebhookHeader = { key, value, sensitive?, dynamic?, required? }
 */

// ============================================================================================
// PART B — FLOW AUTHORING SHAPES  (one file per flow under flows/, *.flow.json)
// ============================================================================================

/** A flow document. Authored in the export/import representation the engine consumes. */
export interface FlowDoc {
  /** camelCase, letters only, 3–64 chars.
   *  ⚠️ DEVIATES FROM SDK: The SDK FlowId pattern ^[A-Za-z]+$ *reads* as "letters only" but is applied
   *  loosely in places, so `uc1QuoteMain` looks acceptable. Real-world testing: GA rejects digits
   *  ANYWHERE ("flowId is not in the expected format"). No digits at all — spell it (billingOneMain). */
  flowId: string;
  /** REQUIRED, non-empty.
   *  ⚠️ DEVIATES FROM SDK: aiDescription is optional in the SDK type. Real-world testing: a flow with an
   *  empty aiDescription DEPLOYS but is SILENTLY UNREACHABLE (NLU cannot route to it). Always populate. */
  aiDescription: string;
  interruptible?: boolean;
  untrained?: boolean;
  /** The slots ATTACHED to this flow.
   *  ⚠️ DEVIATES FROM SDK: In the flow DOCUMENT (and every GetFlow export) the field is `slots`. The
   *  CreateFlow COMMAND input field is `slotTypes` (AttachedSlotList). Author `slots` here — the engine
   *  renames slots→slotTypes at send time. If you author `slotTypes` in the document it will not attach. */
  slots?: AttachedSlot[];
  /** dict keyed by UUIDv4 — NOT an array. */
  nodes: Record<string, FlowNode>;
}

/** An attached slot (document `slots[]` entry). */
export interface AttachedSlot {
  /** ^[A-Za-z]+$, 3–30 chars. The in-flow reference name (distinct from the slotTypeId). */
  name: string;
  /** the slotTypeId this attachment resolves to. */
  type: string;
  sensitive?: boolean;
  examples?: string[];
  aiDescription?: string;
}

/** Valid node types (Smithy FlowNodeType). Intent capture = user_choice + slot + split (no single "collect" node). */
export type FlowNodeType =
  | 'start' | 'basic' | 'user_input' | 'user_choice' | 'split' | 'redirect' | 'define' | 'loop'
  | 'data_request' | 'generative_text' | 'generative_journey' | 'knowledge_base' | 'escalate'
  | 'terminate' | 'note' | 'multimodal' | 'choice' | 'end' | 'generative_task' | 'intent_capture'
  | 'wait' | 'transform';

export interface FlowNode {
  nodeId: string;                 // must be a real UUIDv4
  type: FlowNodeType;
  childNodes: ChildNode[];        // the EXIT EDGES (see ChildNode)
  dataRequests?: NodeDataRequest[];
  messages?: FlowMessage[];
  modalities?: Record<string, unknown>;
  metadata: FlowNodeMetadata;
  canvasMetadata?: Record<string, unknown>;
}

/** An exit edge. In a DSL, exits are DERIVED from node config (choices/status) so they cannot desync. */
export interface ChildNode {
  nodeId?: string;                // target node; omit for a terminal catch
  name?: string;
  conditions: Condition[];        // empty [] = unconditional edge
}

export interface Condition {
  left: Operand;
  operator: ConditionOperator;
  right?: Operand;
}
export type ConditionOperator =
  | 'exists' | 'not_exists' | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
  | 'prefix' | 'suffix' | 'contains' | 'not_contains' | 'matches_regex' | 'similar';

export interface Operand {
  type: OperandType;
  name?: string;
  value?: unknown;
  modification?: string;
}
export type OperandType =
  | 'constant' | 'constant_id' | 'context' | 'local' | 'slot' | 'slot_value_id' | 'node_status'
  | 'system' | 'field' | 'captured_intent' | 'computed' | 'json' | 'variable' | 'variable_selection'
  | 'knowledge_base_metadata' | 'random_number' | 'recursive';

export interface FlowMessage { type: 'text' | 'ssml'; body: string; }

export interface NodeDataRequest {
  dataRequestId: string;
  /** MUST equal dataRequestId.
   *  ⚠️ DEVIATES FROM SDK: The binding looks complete with just dataRequestId. Real-world testing: a
   *  missing `name` yields "data request must be filled in" (the request is not applied to the node). */
  name: string;
  /** URL parameters, as a string→token map: { paramName: "{ctxX:NLX.Context}" }. Each key must match a
   *  `{paramName}` placeholder in the data-request URL (resources/data-requests.json); an unmatched key is
   *  silently not delivered (engine check 16). `[CONSOLE-VERIFIED]` Values are plain token
   *  strings (query params arrive as strings; number/boolean coercion is the backend's job). */
  urlParams?: Record<string, string>;
  headers?: Record<string, unknown>;
  /** The JSON request BODY. { type: "recursive", value: { field: operand } }; a member may be a nested
   *  { type: "recursive", value: {...} } (nested objects) or { type: "json", value: [...] } (arrays). Leaf
   *  operands: { type: "constant", value: "{ref:NLX.Kind}" | "text" }, or a typed operand
   *  ({ type: "context", name }) when the backend field is number/boolean (engine check 11). Empty
   *  { type: "recursive", value: {} } when the call has no body. `[SDK-MODEL: NodeDataRequest.payload Document,
   *  OperandType recursive; leaf shape matches the reference flow export; nested members model-consistent]` */
  payload?: { type: 'recursive'; value: Record<string, unknown> }
  alwaysRetrigger?: boolean;
}

// ============================================================================================
// PART C — NODE METADATA SUB-CONFIGS  (metadata.<key> — the per-node-type configuration)
// ============================================================================================

export interface FlowNodeMetadata {
  stateModifications?: FlowStateModification[];   // present (often []) on most nodes
  name?: string;
  sendContext?: boolean;
  /** MILLISECONDS, ≤30000.
   *  ⚠️ DEVIATES FROM SDK: node-level `timeout` is in MILLISECONDS (60000 = 60s), whereas the
   *  application-level conversationTTL is in MINUTES (≤1440). Same word, opposite unit — do not confuse. */
  timeout?: number;
  choice?: ChoiceConfig;
  redirect?: RedirectConfig;
  generativeJourney?: GenerativeJourneyConfig;
  generativeText?: GenerativeTextConfig;
  knowledgeBase?: KnowledgeBaseNodeConfig;
  loop?: LoopConfig;
  define?: DefineConfig;
  split?: { modelType?: SplitModelType };
}

/** user_choice node config.
 *  ⚠️ DEVIATES FROM SDK: Example JS templates show source:"slotType" + slotTypeId. Real-world testing
 *  (a working GetFlow export) uses source:"slot" + slotId (the in-flow slot NAME). Use source:"slot".
 *  associatedSlotIds may be EMPTY — do not try to populate it; it is not the attachment mechanism
 *  (the flow-level `slots[]` is). */
export interface ChoiceConfig {
  source: 'slot';
  slotId: string;                 // the in-flow slot name
  selectedChoiceLabel?: string;   // usually = slotId
  showChoices?: boolean;
  /** CLOSED enum — ONLY "default" (inline choice set) or "dropdown" (dropdown picker). `[CONSOLE-VERIFIED]`
   *  ⚠️ Any other value (e.g. "buttons") is REJECTED by CreateFlow with
   *  "metadata.choice.choiceDisplayFormat is not a supported value" — and NOT until mid-deploy. */
  choiceDisplayFormat?: 'default' | 'dropdown';
  associatedSlotIds?: string[];   // leave [] — see note above
}

/** redirect node config.
 *  ⚠️ DEVIATES FROM SDK: The RedirectType enum includes structurally-valid values, and the console
 *  supports a "recognized_flow" dynamic route. Real-world testing: the SDK CreateFlow path REJECTS
 *  type:"recognized_flow" ("metadata.redirect.type is not a supported value"). For dynamic routing,
 *  classify the intent → set a context variable → end the router flow → branch on that context var in
 *  the caller. For a static redirect use type:"flow" + flowId (the engine also backfills flowId). */
export interface RedirectConfig {
  type: 'flow' | 'page' | 'parent_application';
  flowId?: string;                // target flow id (RedirectTarget)
  nodeId?: string;
}

/** generative_journey node config (the agentic node). */
export interface GenerativeJourneyConfig {
  tools?: GenerativeJourneyTool[];
  prompt: string;
  modelType: GenerativeModelType;
  /** author-defined named exits. Each becomes a typed exit the caller can branch on. */
  exitConditions?: { name: string; prompt?: string }[];
  enableZeroTurnMode?: boolean;
  maxTokens?: number;
  maxSteps?: number;
  temperature?: number;
}
export interface GenerativeJourneyTool {
  type: 'knowledgeBase' | 'dataRequest' | 'flow' | 'mcpFlow' | 'modality';
  scopeTags?: string[];
  /** for a knowledgeBase tool: the KB's server UUID. Authoring uses a {kbName} placeholder; the engine
   *  resolves it to the real UUID (captured from the CreateKnowledgeBase response). */
  knowledgeBaseId?: string;
  flowId?: string;
}

export interface GenerativeTextConfig {
  name: string;
  prompt: string;
  modelType: GenerativeModelType;
  temperature?: number;
  maxTokens?: number;
}

/** user_input node -- FREE-TEXT capture. `[CONSOLE-VERIFIED]`
 *  Unlike user_choice (always a value-branch), user_input captures unconstrained text. The captured utterance
 *  is written to a CONTEXT variable via a state modification, NOT into a slot:
 *    metadata.stateModifications: [{ type:"context", name:<ctxVar>, modification:"set",
 *                                    value:{ type:"system", name:"System.utterance" } }]
 *  childNodes: the standard user_input edge PAIR -- two edges to the SAME next node, on
 *    { left:{type:"captured_flow"}, operator:"exists" } and { operator:"not_exists" }.
 *  Downstream nodes read the value as {<ctxVar>:NLX.Context} (e.g. a data_request urlParams token).
 *  No dedicated UserInputConfig exists in the Smithy model -- the capture is entirely the state-mod + edges. */
export interface KnowledgeBaseNodeConfig {
  knowledgeBaseId: string;        // required; resolved from {kbName} by the engine
  name?: string;
  question?: string;              // e.g. "{System.utterance:NLX.System}"
  includeCitation?: boolean;
}

export interface LoopConfig { type?: 'range' | 'list'; start?: number; end?: number; name?: string; }
export interface DefineConfig { name?: string; value?: Operand; }

export interface FlowStateModification {
  type: 'context' | 'slot' | 'local' | 'variable' | 'system';
  name?: string;
  modification?: 'set' | 'clear' | 'increment' | 'decrement' | 'push' | 'pop' | 'custom' | 'shift';
  value?: Operand;
}

/** ⚠️ DEVIATES FROM SDK: verified model ids. Do NOT use pre-GA spellings like "anthropic-sonnet" or
 *  "anthropic-haiku-4.5" — real-world testing accepts only these exact ids. */
export type GenerativeModelType =
  | 'amazon-nova-micro' | 'amazon-nova-2-lite'
  | 'anthropic.claude-haiku-4-5' | 'anthropic.claude-haiku-5-5'
  | 'anthropic.claude-sonnet-5' | 'anthropic.claude-sonnet-5-5';
// split nodes take a smaller, separate set (SDK SplitModelType).
export type SplitModelType = 'amazon-nova-2-lite' | 'anthropic.claude-haiku-4-5' | 'anthropic.claude-sonnet-5';

// ============================================================================================
// VERIFIED EXIT-EDGE PATTERNS (build these in childNodes[].conditions[])
// ============================================================================================
//   node status : { left:{type:'node_status'}, operator:'eq',
//                   right:{type:'constant', value:'success'|'timeout'|'failure'|'match'|'no_match'|'continuation'} }
//   choice value: { left:{type:'slot_value_id', name:<slotName>}, operator:'eq',
//                   right:{type:'constant_id', value:<valueId>} }        // valueId = <slotTypeId><ValuePascalCase>
//   slot present: { left:{type:'slot', name:<slotName>}, operator:'not_exists' }
//   ctx branch  : { left:{type:'context', name:<ctxName>}, operator:'contains', right:{type:'constant', value:'CUST'} }
//   unconditional: conditions: []
//
// FREE-TEXT SLOTS: use NLX.AlphaNumeric.
//   ⚠️ DEVIATES FROM SDK: NLX.FreeText is not honoured at runtime — use NLX.AlphaNumeric for free text.
