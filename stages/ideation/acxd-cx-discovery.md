---
slug: acxd-cx-discovery
number: 1.8
name: CX Discovery & Engagement Qualification
plugin: acxd
phase: ideation
execution: ALWAYS
condition: Runs for all ACXD engagements. Qualifies the engagement pattern and produces the CX discovery report.
lead_agent: acxd-platform-agent
support_agents:
  - aidlc-product-agent
mode: inline
produces:
  - acxd-project-name
  - acxd-cx-discovery-report
  - acxd-use-case-priority-matrix
  - acxd-integration-inventory
  - acxd-sop-deconstruction
consumes:
  - artifact: intent-statement
    required: true
requires_stage:
  - intent-capture
sensors:
  - required-sections
  - acxd-stage-exit
scopes:
  - acxd-platform
  - acxd-usecase
  - acxd-platform-poc
  - acxd-poc
  - enterprise
  - feature
  - mvp
inputs: Intent statement from intent-capture
outputs: acxd-cx-discovery-report.md, acxd-use-case-priority-matrix.md, acxd-integration-inventory.md, acxd-sop-deconstruction.md (if a SoP is provided)
---

# CX Discovery & Engagement Qualification

> **Stage header (fixed — use exactly, do not choose):** open the stage with `# 🔍 CX Discovery & Engagement Qualification` and end it with
> `# 🔍 CX Discovery & Engagement Qualification Complete`. Phase banner for this stage: 🔍 Entering the Ideation Phase (emitted AFTER the interaction-mode choice, see below).

> **Fixed strings for this stage** — emitted at step 5 of the opening sequence below, verbatim, each `#` line a
> real rendered heading:
>
> # 🔍 Entering the Ideation Phase
>
> We start by understanding your contact centre: the business processes and SoPs to automate, the engagement pattern, the integration landscape, and the outcomes and KPIs that define success. This phase qualifies the engagement and captures the discovery that steers everything downstream.
>
> # 🔍 CX Discovery & Engagement Qualification
>
> **What this stage does:** Qualifies the engagement and maps the CX landscape — the business processes and SoPs to automate, the engagement pattern, the Agentic Design Principle, the integration landscape, and baseline metrics. **Produces:** the discovery report and supporting artefacts that steer every downstream stage.

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

The critical qualification stage. Determines the engagement pattern, identifies automation candidates, maps
the external integration landscape, captures baseline contact centre metrics, and produces the artefacts that
steer every downstream stage.

## Interaction Mode

The core asks for the interaction mode once, here, and reuses it for later stages. Present these four options as a
numbered list in this order (recommended first, `Other` last):

1. **Chat (recommended)** — We discuss the solution naturally and I extract decisions from our conversation. Best
   when several people contribute, the design is still taking shape, or you want me to challenge assumptions.
2. **Guide me** — I walk you through each question in a structured sequence. Best when you already have a clear
   starting point and want a predictable path.
3. **I'll edit the file** — I generate the questions file and you fill in the answers, then tell me when you're done.
   Best for firm requirements, asynchronous work, or several people contributing offline.
4. **Other** — Describe what you want instead.

## Steps

**Stage opening sequence — this is the whole opening; follow it in order.** Each STOP is its own turn.

1. **Welcome Banner** and its description (below). Nothing comes before it.
2. **Engine narration**, if the directive carries one: one plain sentence in the user's terms (e.g. "This
   project runs in ten stages, each paused for your review."). Omit it if the Welcome text already says it.
3. **Dev-mode line**, if dev mode is on (`acxd-dev-mode.md`).
4. **Interaction mode choice** ("Interaction Mode" above). STOP.
5. After the user picks a mode: the **phase banner + stage header** above, then **Step 0-pre: Project Name**.
   STOP.
6. **Step 0: Prior Context Intake**. STOP.
7. The numbered discovery steps.

### Welcome Banner

Before anything else, present this welcome banner to the user. Output it exactly as shown (monospace/code block):

```

     █████╗  ██████╗██╗  ██╗██████╗
    ██╔══██╗██╔════╝╚██╗██╔╝██╔══██╗
    ███████║██║      ╚███╔╝ ██║  ██║
    ██╔══██║██║      ██╔██╗ ██║  ██║
    ██║  ██║╚██████╗██╔╝ ██╗██████╔╝
    ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═════╝

    Customer Experience (CX) Design Agent
    for Amazon Connect Agentic CX Designer
    AI-Driven Development Lifecycle

```

Then present a brief description:

> **Welcome — I'm the Customer Experience (CX) Design Agent.** I'm your Amazon Connect Agentic CX Designer
> (ACXD) specialist — I'll guide you through designing, building, and deploying an enterprise-grade
> conversational AI solution on Amazon Connect.
>
> We'll work through this together: discovery → design → build → deploy. Every decision goes through
> you — I propose, you approve. Let's get started.

Then continue at step 2 of the opening sequence.

> **`[HUMAN-REVIEW]` decisions in this stage (the human decides; review tags).** The following discovery decisions are
> `[HUMAN-REVIEW]`: surface each to the user and STOP for their answer, with a recommendation where appropriate,
> however confident you are — never resolve them silently:
> - **Identity / authentication model** (how a caller is identified and verified — e.g. account number + PIN, factor count).
> - **PII / privacy & compliance regime** (the Compliance drivers menu, Step 4 — jurisdiction, privacy regime, sector standard).
> - **Escalation-to-human policy** (when and how a conversation escalates to a human — trigger, target queue/skill, business-hours vs after-hours callback).
>
> Other discovery questions default to `[HUMAN-IF-UNGROUNDED]` (resolve-and-present-for-confirmation only when
> grounding is high-quality and directly on point) — e.g. Always Retrigger is agent-resolvable when none of the
> APIs are static.

### Step 0-pre: Project Name — the FIRST captured value — STOP AND WAIT

**MANDATORY: Capture this before Step 0 and before any discovery question. It is the single deterministic
identifier every downstream stage reuses verbatim** — the scoping snapshot folder, the distribution snapshot
folder, the mock APIs stack name, the Connect stack name, and the default ACXD workspace/application names all
derive from this ONE value. Capturing and shape-validating it once, up front, is what makes those names
deterministic instead of each stage inventing its own.

Present this prompt and **wait for the user's response**:

> "First, what should we call this project? I'll use it as the canonical identifier for this engagement —
> it names your project folders, deployment stacks, and (by default) your ACXD workspace and application, so
> everything stays consistent.
>
> Please give me a short **camelCase** name — letters only, no spaces, digits, hyphens, or underscores.
> For example: `insuranceQuote`, `retailBanking`, `travelBooking`."

