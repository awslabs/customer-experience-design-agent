---
slug: acxd-flow-build
number: 3.55
name: Flow Authoring
plugin: acxd
phase: construction
execution: ALWAYS
condition: Runs for all ACXD engagements. Authors each flow as a declarative FlowSpec (built to node-graph JSON by the Flow DSL) — consumed by SDK CreateFlowCommand in resource creation (console import is a fallback only).
lead_agent: acxd-platform-agent
support_agents:
  - aidlc-quality-agent
mode: inline
produces:
  - acxd-flows
  - acxd-flow-authoring-guide
  - acxd-prompt-specifications
  - acxd-analytics-tag-map
  - acxd-sit-results
consumes:
  - artifact: acxd-sdk-resource-scripts
    required: true
  - artifact: acxd-resource-inventory
    required: true
  - artifact: acxd-flow-architecture
    required: true
  - artifact: acxd-component-interface-contracts
    required: false
  - artifact: acxd-variable-map
    required: false
  - artifact: acxd-user-stories
    required: true
requires_stage:
  - acxd-resource-creation
sensors:
  - required-sections
scopes:
  - acxd-platform
  - acxd-usecase
  - acxd-platform-poc
  - acxd-poc
  - acxd-enhancement
  - enterprise
  - feature
  - mvp
  - classic
  - workshop
