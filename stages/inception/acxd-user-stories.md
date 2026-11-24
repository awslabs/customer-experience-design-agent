---
slug: acxd-user-stories
number: 2.70
name: User Stories & Scoping
plugin: acxd
phase: inception
execution: ALWAYS
condition: Runs for all ACXD engagements. Generates the detailed, approvable user stories that constitute the agreed scope and deliverables for the rest of the engagement. Acceptance of the stories marks scoping complete.
lead_agent: acxd-platform-agent
support_agents:
  - aidlc-product-agent
mode: inline
produces:
  - acxd-user-stories
  - acxd-consolidated-scoping-doc
  - acxd-scoping-snapshot
consumes:
  - artifact: acxd-cx-discovery-report
    required: true
  - artifact: acxd-use-case-priority-matrix
    required: false
  - artifact: acxd-integration-inventory
    required: false
  - artifact: acxd-sop-deconstruction
    required: false
  - artifact: acxd-platform-config-spec
    required: false
requires_stage:
  - acxd-platform-config
sensors:
  - required-sections
scopes:
  - acxd-platform
  - acxd-usecase
  - acxd-platform-poc
  - acxd-enhancement
  - acxd-poc
  - enterprise
  - feature
  - mvp
inputs: CX discovery report, use-case priority matrix, integration inventory, SoP deconstruction (if any), platform config spec
outputs: acxd-user-stories.md, consolidated-scoping.md (+ .docx), scoping snapshot
---

# User Stories & Scoping

> **Tracked outputs and deliverables.** `acxd-consolidated-scoping-doc` is the record copy of `consolidated-scoping.md`,
> and `acxd-scoping-snapshot` is a short manifest pointing at the project-root `<projectName>-scoping-<YYYYMMDD-HHMM>/`
> folder. Write both in this stage's record dir as well as the deliverables.

> **MANDATORY STAGE-OPEN EMISSION — the first thing the user sees in this stage (reading the stage file first is fine).**
> Emit the H1 header line AND the intro line below it VERBATIM — copy both exactly as written here, word for word.
> They are fixed strings, not a description to paraphrase: do NOT reword, summarise, shorten, regenerate, or
> re-emoji either line. The `#` header must render as a real heading the user sees (NOT a code block, NOT a plain
> sentence). Emit exactly these two lines:
>
> # 📋 User Stories & Scoping
>
> Turns the discovery findings (and any SoP deconstruction) into CX-native user stories mapped to the agreed requirements, and consolidates them into the single scoping document that is the business approval gate. **Produces:** the user stories and the consolidated scoping document that defines the agreed scope and acceptance criteria for delivery.
>
> This is not optional and it does NOT degrade as context grows or the work feels urgent: a stage that opens without
> this hero header is as incomplete as one that ends without its `# 📋 User Stories & Scoping Complete` message (core
> stage-protocol §2). The opening header and the completion line are a matched pair — same emoji, same standard. Use
> the emoji exactly; never choose or re-check it.

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

This stage turns everything gathered during discovery and platform configuration into a detailed, approvable
set of **user stories** — the single most detailed description of scope and deliverables for the rest of the
engagement. Acceptance of these stories marks **scoping complete**: they become the agreed statement of what
the engagement will deliver and how the agreed business outcomes, metrics, and KPIs will be met.

Platform configuration precedes this stage deliberately — the workspace strategy, available integrations,
channels, and security boundary are all known, so the stories can be written against real constraints rather
than assumptions.

> **Execution mode — deliberate `inline` override.** This stage runs `mode: inline` on purpose, overriding
> the core `user-stories` stage's `mode: mob`. Core's mob topology dispatches generic software personas
> (design / developer / quality) to co-author stories; here the stories are synthesised by the ACXD
> platform specialist directly from the rich ACXD scoping context already in hand — the discovery report,
> use-case priority matrix, integration inventory, SoP deconstruction, and platform config — which the
> generic mob roster does not carry, and whose multi-perspective review is instead delivered by the
> downstream ACXD design stages (flow design, component design, testing). The plugin stage definition is
> authoritative, so `inline` always wins for this stage — treat it as settled and do not re-derive it or
> fall back to the core mob ritual. Human collaboration is a matter of how you facilitate the gate (invite
> as many stakeholders to review and shape the stories as the engagement needs), not of this topology.

