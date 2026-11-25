---
slug: acxd-platform-config
number: 2.65
name: ACXD Platform Configuration
plugin: acxd
phase: inception
execution: ALWAYS
condition: Runs for all ACXD engagements. Scope determines depth of configuration.
lead_agent: acxd-platform-agent
support_agents:
  - aidlc-aws-platform-agent
mode: inline
produces:
  - acxd-platform-config-spec
  - acxd-environment-strategy
  - acxd-security-plan
consumes:
  - artifact: acxd-cx-discovery-report
    required: false
  - artifact: acxd-integration-inventory
    required: false
  - artifact: requirements
    required: true
requires_stage:
  - requirements-analysis
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
inputs: CX discovery report, integration inventory, requirements
outputs: acxd-platform-config-spec.md, acxd-environment-strategy.md, acxd-security-plan.md
---

# ACXD Platform Configuration

> **Stage header (fixed — use exactly, do not choose):** open the stage with `# ⚙️ ACXD Platform Configuration` and end it with
> `# ⚙️ ACXD Platform Configuration Complete`. Phase banner for this stage: 🎨 Entering the Inception Phase (emit FIRST, see below).

> **MANDATORY STAGE-OPEN EMISSION — this is the first thing the user sees in this stage (reading the stage file first is fine).**
> This is the first ACXD stage of the Inception phase. Emit the phase-entry banner below EXACTLY as written, as literal Markdown
> (a rendered `#` heading the user sees, NOT a code block, NOT paraphrased), then the stage hero header (`# ⚙️ ACXD Platform Configuration`) + its intro line (both written below), then proceed. Emit the stage hero H1 line AND its intro line VERBATIM — copy both exactly as
> written, word for word; they are fixed strings, not a description to paraphrase. Do NOT reword, summarise,
> shorten, regenerate, or re-emoji either line.
> This is not optional guidance or a sample: a stage that begins without its opening banner is as incomplete as one that ends
> without its `# ⚙️ ... Complete` message (core stage-protocol §2). Do NOT skip it because context is long or the work feels
> urgent. Emit it once, at the very start:
>
> # 🎨 Entering the Inception Phase
>
> Now we design the solution: the platform configuration, the CX-native user stories and agreed scope, the conversation flow architecture, and the backend integrations. This phase turns discovery into an approved, buildable design.
>
> # ⚙️ ACXD Platform Configuration
>
> **What this stage does:** Configures the ACXD platform — workspace strategy, region, LLM model selection per task, channels, voice provider, data sources, and the backend connection pattern. **Produces:** the platform configuration spec, environment strategy, and security plan that the design stages build on.

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

Platform configuration PRECEDES flow design — flow design decisions depend on knowing what integrations are
available, what LLM providers are configured, what channels are active, and what the security boundary is.

## Steps

> **`[HUMAN-REVIEW]` decision in this stage (the human decides; review tags).** The **AWS region / data residency** for the
> solution is `[HUMAN-REVIEW]`: the whole solution (ACXD, Amazon Connect, and the mock backend if included)
> deploys to ONE region chosen once here. Surface the region choice and STOP for the user, with a recommendation,
> however confident you are. Do NOT offer a separate region for the mock or any other component.

> **Carry forward, do not re-ask.** Many inputs here were already decided upstream (channels, escalation,
> compliance, the integration approach). Before asking, list every decision this stage needs that already has a
> recorded answer in one short **"Carried forward"** block (decision -> value, and where it was decided), then
> ask only the decisions that have no answer yet. One line invites changes: "say if any of these should change".
> A `[HUMAN-REVIEW]` decision that already has an answer from the user (e.g. a region they named during
> discovery) is surfaced IN that block with its value and the change invitation -- that satisfies its
> surface-and-stop requirement, because the user sees it and confirms by approving the block. A
> `[HUMAN-REVIEW]` decision with NO user answer is always asked as a question. Never silently assume one.

### Step 1: Workspace Strategy

