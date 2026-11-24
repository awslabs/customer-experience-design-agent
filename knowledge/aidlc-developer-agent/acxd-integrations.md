# ACXD Integrations

Authoritative reference for connecting ACXD to external systems: Data Requests, backend tiers, mock options,
IaC, security, and environment isolation. Governed by `../KNOWLEDGE-ARCHITECTURE.md`.

Every fact carries a source tag — **[CONSOLE-VERIFIED]** / **[DOC]** / **[NEURA]** / **[SPECIALIST]** / **[SDK]**.
Untagged = ungrounded. On conflict: [CONSOLE-VERIFIED] > [DOC] > [NEURA] > [SPECIALIST] > [SDK].

> **⚙️ READ FIRST:** Data Requests and their backing infra are authored as **declarative resource JSON** +
> **CDK** consumed by the shipped deploy engine — you do NOT hand-write SDK calls. The engine creates the Data
> Request resources; CDK provisions any backend. Exact Data Request shape is in `acxd-sdk-idl.ts`; this file
> owns the integration MODEL (when to build what, and how to wire it).

## What an integration is [DOC]

Integrations connect ACXD to external tools/data. Configured as **Data Requests**. Use one when the conversation
must retrieve real-time info, send data, trigger an action, authenticate a user, or return dynamic data. [DOC]

## Data Request — implementation types [DOC]

| Implementation | What it does | Use when |
|---|---|---|
| **External endpoint** | Calls an external API/webhook | Real data: customer profile, order status, availability |
| **Static response** | Returns a predefined response inside the ACXD runtime (no backend) | Prototyping before the API is ready; unchanging data; a mock |
| **MCP** | Connects to an MCP server, syncs its tools | An MCP server exposing validation/lookup/workflow tools |

**How a Data Request is triggered in a flow** [DOC]:
1. **Data request node** — deterministic: the flow calls it at an exact point (see `acxd-node-reference.md`).
2. **Agentic tool** — the Data Request is attached to an agentic node as a tool; the agent decides when to call.

## The Data Request contract [CONSOLE-VERIFIED]

**Two things share the name "Data Request" — keep them distinct:**
- **Data Request Resource** — the workspace resource that DEFINES the call: method, URL, headers, and the
  `requestSchema`/`responseSchema` body models. (SDK/code identifiers: `DataRequestDef`, `dataRequestId`.)
- **Data Request Node** — the flow node that CONSUMES a Resource at a point in a flow: it binds the Resource
  by `variableId`, supplies `urlParams` and/or a JSON request body (`payload`) plus `headers`, and exposes the
  success/timeout/failure exits. (Wire/code identifiers: `type:"data_request"`, the `dataRequest()` DSL
  factory, the `dataRequests:[...]` binding.)
The Resource says WHAT the call is; the Node says WHEN it runs and WITH WHICH values. The code identifiers
above are the SDK/wire contract and do not change — only this prose distinguishes the two senses.


- **Three transfer channels, usable on any method (GET/POST/PUT/PATCH/DELETE):** (1) URL params — query string
  and/or path segments, supplied by the node's `urlParams` token map; (2) `headers`; (3) a JSON request body —
  DESCRIBED by the Resource's `requestSchema` and SENT by the node's `payload`. **Request bodies may be nested**
  (objects and arrays); responses may be nested too (only fields a flow reads must be top-level). GET commonly
  uses URL params plus a response model; POST/PUT/PATCH commonly send a JSON body. Follow the API's contract.
  For contracts we generate (mocks), PREFER a flat JSON body for writes and sensitive inputs and URL params for
  reads — a preference for simplicity, not an ACXD limitation.
- **Webhook URL lives in `webhook.environments.{production,development}.url`**, NOT a bare top-level `url` — the
  runtime only substitutes `{placeholder}` tokens when the `environments` map is present (a bare url leaves the
  literal `{param}` → 404). [CONSOLE-VERIFIED]
- **Placeholder resolution is by KEY PRESENCE:** `UNSUBSTITUTED_PLACEHOLDER` fires only when a URL `{placeholder}`
  has NO matching `urlParams` key; a key present-but-empty substitutes and sends (upstream may 400, but the
  request is sent). Divergent callers: keep every URL placeholder's key present in EVERY caller's urlParams. [CONSOLE-VERIFIED]
- **Identifiers are matched case-sensitively** — a wrong-case value can return 200-empty. [CONSOLE-VERIFIED]
- **Native Dev/Prod endpoints** — a Data Request has separate development and production endpoints. [DOC]

### Response shape — flat-read rule [CONSOLE-VERIFIED]
The **responseSchema CAN be nested / contain arrays** (e.g. a `policies` array of objects). The constraint is
narrower: a flow's `{dr.field}` reference resolves only a **top-level** field — so keep any field a FLOW reads
top-level in the response. Nesting is fine for data the flow does not directly read. [CONSOLE-VERIFIED]

### requestSchema / responseSchema are JSON Schema [CONSOLE-VERIFIED]
They are JSON Schema (`{type, properties}`), NOT a data sample. The console UI takes a sample; the SDK takes a
schema — opposite inputs. The engine derives the schema from the config sample at send time. [CONSOLE-VERIFIED]

## Backend tiers — direct vs adapter vs store [CONSOLE-VERIFIED]

