---
slug: acxd-resource-creation
number: 3.45
name: Author ACXD Resources (declarative)
plugin: acxd
phase: construction
execution: ALWAYS
condition: Runs for all ACXD engagements. You author declarative resource JSON that the shipped deploy engine provisions.
lead_agent: acxd-platform-agent
support_agents:
  - aidlc-developer-agent
mode: inline
produces:
  - acxd-sdk-resource-scripts
  - acxd-resource-inventory
consumes:
  - artifact: acxd-component-interface-contracts
    required: false
  - artifact: acxd-resource-inventory-manifest
    required: false
  - artifact: acxd-flow-architecture
    required: true
  - artifact: acxd-platform-config-spec
    required: true
requires_stage:
  - acxd-flow-design
sensors:
  - required-sections
  - acxd-stage-exit
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
inputs: Flow architecture, variable map, platform config spec
outputs: resources/*.json (declarative resource definitions), acxd-resource-inventory.md
---

# Author ACXD Resources (declarative)

> **Stage header (fixed — use exactly, do not choose):** open the stage with `# 📦 Author ACXD Resources (declarative)` and end it with
> `# 📦 Author ACXD Resources (declarative) Complete`. Phase banner for this stage: 🔨 Entering the Construction Phase (emit FIRST, see below).

> **⚙️ READ FIRST — how authoring works in this plugin (do not skip):**
> You AUTHOR **declarative resource JSON** (`resources/*.json`) that a pre-built, tested, deterministic **deploy
> engine** provisions later. **You do NOT hand-write raw JSON from scratch, you do NOT run the SDK, and you do
> NOT hand-craft `CreateXCommand` SDK calls.** The engine already implements all creation/build/deploy
> orchestration. Your job here is to produce the declarative DATA the engine consumes — nothing more. The
> per-resource shapes are defined in `knowledge/acxd-platform-agent/acxd-sdk-idl.ts` (the authoritative
> authoring contract). If your first instinct is "write a script that calls the SDK" — stop: that is the exact
> mistake this framing prevents. Author JSON; the engine deploys it.

> **MANDATORY STAGE-OPEN EMISSION — this is the first thing the user sees in this stage (reading the stage file first is fine).**
> This is the first ACXD stage of the Construction phase. Emit the phase-entry banner below EXACTLY as written, as literal Markdown
> (a rendered `#` heading the user sees, NOT a code block, NOT paraphrased), then the stage hero header (`# 📦 Author ACXD Resources (declarative)`) + its intro line (both written below), then proceed. Emit the stage hero H1 line AND its intro line VERBATIM — copy both exactly as
> written, word for word; they are fixed strings, not a description to paraphrase. Do NOT reword, summarise,
> shorten, regenerate, or re-emoji either line.
> This is not optional guidance or a sample: a stage that begins without its opening banner is as incomplete as one that ends
> without its `# 📦 ... Complete` message (core stage-protocol §2). Do NOT skip it because context is long or the work feels
> urgent. Emit it once, at the very start:
>
> # 🔨 Entering the Construction Phase
>
> Now we build the solution: the ACXD resources (context variables, slots, data requests, knowledge bases), the conversation flows, and any backend integration or mock. This phase produces the declarative artefacts the deploy engine provisions.
>
> # 📦 Author ACXD Resources (declarative)
>
> **What this stage does:** Authors the declarative resource JSON (context variables, slots, data requests, knowledge bases, analytics tags, guardrails) the deterministic deploy engine consumes. **Produces:** the `resources/*.json` set and the deploy config that the build pipeline provisions.

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

Author the declarative resource definitions (`resources/*.json`) that define every ACXD resource — context
variables, slot types, secrets, analytics tags, data requests, knowledge bases. The shipped deploy engine
creates them via the GA `amazon-connect-acxd-sdk` package at deploy time. **No cURL. No direct REST. No
Beta/Gamma endpoints. No hand-written SDK calls — the engine owns all SDK invocation.**

**Before authoring any resource JSON, consult `knowledge/acxd-platform-agent/acxd-sdk-idl.ts` (the authoritative
authoring contract — the exact shape for each resource type). The deploy engine owns the SDK field names/shapes and
the engine (deterministically). Never guess a field name — e.g. slot types use `slotTypeId` not
`name`, data requests nest `webhook`, secrets use `secretValue`. The IDL is the authoritative shape source.**

> ## ⚙️ Deployment model: declarative JSON + the shipped deploy engine (READ FIRST)
>
> The engine ships with the plugin (composed to `.kiro/tools/acxd-deploy-engine/`, read-only); this stage does not
> run it. It provisions workspace → resources → flows →
> application in one command later (in Build & Deploy), reading declarative JSON + `.env`, writing new ids
> back to `.env`, with no manual ID capture.
>
> ### 📁 Where the artifacts you author go (READ THIS — avoids a common misstep)
> **This stage authors ordinary AI-DLC stage artifacts into the stage record directory — exactly like every
> other stage. Do NOT create an `acxd-sdk/` folder, and do NOT place anything under `.kiro/tools/`.** Author
> `resources/*.json` and `acxd-deploy.config.json` in this stage's record dir. Flow Authoring writes `flows/`
> in its own record dir; its build finds these resources itself, and Operational Readiness assembles them as
> siblings in `acxd-sdk/`. The self-contained `acxd-sdk/`
> deployable — engine + config + resources gathered together — is assembled ONCE, later, by Operational
> Readiness (Step 9b) into the timestamped distribution snapshot. There is no root-level `acxd-sdk/` working
> folder during this stage; the engine's config-relative paths resolve because config, `resources/`, and
> `flows/` stay siblings when Step 9b copies them into `acxd-sdk/`.
>
> **This stage's job is to author DECLARATIVE DATA, not orchestration TypeScript.** Produce:
> - `resources/context-vars.json`, `slot-types.json`, `secrets.json`, `analytics-tags.json`,
>   `data-requests.json`, `knowledge-bases.json` — the resource definitions (shapes below).
> - `flows/*.flow.json` — authored in the Flow Authoring stage.
> - `acxd-deploy.config.json` — the manifest pointing the engine at those files + build/deploy knobs
>   (validated against `tools/acxd-deploy-engine/acxd-deploy.config.schema.json`).
>   Its `application` block MUST include a **`defaultFlows`** map (role → target flowId string). **`welcome`
>   is REQUIRED** once the app has attached flows — the API rejects an app with flows but no welcome default
>   (`This application has flows but no default welcome flow`) `[CONSOLE-VERIFIED]`. Typical mapping:
>   `welcome`, `fallback` and `unknown`→the use-case flow, `escalation`→the escalation flow.
>
> **Do NOT generate** `create-resources.ts`, `build-application.ts`, `deploy-application.ts`,
> `create-flows.ts`, `client.ts`, `poll-build-status.ts`, or any bespoke orchestration script — the engine
> already implements all of it (create → 2s settle → write-`.env` → continue; build/deploy polling with a
> bounded timeout; idempotent re-runs). Regenerating that logic each run was the identified source of
> deployment bugs.
>
> The per-resource TypeScript snippets below are retained as the **authoritative shape reference** — they
> show the exact fields each resource needs. Emit that same information as the corresponding
> `resources/*.json` entry (the engine's `steps/create-*.ts` consume these JSON shapes). Think of the
> snippets as "what each JSON object must contain", not "scripts to hand-write".
>
> **Secrets ARE created programmatically** by the engine via `CreateSecretCommand` with values sourced from
> `.env` (one base URL and one credential per API, named from its OpenAPI file) — there is no manual console step.

## Constraints

- Every resource MUST carry a verbose `description` or `aiDescription` following the template:
  **What / Inputs / Outputs / Consumers / Owner**. Truncate to 200 characters for ACXD fields;
  write the full version in the resource inventory manifest (`acxd-resource-inventory.md`).
- Component (shared) resources are created BEFORE use-case-specific resources.
- Every resource is named in the use-case namespace (keep the conversation together); nothing is shared across use cases (camelCase, no hyphens).
- All scripts are idempotent — check for existing resources before creating (brownfield safety).

## Steps

**Every resource a flow references must be authored here.** `[CONSOLE-VERIFIED]`

Flows reference context variables, analytics tags, slot types, data requests, secrets, and knowledge bases
by name. If any referenced resource doesn't exist in the workspace when a flow is created, the flow will
have unresolved references. The engine creates them in this order (you only author the files):

1. Context variables (CreateContextVariableCommand for every context variable referenced in any flow — including control-flow vars, see note below)
2. Custom slot types (every custom type referenced in flow slots)
3. Secrets (API keys, base URLs)
4. Data requests (after secrets — they reference secrets; `external` requests need the backend reachable)
5. Knowledge bases (after data requests — Generative Journey tools reference KBs) → **PUBLISH after adding content**
6. Analytics tags (CreateAnalyticsTagCommand for every tag referenced in flows)
7. **THEN** create flows via SDK (Redirect-target flows first, then the flows that redirect to them)


### Step 1: Inventory Resources to Create

Walk the flow architecture and variable map. For each flow,
enumerate every ACXD resource required:

| Resource Type | SDK Command | Notes |
|---------------|-------------|-------|
| Workspace | `CreateWorkspaceCommand` | Account-level (no workspaceId on the client). Create if no `ACXD_WORKSPACE_ID` given; capture the returned id. Reuse an existing workspace by setting the id in `.env`. |
| Context Variable | `CreateContextVariableCommand` | One per context variable referenced in flows (bare camelCase names, no `ctx` prefix; include control-flow vars like retry counters/flags) |
| Analytics Tag | `CreateAnalyticsTagCommand` | One per tag referenced in node metadata |
| Secret | `CreateSecretCommand` | One base URL + one credential per API, written by the API wiring tool from the OpenAPI files |
| Slot Type | `CreateSlotTypeCommand` | One per custom entity (account type, product category) |
| Data Request | `CreateDataRequestCommand` | One per backend operation |
| Knowledge Base | `CreateKnowledgeBaseCommand` | One per knowledge domain (FAQ, product, policy) |
| Flow | `CreateFlowCommand` | Full flow with nodes — SDK accepts complete node graphs |
| Application | `CreateApplicationCommand` | One per deployment unit; attach flows |

> **Creation order & settle:** create in the order above (workspace → context vars → analytics tags →
> secrets → slot types → data requests → knowledge bases → flows → application). Add a short settle delay
> (~5s) after each resource TYPE so freshly-created resources are consistent before the next type references them.
### Step 1b: Author Context Variables (`resources/context-vars.json`)

For every context variable referenced in any flow. Source these from TWO places, not just one:
(1) the business/data variables in the variable map, AND (2) **control-flow context variables** authored
directly in the flows — retry counters (e.g. `authAttempts`), gate flags, and any `{name:NLX.Context}` /
`type:"context"` reference in a node. Control-flow vars are easy to miss because they are not business data
and are not in the variable map, but they MUST be registered or the flow-ref validator fails the deploy
("context variable X is referenced but is not defined"). Names are **bare camelCase — no `ctx` prefix**.

Author this into `resources/context-vars.json` — a declarative array; the engine's `create-context-vars.ts`
emitter sends each one (and handles already-exists on re-run).
**Shape:** author to `ContextVarDef` — see its `@example` in `acxd-sdk-idl.ts` (PART A).
Enumeration rule (stage-specific): add all context variables from the variable map AND every **control-flow**
context var referenced in flows (retry counters like `authAttempts`, gate flags) — these are easy to miss and
the flow-ref validator fails the deploy if any referenced var is unregistered. Bare camelCase, no `ctx` prefix.

Every context var a flow reads must be in this file; the engine creates them before flows. `[CONSOLE-VERIFIED]`

### Step 1c: Author Analytics Tags (`resources/analytics-tags.json`)

For every analytics tag referenced in any flow node:

Author this into `resources/analytics-tags.json`; the engine's `create-analytics-tags.ts` emitter sends each.
**Shape:** author to `AnalyticsTagDef` — see its `@example` in `acxd-sdk-idl.ts` (PART A).
Selection rule (stage-specific): custom tags only, for moments the platform can't already count — Escalation
Rate is a free built-in metric (no "escalated" tag), and automated/helpful/not_helpful ship as default tags.
Name tags like events (`billingCompleted`, `identifierRetry`), category-prefixed camelCase.

Every tag a node uses must be in this file (the build checks it; the engine creates tags before flows). Use camelCase — ACXD silently strips hyphens
from tag names. `[CONSOLE-VERIFIED]`

**Before authoring a custom tag, check it isn't already provided `[CONSOLE-VERIFIED]`:**
- **Three default tags ship in the picker** — `automated`, `helpful`, `not_helpful` — ready to place on any
  node. Reuse these instead of minting near-duplicates. (They do NOT classify anything on their own; a tag
  records only that a node was reached — placement is the design decision.)
- **Escalation Rate is a built-in dashboard metric** (User experience dashboard) — you get it for free with
  no tag. So do **not** author an `escalated` tag just to count escalations; it duplicates a metric you
  already have. Author a custom tag only for a moment the platform can't already count (e.g. `identifierRetry`
  — callers who fumbled the identifier and recovered).
- **Name tags like events, not labels** — `billingCompleted`, `identifierRetry`, `offerDeclined` (a moment that
  happened), never a category like `insurance` or `important`.
- **Positive-funnel tags only — escalation/failure outcomes are NOT node tags.** `redirect` and `escalate`
  nodes cannot carry tags (grammar); analytics tags go on `basic`/`generative_journey` nodes and mark positive
  funnel progression (milestones/completions) plus friction. Segment negative outcomes by the `escalationReason`
  context variable instead — set a precise reason code (`outOfScope`, `agentRequested`, `authFailed`,
  `systemUnavailable`, `nonStandardDiscount`, ...) on EVERY escalation path at design time, so analytics can
  segment on the var. Map-only means the outcome sits on a `redirect`/`escalate` node: record it in
  `acxd-analytics-tag-map.md` against that variable. A `failure*` tag the vocabulary places on a `basic` apology
  node (for example "Pricing unavailable") is a normal node tag: create it here like any other.

### Step 2: Wire the APIs from their OpenAPI files (`resources/secrets.json`, data-request URLs and auth headers)

Every API a data request calls has an OpenAPI file in `customer-context/` (generated in CX Discovery, or supplied
by the customer). API secrets, data-request methods, URLs and auth headers are DERIVED from those files by the
API wiring tool, never authored by hand. Author `resources/data-requests.json` first (Step 3), naming each
external data request after its OpenAPI `operationId`; then run:

```bash
cd {{HARNESS_DIR}}/tools/acxd-deploy-engine && npm ci
npx --yes tsx openapi-wiring-cli.ts --apis <project>/customer-context --resources <this stage's resources dir>
```

**The tool is the only way to write this wiring.** If it cannot run (for example `npm ci` fails), stop and report
the error at the gate as an environment gap; do not write `secrets.json` or the data-request URLs yourself.

For each API it writes, deterministically:
- a base-URL secret `<apiId>Url` (`isSensitive: false`; a URL is an endpoint, not a credential) and one
  credential secret per security scheme the API uses (`<apiId>Key`, `<apiId>Token` or `<apiId>Basic`,
  `isSensitive: true`), each reading its `.env` key (the SCREAMING_SNAKE form of the secret name);
- each external data request's `method`, `url` (`{<apiId>Url:NLX.Secret}<path>` plus required query parameters)
  and auth header, from the matching operation and its `security` (per operation, so different paths may use
  different credentials).

Supported schemes: `apiKey` (header, query or cookie), `http` bearer and basic, and `oauth2`/`openIdConnect`
(sent as a current bearer token). The tool stops on `http` digest or `mutualTLS` (an adapter backend is
needed), on a data request with no matching `operationId`, and on an operationId used in two files. Secret
VALUES never live in the OpenAPI file or `secrets.json`: they come from `.env`. Do not hand-edit API secrets,
URLs or auth headers after running the tool; change the OpenAPI file and re-run it. Other secrets that are not
API credentials may still be authored by hand to `SecretDef` (`acxd-sdk-idl.ts`, PART A).

### Step 3: Author Data Requests (`resources/data-requests.json`)

Every data request carries a `webhook` config. The `webhook.implementation` field selects how the data
request is served:

| `webhook.implementation` | Use for | Needs backend? | Public interface? |
|--------------------------|---------|----------------|-------------------|
| `"inline-static"` | Static mock — canned responses served inside ACXD's runtime | No | No |
| `"external"` | An API: a customer's API, or an API this solution deploys in Backend Build (API Gateway + Lambda) | Yes | Yes |
| `"mcp"` | MCP gateway integration | Yes (gateway) | Via gateway |

Set `webhook.implementation` per the mock style recorded in the integration inventory (Static → `inline-static`,
generated or customer API → `external`).

**Record `alwaysRetrigger` per the integration inventory's Always Retrigger column (from CX Discovery Step 4).**
Default is `true` (the field re-runs and returns fresh data each time the node is reached). It is set to `false`
ONLY for the specific data requests the user opted OUT for — the static/unchanging ones named in discovery.
NOTE: `alwaysRetrigger` is NOT a `DataRequestDef` resource field — it is a FLOW-NODE binding on
`NodeDataRequest`, authored in the next stage (Flow Authoring) on each data_request node that calls this API.
Here in Resource Creation, just carry the per-API ON/OFF choice in the integration inventory / data-request
notes so Flow Authoring binds it correctly; do NOT add an `alwaysRetrigger` key to `resources/data-requests.json`. (This is a caching/latency control, not a retry or
safety switch; timeout/failure are self-managed regardless.)

**External mode — the URL is validated for shape, NOT tested for reachability.** `[CONSOLE-VERIFIED]`
Creating an `external` data request validates the request/response schema and config shape; it does **not**
call the endpoint, so a placeholder or not-yet-live URL still creates successfully. (A `ValidationException`
here means a malformed schema/payload — not an unreachable backend.) You confirm the backend actually works
by testing it directly (see the backend-build cURL smoke test) — do that BEFORE relying on the data requests.
The URL to configure depends on the integration tier chosen in backend design:
- **Tier 1 (direct):** point straight at the **third-party API's** public URL — there is no backend to deploy.
- **Tier 2/3 (adapter):** point at the **adapter's API Gateway** URL — deploy the backend CDK stack first.
- **API this solution deploys:** its base URL comes from the Stage 1 stack output into `.env`; the API wiring tool references it.

**Static mode example** (`inline-static` — no backend, no public interface):

Author into `resources/data-requests.json` (the engine's `create-data-requests.ts` emitter sends each). For
**Shape:** author to `DataRequestDef` — see its `@example` in `acxd-sdk-idl.ts` (PART A). For `inline-static`,
`code` is the canned-response JS string (the engine inlines the editable `mock/data/<operation>.json` patterns
at generation time).

**External mode example** (`external` — a customer's API or an API this solution deploys):

Author into `resources/data-requests.json`. For `external`: `method` defaults GET. Choose the method from the
API's contract (reads GET, writes POST/PUT/PATCH); the `url` references a secret with the `{secretName:NLX.Secret}` form (the validated
syntax) + one `{param}` placeholder per URL parameter (body fields are NOT placeholders; describe them in `requestSchema`) — served at the API Gateway stage root (NO `/tools`
prefix). The URL, method and auth headers are written by the API wiring tool (Step 2); author the rest. `[CONSOLE-VERIFIED]` The engine emits
the url into `webhook.environments.{production,development}.url` (a bare top-level url does not substitute
placeholders). The VALUES are supplied by the flow node: URL params in its `params`/`urlParams`, the JSON body in its
`body`/`payload` — not here. **Shape + a worked external example** (url
with `{secretName:NLX.Secret}` + `{param}` placeholders, `headers`): see the `DataRequestDef` `@example` in
`acxd-sdk-idl.ts` (PART A). Its url and auth headers are written by the API wiring tool; do not author them.

> **Generated-API URL — the final path segment IS the operation id (one camelCase token, four names aligned).**
> `[CONSOLE-VERIFIED]` The shipped backend for an API this solution deploys routes on `/{operation}` at the API Gateway stage root and serves
> `apis/<apiId>/data/<operation>.json` (+ optional `ops/<operation>.py`) from that API's own Lambda. So for that API's data requests, the URL's
> **final path segment MUST equal the operation id**, and that ONE camelCase token is simultaneously: the
> URL path segment, the `data/<operation>.json` filename, and the `ops/<operation>.py` module name. Author it
> in camelCase here from the start — e.g. `{billingApiUrl:NLX.Secret}/verifyIdentity?...`, served by
> `apis/billingApi/data/verifyIdentity.json`. Do NOT author a kebab-case path (`/verify-identity`) — it will not match the
> backend's data file, and you would have to correct it later in backend-build. (The token is a property of the
> URL. Name the data request after the operationId too, so the API wiring tool can match it.)

- Request inputs go in URL `{placeholders}` and/or a JSON request body (`requestSchema`, nested objects and
  arrays allowed). For an API this solution deploys, prefer a flat JSON body for POST writes and sensitive inputs, and URL
  parameters for GET reads; follow the user's OpenAPI exactly for a live or user-schema API.
- Bare value object response — no `resolvedVariables` envelope.
- One data request per backend operation (no multiplexing).
- All identifiers use camelCase — no hyphens.

### Step 3b: Author Inline Static Mock Data

For every data request set to `inline-static`, author the mock response data that the inline `code` returns.

> **When backend stages run** (`acxd-platform-poc`, `acxd-usecase`, `acxd-platform`): the `mock/data/<operation>.json`
> files are authored in backend-build. Here you simply inline their contents into the `code` string at
> creation time, reproducing each file's contents exactly as authored.
>
> **When backend stages are skipped** (`acxd-poc`): there is no backend-build to produce the data files, so
> author them here. This keeps `acxd-poc` static mocks fully self-contained.

For each static data request in `acxd-poc`:

- Create `mock/data/<operation>.json` with **3 example response patterns** keyed by a request parameter
  (e.g. account number / phone), plus a `_default` fallback. Every field must match the response schema
  (flat, bare value object, ACXD-contract-compliant).
- Keep the data realistic enough to demonstrate a natural conversation (e.g. a "found" customer, a
  "not found" customer, and an edge case), and mark the file header `[MOCK CONTENT]`.
- Inline the file's contents into the `inline-static` `code` string (the `MOCK_STATIC_CODE.<operation>`
  constant) so the data request is self-serving inside ACXD's runtime — no external file read at runtime.
- Keep all mock data in the `mock/` folder, separate from any production content.

### Step 4: Author Slot Types (`resources/slot-types.json`)

For each custom entity type:

Author into `resources/slot-types.json`; the engine's `create-slot-types.ts` emitter sends each and derives a
deterministic `valueId` per value (`<slotTypeId><ValuePascalCase>`) unless you set one. **Shape:** author to
`SlotTypeDef` (+ `SlotValueDef`) — see its `@example` in `acxd-sdk-idl.ts` (PART A). `slotTypeId` is bare
camelCase, letters only.

- Include synonyms for voice channel accuracy.
- Slot types are named for the use case or the value they hold (camelCase, no hyphens).
- Custom slot type tokens are referenced WITHOUT the `NLX.` prefix (that prefix is for built-in types only).

### Step 5: Author Knowledge Bases (`resources/knowledge-bases.json`)

For each knowledge domain:

Author into `resources/knowledge-bases.json`; the engine's `create-knowledge-bases.ts` emitter creates each
and PUBLISHES it (a KB is invisible to flows until published). **Shape:** author to `KnowledgeBaseDef` — see
its `@example` in `acxd-sdk-idl.ts` (PART A). `type` is `articles` | `documents`; `publish` defaults true.

- One KB per knowledge domain — do not combine product docs and policy docs.
- Plan ingestion approach: articles (curated FAQ), documents (product/policy bulk), external (live source).
- **Answer mode — verbatim vs summarised (per-KB setting) `[CONSOLE-VERIFIED]`:** a KB can return an
  article's answer **verbatim** or let the model **summarise** it into the conversation. Choose **verbatim**
  for anything with a compliance edge — a coverage definition, a fee, a regulated disclosure — so the wording
  legal approved reaches the caller unchanged. **Summarise** reads more naturally for general how-it-works
  content. This is a decision for the content owner; surface it when creating each KB (capture it in the
  guardrails/compliance step for regulated content).

**Knowledge bases are published by the engine before flows are created.** `[CONSOLE-VERIFIED]` The engine's `create-knowledge-bases.ts` emitter publishes each KB automatically after create (it uses the
captured `knowledgeBaseId` from the create response) — you author `"publish": true` in the JSON, you do NOT
call publish yourself. (Implementation note, VERIFIED: PublishKnowledgeBase uses the SHORT `knowledgeBaseId`
field, NOT `knowledgeBaseIdentifier`.)
A KB is invisible to flows until published. Publish after every content change — articles added, documents
updated, or sources refreshed. An unpublished KB will not cause an error during flow creation, but the
flow's KB tool will return no results at runtime.


### Step 5b: Synthetic Knowledge Base Content (Mock Mode)

If the knowledge base is marked Mock in the integration inventory OR the customer doesn't yet have
knowledge base content ready, generate synthetic content for testing:

**For Q&A knowledge bases:**
- Generate 15–30 realistic Q&A entries covering the use case domain
- Format as importable Q&A entries matching the ACXD KB format
- Example: "What does comprehensive cover include?", "How do I make a claim?", "What's the excess?"

**For Document knowledge bases:**
- Generate 3–5 synthetic markdown documents covering the product/service domain
- Example: product disclosure summary, coverage comparison table, claims process guide

**Mark all synthetic content with `[MOCK CONTENT]`** in the document header so it is clearly identifiable
as placeholder content for testing. Synthetic content should be realistic enough to demonstrate a natural
conversation flow but must be replaced with real content before production deployment.

**Where the content goes, and how it is loaded (the deploy engine loads it — no manual console upload).** Write
each KB's content into its own folder under `resources/kb/<kbName>/` and set that folder as the KB's `content`
field in `resources/knowledge-bases.json` (path relative to the deploy config, e.g.
`{ "name": "coverageKb", "type": "documents", ..., "content": "resources/kb/coverageKb" }`). The engine loads the
folder after creating the KB and re-publishes it:
- **`documents` KB:** one file per document, `.md`, `.txt`, `.pdf` or `.html` (each is uploaded as one document,
  document id = file name).
- **`articles` KB:** one or more `.json` files, each an array of `{ "question": "...", "answer": "..." }`
  entries (each entry becomes one article).
Put nothing else in the folder. One folder per KB, so the engine never has to guess which file belongs to which
knowledge base. Operational Readiness copies `resources/kb/` into the distribution folder with the rest of
`resources/`.

### Step 5c: Author Guardrails (`resources/guardrails.json`)

Author the guardrails the customer SELECTED in CX Discovery (the input/output guardrail menus). Guardrails protect the DEPLOYED customer conversation;
they do not protect this build agent from untrusted text in `customer-context/` documents (that is Kiro's tool
approvals and the human review at each gate). A guardrail is
a GLOBAL resource, NOT a flow node — it has no exits and never appears in a flow graph. The engine's
`create-guardrails.ts` emitter creates each one; the application then references it by id. **Shape:** author to
`GuardrailDef` — see its `@example` in `acxd-sdk-idl.ts` (PART A). A ready-made baseline is shipped at
`{{HARNESS_DIR}}/tools/acxd-deploy-engine/reference/guardrails.example.json` (input prompt-injection +
off-topic; output no-regulated-advice + a value-must-be-present PII read-back check, all FLAG not mask) —
copy and adapt it to the discovery selections.

- **Author ONLY what the customer selected.** Guardrails are never applied silently — discovery presents a
  menu-to-confirm and the customer opts in. Author exactly those; do not add guardrails they did not choose.
- **Detection method:** prefer `llmJudge` (portable) and `keyword`; use `regex` ONLY for a CUSTOMER-SUPPLIED
  pattern for a fixed-format identifier they gave you. NEVER ship or invent a regex for PII such as card
  numbers, driver's licences or registrations — those formats vary by country and a guessed pattern misfires.
- **Description length — one tight sentence.** The guardrail `description` AND each rule `description` must be
  <= 100 characters (live limit; the deploy FAILS on anything longer). Field-length maxima are NOT uniform
  across resources (e.g. an analytics-tag description caps at 64) — the authoritative per-field table is in
  `acxd-sdk-idl.ts` (FIELD-LENGTH LIMITS), enforced by the engine at pre-flight from `lib/length-limits.ts`.
  Write a single purposeful sentence, not a paragraph, and you will never approach any cap.
- **PII-detection prompt rule (value-must-be-present):** when a PII-detection `llmJudge` prompt is authored
  (input OR output), it MUST fire only when an ACTUAL private value is present — never on a mere mention or a
  request for a field by name (otherwise the guard masks the assistant's own request, e.g. "Can you provide your
  Account ID?"). Generalise beyond specific factors (do not name "PIN" alone — say "second factor identifier").
  Default wording to adapt: *"Does the response expose an account number, password, OTP or other second factor
  identifier, or other personal data? Answer No if only a description or request for details is found and no
  actual personal or private values are present. Answer yes or no."* The shipped example's `NoPrivateValueReadback`
  rule already follows this — keep the value-must-be-present clause whenever you adapt or rewrite it.
- **PII redaction** (a `mask` rule) carries the standing caveat: it may hide information the model legitimately
  needs. Author it only where the model does not need the value. See the **PII Handling** principle (Principle 8) in `acxd-architecture-principles.md`.
- **Attach them to the application:** list the guardrail NAMES in the deploy config's `application.guardrails`
  array (the engine resolves each name to its id and writes `settings.guardrails:[{ guardrailId }]`). An input
  and an output guardrail are both just names in that list.
- If the customer selected no guardrails, omit `resources/guardrails.json` and the `application.guardrails`
  array entirely (the engine treats guardrails as optional).

### Step 6: Author Flow References (`flows/*.flow.json` + config)

**This stage does NOT author flows.** Flows are authored in the next stage (Flow Authoring) as declarative
FlowSpecs (`flows/specs/<flowId>.flowspec.json`) and BUILT into `flows/<flowId>.flow.json` by the Flow DSL —
never hand-written here or there. In THIS stage you only fix the flow ORDER in `acxd-deploy.config.json`. The
notes below describe the emitted `.flow.json` the engine consumes, for reference. The engine's `create-flows.ts`
emitter creates them in the config's `flows.order` (Redirect-target flows first, then the flows that redirect to them), applying its
fixups/guards before sending. Each document is top-level
`flowId`, `aiDescription` (non-empty — an empty one deploys but is silently unreachable), `slots[]`, and the
`nodes` map. Example authored order (in `acxd-deploy.config.json`):
```json
{ "flows": { "dir": "flows", "order": ["billingEscalation", "billingMain"] } }
```

- The flow JSON shape (node ids, node types, edges, names) is produced and checked by the Flow DSL in Flow
  Authoring; nothing about it is authored here. Flow names are camelCase letters only (`billingMain`).

### Step 7: Author the Application Block (`acxd-deploy.config.json`)

> **🛑 DO NOT author `acxd-deploy.config.json` from scratch — COPY THE SHIPPED TEMPLATE and fill it in.**
> The engine reads this file with strict `JSON.parse`, and hand-authoring its shape has repeatedly
> produced deploy crashes (`project undefined`, `The "path" argument must be ... Received undefined`)
> from wrong field names. A deterministic template ships with the engine — copy it, then replace the
> `{{PLACEHOLDERS}}` only. **Never rename a key.**
>
> ```bash
> # from the record dir (config sits beside its resources/ and flows/ siblings)
> cp {{HARNESS_DIR}}/tools/acxd-deploy-engine/acxd-deploy.config.template.json ./acxd-deploy.config.json
> # then replace every {{PLACEHOLDER}}; leave the resources/* and flows/ paths exactly as shipped
> ```
> - Template: `{{HARNESS_DIR}}/tools/acxd-deploy-engine/acxd-deploy.config.template.json` (pure-JSON skeleton, correct-by-construction keys)
> - Filled example: `{{HARNESS_DIR}}/tools/acxd-deploy-engine/acxd-deploy.config.example.json`
> - Field guide: `{{HARNESS_DIR}}/tools/acxd-deploy-engine/acxd-deploy.config.README.md`
>
> **Exact field names — the traps that have crashed deploys (use LEFT, never RIGHT):**
>
> | Correct | Wrong | Why |
> |---|---|---|
> | `project` | `projectName` | engine reads `cfg.project` → wrong name = `project undefined` |
> | `resources.contextVariables` | `contextVars` | engine reads `cfg.resources.contextVariables` → wrong name = `readFileSync(undefined)` crash |
> | `defaultFlows.welcome: "flowId"` (STRING) | `{ "flowId": "..." }` (object) | engine wraps the string as `{ flowId }` itself |
> | top-level `workspace: { name }` | *(omitted)* | required block |
>
> **Not in this file:** application settings (language, TTL) come from `.env` `ACXD_APP_*`; secret VALUES
> live in `.env`/secret store (the config only points at `resources/secrets.json`).
> **Validate the filled config with the deterministic check — do NOT hand-roll a structural check.** Run:
> ```bash
> npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/validate-config-cli.ts ./acxd-deploy.config.json
> ```
> This runs the SAME `validateConfig` the deploy engine runs, so a pass here is identical to the deploy-time
> gate (no `jsonschema` needed, no manual shape comparison). It also runs the engine's description-length
> pre-flight over the resource files the config points at (`descriptions within ACXD length limits`). It
> prints `config valid` or the exact offender list. Fix any offender and re-run until clean, before the gate. If the command cannot run (e.g. `tsx` is
> not available in the environment), log an `environment-gap` dev observation (what was missing, how you
> proceeded) rather than silently falling back to a by-eye check.


Author the `application` block of `acxd-deploy.config.json` — name, attached flows, `defaultFlows`
(the **`welcome`** default is REQUIRED once flows are attached), and settings. The engine's
`ensure-application.ts` sends the create call; you author only this block. Illustrative values (neutral domain):

```json
"application": {
  "name": "northwindEnergyBillingApp",
  "description": "Billing assistant | Flows: 2 | Env: dev | Owner: Platform Team",
  "defaultFlows": { "welcome": "billingMain", "fallback": "billingMain", "unknown": "billingMain", "escalation": "billingEscalation" },
  "guardrails": ["inputSafety", "outputPrivacy"]
}
```

- For platform engagements: one application per environment (dev, staging, prod).

**Do NOT author a `.env` or `.env.example` in this stage.** The engine ships the one complete template
(`{{HARNESS_DIR}}/tools/acxd-deploy-engine/.env.example`), and Operational Readiness copies it into the
distribution root. Record the values the agent knows (region, `projectName`, workspace/application names) in
the deploy config and the stage summary; the snapshot `.env` is pre-filled from them later.

**Workspace & application NAMES are user-configurable in `.env` (not baked into config).** Derive them
DETERMINISTICALLY from the canonical `projectName` (captured in CX Discovery) with a role suffix —
`<projectName>Workspace` and `<projectName>App` (e.g. `northwindEnergyBillingWorkspace`,
`northwindEnergyBillingApp`). Do NOT invent a free-standing use-case name (e.g. `billingWorkspace`) —
that diverges from the `platform-config-spec` and forces a late reconciliation. Use the SAME projectName-derived
value for the config `name` fields and **seed them as the DEFAULT values of `ACXD_WORKSPACE_NAME` and
`ACXD_APPLICATION_NAME` in `.env`** — so the user can rename either before deploy without touching the config or
code. (Watch the 36-char workspace-name cap for long project names.) The engine resolves the create-time
name as `ACXD_WORKSPACE_NAME` / `ACXD_APPLICATION_NAME` (if set) else the config `name`. The ID-vs-NAME model
is mutually exclusive per resource: `ACXD_WORKSPACE_ID` / `ACXD_APPLICATION_ID` set = REUSE an existing one
(the NAME is ignored); blank = CREATE a new one from the NAME, and the engine writes the new id back to the
`*_ID` line. Keep the config `application.name` as a fallback default, but the authored `.env` NAME is the
value the user edits.

### Step 7b: How the engine consumes these artifacts (no per-run scripts)

This stage authors **declarative data only** — the `resources/*.json` files and the `application` block of
`acxd-deploy.config.json`. It does **not** create an `sdk/` folder, a `package.json`, or a
`create:resources` runner — and it does **not** create an `acxd-sdk/` folder or touch the engine. Author the
JSON as ordinary stage artifacts in the record dir (config beside its `resources/`/`flows/` siblings). The
shipped deterministic deploy engine later reads these JSON files and does workspace → resources → flows →
application in one command (Build + Deploy are a manual console step — the engine does not build or deploy).

> **On the `produces` slugs.** This stage's frontmatter declares `acxd-sdk-resource-scripts` and `acxd-resource-inventory`. Despite its legacy name, `acxd-sdk-resource-scripts` is NOT a set of hand-written SDK scripts (this stage forbids those) — it denotes the **authored declarative resource set** (`resources/*.json` plus the `application` block of `acxd-deploy.config.json`). The slug is retained because the engine's produces/consumes contract keys on it; read it as 'the declarative resource set' wherever it appears.

Verify the artifacts you authored are complete and well-formed before the gate:

- `resources/context-vars.json`, `analytics-tags.json`, `secrets.json`, `slot-types.json`,
  `data-requests.json`, `knowledge-bases.json` — each present if that resource type is used, valid JSON,
  camelCase identifiers, verbose descriptions.
- `acxd-deploy.config.json` — points at the files above and the `flows/` dir, and carries the `application`
  block with its required `defaultFlows.welcome`. Validate it against
  `{{HARNESS_DIR}}/tools/acxd-deploy-engine/acxd-deploy.config.schema.json`.

The engine is actually run later, in the Build & Deployment stage (`acxd-build-deploy.md`), after Operational
Readiness (Step 9b) has assembled the self-contained `acxd-sdk/` deployable (engine + config + `resources/` +
`flows/`) into the distribution snapshot. That stage owns the exact run command and `.env` handling. This
stage does not create `acxd-sdk/` and does not run the engine.

### Step 8: Populate Resource Inventory Manifest

Write `acxd-resource-inventory.md` — the authoritative catalogue of all ACXD resources:

| Resource | Type | Name | ACXD Description (≤200 chars) | Full Description | Consumers | Owner |
|----------|------|------|-------------------------------|------------------|-----------|-------|

This manifest is the single source of truth for resource discovery by future teams.

### Step 9: Brownfield Safety (Enhancement Scope)

For `acxd-enhancement` engagements on existing platforms:
- Before creating any resource, query the workspace for existing resources of the same type and name.
- If a matching resource exists, log it and skip creation.
- If a similar resource exists (different name, same purpose), flag for human review.
- Update the resource inventory manifest with both existing and new resources.

### Step 10: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-resource-creation --result awaiting-approval`.

### Step 11: Present Completion & Request Approval

Review path: this stage's engine-resolved record dir.

Present all generated scripts and the resource inventory for review.

**Design changes made during build (MANDATORY section: a failed check is a design defect, never drop behaviour to pass it):** list every behavioural change made in this stage (what changed, why, effect on the customer outcome), or state "None". Mechanical reconciliations do not belong here.

**Handoff line (include it in the completion message, verbatim):** "Next: Flow Authoring. Flows are authored
as declarative FlowSpecs (`flows/specs/<flowId>.flowspec.json`) and built with `build-specs.ts`. No flow or
node JSON is hand-written."
Standard 2-option approval (Approve / Request Changes).
STOP for the human response. Report Approve with
`--result approved --user-input "<exact choice>"`; report
Request Changes with `--result rejected --user-input "<feedback>"`, revise the
artifacts, then report `--result revised` before re-presenting.

## Exit criteria

Checked by code when the approval gate opens; the gate stays closed until each passes. Fix the cause, not the check.

- run: `cd {{HARNESS_DIR}}/tools/acxd-deploy-engine && { [ -d node_modules ] || npm ci --silent; } && npx --yes tsx validate-config-cli.ts "<record>/acxd-deploy.config.json"`

## Learn

While running this stage, record observations in the engine-created
`<record>/<phase>/<stage>/memory.md`. Treat it as an output-only target:
never read, probe, create, or initialize it. Follow the active harness's
diary-write discipline: add entries through the stage's review-step ritual
(NOT by hand-editing `memory.md`) — the ritual records them under Interpretations,
Deviations, Tradeoffs, and Open questions, each with an ISO 8601 timestamp.

Record an entry only when a **genuine insight arose while running this stage** — a platform constraint you discovered, a non-obvious tradeoff you weighed, a workaround you found, or something that behaved unexpectedly and how you resolved it. These are the observations worth carrying to a future run.

The configuration and settings the user selected during the stage are captured in the stage artifacts and belong there — a restatement of a chosen engagement pattern, an authoritative SoP, a scope, or any selected option is a record of the decision, not a learning, so leave it out of `memory.md`. Most runs produce nothing worth recording under Interpretations, Deviations, or Tradeoffs; an empty stage memory is the normal, expected outcome.