## Steps

### Step 1: Assemble the Scoping Inputs

Read and synthesise everything scoping depends on:
- `acxd-cx-discovery-report.md` — engagement pattern, use case catalog, channel strategy, baseline metrics
- `acxd-use-case-priority-matrix.md` — ranked use cases with automation suitability
- `acxd-integration-inventory.md` — data sources, live/mock decisions, contracts
- `acxd-sop-deconstruction.md` (**if a SoP was provided**) — the deconstructed business functions with their
  agent-can-do / human-must-do / hybrid classification. **When present, this is the backbone of the stories:**
  each automatable SoP step maps to one or more user stories; each human-must-do step is captured as a manual
  hand-off or out-of-scope note so the boundary of automation is explicit.
- `acxd-platform-config-spec.md` — workspace/environment strategy, channels, security constraints

Present a brief synthesis of what you're working from and confirm the business outcomes, metrics, and KPIs
the stories must deliver against (drawn from the discovery report). If any are missing or vague, ask.

### Step 2: Generate User Stories per Use Case

For each use case (in priority order), generate a detailed set of user stories. Stories are **CX-native** —
written from the caller's / customer's perspective and the business's perspective, not generic software
stories. Use the standard form and make each one testable:

> **As a** [caller / customer / business role], **I want** [capability], **so that** [outcome].

For each story capture:
- **ID** — `US-<useCase>-<n>` (camelCase use-case token, e.g. `US-quote-01`)
- **Narrative** — the as/I-want/so-that statement
- **Acceptance criteria** — Given/When/Then, explicitly tied to the **business outcomes, metrics and KPIs**
  from discovery (e.g. "contained without agent", "verified in ≤ 2 turns", "AHT target met"). Every story
  must state how its success is measured. **Each "Then" states an outcome the caller can observe** (what they
  are told, can ask about, or receive), not only that a system call happens. "Then getCustomerPolicies returns
  held lines" tests the call; "Then the caller can ask about their held policies and gets their actual lines and
  tiers" tests the story. Architecture SIT and Build SIT check these outcomes end to end.
- **Conversation scope** — deterministic vs agentic (per the discovery classification), channels in scope
  (voice / chat / Live Sync), and any escalation path.
