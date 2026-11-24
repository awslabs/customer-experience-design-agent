# ACXD Node Reference

Authoritative reference for every ACXD flow node type: what it is for, what it MUST bind, how it exits, and its
verified console wire shape. Governed by `../KNOWLEDGE-ARCHITECTURE.md`.

Every fact carries a source tag — **[CONSOLE-VERIFIED]** (proven from a real console export or live
import/validate), **[DOC]** (official Skill Builder course), **[NEURA]**, **[SPECIALIST]**, **[SDK]** (SDK
digest / IDL). An untagged claim is ungrounded — do not rely on it. On a source conflict the higher-precedence
tag wins: [CONSOLE-VERIFIED] > [DOC] > [NEURA] > [SPECIALIST] > [SDK].

## How to read this file

- This file owns **semantics + bindings + exits + when-to-use** for each node.
- It does NOT re-describe the exact TypeScript shape — that lives in the machine-checked IDL,
  `acxd-sdk-idl.ts` (PART B = flow doc + node graph; PART C = per-node config). When you need the precise field
  layout, read the IDL. This file points at it; it never duplicates it.
- The `flow-dsl/` node factories EMIT these shapes by construction — authoring a flow means calling the
  factories, not hand-writing JSON. This reference explains WHAT each node does and WHEN to use it; the DSL is
  the HOW.

## Wire format vs SDK input (the standing divergence)

The console import/export **wire format** and the SDK `CreateFlowCommand` **input** differ for some fields.
This file describes the **wire format** (what the author writes and the engine emits). Known divergences noted
inline where they bite. On any wire-shape conflict, [CONSOLE-VERIFIED] wins. [CONSOLE-VERIFIED]

## Node vocabulary (the verified set)

These node types are confirmed present in real deployed exports: **start, basic, user_choice, split, redirect,
define, data_request, generative_text, generative_journey, escalate**. [CONSOLE-VERIFIED]
The official course also documents **user_input** (intent capture/routing), **loop**, **knowledge_base**,
**multimodal/Live Sync**, **note**, and **exit application** as node types. [DOC]

- **There is NO `terminate`/`end` node type** — flows end via a redirect, an escalate, or an **Exit application**
  node. [CONSOLE-VERIFIED]
- **Exit application** is a real, documented node that ends the session inside ACXD. [DOC] Its wire shape is not
  yet confirmed from a console export — treat as [DOC]-grounded, verify before the DSL emits it (see R4). [DOC]

---

## Failure and Timeout exits — self-managed, never retried at the flow level `[CONSOLE-VERIFIED]`

Every node that calls out to something that can fail or hang exposes **Timeout** and **Failure** exits:
`data_request`, `knowledge_base`, `generative_journey`, `generative_text`, and `multimodal / Live Sync`.

**Rule (applies to ALL of them):** Timeout and Failure are a SINGLE failure mode, and ACXD manages their retry
NATIVELY. Wire BOTH to a brief error/apology `basic` message node, then to the flow's escalation path. **Never
build a flow-level (flow-design) retry around a Timeout or Failure exit** — re-entering a failed/timed-out node
re-evaluates the error locally WITHOUT re-calling the integration (confirmed regardless of Always Retrigger),
so an app-level retry loop just spins and introduces path-loop and logic bugs.

**Why there is NEVER a flow-level retry (two independent reasons):** (1) ACXD's `failure` exit carries NO error
code — a flow cannot tell a transient fault (worth retrying) from a permanent one such as a 404 not-found or an
API response that didn't match the expected slot; they all arrive on the one `failure` exit, so there is no
signal to retry selectively. (2) Even if it could decide, looping does not re-call: re-entering a node that has
recorded a 5xx or a timeout evaluates that failed/timed-out state LOCALLY and completes the loop WITHOUT calling
the API again — confirmed by forcing a 5xx and separately a timeout, with and without Always Retrigger. So route
`failure` and `timeout` to an error message, then escalation. (Adding a SECOND data_request node on `failure` to
re-attempt is also rejected: it duplicates a node to achieve a retry, still cannot distinguish transient from
permanent, and breaks the design rules above.) `[CONSOLE-VERIFIED]`

