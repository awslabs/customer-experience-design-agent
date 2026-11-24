# ACXD Testing & Deployment

Authoritative reference for testing ACXD applications and deploying them (build, deploy, Connect wiring,
promotion, quotas). Governed by `../KNOWLEDGE-ARCHITECTURE.md`.

Every fact carries a source tag — **[CONSOLE-VERIFIED]** / **[DOC]** / **[NEURA]** / **[SPECIALIST]** / **[SDK]**.
Untagged = ungrounded. On conflict: [CONSOLE-VERIFIED] > [DOC] > [NEURA] > [SPECIALIST] > [SDK].

> **⚙️ READ FIRST:** deployment is run by the shipped **deploy engine** (one command: workspace → resources →
> flows → application), NOT hand-written per run. Build & deploy of the application is a **manual human-review
> step** (console primary). You do NOT author orchestration scripts. This file owns test METHOD + the deploy
> workflow; exact commands live in the runbook the engine + Operational Readiness produce.

## Fundamental testing rules [DOC][CONSOLE-VERIFIED]

- **A successful BUILD is required before any test** — you test a build, not the raw flows. [DOC]
- **A routing failure is fixed by fixing the AI DESCRIPTION, not the flow** — routing tests test the
  `aiDescription`. [DOC]
- **After any rebuild, re-verify** — a delete+recreate of a deployment mints a NEW deployment key; the Connect
  contact flow's Agentic CX block then points at a ghost and serves the old build silently. Re-sync the key
  after any key-rotating redeploy. [CONSOLE-VERIFIED]

## The five native ACXD test surfaces [DOC][NEURA]

1. **Application test** — end-to-end conversation against the built application (chat + voice widget).
2. **Flow test** — exercise a single flow in isolation.
3. **Routing tests** — verify intent recognition picks the right flow (tests the AI descriptions).
4. **Flow logic tests** — regression tests over flow logic.
5. **Debugger** — per-turn trace showing tool-call args, build id, and traversal.
Use the Debugger first when diagnosing — it shows the actual tool invocations. [DOC]

## Test dimensions (what to cover) [DOC][CONSOLE-VERIFIED]

- **Utterance / intent** — phrasing variations, accent/pronunciation, cross-intent disambiguation.
- **Edge cases** — unexpected inputs, error-recovery paths, concurrent sessions.
- **Generative Journey** — happy path, prompt-boundary (does it stay in scope?), tool-call verification,
  cross-flow context (context vars survive the redirect).
- **Voice** — ASR quality (accents, noise), TTS quality/pronunciation, Live Sync coordination.
- **Backend integration** — unit tests before deploy; local API test (GET with URL params and POST with a JSON body, as the contract defines; bare value object,
  HTTP 200 even on business failure); deployed-endpoint smoke test (cURL the mock before creating ACXD
  resources). [CONSOLE-VERIFIED]
- **Analytics** — confirm tagged nodes record against conversations.
- **Connect integration** — the Agentic CX block invokes the app; escalation pathway routes correctly.

## Debugging order [CONSOLE-VERIFIED]

ACXD conversation debug log (per-turn build id, tool invocations) → backend CloudWatch → Connect flow log →
only THEN theorise about prompts. [CONSOLE-VERIFIED]

## Deployment model [CONSOLE-VERIFIED]

- The deploy engine provisions in one command, reading declarative JSON + `.env`, writing new ids back to
  `.env` (no manual id capture). Creates are synchronous (+2s settle); no polling except build/deploy. [CONSOLE-VERIFIED]
- **Build & deploy of the application is a MANUAL human-review gate** — the engine stops after creating the
  application; an engineer reviews, then builds/deploys via the **ACXD console (primary)** or optional SDK
  commands. The console is the trusted, recommended path. [CONSOLE-VERIFIED]
- **Idempotent re-runs:** re-running create is safe; GA returns 500 (not 409) when re-creating an existing slot
  type / data request / KB (which have no List/Get) — the engine treats 500-as-exists for those three types. [CONSOLE-VERIFIED]
- **Terminal-status matching** is case-insensitive against multiple candidate strings (build/deploy statuses are
  free-form runtime strings, not strict enums). [CONSOLE-VERIFIED]

## Three-stage deploy order (runbook) [CONSOLE-VERIFIED]

Stage number = folder-walk order = no back-and-forth:
1. **Backend data source** — `mock-integration/` OR `adapter-integration/` (or none if all-direct). Deploy the
   backend first; smoke-test it (cURL) before creating ACXD resources that reach it. [CONSOLE-VERIFIED]
2. **ACXD SDK** — the engine provisions workspace → resources → flows → application from declarative JSON.
3. **Amazon Connect** — deploy the Connect contact flow + Agentic CX block LAST (it references the Workspace/
   Application/Deployment-key the SDK stage creates). Always copy in the full Connect CDK. The Connect instance
   itself is a prerequisite (existing, supplied by ARN), never deployed. [CONSOLE-VERIFIED]

## Data-request creation-time behaviour [CONSOLE-VERIFIED]

Creating a Data Request validates schema/shape only — it does NOT test the URL (a placeholder URL still
creates). A ValidationException means a malformed payload, not an unreachable endpoint. Test reachability
separately (cURL / the console Data Request Test). [CONSOLE-VERIFIED]

## Environment promotion [CONSOLE-VERIFIED]

- **MVP:** dev / test / prod as separate Workspaces in one account, named per environment in each `.env`. The harness
  runs in dev; Git + CI/CD promotes artifacts to staging/prod. [CONSOLE-VERIFIED]
- **Future enterprise:** AWS account per environment (see `acxd-integrations.md`). [SPECIALIST]

## Workspace quota at deploy [CONSOLE-VERIFIED]

A workspace has a finite intents/flow-count cap; import fails with "You exceeded the limit of intents items."
when full — a capacity limit, not a shape error. Delete stale flows or use a fresh workspace. (Detail in
`acxd-variables-and-state.md`.) [CONSOLE-VERIFIED]

## Security scanning [CONSOLE-VERIFIED]

cdk-nag runs on `adapter-integration/` (real gating); the mock stack is nag-exempt (throwaway). Python SAST
(bandit/pip-audit) is optional with a graceful manual-review fallback when the tools are absent. [CONSOLE-VERIFIED]

## Test documentation

Record test coverage + results with the deliverables. Regression re-run is mandatory after every rebuild (the
key-rotation trap above). [CONSOLE-VERIFIED]