- **Delivery mapping** — which CAPABILITIES deliver this story (for example "identity verification", "quote
  pricing", "escalation to a human"). This is what makes the stories a genuine scope/deliverables statement.
  **Do NOT name flow ids here** (e.g. `billingMain`): flows are decided in Flow Design, and a
  story is an end-to-end outcome that may span several nodes or flows.
- **Data dependencies** — which integrations (from the inventory) the story needs, and their live/mock status.
- **SoP provenance** (if applicable) — which SoP step(s) this story automates; tag `[FROM-SOP]`.
- **Priority / MoSCoW** — Must / Should / Could / Won't-this-phase, consistent with the priority matrix.

Offer the configurable choices a story implies (e.g. auth factors, escalation targets,
channels) as a short menu to confirm rather than silently assuming a default.

Also capture, per use case:
- **Out of scope / deferred** — anything explicitly NOT being automated this phase (including human-must-do
  SoP steps), so the boundary is unambiguous.
- **Cross-cutting stories** — compliance (recording consent, redaction), error recovery, silence handling,
  and other conversation-design concerns that span stories.

### Step 3: Write the User Stories Artifact

Write `acxd-user-stories.md` containing:
- **Scope summary** — engagement pattern, use cases in scope, the business outcomes / metrics / KPIs the
  engagement commits to, and how the stories map to them.
- **User stories** — grouped by use case, each with the full detail from Step 2.
- **Delivery map** — a table mapping every story to the flows / components that will deliver it, so the
  stories double as the deliverables list that drives Flow Design, Component Design, and Backend Design.
- **Metrics & KPI traceability** — a table linking each committed business outcome / metric / KPI to the
  stories (and their acceptance criteria) that deliver it, so nothing agreed in discovery is unaccounted for.
- **Out-of-scope register** — everything explicitly deferred or left manual this phase.

The delivery map and metrics traceability are what make this the authoritative scope statement: downstream
design stages consume it, and every committed KPI is traceable to the stories that satisfy it.

### Step 3.5: Multi-Perspective Self-Review (before the gate)

Before presenting the stories for approval, review the full set through four lenses — applying the scrutiny
a multi-role review would give, using your ACXD domain expertise and the full scoping context you already
hold. Fix what you find, then present. This is a quality gate on YOUR drafted stories, not a new artifact.

<self-review-lenses>
Review every story (and the set as a whole) against all four:

1. **Testability (quality lens).** Does each story have concrete, verifiable Given/When/Then acceptance
   criteria — observable conversation behaviour, not vague intent? A story whose ACs can't be turned into a
   flow-logic test or a routing test is not done. Tighten any AC that a tester couldn't execute.
2. **Feasibility (build lens).** Can each story actually be built with ACXD as scoped — flows, nodes, slots,
   data requests, knowledge bases, the agentic Generative Journey? Flag any story that implies a capability
   the platform doesn't have, needs an integration not in the inventory, or assumes data no source provides.
   Feasibility problems found here are cheap; found after the scoping gate they are expensive.
3. **Business outcome (product lens).** Does each story trace to a committed business outcome / metric / KPI?
   A story that delivers no agreed outcome is scope creep; an outcome with no story is a gap. The metrics
   traceability table must have no orphans on either side.
4. **Conversation & CX design lens.** Is each story more than a happy path — does it account for the error
   paths, no-match / repair, confirmation, and escalation the conversation needs? A story that only describes
   the success path under-scopes the real conversational work.
</self-review-lenses>

If any lens surfaces a problem, revise the stories before the gate. Note briefly (one line) what the review
changed, so the human sees the stories were scrutinised — not to expose internal machinery, but because a
reviewed scope statement earns more trust than an unreviewed one.

### Step 4: Generate the Scoping Snapshot

**This step runs after the self-review (Step 3.5), before the acceptance gate** (for every scope that runs this stage). Everything this stage writes is written before the gate, so nothing in its record changes after approval.

Create a **scoping snapshot** at the project root — a self-contained, point-in-time, read-only export the
user can take away and circulate for review. Timestamp it to the minute so re-generating after an edit
produces a NEW immutable snapshot rather than colliding with an earlier one.

> **`<projectName>` = the canonical camelCase value captured in CX Discovery (Step 0-pre).** Reuse it
> verbatim here — do NOT invent a new name or re-derive it from the use case. Every snapshot/dist folder and
> deploy stack across the engagement uses this same value so they stay consistent.

```
<projectName>-scoping-<YYYYMMDD-HHMM>/       ← SCOPING SNAPSHOT (point-in-time, read-only)
├── acxd-user-stories.md              ← the agreed scope & deliverables (headline artefact)
├── acxd-cx-discovery-report.md       ← engagement pattern, use cases, channel strategy, baselines
├── acxd-use-case-priority-matrix.md  ← ranked use cases
├── acxd-integration-inventory.md     ← data sources, live/mock decisions, contracts
├── acxd-sop-deconstruction.md        ← (only if a SoP was provided) deconstructed steps + automation map
├── consolidated-scoping.md           ← SINGLE consolidated business document (working file — see Step 4a)
├── consolidated-scoping.docx         ← Word version — generated automatically beside the markdown (Step 4a)
└── README.md                         ← index + framing (see below)
```

Rules:
1. **Copy only artefacts that were actually produced.** Include the SoP deconstruction only if a SoP was
   provided. Do not reference files that don't exist.
2. **The snapshot is a READ-ONLY, point-in-time copy.** The harness record directory remains the source of
   truth for the user stories and all discovery artefacts. Edits happen in the harness (re-run / revise this
   stage); the snapshot is never edited in place — instead re-generate it to get a fresh dated snapshot.
3. **Timestamp to the minute** (`<YYYYMMDD-HHMM>`) so each generation is immutable and distinct.
4. Generate the snapshot `README.md` as an index of the contents plus this framing:
   > "This is a point-in-time scoping snapshot as of `<YYYYMMDD-HHMM>`. It captures the agreed project scope:
   > the discovery findings, SoP deconstruction (if any), and the user stories that define what the
   > engagement will deliver and how success is measured. This is a read-only copy for review and circulation
   > — the working copy in the harness remains the source of truth. If the stories change, ask for a fresh
   > snapshot."

Also place the consolidated business document (`consolidated-scoping.md` — assembled in Step 4a) in the
snapshot root alongside the individual artefacts. If the user later asks for the Word version, add it here too.

Present the snapshot to the user:

> "I've packaged a scoping snapshot at `<projectName>-scoping-<YYYYMMDD-HHMM>/` — a
> self-contained, point-in-time copy of the discovery findings, SoP deconstruction (if any), and the agreed
> user stories, ready to take away and review. The working copies stay in the harness as the source of truth;
> if anything changes, I can generate a fresh snapshot."

### Step 4a: Assemble the Consolidated Business Scoping Document

**This step runs before the acceptance gate, from the stories as they stand.** Produce a **single, self-contained,
business-focused scoping document** — `consolidated-scoping.md` — so a stakeholder can read the *entire*
scope in one file without opening any other artefact.

**CRITICAL — this is a consolidation of full copies.** This document assembles the complete content of every
source artefact inline, so the reader has the entire scope in one file and never needs to open another.
Concretely:

- **Include a complete, exact copy of each source artefact** in its section — reproduce the full body of the
  file as authored: every user story, the complete SoP step table, the complete priority matrix, the full
  integration inventory, every table in full. The section content matches its source artefact exactly. If the
  source has 28 user stories, all 28 appear here in full with the same content and layout as the source.
- **Include a complete, exact copy — reproduce the source as written.** For every section that carries the full
  content of an artefact (Discovery Findings, SoP Deconstruction, Use Case Priority, Guardrails,
  **User Stories & Deliverables**, Integration/External Interfaces, Out of Scope), open the source artefact
  file and reproduce its body exactly as written — same wording, same structure, same per-item fields, same
  tables. Keep every line as authored; the one change you make is demoting the artefact's own top heading to
  fit the consolidated numbering. For user stories specifically, each story appears in full with its narrative
  ("As a … I want … so that …"), its complete multi-clause **AC** line(s), and its
  Scope / Delivers via / Data / SoP / Pri line — exactly as in the source file.
- Everything the reader needs is present inline in this one document; the individual artefact files remain the
  living record, and this document holds a complete copy of each.
- The Executive Summary and Use Case Overview are the two sections you author fresh (a written summary for the
  sponsor). Every other section is a complete, exact copy of its source artefact.
- The result is expected to be a **large document** — that is fine and intended. Manageability comes from the
  table of contents and clear section headings, not from omitting content.

**Markdown skeleton — author the top of the document EXACTLY as shown so the Word converter renders a
gold-standard title page.** The `scoping-md-to-docx` converter recognises this specific shape (a bold brand
line, an `#` title, a bold subtitle, then a 2×N metadata table) and styles it precisely. Deviating (e.g. a
bullet list of metadata, or putting the whole solution name in the `#` title) degrades the title page.

```markdown
**<Customer / Organisation name>**
# Consolidated Scoping Document
**<One-line solution descriptor — e.g. Conversational Quote & Policy Enquiry Assistant on Amazon Connect (ACXD)>**

| Prepared for | <sponsor name / role> | Engagement | <engagement pattern, e.g. ACXD platform PoC> |
| Authoritative source | <e.g. SoP ACI-SOP-CX-001 v1.0, or "Discovery workshop"> | Scope baseline | <YYYY-MM-DD> |
| Scope | <acxd scope, e.g. acxd-platform-poc> | Status | <e.g. Scoping complete — for review> |

> This document is the complete, self-contained consolidated scope for business review. Every section below
> is inlined in full — you do not need to open any other file to understand the whole scope.

## Table of Contents

1. Executive Summary
2. Use Case Overview
   … (one line per section actually included, numbered to match the `#` sections below)
```

Skeleton rules:
- **Brand line** = the customer/organisation name only, wrapped in `**bold**`. Do NOT put the solution name here.
- **Title** = the literal `# Consolidated Scoping Document` (keep it short and constant — it renders as the big
  28pt title). The specific solution goes in the subtitle, not the title.