- This is a CONTROL-PLANE error path. It is distinct from a **business negative** (a successful response with a
  "no result" meaning, e.g. KB `no_match`, "account not found", "no policies") — a business negative is NOT an
  error and gets its own designed path, never the escalation error path.
- A `loop` node is ONLY ever a DATA-PLANE tool (iterate several NON-identical requests). It is NEVER a
  control-plane retry around Timeout/Failure.
- **Exception — the escalation flow is a SINK:** inside the shared escalation flow, a node's Timeout/Failure
  routes to that flow's final `escalate` node (it is already at the handoff; it must never redirect out). See
  the escalation sink rule in the component builders.
- `data_request` `in_progress` is the one exit that is LEFT DISCONNECTED (see data_request below).

---

## start

- **Purpose:** flow entry point; one per flow. May carry state modifications. [CONSOLE-VERIFIED]
- **Exits:** a single unconditional edge to the first node. [CONSOLE-VERIFIED]
- **Shape:** IDL PART B `FlowNode` (type `start`). DSL: `startNode()`.

## basic

- **Purpose:** say a message and/or apply state modifications, then continue. [CONSOLE-VERIFIED] [DOC]
- **Exits:** a single unconditional forward edge. [CONSOLE-VERIFIED]
- **Notes:** messages carry a generated `messageId` + `skipTranslation:false` + `metadata.alternatePhrasings:[]`.
  [CONSOLE-VERIFIED]
- **Shape:** IDL PART B. DSL: `basicNode({messages, stateMods})`.

## user_choice — structured value capture

- **Purpose:** collect a specific value/selection from the user into a **slot**. The designated node for
  structured capture (built-in slot, custom enumerated slot, or a data-request list). [DOC]
- **Binding — the "Options"/placeholder:** author sets the slot via `userChoice({slotName})`; on disk this is
  `metadata.choice.slotId` = the slot name (`selectedChoiceLabel` mirrors it). The
  "resolved placeholder must be filled in" warning is NOT merely "author left slotId blank" — even a POPULATED
  slotId warned pre-fix, because CreateFlow discards the console-shape `source:"slot"`/`slotId` (see the source
  note below). The real fix is the engine's send-time transform to `source:"slotType"`/`slotTypeId`; do not try to
  fix this by editing the on-disk choice block. [SDK-MODEL + CONSOLE-VERIFIED]
- **Slot attachment:** the referenced slot MUST also be in the flow's top-level `slots[]`. Attachment is via
  `slots[]`; `associatedSlotIds` is `[]`. [CONSOLE-VERIFIED]
- **`source`/`slotId` = the CONSOLE-IMPORT shape; the SDK CreateFlow shape is `source:"slotType"` + `slotTypeId`
  (SAME slot-name value).** The SDK `ChoiceConfig` model has NO `slotId` and NO `source:"slot"`
  member — so CreateFlow DISCARDS them, and the node deploys unbound → the "resolved placeholder" warning. The
  deploy engine's `toCommandInput` transforms `source:"slot"→"slotType"` and `slotId→slotTypeId` at SEND time
  (create-flows.ts), so the on-disk `.flow.json` stays console-shape for round-trip parity while the CREATE call
  gets the model shape. AUTHOR via `userChoice()` — never hand-write the choice block. `showChoices:false` for voice capture;
  `choiceDisplayFormat` is the closed enum `default | dropdown`. [SDK-MODEL + CONSOLE-VERIFIED]
- **TWO verified capture shapes** (both bind slotId identically; they differ only in the childNode edges):
  - **Enumerated custom slot** (values known at author time): one childNode PER value —
    `{ slot_value_id(<slot>) eq constant_id(<valueId>) }` — where `valueId = <slotTypeId><ValuePascalCase>` (e.g.
    `xxProductLineVehicle`) — PLUS a final no-match edge `{ slot(<slot>) not_exists }`. [CONSOLE-VERIFIED]
  - **Free-text / built-in slot** (e.g. `NLX.AlphaNumeric`, no enumerated values): exactly TWO edges —
    `{ slot(<slot>) exists }` (captured/forward) + `{ slot(<slot>) not_exists }` (no-match). No per-value
    branches. [CONSOLE-VERIFIED]