Default to the LEAST infrastructure. The harness NEVER scaffolds a net-new system-of-record API.
1. **Tier 1 — Direct call (NO backend):** the external API already fits ACXD's contract (public or static-key
   auth, params-in-URL, a response whose flow-read fields are top-level, 200-on-business-failure). Just a Data
   Request + Secret — no code. [CONSOLE-VERIFIED]
2. **Tier 2 — Thin adapter (APIGW → Lambda → external system):** for auth translation, response reshaping,
   status normalisation, or private-VPC reach. Stateless; no data store. [CONSOLE-VERIFIED]
3. **Tier 3 — Adapter + justified store:** add a store ONLY for a real need — idempotency, cross-disconnect
   session state, a cache, or ACXD-side audit. DynamoDB is NOT a default. [CONSOLE-VERIFIED]

## Mock — TWO options [CONSOLE-VERIFIED][DOC]

Mocks are synthetic data for pre-production; shipped JSON, never a data layer.
1. **Static mock** — Data Request `implementation: static response`: a predefined response returned inside the
   ACXD runtime. Zero infra, no public interface, fastest — for demos. [DOC][CONSOLE-VERIFIED]
2. **Hosted mock** — Data Request `implementation: external endpoint` → the shipped fixed mock tool's minimal
   CDK stack (API GW + one Lambda + bundled `data/` JSON). Real interface, CloudWatch, testable against
   firewall/WAF — for dev heading to production. A backend deployed with synthetic data is nag-exempt (throwaway). [CONSOLE-VERIFIED]

**Both mock modes** keep mock data in external editable JSON with example patterns keyed by filter/path params +
a `_default`. The hosted mock is generated by the shipped **`acxd-mock-backend` tool** (agent authors only
`data/`, optional `ops/`, `mock.config.json`; does NOT hand-write the CDK/Lambda). Mock code lives in
`mock-integration/`, deleted when the live backend is ready. [CONSOLE-VERIFIED]

## Infrastructure as Code — CDK (TypeScript) [CONSOLE-VERIFIED]

- Backend infra is **CDK in TypeScript** (matching the SDK toolchain); **Lambda handlers are Python** (packaged
  as CDK assets via `Code.fromAsset`). [CONSOLE-VERIFIED]
- Three standalone CDK apps under `backend/`: `mock-integration/` (synthetic), `adapter-integration/`
  (template-with-guidance), `connect/` (the Amazon Connect contact flow + Agentic CX block). Each its own
  app.ts/package.json/cdk.json/tsconfig.json. [CONSOLE-VERIFIED]
- cdk-nag runs on `adapter-integration/` (real gating); the mock stack is genuinely nag-exempt. [CONSOLE-VERIFIED]
- **Region is pinned explicitly, never inherited from ambient defaults** — one region drives ALL resources
  (mock/adapter + Connect + ACXD SDK), co-located. `.env` `AWS_REGION` is the single source. [CONSOLE-VERIFIED]

## Connect ↔ ACXD wiring [CONSOLE-VERIFIED]

The Amazon Connect contact flow's **Agentic CX block** (`ConnectParticipantWithAgenticCX`) invokes the ACXD
application directly, wired by **Workspace / Application / Deployment-key (Alias)** — there is **no Lex bot to
provision** (Lex remains an internal orchestration layer). `SpeechRecognitionEngine: "AMAZON_AGENTIC_VOICE"`.
Escalation crosses back via the block's Escalation pathway reading `$.AgenticCX.ContextVariables.*`. Connect
deploys AFTER the ACXD SDK stage (it references ids the SDK creates). [CONSOLE-VERIFIED]

## Security [CONSOLE-VERIFIED][DOC]

- Sensitive values (API keys, tokens) → a **Secret** resource; reference in a Data Request header/URL as
  `{secretName:NLX.Secret}`. Mark sensitive fields/requests so values stay out of conversation logs. [DOC]
- Separate testing behaviour from production systems (Data Request dev/prod endpoints). [DOC]

## Environment isolation — MVP now, enterprise future [NEURA][SPECIALIST]

- **MVP / launch:** a Workspace per {use-case × environment} (dev/test/prod), with names set per environment in `.env`
  (see `acxd-variables-and-state.md` naming). [CONSOLE-VERIFIED]
- **Future enterprise:** Workspace = USE-CASE isolation; **AWS account** = ENVIRONMENT isolation, with separated
  access + data per environment. **Do not bake in anything that precludes account-per-env.** The `{Env}` tag is
  carried explicitly, so moving env isolation to accounts is a deploy-engine account/region change, not a
  flow-authoring change. [SPECIALIST]

## AWS resource tagging (governance layer) [SPECIALIST]

Apply standard AWS `{key:value}` tags — `{env: DEV|TEST|PROD}` + optional user-defined tags — to every
CDK-created AWS resource (API GW, Lambda, mock/adapter stacks). This is the real cost/monitoring/governance
layer (ARN-scoped, cost-allocation-aware), distinct from ACXD's string-label resource tags (see
`acxd-variables-and-state.md`). [SPECIALIST]

## MCP bridge (Pattern B) [DOC]

For tools exposed via an MCP server: a Data Request `implementation: MCP` syncs the server's tools; enable only
the tools the agent should use. An AgentCore Gateway can bridge a private tool surface. The MCP bridge path uses
a `/tools/<operation>` convention (distinct from the mock's stage-root routing). [DOC]