- **Subtitle** = a one-line solution descriptor wrapped in `**bold**`.
- **Metadata table** = a 2×N table (label | value | label | value). Use the labels shown (**Prepared for**,
  **Engagement**, **Authoritative source**, **Scope baseline**, **Scope**, **Status**) — these render as
  shaded bold label cells. Because this is an editable Word doc, if a value is genuinely unknown, **leave the
  value cell blank** — the converter fills it with **`TBD`** for the human to complete. Do not invent a value.
- **Intro note** = a `>` blockquote (renders as a grey italic callout).
- **Table of Contents** = the literal `## Table of Contents` heading followed by a numbered list of the
  sections actually included. The converter starts it on its own page.
- **Content sections use `#` (H1) headings, numbered** (`# 1. Executive Summary`, `# 2. Use Case Overview`,
  …); sub-sections use `## ` (H2), e.g. `## 3.1 Current Contact Centre Landscape`. The first content
  section (Executive Summary) starts on a fresh page automatically.

**Then the content sections, in this order:**
1. **`# 1. Executive Summary`** — 3–5 short paragraphs for an executive sponsor: business problem, proposed
   automation, engagement pattern, headline outcomes/metrics/KPIs, scope boundary. *(Authored summary.)*
2. **`# 2. Use Case Overview`** — per use case: customer problem, what the automation does, business value.
   *(Authored summary.)*