**Scope guard:** Multi-environment setup applies to `acxd-platform` and `acxd-usecase` scopes only.
For `acxd-poc` scope: use a **single workspace** — no environment separation, no promotion pipeline.
POC engagements are demo-grade, not production-track.

**Opinionated default — the ACXD workspace IS the environment boundary.** `[CONSOLE-VERIFIED]`
A workspace compiles to one application and owns all shared resources (slots, context variables, data
requests, knowledge bases, guardrails, secrets), so it is the natural, fully-isolated unit for dev/staging/
prod. Workspace create/list/read are SDK-callable (`CreateWorkspaceCommand` / `ListWorkspacesCommand` /
`GetWorkspaceCommand`), so the harness **provisions the environment workspaces itself** — no manual setup,
no pasted ids. Do NOT separate environments at the application level inside one workspace (that shares
resources across environments — leaky).

**Per-scope environment defaults (applied without asking — this is the locked default):**
- `acxd-platform` → **dev + staging + prod** workspaces.
- `acxd-usecase` → **dev + prod** workspaces.
- `acxd-platform-poc` / `acxd-poc` → **single workspace** (no separation — unchanged).

Each environment has its own `.env` (its own `ACXD_ENVIRONMENT`, `ACXD_WORKSPACE_NAME`, API token and backend
URLs/keys). The deploy engine creates or reuses the named workspace when the operator deploys; the agent never
creates workspaces.

> **`{project}` = the canonical camelCase `projectName` captured in CX Discovery (Step 0-pre).** Reuse it
> verbatim — do NOT re-derive or re-case it. The same value names the workspaces, deploy stacks, and default
> ACXD workspace/application names across the engagement.

**Only ask the user when a compliance/organisational policy might override the default:**

> "By default I separate dev/staging/prod as isolated ACXD workspaces in one AWS account (I create them for
> you). Does your organisation instead require **separate AWS accounts per environment** (full account-level
> isolation — needed only for specific compliance mandates)? If not, I'll use the workspace-per-environment default."

If they require account-per-environment: document it as the alternative (separate Connect + ACXD instance per
environment); the harness still runs in dev and Git/CI-CD promotes artifacts across accounts.

**ACXD topology (for reference):**
- 1 AWS account → 1 Amazon Connect instance → 1 ACXD instance
- 1 ACXD instance → multiple workspaces
- 1 workspace → multiple applications (one per use case)

Environment strategy for the multi-workspace default (ids are UUIDs, SDK-assigned at creation — NOT `ws-…`):
| Environment | Workspace | Purpose | Deploy Trigger |
|-------------|-----------|---------|----------------|
| Development | `{project}-dev` (uuid) | Active development, frequent deploys | On merge to `dev` branch |
| Staging | `{project}-staging` (uuid) | Integration testing, UAT | On merge to `staging` branch |
| Production | `{project}-prod` (uuid) | Live traffic | On release tag / manual approval |

For existing workspace engagements (`acxd-enhancement` scope): verify existing workspace configuration
and identify the current environment topology.


### Step 1b: Data Source Mode

**Decided in CX Discovery; carried forward here, not asked again.** CX Discovery's integration question settled,
per data source, whether it is live or mocked and where its contract comes from (a user OpenAPI or an
agent-generated one). There is one authoritative OpenAPI 3.x schema per integration in `customer-context/`.
Show this as ONE item in the stage's **"Carried forward"** block (see the note above Step 1), with the per-source
plan and the schema file names, for example:

> **Data sources** (from CX Discovery): verifyIdentity, getQuote: mock from the generated schema
> `customer-context/<project>-openapi.yaml`; coverageKb: knowledge base with synthetic content.

Do not ask a separate "does this still look right?" question or a separate Yes / Change question for it: the
block's single "say if any of these should change" line covers it. If the user changes a source (live to mock, or
the integration approach), record the change and re-check the gap assessment for that source.

