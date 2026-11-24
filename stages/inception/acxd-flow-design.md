---
slug: acxd-flow-design
number: 2.75
name: ACXD Flow Architecture Design
plugin: acxd
phase: inception
execution: ALWAYS
condition: Runs for all ACXD engagements. Platform config must precede this stage — flow decisions depend on knowing available integrations, LLM providers, channels, and security boundaries.
lead_agent: acxd-platform-agent
support_agents:
  - aidlc-architect-agent
mode: inline
produces:
  - acxd-flow-architecture
  - acxd-variable-map
  - acxd-prompt-specs
  - acxd-analytics-tag-vocabulary
  - acxd-metrics-mapping
consumes:
  - artifact: acxd-platform-config-spec
    required: true
  - artifact: acxd-user-stories
    required: true
  - artifact: acxd-cx-discovery-report
    required: false
  - artifact: acxd-integration-inventory
    required: false
  - artifact: requirements
    required: false
requires_stage:
  - acxd-platform-config
sensors:
  - required-sections
scopes:
  - acxd-platform
  - acxd-usecase
  - acxd-platform-poc
  - acxd-poc
  - enterprise
  - feature
  - mvp
  - classic
  - workshop
inputs: Platform config spec, CX discovery report, integration inventory, requirements
outputs: acxd-flow-architecture.md, acxd-variable-map.md, acxd-prompt-specs.md, acxd-analytics-tag-vocabulary.md, acxd-metrics-mapping.md (under this stage's record dir, engine-resolved)
---

# ACXD Flow Architecture Design

> **MANDATORY STAGE-OPEN EMISSION — the first thing the user sees in this stage (reading the stage file first is fine).**
> Emit the H1 header line AND the intro line below it VERBATIM — copy both exactly as written here, word for word.
> They are fixed strings, not a description to paraphrase: do NOT reword, summarise, shorten, regenerate, or
> re-emoji either line. The `#` header must render as a real heading the user sees (NOT a code block, NOT a plain
> sentence). Emit exactly these two lines:
>
> # 🗺️ ACXD Flow Architecture Design
>
> Designs the flow topology for each use case — deterministic vs agentic segments (per the Agentic Design Principle), the default-flow mapping, variable strategy, Generative Journey prompt specs, and the analytics tag vocabulary. **Produces:** the flow architecture, variable map, prompt specs, and analytics tag vocabulary that drive resource creation and flow build.
>
> This is not optional and it does NOT degrade as context grows or the work feels urgent: a stage that opens without
> this hero header is as incomplete as one that ends without its `# 🗺️ ACXD Flow Architecture Design Complete` message (core
> stage-protocol §2). The opening header and the completion line are a matched pair — same emoji, same standard. Use
> the emoji exactly; never choose or re-check it.

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

This stage designs the flow graph for every use case identified in CX Discovery. Each flow is decomposed into
a node graph with deterministic-vs-agentic classification per interaction segment. The output is a complete
flow architecture that drives resource creation, flow build, and backend design downstream.

## Steps

### Step 0: State the user stories this design is built on (informational, no stop)

Read the approved user stories from the User Stories stage record (`acxd-user-stories.md`). That record is the
working copy; the scoping snapshot is a read-only point-in-time copy and is never edited. State them to the user
in ONE short message, then continue straight to Step 1. Do not ask a question and do not offer options here:

*"Flow design is built and tested against these approved user stories: <IDs and short titles>, <count> in total
(scoping snapshot <timestamp>). To change them, go back to User Stories & Scoping."*

**If the engine reports that something `acxd-user-stories` used changed after it finished**, show its line as
required and follow the core rule for that question.

> **The user stories are the minimum requirement.** All flow design is assessed end to end against the approved
> user stories and must meet them as the MINIMUM requirement, or the solution fails systems integration testing
> and must be redesigned. Stories describe end-to-end outcomes, not flows or nodes: a use case stays one conversation in one
> flow and many stories are delivered inside it; the design (SoP, API schema, design principles) decides the nodes; the stories are the floor the whole flow
> set must satisfy.

### Step 1: Design the Flow Graph per Use Case

For each use case in the CX discovery report, design the high-level flow graph:

> **The solution's OpenAPI schema STEERS this design — for every integration option, no exception.** By here
> there is one authoritative OpenAPI schema FILE per integration in `customer-context/` (user-provided for
> options 1/2, agent-generated and written there during discovery for option 3). Read it from `customer-context/`.
> If an integration has no file there, stop and write it now to the CX Discovery rules (Step 4 and Step 6) before
> designing; never design from candidate operations in the inventory. Design the flows around the operations the schema exposes: a data request maps to a real
> operation, its params/response come from the schema, the flow sequence is shaped by what the API can serve.
> Do NOT design a flow step that depends on an operation the schema does not contain. If the design genuinely
> needs an operation the schema lacks, that is a gap for the API-capability `[HUMAN-REVIEW]` gate (which, for a
> generated schema, can add the operation on human approval) — never silently assume an operation into
> existence, and never edit a user-provided schema.

**Design from outcomes, not from requirements.** Read the stories and SoP steps as outcomes the whole flow must
deliver, never as a list of nodes. Lay out the conversation first, then add a node only for a reason in
keep the conversation together. A typical signed-in use case is:
```
Generative Journey (greet, intent, collect) → sign-in capture → verify (data request + split)
  → signed-in Generative Journey (the account work) → deterministic result (data request) → end / escalation
```
With no sign-in, the first journey does all the conversational work.

For each flow, specify:
- **Entry point** — how the customer arrives (Connect contact flow → ACXD, chat widget, Live Sync trigger)
- **Node sequence** — the ordered graph of ACXD nodes from greeting to resolution
- **Exit paths** — successful resolution, escalation to human, timeout, error fallback
- **Redirect nodes** — where the flow transfers control ONE-WAY to another flow (e.g. auth, escalation)

> **Redirect is ONE-WAY — design for it at architecture time.** `[CONSOLE-VERIFIED]` A Redirect transfers control to
> another flow and does NOT return — there is no call-and-return / subroutine. A flow either **ends** (control
> returns to the application / Amazon Connect) or **Redirects onward** to the next flow; nodes placed *after* a
> Redirect are unreachable. Design consequences you MUST honour here (getting this wrong produces an
> architecture that passes this gate but cannot be built):
> - **"Collect fields / explain something, THEN continue the same journey" is INLINE**, never a Redirect to a
>   separate flow that "comes back". Field capture lives inline in the flow that needs it.
> - A **Redirect target must be genuinely terminal or forward-chaining**: e.g. `billingEscalation` (terminal
>   hand-off). It never "returns to caller".
> - A **Q&A / knowledge journey** (e.g. a coverage-FAQ agentic journey) is reached by NLU intent
>   (its `aiDescription`) or mapped to Fallback/Unknown — NOT by a redirect-and-return from a parent.
> - To route to a recognised intent, use **classify-and-return-via-context-variable**: the router sets a
>   context variable and ends; the *caller* branches on it. (`recognized_flow` redirects are rejected on create.)

Produce one flow graph diagram (Mermaid or ASCII) per use case in `acxd-flow-architecture.md`.

### Step 1b: Map the four Application default flows

An ACXD Application has four default-flow assignments — **Welcome / Fallback / Unknown / Escalation**. Which
flow fills each slot is a design decision, not a default; map them deliberately:

| Default | Maps to | Why |
|---------|---------|-----|
| **Welcome** | The **entry** flow — lean per the Agentic Design Principle | Every conversation starts here. Design the greeting and any early identification to the flow's design lean (Step 2 / Step 9b): in hybrid/agentic modes this is a **conversational, agentic** welcome and natural customer identification, NOT a rigid one-question-at-a-time capture. When the use case genuinely needs an identity gate, place the auth-verify component here — but only the verify **decision** is deterministic (the decision floor); the factor **collection** can still be agentic. Not every use case needs an identity gate at Welcome — add one only when a downstream step requires a verified identifier. |
| **Fallback** | The **agentic journey** flow | In an agentic design the Generative Journey IS the catch-all — it reasons about whatever it's given. |
| **Unknown** | The **agentic journey** flow (same as Fallback) | "Nothing matched" is a classifier-era concept; the honest answer is to let the agent handle it. **Do NOT author a separate "nothing matched" flow.** |
| **Escalation** | The **shared escalation component** flow | Single shared hand-off path; see the escalation component pattern. |

> **Dual-role rule — a flow that is BOTH a forward-chain step AND a default (Fallback/Unknown) handler must not
> assume forward-chain context on entry.** `[CONSOLE-VERIFIED]` A flow mapped to Fallback/Unknown is the catch-all: it
> can be entered at ANY point in the conversation, possibly with NONE of the context a linear predecessor would
> have set. The SAME flow used as a forward-chain step (e.g. `newIntake → coverageAdvisor → discounts`) is
> entered WITH that context. These two entry conditions differ, and a flow that silently assumes the
> forward-chain context will misbehave when hit as the catch-all — an error that passes this gate and every
> build/deploy check, surfacing only in live conversation testing (expensive to find). **Determinism, not
> reasoning:** when you assign a flow to Fallback/Unknown, you MUST resolve its entry-context explicitly — pick
> ONE:
> 1. **Separate the roles** — keep the forward-chain servicing step as its own flow; map a *distinct* agentic
>    journey (which assumes no prior context) to Fallback/Unknown. Cleanest for complex use cases.
> 2. **Make the dual-role flow context-safe on entry** — its opening reads Context Variables defensively
>    (checks what is set, re-elicits or routes to the gate when the expected context is absent), so it behaves
>    correctly whether entered mid-chain or cold as the catch-all.
> **Context tokens in a dual-role flow's prompt are allowed.** On a cold entry an unset `{x:NLX.Context}` token simply resolves empty, so a Generative Journey can carry context and use it when present. What is forbidden is ROUTING that depends on context: an unconditional exit into a context-dependent downstream.
>
> Record which option each dual-role flow uses in `acxd-flow-architecture.md`. Do NOT leave it to "it holds
> together" — state the entry-context contract for every flow that wears both hats.
>
> **This contract is a precondition for Flow Authoring, not optional prose.** Flow build is instructed not to
> author a dual-role flow's forward-chain exit until this contract is recorded here. A dual-role flow left
> without a stated contract is a design-stage gap the build CANNOT catch (the reachability check traces only
> redirect edges, so the Fallback/Unknown cold entry is invisible to it — the cold entry is not a redirect). So the
> cold-entry safety of every Fallback/Unknown flow is decided HERE or not at all; do not defer it to "the build
> will flag it" — it will not.

### Step 1c: Fix each data request's position and inputs (decide HERE, not at authoring)

In one use-case flow, most values are set and read in the same flow, so this is mainly about ORDER: each data
request sits after the nodes that supply its inputs and before the nodes that use its outputs. Record in
`acxd-flow-architecture.md`:

| Data request | Node (flow#node) | Inputs and where each is set | Outputs used by | Leaves the flow? |
|---|---|---|---|---|
| e.g. `getCustomerPolicies` | `billingMain#Get policies` (after sign-in) | `accountRef` (Mark verified) | `billingMain#Get quote` (reads `{getCustomerPolicies.preApprovedDiscountPercent:NLX.Variable}`) | no |

Rule: later nodes in the same flow read a data-request output directly. Only an output that crosses a Redirect or
goes to Connect becomes a context variable (see Step 4's flow-local rule). The authoring stage treats this table as settled and authors to it. Every value that crosses a Redirect
appears here as a context variable.

**Write the completed table AND the reachability result into `acxd-flow-architecture.md` as a named
"Data-request order table" section** — it is a produced artifact the flow-build stage consumes, not a
transient reasoning step. Flow build binds to it (each data request's node, inputs, consumers, promoted values and
the per-path reachability outcome) WITHOUT re-deriving any of it. If the table is absent or incomplete at build time,
that is a design-stage gap to fix in design — not something flow build silently reconstructs.

**Declare terminal sink flows in the contract.** For each flow that is a terminal sink (see "Terminal sink
flows" in `../../knowledge/acxd-platform-agent/acxd-flow-design.md` — a redirect target with ONE sanctioned
exit that never redirects onward), record in the Data-request order table: `sink = yes`, the **variant**
(`escalate` or `record-then-terminate`), and the **single exit** (the Escalate node, or the data_request →
`terminate`). For a callback sink, record the fulfilment mode chosen in discovery (native-queued-callback via
Escalate [voice], or external-system record [any channel / scheduled]). Flow build enforces the sink contract
from this declaration: a declared sink must contain NO `redirect` node, every error/timeout/failure exit must
converge on the single terminal, and it must have no unconnected exits (bar data_request `in_progress`). Do NOT
declare a flow with several onward exits as a
sink — the sink contract is opt-in for genuine dead-ends only.

**Reachability check — verify every consumer can actually reach each value on EVERY entry path.** After building
the table, walk the flow graph for each crossing value: confirm that on *every* path which reaches a consuming
flow, some upstream flow on that path has set the value. A value set on only ONE branch (e.g. vehicle details captured only on the
new-customer branch) is NOT available to a node reached by a DIFFERENT branch (e.g. Get quote reached from the
signed-in branch, which never captured them). When a
consumer has an entry path that leaves a value unset, resolve it AT DESIGN TIME — give that path its own source
for the value (a data-request field on that branch, a default, or a distinct owning flow) — and record it in the
table. Do NOT leave a consumer reading a value that one of its entry paths never sets; that gap otherwise surfaces
late, at authoring or runtime, as an unset token.

**Data-request inputs — check every param, not only crossing values.** For each data request in the table, list
every URL param it needs and its source on every path to the call (a slot captured earlier in the same flow, a
context var set upstream, or a fixed default). A param whose value is only decided LATER in the journey (e.g. a
`tier` chosen after the quote call) is a sequencing defect: move the call so its inputs exist. Never drop an
input, or a business rule that depends on it, to make a path pass (fix the design; never drop behaviour to pass a check).
Resolve it here; do not leave flow build to pass an empty value.

**Design-vs-Resource Contract consistency pass (run after the data-request contracts are drafted).** The
variable map and flow architecture are written before `resources/data-requests.json` is finalised, so they can
drift from it. Before the gate, reconcile the map/architecture against the ACTUAL resource contracts and record
the result in the Data-request order table. Three checks, each a settled rule (do not re-derive at build):

1. **A split/guard on a data-request field sits in the same flow as the request.** A data-request response
   field is flow-local — it does not survive a Redirect. If the map places a split on such a field in a
   DIFFERENT flow from the one that calls the request, it is unbuildable. Put the split in the owning flow
   (immediately after the call), OR promote the field to a context var set on EVERY path into the consuming flow
   (with an explicit default on paths that never call the request). Also reconcile the FIELD NAME: the name in
   the variable map MUST equal the field name in `data-requests.json` (e.g. map `nonStandardDiscount` vs
   deployed `nonStandard` is a defect — pick one).
2. **Capture slots match the data-request param list 1:1.** Every slot the map feeds to a data request must
   correspond to an actual param on that request in `data-requests.json`, by name and count. Capture one slot per
   question the SoP lists, and give the request one param for each (e.g. `vehicleMake`, `vehicleYear`,
   `postcode`). A map with three capture slots against a request with one param is a defect. Use a single
   free-text slot only when the API takes free text by design.
3. **An `authStatus` (identity) entry guard is scoped to the account-data flow(s) ONLY.** A hard auth guard on a
   flow that is ALSO on the new-customer path (where no one is verified) breaks the approved new-customer journey
   and fails the reachability check (`authStatus` unset on that path). Guard only the nodes that fetch account
   data (they sit after sign-in); never hard-guard a part of the flow shared by the new and existing paths.
   This is the entry-guard companion to the identity-from-verification rule below.

A value listed as "consumed by" a shared flow must be set on EVERY path into that flow (per the reachability
check) — if it is path-specific (e.g. `heldPolicies` is signed-in only),
do NOT list a shared downstream flow as a consumer unless you also specify the cross-fill default for the other
path. Mark each crossing var path-specific vs universal in the map.

**Every variable has a setter, and every enum lists all its values.** Each context variable in the map names the
flow and node that sets it on every path that reads it; a variable no flow ever sets (e.g. a `multiPolicyFlag`
that is only read) is a defect to fix here. For any enumerated string context var (e.g. `escalationReason`), list
EVERY value any flow will set, including system/error cases (e.g. `systemUnavailable` for timeout/failure), so
flow build never invents one. Each escalation reason the SoP distinguishes that a Generative Journey can detect
(out of scope, asks for a person, distress, non-standard request) gets its own named journey exit that sets that
reason; never fold them into one generic handoff exit.

**Flow boundaries: keep the conversation together.** A use case stays in one flow (e.g. `billingMain`) unless a
part passes one of its flow tests; greeting, sign-in, servicing and decision steps are nodes, each for one of its node
reasons. Name every
flow in the use-case namespace (`billingMain`, `billingEscalation`), never `shared…` and never `uc…`. Record the sign-in
node and the context var it sets (`authFlagVar`, e.g. `authStatus`) in the flow architecture.

### Step 2: Apply the Deterministic vs Agentic Framework

For each segment of every flow, classify and justify against the criterion below, then apply the
customer's `agentic_design_principle` (from discovery) as a bias on the borderline cases.

<classification-criterion>
**The deterministic DECISION floor is a TEST, not a fixed list.** A segment's DECISION (its outcome/verdict)
MUST be deterministic when getting it wrong is high-consequence and must be auditable — i.e. the verdict must NOT
depend on model judgment. This covers: steps that gate access or make a trust/authorization decision; irreversible
or high-value actions; regulated/compliance-bound steps; anything creating a legal or financial record. **Only the
DECISION is constrained — the data COLLECTION feeding it may be agentic (and is encouraged in hybrid/agentic modes:
e.g. capture identity factors conversationally, then verify deterministically).** Everything else is a CANDIDATE
for agentic handling when it needs open-ended understanding or flexible multi-turn reasoning. Apply the test to each
segment — do not pattern-match on a keyword.
</classification-criterion>

<illustrations>
Examples ONLY (not the defining set — classify by the criterion above, not by matching this table):
| Segment | Typical classification | Why |
|---------|------------------------|-----|
| Credential/PIN/OTP **verification decision** (the pass/fail that GATES access) | Deterministic decision | Decides trust — verdict must not depend on model judgment. *Capturing* the factors may be agentic. |
| Payment / money movement **authorisation** | Deterministic decision | Irreversible, high-value, auditable — explicit confirmation gates. *Capturing* card/amount may be agentic. |
| Regulated disclosure / consent **validity decision** | Deterministic decision | Compliance-bound, legal record. *Capturing* the consent response may be agentic. |
| Open-ended servicing / FAQ | Agentic | Open-ended understanding — Generative Journey + tools/KB |
| Soft identification ("which policy is this about?"), name-for-lookup | Agentic-eligible | Does NOT decide trust or gate access — resembles auth but is not the floor |
| Routing / triage, escalation handoff | Usually deterministic | Fixed logic / fixed handoff — but a triage that needs understanding may be agentic |
</illustrations>

<agentic-design-principle-bias>
Apply the customer's `agentic_design_principle` (discovery state) to the BORDERLINE segments — those the criterion does not
force either way:
- **deterministic:** default borderline segments to deterministic; author a Generative Journey ONLY where it is
  the sole viable option, and CALL IT OUT LOUDLY in the classification rationale when you do.
- **hybrid (default):** classify each borderline segment by **CONSEQUENCE, not structure**. A segment gets a
  deterministic *decision* only when it gates access / moves money / is compliance-bound (the decision floor).
  Everything else — greeting, identifying the customer, gathering inputs, routing, general servicing — **leans
  agentic for the customer experience** (conversational, natural-turn capture), EVEN WHEN the data it collects is
  structured. Structured input is NOT a reason to go deterministic; only a high-consequence *decision* is.
- **agentic:** prefer a Generative-Journey-with-tools for borderline segments (engagement, routing, multi-turn
  capture), collapsing several deterministic steps into fewer reasoning-driven ones where the use case allows.

HARD RULE — the deterministic DECISION floor holds in EVERY mode: for a segment that meets the
classification-criterion above (gates access / irreversible / compliance / legal-financial record), the DECISION
itself stays deterministic even under `agentic` — a data request, Connect-side check, or rules split makes the
call, never the LLM. This does NOT lock the segment's data COLLECTION: capturing the factors agentically (e.g.
account ID + PIN in one natural turn) is fine and ENCOURAGED in hybrid/agentic modes. Never let the global lean
make the DECISION of an access-gating auth step, a money movement, or a compliance gate depend on model judgment.

**Data collection is EXEMPT from the decision floor.** The floor governs only the DECISION / reasoning / approval step (the verdict). HOW the inputs are collected is never constrained by it — collection follows the flow's design lean: **deterministic lean → `user_choice`; hybrid or agentic lean → a Generative Journey with `dataCapture`**, auth collection included. See the Data Collection principle in `acxd-architecture-principles.md`.

**MANDATORY — record a `Collection modality` for every flow that captures input, and DEFAULT it from the lean (do NOT default to deterministic).** For each such flow write `Collection modality: agentic` or `Collection modality: deterministic` into `acxd-flow-architecture.md`:
- **Project lean `deterministic`, OR this flow overridden to deterministic at Step 9b** → `Collection modality: deterministic` (sequential `user_choice`).
- **Project lean `hybrid` or `agentic`** → `Collection modality: agentic` (Generative Journey `dataCapture`) — THIS INCLUDES an auth flow's factor capture. Do NOT record an auth flow as deterministic collection merely because it is authentication; the DECISION is deterministic regardless (the floor), but the COLLECTION defaults agentic in these modes. Recording "deterministic (collection could be agentic)" or leaving it implicit is the defect that produced a clumsy sequential-`user_choice` auth in a hybrid run — state the explicit modality instead.
Per-function overrides from discovery (e.g. `{"authentication":"deterministic"}`) adjust the collection/behaviour
lean — they never move the decision off a deterministic mechanism.
</agentic-design-principle-bias>

### Step 3b: Flow-Set Summary — emit BEFORE generating the artifacts

The flow set (how many flows, each flow's role, the default-flow mapping, and the redirect chains) is the
highest-leverage decision in the entire build — a wrong decomposition baked into the six artifacts is
expensive to unwind, and on a complex use case it is exactly where unaided reasoning drifts. So **before you
generate any of the six flow-design artifacts, emit this single summary table** and state the redirect chains
in one place. This is deterministic (always emit it — do not decide whether it is "needed"), and it is
**non-stopping**: present it, then continue straight into artifact generation. It is a cheap inspection point,
not an approval gate (the gate is Step 10).

| Flow id (camelCase) | Boundary reason (flow test passed) | Role (gate / servicing step / agentic journey / destination) | Default-flow slot (Welcome/Fallback/Unknown/Escalation/none) | Entry context assumed | Redirects onward to |
|---|---|---|---|---|---|
| `billingMain` | entry | agentic journey + sign-in + decision nodes | Welcome + Fallback + Unknown (dual-role, Step 1b) | none (cold entry) | `billingEscalation` |
| `billingEscalation` | 4 (reached from several places) | destination | Escalation | `escalationReason` set | none (terminal) |
| … | … | … | … | … | … |

Rules the table makes inspectable at a glance:
- **Every default slot (Welcome/Fallback/Unknown/Escalation) is filled exactly once** — no slot unmapped, no
  two flows fighting for one slot.
- **Every dual-role flow** (a slot-mapped flow that is ALSO a forward-chain step) names its entry-context
  contract per the Step 1b dual-role rule — never left implicit.
- **Every redirect target is terminal or forward-chaining** (no call-and-return); the "Redirects onward to"
  column makes a stray return-assumption obvious.
- **Each flow names the flow test it passes** (keep the conversation together): reached from several places and never
  returns (e.g. escalation), the Fallback/Unknown entry, or split for size as a stated exception. A flow that passes
  none is merged back as nodes.

If the table exposes a problem (an unmapped default, a dual-role flow with no stated contract, a redirect that
assumes a return), fix the design here — before it is written into six artifacts.

### Step 4: Design the Variable Strategy

Map every variable across all flows. Produce `acxd-variable-map.md`:

**Variable categories:**
- **Slot variables** — captured from customer utterance (name, account number, date, amount)
- **Context variables** — set by flow logic or passed between flows (auth_status, selected_service, escalation_reason)
- **Data Request variables** — populated from backend API responses (account_balance, order_status)
- **System variables** — platform-provided (channel_type, session_id, locale)

**For each variable, capture:**
| Variable | Type | Category | Set By | Consumed By | Scope | Sensitive |
|----------|------|----------|--------|-------------|-------|-----------|

**`Set By` names the node and the condition, per path.** Write `flow#node (when …)` for every path that sets
the value, e.g. `billingMain#Mark verified (verify success)`, `billingMain#Default discount (new customer)`. If one
path into a consumer has no setter, the gap shows here, in the design. Leave whole-graph proof to code (below).

**Request fields table.** Add a second table to `acxd-variable-map.md`, one row per required request field of each
data request: `| Data request | Field | Source (slot / context var / constant) | Set on path |`. Each required
field needs a source on every path that reaches the request node. Flow Authoring binds to this table.

**Unused values are checked by code, not by you.** Fill `Set By` / `Consumed By` from the design, but do not try
to prove across all flows that every value and every data-request response field is consumed. The FlowSpec build
in Flow Authoring does that deterministically and blocks until each finding is fixed or recorded with a reason.
Only note here any response field you already know the design does not need (e.g. an echo of the request), with
the reason, so Flow Authoring can record it in `flowset.json` `unusedFields`.

**The `Type` column is MANDATORY and is the ACXD wire type the authoring stage binds to — decide it HERE, do
not leave it for flow build to re-derive.** For a **context variable** it is exactly one of `string` /
`boolean` / `number`, chosen by this rule (the same rule flow build's Authoring Decision Rules enforce):
- **A var that carries an API field takes that field's type** (a caller-stated value is a `string` field, so its var is `string`). If the var is set from a data-request response
  field, or is sent into a request field, its type is that field's type in the OpenAPI schema: number/integer ->
  `number`, boolean -> `boolean`, string -> `string`. Counts, amounts, percentages and discount levels stay
  `number`; true/false API values stay `boolean`. Never choose `string` for such a var, and never change the API
  field's type to match a var. A typed default (e.g. `0` for a new customer's discount level) is set directly as a
  number/boolean value at authoring time (FlowSpec `{ "set": var, "value": 0 }`).
- **`number`** — also for any counter or value used in arithmetic or a numeric split (e.g. `authAttempts`
  incremented and compared `>= maxRetries`).
- **`string`** — for every other flag or value set from a literal and not tied to an API field: author
  `'yes'`/`'no'`/`'verified'`. (A boolean/number set from a string constant trips the deploy validator.)
- **Auth flag convention:** the authenticated flag is ALWAYS a `string` context var set to the literal
  `'verified'` on Mark verified (as `buildAuthVerify` does), whichever way the auth flow is built. Never type it
  boolean, so downstream checks behave the same in every flow.
- **Identity data comes ONLY from verification (no pre-auth lookup).** Customer identity
  and account data (e.g. `accountRef`, `customerName`, `customerType`, tier, policy list) is set ONLY from the
  auth verify response, on Mark verified. No flow may call a customer/account lookup, or promote any account
  field to context, BEFORE auth passes. Reasons: data in context before verify can be read or spoken downstream;
  an unauthenticated lookup lets a caller probe which account numbers exist (enumeration); and the caller is
  asked for the identifier twice. **If the design needs a new-vs-existing split before auth, ASK the caller**
  (e.g. "Are you an existing customer?") and route existing customers into auth. Never look the account up to
  decide. In the variable map, every identity/account context var's `Set By` must be the auth flow's Mark
  verified node (or a flow that runs strictly after auth passed). Check this in the Flow Responsibility
  Contract reachability pass: no consumer may be reachable on a path where the value came from anything but
  verification.
- **Branching on a data-request boolean** (e.g. `verified`, `nonStandard`): branch inside the owning flow with a
  variable equality split (`variableEqCondition`), comparing to the BOOLEAN constant `true`/`false` — NOT the
  string `'true'`. [CONSOLE-VERIFIED: ACXD compares a JSON boolean response field to a boolean constant
  correctly; comparing it to the string `'true'` FAILS, so a valid customer is wrongly rejected.] Keep the field a real boolean in the contract — where we own the payload (the
  mock and any harness-designed contract), decision/flag fields (`verified`, `found`, `nonStandard`, eligibility
  verdicts) are real JSON booleans and the split compares boolean-to-boolean. Do not stringify a boolean field,
  and do not change the contract to strings to make a split work.
Record the chosen `string|boolean|number` in the Type column for every context variable. The authoring stage
authors to these types verbatim and does not re-type them. (Slot variables keep their slot-type id in Type;
data-request variables note the response field type.)

**Slot inventory (MANDATORY) — every capture point, decided HERE.** Add a **Slots** section to
`acxd-variable-map.md` listing EVERY slot any flow captures — custom enumerated AND built-in free text — so flow
build never invents a slot:

| Slot | Slot type | Custom or built-in | Values (custom only) | Sensitive | Captured by (flow / node) | Promoted to (context var, if it crosses a flow) |
|---|---|---|---|---|---|---|

Rules (see "Slots" in `acxd-variables-and-state.md` for the built-in list):
- A slot is needed for **every value a node captures from the customer**, including values a Generative Journey
  collects via `dataCapture` and free-text inputs a data request needs (e.g. a risk description passed to a quote
  API). If a data request needs a customer-supplied value, its slot is in this table.
- **Custom** (no prefix, declared in `slot-types.json`) only for a closed list the flow branches on; **built-in**
  `NLX.AlphaNumeric` for everything open-ended (it is the only built-in ACXD accepts; a number is captured as text). Built-ins are NEVER added to `slot-types.json`.
- A **context variable is not a slot.** If a component needs to capture a value (e.g. a callback window), list the
  slot here and, separately, the context variable it is promoted to.
- Every custom slot type named here must appear in resource creation's `slot-types.json`; every slot here must be
  attached by the flow that captures it. Flow build binds to this table verbatim.

**Variable lifecycle rules:**
- Slots are ephemeral within a Generative Journey turn unless explicitly promoted to context
- Context variables persist across the session and are the ONLY variables that cross a Redirect into another flow
- **Data-request outputs are flow-local.** A `{request.field:NLX.Variable}` is available only *within* the flow
  whose `data_request` node produced it — it does NOT survive a Redirect. If a downstream flow needs it, design
  the producing flow to promote it to a context variable (`ctxX = {request.field}`), then read `{ctxX:NLX.Context}`
  downstream. Decide this at design time: any value that must cross a component boundary is a **context variable**,
  not a data-request field or flow-local. `[CONSOLE-VERIFIED]`
- Sensitive variables (PII, PCI) must be flagged for redaction in analytics

### Step 5: Write Generative Journey Prompt Specifications

**First, merge review.** Before writing prompts, list each flow's Generative Journeys per path in order in a
"Journey merge review" table (journey, path, tier, what it collects, tools/KBs, keep or merge, reason). Merge two
journeys, or record why not, when any of these holds:
- **Same path:** the caller must pass through both, with only message or state-setting nodes between them.
- **Same tier and tools:** both on one path at the same trust level, or with overlapping tools or knowledge bases.
- **Single function:** a journey that only does one thing (one capture, one tool, one knowledge base).
- **Repeated capture or topic:** it captures a slot, or covers a subject, an earlier journey on the path already does.
The only reasons to keep two journeys apart: a change of trust level, a deterministic decision between them, a
different set of required captures (a journey's `dataCapture` is one fixed slot list, so paths that capture
different fields, such as one per product line, each need their own journey), or an explicit design rule (keep the
conversation together).

**Then, a conversation script per story path.** For each happy and failure path, write the journeys in order, what
each asks and does, and what it hands on. Write all prompts from this script together, never one at a time.

For every Generative Journey node in the flow architecture, write a detailed prompt spec in `acxd-prompt-specs.md`.

**Prompt specification template:**
```
## Generative Journey: {flow-name} / {journey-name}

<use-case>
Who the business is, what this conversation is for (the caller's goal), and where this journey sits in it:
what came before, what this journey must achieve, what happens after it.
</use-case>
<persona>
Name, tone and channel style. The same text in every journey of the flow.
</persona>
<previous-context>
What the caller has said or done before this journey, one line per path into it ("Start of the conversation" for
the first journey). Then every value available now, with where it was set and what it means, e.g.
{productLine:NLX.Context} = the product line the caller chose in Welcome (vehicle, home or contents).
You have no memory of earlier parts of the conversation except these values. Never ask for them again.
</previous-context>
<task>
Numbered steps, in order. For each step: what to ask (the actual questions, from the SoP), one or two at a time,
and what to confirm back before moving on.
</task>
<data-to-capture>
Each captured slot: what it means, valid values or format, and when it counts as captured.
</data-to-capture>
<tools>
Each tool: what it returns, when to call it, when not to, and what to say if it returns nothing.
</tools>
<rules>
Compliance and privacy, what never to say, and what this journey must not decide (verdicts, prices and access are
decided by later steps, not here).
</rules>
<exit>
The completion condition (everything in <data-to-capture> captured and confirmed), and each named exit with its
trigger, e.g. humanHandoff: the caller asks for a person or sounds distressed.
</exit>
```
Write each section in full, specific to this journey. The prompt is the journey's only instructions.

### Step 5b: Generative Journey Tool & KB Review — attach by the design lean `[HUMAN-REVIEW]`

A Generative Journey can only call a knowledge base or data request at runtime if it is attached as a **tool**
(prose in the prompt guides use but does not attach it). Its whole value is answering the caller OFF-SCRIPT from
those tools — a Generative Journey with none is just a `user_choice`. Attachment posture follows the design lean
(Agentic Design Principle; architecture-principles Principle 12), confirmed by the discovery off-script-scope
posture:

- **Agentic / Hybrid → default-ON (opt-out).** Pre-populate each Generative Journey with ALL eligible read data
  requests + ALL knowledge bases. Breadth is the default; dropping one is the exception that needs a reason.
- **Deterministic → opt-in.** Attach only a tool/KB with a specific reason to be there.

**HARD SAFETY FLOOR (both leans).** A data request is eligible for default attachment ONLY if it is READ-ONLY and
ACCESS-SCOPED to the authenticated caller, AND the Generative Journey sits AFTER authentication on every path to
it. A request that could return another caller's data (unfiltered list, lookup on an arbitrary id) is NEVER
default-attached — attach it only with explicit `[HUMAN-REVIEW]` sign-off. A write / compute / side-effecting
request is not a Generative Journey tool at all — it is a deterministic `data_request` node in its owning flow.

**ASK the user — present a per-Generative-Journey review table (`[HUMAN-REVIEW]`, structured question per
stage-protocol §3).** This is a data-exposure surface: surface the concrete connection set for every Generative
Journey and STOP for the user, even when the default is clear — the user sees and can prune or restore each
connection before build (the human decides; review tags). For each Generative Journey, show every candidate with its
default state and reason:

```
**TOOLS & KNOWLEDGE — <generativeJourneyName>** (agentic/hybrid: default-ON; review and adjust)
| Tool / KB | Default | Reason (why attached, or exclusion reason) |
|-----------|---------|--------------------------------------------|
| KB coverageKb            | attached | caller may ask coverage questions |
| DR policyRetrieve (read) | attached | caller-scoped read; "what are my policies" |
| DR applyDiscounts        | excluded | compute/side-effecting — not a read tool |
| DR customerLookup (list) | excluded | not caller-scoped (could return other callers) — needs explicit sign-off |
```

**Exclusion gates (reasons to DROP a default-ON candidate — not hurdles to add one):**
1. **Not caller-scoped / not read-only** (the safety floor) — exclude by default; attach only with `[HUMAN-REVIEW]` sign-off.
2. **Description-quality** — the tool's one-line prompt + the data-request/KB description must be sharp enough the
   model won't misfire. Drop a candidate whose description is too weak to call reliably.
3. **Caps** — data-request tools aim 4-6 then hard-cap at 6; knowledge bases aim 1-2 then hard-cap at 2. Beyond
   the cap, keep the top-ranked by relevance x description-clarity.

**Prefer journeys for the caller-facing conversation.** Unless the design lean is deterministic, let Generative
Journeys with data requests and knowledge sources attached as tools carry the conversation, so the caller gets a
natural, conversational experience rather than a fixed sequence of deterministic nodes.

**Per-tool prompt is mandatory** — every attached tool needs a one-line usage hint (when to call, what it
returns, what to do on no answer). Never attach a tool with an empty prompt. **Order = priority:** the attached
`tools` array order IS the selection priority; list sharpest/most-relevant first.

**Record in the prompt spec** (extends the Step 5 template) — list the FINAL attached tools in order:
```
**TOOLS (attached, in selection-priority order):**
1. {kb|dataRequest} {name} — prompt: "{one-line usage hint}"  [relevance: why a diverging caller needs it]
2. ...
```
The flow-build stage authors these via `generativeJourney({ tools: [ {kb,prompt} | {dataRequest,prompt}, ... ] })`
in array order; KB tools use the `{kbName}` placeholder the deploy engine resolves to the server UUID.

**Tool outputs vs promoted values.** A Generative Journey tool's response is available to the model during the
journey only; treat it as NOT promotable to context. Any data request whose output must be stored or cross a
flow (per the Data-request order table) is a deterministic `data_request` node, never a
Generative Journey tool. The same data request MAY also be attached as a read-only tool on a later Generative
Journey to answer questions. [Design rule; whether ACXD can promote a tool response is undocumented, so do not
rely on it.]

### Step 6: Design the Analytics Tag Strategy

Node tags mark positive progress only (milestones, completion, friction), on `basic`, Generative Journey and
`data_request` nodes. Escalation and failure outcomes are not node tags: redirect and escalate nodes cannot carry
tags, so they are segmented by the `escalationReason` context var (record them in the vocabulary as map-only). A
failure tag on a `basic` apology node (for example "Pricing unavailable") is a normal node tag, not map-only: mark
each vocabulary entry with where it lives (node, or map-only).

Define the analytics tag vocabulary for the entire platform. Produce `acxd-analytics-tag-vocabulary.md`:

**Standard tag categories:**
- **Completion tags** — `completion{UseCase}{Outcome}` (e.g., `completionBillPaySuccess`)
- **Escalation tags** — `escalation{UseCase}{Reason}` (e.g., `escalationBillPayAgentRequested`)
- **Milestone tags** — `milestone{UseCase}{Step}` (e.g., `milestoneBillPayIdentityVerified`)
- **Failure tags** — `failure{UseCase}{Type}` (e.g., `failureBillPayBackendTimeout`)
- **Friction tags** — `friction{UseCase}{Signal}` (e.g., `frictionBillPayRetryAuth`)

> **Naming (`[CONSOLE-VERIFIED]`):** analytics tags MUST be camelCase with a category prefix. ACXD silently
> strips colons, hyphens, and underscores, so `completion:bill-pay:success` would deploy mangled as
> `completionbillpaysuccess`. Use a lowercase category prefix (`completion`, `escalation`, `milestone`,
> `failure`, `friction`) followed by PascalCase use-case and outcome segments. The category prefix is
> what the metrics-mapping table below matches on (all `completion…` tags → containment, all
> `escalation…` tags → escalation rate).

**Rules:**
- Every flow MUST fire at least one completion or escalation tag
- Each flow fires its own milestone/failure/friction tags, named in the use-case namespace (e.g. `milestoneQuoteAuthVerified`)
- Tags map 1:1 to the target contact centre KPIs identified in CX Discovery
- Voice and chat channels share the same tag vocabulary (channel is a dimension, not a tag namespace)
- **Each tag fires only on the outcome its name claims.** Place it on the node reached ONLY by that outcome (e.g.
  `completionQuoteAccepted` on the node after an "accepted" branch, not on a node any decision reaches). If the
  flow cannot distinguish the outcome deterministically, rename the tag to what it does measure (e.g.
  `milestoneQuoteDecisionCaptured`) rather than over-claim.
- **Tags go on `basic` or `generative_journey` nodes.** Place a tag for a data-request outcome on the basic node
  its exit leads to (e.g. the "Record quote" node after `success`).

### Step 6b: Analytics → Business Outcome Metrics Mapping

Produce `acxd-metrics-mapping.md` — the explicit link from analytics tags through KPIs to ROI targets.
This artifact is the single source of truth for "what are we measuring and why."

**Mapping table (one row per business metric):**

| Business Metric | Baseline (from CX Discovery) | 30-Day Target | 90-Day Target | Analytics Tag Source | Calculation | Layer |
|----------------|------------------------------|---------------|---------------|---------------------|-------------|-------|
| Containment rate | {baseline}% | +15% | +25% | `completion…` tags ÷ total conversations | ACXD analytics: count tag traversals | ACXD |
| Escalation rate | {baseline}% | -10% | -20% | `escalation…` tags ÷ total conversations | ACXD analytics: count tag traversals | ACXD |
| Avg handle time | {baseline}s | -20% | -35% | N/A — measured by Connect | Connect real-time metrics + Contact Lens | Connect |
| First contact resolution | {baseline}% | +10% | +15% | `completion…` tags with no callback in 24h | ACXD tag + Connect CTR correlation | Both |
| CSAT/NPS | {baseline} | Maintain | +5 pts | Post-contact survey | External survey tool or Connect post-call | External |
| Cost per contact | ${baseline} | -15% | -30% | Automated ÷ agent contact ratio | ACXD containment + Connect agent cost | Both |
| Error rate | N/A (new) | <5% | <2% | `failure…` tags ÷ total conversations | ACXD analytics | ACXD |
| Friction/drop-off rate | N/A (new) | <10% | <5% | `friction…` tags ÷ total conversations | ACXD analytics | ACXD |

**Layer column** indicates where the metric is measured:
- **ACXD** — measured natively in the ACXD built-in analytics dashboard via tag traversal rates
- **Connect** — measured in Amazon Connect real-time metrics, historical metrics, or Contact Lens
- **Both** — requires correlation across ACXD analytics and Connect/Contact Lens data
- **External** — requires an external tool (survey platform, BI tool)

**Key awareness:**
- ACXD analytics are self-contained within the ACXD workspace UI `[GA-GAP]` — there is no native CloudWatch
  export for flow-level metrics. To get ACXD metrics into a unified dashboard, you would need to query the
  ACXD analytics API (if available) or manually correlate.
- Connect metrics (AHT, queue times, agent occupancy) are in CloudWatch and the Connect admin dashboard.
- Contact Lens (sentiment, call summaries) is a separate Connect feature — not ACXD.
- Backend service metrics (Lambda errors, API latency) are in CloudWatch — deployed as CDK alarms.

### Step 7: Design Conversation UX

For each use case, specify the conversation design:

**Persona definition:**
- Name, personality traits, tone (professional/friendly/formal)
- Voice characteristics (if voice channel: TTS voice, speaking rate, SSML usage)
- Error recovery personality (apologetic? matter-of-fact? redirecting?)

**Conversation patterns:**
- **Greeting** — acknowledge the customer, state capability, invite intent
- **Confirmation** — explicit confirmation before irreversible actions (payment, cancellation)
- **Error recovery** — what happens on no-input, no-match, 3x retry, unexpected profanity
- **Silence handling** — voice: re-prompt after N seconds. Chat: "Are you still there?" after timeout
- **Disambiguation** — how to handle ambiguous intent (clarifying questions vs best guess)
- **Channel-aware phrasing** — voice: short, spoken sentences. Chat: can include formatting, links, cards

### Step 8: Channel-Aware Design (Voice, Chat, Live Sync)

For each flow, specify channel-specific behaviour:

- **Voice path** — Connect contact flow entry, ASR considerations, barge-in settings, DTMF fallback, SSML for numbers/dates/amounts
- **Chat path** — widget entry, rich content opportunities (cards, quick reply buttons, carousels), typing indicators
- **Live Sync path** — which voice interactions trigger the visual overlay (forms, selections, payment confirmation), how to handle Live Sync disconnection gracefully
- **Cross-channel** — if a customer starts on chat and escalates to voice, what context transfers?

> **Modalities & Live Sync need the Touchpoint SDK (not modeled build-side yet).** "Modalities" (in-conversation
> UI: Carousel / Card / Date input) and "Live Sync" (the agent driving the customer's existing web page) are
> **front-end capabilities of the ACXD Touchpoint SDK** — a web SDK the customer embeds in their own page (web
> only today; mobile planned). They do NOT work in the built-in test widget or the simple Communication
> Widget/ChatJS. You may **identify** modality/Live Sync opportunities here at design time, but the harness
> does **not** generate the Touchpoint front-end build — treat it as a separate front-end workstream. (Live
> Sync build stages are a planned future addition.)

### Step 9: Platform Pattern — Cross-Use-Case Flow Comparison (Platform Engagements Only)

For `acxd-platform` and `acxd-usecase` scopes with multiple identified use cases:
- Lay the flow graphs side by side
- Note interaction segments that look alike, but keep each use case's flows and resources in its own namespace
  (flows and resources are workspace-scoped; use cases are separated by application, so nothing is shared)

### Step 9b: Per-Flow Design-Lean Review & Override (ask before the gate)

The project `agentic_design_principle` (from discovery) set the DEFAULT lean, and Step 2 classified each segment. Before
the approval gate closes, present each flow's resulting **design lean** and let the user override any individual
flow — so the overall steering stays the default, but the human can retune specific flows once they can see what
was actually designed. This is a real question (a deterministic step — always ask it), not silent inheritance.

**Present the flow set with a Design-Lean column and its driver:**

| Flow id | Design lean | Driven by | Overridable to |
|---|---|---|---|
| `billingMain` (conversation journeys) | Agentic | relies on a Generative Journey / generative capture | Deterministic |
| `billingMain` (sign-in section) | **Collection follows the project lean** — agentic (Generative Journey `dataCapture`) in hybrid/agentic, deterministic (`user_choice`) only in deterministic mode or if overridden here. The verify DECISION is deterministic eitherway. | the project `agentic_design_principle` | flip collection the other way |
| `billingMain` (pricing) | Deterministic | data request + rules split | Agentic |

Read the lean from the design, not the label: a flow is **agentic** when its work is carried mainly by a
`generativeJourney` / generative data capture; **deterministic** when it is `user_choice`/split capture and
fixed logic.

**Then ask:** *"Here is each flow's design lean. Keep as designed, or switch any individual flow between
deterministic and agentic?"* Apply any overrides to the flow's design (and note them in
`acxd-flow-architecture.md`) before opening the gate.

> **Guardrail — the deterministic DECISION floor still applies (see Step 2).** Switching a high-consequence flow
> "to agentic" means its **data COLLECTION** becomes agentic (e.g. the sign-in section gathers account ID + PIN in
> one natural turn instead of three prompts) — this is the encouraged modern UX. The flow's **DECISION** (the
> auth pass/fail, the payment authorise/decline, the compliance verdict) still comes from a deterministic
> mechanism (data request / Connect check / rules split), never from the LLM. So an "agentic" override on an
> access-gating flow loosens capture only; it never makes the model the adjudicator. Non-gating flows have no
> such constraint — they can flip fully.

This directly fixes the clumsy-auth case: on hybrid/agentic projects the user can flip the sign-in section to
agentic collection here — first + second factor captured conversationally — while verification stays
deterministic.

> **Questions file + summary confirmation: questions follow the core (persona, "Working with the AI-DLC harness").** The core always writes the questions
> file. When the directive has summary confirmation on, it runs the **Looks correct / Request changes** stop
> before the artifacts; when it is off (the PoC scopes), generate straight from the answers. Then
> **this stage's approval gate (Step 10)**.

### Step 9c: Per-Node Model Review & Override (ask before the gate)

The project chose two models in Platform Config (Step 2): a **reasoning/routing** model and a **data-collection**
model. They map to nodes automatically by node type:
- **Generative Journey** and **Multimodal / Live Sync** nodes → the **reasoning/routing** model (multi-step
  reasoning, tool use).
- **Generative Text** nodes → the **data-collection** model (single-shot generation).

Now that the flows are designed and the model-bearing nodes are known, present each one with its defaulted model
and let the user confirm or override per node — the project defaults stay the steering, the human retunes
specific nodes once they can see what was designed. A real question (a deterministic step — always ask it when
the flow set contains any Generative Journey, Generative Text, or Multimodal node), not silent inheritance.

**Present the model-bearing nodes with a Model column and its driver:**

| Node (flow / name) | Node type | Defaulted model | Driver | Overridable to |
|---|---|---|---|---|
| `billingMain` / quote conversation | Generative Journey | *(the Q1 reasoning model)* | reasoning/routing default | any `GenerativeModelType` value |
| `billingMain` / summarise quote | Generative Text | *(the Q2 collection model)* | data-collection default | any `GenerativeModelType` value |

**Then ask:** *"Here is the model chosen for each generative node. Keep the task-based defaults, or change the
model on any individual node?"* Apply overrides to the node's `modelType` and note them in
`acxd-flow-architecture.md`. Only values from the closed `GenerativeModelType` enum (list in `acxd-sdk-idl.ts`) are valid.

> This mirrors Step 9b (per-flow design-lean override): a project-level steer that the human can retune per unit
> once the design is visible. Model selection carries no decision-floor constraint — the model never makes an
> auth/money/compliance verdict regardless of which model runs a node (that is always a deterministic
> mechanism), so a node's model can be flipped freely.


### Step 9d: Story Trace (the end-to-end test plan)

For EVERY approved user story, add one row to a **Story Trace** section in `acxd-flow-architecture.md`. This is
the plan Architecture SIT (Step 9e) checks now and Build SIT runs at Flow Authoring, so write it from the design, not from
the story wording:

| Story | Entry path (entry flow + key choices) | Flows traversed | Data requests called (owning flow) | Where the outcome is delivered | Caller trust level at that point |
|---|---|---|---|---|---|
| `US-<id>` | ... | `flowA → flowB → flowC` | `dataRequestX (flowB)` | node or context var the caller sees the outcome through, e.g. "`flowC` / advisor journey reads `heldPolicySummary`" | unauth / auth / both |

Rules:
- **Every row needs an outcome column.** If you cannot name the node or context var through which the caller
  experiences the story's "so that" outcome, the design has a gap: fix it now (before Step 10), not at authoring.
- **Data that crosses a Redirect must be a context var.** Data-request output stays in the flow that called it;
  if the outcome is delivered in a later flow, name the context var that carries it and the flow that sets it.
- **Caller trust level:** record which trust levels (e.g. unauthenticated, signed in) reach the outcome node.
  A Generative Journey reached by more than one level must not carry data meant for the higher one (Architecture Principle 13).
- Keep it to one row per story plus one per distinct failure path the story's acceptance criteria name. This
  table is overwritten on redesign; it is not a history log.

### Step 9e: Architecture SIT (MANDATORY before the gate)

Test the architecture before any flow is built. Follow **Part B: Architecture SIT** of
`{{HARNESS_DIR}}/knowledge/acxd-platform-agent/acxd-sit-method.md`: judge the six architecture tests against this
stage's artifacts, fix each FAIL in the design, re-run, and write the result as an **Architecture SIT** section at
the end of `acxd-flow-architecture.md`. Its first line is the verdict line. At the gate, show the table, the
verdict line and the deferred list.

### Step 10: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-flow-design --result awaiting-approval`.

### Step 11: Present Completion & Request Approval

Review path: this stage's engine-resolved record dir.
Standard 2-option approval (Approve / Request Changes).
STOP for the human response. Report Approve with
`--result approved --user-input "<exact choice>"`; report
Request Changes with `--result rejected --user-input "<feedback>"`, revise the
artifacts, then report `--result revised` before re-presenting.

## Sensors

This stage's outputs are markdown artefacts under its record dir. The imported `required-sections` sensor checks those outputs.

## Learn

While running this stage, record observations in the engine-created
`<record>/<phase>/<stage>/memory.md`. Treat it as an output-only target:
never read, probe, create, or initialize it. Follow the active harness's
diary-write discipline: add entries through the stage's review-step ritual
(NOT by hand-editing `memory.md`) — the ritual records them under Interpretations,
Deviations, Tradeoffs, and Open questions, each with an ISO 8601 timestamp.

Record an entry only when a **genuine insight arose while running this stage** — a platform constraint you discovered, a non-obvious tradeoff you weighed, a workaround you found, or something that behaved unexpectedly and how you resolved it. These are the observations worth carrying to a future run.

The configuration and settings the user selected during the stage are captured in the stage artifacts and belong there — a restatement of a chosen engagement pattern, an authoritative SoP, a scope, or any selected option is a record of the decision, not a learning, so leave it out of `memory.md`. Most runs produce nothing worth recording under Interpretations, Deviations, or Tradeoffs; an empty stage memory is the normal, expected outcome.

Stage files are immutable framework artefacts — the ritual writes into the
harness, not into this file.