- **Slot vs Context variable (when to capture where):** capture into a **slot** when the value is only needed in
  the current flow (slots are flow-local); promote to / read a **context variable** when it must persist across
  flows or cross the Connect boundary. [DOC] (See `acxd-variables-and-state.md`.)
- **Message required:** every `user_choice` carries at least one message (the question), even after a basic node
  that asked; ACXD flags an empty `messages:[]`. A `basic` node may have none. [CONSOLE-VERIFIED]
- **Shape:** IDL PART C `ChoiceConfig`. DSL: `userChoice({slotName, slotType, values?, elicit})` (`elicit` required) — omit `values`
  for free-text; the factory emits the correct shape for each case and cannot leave `slotId` blank.

## user_input — intent capture / routing

- **Purpose:** understand the user's intent and route the conversation (open-ended), captured
  **deterministically**; distinct from user_choice, which captures a specific value. [DOC]
- **Use for:** intent disambiguation / main-menu routing — NOT for binding a value into a slot. [DOC]
- **Status:** documented [DOC]; not present in this project's verified exports and not emitted by the DSL today.
  Verify its wire shape from a console export before relying on it.

## split — branch on data

- **Purpose:** branch on typed conditions, no message. [CONSOLE-VERIFIED] [DOC]
- **Config:** `metadata.split` with the branch conditions (one edge per branch + a default). A split is a deterministic branch on typed conditions — it does NOT run an LLM and carries NO `modelType` (only Generative Journey, Generative Text, and Multimodal nodes have a model). [SDK-MODEL]
- **Exits:** one edge per branch (typed condition on a context/variable operand) + an empty-conditions default
  edge. Uses `contains`/`eq`/`gte` etc. on the operand. [CONSOLE-VERIFIED]
- **Shape:** IDL PART B/C. DSL: `split({branches, model, withDefault})`.

## redirect — one-way jump to another flow

- **Purpose:** transfer control to another flow. **One-way** — it does NOT call-and-return; downstream logic in
  the target flow continues from there. [CONSOLE-VERIFIED]
- **Config:** `metadata.redirect { id, intentId, type:"intent" }` where `id == intentId == targetFlowId`. NOT
  `{type:"flow", flowId}` (that shape is not what the console emits). [CONSOLE-VERIFIED]
- **Exit:** a single `{ node_status eq "continuation" }` child edge (fires if the target returns control). May
  carry state modifications (e.g. set `escalationReason` before redirecting to escalation). [CONSOLE-VERIFIED]
- **`recognized_flow` redirects are NOT SDK-creatable** — the create path rejects them; classify intent → set a
  context var → branch in the caller instead. [CONSOLE-VERIFIED]
- **Shape:** IDL. DSL: `redirect({toFlowId, stateMods})`.

## define — declare a local

- **Purpose:** declare a flow-local value (constant or computed), used to seed a value or hold a literal. [CONSOLE-VERIFIED] [DOC]
- **Key use:** ACXD has NO "set a literal number/boolean" operand — to set a number/boolean context var from a
  literal, `define` a local (`{type:"constant", value:0|true}`) then set the context var from
  `{type:"local", name}`. [CONSOLE-VERIFIED]
- **Shape:** IDL PART C `DefineConfig`. DSL: `define()`, or the `setNumber`/`setBoolean` setters that emit the
  define-local pattern automatically.

## loop — data-plane iteration (NOT a control-plane retry)

- **Purpose:** iterate a path to make several NON-identical calls — e.g. several different GET lookups, several
  different POST writes, or several different KB queries. `[CONSOLE-VERIFIED]`
- **Wire shape:** `metadata.loop { type:"range", start, end, name }`; two edges — an unconditional edge = the
  next iteration (wire it to the path to repeat), and `{ node_status eq "continuation" }` = iteration finished.
- **NEVER a retry mechanism for Timeout/Failure.** Those are self-managed (see the Failure/Timeout rule above).
  The only reason to loop over a data_request / knowledge_base is a deliberate data-plane optimisation
  (multiple non-identical requests), never to re-attempt a failed/timed-out call.