**Shape validation (enforce before accepting):** the value MUST match `^[A-Za-z]+$` — letters only, camelCase,
first letter lowercase by convention. If the user supplies spaces, digits, hyphens, underscores, or an empty
value, propose a corrected camelCase form (e.g. "Northwind Energy Billing" → `northwindEnergyBilling`;
"insurance-quote-poc" → `insuranceQuotePoc`) and confirm it with them before continuing. Record the accepted
value as **`projectName`** — this is the canonical value referenced (never re-derived) by every downstream
stage. A prettier, human-friendly workspace/application display name can be set later by the operator in
`.env` (`ACXD_WORKSPACE_NAME` / `ACXD_APPLICATION_NAME`); `projectName` remains the deterministic anchor.

**Length check (soft — warn, don't block):** the default ACXD workspace name is `<projectName>Workspace`, and
the ACXD **workspace name is capped at 36 characters**. `Workspace` is 9 chars, so a `projectName` **over 27
characters** overflows that cap and would fail at `CreateWorkspace`. If the accepted `projectName` exceeds 27
characters, note this to the user and suggest a shorter name — or reassure them they can keep it and set a
shorter `ACXD_WORKSPACE_NAME` in `.env` before deploy (the override is the escape hatch). The application name
(`<projectName>App`, cap 100) has no practical limit here. This is a warning only: a long `projectName` is still
valid as the anchor; it just needs a shorter workspace display name.

### Step 0: Prior Context Intake — STOP AND WAIT

**MANDATORY: Do NOT proceed to Step 1 until the user has responded to this step.**

Before asking any discovery questions, present this prompt and **wait for the user's response**:

> "Before we dive into discovery, I'd like to give you the chance to share any existing context you have.
>
> If you have documents to share, drop them into the **`customer-context/`** folder in your project
> directory — I can read everything in there. You can also paste text directly into this chat.
> Sharing documents or background upfront means I can ask smarter questions, skip areas you've already
> covered, and get to design faster.
>
> **Business Process Documents / SoPs are the single most valuable input — and get special weight.** Most
> contact centre journeys are already governed by a documented business process — a Standard Operating
> Procedure, work instruction, process map, agent playbook, or training guide that tells human operators how
> to handle the interaction. This harness is specifically configured to take an existing (human) business
> process and extract an **agentic workflow** from it: it deconstructs the process step by step, then designs
> a solution with **seamless hand-over between the steps an AI agent can perform and the steps that need
> human input or review**. If you have a Business Process Document / SoP, be sure to add it to the
> `./customer-context` folder and I'll discover it — then we can discuss how much weight to give the process steps.
>
> **What's helpful to share (any or all of these):**
> - **Business Process Documents / SoPs** — any documented business process for the interaction: Standard
>   Operating Procedures (SoPs), work instructions, process maps/flowcharts, agent playbooks, runbooks, or
>   operator training guides. Whatever tells a human how the process runs today (given higher weight — see
>   the note above and the dedicated question below).
> - **OpenAPI 3.x schema(s)** — if this solution integrates with any EXISTING API (live now, or a defined
>   production contract not reachable from dev/test), provide its OpenAPI 3.x document with clear `description`
>   fields per operation/parameter. This is MANDATORY for a real-API integration: the agent cannot reliably
>   reverse-engineer a real contract from chat, so a provided OpenAPI schema is what lets it design the flows
>   around your actual systems. Drop it in `customer-context/` alongside the SoP.
> - **Business case or strategy document** — goals, success metrics, executive sponsors
> - **Technical requirements or RFP** — specifications, constraints, integration requirements
> - **User stories or use case descriptions** — what you want automated and why
> - **Current IVR/chatbot scripts or call flows** — what exists today
> - **Contact centre metrics or reports** — current volumes, AHT, containment rates, CSAT scores
> - **System architecture or integration diagrams** — CRM, billing, identity providers
> - **Compliance or regulatory requirements** — PCI, PII handling, call recording policies
> - **Brand or tone guidelines** — how the bot should sound
> - **Sample customer conversations** — call recordings, chat transcripts, or written examples
>
> **Integrations: provide an OpenAPI schema for any EXISTING API.** If a system already exists — whether it is
> live and reachable, or a defined production contract you cannot reach from dev/test — give me its **OpenAPI
> 3.x schema** (in `customer-context/`). A provided schema steers the flow design around your real systems. If
> a system does NOT exist yet, don't hold back — describe the data need and I will define the contract and a
> synthetic mock. We settle this per integration in the Integration & Data step below (one question, three
> options).
>
> You can drop files into `customer-context/`, paste text here, or just describe what you know.
>
> If you don't have any of this, no problem — just say **'skip'** and I'll walk you through everything
> step by step."

**STOP here. Wait for the user to respond before continuing.**

**If the user provides context:**

1. Check the `customer-context/` directory for any files the user has placed there. Read every file found,
   following the **Document Intake Ladder** below — reach for the tool that works *first* so the user
   approves one productive command, not a series of failing probes.
2. Read and summarise all provided materials (from the directory and/or chat) — acknowledge specifically what was shared.
3. Extract and map information that answers discovery questions from Steps 1–6:
   - Contact centre landscape details → pre-populate Step 1
   - Use case descriptions → pre-populate Step 2 (classify as deterministic/agentic)
   - Multi-use-case or platform signals → pre-populate Step 3 (engagement pattern)
   - External system references → pre-populate Step 4 (integration inventory) as *candidate integrations only*.
   - Existing metrics → pre-populate Step 5 (baseline KPIs)
4. Present a summary of what you extracted and ask the user to **confirm or correct**:
   > "Based on what you've shared, here's what I understand: [summary]. Is this accurate? Anything to add or correct?"
5. **STOP and wait** for confirmation before proceeding.
6. For each subsequent step, **skip questions already answered** by the confirmed context. Only ask about
   areas NOT covered by the provided materials. (Context only pre-fills answers — it
   never cancels a question the stage says to ask. Anything the material is silent on is unknown: still ask.)
7. Tag any extracted facts with `[FROM-CONTEXT]` provenance in the discovery report to distinguish
   customer-provided information from information gathered during interactive discovery.

#### Document Intake Ladder — read customer-context files efficiently

Customers commonly drop **.pdf, .docx, .xlsx, .pptx, and image** files (as well as text). The goal is to
extract clean text on the **first** tool the user approves — not to ladder through tools that aren't
installed in this runtime. Pick the right tool for the format up front and go.

**Order of preference per file (stop at the first that yields clean text):**

1. **Text-native formats** (`.md`, `.txt`, `.csv`, `.json`, `.yaml`, `.markdown`) — read **directly** with
   your file-read capability. No tooling, no install, no approval needed.
2. **Small binary docs** — try the harness/IDE's **native file-read / attachment** capability first (no
   install). If it returns clean text, you're done.