3. **`# 3. Discovery Findings`** — the **full content** of `acxd-cx-discovery-report.md` (current landscape,
   engagement pattern + rationale, channel strategy, reusability signal, baseline metrics, recommended
   scope). Inlined in full.
4. **`# 4. Standard Operating Procedure Deconstruction`** — *(only if a SoP was provided)* the **full content** of
   `acxd-sop-deconstruction.md`: the complete ordered step table, agent/human/hybrid classification, and the
   agreed automation boundary. Inlined in full.
5. **`# 5. Use Case Priority`** — the **complete** ranked matrix from `acxd-use-case-priority-matrix.md`, reproduced
   as a full table.
6. **`# 6. Guardrails & Sensitive Topics`** — the full safety scope captured in discovery (PII handling,
   prohibited/regulated topics, escalate-instead-of-answer topics, compliance drivers), reproduced in full.
7. **`# 7. User Stories & Deliverables`** — include a complete, exact copy of the body of
   `acxd-user-stories.md` in this section. Reproduce every user story in full with its narrative
   ("As a … I want … so that …"), its complete multi-clause acceptance criteria, and its
   Scope / Delivers via / Data / SoP / Pri line, plus the full delivery map and the full metrics/KPI
   traceability table — exactly as authored, same content and layout as the source file. This is the detailed
   scope and the single largest section, and it appears here in full.
8. **`# 8. External Interfaces Requiring Approval`** — the mandatory table below (its own top-level section because
    it is the longest-lead-time item in an enterprise engagement).
9. **`# 9. Out of Scope (this phase)`** — the full list of deferred / human-handled items, so the boundary is
    unambiguous.

**The External Interfaces Requiring Approval table (mandatory section).** Reshape every API and knowledge
source from `acxd-integration-inventory.md` into a business-and-security-approval view — a single list of the
systems the customer must start socialising with system owners and security teams *now*, because these
approvals take the longest in a large enterprise. Lead with: *"The following business systems must be
integrated. Each typically requires system-owner sign-off and a security/data review — begin these approvals
as early as possible as they are commonly the critical path to go-live."*

