# The ACXD deploy engine

The ACXD deploy engine is a pre-built, deterministic, tested deployment engine shipped inside the plugin. Instead of writing orchestration TypeScript per run, the harness emits only declarative JSON: resource definitions and a config manifest. The engine runs create → settle → write-`.env` → continue for the workspace, resources, flows, and application, then stops.

> **Important:** Build and deploy are a manual, human-reviewed ACXD console step. The engine provisions resources and creates the application, but it does not build or deploy. A human review gate validates the created solution in the console before it goes live.

## Synchronous creates, no polling

All create calls are synchronous and return their ID immediately, so the engine has no polling loops for create. After each create (the workspace, the application, and each resource type), the engine applies a 2-second settle delay so that a freshly created resource is consistent before the next step references it. The engine performs only synchronous creates. Build and deploy, which are asynchronous, are not run by the engine.

## The .env contract

The `.env` file starts fully declared, with values unset, in the order the runbook fills them. These are its keys:

```dotenv
# ── Prerequisites — your AWS account, Amazon Connect instance and ACXD API key ──
AWS_REGION=
ACXD_PROJECT_NAME=
ACXD_ENVIRONMENT=dev
CONNECT_INSTANCE_ARN=
ACXD_API_TOKEN=
# ── Stage 1 — APIs: base URL and credential for each API the data requests call ──
# >>> acxd-apis (generated from the OpenAPI files by openapi-wiring; do not edit inside these markers by hand)
# <<< acxd-apis
# ── Stage 2 — ACXD engineer: logging level (ACXD_API_TOKEN is filled in Prerequisites, above) ──
ACXD_LOG_LEVEL=objects
# ── Stage 2 — ApplicationSettings — used ONLY when CREATING a new Application
ACXD_APP_DEFAULT_LANGUAGE=en-US
ACXD_APP_SESSION_TIMEOUT_SECONDS=1800
ACXD_WORKSPACE_ID=
ACXD_APPLICATION_ID=
ACXD_WORKSPACE_NAME=
ACXD_APPLICATION_NAME=
# ── Stage 3 — Connect/telephony engineer: Amazon Connect integration ──
ACXD_DEPLOYMENT_KEY=
ESCALATION_QUEUE_ARN=
HOURS_OF_OPERATION_ARN=
ACXD_SAMPLE_CUSTOMER_ID=
```

The shipped template (`tools/acxd-deploy-engine/.env.example`) carries a comment for every key; the runbook fills it top to bottom.

Key points about the contract:

* **Presence is intent.** A populated `ACXD_WORKSPACE_ID` or `ACXD_APPLICATION_ID` means "reuse, do not create". Blank means "create it and write it back here". The engine writes these IDs back in place after creating them.
* **ApplicationSettings** are consumed only when creating a new application. The engine maps `ACXD_APP_DEFAULT_LANGUAGE` to `settings.languageCode`, and `ACXD_APP_SESSION_TIMEOUT_SECONDS` to `settings.conversationTTL`. `conversationTTL` is in minutes, with a maximum of 1440 (24 hours); the knob is authored in seconds for readability, and the engine converts seconds to minutes (rounded, minimum 1) and clamps to 1440.
* **Default-behaviour flows** are set from `application.defaultFlows` in the deploy config. The `welcome` role is required once the application has attached flows; the API rejects the application otherwise.
* **Secrets** are created programmatically from `.env` via `CreateSecretCommand`, with no console hand-entry.
* **Logging** is controlled by `ACXD_LOG_LEVEL`: `stages` (one line per object type), `objects` (the default, one line per object created), or `debug` (full detail). Sensitive values are never logged.

## acxd-deploy.config.json

The deploy config is the only orchestration input the harness authors.

```json
{
  "project": "northwindEnergyBilling",
  "workspace": { "name": "northwindEnergyBillingWorkspace", "tags": ["acxd-platform-poc"] },
  "application": {
    "name": "northwindEnergyBillingApp",
    "description": "Billing assistant | Flows: 2 | Env: dev | Owner: Platform Team"
  },
  "settleMs": 2000,
  "resources": {
    "contextVariables": "resources/context-vars.json",
    "slotTypes":        "resources/slot-types.json",
    "secrets":          "resources/secrets.json",
    "analyticsTags":    "resources/analytics-tags.json",
    "dataRequests":     "resources/data-requests.json",
    "knowledgeBases":   "resources/knowledge-bases.json"
  },
  "flows": {
    "dir": "flows",
    "order": ["billingEscalation","billingMain"]
  }
}
```

The resource files are the same declarative shapes the harness authors, as data rather than code. `secrets.json` maps each secret name to the `.env` variable holding its value. `flows.order` guarantees that redirect targets are created first, deterministically. There are no build, deploy, or poll knobs, because the engine only provisions.

## Orchestration order

`main.ts` loads `.env` and validates `acxd-deploy.config.json`, then runs this sequence:

1. **Workspace** — create (synchronous) if `ACXD_WORKSPACE_ID` is unset, write the ID back to `.env`, settle.
1. **Resources** — in dependency order (context variables, slot types, secrets, analytics tags, data requests, knowledge bases with their content, guardrails), with a 2-second settle between types.
1. **Flows** — redirect-target flows first, per `cfg.flows.order`.
1. **Application** — create (synchronous) if `ACXD_APPLICATION_ID` is unset, build its settings from the `ACXD_APP_*` variables, write the ID back to `.env`, settle.
1. **Done** — the engine stops after creating the application. Build and deploy are a manual console step.

## Where the engine fits

The engine is Stage 2 of the runbook. Stage 1 deploys the backend (mock APIs or adapter) and Stage 3 the Amazon
Connect integration; see [Deploying the solution](deploying.md). From `acxd-sdk/acxd-deploy-engine/` in the
distribution:

```bash
npm install
ACXD_ENV_FILE=../../.env ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy
```

The distribution is self-contained: the engine resolves resources and flows relative to the config file, so the
working directory does not matter. It authenticates with the ACXD API key and fails at once if `ACXD_DEPLOY_CONFIG`
is unset. Read `tools/acxd-deploy-engine/DEPLOY-ENGINE-SPEC.md` before changing the engine.

---

[Documentation home](index.md)