3. **Binary docs that didn't cleanly extract** (`.pdf`, `.docx`, `.xlsx`, `.pptx`) — install a known-good
   parser **with `bun`** (guaranteed present — the harness requires it) in a scratch dir and run a short
   extraction script. **`bun` is the most reliable extractor available — reach for it early rather than
   probing shell binaries or Python libraries that are usually absent.** Recommended parsers (best-first;
   use these or an equivalent well-maintained library):
   - **PDF** → `pdf-parse` (`bun add pdf-parse`). **v2.x API — use the `PDFParse` class, NOT the v1 default
     function:** `import { PDFParse } from 'pdf-parse'; const text = (await new PDFParse({ data }).getText()).text;`
     (pass the file bytes as `data`). The old v1 `import pdf from 'pdf-parse'` default-function call fails on v2 —
     do not attempt it first.
   - **DOCX** → `mammoth` (`bun add mammoth`)
   - **XLSX / XLS** → `xlsx` (`bun add xlsx`)
   - **PPTX** → `pptx-text-parser` or unzip the XML and read slide text
   - **Images** (`.png`, `.jpg`, `.jpeg`, `.webp`) → use your native image-viewing capability; if none,
     ask the user to describe or paste the key content
4. **Framework DocumentKB** — `bun {{HARNESS_DIR}}/tools/aidlc-knowledge.ts onboard <path>` is available and
   makes the doc citable, but note it may report `extractor_unavailable` in some runtimes; if it returns no
   text, fall through rather than retrying it.
5. **Last resort** — if no extractor yields clean text, ask the user to paste the text or drop a `.md`/`.txt`
   version. Only fall back to this after a real extraction attempt (step 3), not before.

**Rules that keep this efficient (not a ban — an ordering):**

- **Reach for the tool that works first.** For a PDF, go straight to the `bun add pdf-parse` approach (step 3)
  rather than trying `pdftotext`, `pip install`, macOS Quartz/Spotlight, or hand-parsing PDF bytes — those
  are usually absent or produce garbage, and they generate approval noise for nothing.
- **Never re-probe a tool you've already seen fail this session.** If `pdftotext` or a Python PDF lib was
  missing once, don't try it again for the next file — go straight to the `bun` parser.
- **One good attempt per file, then escalate the ladder.** Don't run five discovery probes before the tool
  that works; pick the format-appropriate parser and run it.
- **Raw byte-parsing of a binary is never acceptable** — subset-font PDFs yield glyph codes, not text. Use a
  real parser (step 3) instead.
- It is fine (expected) for the user to approve one or two `bun add` / script-run commands — that is a better
  experience than converting or pasting a large document. Make those approvals *productive* by choosing the
  right tool first.

**If the user says 'skip' or provides nothing:**

Proceed directly to Step 1. No penalty — the discovery steps are designed to be comprehensive on their own.

### Step 0b: Business Process Document / SoP Check — first-class input

A **Business Process Document** is any documented description of how a business process is executed today —
a Standard Operating Procedure (SoP), work instruction, process map/flowchart, agent playbook, runbook, or
operator training guide. These are the processes human operators are trained on, and they are the richest
possible input for an agentic design. When a use case is based on one, it is **first-class**: the solution
is built by deconstructing the documented process into its individual steps and automating each step with an
agent wherever possible, with explicit hand-over to a human where a step needs human input or review. Treat
a provided business process document as the primary source of truth for that use case's design.

**Detect business process documents two ways — both apply:**

1. **Auto-detect** — scan the `customer-context/` directory for business-process-like documents (files named
   or titled with "SoP", "SOP", "standard operating procedure", "process", "procedure", "work instruction",
   "process map", "playbook", "runbook", "workflow", "training guide", or documents structured as an ordered
   sequence of process steps / a flowchart). If any are found, note them.
2. **Ask explicitly** — regardless of what was auto-detected, ask:
   > "Is any use case in this engagement based on an existing **business process document** — an SoP, work
   > instruction, process map, playbook, or training guide that describes how the process runs today? If so,
   > point me at the document(s) (or drop them in `customer-context/`). If one defines the process, I'll base
   > the solution on it: I'll deconstruct it step by step and automate each step with an agent wherever
   > possible, handing over to a human where a step needs human input or review."

Confirm with the user which documents (auto-detected and/or named) are the authoritative business process
document(s) for which use case(s). If one is confirmed, run **Step 2b: SoP Deconstruction** for it. If none are provided,
skip Step 2b entirely — discovery proceeds normally.

### Step 1: Understand Current Contact Centre Landscape

> **Decisions owned by Platform Configuration are not asked here.** The **AWS region**, the **deployment
> environment(s) / workspace strategy**, the **LLM models** and the **voice provider** are decided in ACXD Platform
> Configuration. Do not pose them as discovery questions. If the user volunteers one, record it as context for
> Platform Configuration to confirm; do not ask it twice.

Ask the user/customer about their current contact centre setup:
- What platform(s) are in use today? (IVR, ACD, CRM integration, knowledge bases)
- What channels are active? (Voice inbound, voice outbound, chat, email, SMS, social, web)
- What is the current automation level? (DTMF IVR, basic chatbot, none)
- What are the current pain points? (Long handle times, high escalation rates, agent attrition, after-hours coverage)

### Step 2: Identify and Classify Use Cases

For each candidate use case:
- Describe the customer interaction from greeting to resolution
- Classify as **deterministic** (fixed, auditable — routing, auth, simple lookups, escalation) or **agentic** (flexible, multi-turn — complex servicing, FAQ, open-ended tasks)
- Estimate call/contact volume and average handle time
- Assess automation suitability (high/medium/low) based on complexity, compliance sensitivity, and data availability
- Identify Live Sync (Voice+) opportunities — interactions where turning a spoken exchange into a guided visual experience adds value (forms, selections, confirmations)

### Step 2b: SoP Deconstruction — RUN ONLY IF A SoP WAS PROVIDED

**Run this step only when Step 0b confirmed one or more SoPs.** If no SoP was provided, skip to Step 3.

When a use case is based on a SoP, it becomes the backbone of the design. Deconstruct each confirmed SoP into
its individual business functions and map every step to how it will be delivered — agent, human, or hybrid.

For each SoP:

1. **Deconstruct into ordered steps.** Break the documented process into its individual business functions /
   steps, preserving order and any branching / decision points. Capture, per step: the actor today (who does
   it), the trigger, the inputs, the action, the outputs, and any decision/branch conditions.
