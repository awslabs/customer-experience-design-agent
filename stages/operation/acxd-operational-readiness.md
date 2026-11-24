---
slug: acxd-operational-readiness
number: 4.35
name: Operational Readiness
plugin: acxd
phase: operation
execution: ALWAYS
condition: Runs for all ACXD engagements. For acxd-poc and acxd-platform-poc scopes, only the architecture document (Step 8c) and distribution folder (Step 9b) steps execute — all operationalisation steps are skipped.
lead_agent: acxd-platform-agent
support_agents:
  - aidlc-operations-agent
mode: inline
produces:
  - acxd-architecture-document
  - acxd-deliverables-package
optional_produces:
  # Production-track artefacts — written for acxd-platform / acxd-usecase, SKIPPED for POC scopes
  # (acxd-poc / acxd-platform-poc) per the scope guard below. They are optional, not guaranteed, so a
  # POC run that omits them is correct — do NOT author stub/placeholder files to "satisfy" the list.
  - acxd-operational-runbook
  - acxd-monitoring-config
  - acxd-guardrails-spec
  - acxd-resource-inventory-final
  - acxd-component-library-doc
  - acxd-handover-pack
  - acxd-promotion-runbook
consumes:
  - artifact: acxd-deployment-runbook
    required: true
  - artifact: acxd-deployment-scripts
    required: true
  - artifact: acxd-resource-inventory
    required: false
  - artifact: acxd-component-architecture
    required: false
  - artifact: acxd-analytics-tag-map
    required: false
  - artifact: acxd-platform-config-spec
    required: false
  - artifact: acxd-flow-architecture
    required: false
  - artifact: acxd-sit-results
    required: false
requires_stage:
  - acxd-build-deploy
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
inputs: Deployment runbook, deployment scripts, resource inventory, analytics tag map, platform config spec
outputs: acxd-operational-runbook.md, acxd-monitoring-config.md, acxd-guardrails-spec.md, acxd-resource-inventory-final.md, acxd-component-library-doc.md, acxd-handover-pack.md
---

# Operational Readiness

> **MANDATORY STAGE-OPEN EMISSION — the first thing the user sees in this stage (reading the stage file first is fine).**
> Emit the H1 header line AND the intro line below it VERBATIM — copy both exactly as written here, word for word.
> They are fixed strings, not a description to paraphrase: do NOT reword, summarise, shorten, regenerate, or
> re-emoji either line. The `#` header must render as a real heading the user sees (NOT a code block, NOT a plain
> sentence). Emit exactly these two lines:
>
> # ✅ Operational Readiness
>
> Prepares the built solution for handover — verifies analytics tags, guardrails and monitoring, audits the resource inventory, and assembles the customer-facing deliverables. **Produces:** the consolidated architecture document and deliverables package (plus, for full-scope engagements, monitoring, runbook, cutover plan, and sprint-team onboarding guide).
>
> This is not optional and it does NOT degrade as context grows or the work feels urgent: a stage that opens without
> this hero header is as incomplete as one that ends without its `# ✅ Operational Readiness Complete` message (core
> stage-protocol §2). The opening header and the completion line are a matched pair — same emoji, same standard. Use
> the emoji exactly; never choose or re-check it.

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

Ensures the ACXD solution is production-ready: analytics verified, guardrails configured, monitoring in place,
operational procedures documented, resource inventory audited, and the platform is handed over in a state that
future teams can understand and extend.

## Steps

**Amazon Connect instance wording (all scopes):** in the architecture document and README, describe the Connect
instance as a **prerequisite**: an existing instance in the customer's account, supplied by ARN. Never describe the
solution as creating one.

**POC / Platform-POC scope guard:** For `acxd-poc` and `acxd-platform-poc`, run only **Step 8c (Consolidated
Architecture Document)** and **Step 9b (Package Deliverables)**. All other steps (analytics, guardrails,
monitoring, runbook, inventory, metrics, cutover, promotion, onboarding) are operationalisation / production-track
only and are skipped. Note the architecture doc differs by scope: `acxd-poc` produces the simplified 2–3 page
version (Step 8c POC guidance); `acxd-platform-poc` produces the full architecture document with the
"path to production" section, since its purpose is an easy path to a production platform.

> **POC produces exactly two artefacts — do NOT author stubs for the skipped ones.** For `acxd-poc` /
> `acxd-platform-poc` this stage produces only `acxd-architecture-document` and `acxd-deliverables-package`.
> The seven production-track artefacts (operational-runbook, monitoring-config, guardrails-spec,
> resource-inventory-final, component-library-doc, handover-pack, promotion-runbook) are in
> `optional_produces` precisely because they are skipped here — do **NOT** create placeholder or "deferred"
> stub files for them to "satisfy" the produces list. They are optional; omitting them on a POC run is
> correct. The `required-sections` sensor is **advisory and per-file** — it checks the H2 shape of each file
> that IS written; it does **not** require every `produces`/`optional_produces` entry to exist, so missing
> optional artefacts never fail the gate.

### Step 1: Analytics Tag Verification

Audit every flow to confirm analytics tags fire at the correct points. The analytics vocabulary must cover
these categories at minimum:

| Category | Tag Pattern | Purpose |
|----------|------------|---------|
| **Completion** | `completion{UseCase}{Outcome}` | Successful resolution without human agent |
| **Escalation** | `escalation{UseCase}{Reason}` | Transfer to human agent with reason |
| **Milestone** | `milestone{UseCase}{Step}` | Key progress points (verified, authenticated, paymentInitiated) |
| **Failure** | `failure{UseCase}{Type}` | Technical or business failure (apiTimeout, invalidInput, maxRetries) |
| **Friction** | `friction{UseCase}{Signal}` | Customer experience friction (repeat, rephrase, longSilence, abandon) |

> Analytics tags MUST be camelCase with a lowercase category prefix — ACXD silently strips colons,
> hyphens, and underscores. Match the convention from Flow Design (Step 6). `[CONSOLE-VERIFIED]`

Verification procedure:
1. Cross-reference the analytics tag map (from `acxd-flow-build`) against deployed flows
2. Confirm each tag fires at the intended node in each flow
3. Confirm each flow carries its own analytics tags, named in the use-case namespace (e.g. `milestoneQuoteAuthVerified`)
4. Confirm no orphan tags (tags defined but unreachable) or missing tags (reachable paths without tags)

### Step 2: Guardrails Configuration & Testing

