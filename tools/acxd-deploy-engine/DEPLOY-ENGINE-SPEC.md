# ACXD Deploy Engine — Build Blueprint (finalized)

**Status:** APPROVED design — ready to build · **Date:** 2026-09-10 · **SDK:** `amazon-connect-acxd-sdk` (pinned in `package.json`)

A **pre-built, deterministic, tested** ACXD deployment engine shipped inside the plugin. The harness stops
writing orchestration TypeScript per run; it emits only **declarative JSON** (resource definitions + a config
manifest). The engine does create → settle → write-`.env` → continue for workspace → resources → flows →
application, then STOPS. **Build + Deploy are a manual, human-reviewed console step by the ACXD engineer —
the engine does not build or deploy** (a human review gate validates the created solution in the console
before it goes live; Build + Deploy are a manual console step. Production CI/CD automation is deferred,
recoverable from git history when built).

> All open items resolved with Dean (2026-09-10). This is the build spec.

---

## 1. SDK reality (grounds the design)

Verified against the installed SDK type definitions (`node_modules/amazon-connect-acxd-sdk/dist-types/`):

| Capability | SDK command | Returns | Notes |
|---|---|---|---|
| Create workspace | `CreateWorkspaceCommand{ name, tags? }` | **`workspaceId`** (synchronous) | No `GetWorkspace`/`ListWorkspaces` — none needed; id returned directly |
| Create application | `CreateApplicationCommand{ name, settings, flows?, description? }` | `Application` incl. **`applicationId`** (synchronous) | `settings` (ApplicationSettings) REQUIRED; no `GetApplication` — none needed |
| Build *(manual — not run by the engine)* | `CreateApplicationBuildCommand{ applicationIdentifier }` | `buildId` | Done in the ACXD console; SDK path optional/unverified at 0.1.0. If used: async → poll `GetApplicationBuildCommand` → `status` |
| Deploy *(manual — not run by the engine)* | `CreateApplicationDeploymentCommand{ applicationIdentifier, buildIdentifier, environment? }` | `deploymentId` | Done in the ACXD console; SDK path optional/unverified. If used: async → poll `GetApplicationDeploymentCommand` → `deploymentStatus`; env enum: development/qa/staging/production |
| Secrets | `CreateSecretCommand{ name, secretValue, ... }` | `Secret` | **CAN be created programmatically** — value from `.env`. Corrects the stale runbook claim. |
| Context vars / slots / data requests / KBs / analytics tags | `Create*Command` | resource id | synchronous; idempotent create (treat 409/500-dup as exists) |

**Synchronous vs async — the key design fact (confirmed with Dean):**
- **All create calls are synchronous** and return their id immediately. → **No polling loops for create.** After
  each create (workspace, application, and each resource type) the engine simply applies a **2s settle delay**
  so a freshly-created resource is consistent before the next step references it.
- **The engine performs only synchronous creates — it never polls.** Build and deploy (which are asynchronous)
  are NOT run by the engine; they are a manual console step. There is no polling anywhere in the engine.

---

## 2. Module layout (shipped in the plugin)

```
plugins/acxd/tools/acxd-deploy-engine/
├── main.ts                        ← orchestrator: load .env + config, run sequence
├── acxd-deploy.config.schema.json ← JSON Schema for the harness-authored config (validated at startup)
├── lib/
│   ├── client.ts                  ← makeClient() from .env (region + API token); shared send wrapper
│   ├── env-file.ts                ← readEnv(), writeEnvVar(key,val) — idempotent in-place .env update
│   ├── poll.ts                    ← pollUntil(fn, {intervalMs, backoff, maxIntervalMs, timeoutMs, success[], failed[]}) — build/deploy ONLY
│   ├── idempotency.ts             ← createIdempotent(label, fn, {treat500AsExists})
│   └── log.ts                     ← level-aware logging (ACXD_LOG_LEVEL: stages|objects|debug) + RESULT lines
├── steps/
│   ├── ensure-workspace.ts        ← .env WORKSPACE_ID set? use it : create → settle → writeEnvVar → return id
│   ├── ensure-application.ts      ← .env APPLICATION_ID set? use it : create(settings from .env) → settle → writeEnvVar → return id
│   ├── create-context-vars.ts     ← standalone; reads resources/context-vars.json; returns on completion
│   ├── create-slot-types.ts
│   ├── create-secrets.ts          ← secretValue from .env (per-API <API>_URL / credential, written by openapi-wiring); fails if unset
│   ├── create-analytics-tags.ts
│   ├── create-data-requests.ts
│   ├── create-knowledge-bases.ts  ← create + PUBLISH
│   └── create-flows.ts            ← reads flows/*.flow.json; Redirect-target flows first (cfg.flows.order)  (LAST engine step — build/deploy are manual)
├── test/
│   └── mock-client.ts + main.test.ts ← local test harness: mocked SDK client, asserts sequence/order/.env writes
└── package.json / tsconfig.json   ← deps: amazon-connect-acxd-sdk, dotenv; `npm run deploy` → tsx main.ts
```