2. **Classify each step by automation fit:**
   - **Agent-can-do** — the step can be performed by the conversational agent (information capture, lookups,
     validation, guided selection, generating a response, calling an API / data request).
   - **Human-must-do** — the step requires a human (physical action, regulated sign-off, judgement outside
     policy, something with no system of record to action it). These become explicit hand-offs.
   - **Hybrid** — the agent does part (e.g. gather + validate + draft) and a human completes it (e.g.
     approve / physically fulfil). Capture exactly where the boundary sits.
3. **Map the automation approach for each agent-can-do / hybrid step:** deterministic vs agentic (per Step 2),
   which data source / integration it needs (feeds Step 4), whether it matches a known pattern
   (auth, escalation, callback), and any compliance sensitivity.
4. **Decide how much of the process to automate.** Some or all — the user decides. Present the deconstructed
   steps with their classification and recommend an automation boundary (e.g. "automate steps 1–5 and 7;
   step 6 is a human approval hand-off"), then confirm with the user. Offer the boundary
   as a recommendation to confirm, not a silent default. When the SoP steps already define the boundary, show it as one line in
   the round's "From your material" part, not as a separate question.

Produce `acxd-sop-deconstruction.md` containing, per SoP:
- SoP name, source document, and the use case(s) it drives
- The ordered step table:
  | # | Step / Business Function | Actor Today | Inputs | Outputs | Classification (Agent / Human / Hybrid) | Automation Approach (deterministic/agentic, integration, component) | Compliance |
- The recommended and agreed **automation boundary** (which steps are automated this phase, which are human
  hand-offs, which are deferred)
- Open questions / gaps where the SoP is silent or ambiguous

This deconstruction feeds directly into user-story generation (the `acxd-user-stories` stage in Inception):
each agent-can-do / hybrid step maps to one or more user stories tagged `[FROM-SOP]`, and each human-must-do
step is captured as an explicit out-of-scope / hand-off note so the automation boundary is unambiguous.

### Step 2c: Surface Matching Component Patterns

As soon as a use case (or a SoP step from Step 2b) implies a capability that a **pre-defined component
pattern** covers, name the matching pattern and **surface its menu of vetted configurable choices to the
user during discovery**, so the choice is made here with the user and each configurable option is offered
for them to pick or confirm. This is a generalised rule that applies to **every** component pattern the DSL provides (see `acxd-flow-design.md` and the Flow DSL
component builders), not just authentication.

The DSL component builders currently provide these patterns — recognise the trigger, name the pattern, present its menu:

| If the use case needs… | Pattern | MUST-OFFER options (surface every one; extensible per the rule below) |
|------------------------|---------|------------------------------------------------------------------------|
| Identity verification | `auth-verify` | Number of factors (1–3); Factor 1 (account no. / phone / email / member ID); **Factor 2 — MUST-OFFER minimum: PIN, SMS OTP, date of birth, last-4 (surface all; may add another buildable factor)**; SSO/federated redirect; step-up for high-security |
| Transfer to a human | `escalation` | Escalation trigger(s); target queue/skill; context passed to agent; business-hours vs after-hours behaviour (queue hours are a business fact: when the source is silent, ask neutrally, e.g. "Is the queue staffed 24/7? If not, what happens after hours?", with no recommended option) |
| Greeting / routing | `welcome-router` | Intents routed; fallback on repeated no-match (escalate / menu / loop) |
| Answering from knowledge | `faq-lookup` | Knowledge source(s); grounding/citation; no-answer fallback |
| Gathering structured input | `data-collection` | Fields to capture; validation; confirmation pattern; no-match retries |
| Taking payment | `payment` | Amount source; confirmation; PCI handling; refund → agent approval |
| Booking / scheduling | `booking` | Slot source; reschedule/cancel; confirmation channel |
| Checking status | `status-lookup` | Lookup key; response shaping; not-found handling |
| Capturing feedback | `feedback` | Scale/metric; free-text capture; follow-up routing |
| Requesting a callback | `callback-request` | Number capture/validation; **fulfilment mode (sink exit): (a) native Connect queued callback via Escalate [VOICE only, least infra] or (b) external-system record (DynamoDB/CRM + scheduler) [any channel incl. CHAT, and required for a scheduled window or a trackable list]**; callback window (external mode only); escalation on capture failure |

> **Callback fulfilment is a sink-exit decision (see "Terminal sink flows" in `acxd-flow-design.md`).** A callback flow is a terminal sink and MUST actually fulfil the callback — never an acknowledge-only "we'll call you back" message that ends with no action. Pick the mode by CHANNEL + need: **voice + call-when-free** → native queued callback (Escalate; Connect runs Transfer-to-Queue callback downstream). **chat, OR a scheduled window, OR you need to list/cancel callbacks** → external-system record. Record the chosen mode in the integration inventory; it becomes the sink's single declared exit in the Data-request order table.

> **Settled by the source? Confirm, don't menu.** When the SoP or other customer context already answers a
> setting, state it as one line to confirm (the "From your material" part of the round) and do not show its option list;
> never offer an option the source rules out (e.g. an after-hours callback when the SoP has one 24/7 queue and
> no callback). The rule below applies only to settings the source leaves open.
>
> **The option lists above are a MANDATORY MINIMUM, not a ceiling — floor-not-ceiling.** For an open setting,
> surface EVERY listed option; never silently drop one (e.g. do not offer DOB + OTP but omit PIN). The lists
> are **non-exhaustive**: you MAY add a further option when the user's context recommends it AND it is
> **buildable in ACXD** — i.e. you can capture it as a slot and/or wire it to a data request or Connect action
> (for auth, a "factor" is just a slot capture + a value passed to the verify data request; there is no fixed
> SDK enum of factors). Do NOT invent an option that isn't buildable, and do NOT narrow a list. **One
> exception — closed SDK enums:** where a parameter's values come from a fixed enum (e.g. a generative node's
> `modelType` = the closed `GenerativeModelType` set), that IS a ceiling — offer only enum values, never add.

**Procedure (applies to any matched pattern):**

1. Name the pattern to the user ("this looks like our identity-verification pattern") and capture
   its options as decisions for Flow Design.
2. Present the pattern's ✅ Configurable parameters as a short **menu of choices**, each with the listed
   alternatives and the default marked *(recommended)* — exactly as the Flow DSL component builders → "How to Use
   These Patterns" prescribes. **Render each open setting as its own numbered round question, never as `2.1` sub-questions,** with its
   options as a numbered list, one per line, recommended first and `Other` last, replied to by round number
   (persona round-numbering rule), e.g.:
   ```
   2. (Q5) Second sign-in factor
      1. PIN (recommended)
      2. SMS OTP
      3. Date of birth
      4. Last-4
      5. Other
   ``` A setting with only one sensible value is shown as
   a single line to confirm, not padded with invented options. For authentication specifically, present the **MUST-OFFER Factor-2 minimum every time — PIN, SMS OTP, date of
   birth, last-4 — surface all, never a subset** (e.g. do not offer DOB + OTP but omit PIN); you MAY add another
   buildable factor the user's context recommends (per the floor-not-ceiling rule above). When the SoP/source
   names a specific factor, recommend THAT. Otherwise prefer a factor that stores no extra sensitive PII and
   needs no extra channel: **PIN or last-4 is the lightest recommended default; SMS OTP where a possession
   factor is wanted** — recommend **date of birth last**, since it is stored PII the system must then hold and
   protect. Never settle on a single factor silently.