Ask about data sources only if discovery recorded NO decision for a source (for example a source added after
discovery). For `acxd-poc` scope with no recorded decision, propose mock for every source and ask once.

### Step 2: Integration Configuration

Based on the integration inventory from CX Discovery:
>- **LLM model selection — TWO task-split questions, each picking from the closed `GenerativeModelType` enum.**
>   Do NOT ask a vague "which model?" (that produces an unhelpful "Sonnet or Nova"). Present the exact supported
>   list and split by task, because reasoning and data-collection work have different capability/latency needs.
>   The supported models (the closed `GenerativeModelType` Smithy enum — the ONLY valid values; no internet
>   lookup needed):
>   1. `anthropic.claude-sonnet-5-5` — highest capability/reasoning; higher latency and cost.
>   2. `anthropic.claude-sonnet-5` — previous Sonnet; strong reasoning.
>   3. `anthropic.claude-haiku-5-5` — fast, strong instruction-following at low latency; good default for data collection.
>   4. `anthropic.claude-haiku-4-5` — previous Haiku; fast and low latency.
>   5. `amazon-nova-2-lite` — low cost; weaker output quality than the Claude models.
>   6. `amazon-nova-micro` — lowest cost; simple classification only.
>
>   **Q1 — Reasoning & routing model** (drives **Generative Journey** and **Multimodal / Live Sync** nodes):
>   the agentic "thinking" work — multi-step reasoning, tool selection, open-ended understanding. Capability
>   matters more than latency here. *Recommended: `anthropic.claude-sonnet-5-5`* (or `claude-haiku-5-5` if
>   latency-sensitive on voice).
>   **Q2 — Data-collection model** (drives **Generative Text** nodes): single-shot generation — summaries,
>   short rewrites, field extraction. Latency-sensitive, no multi-step reasoning. *Recommended:
>   `anthropic.claude-haiku-5-5`*.
>
>   Record both as the project model defaults. The per-node mapping (GJ + Multimodal → the Q1 model; Generative
>   Text → the Q2 model) is applied automatically at flow authoring; the user confirms or overrides per node in
>   Flow Design Step 9c. Split nodes use their own smaller SDK set and default to `anthropic.claude-haiku-4-5`.
- **Amazon Connect integration** — plan the single Connect integration stack (contact flow via the Agentic CX block from `mainflow.json`, escalation queue, routing profile). The Agentic CX block references the ACXD Workspace/Application/Alias — there is no Lex bot to provision.
- **Channel configuration** — voice (Connect contact flows), chat (widget, messaging), Live Sync (Voice+)
- **Escalation channels** — configure the escalation path (Connect queue, external transfer)

### Step 3: Integration Architecture

For each external system in the integration inventory:
- Choose the connection pattern: Pattern A (Direct APIGW → Lambda → External API) or Pattern B (MCP via AgentCore Gateway bridge)
- Design the secrets strategy — one ACXD secret per external API credential
- For Knowledge Bases: plan ingestion approach per source (articles for curated FAQ, documents for product/policy docs, external for live-connected sources)
- For PCI-scoped integrations: design the secure payment flow

### Step 4: Channel Strategy

