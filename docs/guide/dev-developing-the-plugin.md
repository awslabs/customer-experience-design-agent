# Developing the plugin

## Repository layout

```
.aidlc-plugin/plugin.json      manifest (name must be "acxd"); declares what is contributed
agents/                        the CX Design Agent persona
stages/                        the ACXD lifecycle stages (ideation -> operation)
contributions/                 overlays that enrich core AI-DLC stages
scopes/                        the five engagement scopes
knowledge/                     the curated knowledge base (see section 9)
sensors/                       flow-coverage (advisory) and deploy-status (blocking) sensors
tools/
  acxd-deploy-engine/          deploy engine, Flow DSL (flow-dsl/), validators (lib/), tracer (trace-cli.ts)
  acxd-mock-backend/           mock APIs (CDK parent + one nested API Gateway/Lambda stack per API)
  acxd-adapter-backend/        adapter in front of live systems (CDK)
  acxd-connect-backend/        Amazon Connect integration (CDK)
  acxd-md-to-docx/             architecture document and runbook Word converters
  scoping-md-to-docx/          consolidated scoping document Word converter
  acxd-doctor.ts               plugin health check
templates/use-case/            backend and document templates
tests/                         engine, DSL, tracer, converter and plugin-structure tests
docs/                          sample outputs (docs/example-outputs/) and the AnyCare Insurance SoP
```

`plugin.json` `aidlc.contributes` tells the AI-DLC build which directories to project into the harness:

```json
"aidlc": { "contributes": {
  "stages": "stages/", "overlays": "contributions/", "agents": "agents/",
  "scopes": "scopes/", "knowledge": "knowledge/", "sensors": "sensors/", "tools": "tools/"
}}
```

**Deploy engine** (`tools/acxd-deploy-engine/`): `main.ts` runs the steps in dependency order: workspace, context
variables, slot types, secrets, analytics tags, data requests, knowledge bases and their content, guardrails, flows,
then the application. Every step is idempotent (re-running converges), and the engine stops after creating the
application so a human reviews it before the console build and deploy. It uses ACXD API-key authentication and
needs `ACXD_DEPLOY_CONFIG` set. Read `DEPLOY-ENGINE-SPEC.md` first.

**Flow DSL** (`tools/acxd-deploy-engine/flow-dsl/`): `core.ts` (graph primitives), `nodes.ts` (one typed factory per
node type), `components.ts` (whole-flow builders such as `buildEscalation` and `buildCallback`, with all domain text
passed as parameters), `builder.ts` (assembles a flow and injects the terminate node), `spec.ts` and
`build-specs.ts` (FlowSpec, the default authoring path), `FLOWSPEC.md` (format reference) and `DESIGN.md` (read before
changing factories).

## Development loop

Keep your editing clone **outside** any AI-DLC workspace, and build and sync it into a separate test workspace. Kiro
reads everything in the opened folder as context, so plugin source inside a workspace you run `/aidlc` in mixes the
source's stage and persona instructions with the composed harness.

```bash
# in a test workspace that already has the AI-DLC harness (see the getting started guide)
# your editing clone; the folder must be named acxd (the tooling resolves the plugin by that name)
ACXD_SOURCE=<path-to-your-clone>/acxd
bun .kiro/tools/aidlc-plugin-build.ts $ACXD_SOURCE kiro-ide
PLUGIN_ROOT=$ACXD_SOURCE/dist/kiro-ide
AIDLC_PLUGIN_ROOT="$PLUGIN_ROOT" AIDLC_PROJECT_DIR="$(pwd)" AIDLC_HARNESS_DIR=.kiro aidlc engine plugin sync
```

- Always run the build through `bun`; never execute the `.ts` file directly.
- `sync` composes into `.kiro/`; never copy the projection into the project root.

## Verify before you seed

From the plugin root, run the full check:

```bash
./test_pre_poc.sh
```