**Design rules:**
- Every `steps/*` module is a **standalone unit**: one exported async function that does its job and **returns
  on completion** (workspace/app return their id; resource modules return a summary count). Each is
  independently runnable (`tsx steps/create-slot-types.ts`) for debugging.
- `main.ts` **awaits each module in sequence** with a **2s settle between steps**. **No per-task watchdog** —
  creates are synchronous. Only `build-application` and `deploy-application` poll, each with a bounded
  `timeoutMs` (default 15 min) that errors out rather than polling forever.
- Ids never hand-copied between processes; they flow **in-process** (return values) and are **persisted to
  `.env`** by `ensure-*` so re-runs and CI/CD pick them up.

---

## 3. The `.env` contract (starts fully declared, unset)

```dotenv
# ── Mandatory — user completes before running ──
ACXD_API_TOKEN=
AWS_REGION=

# ── Optional — populate to REUSE existing resources.
#    Leave blank and the deploy CREATES them and fills these in automatically. ──
ACXD_WORKSPACE_ID=
ACXD_APPLICATION_ID=

# ── ApplicationSettings — used ONLY when CREATING a new Application
#    (ignored if ACXD_APPLICATION_ID is set / reused). Edit as needed. ──
ACXD_APP_DEFAULT_LANGUAGE=en-US
#   examples (SDK supports ~90): en-US, en-GB, en-AU, es-US, es-ES, fr-FR, fr-CA, de-DE, pt-BR, ja-JP
ACXD_APP_SESSION_TIMEOUT_SECONDS=1800
#   idle session timeout (SECONDS) → engine converts to conversationTTL (MINUTES, max 1440=24h); 1800s → 30min
#   NOTE: channels are configured Connect-side (contact flow), not an ACXD ApplicationSettings field —
#   there is no ACXD_APP_CHANNELS knob. Voice provider selection (Amazon Connect agentic voice, etc.) is
#   set in the Amazon Connect Set Voice block, not here.

# ── APIs — one base URL and credential per API, written by openapi-wiring between these markers ──
# >>> acxd-apis (generated from the OpenAPI files by openapi-wiring; do not edit inside these markers by hand)
BILLING_API_URL=
BILLING_API_KEY=
# <<< acxd-apis

# ── Logging ──
ACXD_LOG_LEVEL=objects
#   stages = one line per object TYPE ("Creating context variables…")
#   objects = one line per object created ("✓ contextVariable ctxAuthenticated")  [default]
#   debug   = full detail: request params, responses, ids, poll ticks, settle delays
```

- **Presence = intent.** A populated `ACXD_WORKSPACE_ID` / `ACXD_APPLICATION_ID` means "reuse — do NOT create".
  Blank means "create it and write it back here".
- The engine **writes** `ACXD_WORKSPACE_ID` / `ACXD_APPLICATION_ID` back in place after creating them.
- **ApplicationSettings** are user-configurable here (only consumed when creating a new Application). The engine
  maps `ACXD_APP_DEFAULT_LANGUAGE` → `settings.languageCode` and `ACXD_APP_SESSION_TIMEOUT_SECONDS` →
  `settings.conversationTTL`. **`conversationTTL` is in MINUTES, max 1440 (24h)** `[VERIFIED —
  "settings.conversationTTL must be at most 1440"]`; the knob is authored in SECONDS so .env stays intuitive,
  and the engine converts seconds→minutes (round, min 1) and clamps to 1440. **SDK-VERIFIED (0.1.0):** the real `ApplicationSettings` fields are
  `languageCode` (enum), `languageCodes` (array), `defaultFlows`, `conversationTTL`, etc. — there is NO
  `defaultLanguage`, `channels`, or `sessionTimeoutSeconds` field. `ACXD_APP_CHANNELS` is NOT currently
  mapped (channels are not an `ApplicationSettings` field in this SDK version).