3. Let the user pick or confirm. Record the chosen configuration against the use case so it carries into
   design. Do not present a default as though it were the decision.
4. ❌ Fixed parameters are applied as-is, not offered as choices.

This step captures **decisions**, not full flow design — the detailed design still happens
in Flow Design. The point is that the pattern's *options* are surfaced early, while scope is
being agreed, so the customer's choices (like OTP) are captured in the scoping artefacts rather than assumed.

### Step 3: Qualify Engagement Pattern

Ask the critical engagement pattern questions:

1. "Is the goal to solve one specific customer interaction, or to build a platform that will host multiple automated journeys?"
2. "Do you have other use cases identified beyond the initial one? How many? What is the timeline?"
3. "Will multiple teams build use cases in parallel, or is this sequential?"
4. "Are there interaction patterns you know will be common across use cases?" (e.g., identity verification, escalation, FAQ handling)

Record `engagement_pattern` in the discovery report (`acxd-cx-discovery-report.md`):
- `use-case-lead` — single use case, deploy and done
- `platform-single` — platform build starting with one lead use case
- `platform-multi` — platform build with multiple initial use cases

**Then capture the Agentic Design Principle axis** (a second preference axis — it governs how much the design leans on
agentic reasoning vs. fixed auditable flows, to match the customer's risk profile. Independent of the engagement
pattern.):