## data_request — call an integration

- **Purpose:** the **Data Request Node** — calls a configured **Data Request Resource** (external API, static,
  or MCP) at an exact point in the flow and makes its output available downstream. The Resource defines the
  call (method/URL/headers/schemas); this node decides WHEN it runs and supplies the parameter values. [DOC]
- **Node binding:** `dataRequests:[{ type:"custom", variableId, name (== variableId), payload:{type:"recursive",
  value:{...}}, urlParams, headers:{}, alwaysRetrigger }]`. The binding field is **`variableId`** (== `name`).
  [CONSOLE-VERIFIED]
- **`alwaysRetrigger`** is a CACHING/latency control (NOT a retry switch): `true` (the DSL default) calls the API
  each time the node runs; `false` reuses the first response within the flow. Discovery flips it to `false`
  per-API only for static data (latency / backend-load saving). 
- **Two places a node supplies values (usable together, on ANY method):** `urlParams` (a token map substituted
  into `{paramName}` placeholders in the Resource's URL, path or query) and the node **`payload`** (the JSON
  request BODY). `payload` is `{type:"recursive", value:{ field: operand, ... }}`; a member may itself be a
  nested `recursive` object, so **nested JSON bodies are supported** (as are arrays). Leaf operands are
  `{type:"constant", value:"{ref:NLX.Kind}"}` or a typed operand for number/boolean sources. The Resource's
  `requestSchema` DESCRIBES the body (and marks fields sensitive); the node `payload` is what actually SENDS it.
  `[SDK-MODEL: NodeDataRequest.payload / OperandType recursive; leaf shape matches the reference flow export]`
  - A `urlParams` key with no matching `{placeholder}` in the URL is **silently not delivered**; an unresolved
    `{placeholder}` (no matching urlParams KEY) raises `400 UNSUBSTITUTED_PLACEHOLDER`; a key present-but-empty
    substitutes and sends. The engine pre-flight fails on the first (check 16) and on a required
    `requestSchema` field the node does not supply (check 17).
  - **Choosing the channel:** follow the API's contract (its OpenAPI). For contracts we generate (mocks), prefer
    a **flat JSON body** for POST writes and for sensitive inputs (PIN, tokens: keeps them out of the URL and
    access logs), and URL params for GET reads. That is a preference for simplicity, NOT an ACXD limit.
- **Exits — FOUR:** `in_progress / success / timeout / failure` (emitted in THAT order — CreateFlow binds them by
  POSITION). `[CONSOLE-VERIFIED]`
  - **`in_progress` MUST be left DISCONNECTED** (no target). `[CONSOLE-VERIFIED]` Async operations are out of
    scope this release; a wired `in_progress` is silently collapsed onto the success target by CreateFlow. The
    builder auto-terminates it and REJECTS a wired one. (A new console in-progress delay switch exists but is not
    in the SDK yet — do NOT author it until it is.)
  - **`timeout` + `failure`** follow the Failure/Timeout rule above: error message → escalation, no flow-level
    retry.
  - **`success`** proceeds to the next step.
- **Reading output:** copy a response field into a context var with a `variable` operand (`var:<variableId>.<field>`
  in FlowSpec), never `field` (counter-intuitive pattern 7). To show it in a message, copy it to a context var and
  write `{name:NLX.Context}`. Only top-level response fields resolve. [CONSOLE-VERIFIED]
- **Shape:** IDL PART B/C. DSL: `dataRequest({variableId, urlParams, body, stateMods})`; FlowSpec `params` (URL)
  and `body` (JSON body, nested allowed). See `acxd-integrations.md` for
  the Data Request RESOURCE (implementation types, request/response models).

## generative_text — LLM writes a local

- **Purpose:** dynamically create / rewrite / summarize / classify / format text in a single step; output stored
  in a local. Single-shot — no multi-turn reasoning or tool use. [DOC]
- **Config:** `metadata.generativeText { modelType, name (= the produced local), prompt, maxTokens, temperature }`. `modelType` defaults to the project's **Q2 data-collection model** (single-shot generation); overridable per node in Flow Design Step 9c. Only `GenerativeModelType` values are valid.
  [CONSOLE-VERIFIED]
