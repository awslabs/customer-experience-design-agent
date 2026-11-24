# ACXD Deploy Engine

Deterministic, tested ACXD deployment engine. **Stage 2 (ACXD SDK)** of the ACXD deployment. One command
PROVISIONS everything (workspace → resources → flows → application); no manual ID capture. **It does NOT
build or deploy** — Build + Deploy are a manual, human-reviewed step in the ACXD console (see the runbook).

## What it does

`npm run deploy` runs, in order:

1. **Workspace** — reuse `ACXD_WORKSPACE_ID` if set, else create + write it back to `.env`.
2. **Resources** (dependency order): context variables → slot types → secrets → analytics tags →
   data requests → knowledge bases (+publish). Synchronous, idempotent, 2s settle between types.
3. **Flows** — created Redirect-targets-first (per `acxd-deploy.config.json` → `flows.order`).
4. **Application** — reuse `ACXD_APPLICATION_ID` if set, else create (settings from `.env`) + write it back.
…then STOPS. **Build + Deploy are a manual console step** (review gate) — the engine does not build/deploy
(a human validates the created solution in the console before it goes live; Build + Deploy are a manual step).

## Usage

Run from this engine directory. The config, resources, and flows live one level up in `acxd-sdk/`; the engine
resolves them relative to the config file, so point `ACXD_DEPLOY_CONFIG` at it and cwd no longer matters.

```bash
npm install
# .env lives at the distribution root; point the engine at it via ACXD_ENV_FILE (read + write-back both honour it).
ACXD_ENV_FILE=../../.env ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy   # runs main.ts
```

- **`.env` presence = intent:** a populated `ACXD_WORKSPACE_ID`/`ACXD_APPLICATION_ID` means "reuse, don't
  create"; blank means "create and fill in".
- **Secrets** are created programmatically via `CreateSecretCommand` from `.env` — no console entry.
- **`ACXD_LOG_LEVEL`** = `stages` | `objects` (default) | `debug`.

## The harness authors only declarative data

- `acxd-deploy.config.json` (validated against `acxd-deploy.config.schema.json`)
- `resources/*.json` (context-vars, slot-types, secrets, analytics-tags, data-requests, knowledge-bases)
- `flows/*.flow.json`
- `.env` (from `.env.example`, values unset)

The engine code is fixed and tested — the harness never regenerates orchestration TypeScript.

## Validation status

Built against the pinned `amazon-connect-acxd-sdk` (see `package.json`). One item is confirmed on the first live smoke run:
1. **`ApplicationSettings`** exact field shape (mapped from `ACXD_APP_*` in `ensure-application.ts`).

Build + Deploy are performed manually in the ACXD console (not by this engine).

## Layout

```
main.ts                          orchestrator
acxd-deploy.config.schema.json   config contract
lib/    client, env-file, idempotency, log (level-aware), text, validate-flow-refs
steps/  ensure-workspace, ensure-application, create-* (per resource), create-flows
(tests live at the plugin root: tests/acxd-deploy-engine/ — kept out of tools/ so the plugin build never copies them into installs; run via `npm test`)
```
