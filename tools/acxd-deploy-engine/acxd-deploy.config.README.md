# acxd-deploy.config — deterministic template & example

The deploy engine reads `acxd-deploy.config.json` with **plain `JSON.parse`** — it must be
strict, comment-free JSON. Do **not** author this file's shape from scratch. Copy the
template and replace the `{{PLACEHOLDERS}}`.

## Files
- **`acxd-deploy.config.template.json`** — pure-JSON skeleton with `{{PLACEHOLDER}}` values.
  Correct-by-construction field names. Copy it to `acxd-deploy.config.json` and fill in.
- **`acxd-deploy.config.example.json`** — a filled, valid example (a billing use case).
- **`acxd-deploy.config.schema.json`** — the authoritative JSON Schema. Validate against it.

## How to use (resource-creation stage)
```bash
cp acxd-deploy.config.template.json <record-dir>/acxd-deploy.config.json
# then replace every {{PLACEHOLDER}} with real values; leave resources/* paths as-is
```

## Field names — the EXACT traps that have caused deploy crashes
These are the mismatches that produced `project undefined` and
`The "path" argument must be ... Received undefined`:

| Use THIS (correct) | NOT this (wrong) | Why |
|---|---|---|
| `project` | `projectName` | engine reads `cfg.project` |
| `resources.contextVariables` | `contextVars` | engine reads `cfg.resources.contextVariables` |
| `defaultFlows.welcome: "flowId"` (string) | `{ "flowId": "..." }` (object) | engine wraps the string as `{ flowId }` itself |
| `workspace: { name }` (top-level block) | *(omitted)* | required top-level block |

## Workspace & application naming — default to the projectName

`workspace.name` and `application.name` **default to the canonical `projectName`** (captured in
CX Discovery, Step 0-pre) with a role suffix — `<projectName>Workspace` and `<projectName>App`.
This keeps them deterministic and consistent with the `platform-config-spec`, so nothing has to be
reconciled at authoring time.

- Derive them from `project` — do NOT invent a free-standing name (e.g. author
  `northwindEnergyBillingWorkspace` / `northwindEnergyBillingApp`, NOT `billingWorkspace` /
  `acxdBillingApp`). A name that isn't derived from `projectName` diverges from the
  `platform-config-spec` and forces a late reconciliation.
- These are display/instance names, not the `projectName` anchor. The operator can rename them
  before deploy via `ACXD_WORKSPACE_NAME` / `ACXD_APPLICATION_NAME` in `.env` (which, when set,
  override the config `name`). The `.env` defaults are seeded from the same projectName-derived
  value.
- SDK limits: workspace name <= 36 chars (`^[A-Za-z0-9 ,.'-]+$`); application name <= 100 chars
  (`^[A-Za-z0-9 _-]+$`). Watch the 36-char workspace cap for long project names.

## What does NOT belong in this file
- **Application settings** (language, TTL) come from `.env` `ACXD_APP_*` vars — NOT the config.
- **Secret VALUES** live in `.env` / secret store — NOT here (the config only points at
  `resources/secrets.json`, which holds definitions, not values).

## Required top-level keys
`project`, `workspace`, `application`, `resources`, `flows`
(plus optional `settleMs`).

`resources` must include all six: `contextVariables`, `slotTypes`, `secrets`,
`analyticsTags`, `dataRequests`, `knowledgeBases`.

`flows.order` lists flowIds in creation order — **Redirect-target flows FIRST** (e.g. escalation), the flows that redirect to them after.
`application.defaultFlows.welcome` is REQUIRED once the app has attached flows.