- **Exits:** `success / timeout / failure`. [CONSOLE-VERIFIED] `timeout` + `failure` follow the Failure/Timeout
  rule above (error message → escalation; no flow-level retry).
- **Silent:** the node shows nothing to the caller. Its output is only a local; to present it, put
  `{<local>:NLX.Local}` in the message of the node that follows (e.g. before a decision question). Write the prompt
  as an instruction to produce the text ("Write the quote summary…"), not to speak it. The FlowSpec build fails when
  the local is never shown or used. [CONSOLE-VERIFIED]
- **Shape:** IDL PART C `GenerativeTextConfig`. DSL: `generativeText({producesLocal, prompt, model})`.

## generative_journey — agentic node

- **Purpose:** complete a multi-step task that needs flexibility (variable order, clarifying questions, tool
  use) but still has controlled tools and defined outcomes. The agentic counterpart to deterministic capture.
  [DOC]
- **Config:** `metadata.generativeJourney.prompt` declares the role/context/actions/style AND the named exits in
  prose; optional `metadata.tags:[{label}]` (analytics tags). [CONSOLE-VERIFIED]
- **Named exits wire POSITIONALLY:** each named exit is a childNode `{ System.gjConditionIndex eq <index> }`
  where `<index>` is the 0-based order the exit is declared in the prompt — PLUS `timeout` + `failure` status
  edges. The exit NAMES live only in the prompt text; the wiring is by index. Do NOT wire a named exit as
  `{ node_status eq "<name>" }` (that does not bind — it was the desync bug). [CONSOLE-VERIFIED]
- **Tools (KB + data requests):** a Generative Journey calls a KB or data request at runtime ONLY via
  `metadata.generativeJourney.tools[]`. Prose in the prompt guides tool use but does NOT attach a tool — the
  model can only call tools present in the array. KB tool: `{type:"knowledgeBase", knowledgeBaseId:"{kbName}",
  prompt, scopeTags:[]}` (engine resolves `{kbName}`→UUID). Data-request tool: `{type:"dataRequest",
  dataRequest:{type:"custom", dataRequestId, payload:{},params:{},headers:{}}, prompt, scopeTags:[]}`. Array
  order = selection priority. See `acxd-agentic-and-prompting.md` "Agentic tools" for the attachment rule set
  (caps 4–6 data requests / 1–2 KBs, description-quality gate, order-aware placement, per-tool prompt).
  [CONSOLE-VERIFIED]
- **Shape:** IDL PART C `GenerativeJourneyConfig`. DSL: `generativeJourney({prompt, exits, dataCapture?, tools?, tags})`
  where `exits: [{name, prompt}]` (emits `generativeJourney.exitConditions[]`) — exits derived by index (0-based,
  prompt order), so a named exit cannot desync from its edge. Optional `dataCapture:[{slotName,required}]` emits
  the dataCapture block + a `data_captured` exit ("Exit when complete"). Optional `tools:[{kb,prompt}|{dataRequest,prompt}]`
  emits the tools[] array (see above). [CONSOLE-VERIFIED]

- **Branching on a captured value:** a journey cannot set a context var, and a split can only test whether a slot
  exists. To branch on WHAT was captured, copy the slot into a context var on the next `basic` node
  (`"from": "slot:<name>"`), then split on that var. See FLOWSPEC.md "Branching on a value a Generative Journey
  captured". [CONSOLE-VERIFIED]

## knowledge_base — answer from a KB (dedicated node)

- **Purpose:** answer a question from a knowledge base as a deterministic step (distinct from a Generative Journey that
  references a KB as a tool). [DOC]
- **Config:** `metadata.knowledgeBase.knowledgeBaseId` — the DSL authors a `{kbName}` placeholder the engine
  resolves to the KB's UUID at create time.
- **Exits — FOUR: `match / no_match / timeout / failure`.** `[CONSOLE-VERIFIED]` `match` = an answer
  was found; `no_match` = no answer (a BUSINESS NEGATIVE — give a no-answer message and continue, do NOT
  escalate); `timeout` + `failure` = the self-managed error mode → error message → escalation (see the
  Failure/Timeout rule above).
