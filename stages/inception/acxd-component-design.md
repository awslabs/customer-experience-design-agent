---
slug: acxd-component-design
number: 2.77
name: Reusable Component Design
plugin: acxd
phase: inception
execution: ALWAYS
condition: Runs only for acxd-enhancement (building on an existing component library). Flow boundaries for new builds keep the conversation together (Flow Design). Promotes candidate components to formal component flows with interface contracts and description discipline.
lead_agent: acxd-platform-agent
support_agents:
  - aidlc-architect-agent
mode: inline
produces:
  - acxd-component-architecture
  - acxd-component-interface-contracts
  - acxd-resource-inventory-manifest
  - acxd-component-reuse-map
consumes:
  - artifact: acxd-flow-architecture
    required: true
  - artifact: acxd-candidate-component-list
    required: false
  - artifact: acxd-variable-map
    required: false
  - artifact: acxd-platform-config-spec
    required: false
requires_stage:
  - acxd-flow-design
sensors:
  - required-sections
scopes:
  - acxd-enhancement
  - enterprise
  - feature
  - mvp
  - classic
  - workshop
inputs: Flow architecture, candidate component list, variable map, platform config spec
outputs: acxd-component-architecture.md, acxd-component-interface-contracts.md, acxd-resource-inventory-manifest.md, acxd-component-reuse-map.md (under this stage's record dir, engine-resolved)
---

# Reusable Component Design

> **MANDATORY STAGE-OPEN EMISSION — the first thing the user sees in this stage (reading the stage file first is fine).**
> Emit the H1 header line AND the intro line below it VERBATIM — copy both exactly as written here, word for word.
> They are fixed strings, not a description to paraphrase: do NOT reword, summarise, shorten, regenerate, or
> re-emoji either line. The `#` header must render as a real heading the user sees (NOT a code block, NOT a plain
> sentence). Emit exactly these two lines:
>
> # 🧱 Reusable Component Design
>
> Formalises the shared interaction patterns identified during flow design (auth, escalation, callback, routing) into reusable **component flows** with explicit interface contracts. **Produces:** the component architecture, interface contracts (context-in / context-out), a resource inventory manifest, and the parent→component reuse map — so every shared building block is defined once and composed by name.
>
> This is not optional and it does NOT degrade as context grows or the work feels urgent: a stage that opens without
> this hero header is as incomplete as one that ends without its `# 🧱 Reusable Component Design Complete` message (core
> stage-protocol §2). The opening header and the completion line are a matched pair — same emoji, same standard. Use
> the emoji exactly; never choose or re-check it.

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

This stage converts the candidate component list from Flow Architecture Design into formal component flows
with documented interface contracts. Component flows are the central enterprise value proposition — they
enable reuse across use cases, independent testing, independent ownership, and platform reconsolidation
by future teams.

This stage has two paths: **Greenfield** (new platform) and **Brownfield** (enhancement to existing).
The scope determines which path executes.

## Steps — Greenfield Path (acxd-platform, acxd-usecase scopes)

### Step 1: Evaluate Candidate Components

Read `acxd-candidate-component-list.md` from the flow design stage. Also review the **DSL component builders** (`tools/acxd-deploy-engine/flow-dsl/components.ts`, inventory in
`flow-dsl/DESIGN.md`) and the component approach in `acxd-flow-design.md` — the parameterised builders are the
pre-built, field-tested patterns for common contact centre interactions. When a candidate maps to an existing pattern, start from the pattern and adapt rather
than designing from scratch.

For each candidate, apply the five
promotion criteria:

| # | Criterion | Question |
|---|-----------|----------|
| 1 | Multi-consumer | Is it used by 2+ use cases, or is there a strong signal it will be? |
| 2 | Independent change | Does it change independently of consuming flows? (e.g., auth rules, escalation routing) |
| 3 | Team ownership | Could a different team own this component? |
| 4 | Test lifecycle | Does it need its own test suite separate from parent flows? |
| 5 | Analytics | Does it need its own analytics tags to track independently? |

**Promotion threshold:** Score ≥3 criteria → promote to component flow. Score 2 → discuss with customer.
Score ≤1 → inline in parent flow.

Even on single-use-case engagements, probe the customer:
- "Will other teams build use cases on this platform in the future?"
- "Are there other contact centre interactions that would use identity verification / escalation / FAQ?"
- "Do you anticipate changing your authentication flow independently of the rest of the experience?"

### Step 2: Design Component Interface Contracts

For each promoted component, write a formal interface contract in `acxd-component-interface-contracts.md`:

```
## Component: sharedAuthVerify

**Purpose:** Verifies customer identity using account number + date of birth or SMS OTP.

**Context In (variables the parent must set before Redirect):**
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| customer_phone | string | Yes | ANI or customer-provided phone number |
| auth_method | string | No | Preferred method: "dob" or "sms-otp" (default: "dob") |

**Context Out (variables the component sets before returning):**
| Variable | Type | Guaranteed | Description |
|----------|------|-----------|-------------|
| auth_status | string | Yes | "verified" | "failed" | "max-retries" |
| customer_id | string | If verified | CRM customer identifier |
| auth_attempts | number | Yes | Number of attempts taken |

**Internal Resources:**
- Data Request: `dr-verify-identity` (backend: POST /verify-identity)
- Slot Type: `st-date-of-birth` (custom: DD/MM/YYYY + natural language dates)

**Analytics Tags:**
- `milestoneSharedAuthVerified` — identity confirmed
- `frictionSharedAuthRetry` — customer retried verification
- `failureSharedAuthMaxRetries` — 3x failed, escalating

**Max Retries:** 3 attempts, then sets auth_status = "max-retries" and returns to parent.

**Owner:** Platform team
```

> **Auth capture modality — design the front-end to the Agentic Design Principle (agent-composed, not a fixed pattern).**
> `buildAuthVerify` provides the proven, deterministic **verify/retry/escalate skeleton** (bounded retries →
> deterministic verify data request → `Verified?` split → escalate). Keep that skeleton — it is the security core
> and the DECISION stays deterministic (see the deterministic DECISION floor in flow-design Step 2). Collection is
> EXEMPT from that floor (Data Collection principle, `acxd-architecture-principles.md`): design it to the lean —
> deterministic → `user_choice`; hybrid/agentic → Generative Journey `dataCapture`. What you
> DESIGN per engagement is how the factors are **collected** into the slots the skeleton verifies:
>
> - **Deterministic collection (default / `deterministic` principle):** capture each factor with a sequential
>   `user_choice` (identifier, then second factor) — `buildAuthVerify`'s `secondFactorSlot` params do this today.
> - **Agentic collection (`hybrid` / `agentic` principle, when the customer accepts it):** collect BOTH
>   factors in one natural turn with a **Generative Journey using `dataCapture`** (both slots `required`), whose
>   `captured` exit feeds the SAME deterministic verify. This removes the clumsy one-question-at-a-time UX.
>   See the "Agentic auth capture" pattern in `acxd-agentic-and-prompting.md`.
>
> **Guardrail:** agentic collection loosens *capture only*. The identity DECISION (pass/fail) is still the
> deterministic verify data request + `Verified?` split — the Generative Journey fills the slots, it NEVER decides authentication.
> Design the capture modality from the flow's design-lean (flow-design Step 9b).
>
> **Builder-fit check (MANDATORY when a component maps to a DSL builder).** Record the chosen collection modality
> explicitly in the component interface contract (`Collection modality: deterministic` or `agentic`) and state
> how it will be realised:
>
> | Specified modality | Realised by |
> |---|---|
> | Deterministic (sequential `user_choice`) | `buildAuthVerify` |
> | Agentic (Generative Journey `dataCapture`) | **Bespoke node-factory flow** reproducing `buildAuthVerify`'s verify / retry / escalate structure. `buildAuthVerify` has no agentic mode. |
>
> Write the "Realised by" line into the contract so flow-build has nothing to reconcile. Apply the same check to
> any other builder: confirm its parameters can express the specified factors, retries, and modality, and flag a
> mismatch HERE, at component design, never at flow-build.

### Step 3: Enforce Naming Conventions

Apply consistent naming across all flows and resources. **All ACXD identifiers are alpha camelCase — no
hyphens, underscores, or digits** (see the canonical naming rule in `acxd-variables-and-state.md`). The prefix encodes
**reusability**, and it is a contract, not a label:

| Category | Prefix / namespace | Example | Meaning |
|---|---|---|---|
| **Reusable component flow** | `shared` | `sharedAuthVerify`, `sharedEscalation` | Used by 2+ use cases; MUST be use-case-agnostic (see the repeatability test below) |
| **Use-case flow** | **the use-case name as namespace** | `quoteMain`, `quoteApplyDiscounts`, `quotePresentQuote` | Specific to ONE use case; the use-case name IS the namespace |
| Data request (any) | none: named after its API operationId | `verifyIdentity`, `getCustomerPolicies` | The name tracks the OpenAPI `operationId` (the mock routes `/{operationId}`), so it never takes the `shared` prefix, even when a shared flow calls it. Reuse is carried by the FLOW name (`sharedAuthVerify`). |
| Use-case data request | use-case name | `quoteGetPremium` | Specific to one use case |
| Shared slot type | `shared` | `sharedDateOfBirth` | Reusable |
| Shared knowledge base | `shared` | `sharedProductFaq` | Reusable |
| Shared secret | `shared` | `sharedCrmApiKey` | Reusable |

> **Secret names are authored identifiers — camelCase, letters only, no exemption** (`billingApiUrl`, `crmApiKey`). The `.env` VARIABLE that supplies the value keeps its SCREAMING_SNAKE form (`BILLING_API_URL`); the two are mapped by `SecretDef.name` (camelCase) vs `SecretDef.envVar` (SNAKE). Set the camelCase secret name here at component design so it is not renamed later at resource creation.

> **Do NOT use a `uc` prefix.** It reads ambiguously as "User Choice" (an ACXD node type) and does not name
> the use case. Namespace use-case flows by the use-case name itself (`quote…`, `claim…`, `billing…`), which
> makes the boundary explicit in every flow name and cleanly separates them from `shared`
> components.

**The repeatability test (a component MUST be use-case-agnostic).** A flow named `shared…`
MUST NOT reference any specifics of a particular use case — no product names, domain terms, or business
context (e.g. "quote", "insurance", "policy", "premium") in its node messages, Generative Journey prompts,
`aiDescription`, or slot/variable names. If a flow needs to say "insurance quote", it is NOT a reusable
component — namespace it to the use case instead. A prompt that can only work for one use case is a
use-case flow, however it is named. This is a testable design-review invariant: **scan every `shared`
flow for use-case-specific vocabulary; any hit is a naming error — either generalise the wording (parameterise
via context-in variables) or rename the flow to the use-case namespace.**

### Step 4: Enforce Description Field Discipline

ACXD enforces a 200-character limit on `description` and `aiDescription` fields. Every resource MUST carry
a verbose description following this template:

**Full description (for resource inventory manifest):**
```
What: Verifies customer identity via DOB or SMS OTP with 3-retry limit.
Inputs: customer_phone (required), auth_method (optional, default "dob").
Outputs: auth_status, customer_id (if verified), auth_attempts.
Consumers: bill-pay-main, order-status-main, appointment-main.
Owner: Platform team.
```

**Truncated description (for the ACXD `description` field, ≤200 chars; `aiDescription` allows up to 1000):**
```
Verifies customer identity via DOB or SMS OTP. Inputs: customer_phone, auth_method. Outputs: auth_status, customer_id. 3-retry limit. Consumers: bill-pay, order-status, appointment.
```

Write both versions for every resource in `acxd-resource-inventory-manifest.md`.

### Step 5: Map the Parent → Component Call Graph

Produce `acxd-component-reuse-map.md` — a matrix showing which parent flows call which components:

| Parent Flow | shared-auth-verify | shared-escalation | shared-faq | shared-data-gather-address |
|-------------|:------------------:|:-----------------:|:----------:|:--------------------------:|
| bill-pay-main | ✅ | ✅ | ❌ | ✅ |
| order-status-main | ✅ | ✅ | ✅ | ❌ |
| appointment-main | ✅ | ✅ | ❌ | ❌ |

Include the Redirect node placement in each parent flow — which node in the parent flow calls the component,
and what happens when the component returns (branch on context-out variables).

### Step 6: Produce the Component Architecture Document

Write `acxd-component-architecture.md` consolidating:
- Promoted component list with rationale
- Deferred/inlined candidates with rationale
- Component flow graph (Mermaid) showing parent → component relationships
- Build order: component flows must be built and tested BEFORE parent flows
- Component governance rules: who can modify shared components, what review process

## Steps — Brownfield Path (acxd-enhancement scope)

### Step 7: Export and Inventory Existing Resources

For brownfield/enhancement engagements:
1. Export all existing flows from the ACXD workspace (UI export → JSON)
2. Inventory all existing resources — flows, data requests, slot types, knowledge bases, secrets
3. Read the `description` and `aiDescription` fields on every resource
4. Read the existing `acxd-resource-inventory-manifest.md` if one exists from the prior engagement

### Step 8: Map the Existing Component Library

From the exported flows and resource inventory:
- Identify which flows are component flows (naming convention: `shared` prefix)
- Map which parent flows call which component flows (Redirect node analysis)
- Read the interface contracts — are context-in/context-out variables documented?
- Assess description quality — are descriptions verbose and current?

### Step 9: Identify Reuse Opportunities for New Use Cases

For the new use case(s) being added:
- Which existing component flows can be reused as-is?
- Which need modification? (new context-out variable, additional retry logic, new analytics tags)
- Are there new component candidates? (e.g., new shared pattern across existing + new use cases)
- Flag any duplication — two flows that do the same thing with different names

### Step 10: Reconcile and Update

- Update `acxd-resource-inventory-manifest.md` with new resources
- Update `acxd-component-reuse-map.md` with new parent → component mappings
- Update component interface contracts if modifications are needed
- Flag any description fields that are stale or missing

## Steps — Common (Both Paths)

### Step 10b: Pattern Matching & Reflection

For each promoted component, check the DSL component builders (`flow-dsl/DESIGN.md` inventory):

1. **Match existing patterns:** Does this component map to a pre-built pattern?
   - **Direct match** → Present the pattern with customer-specific adaptations. Note which parameters are
     customised vs defaults. The customer reviews and approves.
   - **Partial match** → Note the delta: "This is similar to the `auth-verify` pattern, but with [differences]."
     Start from the pattern and adapt.
   - **No match** → Design from first principles using flow development rules and conversation design patterns.

2. **Escape to manual design:** If the user says a pattern doesn't fit or wants something different, immediately
   drop the pattern and design manually. Say: "No problem — let's design this from scratch. What should this
   component do?" There is no penalty for not using a pattern.

3. **Capture new patterns (reflection):** After all components are designed, review the set for novel patterns:
   > "Looking at the components we've designed, I notice `[component name]` doesn't match any existing pattern
   > but looks like it could be reusable in future engagements. Would you like me to capture this as a new
   > component pattern? I'll extract the topology, interface contract, variables, and edge cases for review."

   If the user agrees:
   - Capture the pattern's topology, interface contract, variables, and edge cases for team review
   - Tag as `[FIELD-LEARNED]` (not `[CONSOLE-VERIFIED]` — that requires multi-engagement validation)
   - Save to the stage record memory for later team review and potential promotion to the pattern library
   - Do NOT add a new DSL component builder directly — learned patterns go through team review first

> **Questions file + summary confirmation: questions follow the core (persona, "Working with the AI-DLC harness").** The core always writes the questions
> file. When the directive has summary confirmation on, it runs the **Looks correct / Request changes** stop
> before the artifacts; when it is off (the PoC scopes), generate straight from the answers. Then
> **this stage's approval gate (Step 11)**.

### Step 11: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-component-design --result awaiting-approval`.

### Step 12: Present Completion & Request Approval

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