Configure ACXD guardrails for every Generative Journey and Generative Text node:

**Content guardrails:**
- Topic restrictions (block off-topic conversations, competitor discussions, medical/legal advice)
- Profanity and abuse handling (redirect to agent, polite decline, log incident)
- PII handling rules (never echo back full account numbers, SSNs, credit card numbers)
- Hallucination mitigation (constrain responses to available knowledge base content)

**Operational guardrails:**
- Maximum conversation turns before escalation
- Maximum silence duration before prompt or escalation
- Maximum retry attempts for failed data requests
- Session timeout configuration

**Test each guardrail:**
- Positive test: confirm allowed behaviour passes through
- Negative test: confirm blocked behaviour is caught and handled gracefully
- Edge case: test boundary conditions (near-profanity, partial PII, ambiguous topics)

Produce `acxd-guardrails-spec.md` documenting every guardrail, its configuration, and test results.

### Step 3: Monitoring Setup

Configure monitoring across three layers. ACXD has its own built-in analytics (not CloudWatch) — Layer 1 is
ACXD-native; Layers 2 and 3 are AWS-native services.

**Layer 1: ACXD Built-in Analytics (ACXD-native, not CloudWatch)**
- ACXD analytics dashboard (in the workspace UI) — node-traversal rates by analytics tag [DOC]
- Conversation volumes, completion rates, escalation rates, friction/drop-off rates — all driven by analytics tags
- Build and deployment status — last build time, last deploy time, current application status
- Knowledge base health — last sync time, document count, failed ingestions
- `[GA-GAP]` No native CloudWatch export for ACXD flow-level metrics — ACXD analytics live in the ACXD UI only
- `[GA-GAP]` No native alerting — cannot set "email me when escalation rate > X%" from ACXD alone
- Verify in the console whether analytics tags defined only in imported JSON auto-register as dashboard
  dimensions (may need to be created/selected once in the console)

**Layer 2: Amazon Connect & Contact Lens (AWS-native)**
- Connect AI agent CloudWatch Logs — conversation events, triggers, intents, recommendations (requires IAM
  setup per the Connect admin guide) [DOC]
- Contact Lens analytics — sentiment trends, talk-time ratios, caller interruptions, call summaries
  (sentiment and call summaries are Contact Lens, NOT native ACXD) [DOC]
- Queue metrics — service level, wait times, abandon rates
- Agent performance — handle time, after-contact work, occupancy
- Real-time metrics dashboard for operations team

**Layer 3: Backend Service Monitoring (CloudWatch — deployed with CDK stack)**
- Lambda invocation metrics — duration, errors, throttles, cold starts
- API Gateway metrics — latency (p50/p95/p99), 4xx/5xx rates
- DynamoDB metrics — read/write capacity, throttled requests, latency
- Custom business metrics — data request success rates, external API response times
- CloudWatch alarms for critical thresholds (deployed as CDK constructs alongside backend resources)
- CloudWatch dashboard for backend health (JSON template in CDK stack)

**Alerting thresholds:**
| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Escalation rate | >30% over 1hr | >50% over 30min | Investigate flow logic |
| API error rate | >5% over 15min | >15% over 5min | Check backend health |
| Build failure | Any | N/A | Review build logs |
| Containment rate drop | >10% decline day-over-day | >25% decline | Investigate prompt/flow changes |

Produce `acxd-monitoring-config.md` with dashboard definitions, alert configurations, and escalation procedures.

### Step 4: Operational Runbook

Produce `acxd-operational-runbook.md` covering day-to-day and incident operations:

**Routine operations:**
- How to trigger a rebuild after flow changes in the ACXD canvas
- How to update a knowledge base (add/remove/update documents)
- How to manage Live Sync sessions (if applicable)
- Token rotation procedure `[GA-GAP]` — step-by-step guide for rotating API tokens across environments
- How to export flow JSON for version control backup
- How to import flow JSON to restore a previous version

**Incident response:**
- Build failure triage — common causes (resource conflict, invalid flow graph, SDK version mismatch)
- Deployment failure triage — common causes (application locked, previous build still in progress)
- Backend service degradation — fallback behaviour, circuit breaker patterns
- Escalation surge — emergency routing changes, capacity management
- Complete outage procedure — fallback to static IVR or direct-to-agent routing

**Maintenance windows:**
- Scheduled rebuild/deploy windows for non-urgent changes
- Knowledge base refresh schedule
- Token rotation schedule (recommend every 90 days)
- Quarterly guardrail review and tuning

**Connect post-deployment configuration (manual steps):**

After the CDK Connect integration stack deploys, the following resources must be configured manually
in the Amazon Connect console. These are customer-specific resources that cannot be automated without
knowledge of the customer's Connect instance configuration, phone number inventory, and staffing model.

| Resource | Action | Where |
|----------|--------|-------|
| Phone number | Claim a phone number and assign to the ACXD contact flow | Connect console → Phone numbers |
| Hours of operation | Set business hours for the escalation queue | Connect console → Hours of operation |
| Agent users | Create agent users and assign to the ACXD routing profile | Connect console → Users |
| Quick connects | (Optional) Create quick connects for transfer between queues | Connect console → Quick connects |
| Security profiles | Assign agents appropriate security profiles | Connect console → Security profiles |
| Chat widget | (If chat channel) Configure and embed the Connect chat widget | Connect console → Chat |

### Step 5: Resource Inventory Audit

Perform a comprehensive audit of every ACXD resource in the deployed solution:

For each resource (secret, data request, slot type, knowledge base, flow, application):
1. Verify the resource exists and is in the expected state
2. Verify the `description` field is populated with the truncated (≤200 char) version (`aiDescription` may be longer, up to 1000)
3. Verify the full verbose description exists on every resource
4. Verify naming conventions are followed (every flow and resource in the use-case namespace)
5. Verify ownership is documented (which team, which use case)

Produce `acxd-resource-inventory-final.md` — the authoritative, audited catalogue of every ACXD resource.
This is the single source of truth for what exists on the platform.

### Step 6: Component Library Documentation (`acxd-enhancement` only)

Only when the engagement builds on an existing component library (`acxd-enhancement`), produce `acxd-component-library-doc.md`:

For each reusable component flow:
| Field | Content |
|-------|---------|
| **Component name** | `shared-{name}` |
| **What it does** | Single-paragraph description |
| **Interface contract** | Context variables in / context variables out |
| **Consumers** | Which parent flows call this component via Redirect |
| **Owner** | Team responsible for changes |
| **Test approach** | How to test this component in isolation |
| **Change procedure** | How to modify safely (rebuild required, consumer regression check) |

Include a visual component map showing parent → component call relationships.

### Step 7: Target Metrics & Success Criteria

Define measurable success criteria tied to analytics tags:

| Metric | Baseline (pre-automation) | Target (30 days) | Target (90 days) | Analytics Tag Source |
|--------|--------------------------|-------------------|-------------------|---------------------|
| Containment rate | {from CX discovery} | +15% | +25% | `uc-*-completed` vs total |
| Average handle time | {from CX discovery} | -20% | -35% | Connect Contact Lens |
| First contact resolution | {from CX discovery} | +10% | +15% | `uc-*-completed` + no callback |
| CSAT/NPS | {from CX discovery} | Maintain | +5 pts | Post-contact survey |
| Cost per contact | {from CX discovery} | -15% | -30% | Automated vs agent contact ratio |

### Step 8: Cutover & Go-Live Plan

Design the phased rollout:

**Phase 1: Shadow mode (1 week)**
- Route 0% of live traffic — internal team testing only
- Validate end-to-end in production environment
- Confirm analytics tags, monitoring, and alerting are operational

**Phase 2: Canary (1–2 weeks)**
- Route 5–10% of applicable traffic through ACXD automation
- Monitor escalation rates, completion rates, CSAT closely
- Agent team briefed on new automated flows and escalation patterns
- Rollback trigger: escalation rate >50% or CSAT decline >10%

**Phase 3: Gradual ramp (2–4 weeks)**
- Increase to 25% → 50% → 75% → 100% over successive weeks
- Each increase gated on metrics from the previous phase
- Rollback at any stage returns to previous percentage

**Fallback routing:**
- Configure a Connect contact flow with a percentage-based routing split
- Automated path: route to ACXD application
- Fallback path: route directly to agent queue (existing flow)
- Emergency override: 100% to agent queue via a single parameter change

**Agent preparation:**
- Brief agents on what the automation handles and when they will receive escalations
- Provide agents with escalation context (what the customer has already done, verified, attempted)
- Update agent desktop/CRM to display ACXD conversation context on transfer

### Step 8b: Post-Go-Live Measurement Framework

Define HOW metrics are measured and reported after go-live. Without this, targets are set but nobody tracks
them. Produce a measurement cadence section in `acxd-operational-runbook.md`:

**Measurement cadence:**

| Cadence | Activity | Owner | Audience |
|---------|----------|-------|----------|
| Daily (first 2 weeks) | Check ACXD analytics dashboard — completion/escalation rates, friction events | Operations lead | Operations team |
| Daily (first 2 weeks) | Check CloudWatch backend dashboard — error rates, latency, alarm status | Backend developer | Operations team |
| Weekly (ongoing) | Metrics report: containment rate, AHT, escalation rate, error rate vs targets | Platform lead | Stakeholders + operations |
| Monthly | Business review: ROI tracking (cost per contact, agent time saved), CSAT trend | Engagement lead | Executive sponsor |
| Quarterly | Platform health review: guardrails tuning, KB refresh, prompt optimisation, component reuse audit | Platform team | Product owner |

**Weekly metrics report template:**
Include in `acxd-operational-runbook.md`:
- Containment rate: {actual}% vs {target}% (source: ACXD analytics — `completion…` tags)
- Escalation rate: {actual}% vs {target}% (source: ACXD analytics — `escalation…` tags)
- Error rate: {actual}% vs {target}% (source: ACXD analytics — `failure…` tags)
- AHT: {actual}s vs {target}s (source: Connect real-time metrics)
- Backend health: {error count}, {p95 latency}ms (source: CloudWatch dashboard)
- Incidents this week: {count}, {summary}
- Action items: {list}

**Where to get each metric:**
- ACXD metrics (containment, escalation, error, friction) → ACXD workspace UI analytics dashboard
- Connect metrics (AHT, queue times, abandon rate) → Connect admin dashboard + CloudWatch
- Contact Lens metrics (sentiment, call summaries) → Contact Lens dashboard
- Backend metrics (Lambda errors, API latency, DDB throttles) → CloudWatch dashboard deployed with CDK stack
- CSAT/NPS → external survey tool (post-contact survey or follow-up)

### Step 8c: Consolidated Architecture Document

**This step runs for ALL scopes including `acxd-poc`.** Even a POC benefits from an architecture diagram
that stakeholders can review and use to plan the production build.

Produce `acxd-architecture-document.md` — a single, comprehensive architecture document that consolidates
the key design decisions, diagrams, and system specifications from all upstream stages into one deliverable.
This is the document a stakeholder, architect, or new team member reads to understand the entire solution.

**Document structure:**

1. **Executive Summary** — one-page overview: what was built, for whom, which engagement pattern, key metrics

2. **Solution Architecture Overview**
   - High-level system diagram (Mermaid) showing: Amazon Connect → ACXD → Backend Services → External Systems
   - Channel architecture (voice, chat, Live Sync)
   - Environment strategy (dev / staging / prod)