- **Default-behaviour flows** are set from `application.defaultFlows` in the deploy config (role → target
  flowId string; the engine wraps each as the SDK `{ flowId }` shape into `settings.defaultFlows`). **`welcome`
  is REQUIRED** once the application has attached flows — the API rejects it otherwise (`This application has
  flows but no default welcome flow`) `[VERIFIED]`. SDK roles: `welcome`/`fallback`/`unknown`/`escalation`
  (+ `frustration`/`help`/`repeat`/`resume`). Typical: `welcome`→the greeting/router flow, `fallback`+`unknown`→the
  main servicing flow, `escalation`→the escalation component.
- **Secrets** created programmatically from `.env` — no console hand-entry.

---

## 4. `acxd-deploy.config.json` — the ONLY orchestration input the harness authors

```jsonc
{
  "project": "northwindEnergyBilling",
  "workspace": { "name": "northwindEnergyBillingWorkspace", "tags": ["acxd-platform-poc"] },   // <projectName>Workspace — derive from project, do not free-invent
  "application": {
    "name": "northwindEnergyBillingApp",   // <projectName>App — derive from project
    "description": "ACXD application for insurance quotes"
    // settings are built from .env (ACXD_APP_*) at runtime — not hardcoded here
  },
  "settleMs": 2000,          // delay after each create / between resource TYPES
  "resources": {             // each a PATH to a declarative JSON file the harness wrote
    "contextVariables": "resources/context-vars.json",
    "slotTypes":        "resources/slot-types.json",
    "secrets":          "resources/secrets.json",        // names + which .env var holds each value
    "analyticsTags":    "resources/analytics-tags.json",
    "dataRequests":     "resources/data-requests.json",
    "knowledgeBases":   "resources/knowledge-bases.json"
  },
  "flows": {
    "dir": "flows",
    "order": ["billingEscalation","billingMain"]  // Redirect-target flows first
  }
}
```

- Resource files are the **same declarative shapes** the harness already authors (the `config/resources.ts`
  content, as data not code). `secrets.json` maps each secret name → the `.env` var holding its value.
- `flows.order` guarantees Redirect targets are created first, deterministically.
- There are no build/deploy/poll knobs — the engine provisions only; build + deploy are a manual console step.

---

## 5. `main.ts` orchestration (pseudocode)

```
load .env (dotenv);  cfg = validate(acxd-deploy.config.json against schema);  log = makeLogger(env.ACXD_LOG_LEVEL)
client = makeClient(env.AWS_REGION, env.ACXD_API_TOKEN)

// 1. WORKSPACE — presence = intent  (synchronous create; no poll)
workspaceId = env.ACXD_WORKSPACE_ID
if (!workspaceId) {
  workspaceId = await ensureWorkspace(client, cfg.workspace)   // create returns id
  writeEnvVar("ACXD_WORKSPACE_ID", workspaceId)
  await sleep(cfg.settleMs)                                    // 2s settle
} else log.stages("using existing workspace", workspaceId)
client = client.withWorkspace(workspaceId)

// 2. RESOURCES — dependency order (primitives → higher-order); synchronous; 2s settle between TYPES
await createContextVars(client, load(cfg.resources.contextVariables));  await sleep(settle)
await createSlotTypes(client, load(cfg.resources.slotTypes));           await sleep(settle)
await createSecrets(client, load(cfg.resources.secrets), env);         await sleep(settle)   // secretValue from .env
await createAnalyticsTags(client, load(cfg.resources.analyticsTags));  await sleep(settle)
await createDataRequests(client, load(cfg.resources.dataRequests));    await sleep(settle)
await createKnowledgeBases(client, load(cfg.resources.knowledgeBases));await sleep(settle)    // + publish

// 3. FLOWS — Redirect-target flows first, per cfg.flows.order  (synchronous)
await createFlows(client, cfg.flows);  await sleep(settle)

// 4. APPLICATION — presence = intent  (synchronous create; no poll)
applicationId = env.ACXD_APPLICATION_ID
if (!applicationId) {
  const settings = buildAppSettings(env)                      // from ACXD_APP_* vars
  applicationId = await ensureApplication(client, cfg.application, settings, flowRefs)  // create returns id
  writeEnvVar("ACXD_APPLICATION_ID", applicationId)
  await sleep(cfg.settleMs)                                    // 2s settle
} else log.stages("using existing application", applicationId)

// 5. DONE — engine stops after creating the application. Build + Deploy are a MANUAL console step
//    (review gate); the engine does not build or deploy.
emitResult({ workspaceId, applicationId, status: "provisioned (not built/deployed)" })
```

---

## 6. Terminal-status matching (only relevant to the OPTIONAL SDK build/deploy path — build/deploy are manual)