Go beyond "voice or chat":
- **Voice** — latency budget, ASR accuracy requirements, barge-in behaviour, silence timeout, and **TTS voice provider**. Present **Amazon Connect agentic voice as the recommended default** (Connect's native next-generation speech engine — AWS-recommended for agentic voice agents, 50+ locales; NOT Polly, NOT Nova Sonic), named for the deployment locale (e.g. `en-AU`). Offer the alternatives (Amazon Polly, Deepgram, ElevenLabs) only if the user needs them. Do NOT default to Polly or hedge about whether agentic voice exists — it is a confirmed GA provider. See the **Voice Provider Selection** pattern in `acxd-conversation-design.md` for the full option table and rationale. Voice is configured Connect-side (Set Voice block) and finalised when the contact flow is wired, so only the provider intent is captured here.
- **Chat** — widget configuration, rich content (cards, carousels, quick replies), typing indicators
- **Live Sync (Voice+)** — identify interactions where visual guidance adds value (forms, selections, confirmations). Plan the trigger points in flows.
- **Async channels** — SMS, email, social messaging routing via Connect flows
- **Cross-channel handoff** — design transitions (chat → voice escalation, voice → Live Sync visual)

### Step 5: Security & Token Management

ACXD uses API key authentication `[GA-GAP]` — not IAM/SigV4. Design the token management approach:
- Create programmatic users with least-privilege roles (one per environment for platform engagements)
- Token storage strategy (AWS Secrets Manager recommended for CI/CD pipeline access)
- Token rotation procedure
- Separate tokens per environment (dev, staging, prod)

For backend services:
- IAM roles and policies (least-privilege for Lambda, DynamoDB, API Gateway)
- Cross-account IAM if Connect/ACXD and backend are in separate accounts

### Step 6: CI/CD Pipeline Architecture (Platform & Use-Case Engagements)

**Scope guard:** Skip this step for `acxd-poc` — POC deployments use manual SDK scripts, not a CI/CD pipeline.
For `acxd-platform-poc`, treat it LIGHTLY: record the deployment-coordination approach at a high level (CDK for
mock backends + the ACXD SDK deploy sequence) and DEFER detailed CI/CD pipeline design to the deferred
operationalisation stages (a platform POC defers operationalisation; see the scope file). Do
not skip it entirely and do not design a full pipeline.

Design the split pipeline:
- **Track 1: AWS-native CI/CD** — backend services via CDK (`cdk deploy`), Connect CloudFormation stacks
- **Track 2: ACXD SDK pipeline** — Node.js scripts for resource creation, build, deploy
- Pipeline tooling choice (CodePipeline, GitHub Actions, other)
- Deployment coordination — backend deploy → ACXD resource update → ACXD build → ACXD deploy → verify

### Step 7: Multi-Team Workspace Strategy (Platform Engagements)

If multiple teams will build concurrently:
- **Team topology** — how many teams? Co-located or distributed?
- **Workspace sharing model** — single workspace (recommended) with flow-level isolation and naming conventions, or multi-workspace with export/import promotion
- **Flow ownership** — which team owns each use case's flows and resources? What is the change review process?
- **Deployment coordination** — build queue or scheduled deploy windows to prevent conflicts
- Record these team decisions in `acxd-platform-config-spec.md`.

### Step 8: Produce Configuration Artefacts

Write `acxd-platform-config-spec.md`, `acxd-environment-strategy.md`, and `acxd-security-plan.md`.

> **Questions file + summary confirmation: questions follow the core (persona, "Working with the AI-DLC harness").** The core always writes the questions
> file. When the directive has summary confirmation on, it runs the **Looks correct / Request changes** stop
> before the artifacts; when it is off (the PoC scopes), generate straight from the answers. Then
> **this stage's approval gate (Step 9)**.

### Step 9: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-platform-config --result awaiting-approval`.

### Step 10: Present Completion & Request Approval

Review path: this stage's engine-resolved record dir.
Standard 2-option approval (Approve / Request Changes).
STOP for the human response.

## Learn

While running this stage, record observations in the engine-created
`<record>/<phase>/<stage>/memory.md`.

Record an entry only when a **genuine insight arose while running this stage** — a platform constraint you discovered, a non-obvious tradeoff you weighed, a workaround you found, or something that behaved unexpectedly and how you resolved it. These are the observations worth carrying to a future run.

The configuration and settings the user selected during the stage are captured in the stage artifacts and belong there — a restatement of a chosen engagement pattern, an authoritative SoP, a scope, or any selected option is a record of the decision, not a learning, so leave it out of `memory.md`. Most runs produce nothing worth recording under Interpretations, Deviations, or Tradeoffs; an empty stage memory is the normal, expected outcome.