3. **Flow Architecture** (from `acxd-flow-architecture.md`)
   - Flow topology diagram per use case (Mermaid — carried from Flow Design stage)
   - Deterministic vs agentic classification per flow segment
   - Flow call graph (which flows redirect to which, with each separate flow's boundary reason (the flow test it passes))
   - Story Trace and SIT results — ABSORB IN FULL the Story Trace table and the Architecture SIT section from
     `acxd-flow-architecture.md`, and the Build SIT results table and verdict line from `acxd-sit-results.md` (Flow Authoring): one row per approved user
     story showing its path, where the outcome is delivered, and PASS/FAIL with any open fix. This is the
     story-by-story evidence that the design delivers the agreed scope.

4. **Data Architecture** (from `acxd-backend-architecture.md` and `acxd-data-model.md`)
   - Backend stack diagram (Mermaid — carried from Backend Design stage)
   - API specifications — ABSORB IN FULL from `acxd-api-specifications.md`: every operation (path + method),
     its request parameters, its response fields with types, and the sample/synthetic values. Reproduce the
     actual contract, not a one-line summary — a reader must be able to understand and call each API from this
     document alone, without opening `acxd-api-specifications.md`.
   - Data persistence model (DynamoDB tables, access patterns)
   - External integration map (from `acxd-integration-inventory.md`)

5. **Variable & State Architecture** (from `acxd-variable-map.md`)
   - Variable lifecycle across flows (slot → context promotion, data request fields)
   - Flow hand-off contracts — for each Redirect, the context variables the target flow reads (from the Flow
     Responsibility Contract in `acxd-flow-architecture.md`). Reproduce the contracts, not a mention. (`acxd-enhancement`
     only: also absorb `acxd-component-architecture.md` and `acxd-component-interface-contracts.md`.)

6. **Security Architecture** (from `acxd-security-plan.md`)
   - Authentication model (ACXD API keys, IAM roles, external API credentials)
   - Data classification and handling (PII, PCI, sensitive slots)
   - Compliance controls (call recording consent, redaction, audit trail)

7. **Observability Architecture** (from `acxd-monitoring-config.md` and `acxd-metrics-mapping.md`)
   - Three-layer monitoring model diagram
   - Analytics tag → KPI → ROI mapping table
   - Alerting thresholds and escalation procedures

8. **Deployment Architecture** (from `acxd-deployment-runbook.md` and `acxd-cicd-pipeline-config.md`)
   - Split pipeline diagram (Track 1 CDK + Track 2 ACXD SDK)
   - Multi-environment promotion flow
   - Rollback procedures

9. **Resource Inventory** (from `acxd-resource-inventory-final.md`)
   - Complete ACXD resource catalogue with descriptions and ownership

10. **Decisions Log** — key architecture decisions with rationale:
    - Deterministic vs agentic per use case segment
    - Platform vs use-case architecture choice
    - Component identification and promotion decisions
    - Backend integration pattern (Pattern A vs B) per data request
    - IaC approach (CDK stack per use case)

**Absorb the key specifications IN FULL — the architecture document must be self-sufficient.** The space/record
holds detailed design artifacts (`acxd-api-specifications.md`, `acxd-data-model.md`, `acxd-integration-inventory.md`,
`acxd-security-plan.md`, `acxd-metrics-mapping.md`) that do NOT travel
into the distribution folder. So their load-bearing substance MUST be absorbed into the matching section of this
document, not merely summarised or cited by filename — a stakeholder or delivery team receives ONLY the
distribution folder (not the `aidlc/spaces` record), and this document is where that design detail lives for
them. Rule of thumb: if a fact only exists in a space artifact and a reader of the distribution folder would need
it to understand, call, operate, or extend the solution, it belongs in full in the relevant section here. Do not
leave the reader needing a file that was never handed over.

**Diagram format:** All diagrams use Mermaid syntax for version-control-friendly, text-based rendering.
Carry diagrams from upstream stage artifacts — do not recreate. Add a top-level system context diagram
that was not produced in any individual stage (it spans the full solution).

**POC-specific guidance:** For `acxd-poc` scope, produce a simplified architecture document:

> Note: this simplification applies to `acxd-poc` only. `acxd-platform-poc` produces the **full** architecture
> document (all sections + "path to production"), matching its purpose as an easy on-ramp to a production platform.
- Include the solution overview and flow architecture (Mermaid diagrams)
- Show mocked backend APIs as **block objects** in the system diagram (labelled `[MOCK]`) — include the
  API contract (request/response shapes) but note these are synthetic, not connected to real systems
- Include the "path to production" section — what would change when moving from POC to a real deployment
  (real APIs, multi-environment, CI/CD pipeline, monitoring)
- Keep it concise — a POC architecture doc is 2-3 pages, not the 10-section production document

**This document is the primary handover artifact** — it is what the customer's architecture team,
operations team, and any future sprint teams use as the authoritative reference for what was built and why.

### Step 8d: Environment Promotion Runbook

**Scope guard:** Skip this step for `acxd-poc` — POC engagements use a single workspace with no
environment promotion. This step applies to `acxd-platform` and `acxd-usecase` scopes only.

Produce `acxd-promotion-runbook.md` — the definitive guide for how design changes made in dev flow
automatically through staging and into production via the CI/CD pipeline.

**Core principle:** The AI-DLC harness governs design changes in dev. Git carries the change to staging and
prod. The CI/CD pipeline applies it. The harness does NOT run in staging or prod for promotion — it is a
design tool, not a deployment tool.

**Multi-environment architecture:** each environment has its own `.env` (workspace name, token, backend URLs/keys). Promotion runs the deploy engine with that environment's `.env` —
the harness runs in dev; Git/CI-CD drives promotion.


| Environment | ACXD Workspace | Git Branch | Deploy Trigger | Approval |
|-------------|---------------|------------|----------------|----------|
| Development | `{project}-dev` (uuid) | `dev` | On merge to `dev` | Automatic — harness approval gate was the design review |
| Staging | `{project}-staging` (uuid) | `staging` | On merge `dev → staging` | Automatic — integration test gate |
| Production | `{project}-prod` (uuid) | `prod` / `main` | On merge `staging → prod` | **Manual approval required** |

**What gets promoted (the portable artifacts):**

The harness produces version-controlled artifacts during design and build stages. These are the artifacts
that flow through the pipeline:

| Artifact Type | Source Stage | What It Contains |
|---------------|------------|------------------|
| `.flow.json` files | Flow Build (3.55) | Complete flow graphs with nodes, edges, prompts, variables, analytics tags |
| SDK resource scripts | Resource Creation (3.45) | Idempotent TypeScript scripts for secrets, data requests, slot types, KBs, flow scaffolds, application |
| CDK stacks (`backend/mock-integration/` or `backend/adapter-integration/`, + `backend/connect/`) | Backend Build (3.65) | `mock-integration/`: API Gateway + one Lambda serving synthetic data (copied from the fixed tool). `adapter-integration/`: API Gateway + adapter Lambda(s) → real system of record (only if a live API needs translation). `connect/`: Amazon Connect contact flow (Agentic CX block, from `mainflow.json`), escalation queue, routing profile — no Lex bot |
| Prompt specifications | Flow Design (2.75) | Generative Journey prompt text (ROLE/CONTEXT/ACTIONS/STYLE/COMPLIANCE) — embedded in `.flow.json` |
| Per-environment `.env` | Platform Config (2.65) | Workspace and application names, API token, backend URLs/keys |

**Promotion pipeline — step by step:**

```
CHANGE IN DEV (harness-governed)
│
│  1. Run acxd-enhancement scope (or acxd-usecase for new features)
│  2. Harness walks through relevant stages with approval gates
│  3. Agent produces updated artifacts (.flow.json, SDK scripts, CDK stack)
│  4. User approves at each gate
│  5. Build + deploy to dev workspace → test in ACXD widget
│  6. Commit updated artifacts to `dev` branch
│
├── PROMOTE TO STAGING ─────────────────────────────────────
│
│  7. Merge `dev → staging` (PR or direct merge)
│  8. CI/CD pipeline triggers automatically:
│     Track 1: CDK deploy → staging backend stack
│     Track 2: SDK resource sync → ACXD build → ACXD deploy (staging workspace)
│  9. Integration tests run automatically
│  10. Staging verified ✓
│
├── PROMOTE TO PRODUCTION ──────────────────────────────────
│
│  11. Merge `staging → prod` (requires manual approval / PR review)
│  12. CI/CD pipeline triggers:
│      Track 1: CDK deploy → prod backend stack
│      Track 2: SDK resource sync → ACXD build → ACXD deploy (prod workspace)
│  13. Post-deploy smoke test (health endpoint + widget test)
│  14. Production verified ✓
│
└── MONITORING ─────────────────────────────────────────────
    15. Monitor ACXD analytics dashboard for 24h
    16. Monitor CloudWatch alarms for backend health
    17. If issues detected → rollback (see rollback procedure)
```

**What differs between environments (infrastructure config only):**

| Parameter | Dev | Staging | Prod |
|-----------|-----|---------|------|
| ACXD workspace ID | `{project}-dev` (uuid) | `{project}-staging` (uuid) | `{project}-prod` (uuid) |
| ACXD API token | `sm://acxd/{project}/dev/token` | `sm://acxd/{project}/staging/token` | `sm://acxd/{project}/prod/token` |
| Backend stack name | `{project}-dev` | `{project}-staging` | `{project}-prod` |
| CDK context: environment | `dev` | `staging` | `prod` |
| DynamoDB removal policy | DESTROY | DESTROY | RETAIN |
| CloudWatch log retention | 1 week | 1 month | 1 month |

These are environment parameters — NOT design decisions. They live in each environment's `.env` and CDK context, not in the harness-produced artifacts.

**What does NOT differ between environments (design decisions):**
- Flow graphs (`.flow.json`) — identical across all environments
- Generative Journey prompts — identical (embedded in flow JSON)
- LLM model selection — identical (set during Platform Config, not per-environment)
- Guardrail rules — identical
- Analytics tag vocabulary — identical
- Flow hand-off contracts — identical

These are design decisions governed by the harness. To change them, run the `acxd-enhancement` scope in dev
and promote the change through the pipeline.


**Mock-to-live API switchover:**

When the customer's real backend APIs are ready, switch from mock to live:

1. Move from `backend/mock-integration/` to the live path: either (a) deploy `backend/adapter-integration/`
   (real handlers calling the system of record) if the live API needs translation, or (b) go **direct** — no
   backend folder at all — if the live API fits the ACXD contract. The `backend/connect/` stack is unaffected
   — do not redeploy it.
2. Update the API's `<API>_URL` and credential in `.env` to the live endpoint and its credential (if the live API's auth differs, update the OpenAPI file's `securitySchemes` and re-run the API wiring tool), then re-run Stage 2
3. Rebuild the ACXD application (flows reference the same secret names — no flow changes needed)
4. Deploy the ACXD application
5. Test each data request: verify real API responses match the expected contract
6. Replace synthetic KB content with real product/service documentation
7. Retire `backend/mock-integration/` once the live path is verified (delete its stack, or archive the folder) —
   the synthetic data no longer serves any request.

**What changes:** Backend endpoints, credentials (ACXD secrets), and KB content.
**What does NOT change:** ACXD flows, prompts, analytics tags, and the
`backend/connect/` integration stack. The flows were designed against the API contract, not against mock vs real implementations.

**Hotfix procedure (emergency only):**

If production has a critical issue requiring immediate fix:
1. **Preferred:** Fast-track through dev — run `acxd-enhancement` → make the fix → test → merge directly
   to prod (skip staging). The harness still governs the change.
2. **Emergency only:** Edit the flow directly in the prod ACXD canvas → rebuild → deploy. **Document the
   hotfix immediately** and backport to dev within 24 hours so environments don't diverge.

**Audit trail for promoted changes:**
- **Design decisions:** AI-DLC intent records in dev (stage approvals, agent artifacts, user feedback)
- **Code changes:** Git commit history (who merged, what changed, PR review)
- **Deployments:** CI/CD pipeline logs (build/deploy timestamps, success/failure, artifact versions)
- **Runtime behaviour:** ACXD analytics dashboard + CloudWatch alarms

### Step 9: Sprint Team Onboarding Guide (Platform Engagements)

For `acxd-platform` scope, produce a guide for future sprint teams:

**What exists:**
- Platform architecture overview (workspace, application, environments)
- Component library catalogue (what to reuse, what NOT to duplicate)
- Naming conventions and description field discipline
- Resource inventory manifest location

**How to build a new use case:**
- Start from the `acxd-usecase` or `acxd-enhancement` scope
- Brownfield discovery: export existing flows, inventory resources, identify reuse
- Design new flows using existing components where possible
- Follow component interface contracts for context variable handoff
- Register all new resources in the resource inventory manifest

**How to deploy:**
- CI/CD pipeline usage (which branch, which triggers)
- Build queue etiquette (coordinate with other teams, avoid concurrent builds)
- Post-deploy verification checklist

**How to get help:**
- Platform team contacts
- Operational runbook location
- Escalation path for platform issues vs use-case issues

Compile all outputs into `acxd-handover-pack.md` — the single document a new team member reads on day one.

### Step 9b: Package Deliverables

**This step runs for ALL scopes including `acxd-poc`.**

Create a distribution folder at the project root with a **minute-granularity** timestamped name. **The
snapshot root is the ONE working directory** — every runbook command starts from here
(`cd backend/mock-integration/cdk`, `cd acxd-sdk`, `cd backend/connect/cdk`), NOT from a nested `acxd-app/` and
NOT from any root-level working copy outside the snapshot.

> **`<projectName>` = the canonical camelCase value captured in CX Discovery (Step 0-pre).** Reuse it verbatim
> for the dist folder name — the same value already named the scoping snapshot, the mock APIs stack, and the
> Connect stack. Never re-derive it.

```
<projectName>-dist-<YYYYMMDD-HHMM>/          ← SNAPSHOT ROOT — runbook commands start here
├── .env                       ← the ONE environment file for ALL stages (created empty; each stage fills its own keys)
├── .env.example               ← reference copy of the keys (created beside .env; never copied by the operator)
├── .gitignore                 ← protects the filled-in .env from being committed (keeps .env.example tracked)
├── acxd-sdk/                  ← ACXD SDK deployment (engine-driven; deploy THIS folder — self-contained)
│   ├── acxd-deploy-engine/    (the shipped, tested deterministic engine — copied from tools/acxd-deploy-engine/)
│   ├── resources/             (declarative JSON: context-vars, slot-types, secrets, analytics-tags, data-requests, knowledge-bases; kb/<kbName>/ = KB content)
│   ├── flows/                 (*.flow.json)
│   ├── acxd-deploy.config.json (manifest: resource + flow paths; provision only — no build/deploy knobs)
│   └── README.md              (deploy: npm install → ACXD_ENV_FILE=../../.env ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy)
├── backend/                   ← backend deployables (sibling CDK apps; include ONLY the ones this engagement needs)
│   ├── mock-integration/      ← the API serving ACXD data requests with SYNTHETIC data (no live API yet)
│   │   │                        copied from the fixed tool {{HARNESS_DIR}}/tools/acxd-mock-backend/ — do NOT hand-author
│   │   ├── handler.py         (fixed core: /{operation} routing at the stage root + plain-lookup + ops override)
│   │   ├── validate.py        (fixed: enumerate data/ + ops/, print "N ops: X plain, Y computed")
│   │   ├── apis/<apiId>/      (one folder per generated OpenAPI file)
│   │   │   ├── data/          (agent-authored: <operation>.json response patterns — the synthetic data)
│   │   │   └── ops/           (agent-authored, optional: <operation>.py for computed operations)
│   │   ├── mock.config.json   (optional tuning: stageName / memoryMb / timeoutSeconds)
│   │   ├── cdk/               (acxd-<projectName>-<env>-mock-apis: one nested stack per API, each API Gateway + Lambda)
│   │   └── README.md
│   ├── adapter-integration/   ← ONLY if a live API needs translation (auth/flatten/VPC); else omit
│   │   ├── cdk/               (AcxdAdapterStack: API Gateway + adapter Lambda(s) → real system of record)
│   │   ├── functions/         (adapter Lambda handlers, one dir per operation)
│   │   └── README.md
│   └── connect/               ← Amazon Connect integration flow (skip only for minimal acxd-poc)
│       ├── cdk/               (AcxdConnectStack: contact flow via Agentic CX block from mainflow.json, escalation queue, routing profile, into your existing instance)
│       └── README.md
├── customer-context/          ← the OpenAPI files (one per API); the wiring checks below read them
├── architecture/
│   ├── acxd-architecture-document.md
│   └── acxd-architecture-document.docx   ← customer-facing Word (generated automatically in Step 9c)
├── deployment/                        ← ONE runbook only (mirrors architecture/: one .md + its .docx)
│   ├── acxd-deployment-runbook.md      (primary source; all paths relative to the SNAPSHOT ROOT)
│   └── consolidated-runbook.docx       ← customer-facing Word (runbook+scripts+rollback+promotion merged; Step 9c)
├── design/
│   ├── consolidated-scoping.docx       ← customer-facing Word (from the scoping milestone; the third of the set)
│   ├── acxd-cx-discovery-report.md
│   ├── acxd-flow-architecture.md
│   ├── acxd-variable-map.md
│   ├── acxd-prompt-specs.md
│   ├── acxd-flow-authoring-guide.md    ← how the flows were authored (build-method reference, NOT a deploy doc)
│   ├── acxd-sit-results.md             ← systems integration test report (verdict, story table, live test list)
│   └── acxd-handover-pack.md           ← full-scope only (acxd-usecase / acxd-platform); omit for POC scopes
└── README.md                  (index of what's in this folder + next steps)
```

> The backend deployable is named for WHAT it is: `backend/mock-integration/` (synthetic data, copied from
> the fixed tool) or `backend/adapter-integration/` (adapter to a real system) — or neither, when the live API
> is called direct. `backend/connect/` is the Amazon Connect integration flow. The deployables —
> `backend/mock-integration/` (or `adapter-integration/`), `acxd-sdk/`, and `backend/connect/` — are separate sibling trees deployed in that
> order (Connect LAST — its Agentic CX block references the ACXD app the SDK stage creates); never nest them,
> because each is a distinct deploy step.

**The distribution folder is BOTH a complete snapshot AND the deployable artifact.** It must contain
everything needed to deploy from scratch, with no reference to files outside the snapshot.

1. **Create the ONE environment file at the snapshot root.** Write BOTH `./.env` and `./.env.example` at the
   distribution root as ready-to-fill templates. Take the engine's own `.env.example`
   (`acxd-sdk/acxd-deploy-engine/.env.example`) as the **ONLY** source and **copy its keys AND their per-key
   comments across VERBATIM**. It already contains every key ALL deploy stages read (Prerequisites: Connect
   instance ARN + API key; Stage 1 backend, Stage 2 ACXD engine, Stage 3 Connect); there is nothing to add. Do NOT merge in, or
   prefer, any other `.env.example` from the intent record (an earlier stage's draft), and never append keys of
   your own: if a needed key seems missing, that is a harness defect, so say so at the gate rather than inventing
   it. Copy it **in the template's order and grouping** — preserve the full guidance on each key (e.g. the region list, the ID-vs-NAME path blocks). Do NOT condense a
   key's comment to a single terse line or drop its example/constraint text — that guidance is load-bearing and
   its loss causes deploy mistakes. **Value population differs between the two files:** the `.env.example`
   (tracked template) has ALL values blank. The working `.env` is blank for operator-supplied secrets/ids the
   agent cannot know (API URLs and credentials, `ACXD_API_TOKEN`, `CONNECT_INSTANCE_ARN`,
   `ACXD_DEPLOYMENT_KEY`, and the `*_ID` fields — the engine writes those back on run; never guess or pre-fill
   `CONNECT_INSTANCE_ARN` from discovery or an answer key),
   BUT **pre-fill the values the agent already knows, so the PoC runs without hand-editing:** set `AWS_REGION`
   to the region chosen in discovery / platform-config, set `ACXD_PROJECT_NAME` to the canonical `projectName`,
   keep the template default `ACXD_ENVIRONMENT=dev`, set `ACXD_APP_DEFAULT_LANGUAGE` to the voice/chat
   locale chosen in Platform Config (e.g. `en-AU`; the template default `en-US` is only a placeholder), and seed
   `ACXD_WORKSPACE_NAME` + `ACXD_APPLICATION_NAME` with **`<projectName>Workspace` and `<projectName>App`**
   (`projectName` from CX Discovery Step 0-pre), the same defaults as `acxd-deploy.config.json`; `.env` wins when
   set, so a different value here would rename them away from every approved artifact. The operator MAY change
   either to a display name before deploy.
   The operator can edit any pre-filled value before deploy.
   **Then fill the API block, by tool only.** Both files keep the template's empty `# >>> acxd-apis` … `# <<< acxd-apis`
   block after the copy. Fill it in each file with
   `{{HARNESS_DIR}}/tools/acxd-deploy-engine/node_modules/.bin/tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/openapi-wiring-cli.ts --apis customer-context --env-example <file>`
   (it writes one URL and credential key per API, with fixed comments, and keeps values already entered; the installed
   engine has its packages, see step 4), then copy the keys of APIs this solution deploys into `./.env` only:
   `... --generate-keys ./.env` (it fills only blank keys of generated APIs). Never edit inside the markers by hand.
   The operator never copies or creates an env file — both already exist. All three deploy stages read and
   write this single root `./.env` (the engine is pointed at it via `ACXD_ENV_FILE=../../.env`). Do NOT place
   a second `.env`/`.env.example` inside `acxd-sdk/acxd-deploy-engine/`.
   **Also write a `./.gitignore` at the snapshot root** so the operator's filled-in `.env` (API token, API
   keys, Connect ARNs) can never be committed. It MUST ignore the real env file but KEEP the template:
   ```gitignore
   .env
   .env.*
   !.env.example
   node_modules/
   cdk.out/
   dist/
   __pycache__/
   .DS_Store
   ```
   (This mirrors the plugin's own `.gitignore`. The runbook already tells the operator never to commit the
   real `.env`; this makes that safe by default.)
2. **Separate the deployables.** Backend data source → `backend/mock-integration/` (or `adapter-integration/`,
   or none if all-direct); ACXD SDK → `acxd-sdk/`; Connect flow → `backend/connect/`. Never nest them — they
   deploy independently, in this order (backend data source → ACXD SDK → Connect flow). Connect is LAST because its Agentic CX block references the
   ACXD Workspace/Application/Deployment key the SDK deploy creates.
3. **Copy the deploy engine into `acxd-sdk/acxd-deploy-engine/`.** Recursively copy the shipped engine from
   `{{HARNESS_DIR}}/tools/acxd-deploy-engine/` into `acxd-sdk/acxd-deploy-engine/` — **source only** (it has no
   `node_modules`; the operator runs `npm install` at deploy time). Keep the engine's `reference/` folder. This
   is what makes the runbook's `acxd-sdk/acxd-deploy-engine/` path real rather than a reference to a file
   outside the snapshot. The `acxd-deploy.config.json` sits at `acxd-sdk/` (beside, not inside, the engine),
   and `resources/` + `flows/` sit under `acxd-sdk/` as the config's relative paths expect. Copy `resources/` WHOLE,
   including `resources/kb/<kbName>/` (the knowledge-base content the engine loads). Copy `flows/` WHOLE,
   including `flows/specs/` (the FlowSpec authoring source) and `flows/flowset.json` (the engine's pre-flight reads
   it for the cross-flow checks).
4. **Copy the docs** into `architecture/`, `deployment/`, `design/` as shown.
   **Run these checks with the installed engine** (`{{HARNESS_DIR}}/tools/acxd-deploy-engine/`, which has its packages;
   run `npm ci` there once if `node_modules` is missing), pointed at the snapshot's files. Never install packages
   into, or link them into, the snapshot copy.
   **Then check every secret's env var is listed in `.env.example` (blocking).** From the snapshot root run:
   `{{HARNESS_DIR}}/tools/acxd-deploy-engine/node_modules/.bin/tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/validate-config-cli.ts acxd-sdk/acxd-deploy.config.json --env-example ./.env.example`.
   It must print `✓ secrets signposted`. If it lists missing vars, re-run the API wiring tool (`--resources` and
   `--env-example`), never add keys by hand, and re-run. **Then check the API block has not drifted (blocking):**
   `{{HARNESS_DIR}}/tools/acxd-deploy-engine/node_modules/.bin/tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/openapi-wiring-cli.ts --apis customer-context --check ./.env.example --template acxd-sdk/acxd-deploy-engine/.env.example`
   must print `OK .env API block matches`. On drift, re-copy the template and re-run `--env-example`. If `tsx` cannot run here, log an `environment-gap` and tell the user to run it
   before deploy.
5. **The deployment runbook MUST use paths relative to the SNAPSHOT ROOT** — e.g. `cd backend/mock-integration/cdk`,
   then `cd acxd-sdk`, then `cd backend/connect/cdk`. Never reference a root-level working copy, the working
   project folder, or a nested `acxd-app/`.
5b. **Leave no build or run cruft in the snapshot.** After copying, delete any `__pycache__/`, `*.pyc`,
   `node_modules/`, `cdk.out/`, `package-lock.json` and `.DS_Store` under the snapshot (a local mock smoke test or
   validation run creates `__pycache__`):
   `find <snapshot> \( -name __pycache__ -o -name node_modules -o -name cdk.out \) -prune -exec rm -rf {} + ; find <snapshot> \( -name '*.pyc' -o -name package-lock.json -o -name .DS_Store \) -delete`
6. **Timestamp to the minute** (`<YYYYMMDD-HHMM>`) so re-packaging after any change produces a NEW immutable
   snapshot rather than colliding with an earlier same-day one.
7. Generate the top-level `README.md` (index + next steps) AND a short `README.md` in each of `acxd-sdk/`,
   `backend/mock-integration/` (or `adapter-integration/`), and `backend/connect/` (self-contained deploy instructions for that folder).
8. **Call out the customer-facing Word artefact set in the top-level `README.md`.** When the Word documents
   have been generated (Step 9c), the README MUST list the **three-document set** as the customer-facing
   deliverables, with clickable relative-path links, and note they share one consistent style:
   - `design/consolidated-scoping.docx` — Consolidated Scoping Document (the approved scope)
   - `architecture/acxd-architecture-document.docx` — ACXD Architecture Document (what was built and why)
   - `deployment/consolidated-runbook.docx` — Consolidated Deployment Runbook (how to deploy + path to production)
   The Word versions are generated automatically; if a source markdown genuinely wasn't produced (e.g. a POC
   that didn't generate that document) or the converter couldn't run, list the `.md` instead — never list a
   file that does not exist.

**For `acxd-poc` scope:** only copy files that were actually produced (architecture doc, flow JSON, SDK
scripts, integration API). `acxd-poc` is ACXD-only — there is no `backend/connect/`. Do not reference files
that don't exist in POC scope (e.g. operational runbook, component library).

**For `acxd-usecase` and `acxd-platform` scopes:** copy the full set including operational runbook,
monitoring config and promotion runbook (plus the component library for `acxd-enhancement`).

**The docs are READ-ONLY COPIES** — the harness record directory remains the source of truth for the design
artifacts. But `backend/` and `acxd-sdk/` are the *canonical deployables* — the complete, runnable
snapshot of what was built, bundled so it deploys with no external references.

Present the distribution folder to the user:

> "Your deliverables are packaged at `<projectName>-dist-<YYYYMMDD-HHMM>/` — a complete, self-contained
> snapshot. Deploy in three stages from the snapshot root — `backend/mock-integration/` (the API), then
> `acxd-sdk/` (the ACXD resources), then `backend/connect/` (the Amazon Connect flow — last, as it references
> the deployed ACXD app). The deployment runbook
> runs from the snapshot root. Start with the top-level README for an overview."

### Step 9c: Generate Customer-Facing Word Documents (architecture doc + consolidated runbook)

The **ACXD Architecture Document** and the **Consolidated Deployment Runbook** are customer-facing
deliverables. Alongside the Consolidated Scoping Document (produced in the user-stories stage), they form a
**single, consistently-styled artefact set** — same title block, headings, tables, and spacing. Purpose-built
deterministic converters produce them (shared styling core — NOT a generic md→docx, never Kiro improvisation):

- Architecture → `tools/acxd-md-to-docx/architecture_md_to_docx.py`
- Runbook → `tools/acxd-md-to-docx/runbook_md_to_docx.py` (merges `acxd-deployment-runbook.md` +
  `acxd-promotion-runbook.md` into one portable doc; those sources are merge INPUTS and are not shipped loose —
  see the cleanup note below)

**As soon as the architecture document and the deployment runbook markdown are written, AUTOMATICALLY
generate their Word versions** (Word-only — do NOT ask first, and never suggest an external AI tool). Just
create them and inform the user they are ready, matching the scoping document so all three form one
consistent artefact set. **Scope guard:** auto-generation applies ONLY to these two named documents here
(`acxd-architecture-document.md` and the consolidated deployment runbook) plus the consolidated scoping
document in the user-stories stage — the three designated customer-facing deliverables. It is NOT a general
rule: do NOT auto-convert any other markdown the workflow produces (handover pack, import guide, discovery
report, variable map, or any intermediate artefact).

Run the converters as soon as the markdown is ready (Python 3, python-docx — degrade gracefully if
unavailable, reading the document with the tool that works):

```bash
python3 {{PLUGIN_DIR}}/tools/acxd-md-to-docx/architecture_md_to_docx.py \
  <dist>/architecture/acxd-architecture-document.md
python3 {{PLUGIN_DIR}}/tools/acxd-md-to-docx/runbook_md_to_docx.py \
  <dist>/deployment/acxd-deployment-runbook.md
# → each writes a .docx beside its source; the runbook auto-discovers the scripts + promotion
#   files in the same/record dir and merges them.
```

**After the runbook `.docx` is generated, `deployment/` ships ONE runbook — not its source parts.** The merge
pulls `acxd-promotion-runbook.md` INTO `consolidated-runbook.docx`, so it is an input to the merge, not a separate
deliverable: do NOT leave it loose in `deployment/`. `acxd-deployment-scripts.md` (the deploy-engine reference)
is a developer reference, not an operator step: put it in `design/`. Keep `acxd-rollback-procedure.md` in
`deployment/` (the runbook's Rollback section points to it). Keep `acxd-deployment-runbook.md` (the primary, readable/diffable
source) beside `consolidated-runbook.docx` — exactly as `architecture/` keeps one `.md` beside its `.docx`. If
the converter could not run (python-docx absent), keep the source `.md`s so no content is lost, and say so.
`acxd-sit-results.md` (from Flow Authoring) is copied into `design/` as well as absorbed into the architecture
document, so the full report, including its Live test list, ships with the deliverables.
`acxd-flow-authoring-guide.md` is NOT a deployment doc — it is build-method reference and lives in `design/`.
`acxd-handover-pack.md` (full-scope only) is a day-one onboarding read, also under `design/`, not `deployment/`.

**Diagrams (architecture doc):** the converter uses a **layered Mermaid strategy** — it renders each
`mermaid` block to a PNG via `npx @mermaid-js/mermaid-cli` when that tooling is available and embeds the
image; otherwise it falls back to a clean captioned "Diagram (Mermaid source)" block. Either way the output
is deterministic and portable — never a hard failure. Set `ACXD_MERMAID=off` to force the source-block form.

**Consistency rule:** the architecture and runbook Word docs MUST use the **same title and introductory
section styling as the Consolidated Scoping Document** — this is guaranteed by the shared
`acxd_docx_core.py` renderer. Do not hand-restyle or use a different generator; if the styling needs to
change, change the core so all three stay in lockstep.

Copy the generated `.docx` files into the distribution folder beside their markdown, and tell the user the
Word documents are ready, listing them with clickable relative-path links so they can open them directly.
### Step 10: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-operational-readiness --result awaiting-approval`.

### Step 11: Present Completion & Request Approval

**PoC scopes (`acxd-platform-poc`, `acxd-poc`): keep this gate short.** Present three lines only: the
distribution folder path, the architecture document (`.md` and `.docx`), and the consolidated runbook (`.md` and
`.docx`), each as a link, plus one line for any check that did not pass. Then the approval question.

Review path: this stage's engine-resolved record dir.
Standard 2-option approval (Approve / Request Changes).
STOP for the human response. Report Approve with

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
