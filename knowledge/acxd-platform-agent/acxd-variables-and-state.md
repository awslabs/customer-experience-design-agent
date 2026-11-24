# ACXD Variables, State, Naming & Tagging

Authoritative reference for ACXD variables, slots, state modifications, the naming rule, resource tagging, and
workspace quotas. Governed by `../KNOWLEDGE-ARCHITECTURE.md`.

Every fact carries a source tag — **[CONSOLE-VERIFIED]** / **[DOC]** / **[NEURA]** / **[SPECIALIST]** / **[SDK]**.
Untagged = ungrounded. On conflict: [CONSOLE-VERIFIED] > [DOC] > [NEURA] > [SPECIALIST] > [SDK].

> **⚙️ READ FIRST:** variables, slots, and secrets are declared as **declarative resource JSON**
> (`resources/*.json`) consumed by the shipped deploy engine — you do NOT hand-write SDK calls. Exact shapes
> live in `acxd-sdk-idl.ts`; this file owns semantics, scope, naming, and tagging, and points at the IDL for
> shapes.

## Variable types & scope [DOC]

Pick the variable type by how far the value must travel: within a flow, across flows, or to Connect.

| Type | Scope | Use for |
|------|-------|---------|
| **Slot** | Flow-local (attached to the flow) | Values captured from the user (dates, names, selected options) via user_choice |
| **Define (local)** | Flow-local | A value created/held inside the current flow (e.g. a constant to seed a number/boolean) |
| **Data request** | Flow-local (the producing flow only) | A field returned from an external system, read as `{variableId.field}` |
| **Context** | Cross-flow, whole session | Values that must persist across flows or cross the Connect boundary |
| **System** | Built-in, read-only | Channel, conversation id, latest utterance, language, user id — prefixed `System.` |
| **MCP input** | Provided by an agentic node calling a flow-as-tool | Values an agent collected before invoking a structured flow |
| **Secret** | Workspace-level | API keys / credentials used in integrations |

**Key `System.*` variables** (built-in, read-only; reference as `{System.<name>:NLX.System}`) [DOC]:

| System variable | Value |
|---|---|
| `System.capturedIntent` | the last classified intent name |
| `System.isVoice` | boolean — true on the voice channel |
| `System.channelType` | `voice` / `chat` / `livesync` |
| `System.currentFlowName` | the active flow's name |
| `System.utterance` / `System.transcript` | the latest caller utterance / the conversation transcript so far |

**The scope rule that bites:** only **context** variables cross a flow boundary. Slots, locals, and data-request
outputs are flow-scoped — to use a value in a flow reached by redirect, promote it to a context var in the
PRODUCING flow (`setContext(ctxX, fieldRef('request.field'))`) then read `{ctxX:NLX.Context}` downstream.
[CONSOLE-VERIFIED]

## When to set a context variable [DOC]

Set a context variable when the value must remain available after the conversation moves to other flows, is
tracked across flows (counters, boolean gates), or should pass to a human on escalation — e.g. authentication
status, customer profile, account type, last utterance/transcript.

## Slots — built-in vs custom [CONSOLE-VERIFIED]

- `slots[]` entry: `{ name, type, examples, sensitive, aiDescription }`. Attachment is via `slots[]` (this is
  what attaches a slot to the flow), NOT via node-level ids. [CONSOLE-VERIFIED]
- **Built-in slot types carry the `NLX.` prefix**; the only one ACXD accepts is `NLX.AlphaNumeric` (a number is
  captured as text); **custom slot type ids are
  bare camelCase** (`xxProductLine`, `xxYesNo`). [CONSOLE-VERIFIED]
- Slot capture is done by a `user_choice` node (see `acxd-node-reference.md` for the two verified capture
  shapes). Slot values persist per session — `clear` a slot before re-asking. [CONSOLE-VERIFIED][DOC]
- **`NLX.FreeText` is NOT honoured** — use `NLX.AlphaNumeric` for free-text capture. [CONSOLE-VERIFIED]
- Custom slot enumerated values carry a deterministic client-set `valueId = <slotTypeId><ValuePascalCase>`
  (e.g. `xxYesNoYes`), referenced directly in per-value branches. [CONSOLE-VERIFIED]

## State modifications [CONSOLE-VERIFIED][DOC]

`set` / `clear` / `increment` / `decrement` (+ push/pop) on a context/slot/local var. Key rule:
- **No "set a literal number/boolean" operand.** To set a number/boolean context var from a literal, `define` a
  local (`{type:"constant", value:0|true}`) then set the context var from `{type:"local", name}`. Setting a
  number/boolean var directly from a `constant` is rejected ("expected number/boolean, but got string").
  [CONSOLE-VERIFIED] The DSL `setNumber`/`setBoolean` setters emit this define-local pattern automatically.
- Set a context var from a data-request field via `variableRef(variableId.field)` → `{type:"variable", name:"variableId.field"}`. A `type:"field"` read carries a redaction wrapper (the value arrives as `<<<...||redact>>>`), so always use `type:"variable"`. [CONSOLE-VERIFIED]

## Variable reference syntax [CONSOLE-VERIFIED]

Inside message bodies and constant string values, reference a value as `{name:NLX.<Kind>}` where Kind
disambiguates: `NLX.Context` (context var), `NLX.Local` (local), `NLX.<slotTypeId>` (a slot — the slot type id,
no NLX prefix for custom types e.g. `{usage:xxYesNo}`), `NLX.AlphaNumeric` etc. (built-in slot), `NLX.Secret`
(secret in a data-request URL). [CONSOLE-VERIFIED]

## Naming — camelCase-only, ONE enforced exception [CONSOLE-VERIFIED]