- **Shape:** IDL. DSL: `knowledgeBaseNode({kbName, question})` emits all four exits.

## escalate — hand off to a human

- **Purpose:** eject the conversation to the Escalation path on the Agentic CX block for human handoff (user
  asked for a person, business rule, unresolvable task). [DOC]
- **Config:** no config block. A single `{ node_status eq "continuation" }` child edge (a Connect flow may route
  the conversation back via that path). Set any handoff summary in a PRIOR node's state mods. [CONSOLE-VERIFIED] [DOC]
- **Wording rule:** escalate on the CALLER's signal (asks for a human, out of scope) — not on a tool
  error/timeout/missing info. [DOC]
- **Shape:** IDL. DSL: `escalate()`.

## multimodal / Live Sync — agentic front-end node

- **Purpose:** an agentic node coordinating voice + a digital front end (Touchpoint SDK): navigation/input/custom
  frontend actions, tools, exit conditions. Web front-end capability. [DOC]
- **Status:** [DOC]-grounded; not built in this project's DSL yet. A dedicated build workstream — verify shapes
  from an export before emitting.

## note — canvas sticky

- **Purpose:** a non-functional canvas annotation. No runtime effect. [CONSOLE-VERIFIED]

---

## Conversation termination (per-use-case design decision) [DOC][NEURA]

A conversation can end two ways — a deliberate per-use-case choice (captured in discovery, see R4):
1. **Exit application** node — terminal; ends the session INSIDE ACXD. Use when ACXD is the final word (FAQ
   resolved, self-service task complete, no further Connect routing needed). [DOC]
2. **Return to Connect** — the Agentic CX block routes on the **exit condition** ACXD returns; use when the
   Connect contact flow must act further (queue, human transfer, more IVR). The **escalate** node is the handoff
   mechanism (with a continuation path back). [DOC][NEURA]

Choose by outcome: does the conversation END in ACXD, or RETURN control to Connect for further routing? [NEURA]

## Deterministic vs agentic — node-selection governance [NEURA][DOC]

AWS's articulated best practice — apply it, do not leave node choice to guesswork:
> Steps that require precision (identity verification, compliance disclosures, payment processing) are
> DETERMINISTIC. Steps that require judgement, open-ended understanding, or reasoning across systems are
> AGENTIC. Both in the same conversation, under one governed flow. [NEURA]

- **Deterministic** (precision/compliance/auditable): `user_choice`, `split`, `data_request`, `define`.
- **Agentic** (judgement/flexible ordering/open-ended): `generative_journey`.
- **Generative Text vs Generative Journey:** single-shot text transform → `generative_text`; multi-step task
  with tools / variable order / clarifying questions → `generative_journey`. [DOC]

(Fuller design guidance lives in `acxd-flow-design.md` + `acxd-agentic-and-prompting.md`; this section is the
node-level summary and points there rather than duplicating it.)

## Naming (authored identifiers) [CONSOLE-VERIFIED]

Every authored identifier — flow ids, slot ids, context vars, analytics tag labels, exit conditions, authored
split-matched values — is **camelCase, letters only, no digits / hyphens / underscores / colons. No exceptions.**
The ONLY exception is the Workspace/Application display NAME, covered in
`acxd-variables-and-state.md`. [CONSOLE-VERIFIED]

## What import does NOT carry

Import brings the flow definition (nodes, edges, slots, config). It does NOT carry runtime bindings that live
outside the flow doc — e.g. the KB's server UUID (the engine resolves `{kbName}` at create), the deployed
application/build/deploy state, or Connect-side wiring. Author the `{kbName}` placeholder; the engine resolves
it. [CONSOLE-VERIFIED]


## Flow envelope (every flow) [CONSOLE-VERIFIED]

Each flow object: `{flowId, nodes, aiDescription, untrained:true, slots[], type:"multilingual",
masterLanguageCode:"en-US", languageCodes:["en-US"], mirroring:"none"}`. Per-node `modalities:{}` (an object) +
`canvasMetadata`; message blocks carry a generated `messageId`. The DSL emits this envelope; author via the
factories, never hand-write it.