5. "Across the deterministic <> agentic spectrum, where does your organisation want this solution to sit? This
   sets a DEFAULT lean; you can override it per function (e.g. 'the authentication DECISION must stay deterministic
   even in Agentic mode' — while the factor collection can still be agentic). There is no wrong answer — it matches automation to your risk tolerance."

<agentic-design-principle-options>
- **deterministic** (maximum control): fixed, auditable flows by default; agentic reasoning is the exception.
  If a use case genuinely cannot be served without a Generative Journey, surface that LOUDLY and require an
  explicit opt-in rather than adding agentic behaviour silently.
- **hybrid** (DEFAULT): **agentic where it improves the customer experience** — natural, conversational capture
  and open-ended understanding — **and deterministic where precision, auditability, or a trust/money/compliance
  DECISION requires it.** Modern agentic UX is the default for engagement, data collection, and routing; reserve
  deterministic flows for the decisions that must not depend on model judgment (the decision floor below).
  Do NOT default a step to deterministic merely because the data it handles is structured.
- **agentic** (maximum autonomy): prefer Generative Journey + tools for engagement and routing; fewer,
  reasoning-driven steps — SUBJECT TO the deterministic DECISION floor below (the verdict stays deterministic; collection may be agentic), which holds in every mode.

**Data collection is EXEMPT from the decision floor.** The floor governs only the DECISION / reasoning / approval step (the verdict). HOW the inputs are collected is never constrained by it — collection follows the flow's design lean: **deterministic lean → `user_choice`; hybrid or agentic lean → a Generative Journey with `dataCapture`**, auth collection included. See the Data Collection principle in `acxd-architecture-principles.md`.
</agentic-design-principle-options>

<deterministic-decision-floor>
**The floor is on the DECISION, not the data collection.** For high-consequence steps, the *ultimate
determination* — authenticated? payment authorised? consent valid / compliant? — MUST come from a deterministic
means (a data request, a Connect-side check, or a rules-based split), never from an LLM judgment. This decision
floor is never lifted by "agentic" mode; it can only be relaxed per-function by an explicit, recorded customer
override.

**Data COLLECTION for these same steps is a separate matter — agentic capture is perfectly fine and, in
hybrid/agentic modes, is the ENCOURAGED modern approach.** Gathering an account ID + PIN in one natural turn, or
capturing consent conversationally, is good UX: the captured values are then handed to the deterministic check
that makes the decision. Do NOT force the whole step into rigid one-at-a-time prompts to satisfy this floor —
only the verdict must be deterministic.

**Criterion for what needs a deterministic DECISION (a test, not a fixed list): the step's OUTCOME is
high-consequence and must be auditable — it must not depend on model judgment.** This covers steps that gate
access or make a trust/authorization decision, irreversible or high-value actions, regulated/compliance
determinations, and anything creating a legal or financial record. (Illustrations, NOT the complete set: the
PASS/FAIL of credential/PIN/OTP verification, the authorise/decline of a payment, the valid/invalid of consent —
the *collection* of those same factors is agentic-eligible. A low-risk step that merely resembles one — e.g.
asking which existing policy a query is about, or capturing a name for a lookup — is not in scope at all.)
</deterministic-decision-floor>

Record `agentic_design_principle` in the discovery report (`acxd-cx-discovery-report.md`): `deterministic` | `hybrid` (default) | `agentic`. Also record any
per-function overrides (e.g. `{ "authentication": "deterministic" }`). Carry both into flow design — they bias
the per-segment classification in the Deterministic-vs-Agentic framework; they never move a high-consequence DECISION off a deterministic mechanism (collection lean is separate).

### Step 4: Map the External Integration Landscape

For each identified use case, capture the external systems needed:

**Customer data sources (read):**
- CRM (Salesforce, ServiceNow, Dynamics 365, custom)
- Core systems (banking, ERP, order management, inventory)
- Identity and authentication providers
- Knowledge repositories (FAQ databases, product docs, policy documents)

**Transactional systems (write):**
- Payment processing / billing
- Case/ticket creation
- Appointment/booking systems
- Order management (create, modify, cancel)
- Notification services (SMS, email, push)

**For each integration, capture:**
- System name and type
- Access method (API key, OAuth, SigV4, SAML, other)
- Read or write (or both)
- Compliance sensitivity (PCI, PII, HIPAA, other)
- Owner (which team manages this system)
- API documentation availability

> **Integration mode — ONE question per data need, three options. Never infer it: silence is still a question.** Present
> inferred integrations as candidates to confirm, then ask this for each external data need. Silence is not
> permission to mock.

First decide the DATA CHANNEL for each need:
> "For [data need], how is this served?
> 1. **API integration** — call an external system (CRM, billing, identity, pricing)
> 2. **Knowledge base** — search a document collection (policy docs, FAQs, product info)
> 3. **Not sure** — I'll help you decide from the data characteristics"

For every **knowledge base**, ask where its content comes from. Ask it even when the source names a document set
(for example "approved policy documents"): naming documents does not mean they are available to load.
> "For the [knowledge base] knowledge base, where does its content come from?
> 1. **Generate synthetic content** — I write realistic sample documents or Q&A for testing, marked as synthetic
>    (recommended when no documents are in `customer-context/`)
> 2. **Your documents** — you add them to `customer-context/` and I load them
> 3. **Other**"

Record option 1 as Mode `Mock` and option 2 as Mode `Live` in the integration inventory; Resource Creation generates
or loads the content from that column.

For every **API integration**, ask the single integration-mode question (merges live-vs-mock AND who-defines-the-contract).
Ask it with all three options even when no schema was supplied: a missing schema makes option 3 the recommendation,
never a reason to drop the question or replace its options with your own:
> "How should this API be provided? Pick one:
> 1. **Live APIs accessible from ACXD** — *you provide the OpenAPI 3.x schema*; I design and build the flows
>    around your real systems and point the data requests at the live endpoints (root URL / path). No backend
>    is deployed. Use this when ACXD can reach your live business systems directly.
> 2. **Mocked APIs with your schema** — *you provide the OpenAPI 3.x schema*; I design the flows around YOUR
>    contract, then deploy a backend for it (API Gateway + Lambda) with a small realistic synthetic dataset to
>    test against. Use this when the contract/systems exist in production but are not reachable from dev/test.
> 3. **Mocked APIs with a generated schema** — no existing API; I author a minimal OpenAPI 3.x schema for the
>    operations the use case needs (the generated contract), then deploy the mock from it with synthetic data.
>    The fastest path to a working conversational AI when the back-end systems are not in place."

> **An OpenAPI 3.x schema exists for EVERY option — it is the single authoritative contract that steers flow
> design, and it lives as a FILE in `customer-context/` for every option.** Options 1 & 2: the user PROVIDES it
> (MANDATORY — if they pick 1 or 2 without a schema in `customer-context/`, STOP and request it; the agent does
> not reverse-engineer a real contract from chat, so no schema → the only option is 3). Option 3: the AGENT
> authors a minimal generated schema AND WRITES IT TO A FILE in `customer-context/` here in discovery (e.g.
> `customer-context/<integration>-openapi.yaml`) — do not leave it as an unwritten notion; it must be a real
> on-disk artifact by the end of discovery, because flow design reads it from there. Either way, by the end of
> discovery there is one OpenAPI schema FILE per integration in `customer-context/`, and "the API steers flow
> design" then holds UNIFORMLY — no per-option exception. (If flow design later reveals a capability the
> generated schema is missing, the agent EXTENDS this same file at the gap gate below — it is written early and
> grows if needed, never re-invented.)
>
> **A generated schema (option 3) is authored in the shape an ACXD Data Request calls directly**, so backend
> design never has to reshape it. ACXD supports both URL parameters and JSON request bodies (including nested
> bodies) on any method; for a GENERATED mock contract we choose, as a preference, the simplest shape: reads as
> GET with URL/query parameters, writes and any sensitive input (PIN, tokens) as POST with a flat JSON body (nest
> only where the domain genuinely needs it); a flat response whose yes/no verdicts are
> real JSON booleans (`verified`, `found`), not string enums like `PASS`/`FAIL`; and HTTP 200 for a business
> negative (wrong PIN = `verified: false`, not an error status; reserve 4xx/5xx for genuine faults). Backend
> design then copies these operations into the API specifications unchanged.
>
> **One operation per request the SoP describes** (e.g. one quote request, not one per product line). **Every input
> the SoP names is its own named field** in that request, listed under `required` only when every caller supplies
> it; a field only some paths supply (one product line's questions) is optional. **A value the caller states is a `string`** (e.g. `vehicleMake`, `yearBuilt`, `sumInsured`,
> `priorClaims` as "yes"/"no"), because the flow captures it as text; the backend parses it (values are shaped at the API boundary, not in the flow).
> Values the system or flow already holds in typed form keep their type (`loyaltyLevel: number`, `multiPolicy: boolean`). Never a
> free-form `object` or one free-text "details" field: the build then requires one capture per field, so each SoP
> question becomes its own slot.
>
> **Paths in a generated schema are `/{operationId}`** (one camelCase segment, e.g. `POST /verifyIdentity`,
> `GET /getCustomerPolicies?accountNumber=...`), because the deployed backend routes on the final path segment and
> serves `data/<operationId>.json`. Do NOT author REST-style paths (`/auth/verify`, `/customers/{id}/policies`)
> for a mock: Resource Creation would then rewrite every URL to fit the router and the OpenAPI would stop
> describing what is deployed. With `/{operationId}` paths the OpenAPI, the API specifications,
> `data-requests.json` and the mock all match, so the same file can later serve as the contract for a live API.
>
> **Each schema names its API and declares its auth.** Every OpenAPI file has an `info.title` and
> `info.x-acxd-api-id: <camelCase>Api` (for example `billingApi`); the id names the API's secrets and `.env` keys,
> and later steps refer to the API by that name. **`info.x-acxd-generated: true` marks an API this solution
> deploys** (a backend with synthetic data): set it for options 2 and 3, never for option 1. For option 2, add the
> two `info` keys to the copy of the user's schema in `customer-context/` only; operations, parameters and
> responses stay exactly as the user wrote them. A generated (option 3)
> schema always declares `components.securitySchemes.ApiKeyAuth: { type: apiKey, in: header, name: x-api-key }`
> with a global `security: [{ ApiKeyAuth: [] }]`, and a `servers` placeholder (the real URL comes from deployment).
> For a customer schema, read its `servers` and `securitySchemes` and record each API's auth in the integration
> inventory. Supported: `apiKey` (header, query or cookie), `http` bearer and basic, and `oauth2`/`openIdConnect`
> as a current access token the operator refreshes. `http` digest and `mutualTLS` cannot be sent by an ACXD data
> request: flag them as a gap for a human decision (an adapter backend). Credential VALUES never go in the OpenAPI
> file; they are entered later in `.env`.

> **API-capability gap assessment `[HUMAN-REVIEW]` — the universal escape hatch (runs for ALL options).** The
> OpenAPI steers flow design, so it must be able to MEET the use case. Assess the schema against the SoP
> requirements and user stories: for every required capability (e.g. SoP Step 3 needs identity verification),
> confirm an operation can serve it. List every GAP (a required capability with no matching operation) and STOP
> for a human decision. The resolution options the human is offered depend on who owns the contract:
> - **User-provided schema (options 1/2):** you cannot invent someone's real endpoint — offer: change scope,
>   supply more of the API, or add a generated mock operation for that gap. Never edit the user's schema to
>   pretend an operation exists.
> - **Generated schema (option 3):** the agent owns the contract — offer to **add the missing operation(s) to
>   the generated OpenAPI** (human-approved), then continue. The schema still leads; the gate just lets it grow.
> Either way: do NOT silently let a partial API shape the design, and do NOT add an operation without the
> human approving it at this gate.

