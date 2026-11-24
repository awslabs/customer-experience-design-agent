---
slug: acxd-build-deploy
number: 4.15
name: SDK Build & Deployment Pipeline
plugin: acxd
phase: operation
execution: ALWAYS
condition: Runs for all ACXD engagements. Generates SDK deployment scripts and rollback procedures for all scopes; CI/CD pipeline configuration (Step 4) runs only for acxd-usecase and acxd-platform (skipped for acxd-poc and acxd-platform-poc).
lead_agent: acxd-platform-agent
support_agents:
  - aidlc-pipeline-deploy-agent
mode: inline
produces:
  - acxd-deployment-scripts
  - acxd-deployment-runbook
  - acxd-rollback-procedure
optional_produces:
  # CI/CD pipeline config (Step 4) is written for acxd-usecase / acxd-platform only, SKIPPED for POC
  # scopes (acxd-poc / acxd-platform-poc) per the condition above. Optional, not guaranteed — a POC run
  # that omits it is correct; do NOT author a stub file for it. (required-sections is advisory + per-file.)
  - acxd-cicd-pipeline-config
consumes:
  - artifact: build-and-test-summary
    required: false
  - artifact: acxd-flows
    required: false
  - artifact: acxd-backend-code
    required: false
  - artifact: acxd-platform-config-spec
    required: false
  - artifact: acxd-environment-strategy
    required: false
requires_stage:
  - build-and-test
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
inputs: Build-and-test summary, flow import artifacts, backend code, platform config spec, environment strategy
outputs: acxd-deployment-scripts/, acxd-cicd-pipeline-config.md, acxd-deployment-runbook.md, acxd-rollback-procedure.md
---

# SDK Build & Deployment Pipeline

> **Stage header (fixed — use exactly, do not choose):** open the stage with `# 🚢 SDK Build & Deployment Pipeline` and end it with
> `# 🚢 SDK Build & Deployment Pipeline Complete`. Phase banner for this stage: 🚀 Entering the Operation Phase (emit FIRST, see below).

> **MANDATORY STAGE-OPEN EMISSION — this is the first thing the user sees in this stage (reading the stage file first is fine).**
> This is the first ACXD stage of the Operation phase. Emit the phase-entry banner below EXACTLY as written, as literal Markdown
> (a rendered `#` heading the user sees, NOT a code block, NOT paraphrased), then the stage hero header (`# 🚢 SDK Build & Deployment Pipeline`) + its intro line (both written below), then proceed. Emit the stage hero H1 line AND its intro line VERBATIM — copy both exactly as
> written, word for word; they are fixed strings, not a description to paraphrase. Do NOT reword, summarise,
> shorten, regenerate, or re-emoji either line.
> This is not optional guidance or a sample: a stage that begins without its opening banner is as incomplete as one that ends
> without its `# 🚢 ... Complete` message (core stage-protocol §2). Do NOT skip it because context is long or the work feels
> urgent. Emit it once, at the very start:
>
> # 🚀 Entering the Operation Phase
>
> Finally we make the solution deployable and hand it over: the deployment pipeline, the Amazon Connect integration, operational readiness, and the packaged, self-contained deliverables. This phase takes the built solution to a running, handover-ready state.
>
> # 🚢 SDK Build & Deployment Pipeline
>
> **What this stage does:** Assembles the deployment pipeline and the consolidated deploy runbook — the ordered, operator-run steps that bootstrap, deploy, smoke-test, and wire the solution. **Produces:** the deploy-ready artifacts and the runbook the human operator follows (the agent never deploys).

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

Generates the deployment automation for ACXD solutions — the engine PROVISIONS (workspace → resources →
flows → application); Build + Deploy are a manual, human-reviewed console step (not automated). ALL
programmatic operations use the GA `amazon-connect-acxd-sdk` Node SDK — no cURL, no direct REST, no Beta/Gamma.

**You do NOT write SDK calls — the deploy engine does, from your declarative JSON/FlowSpec. The engine encodes every SDK field-name and shape rule deterministically; author to `acxd-sdk-idl.ts` (the authoring contract).**
Note: build/deploy are performed MANUALLY in the ACXD console (the engine provisions only). The SDK
build/deploy commands (`CreateApplicationBuild`/`CreateApplicationDeployment`) remain an optional, unverified
CLI alternative and a future CI/CD building block — if used, their INPUTS take `applicationIdentifier`/
`buildIdentifier`/`deploymentIdentifier` (responses use short `buildId`/`deploymentId`).

## Steps

### Step 1: The three sequential deployment stages (engine-driven)