`GetApplicationBuild.status` / `GetApplicationDeployment.deploymentStatus` are typed `string`; the exact
terminal values aren't enumerated in the digest. `pollUntil` matches **case-insensitively** against a
configurable set:
- success: `["completed","succeeded","active","deployed","success"]`
- failed:  `["failed","error","cancelled","canceled"]`
Anything else → keep polling until `timeoutMs`. Exact strings get **pinned on the first live run** (the engine
logs the raw status at `debug`), then locked into config. This is the one behaviour needing live confirmation.

---

## 7. Logging (ACXD_LOG_LEVEL)

`lib/log.ts` exposes `log.stages()`, `log.object()`, `log.debug()`; every module logs through it.
- **stages** — one line per object TYPE and per phase (workspace/app/build/deploy).
- **objects** *(default)* — the above + one line per individual object created (✓/skip).
- **debug** — the above + request params, full responses, resolved ids, poll ticks, settle delays, and the raw
  build/deploy status strings (feeds §6 pinning). Sensitive values (secret values, PII) are never logged.

**Log level:** set `ACXD_LOG_LEVEL` (e.g. `debug`) to control engine verbosity. (The deploy config has no
`devMode` field — it was removed to avoid two switches for one word.) The plugin agent's dev-observability
(self-corrections logged to `acxd-dev-observations.md`) is a wholly separate, agent-side feature, activated by
the presence of `./customer-context/acxd-dev-mode.txt` (see `acxd-dev-mode.md`) — nothing in this
engine config controls it.
---

## 8. What the harness produces (shrinks dramatically)

**Before:** bespoke `create-resources.ts`, `build-application.ts`, `deploy-application.ts`,
`create-flows.ts`, `deploy-helpers.ts`, `poll-build-status.ts`, `client.ts` — regenerated probabilistically
each run (the identified bug source).

**After:** the shipped engine (deterministic, tested) **+** the harness authoring only declarative data:
- `resources/*.json` (context-vars, slot-types, secrets, analytics-tags, data-requests, knowledge-bases)
- `flows/*.flow.json`
- `acxd-deploy.config.json`
- `.env` (from the template, values unset)

---

## 9. Two consolidated deployment stages (documentation target)

- **Stage 1 — Backend:** Amazon Connect integration (default flow) + mocked APIs. *(Working today — no change.)*
- **Stage 2 — ACXD SDK:** from `acxd-sdk/acxd-deploy-engine/`, `npm install` then
  `ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy` runs the engine end to end →
  workspace → resources → flows → application, writing ids to `.env`, no manual capture (Build + Deploy are a manual console step).
  Secrets created from `.env` via `CreateSecretCommand`.

---

## 10. Snapshot / distribution capture (comment A)

The new declarative structure must be captured in BOTH the scoping snapshot and the final
distribution folder. Update/verify the snapshot and distribution copy steps to include the full
`acxd-sdk/` layout:
```
acxd-sdk/
├── acxd-deploy-engine/     ← the shipped engine (copied in at distribution)
├── resources/*.json
├── flows/*.flow.json
├── acxd-deploy.config.json
├── .env                    ← template, values unset
├── package.json / tsconfig.json
└── README.md               ← "npm install && npm run deploy"
```
The distribution deployable is self-contained: from `acxd-sdk/acxd-deploy-engine/`, `npm install` then `ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy` (the engine resolves resources/flows relative to the config file, so cwd is not fragile).

---

## 11. Build plan (once approved)

1. **Engine code** — all `steps/*` + `lib/*` (client, env-file, poll, idempotency, level-aware log) + `main.ts`
   + `acxd-deploy.config.schema.json` + `package.json`/`tsconfig.json`.
2. **`ApplicationSettings` pinning** — resolve exact shape from SDK `.d.ts` / real export; map `ACXD_APP_*`.
3. **Local test harness** — `test/mock-client.ts` (fake SDK) + `main.test.ts` asserting: creation order,
   presence=intent branching, `.env` writeback, secrets-from-env, build/deploy poll + terminal matching,
   bounded-timeout behaviour. Deterministic, no live account.
4. **Rewrite `acxd-resource-creation.md`** — emit declarative `resources/*.json` + config; stop hand-writing
   orchestration TS.
5. **Rewrite `acxd-build-deploy.md`** — the three sequential stages (integration API → Connect flow →
   engine-driven ACXD SDK); **fix the stale
   "secrets can't be created programmatically" claim** and sweep siblings for the same claim.
6. **Update `.env.example` + SDK knowledge notes** to this contract.
7. **Update snapshot/distribution** (§10) to capture the new structure.
8. Note: engine is **validated against the pinned SDK** (see `package.json`); terminal-status strings + `ApplicationSettings` shape are
   the two items to confirm on the first live smoke run.