| Business System / Interface | Type (API / Knowledge) | Data Sensitivity (PII/PCI/None) | Read / Write | System Owner (team) | Approvals Needed (stakeholder + security) | Live or Mock for delivery |
|-----------------------------|------------------------|---------------------------------|--------------|---------------------|-------------------------------------------|---------------------------|

Populate one row per external interface. Where the owner or approval path is unknown, write **"TBC — confirm
with customer"** rather than guessing — an explicit gap is itself useful to the sponsor.

`consolidated-scoping.md` is the single source of truth for the consolidated view. It still lives in the
scoping snapshot alongside the individual artefacts (which remain the per-artefact record), but it must stand
completely on its own — a reader should never need to open another file to understand the full scope.

**Then generate the formatted Word document automatically.** After writing `consolidated-scoping.md`, run
the converter to produce `consolidated-scoping.docx` beside it (do NOT ask first), then tell the user both
the markdown and the shareable Word version are ready:

> "The complete consolidated scope is now in **`consolidated-scoping.md`** — every section inlined in full,
> so it stands on its own. I've also generated a formatted **Word version, `consolidated-scoping.docx`**,
> beside it so you have a shareable copy ready. Have a read and make any wording changes or additions in
> either file — tell me if you'd like me to regenerate the Word version after edits, or keep refining the
> wording in Word before sending it to the customer."

- **Use the shipped converter — do NOT hand-write or improvise the conversion.** As soon as
  `consolidated-scoping.md` is written, AUTOMATICALLY generate the Word version (do not ask first) by
  running the plugin's purpose-built, tested converter, then tell the user it is ready:
  ```bash
  python3 {{PLUGIN_DIR}}/tools/scoping-md-to-docx/scoping_md_to_docx.py consolidated-scoping.md
  # → writes consolidated-scoping.docx beside the markdown
  ```
  It renders the fixed, branded scoping format deterministically (title block, metadata table, TOC, H1/H2
  headings, bold-shaded data-table headers, provenance tags) and opens clean in Word. This is the customer-
  facing artefact that influences whether the engagement proceeds — it must look right every time, so never
  ad-hoc a docx library or take the markdown to an external tool.
- **Degrade gracefully.** If `python-docx` genuinely isn't available in the environment, don't fail the
  stage — tell the user `consolidated-scoping.md` is complete and ready and that you can generate the Word
  version once the converter can run. The markdown is the reliable deliverable; the `.docx` is the
  formatted convenience produced from it by the converter.
- Generate the Word version **automatically** as soon as `consolidated-scoping.md` is written — do NOT ask
  first. Just create `consolidated-scoping.docx` and inform the user it is available (they can request a
  regenerate after any edits). **Scope guard:** this auto-generation applies ONLY to this one named
  document, `consolidated-scoping.md` → `consolidated-scoping.docx`. It is NOT a general rule — do NOT
  auto-convert any other markdown file the workflow produces (discovery reports, flow specs, variable maps,
  intermediate artefacts, etc.). Only the three designated customer-facing documents get a Word version:
  the consolidated scoping document (here), and the architecture document + consolidated deployment runbook
  (in Operational Readiness).

