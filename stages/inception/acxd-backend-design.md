---
slug: acxd-backend-design
number: 2.78
name: Backend Service Architecture
plugin: acxd
phase: inception
execution: ALWAYS
condition: Runs for platform, use-case, and platform-poc engagements. Skipped for acxd-poc (ACXD static mocks only, authored in resource creation) and acxd-enhancement (backend assumed to exist).
lead_agent: aidlc-architect-agent
support_agents:
  - acxd-platform-agent
  - aidlc-developer-agent
mode: inline
produces:
  - acxd-backend-architecture
  - acxd-api-specifications
  - acxd-data-model
consumes:
  - artifact: acxd-component-interface-contracts
    required: false
  - artifact: acxd-flow-architecture
    required: false
  - artifact: acxd-integration-inventory
    required: false
  - artifact: acxd-platform-config-spec
    required: false
requires_stage:
  - acxd-flow-design
sensors:
  - required-sections
scopes:
  - acxd-platform
  - acxd-usecase
  - acxd-platform-poc
  - enterprise
  - feature
  - mvp
  - classic
  - workshop
inputs: Flow architecture, variable map, integration inventory, platform config spec
outputs: acxd-backend-architecture.md, acxd-api-specifications.md, acxd-data-model.md (under this stage's record dir, engine-resolved)
---

# Backend Service Architecture

> **MANDATORY STAGE-OPEN EMISSION — the first thing the user sees in this stage (reading the stage file first is fine).**
> Emit the H1 header line AND the intro line below it VERBATIM — copy both exactly as written here, word for word.
> They are fixed strings, not a description to paraphrase: do NOT reword, summarise, shorten, regenerate, or
> re-emoji either line. The `#` header must render as a real heading the user sees (NOT a code block, NOT a plain
> sentence). Emit exactly these two lines:
>
> # 🏗️ Backend Service Architecture
>
> Decides how each data request is served — direct call (no backend), a thin stateless integration adapter, or an adapter plus a justified data store — and defines the API contracts and IaC approach. **Produces:** the backend service architecture and integration design that the backend build stage implements.
>
> This is not optional and it does NOT degrade as context grows or the work feels urgent: a stage that opens without
> this hero header is as incomplete as one that ends without its `# 🏗️ Backend Service Architecture Complete` message (core
> stage-protocol §2). The opening header and the completion line are a matched pair — same emoji, same standard. Use
> the emoji exactly; never choose or re-check it.

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

This stage designs the backend services that power ACXD Data Requests. Every data request in the flow
architecture maps to a backend API endpoint. The design must comply with the ACXD data request contract
and be implementable with the chosen IaC approach.

## Steps

> **Integration mode drives the backend path (set per data request in CX Discovery's Integration & Data step).**
> Each API data request carries one of three modes; design its backend accordingly:
> - **Your API, called directly (option 1)** — the user provided an OpenAPI schema and ACXD calls the real
>   endpoint. **NO backend is designed or deployed for this API** — no CDK. The data request points at the URL
>   from the schema; auth comes from its `securitySchemes`, wired by the API wiring tool. Choose the
>   lightest Tier below only if a thin adapter is genuinely required (private-VPC reach, response reshaping);
>   otherwise it is a direct call with nothing to deploy.
> - **Your schema, deployed by this solution (option 2)** — the deployed backend MATCHES the user's OpenAPI
>   schema exactly (operations, params, response shapes); build it (Step 2b) with a small synthetic dataset. The flows are designed around the user's contract, not a generated one.
> - **Generated schema, deployed by this solution (option 3)** — the agent defines the contract and the deployed
>   backend (Step 2b) with synthetic data. The greenfield default.
>
> **One base URL and one credential per API, named from its OpenAPI file.** Every API (generated or the
> customer's) is wired the same way: the API wiring tool derives its secrets (`<apiId>Url`, `<apiId>Key|Token|Basic`)
> and each data request's URL and auth header from the OpenAPI `servers`, `securitySchemes` and `security`. A
> generated schema always declares an `apiKey` scheme (header `x-api-key`).
> Skip the production persistence layer (Step 4, DynamoDB) unless a specific source needs local state. For
> `acxd-usecase` and `acxd-platform`, design full production contracts for Live sources.

### Step 1: Inventory All Data Requests

From `acxd-flow-architecture.md` and `acxd-variable-map.md`, extract every data request:

| Data Request | Owning Flow | Operation | External System | Pattern |
|-------------|-------------|-----------|-----------------|---------|
| `verifyIdentity` | billingMain | Verify customer identity | CRM | A (Direct) |
| `billPayGetBalance` | billPayMain | Retrieve account balance | Core Banking | A (Direct) |
| `billPayProcessPayment` | billPayMain | Execute payment | Payment Gateway | A (Direct) |
| `knowledgeQuery` | the use-case flow | Search knowledge base | ACXD KB | N/A (native) |

### Step 2: Select Integration Pattern per Data Request

For each **Live** data request, choose the lightest tier that works. Default to the lightest — do not add a
Lambda (or a data store) unless a concrete need below requires it. (Mock data requests are handled in Step 2b.)

#### Tier 1 — Direct call, NO backend (prefer this)

ACXD calls the third-party API **directly** from the data request — no API Gateway, no Lambda, nothing to
deploy or maintain. This is the ideal: use it whenever the API already fits the ACXD data request contract.

**"Can ACXD call this API directly?" — Tier 1 requires ALL five to be true:**
1. **Reachable** — the API is on a public endpoint (not in a private VPC / PrivateLink / on-prem-only network).
2. **Auth is a static header/key** ACXD can attach (API key, bearer token or basic credentials from a Secret, as declared in the API's OpenAPI `securitySchemes`) — an OAuth access token is supported as a static bearer the operator refreshes; NOT token exchange at call time, SigV4, mTLS, digest, or per-call HMAC signing.
3. **Request shape ACXD can send** — the operation takes its inputs as URL parameters and/or a JSON request body
   (nested objects and arrays are supported). It must not require something ACXD cannot produce, such as a
   per-call signature or a request envelope that must be computed at call time.
4. **Bare response, flow-read fields at top level** — the API returns a bare value object (no `data:{}`/`results:[]` wrapper envelope) and every field the flow reads is a top-level key (a flow's `{dr.field}` reference resolves top-level keys only). Nested detail the flow does not reference is fine; but if the flow needs values the API only returns nested, that reshaping is a Tier-2 adapter job, not Tier-1.
5. **HTTP 200 on business failures** — "not found / invalid" comes back 200 with a boolean/flag, not 404/422 (ACXD treats non-200 as a system error → Failure edge).

If all five hold, configure the data request in External mode pointing straight at the API. **Done — no Pattern A/B, no CDK.**

#### Tier 2 — Thin stateless adapter (APIGW → Lambda → external system)

Use a thin, **stateless** adapter Lambda when Tier 1 fails on any point — i.e. the API needs *translation* or
*private-network* access. The adapter's whole job is to bridge the mismatch; it still holds no data.
Triggers (any one):
- **Auth translation** — OAuth2 client-credentials, SigV4, mTLS, HMAC/token refresh (adapter holds the credential and signs/exchanges).
- **Response flattening** — upstream wraps the response in an envelope, or returns a field the FLOW must read
  nested (a flow resolves `{dr.field}` top-level only). Nested detail the flow does not read needs no adapter.
- **Status normalisation** — upstream uses 404/422 for business "no"; convert to 200 + `found:false`.
- **Request reshaping** — upstream needs input ACXD cannot assemble at call time (computed signatures, values
  derived across several calls). A nested JSON body alone is NOT a trigger: ACXD sends nested bodies directly.
- **Field mapping / derivation** — rename fields, compute `balanceFormatted`, combine fields, pick one array element.
- **Fan-out** — one conversational operation needs 2–3 upstream calls combined into one flat response.
- **Secret hygiene / PII redaction** — keep the raw upstream credential server-side, or redact at the boundary.
- **Private networking** — upstream is in a VPC / behind PrivateLink / on-prem → Lambda (in VPC) is required regardless of the above.

The harness does NOT build the system of record — the data lives in the customer's system. **No persistence**
(see Tier 3). IaC: CDK stack (one per use case) — API Gateway + adapter Lambda(s), no data layer.

#### Tier 3 — Adapter + a justified data store

Tier 2 **plus** a small Lambda-owned store, and ONLY for a justified exception (idempotency, cross-disconnect
session state, cache, audit). See Step 4. This is the rare case — most integrations never reach it.

#### Orchestration variant — MCP via AgentCore Gateway Bridge
- Model Context Protocol for tool-use orchestration
- Best for: multi-step reasoning operations where the agentic flow needs to call multiple tools
- ACXD Generative Journey invokes MCP tools via AgentCore Gateway
- IaC: AgentCore Gateway configuration + Lambda tool handlers

**Tier summary:**
| Tier | What | When |
|------|------|------|
| **1 — Direct** | ACXD → API, no backend | Public API that already fits the flat/bare/200/static-key contract |
| **2 — Thin adapter** | APIGW → stateless Lambda → API | Auth translation, response flattening, status/shape fixes, or private networking |
| **3 — Adapter + store** | Tier 2 + one small table | A justified store is required (idempotency/session/cache/audit) |
| **MCP variant** | Bridge → AgentCore Gateway | Multi-tool orchestration for a Generative Journey |

Record the chosen tier per data request in the backend design.

### Step 2b: Mock Patterns (for data requests marked Mock in discovery)

For each data request marked **Mock** in the integration inventory, the scope fixes the style: **`acxd-poc` uses the
static mock; every other scope uses the deployed backend.** It is not a design choice to revisit here. This step covers only APIs this solution deploys (options 2 and 3); an API the user's systems serve
(option 1) has no backend here, and an option 2 backend matches the user's schema exactly. Both styles read mock response data from an **external, editable JSON file** with
**3 example response patterns** per operation — never inline the data. Both keep mock code/data in a dedicated
**`backend/mock-integration/` folder**, separate from the production adapter code (`backend/adapter-integration/`).

**Static mock (`webhook.implementation = "inline-static"`):**
- ACXD runs an inline JS `code` string inside its own runtime — no infrastructure, no HTTP endpoint, no
  public interface, nothing to secure.
- The code reads request params and returns a match from the data map (loaded from `backend/mock-integration/apis/<apiId>/data/<operation>.json`).
- Best for: quick demos, design exploration, no AWS deploy.
- Limitation: no CloudWatch logs/metrics, cannot test corporate firewall/WAF/security policies.

**Deployed backend with synthetic data (`webhook.implementation = "external"`):**
- **One API Gateway + Lambda per OpenAPI file** (never two APIs on one backend), each reading responses from
  `backend/mock-integration/apis/<apiId>/data/<operation>.json`. All APIs deploy together as nested stacks of one
  parent stack (`acxd-<projectName>-<env>-mock-apis`), so it is one command for any number of APIs. Write stack
  names with the `<env>` placeholder (the `.env` `ACXD_ENVIRONMENT`, default `dev`), never a literal such as `poc`.
- Real public interface — gives API access logging, latency/error metrics, and testability against corporate
  firewall, WAF, and security policies.
- Best for: development that will progress to production. Migrate to live by swapping the URL/key.
- Deployed from `backend/mock-integration/` (its `cdk/` stack), SEPARATE from the production backend CDK.
- **No data layer.** The `backend/mock-integration/apis/<apiId>/data/*.json` files ship with the mock Lambda and are read from its package at
  runtime. A mock never uses DynamoDB or any external store — do not design a persistence layer for a mock.

Record the style per data request. Live data requests always use `webhook.implementation = "external"`
pointing at the real endpoint.

**AWS region for a deployed backend — it is the single solution region, not a separate choice.** The whole
solution deploys to ONE region chosen once (the ACXD workspace / Amazon Connect region); the deployed backend
(`external`) is co-located in that same region. ACXD and Connect must share a region, and splitting the mock
into another region adds cross-region complexity for no benefit, so do NOT present a separate mock-region
question or invite a second region. A deployed backend creates real AWS infrastructure (API Gateway + Lambda), so
it must be pinned to that solution region explicitly — do NOT let it default silently from the operator's
`AWS_REGION`/CLI profile, which is how a mock lands in an unintended region. Confirm the already-chosen solution
region applies (it will already be recorded in discovery or the answer key — surface it for confirmation, do not
re-ask it as an open region choice). Record it as the **mock deploy region** in `acxd-backend-architecture.md`;
it is pinned explicitly in the mock `cdk deploy` command at build time (never left to ambient env). This applies even in `acxd-platform-poc`.
### Step 3: Design API Specifications per Data Request

For each Pattern A data request, write the API spec in `acxd-api-specifications.md`:

```
## API: verifyIdentity

**Endpoint:** POST /verifyIdentity  (a sensitive input such as a PIN or date of birth travels in the JSON body)
**API Gateway:** {apigwId}/prod

**Request (ACXD sends — JSON body; nested objects allowed):**
{
  "customerPhone": "string — ANI or provided phone",
  "dateOfBirth": "string — DD/MM/YYYY",
  "authMethod": "string — 'dob' | 'sms-otp'"
}

**Response (Lambda returns — bare value object):**
{
  "authStatus": "verified",
  "customerId": "CUST12345",
  "customerName": "Jane Smith",
  "authAttempts": 1
}

**Response Conventions:**
- HTTP 200 for business failures (authStatus: "failed") — ACXD treats non-200 as system errors
- Boolean fields: "found": true/false, "verified": true/false
- Money fields: "balanceFormatted": "$1,234.56", "balanceRaw": 1234.56
- Success-only strings: return field only on success, omit on failure
- Bare value object — no `resolvedVariables`/`data:{}` envelope. Keep every field a flow reads at the top level (a flow's `{dr.field}` reference resolves top-level keys only); nested objects/arrays are allowed in the schema for detail the flow does not reference directly.

**Error Response (system failure only, non-200):**
{
  "error": "UPSTREAM_TIMEOUT",
  "message": "CRM API did not respond within 5000ms"
}

**Timeout:** 8000ms (ACXD default data request timeout)
**Idempotent:** Yes (read-only verification)
```

### Step 3b: Confirm API Names & Payloads with the User


> A recorded decision (discovery notes or an answer key) satisfies this confirmation — present the recorded names/payloads for a yes/no confirm; a live stop-and-ask is only for genuinely undecided values.
The specifications in Step 3 are **generated defaults** — a starting point derived from what each flow needs.
They are NOT the decision. Even for mocked data requests, teams normally want the API names, field names, and
payload shapes to match what they have (or intend to have) in production, so the mock is a faithful stand-in
and migrating to live is a URL swap with no flow changes.

Offer the options a pattern defines and never assume its default: present the generated
contracts and invite the user to adjust them — do not silently proceed with auto-generated names/payloads:

> "I've drafted API contracts for each data request based on what the flows need. These are starting
> defaults — you'll usually want them to match your real (or planned) production APIs so the mock behaves
> like the real thing. For each one you can keep the default or give me your own.
>
> [per data request, show a one-line summary: operation name, endpoint, request fields → response fields]
>
> Options:
> 1. **Use these defaults** — proceed with the generated names and payloads.
> 2. **I'll provide the real contract** — paste your API spec / field names / sample payloads (or point me at
>    a schema, Swagger/OpenAPI, or example response) and I'll match the mock to it.
> 3. **Adjust specific ones** — tell me which operations to change and how."

Apply the user's choices to `acxd-api-specifications.md`. If the user provides real payloads, mirror the exact
field names and shapes (still flat, still ACXD-contract-compliant). Record provenance: mark user-supplied
contracts `[USER-DEFINED]` and generated ones `[HARNESS-DEFAULT]` so downstream mock data generation and the
eventual live migration know which are authoritative. The `backend/mock-integration/apis/<apiId>/data/<operation>.json` examples generated in
backend-build must use these confirmed field names.

### Step 4: Design a Data Persistence Layer — ONLY if justified

**Default: skip this step.** Adapter Lambdas are stateless — the customer's external system is the system of
record, so there is normally no ACXD-side data store. Only design a Lambda-owned store when a specific data
request genuinely needs one; otherwise state "no persistence — system of record is external" and move on.

**Justified exceptions (the only reasons to add a store):**
- **Idempotency / dedupe** — a token table so a retried flow doesn't double-process a payment or write.
- **Session/conversation state** that must survive a disconnect/callback or span channels, and that ACXD
  context variables cannot hold.
- **Cache** of a slow, rate-limited, or costly upstream (with TTL) — an optimisation, not a data layer.
- **ACXD-side audit log** the customer explicitly wants at the conversation boundary.

For any store you DO add: keep it minimal (usually one DynamoDB table), justify it explicitly in the design,
use TTL where the data is transient, and scope IAM to just that table. The harness never scaffolds a net-new
system-of-record API — if the customer has no upstream at all, mock it (backend stages) and treat building
that system as a separate effort outside this harness.

If (and only if) a store is justified, produce `acxd-data-model.md` with the table design, access patterns,
and the explicit justification. If no store is needed, note that in the backend design and skip the artifact. **For a store-less scope (the common mock/PoC case), the expected output is an explicit `acxd-data-model.md` recording "no persistence required" with the one-line reason — write that stub rather than leaving the declared produce missing.**

### Step 5: Design the IaC Approach

All backend AWS infrastructure is deployed via **AWS CDK (TypeScript)** — one stack per use case. This
matches the TypeScript ACXD SDK scripts so the whole deployment toolchain is one language. Lambda handlers
remain Python (packaged as CDK assets).

**CDK stack per use case:**
- TypeScript CDK stack containing API Gateway, stateless adapter Lambda functions, IAM roles (add DynamoDB only for a justified store — see Step 4)
- `cdk-nag` for security best practices (added as an Aspect during synth)
- `cdk bootstrap` required once per account and region

**Platform pattern (shared constructs):**
- Shared API Gateway construct imported by use-case stacks
- Common constructs library for adapter Lambda patterns and IAM policies (plus shared data-store constructs only where a justified exception spans use cases)
- Cross-stack references via CDK exports for API Gateway ID, table ARNs

Document in `acxd-backend-architecture.md`:
- Stack architecture diagram (Mermaid)
- Stack decomposition: which resources in which stack
- Deployment order: shared infra → use-case stacks → ACXD resource update
- Cross-stack references: exports/imports for API Gateway ID (and any justified table ARNs)

### Step 6: Design the Connect Integration Stacks

Auxiliary stacks support the ACXD deployment on the Amazon Connect side:

1. **Connect integration stack** — the contact flow that reaches ACXD via the **Agentic CX block**
   (referencing the ACXD Workspace / Application / Alias), plus the escalation queue and routing profile.
   Phone-number claim/assignment and agent assignment are customer post-deploy steps.

There is **no separate Lex stack to build**: the Agentic CX block references the ACXD application directly,
and the ACXD build stands up the underlying orchestration — you do not provision or wire an Amazon Lex bot.

The plugin ships a fixed CDK Connect integration stack (`connect-stack.ts` + `mainflow.json`) that wires into the
customer's EXISTING Amazon Connect instance (a prerequisite, supplied by ARN; never created) and that
provisions the best-practice contact flow (Agentic CX block, flow logging, Contact Lens analytics,
escalation hand-off), the escalation queue, and the routing profile. The agent supplies only the
account-specific values (Connect instance ARN, ACXD Workspace/Application/Alias) as CDK context — it does
NOT author the flow. **Deployment order:** this stack deploys AFTER the ACXD application (its Agentic CX
block references the Workspace/Application/Alias the SDK deploy creates). Document the stack parameters.

### Step 7: Design Service Boundaries (Platform Engagements)

For platform engagements with multiple use cases:
- **Shared services** — identity verification, escalation routing, notification dispatch (cross-use-case)
- **Use-case services** — bill payment, order management, appointment booking (use-case-specific)
- **Service communication** — shared services are invoked by use-case Lambda functions or directly by ACXD data requests
- **Cross-use-case data** — normally lives in the customer's shared systems of record; introduce a shared ACXD-side table only for a justified cross-use-case exception (e.g. shared idempotency/audit)

### Step 8: Security Design

- IAM roles: least-privilege per Lambda function — typically Secrets Manager for upstream credentials; DynamoDB actions only where a justified store exists
- API Gateway: IAM auth for backend-to-backend, API key for ACXD data requests
- Secrets: external API credentials in Secrets Manager, referenced by Lambda via environment variables
- VPC: Lambda in VPC only if external systems require private connectivity
- Encryption: API Gateway TLS (default), Lambda environment variable encryption, and DynamoDB encryption at rest (default) where a store exists

> **Questions file + summary confirmation: questions follow the core (persona, "Working with the AI-DLC harness").** The core always writes the questions
> file. When the directive has summary confirmation on, it runs the **Looks correct / Request changes** stop
> before the artifacts; when it is off (the PoC scopes), generate straight from the answers. Then
> **this stage's approval gate (Step 9)**.

### Step 9: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-backend-design --result awaiting-approval`.

### Step 10: Present Completion & Request Approval

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