**For every API / Data Request, ask the Always Retrigger opt-out (ask here, as soon as the APIs are known — do
NOT defer to flow design):**
> "By default we enable the Data Request caching control **Always Retrigger** on every API call, so each call
> re-runs and returns fresh data every time it is reached. You only turn it OFF for a call that serves
> **static / unchanging** data (a fixed lookup table, reference data that does not change per conversation),
> where re-calling adds latency and backend load for no benefit. Which of your APIs, if any, should have Always
> Retrigger turned OFF?"

Default is ON for every API. Turn it OFF only for the specific calls the user names as static/unchanging. There
is NO GET-vs-POST/PUT split — this is a per-API caching choice, not a safety switch (timeout/failure are
self-managed regardless; see `acxd-node-reference.md`). Record the choice per data request in the inventory.

Record each decision in the integration inventory with columns:
| Source Name | Type (API/KB/Static) | Mode (Live/Mock) | Mock Style (Static/Deployed) | Contract (User-defined/Harness-designed) | Always Retrigger (On [default]/Off) |

Produce `acxd-integration-inventory.md`.

### Step 5: Capture Baseline Contact Centre Metrics

If available, capture current baseline metrics:
- Containment/deflection rate (% resolved without human agent)
- Average handle time (AHT) per use case category
- First contact resolution (FCR)
- Customer satisfaction (CSAT/NPS)
- Transfer/escalation rate
- Cost per contact
- Contact volume by intent category
- Abandonment rate
- After-hours contact volume

These baselines anchor the ROI case and define target metrics for the automated solution.

### Step 5c: Capture Guardrails & Sensitive Topics

Every engagement must explicitly capture what the assistant **must not do** and which topics require special
handling. This is a scope-and-risk decision the customer owns, and it belongs in the scoping artefacts — not
something to leave until guardrails are configured at operational readiness. Treat this like a pattern:
present the categories as a menu and capture the customer's decisions for each.

Ask about each category (use a numbered list so the user can batch-answer):

1. **PII handling** — what personal data will appear in conversations (names, account numbers, DOB, card
   numbers, health data)? What must never be echoed back or logged? What redaction is required?
2. **Prohibited / regulated topics** — what must the assistant **refuse to answer or advise on**? (e.g.
   financial / legal / medical advice, anything under regulatory constraint, competitor comparisons,
   complaints adjudication.)
3. **Escalate-instead-of-answer topics** — sensitive areas where the correct behaviour is to hand off to a
   human rather than attempt an answer (e.g. vulnerable-customer signals, hardship, disputes, safeguarding).
   - **Generative Journey human-escalation prompts (ask whenever a Generative Journey node is used).** A Generative Journey can
     exit on a NATURAL-LANGUAGE condition you describe in plain English, which becomes a HUMAN-ESCALATION point.
     Offer the customer these samples to select, plus free text to add their own:
       - "If the customer sounds frustrated or upset"
       - "If the customer asks to speak to a human or a real operator"
     Explain that each selected prompt becomes a Generative Journey exit that routes to the human-escalation path ONLY. For now
     these describe escalation triggers only — do NOT offer prompt-described exits to other flows (that is
     deferred to keep routing simple). Record the chosen prompts against each Generative Journey so flow design wires them as
     named Generative Journey exits to escalation.
   - **Generative Journey off-script scope `[HUMAN-REVIEW]` (ask whenever a Generative Journey node is used).** A
     Generative Journey's value is that the caller can stop and ask freely (e.g. "what are my policies", "what
     does this cover") — it answers off-script only from the knowledge bases and read lookups attached to it. In
     an **agentic or hybrid** design the default is to attach EVERY read-only, caller-scoped lookup and EVERY
     knowledge base to each Generative Journey, so the caller can ask about anything they are entitled to;
     a **deterministic** design attaches nothing by default. Show this default as one line to confirm in the round's "From your material" part
     (not an option menu); the user confirms it or names any system or knowledge base to EXCLUDE everywhere. Note that a lookup which could return another caller's
     data is never attached by default (it needs explicit sign-off), and that the concrete per-Generative-Journey
     connection set is reviewed again in flow design once the journeys exist. Record the confirmed posture + any
     blanket exclusions in the discovery report.
4. **Compliance drivers** `[HUMAN-REVIEW]` — call-recording consent, data residency, auditability, retention, plus the
   privacy regime(s) and any sector standard in scope. Present this as a **menu for the user to confirm**, so
   the jurisdiction and industry are set by their selection. This is a `[HUMAN-REVIEW]` decision (privacy/compliance): surface it and STOP for the user, however confident you are (the human decides; review tags). Two parts:

   **4a. Privacy / data-protection regime (generic — applies to any industry).** Ask which jurisdiction(s)
   are in scope and frame the guardrails against the reputable standard(s) for it. These are horizontal
   data-protection regimes, not sector-specific:
   - **General privacy best practice** *(default for a POC)* — PII minimisation, consent, redaction, retention
   - **EU / UK — GDPR / UK GDPR**
   - **Australia — Privacy Act (Australian Privacy Principles)**
   - **US — CCPA / CPRA (+ applicable US state privacy laws)**
   - **Canada — PIPEDA**
   - **Singapore — PDPA**
   - **Brazil — LGPD**
   - **Cross-cutting add-ons** (independent of jurisdiction): **PCI-DSS** if card payments are handled;
     **HIPAA** if US health information is handled
   - **Other / customer-specified**

   <industry-conduct-prompt>
   **4b. Sector conduct / security standard (adaptive — do NOT hard-code an industry).** Beyond horizontal
   privacy law, many sectors have their own conduct or security standard. **Do NOT assume insurance or
   financial services** — this plugin is industry-agnostic. Ask the customer what industry/sector they
   operate in and whether a sector conduct or security standard applies, then capture the relevant one as a
   guardrail driver. Consider the standard that fits the customer's ACTUAL sector.
   <examples note="ILLUSTRATIVE ONLY — never a default, never a checklist to apply; pick what fits the customer's real industry, or none">
   - Financial services / insurance: FCA (UK), APRA / ASIC (AU), US state DOI, SOX, SEC
   - Healthcare: HIPAA (US), My Health Record (AU)
   - Payments / retail: PCI-DSS
   - Telecoms: sector regulator codes (e.g. Ofcom UK, ACMA AU)
   - Government / public sector: jurisdiction records-management & security frameworks (e.g. IRAP AU, FedRAMP US)
   </examples>
   If no sector standard applies, record "general best practice" and move on — an absent sector standard is a
   valid, common answer for many contact centres.
   </industry-conduct-prompt>