inputs: Flow architecture, resource inventory, variable map
outputs: flows/specs/*.flowspec.json, flows/flowset.json, flows/ (built), acxd-flow-authoring-guide.md, acxd-prompt-specifications.md, acxd-analytics-tag-map.md, acxd-sit-results.md
---

# Flow Authoring

> **MANDATORY STAGE-OPEN EMISSION — the first thing the user sees in this stage (reading the stage file first is fine).**
> Emit the H1 header line AND the intro line below it VERBATIM — copy both exactly as written here, word for word.
> They are fixed strings, not a description to paraphrase: do NOT reword, summarise, shorten, regenerate, or
> re-emoji either line. The `#` header must render as a real heading the user sees (NOT a code block, NOT a plain
> sentence). Emit exactly these two lines:
>
> # 🧩 Flow Authoring
>
> **What this stage does:** Authors each designed flow as a declarative FlowSpec and builds the whole set through the Flow DSL, running the cross-flow checks. **Produces:** the validated flow set (`flows/*.flow.json` build output) that the deployment pipeline provisions.
>
> This is not optional and it does NOT degrade as context grows or the work feels urgent: a stage that opens without
> this hero header is as incomplete as one that ends without its `# 🧩 Flow Authoring Complete` message (core
> stage-protocol §2). The opening header and the completion line are a matched pair — same emoji, same standard. Use
> the emoji exactly; never choose or re-check it.

> **⚙️ READ FIRST — how flow authoring works in this plugin (do not skip):**
> You author each flow as a **FlowSpec**: `flows/specs/<flowId>.flowspec.json`, a short declarative list of
> nodes and where each exit goes (format: `{{HARNESS_DIR}}/tools/acxd-deploy-engine/flow-dsl/FLOWSPEC.md`).
> Then ONE command builds every flow through the Flow DSL factories and checks the whole set:
> `npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/flow-dsl/build-specs.ts flows`.
> **A FlowSpec is NOT flow JSON. You never write `flows/*.flow.json`, never write node-graph JSON, and never call
> the SDK.** The `.flow.json` files are build OUTPUT. If your first instinct is "write the flow's JSON", stop:
> write the FlowSpec.

> **🧭 AUTHORING DECISION RULES — pre-decided answers. Look these up rather than re-deriving them per flow.**
> These decisions are settled. If you find yourself reasoning through one of these while authoring, STOP and apply the rule.
>
> | Recurring question | Pre-decided rule |
> |---|---|
> | **What type should a context var be?** | **Already decided — read the `Type` column of `acxd-variable-map.md`** (flow-design Step 4 records `string`/`boolean`/`number` per context var). Author that exact type; do NOT re-derive it per variable. (The rule the map applied, for reference: a var that carries an API field takes **that field's type** (number stays number, boolean stays boolean); **number** also for counters like `authAttempts`; **string** for literal flags not tied to an API field — `'verified'`, `'yes'`. If a var's type is missing from the map, that is a design-stage gap — fill it there, do not silently invent it at build.) |
> | **Copying a data-request response field into a context var?** | **Types must match.** Before a state modification copies `<dataRequestId>.<field>` into a context var, check the field's `responseSchema` type against the var's `schemaType`: number/integer → `number`, boolean → `boolean`, string → `string`. An `array` or `object` field has no context-var type: do not copy it, or (generated API only) ADD a separate string summary field for it. A mismatch deploys but ACXD flags it on the canvas ("expected string, but got number/list"); the pre-flight check 18 fails it first. |
> | **Should I check by hand that every value and response field is set and used?** | **No.** Write the specs, run `build-specs`, and fix each finding it reports (unused data, unused state, shared-tier tools, unused Generative Text, reference and token checks). The build checks every path; a hand check costs reasoning and misses cases. |
> | **May I list a var in `flowset.json` `externalReads` to clear a dead-state warning?** | **Only if something outside the flows really reads it, and you name that reader** (`{ "var": ..., "readBy": ... }`, e.g. `escalationReason` read by the Connect contact flow). A var that nothing reads is a design gap (dead data or dead state): wire it to its consumer or remove it. Never list a var to silence the finding; a bare name does not suppress it anyway. |
> | **May I change an API field's type to make a check pass?** | **No. API field types are fixed by the OpenAPI schema, which CX Discovery owns.** A caller-stated value already arrives as a `string` field in a generated API (values are shaped at the API boundary, not in the flow). If a typed field is fed by a caller answer, that is a contract defect: record it under "Design changes made during build" for Backend Build, never retype it here. For values a system produces: Never retype an existing request or response field (number, integer or boolean to string, or the reverse) in `data-requests.json`, the OpenAPI or the mock to clear a type check or to avoid a typed default. Numbers stay numbers (counts, amounts, percentages, discount levels) and booleans stay booleans. Fix the FLOW side instead: give the context var the field's type (`number`/`boolean`), and set a typed default directly with `{ "set": var, "value": 0 }` or `false` (see FLOWSPEC.md). A display string is ADDED alongside the number (e.g. `finalPremiumFormatted` next to `finalPremium`), never in place of it, and only for a generated API. A user-supplied API is never changed. Any change to an API contract is recorded under "Design changes made during build". |
> | **May I change a resource authored in a prior stage?** | **Yes — reconcile freely.** Authored-not-deployed resources (`resources/*.json`) are still drafts. When a component builder's contract needs a var retyped or added, edit `context-vars.json` **once**, note it in the run log, and continue. Treat it as ordinary reconciliation, not a decision that needs re-justifying each time. **This covers MECHANICAL fixes only (types, names, a missing var, contract shape).** Never drop or default-away an input, edge, capture or business rule to make a check pass — that is a BEHAVIOURAL change (never drop behaviour to pass a check): fix the design gap, or list it under "Design changes made during build" at the gate. |
> | **A check says a value is not set on every path into a node — what do I do?** | **Test: what is the true value on the path that lacks it?** Set it there (promote it from where it is captured, or a default that is correct on that path, e.g. no pre-approved discount for a new customer). If there is no true value, or it is an identity var, raise it at the gate. Never delete the read or the input that needs it (fix the design; never drop behaviour to pass a check). |
> | **A data-request value is needed later — how?** | Later node in the same flow: reference `{dataRequestId.field:NLX.Variable}` directly on the success path; no context var, no extra node. Later flow or Connect: a context var set with `var:` on a node already on the success path (counter-intuitive pattern 7). |
> | **Where does each data request go?** | **Decided at design time**: the position-and-inputs table in `acxd-flow-architecture.md` (Flow Design Step 1c). Author to it. |
> | **Is this flow mapped to Fallback/Unknown?** | **Test (Principle 4): can a node be reached on a cold entry with a value it reads still unset?** A cold entry carries no context and is invisible to the build's Redirect checks, so check it here against the flow's entry-context contract in `acxd-flow-architecture.md` (Flow Design Step 1b). Guard any such path with a split, or route it to the start of the conversation. Context tokens in prompts are fine (unset resolves empty); routing that depends on unset context is not. If the contract is missing, raise it at the gate. |
> | **A journey prompt references a data request** | Attach the data request to that journey as a tool; the build fails a prompt reference without it. |
> | **How does a data request get its input values?** | **From the NODE, through the channel the data request's contract uses.** URL values go in `params` and each needs a matching `{placeholder}` in the data request's `url`; JSON body values go in `body` (nested objects/arrays allowed) and are described by the data request's `requestSchema`. A field listed in `requestSchema` is NOT sent unless the node puts it in `body`. Follow the API's OpenAPI; for a mock, a POST write or sensitive input (PIN) goes in `body`, a GET read in `params`. The pre-flight fails an unmatched `params` key (check 16) or an unsent `required` body field (check 17) — fix the node, never by deleting the input (fix the design; never drop behaviour to pass a check). |
> | **Which variable NAME do I use for a value?** | **Use the EXACT name from `acxd-variable-map.md` — verbatim, never a synonym you coin while authoring.** The map is the single source of truth for identifiers (e.g. if the map says `authStatus`, `selectedTier`, `outcomeStatus`, `preApprovedDiscountLevel`, `productInterest`, author those — do NOT write `authenticated`, `coverageTier`, `outcome`, `preApprovedDiscount`, `productLine`). Inventing a parallel name silently creates a second, unset variable: the producing flow sets `authStatus` but the consumer reads `authenticated` and gets blank. If a value you need has no entry in the map, that is a design-stage gap — add it to the map (reconcile once, log it), do not mint an ad-hoc name mid-flow. |
> | **Which slot, and which slot type?** | **Use the Slots table in `acxd-variable-map.md` verbatim** (slot name, type, sensitive, owning flow). Built-in `NLX.*` types are attached by type id and are NEVER added to `slot-types.json`. If a capture you need is NOT in the table, that is a design gap: record it in the stage summary and use `NLX.AlphaNumeric` for free text; do not invent a new custom slot type or reclassify a context variable as a slot. |
> | **Which `escalationReason` (or other enum) value?** | **Only a value listed in the variable map.** If none fits, use the closest listed value and flag the gap in the stage summary; never invent a new one. |
> | **What language / locale do I set on a flow?** | Locale lives at the **Application / Connect level** (`.env` `ACXD_APP_*`), not per-flow. Keep the DSL default and the component builders' language as-is — locale is owned upstream, so leave flow-level language untouched. |
| **Where do analytics tags go — can I tag an escalation/failure?** | **Node tags are for POSITIVE funnel progression only, on `basic`/`generative_journey` nodes. `redirect` and `escalate` nodes CANNOT carry tags (grammar has no `tags` field on them) — do NOT split an escalation redirect into a `basic`+`redirect` pair to smuggle one in.** Negative outcomes (escalation/failure) are segmented by the `escalationReason` context variable, set with a precise reason code on every escalation path; an `escalation*`/`failure*` outcome on a redirect or escalate node is a MAP-ONLY entry realised via that var, recorded in `acxd-analytics-tag-map.md`; a `failure*` tag on a `basic` apology node is a normal node tag. See counter-intuitive pattern 8. |

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

Author each flow with the Flow DSL (typed factories → verified node-graph). The engine creates them
programmatically via `CreateFlowCommand` (full node graphs) at deploy time — that is the default path. Console
canvas import of the same emitted JSON is a manual fallback only. To update an existing flow via SDK: the engine
DELETEs the old flow, then creates the new node graph.

## Constraints

Flows are authored with the **Flow DSL** (`tools/acxd-deploy-engine/flow-dsl/`), not hand-written node JSON.
The DSL's typed factories and `FlowBuilder` guarantee the structural rules by construction, so the remaining
constraints here are the DESIGN decisions the DSL cannot make for you:

- Any flow that is a Redirect target is authored before the flows that redirect to it (build order, Step 1).
- **Closed resource vocabulary.** A flow may reference ONLY resources that exist: context variables, custom
  slot types, and data requests defined in `resources/*.json` (see the resource inventory manifest
  `acxd-resource-inventory.md` for the authoritative name + description of each). Pass a resource's exact
  created name to the factory. Referencing a name that was not created is the top cause of the ACXD
  post-deploy "… references X, but X is not attached / no longer defined" notifications.
- **Data-request outputs are flow-local — promote to context to cross a Redirect.** `[CONSOLE-VERIFIED]`
  A data-request field reference resolves ONLY inside the flow that contains the `dataRequest` node that
  produced it; it does NOT survive a Redirect. If a downstream flow (reached by Redirect) needs the value,
  promote it in the PRODUCING flow (`setContext(ctxX, fieldRef('request.field'))`), then read
  `ctxRef('ctxX')` downstream. Only **context** variables cross a flow boundary — locals, slots, and
  data-request outputs are all flow-scoped. This is a design/topology decision you make when composing flows.
- Deterministic vs agentic path choice (identity/money/compliance **decisions** = deterministic — the verdict
  comes from a data request / check / split, though factor *collection* may be agentic; open-ended servicing/FAQ
  = `generativeJourney`) is a design judgment — see Step 7's verified patterns.
- Human-in-the-loop is mandatory: the agent authors flows via the DSL and presents them for approval; the
  human reviews in the ACXD console after the SDK deploy.

> **The DSL enforces these BY CONSTRUCTION — you cannot author a flow that violates them, so they are no
> longer authoring rules you must remember:** every referenced slot is attached (the factory returns the slot
> to attach); every local is produced in-flow; every `dataRequest` node binds its id; every exit edge is
> wired or explicitly terminal (unwired exits fail the build); `choiceDisplayFormat` is a typed enum;
> a choice-showing node has a prompt; number/boolean sets go through a define-local; a data-request node sends URL
> values via `urlParams`/`params` and its JSON body via `body` (nested allowed); and all `aiDescription`/identifier
> text is ASCII. The engine pre-flight also checks each URL param has a `{placeholder}` and each required body field
> is sent. The deploy engine's pre-flight validator
> remains as a backstop, but the DSL makes these unreachable in the first place.

## Steps

### Step 1: Establish Flow Build Order

Derive the build order from the flow architecture: build any flow that is a Redirect target (e.g. `billingEscalation`)
before the flows that redirect to it, then the entry flow (`billingMain`). Every flow is named in the use-case
namespace (keep the conversation together).

Each flow is built, imported, and validated independently before the next.

### Step 2: Author Flows with the Flow DSL

Author directly from the approved design: there is no plan confirmation in this stage (no questions file); the approval gate is the review.
Author every guard the design names (for example a `Signed in?` split reading `authStatus` before account data) in
the first spec, not after a build finding.

Flows are authored with the **Flow DSL** at `tools/acxd-deploy-engine/flow-dsl/` — typed node factories, a
`FlowBuilder`, and parameterised component builders that emit each `flows/<flowId>.flow.json`. You do NOT
hand-write node-graph JSON: the DSL's factory signatures ARE the schema, so the structural mistakes that used
to surface at deploy time (unattached slots, undefined locals, unwired edges, showChoices-without-prompt,
constant-into-boolean, non-ASCII aiDescription) are unconstructible, and the engine pre-flight catches a URL
param with no `{placeholder}` and a required body field that is not sent. Read
`tools/acxd-deploy-engine/flow-dsl/DESIGN.md` for the factory inventory.

**Default — author each flow as a FlowSpec** at `flows/specs/<flowId>.flowspec.json` (format reference:
`{{HARNESS_DIR}}/tools/acxd-deploy-engine/flow-dsl/FLOWSPEC.md`). A spec is either a **component** spec
(`"component": "authVerify" | "escalation" | "welcomeRouter" | "callback" | "faqLookup"` + the builder's
params) or a **nodes** spec (each node's type, settings, and where every exit goes). Also write
`flows/flowset.json` with the cross-flow options, copied from the variable map and Flow Responsibility
Contract: `authFlagVar` (the context var the sign-in node sets, e.g. `authStatus`), `identityVars` (every identity/account context var set from verification; a value the caller states, such as new or existing, is not one), `externalVars` (context vars
Connect or the system supplies), `entryFlows`.

Build and check every flow in one command. Run from the **workspace root** (where `{{HARNESS_DIR}}` resolves),
passing the record-dir `flows` path as the argument (the `flows` arg resolves against the current directory):

```bash
npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/flow-dsl/build-specs.ts <record-dir>/flows
# resources are found automatically in the Resource Creation record dir; or pass --resources <dir>
```

(`{{HARNESS_DIR}}` is at the workspace root, so the script path only resolves from there; the `flows` argument
is resolved against the cwd, so give its full path relative to wherever you run the command.)

It calls the same factories and builders as a script would, then runs the cross-flow checks over the WHOLE
set: every context var read has a setter; it's set on every redirect path into the reading flow; identity vars
> Also bind to the **Design-vs-Resource Contract consistency pass** recorded in the Data-request order table: a split/guard on a data-request field sits in the same flow as the request; capture slots match the data-request param list 1:1; `authStatus` guards are scoped to account-data flows only. If the contract is missing a check, that is a design-stage gap to raise at the gate, NOT to reconcile silently at build (the build-time reconciliation of these three is the churn this pass exists to remove).
are set only by, or after, the auth flow; every redirect target exists. It lists every problem in one run and
writes `flows/<flowId>.flow.json` only when all of them pass. **Fix a problem in the spec (or the design), then
re-run; never hand-edit the emitted `.flow.json`.** A cross-flow failure usually means the design contract is
incomplete. Fix the contract, not just the spec.

The examples below show the equivalent TypeScript factory calls, so you can read what each spec node maps to.
The spec field names follow the factory options (see FLOWSPEC.md for the exact keys).

> **A fallback/unknown flow (one reachable "cold") must NOT inject `{var:NLX.Context}` tokens into its prompts.**
> A flow mapped to Fallback/Unknown can be entered with no upstream flow having set anything. If its Generative
> Journey prompt hard-binds a context token, the cross-flow reachability check treats it as a read that must be
> set on EVERY inbound path — and the cold entry leaves it unset, failing the build. Handle context defensively
> in PROSE only in such a flow ("if you don't yet know X, ask"); use hard `{var:NLX.Context}` tokens only in
> strictly-downstream flows that are always entered after the value is set.

**Fallback only — TypeScript authoring script.** If a flow genuinely needs something the FlowSpec can't express,
author that one flow as `flows/authoring/<flowId>.ts` and say why in the stage summary. Its emitted
`.flow.json` still goes through the deploy engine's cross-flow pre-flight.

> **Import path (TypeScript fallback only).** At authoring time the Flow DSL lives at
> `{{HARNESS_DIR}}/tools/acxd-deploy-engine/flow-dsl/`, not beside `flows/authoring/`. Import it by absolute
> path as a plain quoted string (ES-module specifiers must be static literals). The examples below show it as
> `<DSL>/…`.

1. **A separate flow that matches a builder → use the builder.** `buildEscalation`, `buildCallback`,
   `buildAuthVerify`, `buildFaqLookup` each assemble a complete, verified flow. Use one only for a separate
   flow (a flow test, e.g. escalation). Pass the domain wording and resource ids as ARGUMENTS.
   Inside the use-case flow, author the same steps as nodes instead. Example:

   ```json
   { "flowId": "billingEscalation", "component": "escalation",
     "params": { "aiDescription": "Summarises the conversation and hands over to a human agent." } }
   ```

   > **The builders are a convenience, not an obligation — a builder that doesn't fit is a signal to author
   > bespoke, not a shape to force.** Each builder assumes a common component shape (e.g. `buildCallback` assumes a data-request-backed recording step).
   > When a component's real design doesn't match — a callback that just captures
   > and confirms with no backend, an FAQ handled inside an agentic journey instead of a standalone flow — author
   > it bespoke with the node factories (item 2). **This is the sanctioned first choice in that case, not a
   > deviation to justify or deliberate over** — reach for it directly rather than bending the design to fit a
   > builder or weighing builder-vs-bespoke back and forth. Use `buildEscalation` when it fits (it usually does);
   > use a bespoke node-factory flow whenever it is the cleaner expression of the design.
   > You need not use every builder — an unused builder is fine.

   <precedence-rule name="design-wins">
   **The approved design is authoritative for HOW a flow collects input; a builder is only a way to emit it.**
   A difference in collection modality (agentic vs deterministic) IS a "doesn't fit". Read the collection
   modality from the approved flow architecture, then:

   - **Auth with DETERMINISTIC collection specified** → use `buildAuthVerify` (sequential `user_choice`
     capture; its only modality).
   - **Auth with AGENTIC collection specified** (a Generative Journey with `dataCapture`) → author the flow
     bespoke with the node factories. Reproduce `buildAuthVerify`'s verify / retry / escalate structure node for
     node: Init attempts → **Generative Journey `dataCapture`** (both factors `required`) → `data_captured` exit → Verify data
     request (`success`→Verified?, `in_progress`→Processing→back to verify, `failure`→Wrong details,
     `timeout`→escalation) → Verified? split → Mark verified (sets the auth flag AND the captured context vars)
     → proceed; Wrong details (increment attempts, clear slots) → Attempts exhausted? → re-enter the Generative Journey or
     escalate. See "Agentic auth capture" in `acxd-agentic-and-prompting.md`.

   Either way the verify DECISION is the deterministic data request + split. Set account data the verify
   returns (e.g. `accountRef`) ONLY on Mark verified, never on the data request node, so nothing about the
   account enters context before verification passes. The same holds OUTSIDE the auth flow: no other flow
   (e.g. the main/welcome flow) may run a customer or account lookup, or set an identity/account context var,
   before auth has passed. If routing needs new-vs-existing before auth, ask the caller, do not look them up.
   If the approved design has a pre-auth lookup, raise it at the approval gate; do not build it. Never downgrade an approved agentic modality to fit a
   builder; if you believe the design is wrong, raise it at the approval gate rather than changing it silently.
   </precedence-rule>


2. **Bespoke use-case flows → compose node factories with the `FlowBuilder`.** Add factory nodes, wire their
   exit HANDLES (each handle is derived from the node's own config, so you cannot wire an exit the node lacks
   or forget one it has), and `emit()`. `emit()` fails the build if any exit is left unwired — the
   disconnected-edge → Fallback class is a build-time error. Example:

   ```ts
   import { flow } from "<DSL>/builder";
   import { startNode, userChoice, generativeJourney, escalate, redirect } from "<DSL>/nodes";
   import { writeFileSync } from "node:fs";
   const f = flow("billingMain", "Qualifies a quote and routes to the agentic servicing journey or a human.");
   const start = f.add(startNode());
   // A Generative Journey declares its named exits IN THE PROMPT and lists them (ordered) in `exits`; the factory returns
   // one handle per named exit + timeout + failure (all must be wired).
   // TOOLS: attach the KBs + data requests decided in flow-design Step 5b, IN selection-priority order
   // (array order = priority). KB uses the {kbName} placeholder (engine resolves the UUID); data requests use
   // the stable dataRequestId. Every tool carries a one-line usage prompt.
   const journey = f.add(generativeJourney({ name: "Billing conversation",
     prompt: "Help the customer understand their bill. Take the humanHandoff exit if they ask for a person.",
     exits: [{ name: "humanHandoff", prompt: "Customer asks for a person or something out of scope." }],
     tools: [{ kb: "billingKnowledge", prompt: "Answer billing questions from approved content; if no answer, say so." }] }));
   const human = f.add(redirect({ name: "To escalation", toFlowId: "billingEscalation" }));
   const done = f.add(basic({ name: "Close", messages: ["Thanks for calling."] }));
   start.exit("next").to(journey);
   journey.exit("humanHandoff").to(human);
   journey.exit("timeout").to(human); journey.exit("failure").to(human);
   journey.exit("data_captured").to(done);   // done ends at the terminate node the builder injects
   writeFileSync("flows/billingMain.flow.json", JSON.stringify(f.emit(), null, 2));
   ```

**Underlying shapes:** the factories emit the exact node-graph shapes in
`knowledge/acxd-platform-agent/acxd-sdk-idl.ts` (PART B/C) and encapsulate every `DEVIATES FROM SDK` constraint.
Read the IDL only if you need to understand a shape the factory produces; you do not author it directly.

**Canvas layout:** the DSL is layout-agnostic today (phase 2 will auto-assign `canvasMetadata`); a readable
left-to-right layout is a nice-to-have, not a correctness rule.

**Closed vocabulary still applies:** pass only context-variable, slot-type, and data-request names that exist
in `resources/*.json` / the resource inventory — the factory takes the name you give it verbatim.

### Step 3: Generative Journey prompts

Each Generative Journey's `prompt` in the FlowSpec is the full prompt from `acxd-prompt-specs.md` (Flow Design
Step 5), copied in full with all eight sections (`<use-case>`, `<persona>`, `<previous-context>`, `<task>`,
`<data-to-capture>`, `<tools>`, `<rules>`, `<exit>`). Do not shorten or summarise it: the prompt is the journey's
only instructions at runtime. Fill any section the spec left thin from the SoP and the variable map. The build
fails a journey prompt missing `<use-case>`, `<previous-context>`, `<task>` or `<exit>`.

### Step 4: Generate Analytics Tag Map

Produce `acxd-analytics-tag-map.md` mapping every analytics-relevant interaction to a tag:

| Flow | Node | Tag | Category | Description |
|------|------|-----|----------|-------------|
| billingMain | Mark verified | milestoneQuoteAuthVerified | milestone | Caller verified successfully |
| billingMain | Auth retry | frictionQuoteAuthRetry | friction | Wrong details, caller asked again |
| billingEscalation | node-escalate | escalation_requested | escalation | Caller routed to human agent |
| ucAccountServicing | node-gj-complete | uc_servicing_complete | completion | Agentic servicing resolved |

Tag vocabulary:
- `completion` — successful resolution without human
- `escalation` — transferred to human agent
- `milestone` — significant mid-flow event (auth passed, payment initiated)
- `failure` — unrecoverable error or max-retry exceeded
- `friction` — unexpected path (re-prompt, clarification, fallback)

Embed analytics tags as `metadata.tags: [ { "label": "<tag>" } ]` on relevant nodes in every `.flow.json`.

### Step 5: Create the Flows (SDK) — with a console fallback

**Emit the flow JSON first.** Run `npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/flow-dsl/build-specs.ts <record-dir>/flows`
from the **workspace root** (the `{{HARNESS_DIR}}` script path only resolves there; the `flows` arg resolves against cwd). It writes every `flows/<flowId>.flow.json` (plus any TypeScript-fallback flow, emitted by
running its script). The JSON is build output: change the spec, re-run, never hand-edit.

**Default path:** `CreateFlowCommand` creates each flow from the authored node-graph JSON during resource
creation (Step 3.45) — Redirect-target flows first, then the flows that redirect to them. Nothing manual. To update a flow: DELETE
the old flow, then create the new one.

**Console fallback (only if the operator chooses not to use the SDK):** import the same `.flow.json` files
in the ACXD canvas — Redirect-target flows first (others reference them), then the rest; verify each Redirect
target resolves. Same JSON, same rules; the SDK path is preferred.

### Step 6: Post-Creation Verification `[CONSOLE-VERIFIED]`

The Flow DSL guarantees the structural properties by construction (camelCase flow ids, custom-slot tokens
without the `NLX.` prefix, every exit edge wired, slots attached), and the deploy engine's pre-flight
validator is the backstop. The checks that remain here are the ones that need the CONSOLE or a live
conversation — they cannot be settled at author time:

- **Redirect target resolution:** open every flow containing Redirect nodes and confirm each target resolves
  to the real flow. A dead redirect is a silent runtime failure. `[CONSOLE-VERIFIED]`
- **Application default behaviours:** set via `application.defaultFlows` in the deploy config — the engine
  applies them to `settings.defaultFlows` at create time. **`welcome` is REQUIRED** once flows are attached
  (`This application has flows but no default welcome flow`) `[CONSOLE-VERIFIED]`. SDK `DefaultFlows` keys are
  `welcome`/`fallback`/`unknown`/**`escalation`** (+ `frustration`/`help`/`repeat`/`resume`) — the SDK uses
  `escalation` where the console UI labels the default "Incomprehension". On-demand escalation is still via
  Redirect nodes inside flows, independent of these defaults. `[CONSOLE-VERIFIED]`
- **Data request field references resolve:** the response *schema* may be nested (validated), but flows read
  TOP-LEVEL keys — confirm fields a flow reads via `{dr.field}` are top-level, else they resolve blank. `[CONSOLE-VERIFIED]`
- **Context variables and analytics tags exist:** all context variables and analytics tags a flow references
  must exist as workspace resources (the closed-vocabulary rule). Missing resources cause "no longer
  available" errors. The pre-flight validator catches unknown context vars; confirm analytics tags in-console. `[CONSOLE-VERIFIED]`
- **Test widget smoke run:** run a quick conversation in the ACXD test widget (chat first, then voice) to
  verify redirects resolve, data requests return data, and analytics tags fire.

### Step 7: Apply Verified Flow Patterns

Cross-check every generated `.flow.json` against the verified patterns cookbook:

- **Greeting Router** — entry → language detection → greeting → intent router
- **Auth/Retry** — collect credentials → verify → retry (max 3) → escalate on failure
- **Agentic Servicing** — verified context → Generative Journey with tools → completion or escalation
- **Escalation** — context summary → queue selection → transfer with whisper
- **Boolean Gate** — condition → true branch / false branch → merge
- **List Picker** — present options → collect selection → map to action
- **SSML Wrapping** — voice flows wrap dynamic text in SSML for natural prosody
- **Channel-Aware Branching** — Condition node on channel type → voice/chat/Live Sync variants
- **Skip-If-Verified** — check context for prior verification → skip re-auth if present

### Step 7b: Build SIT (MANDATORY before the gate)

**This stage is not complete, and the gate must not open, until `acxd-sit-results.md` exists in this stage's
record dir.** A clean `build-specs` run is NOT the end of the stage: it proves the flows are well formed, not that
they deliver the user stories. After the flows build clean, run Build SIT yourself, in this stage:
1. Read `{{HARNESS_DIR}}/knowledge/acxd-platform-agent/acxd-sit-method.md` and follow **Part A: Build SIT** exactly: write scenarios per approved
   user story, run the deterministic tracer, judge each acceptance criterion from the trace, and write
   `acxd-sit-results.md` in this stage's record dir. Print its brief `🧪` progress lines to chat.
2. Design findings (dead data, dead state, shared-tier journeys) block the build itself, so the flows only build
   once each one is resolved. Resolve each as a design defect: fix the specs, rebuild and re-run the SIT. Limit:
   at most 2 fix-and-rebuild rounds for findings (count them in the SIT iteration log). If findings remain after
   round 2, stop: list them at the gate with their fix instruction, verdict NOT READY, and let the human decide. Record one
   in `flows/flowset.json` only when it is genuinely intended, with a reason (`unusedFields` for response fields,
   `externalReads` with `readBy` for vars read outside the flows); never record one to get past the build. Always
   declare `privilegedTools` (`[]` if none). List every recorded finding and its reason in the SIT results under
   **Design findings**, so the gate shows each decision.
3. For each SIT FAIL, fix the design (a failed check is a design defect), rebuild and
   re-run the SIT once (one round, logged in the iteration log; no further automatic rounds). A fix that would add,
   remove or merge a flow or journey, or move a data request across flows, is an architecture fault: report it as
   FAIL (architecture) for return to Flow Design, do not patch it (SIT method item 6). Record the change under "Design changes made during build".
4. At the gate, show the final Build SIT table, its verdict line (`SIT: <pass>/<total> pass, <fail> fail, <notTraced> not traced`)
   and its Live test list (every NOT TRACED item). Also print the report's path as a clickable link, relative to the project root
   (this stage's record dir + `acxd-sit-results.md`, e.g. `aidlc/spaces/<space>/intents/<intent>/construction/acxd-flow-build/acxd-sit-results.md`),
   so the reader can open the full report. A story that still fails after the re-run is listed at the gate with
   its fix instruction and the verdict is NOT READY, so the human decides.

### Step 8: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-flow-build --result awaiting-approval`.

### Step 9: Present Completion & Request Approval

Review path: this stage's engine-resolved record dir.

Present all authored flows — the `flows/specs/*.flowspec.json` specs (and any TypeScript-fallback script, with
the reason), the `flows/flowset.json` options, the clean build-specs output, and the emitted
`flows/*.flow.json` — plus
the flow authoring guide, prompt specifications, and analytics tag map.

**Design changes made during build (MANDATORY section: a failed check is a design defect, never drop behaviour to pass it):** list every behavioural change made in this stage (what changed, why, effect on the customer outcome), or state "None". Mechanical reconciliations do not belong here.
Standard 2-option approval (Approve / Request Changes).
STOP for the human response. Report Approve with
`--result approved --user-input "<exact choice>"`; report
Request Changes with `--result rejected --user-input "<feedback>"`, revise the
artifacts, then report `--result revised` before re-presenting.

## Learn

While running this stage, record observations in the engine-created
`<record>/<phase>/<stage>/memory.md`. Treat it as an output-only target:
never read, probe, create, or initialize it. Follow the active harness's
diary-write discipline: add entries through the stage's review-step ritual
(NOT by hand-editing `memory.md`) — the ritual records them under Interpretations,
Deviations, Tradeoffs, and Open questions, each with an ISO 8601 timestamp.

Record an entry only when a **genuine insight arose while running this stage** — a platform constraint you discovered, a non-obvious tradeoff you weighed, a workaround you found, or something that behaved unexpectedly and how you resolved it. These are the observations worth carrying to a future run.

The configuration and settings the user selected during the stage are captured in the stage artifacts and belong there — a restatement of a chosen engagement pattern, an authoritative SoP, a scope, or any selected option is a record of the decision, not a learning, so leave it out of `memory.md`. Most runs produce nothing worth recording under Interpretations, Deviations, or Tradeoffs; an empty stage memory is the normal, expected outcome.