It cleans build output, installs the engine's dependencies, runs `tsc --noEmit`, the DSL round-trip and FlowSpec
tests, the engine and tracer tests, the mock API security tests, and the plugin structure tests, then cleans again
so the source is ready to build.
`node_modules` left in the source breaks the plugin build, so the script always removes it.

Treat any code edit you could not compile or run as unverified until `test_pre_poc.sh` passes.

## Extending

| To add | Do this |
|---|---|
| A stage | Add `stages/<phase>/acxd-<name>.md` and wire it into the relevant scopes. |
| A scope | Add `scopes/acxd-<name>.md`. Differentiate by depth and behaviour, and update the scope table in [Engagement scopes](scopes.md). |
| A node type | Add a typed factory in `flow-dsl/nodes.ts`, check its wire shape against the SDK model, and add a send-time transform in `create-flows.ts` if the authoring shape differs. |
| A component | Add a parameterised builder in `flow-dsl/components.ts` and prove it in the round-trip test. |
| A resource class | Add `steps/create-<x>.ts`, insert it in dependency order in `main.ts`, and make it idempotent. |
| A check | Add it to `lib/validate-flow-refs.ts` (per flow), `lib/flowset-checks.ts` (cross-flow) or `lib/flowset-warnings.ts` (design finding), with a test. |
| Knowledge | Add it under `knowledge/<agent>/`, note it in `KNOWLEDGE-ARCHITECTURE.md`, and tag each fact with its source. |

If a fix would mean hand-editing a `.flow.json` or threading an SDK field through by hand, it almost always belongs in
a factory, a builder, a check or the engine's command transform instead.

## Developer mode

Add `customer-context/acxd-dev-mode.txt` to a test project and the agent logs its self-corrections and design
decisions to `acxd-dev-observations.md`, tagged `[harness]` (for plugin developers) or `[design]` (for solution
designers). It posts a short digest at each stage end and writes the log once per stage, after the gate. An
optional focus prompt in the file asks for extra detail on specific areas. The behaviour is defined in
`knowledge/acxd-platform-agent/acxd-dev-mode.md`, loaded only when the marker is present.

## The plugin doctor

`tools/acxd-doctor.ts` checks that every expected plugin file composed into the harness, and prints only JSON:
`{"checks":[{"pass":...,"label":...,"fix":...,"severity":"error"|"advisory"}]}`.

```bash
AIDLC_PROJECT_DIR="$(pwd)" AIDLC_HARNESS_DIR=.kiro bun .kiro/tools/acxd-doctor.ts; echo "exit=$?"
```

- Without `AIDLC_HARNESS_DIR=.kiro` it defaults to `.claude` and every check reads false.
- `aidlc doctor` may report the script "returned exit code 2" when its child process cannot find `bun` on `PATH`.
  This is advisory. To fix it on macOS, run `echo "$HOME/.bun/bin" | sudo tee /etc/paths.d/bun` and fully relaunch
  Kiro IDE.

## Supported models

Generative nodes (Generative Journey, Generative Text, Multimodal) take a `modelType` from the closed
`GenerativeModelType` enum in the ACXD SDK's Smithy model. ACXD rejects any other value, and Kiro needs no
internet access to know the list because it ships with the SDK.

- **Enforced in:** `tools/acxd-deploy-engine/flow-dsl/nodes.ts` (`type GenerativeModelType`); the FlowSpec build
  and `tsc` reject unknown models.
- **Agent reference:** `knowledge/acxd-platform-agent/acxd-sdk-idl.ts` (mirror of the same list).
- **Presented to the user:** `stages/inception/acxd-platform-config.md` Step 2 (descriptions and the two
  recommendations: reasoning/routing `anthropic.claude-sonnet-5`, data collection `anthropic.claude-haiku-4-5`).

**When the SDK adds or removes a model:** bump the SDK in `tools/acxd-deploy-engine/package.json`, read the new
enum from its Smithy model or `.d.ts`, update `nodes.ts` and `acxd-sdk-idl.ts`, then update the Platform Config
list and recommendations, and run `./test_pre_poc.sh`. Model inference runs inside ACXD as a managed service.

---

[Documentation home](index.md)