5. **ACXD Guardrails (ask whenever the use case has a Generative Journey or Generative Text node — i.e. the
   model sees caller input or produces output).** ACXD guardrails are a RUNTIME enforcement layer applied at the
   APPLICATION level (not a flow node). Present these as a **menu to confirm** — nothing is applied unless the
   customer opts in, because only they know which values are safe to pass to the model and which topics matter.
   Where the chosen privacy regime (4a) suggests an option, PRE-SELECT it but still let them confirm.

   **Input guardrails (applied to what the CALLER says):**
   - **Prompt-injection / jailbreak protection** (recommended default on) — `llmJudge`.
   - **Off-topic / out-of-scope containment** — `llmJudge`.
   - **PII redaction** — mask personal identifiers in the caller's message. **Caveat (always state it):** this
     may hide information the model legitimately needs, so apply it only where the model does not need the value.
     Uses `llmJudge` for the general case; see the regex note below for fixed-format identifiers.
   - **Profanity / abuse flagging** — `keyword` (customer supplies the terms).
   - **Custom sensitive keywords / topics** — free text the customer adds.

   **Output guardrails (applied to what the ASSISTANT/model says):**
   - **PII leak prevention** — mask PII in generated responses.
   - **Sensitive-topic suppression** — do not volunteer specified topics (ties to the prohibited/regulated
     topics in item 2) — `llmJudge` or `keyword`.
   - **Brand / tone constraints.**
   - **Custom blocked keywords / topics** — free text.

   **Regex is a user-supplied option, never a shipped pattern.** Do NOT offer or invent regex for things like
   credit cards, driver's licences or vehicle registrations — these formats differ by country and a guessed
   pattern misfires. Offer `llmJudge` and `keyword` detection by default, and offer regex ONLY as: "if you have a
   fixed-format identifier specific to your business or country, supply the pattern and we will mask it."

   Record each selected guardrail (trigger input/output, the rule, detection method, enforcement action) so
   Resource Creation Step 5c can author `resources/guardrails.json` and attach them via `application.guardrails`.

6. **Tone / brand safety** — anything the assistant must avoid saying or any style constraints tied to
   brand or regulatory obligations.

For each identified item capture: the trigger (what the customer said or asked), the required behaviour
(**refuse** / **redact** / **escalate** / **constrain**), and the driver (regulation, brand, policy). Record
these in the discovery report under a **Guardrails & Sensitive Topics** section. This becomes a scoping
artefact the customer's risk / compliance stakeholders can review, and it feeds directly into the ACXD
guardrails authored at Resource Creation Step 5c (`resources/guardrails.json`, attached via
`application.guardrails`). Each selected item maps to a guardrail rule (detection + enforcement).

> This is a **scope capture** step — you are recording *what* the customer selected to guard and *why*. The
> ACXD guardrail resources themselves are authored at Resource Creation (Step 5c) and attached to the
> application. Capturing it here ensures sensitive topics are visible in the scoping document and priced in.

### Step 6: Produce the CX Discovery Report

**First, write the OpenAPI files** (Step 4): one per API integration in `customer-context/`. The integration
inventory starts with an `## API integrations` table, one row per API (`| API id | Provided by | OpenAPI file |`,
API id = the file's `info.x-acxd-api-id`; no rows when the use case has no APIs). The exit criteria below check both.

Write `acxd-cx-discovery-report.md` containing:
- Current contact centre landscape summary
- Engagement pattern determination with rationale
- Agentic Design Principle (`deterministic` | `hybrid` | `agentic`) + any per-function overrides, with rationale
- Use case catalog with deterministic/agentic classification
- Channel strategy recommendation (voice, chat, Live Sync, async)
- Guardrails &amp; sensitive topics (PII handling, prohibited/regulated topics, escalate-instead-of-answer
  topics, compliance drivers) — the safety scope, each with required behaviour and driver. Record the
  confirmed **privacy regime** (e.g. GDPR / Privacy Act / CCPA / general best practice) and any **sector
  standard** that applies (or "general best practice" if none) as explicit guardrail drivers.
- Baseline metrics (where available)
- Recommended AI-DLC scope based on engagement pattern

Write `acxd-use-case-priority-matrix.md` containing a ranked matrix:
| Use Case | Volume | AHT | Complexity | Compliance | Automation Suitability | Priority |

> **Questions file + summary confirmation: questions follow the core (persona, "Working with the AI-DLC harness").** The core always writes the questions
> file. When the directive has summary confirmation on, it runs the **Looks correct / Request changes** stop
> before the artifacts; when it is off (the PoC scopes), generate straight from the answers. Then
> **this stage's approval gate (Step 7)**.### Step 7: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-cx-discovery --result awaiting-approval`.

### Step 8: Present Completion & Request Approval

Review path: this stage's engine-resolved record dir.
Standard 2-option approval (Approve / Request Changes).
STOP for the human response. Report Approve with
`--result approved --user-input "<exact choice>"`; report
Request Changes with `--result rejected --user-input "<feedback>"`, revise the
artifacts, then report `--result revised` before re-presenting.

## Exit criteria

Checked by code when the approval gate opens; the gate stays closed until each passes. Fix the cause, not the check.

- run: `P="$PWD"; cd {{HARNESS_DIR}}/tools/acxd-deploy-engine && { [ -d node_modules ] || npm ci --silent; } && npx --yes tsx openapi-wiring-cli.ts --apis "$P/customer-context" --inventory "<record>/acxd-integration-inventory.md"`

## Learn

While running this stage, record observations in the engine-created
`<record>/<phase>/<stage>/memory.md`. Treat it as an output-only target:
never read, probe, create, or initialize it. Follow the active harness's
diary-write discipline: add entries through the stage's review-step ritual
(NOT by hand-editing `memory.md`) — the ritual records them under Interpretations,
Deviations, Tradeoffs, and Open questions, each with an ISO 8601 timestamp.

Record an entry only when a **genuine insight arose while running this stage** — a platform constraint you discovered, a non-obvious tradeoff you weighed, a workaround you found, or something that behaved unexpectedly and how you resolved it. These are the observations worth carrying to a future run.

The configuration and settings the user selected during the stage are captured in the stage artifacts and belong there — a restatement of a chosen engagement pattern, an authoritative SoP, a scope, or any selected option is a record of the decision, not a learning, so leave it out of `memory.md`. Most runs produce nothing worth recording under Interpretations, Deviations, or Tradeoffs; an empty stage memory is the normal, expected outcome.