Deployment is **three sequential stages**, and the ACXD side is driven by the **shipped, tested deterministic
deploy engine** (`tools/acxd-deploy-engine/`, copied into each project's `acxd-sdk/` at distribution) — NOT
by bespoke scripts generated per run.

> **Do NOT generate `build-application.ts` / `poll-build-status.ts` / `deploy-application.ts` /
> `verify-deployment.ts` / `create-resources.ts`.** The engine already implements create → 2s settle →
> write-`.env` → continue for all synchronous creates, and create → bounded-poll for the two async
> operations (build, deploy). Regenerating this logic each run was the identified source of deployment bugs.
> This stage documents the three-stage runbook and produces the rollback procedure and (for usecase/platform)
> the CI/CD pipeline config — it does not hand-write the deploy orchestration.

The three deployment stages run in this order — stage number = folder-walk order, no back-and-forth — and
are preceded by a short **Prerequisites** section:

**Prerequisites — an Amazon Connect instance + the ACXD API key.** The operator MUST provide an AWS account with an
**existing Amazon Connect instance they have admin access to**, in the same region as `AWS_REGION`. This solution
never creates, owns, or deletes the instance. ACXD is reached THROUGH that instance, and the ACXD API key
(`ACXD_API_TOKEN`) can only be generated by hand in its ACXD Admin Hub, so both come first. The operator sets
`CONNECT_INSTANCE_ARN`, then generates the key (MANUAL; there is no automation path for it).

**Stage 1 — APIs** (`backend/mock-integration/` OR `backend/adapter-integration/`, per API): every API the data
requests call has an OpenAPI file, and its base URL and credential live in `.env` under the API's own names
(`<API>_URL`, `<API>_KEY` | `_TOKEN` | `_BASIC`, written by the API wiring tool from the OpenAPI files). What runs
here depends on the API:
- **API this solution deploys** (`info.x-acxd-generated: true`, discovery options 2 and 3): it is one nested API in the `mock-integration/` stack (one deploy
  for all generated APIs), which uses the key already in `.env` (generated in Backend Build); then copy that API's
  `<ApiId>Url` output into `<API>_URL`.
- **Your API**: nothing is deployed. Its URL is pre-filled from the OpenAPI `servers` entry (change it if your
  endpoint differs) and you enter the credential your provider issued. A bearer or OAuth token expires: update it
  in `.env` and re-run Stage 2 when it does.
- **Your API behind an adapter** (private network, response reshaping, or an auth ACXD cannot send): deploy its
  `adapter-integration/` stack here; its URL goes in `<API>_URL`.

**Stage 2 — ACXD SDK** (`acxd-sdk/acxd-deploy-engine/`): one command runs the engine to PROVISION — workspace →
resources → flows → application — writing `ACXD_WORKSPACE_ID` / `ACXD_APPLICATION_ID` back to the root `.env`.
Secrets are created programmatically from `.env` (`CreateSecretCommand`); no manual console step for resources.
**Build + Deploy are then a MANUAL, human-reviewed step in the ACXD console** — the engine deliberately does
not build or deploy (a human review gate validates the solution before it goes live; Build + Deploy are a manual console step). `.env` follows
the "presence = intent" contract (a populated workspace/application id means reuse; blank means create).

**Stage 3 — Amazon Connect integration flow** (`backend/connect/`): deploys the best-practice contact flow
(the AWS-authored `mainflow.json` — Agentic CX block, flow logging, Contact Lens voice + chat analytics,
escalation hand-off carrying the agent's summary back), plus an escalation queue and routing profile. There
is **no Amazon Lex bot** — the contact flow reaches ACXD through the **Agentic CX block** (Workspace /
Application / Alias). Runs for every scope EXCEPT the minimal `acxd-poc` (ACXD-only). Deploys LAST because
its Agentic CX block references the Workspace/Application/Alias Stage 2 creates. It wires into the existing
instance in `CONNECT_INSTANCE_ARN` as one stack, `acxd-<projectName>-<env>-connect` (`npm run deploy`).

The engine's `RESULT {…}` line reports the created workspace/application ids and a
`provisioned (not built/deployed)` status. `ACXD_LOG_LEVEL` (`stages`/`objects`/`debug`) controls verbosity.
Build/deploy are a manual console step (below) — the engine does not poll a build.

### Step 2: Build & Deploy — Manual (Human Review Gate)

Build and deploy are **NOT automated**. After the engine provisions the workspace, resources, flows, and
application, the ACXD engineer reviews the result in the ACXD console and then triggers **Build** and
**Deploy** from the console (full instructions in the Stage 2 section of the runbook, Step 6). This is a
deliberate review gate: a human validates the created solution in the console before it goes live. The engine
creates resources/flows/application; Build and Deploy are a manual console step. Production-scope automated build/deploy via CI/CD is
deferred until the SDK build/deploy path is proven.

**If a deploy fails (troubleshooting).** ACXD is new and evolving, so an occasional deploy error is expected.
Two things make this safe to work through:
- **Re-runs are safe — the engine is idempotent.** Every resource create treats "already exists" as a skip
  (409/duplicate, and a 500 on the three no-List types — slot types, data requests, KBs — via
  `treat500AsExists`), and the workspace/application ids are written back to `.env` on first create. So after
  fixing the offending artifact you just re-run the SAME command: the engine reuses the workspace, logs the
  already-created resources and flows as skipped, and continues from where it stopped.
- **Debug in this order** (cheapest signal first): (1) the engine's own `✗ failed:` line — it names the flow
  and the exact field the API rejected (e.g. "…choice.choiceDisplayFormat is not a supported value"); most
  deploy errors are an authored value the flow-ref validator does not yet guard — fix it in the flow JSON and
  re-run; (2) for a resource/build/deploy error, the **ACXD console** (the workspace resource view, then the
  conversation debug log after a build); (3) the backend **CloudWatch** logs for a data-request failure;
  (4) the Connect flow log for telephony/routing. Set `ACXD_LOG_LEVEL=debug` for full engine traces.
- **When the fix is a recurring authored-value class** (a rejected enum, a missing binding, a bad id), tell
  the harness so a validator guard can be added — that turns a mid-deploy wall into an up-front validation
  error next time. Genuinely novel/platform errors (new API behaviour, expired token, region mismatch) are
  the ones to debug in the console — the validator cannot pre-empt those.

### Step 3: Multi-Environment Deployment (Platform Engagements)

For `acxd-platform` scope, generate environment-specific deployment configurations. Each environment
deploys from its own `.env` (workspace name, API token, backend URLs/keys); the deploy engine creates or reuses
that workspace. This step wires the deploy triggers per environment.

| Environment | Workspace ID | API Token Source | Deploy Trigger | Approval Gate |
|-------------|-------------|-----------------|----------------|---------------|
| Development | `{project}-dev` (uuid) | `acxd/{project}/dev/api-token` | On merge to `dev` | Automatic |
| Staging | `{project}-staging` (uuid) | `acxd/{project}/staging/api-token` | On merge to `staging` | Automatic |
| Production | `{project}-prod` (uuid) | `acxd/{project}/prod/api-token` | On release tag | Manual approval required |

Generate an environment configuration file (`acxd-env-config.json`):
```json
{
  "environments": {
    "dev": { "workspaceId": "...", "applicationId": "...", "tokenSecretArn": "..." },
    "staging": { "workspaceId": "...", "applicationId": "...", "tokenSecretArn": "..." },
    "prod": { "workspaceId": "...", "applicationId": "...", "tokenSecretArn": "..." }
  }
}
```

### Step 4: CI/CD Pipeline Configuration — Split Pipeline

**Scope guard:** Skip this step for `acxd-poc` and `acxd-platform-poc` — both defer CI/CD to production.
POC and Platform-POC deploy via the manual SDK scripts (Steps 1–3) plus the rollback procedure (Step 5);
they do NOT generate a CI/CD pipeline or the `acxd-deploy.yml` / `buildspec.yml` templates. CI/CD pipeline
configuration runs only for `acxd-usecase` and `acxd-platform`.

Design the coordinated split pipeline:

**Pipeline security requirements (apply to every generated pipeline file):**
- AWS access by role assumption only: GitHub OIDC (`aws-actions/configure-aws-credentials` with `role-to-assume`)
  or a CodeBuild/CodePipeline service role. Never static AWS access keys.
- Production deploys only from a release tag, behind a manual approval (a GitHub `environment` with required
  reviewers, or a CodePipeline manual-approval action). A push to a branch never deploys to production.
- Never pass `--require-approval never` to a production `cdk deploy`; run `cdk diff` and review it at the approval step.
- Secrets come from the pipeline's secret store or AWS Secrets Manager under `acxd/<projectName>/<environment>/<name>`
  (for example `acxd/<projectName>/prod/api-token`), never from the repository.
- Region, project name and paths come from the distribution folder (`.env`, `backend/mock-integration/cdk`,
  `backend/connect/cdk`); never hard-code them.

**Track 1: AWS-Native CI/CD** (backend services + Connect infrastructure)
- Source: Git repository (CodeCommit or GitHub)
- Build: `cdk synth` for backend CDK stack (API Gateway + stateless adapter Lambda(s); data store only if justified)
- Deploy: `cdk deploy` for backend stack (one stack per use case)
- Deploy: `cdk deploy` for the Connect integration stack (contact flow via Agentic CX block from `mainflow.json`, escalation queue, routing profile) — AFTER the ACXD app is deployed (the Agentic CX block references its Workspace/Application/Alias). No Lex stack — the Agentic CX block reaches ACXD directly.
- Gate: Backend health check passes before proceeding to Track 2

**Track 2: ACXD SDK Pipeline** (ACXD resources, build, deploy)
- Pre-condition: Track 1 backend deployment verified healthy
- Step 1: Inject secrets/config — set `ACXD_API_TOKEN`, `AWS_REGION` and every API's `<API>_URL` and credential
  (and, for a fixed target, `ACXD_WORKSPACE_ID`/`ACXD_APPLICATION_ID`) into the job environment from the pipeline's
  secret store.
- Step 2: from `acxd-sdk/acxd-deploy-engine/`, run `npm install` then
  `ACXD_ENV_FILE=../../.env ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy` — the shipped
  engine PROVISIONS the ACXD solution (workspace → resources → flows → application), idempotent and safe to
  re-run. The final `RESULT {…}` line carries the ids/status for pipeline gating; a non-zero exit fails the
  job. Set `ACXD_LOG_LEVEL=debug` in CI for full traces. **Build + Deploy remain a manual console step today**
  — automating them in CI/CD is deferred until the SDK build/deploy path is proven (see Step 2).

Generate pipeline definition for the customer's chosen CI/CD tool:
- **GitHub Actions**: `.github/workflows/acxd-deploy.yml`
- **AWS CodePipeline**: `pipeline-definition.json` + CodeBuild `buildspec.yml`

### Step 5: Rollback Procedure

Generate `acxd-rollback-procedure.md`:

**ACXD Rollback** (Track 2):
1. Identify the last known-good build ID from deployment logs
2. Re-deploy the previous build from the ACXD console (Deploy → select the prior successful build)
3. Verify application status returns to ACTIVE
4. If no previous build exists: the ACXD application retains the last deployed state until a new build succeeds

**Backend Rollback** (Track 1):
1. CDK: `cdk deploy` with previous version from Git, or CDK automatic rollback on stack update failure
2. CloudFormation stacks (Connect/Lex/Escalation): automatic rollback on stack update failure
3. Database: DynamoDB point-in-time recovery for data rollback

**Coordinated Rollback** (both tracks):
1. Roll back ACXD application first (it may depend on the old backend contract)
2. Roll back backend services second
3. Verify end-to-end: test in ACXD widget, confirm data request responses, confirm Connect routing

### Step 6: Deployment Runbook

Generate `acxd-deployment-runbook.md`. This is the **single most important human-facing operational
artefact** — an operator who has never seen the project must be able to follow it top-to-bottom without
guessing, without hunting for files, and without jumping between folders. Optimise ruthlessly for that
experience. **Assume the three deployment stages may be run by three DIFFERENT people** (a backend engineer,
an ACXD engineer, a Connect/telephony engineer): each stage must be self-contained and must NOT hand one
persona a step or a credential that belongs to another. The authoring rules below are mandatory.

**RULE 1 — The distribution snapshot is the ONE base directory.** The runbook's very first instruction MUST
be to `cd` into the snapshot root, and it MUST state that this is the base directory for every command that
follows. Open with exactly this shape (fill the real snapshot folder name):

> **`<projectName>` = the canonical camelCase value captured in CX Discovery (Step 0-pre)** — the same value
> used for the scoping snapshot, the mock APIs stack (`acxd-<projectName>-<env>-mock-apis`), the Connect stack (`acxd-<projectName>-<env>-connect`),
> and the default ACXD workspace/application names. Reuse it verbatim; never re-derive it per stage.

> **Before you start:** all commands in this runbook run from the deployment snapshot. Open a terminal and:
> ```bash
> cd <projectName>-dist-<YYYYMMDD-HHMM>
> ACXD_DIST=$(pwd)
> chmod 600 .env
> ```
> `chmod 600 .env` keeps the file (it holds your ACXD API key) readable by you only.
> `ACXD_DIST` remembers the snapshot root. **Every section below starts with the same two lines**, so a section
> never depends on where the previous one left you and always uses the latest values in `./.env`:
> ```bash
> cd "$ACXD_DIST"
> set -a; . ./.env; set +a
> ```
> The second line loads every value in `./.env` into this terminal, replacing any value an earlier section
> loaded. In a new terminal, `cd` to the snapshot and run `ACXD_DIST=$(pwd)` again first.

Never reference a folder outside the snapshot (no root-level working copies, no `aidlc/…` record paths, no
nested `acxd-app/`). Every path in the runbook is a real folder inside the snapshot: `backend/mock-integration/`
(or `backend/adapter-integration/`), `acxd-sdk/`, `backend/connect/`.

**RULE 2 — State WHAT and WHERE explicitly at every folder change and every file edit.** The FIRST `cd` of every
section is the absolute `cd "$ACXD_DIST"` (snapshot root); only AFTER that does a section descend with a relative
`cd`, naming the folder and what it contains ("`cd "$ACXD_DIST"` then `cd backend/mock-integration/cdk` — the mock
integration API CDK stack"). Never chain a relative `cd` across sections assuming the operator is still at root —
start the section at root explicitly. When a step edits a file, give its full path from the snapshot root and say
which keys change. No bare `cd cdk`.

**RULE 2c — Every section opens with the same two lines, and commands take values from `.env`.** The first lines of
every section's first code block are `cd "$ACXD_DIST"` then `set -a; . ./.env; set +a` (re-run the load line after
any step that edits `./.env`). Commands never hard-code a value that lives in `.env`: use `"$AWS_REGION"`,
`"$ACXD_PROJECT_NAME"`, `"${ACXD_ENVIRONMENT:-dev}"`, and get the account with
`$(aws sts get-caller-identity --query Account --output text)`. **No `\` line continuations and no multi-line functions in runbook commands:** text copied from the Word
runbook or a rendered page gains extra line breaks or trailing spaces, which silently breaks a continuation (zsh
then runs the next line as its own command). Put each command on one line; hold a long `--query` in a variable
first (`Q="..."` then `--query "$Q"`). Readability: one short comment on its own line ABOVE
a command, never a long comment trailing the command (it wraps badly in the Word runbook); no `<placeholder>` the
operator must replace when the value can be read from `.env` or a stack output.

**RULE 2b — Every `.env` update is an explicit, one-variable-per-line block.** Wherever the operator must put a
value into `.env`, the runbook says so in this exact form (never buried in a sentence, never several keys on one line):
> **Now update the following variables in `./.env`** (at the snapshot root, `$ACXD_DIST/.env`):
> - `VARIABLE_NAME` = where the value comes from (the command output, stack output or console page that shows
>   it) and how to enter it (format rules such as "paste the whole key").
> - `NEXT_VARIABLE` = ...

Then save the file before the next command. Keys filled by hand, each with this block where the value first appears: `AWS_REGION`,
`CONNECT_INSTANCE_ARN`, `ACXD_API_TOKEN` (Prerequisites), each API's `<API>_URL` and credential (Stage 1: paste
the bullets printed by `openapi-wiring-cli.ts --apis customer-context --runbook` verbatim; the key of an API this solution deploys
is already set), and `ACXD_DEPLOYMENT_KEY` and `HOURS_OF_OPERATION_ARN` (one block at the
end of Stage 2, both needed before the Connect deploy; the hours ARN comes from one `aws connect
list-hours-of-operations` command). The engine writes `ACXD_WORKSPACE_ID` /
`ACXD_APPLICATION_ID`. For those, say "check these were written", not "update".

**RULE 2d — One layout for every section and step, readable on its own.** The runbook is read by people new to
ACXD, often one step at a time. Every `##` section and every step inside it follows the same shape:
1. **A heading, then a blank line.** Steps inside a section are `###` headings (`### 1. Set the region and Connect
   instance`), never bold run-in text, with a blank line between steps.
2. **One or two plain sentences saying what this achieves and why**, before any instruction. Use the plain name
   for a thing before its `.env` key ("the ACXD API key, stored as `ACXD_API_TOKEN`").
3. **How:** the console path or the code block, then the RULE 2b `.env` block if the step fills a key.
4. **Check (optional):** one line on how to confirm it worked.
A step must make sense if read alone: name the console or folder it uses, and never rely on wording from an
earlier step ("as above", "those values"). Do not open a section with a summary of keys or terms that have not
been explained yet; state what is needed first in plain words, then show how.

**RULE 2e — Speak to the reader.** Write in the first person plural or second person, as if walking the reader
through the deployment: "Now that the mock API is deployed, we save its address and key", "Open the ACXD console".
Never describe the reader in the third person ("a person inspects", "the operator runs", "an engineer who
prefers..."). Keep it plain and direct; one or two sentences of why, then the how.

**RULE 3 — One `.env` at the snapshot ROOT, described up front.** There is a single environment file for the
whole deployment, at the snapshot root: `./.env`. It is created for the operator (both `.env` and a reference
`.env.example` are already present in the snapshot — do NOT tell anyone to `cp` or create one). Every stage
reads and writes this same root `.env`; no stage has its own. Immediately after the "Before you start" block
and the SDK-version note (RULE 4), include a **`.env` parameters** section that describes every key and the
create-vs-reuse behaviour, authored EXACTLY like this (values shown as `<…>` placeholders only — never
prescribe a value):

> ## The deployment environment file (`.env`)
>
> All stages share one file at the snapshot root: **`./.env`** (already created for you; a reference
> copy `./.env.example` sits beside it). Each stage fills only the keys it owns — you never copy or move this
> file. Fill a key by editing `./.env` in place.
>
> | Key | Filled by | Required | Description |
> |-----|-----------|----------|-------------|
> | `AWS_REGION` | Operator (Prerequisites) | Yes | The one region for the whole solution — ACXD, Connect, and the backend all deploy here. |
> | `<API>_URL` (one per API) | Backend engineer (Stage 1) | Yes | The API's base URL, pasted as shown (the engine trims a trailing slash): the API's `<ApiId>Url` output of the mock APIs stack, for an API this solution deploys, or your API's URL (pre-filled from its OpenAPI file). |
> | `<API>_KEY` / `_TOKEN` / `_BASIC` (per API) | Backend engineer (Stage 1) | Yes, if the API uses auth | The API's credential. The key of an API this solution deploys is generated in Backend Build; for your API, enter the key or token your provider issued. |
> | `ACXD_LOG_LEVEL` | ACXD engineer (Stage 2) | Optional | Logging verbosity for the deploy engine: `stages` / `objects` (default) / `debug`. A tuning knob — leave as `objects` unless troubleshooting. |
> | `CONNECT_INSTANCE_ARN` | Operator (Prerequisites) | Yes | ARN of your EXISTING Amazon Connect instance (same region), which you have admin access to. The contact flow wires into it; it is never created or deleted by this solution. Left blank in the delivered `.env`. |
> | `ACXD_PROJECT_NAME` | Operator (Prerequisites) | Yes | The canonical `<projectName>` (pre-filled). Names the Connect stack `acxd-<projectName>-<env>-connect`; must match on every run. |
> | `ACXD_ENVIRONMENT` | Operator (Prerequisites) | Optional | Environment suffix for the Connect stack name (default `dev`). Keep it identical across runs. |
> | `ACXD_DEPLOYMENT_KEY` | ACXD engineer (end of Stage 2) | Yes | The ACXD **Deployment key** shown in the console when Stage 2's application deploy completes. |
> | `ACXD_SAMPLE_CUSTOMER_ID` | Connect engineer (Stage 3) | Optional | Pre-fills the Agentic CX block for testing. |
> | `ESCALATION_QUEUE_ARN` | Connect engineer (Stage 3) | Optional | Reuse an existing queue; blank = the stack creates one. |
> | `HOURS_OF_OPERATION_ARN` | Operator (end of Stage 2, from the Connect console) | Yes, unless `ESCALATION_QUEUE_ARN` is set | ARN of the instance's "Basic Hours" (or another hours of operation) for the created queue. |
> | `ACXD_API_TOKEN` | Operator (Prerequisites) | Yes | The ACXD API key, generated by hand in the instance's ACXD Admin Hub (Programmatic Users → Generate API Key). Form `acxd_live_<prefix>.<secret>`, shown once. Never commit it. |
> | `ACXD_APP_DEFAULT_LANGUAGE` | ACXD engineer (Stage 2) | Optional | Default language for a NEW application (e.g. `en-US`, `en-AU`). Used only when creating; ignored if `ACXD_APPLICATION_ID` is reused. |
> | `ACXD_APP_SESSION_TIMEOUT_SECONDS` | ACXD engineer (Stage 2) | Optional | Idle session timeout in SECONDS for a NEW application (engine converts to minutes, max 1440). Used only when creating. |
> | `ACXD_WORKSPACE_ID` | — (engine-managed) | Optional | **REUSE path** — set to reuse an existing workspace (the `ACXD_WORKSPACE_NAME` is then ignored). Leave blank to create; the engine writes the new id back here automatically. |
> | `ACXD_APPLICATION_ID` | — (engine-managed) | Optional | **REUSE path** — set to reuse an existing application (the `ACXD_APPLICATION_NAME` is then ignored). Leave blank to create; the engine writes the new id back here automatically. |
> | `ACXD_WORKSPACE_NAME` | ACXD engineer (Stage 2) | Optional | **CREATE path** — name for a NEW workspace (used only when `ACXD_WORKSPACE_ID` is blank). Letters, digits, spaces, `,` `.` `'` `-`; 1–36 chars. Pre-filled with the projectName-derived default (`<projectName>Workspace`) — edit to rename. |
> | `ACXD_APPLICATION_NAME` | ACXD engineer (Stage 2) | Optional | **CREATE path** — name for a NEW application (used only when `ACXD_APPLICATION_ID` is blank). Letters, digits, spaces, `_` `-`; 1–100 chars. Pre-filled with the projectName-derived default (`<projectName>App`) — edit to rename. |
>
> **You fill these keys by hand**, each at the step that shows its value: `AWS_REGION`, `CONNECT_INSTANCE_ARN`,
> `ACXD_API_TOKEN`, each API's `<API>_URL` (and the credential of your own APIs), `ACXD_DEPLOYMENT_KEY` and
> `HOURS_OF_OPERATION_ARN`. Every other key is pre-filled, or written
> by a runbook step or the engine.
>
> **Workspaces and applications.** In ACXD a use case is deployed as an **application**, inside a **workspace**.
> The workspace is the administrative and policy boundary between teams or organisations, and holds the shared
> resources (context variables, slots, secrets, data requests, knowledge bases). Deploy into ones that already
> exist, or let the deployment create new ones:
> - **Use existing:** set `ACXD_WORKSPACE_ID` and `ACXD_APPLICATION_ID` to their IDs from the ACXD console.
> - **Create new:** leave both IDs blank and set `ACXD_WORKSPACE_NAME` and `ACXD_APPLICATION_NAME` (pre-filled with
>   defaults you can change). Stage 2 creates them and writes their new IDs into `./.env`, so later runs reuse them.
>
> **Re-running:** keeping the IDs updates the same solution. To deploy a separate version side by side, clear both
> IDs and give new names; use a new workspace, since a second application in the same workspace shares its
> resources.

**RULE 4 — SDK version pinning (record near the top).** State the validated SDK version so a later operator
knows the baseline. Read the pinned version from `acxd-sdk/acxd-deploy-engine/package.json` at generation time:

> **ACXD SDK:** this deploy engine is validated against `amazon-connect-acxd-sdk@<version>`. ACXD SDK is early
> and fast-moving and may introduce breaking changes. If `npm install` resolves a newer
> major/minor, treat SDK field/enum/command changes as the first suspect on any failure.

**RULE 5 — a Prerequisites section, then THREE sequential deployment stages**, each fully self-contained (its own prep, commands, and
checks — do NOT front-load prerequisites across the whole runbook, and do NOT put one persona's checks in
another stage). Present them strictly in this order. Use these EXACT section headings, verbatim, as `##` headings — the
consolidated-runbook docx converter matches them by name for page-breaks and completeness, so put any folder
or detail on a SHORT SUBTITLE line beneath the heading, never inside the `##` heading text itself:
`## Prerequisites`, `## Stage 1 — Backend`, `## Stage 2 — ACXD SDK`, `## Stage 3 — Amazon Connect`,
`## Post-deployment Verification`, `## Rollback`. For example, author `## Stage 1 — Backend` then a subtitle
line like `*Backend data source — `backend/mock-integration/`*`, NOT `## Stage 1 — Backend data source (backend/mock-integration/)`. Each stage OWNS the checks and `.env` keys relevant to
it — the backend engineer never sees ACXD-token steps; the ACXD engineer never runs backend tests.

**Prerequisites.** ALWAYS the first section, before Stage 1. Nothing is deployed here: it collects the three
values every later stage needs. Author it EXACTLY in this shape (fill the real region):

> ## Prerequisites
>
> Before deploying, you need an AWS account with an **existing Amazon Connect instance** that you have admin access
> to, in an ACXD-supported region (this project uses `<region>`). This solution does not create one; if you need
> one, see [Create an Amazon Connect instance](https://docs.aws.amazon.com/connect/latest/adminguide/amazon-connect-instances.html).
>
> The deployment then needs three values in the `.env` file at the snapshot root:
>
> 1. `AWS_REGION`: the region the solution deploys to.
> 2. `CONNECT_INSTANCE_ARN`: the identifier of your Amazon Connect instance.
> 3. `ACXD_API_TOKEN`: the API key the deployment uses to sign in to ACXD.
>
> The steps below show how to find each one.
>
> ### 1. Set the region and Connect instance
>
> The solution deploys into the same region as your Amazon Connect instance, and connects to that instance.
>
> In the Amazon Connect console, open your instance and copy its **Instance ARN** from the **Overview** page.
>
> **Now update the following variables in `./.env`:**
> - `AWS_REGION` = the region your instance is in (for this project, `<region>`).
> - `CONNECT_INSTANCE_ARN` = the Instance ARN you copied (`arn:aws:connect:...:instance/<id>`).
>
> ### 2. Generate the ACXD API key
>
> The deployment signs in to Agentic CX Designer (ACXD) with an API key. ACXD only issues this key in its own
> console, so this is a manual step.
>
> From your Amazon Connect instance, open Agentic CX Designer, go to **Admin Hub → Programmatic Users**, create a
> programmatic user if you don't have one, and choose **Generate API Key**. The key is shown only once.
>
> **Now update the following variable in `./.env`:**
> - `ACXD_API_TOKEN` = the generated key (`acxd_live_<prefix>.<secret>`); paste the whole value.
>
> Keep it private: store it only in `./.env`, never commit it to git, and never paste it into chat.
>
> ### 3. Check your AWS access and prepare the account for CDK
>
> The stages deploy with the AWS CLI and the AWS CDK, so your terminal needs credentials for this account, and the
> account needs a one-time CDK setup (bootstrap).
>
> ```bash
> cd "$ACXD_DIST"
> set -a; . ./.env; set +a
> # Confirms which AWS account your credentials use.
> aws sts get-caller-identity
> # One-time CDK setup for this account and region (safe to re-run).
> npx --yes cdk bootstrap "aws://$(aws sts get-caller-identity --query Account --output text)/$AWS_REGION"
> ```
>
> **Check:** the account shown is the one you expect, and your instance shows **Active** in the Amazon Connect
> console.

Because bootstrap now lives here, the stage code blocks do NOT repeat the bootstrap command.

Never write a CDK or CLI step that creates an Amazon Connect instance, and never describe instance creation as a
runbook stage. These apply to every scope, including the minimal `acxd-poc`.


**Stage 1 — Backend data source** (`backend/mock-integration/` or `backend/adapter-integration/`). The API
that serves the ACXD data requests. Which folder is present was decided per data source at discovery:
- **`backend/mock-integration/`** — synthetic data (POC/demo/no live API yet). Copied from the fixed tool;
  the agent authored only `apis/<apiId>/data/` and optional `apis/<apiId>/ops/`, one folder per generated API.
  ONE command deploys the parent stack `acxd-<projectName>-<env>-mock-apis`, with one nested stack (API Gateway +
  Lambda) per API.
- **`backend/adapter-integration/`** — a live API that needs translation (auth/flatten/private-VPC).
- **Neither** — if every data request hits a live API that fits ACXD directly, there is NO backend folder;
  skip this stage and just configure the Data Request + Secret. (A use case may mix direct + mocked requests.)

*Stage 1 checks (owned here):* backend content validates and unit tests are green; AWS credentials are active
for the target region. For **mock-integration** (the common case), author Stage 1 as three `###` steps in the
RULE 2d layout (heading, blank line, what and why, how, check). Open the section with one sentence: *"This stage
deploys the mock API that stands in for your business systems, so ACXD has data to call."*

`### 1. Deploy the mock APIs`: what and why, e.g. *"Checks the mock data, then deploys each API (its own API
Gateway and Lambda) in your account, all in one stack. The name and region come from `./.env`."*
```bash
cd "$ACXD_DIST"
set -a; . ./.env; set +a
cd backend/mock-integration
# Lists each API and its operations; a non-zero exit means fix a data/ops file first.
python3 validate.py
cd cdk
npm install
npm run deploy
```
One command deploys every API. Each API's key is already in `./.env`; the name, region and environment come
from `./.env` too, so the command takes no flags. Do NOT put `cdk bootstrap` here: it runs once in Prerequisites.
(For **adapter-integration**, deploy `backend/adapter-integration/cdk` the same way with
`--context environment="${ACXD_ENVIRONMENT:-dev}" --context projectName="$ACXD_PROJECT_NAME" --context region="$AWS_REGION"`.)

`### 2. Save the API addresses`: what and why, e.g. *"ACXD calls each API with its address and credential. Put
them in `./.env` so the test below and Stage 2 use the same values."*

The deploy prints one **`<ApiId>Url`** output per API (also in **CloudFormation → the `-mock-apis` stack → Outputs**).
Each key is already in `./.env`. Then paste the API bullets printed by
`npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/openapi-wiring-cli.ts --apis customer-context --runbook`
verbatim, as the RULE 2b block (one bullet per API URL and credential; never write these bullets yourself).

`### 3. Test the APIs`: what and why, e.g. *"Calls the API with the saved address and key, to confirm it
answers before ACXD uses it (creating the ACXD resources does not test the address)."* The operation sits at the
API Gateway stage root: append `/<operation>` to the base URL.
```bash
cd "$ACXD_DIST"
set -a; . ./.env; set +a
curl "${BILLING_API_URL%/}/<operation>?<param>=<value>" -H "x-api-key: $BILLING_API_KEY"
```
Write the URL as `${<API>_URL%/}` so a trailing slash in `.env` never doubles up. One test per API, using its own `.env` names and its auth header (`x-api-key`, `Authorization: Bearer $<API>_TOKEN`
or `Authorization: Basic $<API>_BASIC`, as the OpenAPI file declares).
Populate `<operation>` and `<param>=<value>` from THIS project's mock data (the first row of the Mock API Test Data
table below for that API), so the operator can run it verbatim. A POST operation sends a JSON body with
`-H "Content-Type: application/json" -d '{...}'`. The engine creates the ACXD secrets from these `.env` values in
Stage 2, so a passing test confirms exactly what will be deployed.

**MANDATORY — immediately after the smoke-test, author a `Mock API Test Data` table.** Directly below the
curl smoke-test example (the example shows the expected response SHAPE; the table gives the operator the actual
values to test with). Do NOT leave it to prose or a single inlined example — hardcode a table populated from the
mock data you generated for THIS project (`backend/mock-integration/apis/*/data/*.json`, one table section per API), so a tester has every valid
identity in one place. Include EVERY seeded record (not one sample), with the fields a tester needs to drive the
flows end to end. Minimum columns: the lookup key (e.g. account number), the secret/verifier (e.g. PIN), and the
key response fields a tester checks (e.g. the returned ref, customer name, and what each record is useful for —
e.g. "multi-policy, loyalty10"). Identifiers hyphen-free. Example shape (populate from the actual mock data):

```
| Account number | PIN  | Returns (accountRef / name) | Policies / notes |
|----------------|------|-----------------------------|------------------|
| ACC10021       | 4821 | REF10021 / Sam Rivers       | 2 policies; loyalty5; multi-policy eligible |
| ...            | ...  | ...                         | ... |
```

Add any other per-operation reference data a tester needs (e.g. ratable product lines and base quotes, discount
rates) as short companion tables in the same section, so the whole mock dataset is documented in one place.


**Stage 2 — ACXD SDK** (`acxd-sdk/acxd-deploy-engine/`). One command runs the shipped deterministic engine
to PROVISION the ACXD solution — workspace → resources → flows → application — creating each object, settling,
reading ids, and writing `ACXD_WORKSPACE_ID`/`ACXD_APPLICATION_ID` back to the root `.env`. **The engine stops
after creating the application. It does NOT build or deploy** — that is a manual, human-reviewed step below.

*Stage 2 checks (owned here):* `ACXD_API_TOKEN` is set in `./.env` and not expired; `AWS_REGION` is set;
Bedrock model access is enabled for the chosen model. Author Stage 2 as `###` steps in the RULE 2d layout. Open
the section with one sentence: *"This stage creates the ACXD solution (workspace, resources, flows and
application), then you review, build and deploy it in the ACXD console."*

`### 1. Create the ACXD solution`: what and why, e.g. *"Runs the deploy engine, which creates the workspace, its
resources, the flows and the application in ACXD, and saves their IDs to `./.env`. It does not build or deploy."*
The engine reads the root `.env` via `ACXD_ENV_FILE` and resolves `resources/` and `flows/` relative to the
config, so it runs correctly from the engine dir:
```bash
cd "$ACXD_DIST"
set -a; . ./.env; set +a
cd acxd-sdk/acxd-deploy-engine
npm install
ACXD_ENV_FILE=../../.env ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy
```
When it finishes, confirm `ACXD_WORKSPACE_ID`/`ACXD_APPLICATION_ID` were written back to `./.env`.

Then author the review, build-and-deploy and test as their own `###` steps (ACXD engineer, never automated), each
opening with a what-and-why sentence in the reader's voice (RULE 2e):

`### 2. Review the solution in the ACXD console`, `### 3. Build and deploy the application`, `### 4. Test it`,
`### 5. Save the deployment key and the queue's opening hours`. Content for each:

1. **Review the solution.** e.g. *"Now that the ACXD resources and flows have been created, we review them quickly in
   the ACXD console."* How: in the ACXD console, open the workspace, select the application the engine created and
   choose **Resources** in the left-hand menu. Confirm the flows, data requests, context variables, slot types,
   knowledge bases and default-flow mapping are all present.
2. **Build and deploy the application.** e.g. *"Next we build and deploy the application in the ACXD console, which
   also validates every flow."* How: select the application, choose **Deploy** from the top menu, turn on the
   **One-click deploy** switch, choose the target environment and choose **Build & Deploy**. If validation reports
   a problem (for example "reference not attached", "not defined" or an unfilled data request), do not fix it by editing the flow in the console: the next deploy from this snapshot
   would overwrite the change, and the design and the snapshot would no longer match. Note the error and fix it in
   the source (the flow specs or resource files), then re-run Stage 2 step 1 and this step. A quick console edit is
   fine only to unblock a test, as long as the same change is then made in the source.
3. **Test it.** e.g. *"Before connecting Amazon Connect, we check the conversation works in the test widget."*
   Use the console's test surfaces and widget to run the main journeys.
4. **Save the deployment key and the queue's opening hours.** e.g. *"The Amazon Connect stack in Stage 3 needs the
   deployment key and the opening hours for its hand-off queue, so we save both now."* When the deploy completes,
   the console shows the **Deployment key** (Application → Deployments). For the opening hours, run:
```bash
cd "$ACXD_DIST"
set -a; . ./.env; set +a
INSTANCE_ID=${CONNECT_INSTANCE_ARN##*/}
Q="HoursOfOperationSummaryList[?Name=='Basic Hours'].Arn"
aws connect list-hours-of-operations --instance-id "$INSTANCE_ID" --region "$AWS_REGION" --query "$Q" --output text
```
   It prints the ARN of your instance's built-in **Basic Hours**. If it prints nothing, your instance has no
   "Basic Hours": run the command without `--query "$Q"` to list all hours of operation and pick one. Then author a
   RULE 2b block: *Now update the following variables in `./.env`:*
   - `ACXD_DEPLOYMENT_KEY` = the **Deployment key** shown in the ACXD console; paste it exactly as shown.
   - `HOURS_OF_OPERATION_ARN` = the ARN the command printed. Leave it blank only if you set `ESCALATION_QUEUE_ARN`
     to reuse an existing queue.

**Stage 3 — Amazon Connect integration flow** (`backend/connect/`). Deploys the best-practice contact flow
(`mainflow.json` — Agentic CX block + logging + Contact Lens analytics + escalation hand-off), the escalation
queue, and a routing profile. There is **no Lex bot and no Lex IAM** — the flow reaches ACXD through the
Agentic CX block. Skip ONLY for the minimal `acxd-poc` scope.

*Stage 3 checks (owned here):* `CONNECT_INSTANCE_ARN` is set (from Prerequisites), `ACXD_DEPLOYMENT_KEY` is
filled, and `HOURS_OF_OPERATION_ARN` is set unless `ESCALATION_QUEUE_ARN` reuses a queue.

**Author Stage 3 as one `###` step in the RULE 2d layout.** Open the section with one sentence: *"This stage
connects your Amazon Connect instance to the ACXD application, so calls and chats reach the agent, and adds a
queue for hand-off to a person."* It deploys LAST because it uses the Workspace, Application and Deployment key
from Stage 2, as one stack, `acxd-<projectName>-<env>-connect`, in the existing instance. `ACXD_DEPLOYMENT_KEY` and
`HOURS_OF_OPERATION_ARN` are already in `./.env` from the end of Stage 2; never describe the deploy as finding or
writing the hours ARN (the stack only reads it).

`### 1. Deploy the Connect integration`: what and why, e.g. *"Creates the contact flow that routes customers to
ACXD, the hand-off queue and a routing profile. It reads every value from `./.env`."*
```bash
cd "$ACXD_DIST"
set -a; . ./.env; set +a
# Both must be set (end of Stage 2); HOURS_OF_OPERATION_ARN may be blank only when ESCALATION_QUEUE_ARN is set.
grep -E '^(ACXD_DEPLOYMENT_KEY|HOURS_OF_OPERATION_ARN|ESCALATION_QUEUE_ARN)=' ./.env
cd backend/connect/cdk
npm install
npm run deploy
```
The stack fails fast (at synth) if any of the three ACXD values is missing, rather than deploying a flow that only
errors at conversation time. Record the outputs (contact flow ARN, escalation queue ARN, routing profile ARN).
Customer-specific setup (claim a phone number and point it at the contact flow, assign agents to the routing
profile, set hours of operation, choose the Set-voice persona) is a documented post-deploy step: list it in the
post-deployment section, do not block the runbook on it. The instance is a prerequisite, so this stage is never
deferred for lack of an instance.

**`.env` is the ONLY source for Connect values.** The Connect command in the runbook is `npm run deploy`, run from
`backend/connect/cdk` inside the snapshot; the app loads `./.env` at the snapshot root itself
(resolved from its own location, not the shell's cwd) and prints which file it loaded. Never put
`--context` flags or `ACXD_ENV_FILE=` on the Connect command, and never ask the operator to type a value on the
command line that also lives in `.env`. (The standard section opener still loads `.env`; the app reads the file
itself, and the file wins over the shell.) To change a value, edit `./.env` and re-run.

**RULE 6 — Also cover, each in its own short section:** what to monitor per stage; post-deployment
verification (the console finish steps + widget smoke tests); rollback criteria/procedure; and token rotation
`[GA-GAP]` (API tokens rotated manually). Keep each scannable — short paragraphs or lists, not walls of text.

### Step 7: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-build-deploy --result awaiting-approval`.

### Step 8: Present Completion & Request Approval

Review path: this stage's engine-resolved record dir.

**Design changes made during build (MANDATORY section: a failed check is a design defect, never drop behaviour to pass it):** list every behavioural change made in this stage (what changed, why, effect on the customer outcome), or state "None". Mechanical reconciliations do not belong here.
**Pre-gate runbook checklist (MANDATORY — re-read `acxd-deployment-runbook.md` and confirm each item before
the gate; fix any that fail, do not rewrite the runbook in a shorter form of your own):**
1. A `Mock API Test Data` table directly after the Stage 1 smoke test, with ONE ROW PER SEEDED RECORD from
   `backend/mock-integration/apis/*/data/*.json` (lookup key, verifier such as the PIN, the key response fields), not a
   single inline example. Omit only when no mock backend is deployed.
2. Stage 1's RULE 2b API block is the `openapi-wiring-cli.ts --runbook` output pasted verbatim, and each API's
   smoke test sources `.env` and uses its own `$<API>_URL` and credential variable (no pasted URL or key values).
3. `ACXD_DIST=$(pwd)` is captured once in "Before you start", and every section's first code block starts with
   `cd "$ACXD_DIST"` then `set -a; . ./.env; set +a`.
3a. Every `##` section opens with a one-sentence purpose, and every step is a `###` heading followed by a blank
   line, a plain what-and-why sentence, then the how (RULE 2d). Prerequisites lists its three values before the
   steps that set them, and holds the one-time CDK bootstrap.
3b. No command hard-codes a value that lives in `.env`: region, project name, environment and account come from
   `$AWS_REGION`, `$ACXD_PROJECT_NAME`, `${ACXD_ENVIRONMENT:-dev}` and `aws sts get-caller-identity`. Comments sit on
   their own line above a command, never trailing it. Hand-filled RULE 2b updates: `AWS_REGION`,
   `CONNECT_INSTANCE_ARN`, `ACXD_API_TOKEN`, each API's `<API>_URL` and credential, `ACXD_DEPLOYMENT_KEY`,
   `HOURS_OF_OPERATION_ARN`.
3c. The text speaks to the reader (RULE 2e): no "a person", "the operator" or "an engineer" describing the reader.
   Stage 2 has no SDK build/deploy alternative and no separate Build step; console validation problems are fixed in
   the source, not by editing flows in the console.
3e. The runbook passes the converter's structure check (the gate runs it; run it yourself first and fix every error
   it lists): `python3 {{HARNESS_DIR}}/tools/acxd-md-to-docx/runbook_md_to_docx.py <record>/acxd-deployment-runbook.md --check-only`.
   It requires, with these exact `###` headings: Prerequisites step `Check your AWS access and prepare the account for
   CDK` (the one-time `cdk bootstrap`); Stage 2 steps `Create the ACXD solution`, `Review the solution`, `Build and
   deploy the application`, `Test it`, `Save the deployment key`; and the `Mock API Test Data` table after the Stage 1
   smoke test.
3d. Stage 2 step 1 runs the engine with the full command
   `ACXD_ENV_FILE=../../.env ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy` (never a bare `npm run
   deploy`), and Stage 2 has all five steps: Create the ACXD solution, Review the solution, Build and deploy the
   application, Test it, Save the deployment key. The docx converter refuses to convert a runbook missing either.
4. The Stage 1 mock deploy and the Stage 3 Connect deploy are both `npm run deploy` with no `--context` flags (both
   read `./.env`), and neither block contains `cdk bootstrap` (it is in Prerequisites only).
5. The `.env` parameters table lists every key, and every secret's env var is present in `./.env.example`.
   Every operator `.env` update uses the RULE 2b block ("Now update the following variables in `./.env`", one
   variable per line with where to get it and how to enter it).
6. If any knowledge base is deployed, Stage 2 says where its content lives (`acxd-sdk/resources/kb/<kbName>/`),
   that the engine loads and re-publishes it automatically, and how to confirm it (the engine's
   `knowledgeBase <name>: N item(s) loaded` lines, then the KB's documents/articles in the ACXD console), plus
   how to replace the synthetic content with real content (swap the files and re-run the deploy).
The docx converter also warns on items 1-2; treat its warnings as failures to fix before the gate.

Standard 2-option approval (Approve / Request Changes).
STOP for the human response. Report Approve with
`--result approved --user-input "<exact choice>"`; report
Request Changes with `--result rejected --user-input "<feedback>"`, revise the
artifacts, then report `--result revised` before re-presenting.

## Exit criteria

Checked by code when the approval gate opens; the gate stays closed until each passes. Fix the runbook, not the check.

- run: `python3 {{HARNESS_DIR}}/tools/acxd-md-to-docx/runbook_md_to_docx.py "<record>/acxd-deployment-runbook.md" --check-only`

## Learn

While running this stage, record observations in the engine-created
`<record>/<phase>/<stage>/memory.md`. Treat it as an output-only target:
never read, probe, create, or initialize it. Follow the active harness's
diary-write discipline: add entries through the stage's review-step ritual
(NOT by hand-editing `memory.md`) — the ritual records them under Interpretations,
Deviations, Tradeoffs, and Open questions, each with an ISO 8601 timestamp.

Record an entry only when a **genuine insight arose while running this stage** — a platform constraint you discovered, a non-obvious tradeoff you weighed, a workaround you found, or something that behaved unexpectedly and how you resolved it. These are the observations worth carrying to a future run.

The configuration and settings the user selected during the stage are captured in the stage artifacts and belong there — a restatement of a chosen engagement pattern, an authoritative SoP, a scope, or any selected option is a record of the decision, not a learning, so leave it out of `memory.md`. Most runs produce nothing worth recording under Interpretations, Deviations, or Tradeoffs; an empty stage memory is the normal, expected outcome.