### Step 5: Acceptance Gate — Scoping Complete

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-user-stories --result awaiting-approval`.

Present the stories for review with this framing:

> "These user stories are the detailed scope and deliverables for the rest of the engagement — each one is
> tied to the business outcomes, metrics, and KPIs we agreed in discovery, and each points at the flows and
> components that will deliver it. **Approving them marks project scoping complete**: this is the agreed
> statement of what we'll build and how we'll measure success.
>
> The stories are living — this harness record is the source of truth. You (or the customer) can review and
> update them here at any time, and the design stages will follow the updated stories. The **scoping
> snapshot** and the **consolidated scoping document** are ready to review now; if you request changes, I
> regenerate both with the revised stories."

Standard 2-option approval (Approve / Request Changes). STOP for the human response. Report Approve with
`--result approved --user-input "<exact choice>"`; report Request Changes with
`--result rejected --user-input "<feedback>"`, revise the stories, regenerate the snapshot and consolidated document (Steps 4 and 4a), then report
`--result revised` before re-presenting.


> **Produces & gate sequencing.** All three produces (`acxd-user-stories`, `acxd-consolidated-scoping-doc`,
> `acxd-scoping-snapshot`) are written before this gate and approved together, so nothing in this stage's record
> changes after approval.
>
> **Learnings placement:** when the directive lists learnings (off in the PoC scopes), the ritual fires BEFORE this acceptance gate. Order: stories -> self-review
> -> snapshot and consolidated document -> learnings ritual -> acceptance gate (STOP) -> Step 5a checkpoint ->
> Step 6 completion.

> **Questions file + summary confirmation: questions follow the core (persona, "Working with the AI-DLC harness").** The core always writes the questions
> file. When the directive has summary confirmation on, it runs the **Looks correct / Request changes** stop
> before the artifacts; when it is off (the PoC scopes), generate straight from the answers. Then
> **the acceptance gate (Step 5)**. The stories, snapshot and consolidated document are all generated before the gate.

### Step 5a: Scoping Checkpoint — Commit to Git

**This step runs once the stories are approved.**

Tell the user that scoping is a natural checkpoint for the whole engagement and prompt them to commit to Git:

> "**Scoping is complete — this is a natural checkpoint for the engagement.** All progress state lives on
> disk in the project (the harness record, the audit trail, and every artefact), so committing the project
> to Git now captures the entire engagement at this milestone.
>
> I recommend you **commit the project to Git here.** Because the state is in the repository (not in this
> chat session), once scoping is committed you can:
> - **Pick the engagement back up on any machine at any time** — clone the repo, open in Kiro IDE, and resume
>   exactly where you left off. This is how the engagement is handed from a scoping team to a delivery team.
> - **Pause here and resume later** — return to revise the scoping (re-run this stage to update the user
>   stories, discovery, or platform configuration) whenever you need; the design stages will follow the
>   updated scope.
> - **Proceed straight to the next phase now** — if you're ready to continue into design and build, just
>   carry on; scoping remains committed as your baseline.
>
> Suggested commit message: `chore(scoping): scoping milestone approved — <projectName>`."

This is PROSE guidance to the user, not an action the harness performs and not a selectable option. State the
commit recommendation and suggested message in the message text only. You do NOT run Git, and you NEVER present
a selectable option whose label contains "commit" (or any Git action) — see the persona hard rule "You never use Git". A "commit"
option label makes the agent treat committing as its own action to perform; it is not. The user commits (or not)
themselves, outside the workflow, at a time of their choosing.

The selectable options at this checkpoint are NEXT-STEP ONLY — continue or pause — for example:
> 1. **Continue** — carry on to Flow Architecture Design (the scoping artifacts stay as your baseline)
> 2. **Pause here** — stop at this milestone for now
Never add a third "commit then continue" style option. Committing is not one of the choices; it is a prose
recommendation the user acts on independently.

### Step 6: Present Completion

Completion header: use the fixed `# 📋 User Stories & Scoping Complete` line (see the Stage header rule above).
(There is no separate completion emoji for this stage — the fixed 📋 header is the completion signal.)
Review path: this stage's engine-resolved record dir.

## Learn

While running this stage, record observations in the engine-created
`<record>/<phase>/<stage>/memory.md`. Treat it as an output-only target:
never read, probe, create, or initialize it. Follow the active harness's
diary-write discipline: add entries through the stage's review-step ritual
(NOT by hand-editing `memory.md`) — the ritual records them under Interpretations,
Deviations, Tradeoffs, and Open questions, each with an ISO 8601 timestamp.

Record an entry only when a **genuine insight arose while running this stage** — a platform constraint you discovered, a non-obvious tradeoff you weighed, a workaround you found, or something that behaved unexpectedly and how you resolved it. These are the observations worth carrying to a future run.

The configuration and settings the user selected during the stage are captured in the stage artifacts and belong there — a restatement of a chosen engagement pattern, an authoritative SoP, a scope, or any selected option is a record of the decision, not a learning, so leave it out of `memory.md`. Most runs produce nothing worth recording under Interpretations, Deviations, or Tradeoffs; an empty stage memory is the normal, expected outcome.