**Every authored identifier is camelCase, letters only — no digits, hyphens, underscores, or colons. NO
EXCEPTIONS, never left to agent discretion.** Applies to: flow ids, slot type ids, context var names, analytics
tag labels, exit condition names, authored split-matched values. ACXD silently strips illegal characters in
some fields (breaking references) and rejects them loudly in others — camelCase-only avoids the whole class.
[CONSOLE-VERIFIED]

**No digits — the hard rule is letters-only.** A digit anywhere in an authored identifier is rejected by ACXD
with an opaque error ("… is not in the expected format" for a context var / key; "flowId is not in the expected
format" for a flow id). ACXD does NOT require any particular substitute — it only requires the name to be
letters-only. Rename however reads best; e.g. for "last 4 digits of the account number":
`accountLastDigits` or `accountSuffix` (drop the number — often cleanest), or `accountNumberLastFour` (spell it
out). Any is fine. The deploy engine's pre-flight (`assertLegalAcxdName` / `assertLegalFlowId`) fails loudly on
a digit BEFORE any AWS call. [CONSOLE-VERIFIED]

**The ONE exception — the Workspace/Application NAME.** The defaults are `<projectName>Workspace` and
`<projectName>App` (e.g. `northwindEnergyBillingWorkspace`, `northwindEnergyBillingApp`), seeded into `.env` as
`ACXD_WORKSPACE_NAME` / `ACXD_APPLICATION_NAME`, which the user may edit. These names are not identifiers, so they
may carry spaces and punctuation: `WorkspaceName` allows `^[A-Za-z0-9 ,.'-]+$` (1–36 chars) and `ApplicationName`
allows `[A-Za-z0-9 _-]` (1–100 chars). [SDK-MODEL]
- **Environment is not a discovery question.** It comes from `.env` `ACXD_ENVIRONMENT` (default `dev`) and names
  the CDK stacks (`acxd-<projectName>-<env>-...`). In a multi-environment engagement, Platform Configuration sets
  one workspace per environment by overriding `ACXD_WORKSPACE_NAME` per `.env`.

## Resource tagging — TWO layers [NEURA][SPECIALIST]

**Two completely separate tag concepts — never conflate:**
- **ACXD resource tags** = a flat array of ≤5 plain STRING labels (≤256 chars each) for builder
  organization/search within a workspace. Top-level `tags` on Workspace; nested `metadata.tags` on Application/
  Flow/DataRequest/KnowledgeBase/SlotType/ContextVariable/Secret. [NEURA]
- **ACXD analytics tags** = conversation-milestone labels applied to NODES (e.g. generative_journey), recorded
  against a live conversation for analytics — a DIFFERENT thing, owned by analytics, not resource management.
  These are the `metadata.tags:[{label}]` node tags. [NEURA]
- **AWS resource tags** = standard `{key:value}` tags on the underlying AWS resources (API GW, Lambda, CDK
  stacks) — ARN-scoped, IAM/cost-allocation-aware. [SPECIALIST]

**Two-layer tagging pattern (apply everywhere a resource supports it):**
1. **ACXD resource string-tags** — add the environment label (`DEV`/`TEST`/`PROD`) + optional user-defined
   labels to every taggable ACXD resource's `tags` array. [NEURA]
2. **AWS/CDK key/value tags** — add `{env: DEV|TEST|PROD}` + optional user-defined `{key:value}` tags to every
   CDK-created AWS resource. [SPECIALIST]

A single discovery question captures the environment (reuse the naming Environment answer) + optional
user-defined tags once, applied to both layers appropriately. Tagging is core AWS operational hygiene
(monitoring / cost / governance). Do not editorialise to customers about what tags govern — they decide how
tags are consumed. [NEURA]

## Secrets [CONSOLE-VERIFIED]

Secrets are created programmatically by the deploy engine via `CreateSecretCommand`, values sourced from `.env`
(one base URL and credential per API, e.g. `BILLING_API_URL` / `BILLING_API_KEY`, written by the API wiring tool) — no manual console step. **Two namespaces, do not conflate:** the ACXD **secret name** is an authored identifier and follows the universal camelCase-letters-only rule (`billingApiUrl`, `billingApiKey`), and is what you reference as `{billingApiUrl:NLX.Secret}`. The **`.env` variable** that holds the value is an OS environment variable and keeps its SCREAMING_SNAKE form (`BILLING_API_URL`). The `SecretDef` maps the two via its `name` (camelCase) and `envVar` (SNAKE) fields — they are deliberately independent, so the camelCase rule has NO secret exemption. Referenced in a data-request URL
as `{secretName:NLX.Secret}`. Field name is `secretValue` (+ `isSensitive`). [CONSOLE-VERIFIED] Detail on
data-request/secret usage is in `acxd-integrations.md`; exact shape in `acxd-sdk-idl.ts`.

## Workspace quotas [CONSOLE-VERIFIED]

A workspace has a finite **intents / flow-count** quota — each flow ≈ one intent. Symptom on import: **"You
exceeded the limit of intents items."** This is a capacity limit, NOT a shape error. Mitigation: delete stale
flows or use a fresh workspace — not a code change. Test workspaces fill up across PoC runs. [CONSOLE-VERIFIED]


## Description field discipline [CONSOLE-VERIFIED]

Every ACXD resource carries a verbose description following the template **What / Inputs / Outputs / Consumers / Owner**.
ACXD enforces a **200-character** limit on `description` and `aiDescription` (64 for analytics-tag `description`).
Author a truncated ≤200-char version for the ACXD field (front-load the "What"); keep the full description in the
resource inventory manifest (`acxd-resource-inventory.md`). The deploy engine truncates ASCII-safe as a safety net.
