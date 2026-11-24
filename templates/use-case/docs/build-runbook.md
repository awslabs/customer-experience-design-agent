# <Use Case Name>: ACXD Build Runbook

<!-- AGENT: Prescriptive, step-by-step build guide. Every step names the exact console location or
     SDK command. Paste-ready values. Build order per Rule 0. Amazon writing style, no em dashes.
     All SDK operations use amazon-connect-acxd-sdk — NO cURL, NO REST, NO Beta/Gamma.
     All backend IaC uses CDK (TypeScript); Lambda handlers are Python — NO SAM.
     Every resource description follows: What / Inputs / Outputs / Consumers / Owner (≤200 chars for ACXD).
     Full descriptions in the resource inventory manifest. -->

## Naming Convention

Workspace-level resources use camelCase with xx prefix: `xxAccountId`, `xxGetRecord`, `xxVerifyIdentity`.
Flows and applications use PascalCase with XX prefix: `XXVerifyIdentity`, `XXHomeApp`.
Replace `xx`/`XX` with a short engagement-specific tag.
Every flow is named in the use-case namespace, e.g. `quoteMain`, `quoteEscalation`.

**Variable colour legend:** 🟪 local; 🟩 slot; 🟧 data request; 🩷 context/secret; 🩵 system.

## 0. Build Order

**Prerequisites (do this FIRST).** You need an AWS account with an **existing Amazon Connect instance you have
admin access to**, in an ACXD-supported region. This solution does not create one; if you need one, see
[Create an Amazon Connect instance](https://docs.aws.amazon.com/connect/latest/adminguide/amazon-connect-instances.html). ACXD is accessed *through* that instance: the ACXD workspace, applications, and
the API key the deploy scripts authenticate with are all created from the ACXD Admin Hub, which you reach by
opening your Connect instance.

0. **Prerequisite gate:**
   a. **Connect instance** — note its ARN for `CONNECT_INSTANCE_ARN` (Amazon Connect console → your instance →
      Overview).
   b. **Generate the ACXD API key (MANUAL — no automation exists):** open the Connect instance → Agentic CX
      Designer → Admin Hub → Programmatic Users → create a programmatic user with an Administrator role →
      Generate API Key (format `acxd_live_<prefix>.<secret>`; shown once — copy it). Put it in the deploy
      `.env` as `ACXD_API_TOKEN`.
   This gate cannot be collapsed into the automated build — a human must generate the key before the ACXD build.
1. Deploy backend (CDK stack — API Gateway, stateless adapter Lambda(s), CloudWatch alarms; data store only if justified)
2. Create workspace secrets (API base URL + API key from CDK outputs)
3. Create workspace resources (context variables, custom slots, guardrails)
4. Create data requests (one per backend operation, pointed at the deployed API)
5. Create knowledge bases (if applicable)
6. Build Redirect-target flows FIRST (e.g. escalation), then the flows that redirect to them
7. Assemble application (attach flows, NLP engine, channel, default behaviours, guardrails)
8. Build and deploy the application
9. Test (data request Run Test, then flow/app tests in widget)
10. Wire delivery channel (Amazon Connect contact flow — the `backend/connect/cdk` stack, deployed LAST; it
    needs the ACXD Workspace/Application/Deployment-key from step 8 AND your existing instance from step 0a)

<!-- AGENT: The Connect instance is a PREREQUISITE the operator supplies by ARN; never add a step that creates
     it. Step 0b (API key) is ALWAYS manual — no SDK/CDK path exists; do not imply it can be scripted.
     Steps 1-3 can be done via Node SDK scripts (see sdk/create-resources.ts).
     Steps 6-7 (flows) are created via the SDK with full node graphs (see sdk/create-resources.ts). Console canvas/import is a manual fallback only.
     Steps 8 can be done via Node SDK scripts (see sdk/build-and-deploy.ts). -->

## 1. Deploy Backend

```bash
cd backend/adapter-integration/cdk
npm install                    # install CDK deps (aws-cdk, cdk-nag, tsx) — REQUIRED before any cdk command
# Once per account and region (safe to re-run).
npx cdk bootstrap aws://<account>/<region>
npx cdk synth  --context environment=dev --context projectName=<use-case> --context region=<region>   # cdk-nag runs as a synth Aspect — must pass with zero findings
npx cdk deploy --context environment=dev --context projectName=<use-case> --context region=<region>
```

> **Pin `<region>` explicitly** — the chosen deployment region (default = the ACXD workspace / Amazon Connect
> instance region for co-location). Never rely on the ambient `AWS_REGION` / CLI-profile default, or the
> stack may deploy to an unintended region.

> Always run `npm install` first — `cdk.json` runs the app via `npx tsx app.ts`, and `tsx` is a local
> dependency. Use `npx cdk ...` so the locally-pinned CDK is used rather than a (possibly missing) global one.

Record each API's `<ApiId>Url` output and put it in `./.env` as the API's `<API>_URL` (paste it as shown). The key is
already in `./.env` (generated in Backend Build), so there is nothing to look up.

**Smoke-test each API** before touching ACXD (data-request creation does NOT test the URL). Read the values
**straight from `./.env`**, so the test uses the same values the deployment will use. Order: update `.env` FIRST,
then run the smoke-test.

```bash
# Run from the snapshot root (where ./.env lives), after setting the API's URL in ./.env.
set -a; . ./.env; set +a
curl "${BILLING_API_URL%/}/<operation>?<param>=<value>" -H "x-api-key: $BILLING_API_KEY"
```

Use each API's own `.env` names and auth header (the API wiring tool prints them with `--runbook`).
Fill `<operation>` and `<param>=<value>` from the first row of the test-data table below so it runs verbatim.

**Mock API Test Data** (hardcode from the generated `backend/.../data/*.json`; include EVERY seeded record,
not one example). After the smoke-test, give the tester every valid identity in one place:

| Account number | PIN | Returns (ref / name) | Policies / notes |
|----------------|-----|----------------------|------------------|
| <ACCxxxxx>     | <pin> | <ref> / <name>     | <what this record exercises> |

Add short companion tables for any other per-operation reference data a tester needs (ratable product lines +
base quotes, discount rates, etc.), so the whole mock dataset is documented here.

## 2. Workspace Secrets

<!-- AGENT: Create via Node SDK (CreateSecretCommand) or in the ACXD UI (Settings → Secrets). -->

| Secret Name | Value Source | Description (≤200 chars) |
|------------|-------------|--------------------------|
| `xxApiBase` | CDK output `ApiUrl` | Backend API base URL. Consumers: all data requests. |
| `xxApiKey` | API Gateway key value | Backend API key. Consumers: all data requests. |

## 3. Workspace Resources

### 3.1 Context Variables

<!-- AGENT: Create via Node SDK or in ACXD UI (Resources → Context Variables → Create). -->

| Name | Type | Description (≤200 chars) |
|------|------|--------------------------|
| `xxVerified` | Boolean | Auth status. Set by shared-verify-identity. Consumers: all downstream flows. |
| `xxCustomerId` | String | CRM customer ID. Set by shared-verify-identity on success. |
| `xxCustomerName` | String | Customer display name. Set by shared-verify-identity on success. |
| `xxRetryCount` | Number | Auth retry counter. Set/incremented by shared-verify-identity. |
| `xxEscalationReason` | String | Reason for escalation. Set by any flow before redirecting to escalation. |

### 3.2 Custom Slot Types

<!-- AGENT: Create via Node SDK (CreateSlotTypeCommand) or ACXD UI (Resources → Slot Types).
     Built-in types (NLX.AlphaNumeric, NLX.Date, NLX.Number) do not need creation. -->

| Slot Type | Values | Description (≤200 chars) |
|-----------|--------|--------------------------|
| `xxYesNo` | yes (yeah, yep, correct, right), no (nah, nope, negative) | Binary confirmation. Consumers: multiple flows. |

### 3.3 Guardrails

<!-- AGENT: Create in ACXD UI (Resources → Guardrails). Reference after target flows exist. -->

| Guardrail | Type | Rules | Description (≤200 chars) |
|-----------|------|-------|--------------------------|
| `xxCompliance` | Output | No financial advice, no competitor mentions, no PII echo | Compliance boundary. Consumers: all Generative Journey nodes. |

## 4. Data Requests

<!-- AGENT: Create via Node SDK (CreateDataRequestCommand) or ACXD UI (Resources → Data Requests).
     Each data request: Method POST, Mode External, URL from secret ({xxApiBase}/<operation>),
     header x-api-key from secret ({xxApiKey}).
     (CONSOLE UI path) Paste a data SAMPLE (values) into the Response model — the UI infers the schema.
     NOTE: the SDK path is the OPPOSITE — CreateDataRequestCommand requires a JSON Schema, not a sample.
     Run Test after creation to verify the backend responds correctly. -->

### xxVerifyIdentity

| Field | Value |
|-------|-------|
| **Name** | `xxVerifyIdentity` |
| **URL** | `{xxApiBase}/verify-identity` |
| **Method** | POST |
| **Headers** | `x-api-key: {xxApiKey}` |
| **Request model** (paste sample) | `{"accountId": "A1001", "dateOfBirth": "1990-01-15"}` |
| **Response model** (paste sample) | `{"verified": true, "customerId": "CUST12345", "customerName": "Jane Smith"}` |
| **Description** | Verifies caller identity via account + DOB. In: accountId, dateOfBirth. Out: verified, customerId, customerName. |

**Run Test:** After creation, click Run Test. Verify the response matches the expected shape.

<!-- AGENT: Add one section per data request. Follow the same format. -->

## 5. Knowledge Bases

<!-- AGENT: Create in ACXD UI (Resources → Knowledge Bases). Ingest content. Optional. -->

| Name | Type | Content Source | Description (≤200 chars) |
|------|------|---------------|--------------------------|
| `xxProductFAQ` | Q&A | <source> | Product FAQ. Consumers: agentic servicing Generative Journey tool. Owner: product team. |

## 6. Flows

<!-- AGENT: Build Redirect-target flows FIRST, then the flows that redirect to them.
     Author each flow as a node-graph document at flows/<flowId>.flow.json (shape per acxd-sdk-idl.ts +
     acxd-node-reference.md); the deploy engine creates them via CreateFlowCommand in the ACXD SDK stage,
     Redirect-target flows first per the config's flows.order. Console drag-and-drop import is a fallback only.
     Sequence: quoteEscalation → quoteMain.
     After deploy, review each flow in the ACXD console to verify nodes and connections.
     Note: analytics tags may need to be selected once in the console to appear as dashboard dimensions. -->

### 6.1 shared-escalation

- **Flow document:** `flows/quoteEscalation.flow.json` (engine-created via CreateFlowCommand)
- **Purpose:** Shared escalation component. Generates call summary, transfers to agent.
- **Analytics tags:** `escalated`
- **Review in console after deploy:** Generative Text prompt, Escalate node configuration.

### 6.2 shared-verify-identity

- **Flow document:** `flows/quoteMain.flow.json` (engine-created via CreateFlowCommand)
- **Purpose:** 2-factor identity verification with bounded retries.
- **Analytics tags:** `authSuccess`, `authFailed`, `authMaxRetries`, `noMatch`
- **Review in console after deploy:** Slot attachments (xxAccountId, xxDateOfBirth), data request reference, context variable state modifications, retry counter logic.

### 6.3 xx-<service>

<!-- AGENT: Build per engagement. Use Recipe 3 (agentic) or a deterministic pattern.
     Apply analytics tags per the tag vocabulary. -->

### 6.4 xx-welcome-router

- **Flow document:** `flows/welcomeRouter.flow.json` (engine-created via CreateFlowCommand)
- **Purpose:** Entry point. Greeting, intent classification, route to matched flow.
- **Analytics tags:** `noMatch`
- **Verify:** `user_choice` intent slot values/synonyms, and Redirect (Recognized flow) configuration. (No `user_input` node — intent is a `user_choice` + `split`.)
- **Note:** created LAST in flows.order — Redirect targets must exist first.

## 7. Application Assembly

<!-- AGENT: Create in ACXD UI (Applications → Create) or via Node SDK (CreateApplicationCommand). -->

| Setting | Value |
|---------|-------|
| **Name** | `XX<ProjectName>App` |
| **Attached flows** | xx-welcome-router, shared-verify-identity, xx-<service>, shared-escalation |
| **Entry flow** | xx-welcome-router |
| **NLP engine** | Amazon Lex (for Connect) |
| **Default behaviours** | Welcome → xx-welcome-router, Fallback → agent, Unknown → re-prompt |
| **Guardrails** | xxCompliance |
| **Languages** | en-US |
| **Description** | <Use case name> application. Contains <N> flows for <purpose>. Owner: <team>. |

## 8. Build and Deploy

```bash
# Via Node SDK script:
cd sdk
cp .env.example .env                     # then fill in ACXD_API_TOKEN, ACXD_WORKSPACE_ID, etc.
npm install                              # REQUIRED first — installs amazon-connect-acxd-sdk, tsx, dotenv
npm run build:app -- --env dev           # .env is auto-loaded (dotenv) — no need to export/prefix vars
npm run deploy:app -- --env dev
npm run verify:app -- --env dev
```

> **Env vars are auto-loaded from `sdk/.env`** (via `dotenv`) — you do NOT need to `export` or prefix
> `ACXD_API_TOKEN=...` on each command. Just fill in `.env` (copied from `.env.example`) once.
> Run `npm install` before any SDK script — the scripts import `amazon-connect-acxd-sdk` and run via `tsx`,
> both local dependencies. Skipping install fails with `command not found` / `Cannot find module`.
> Never commit the real `.env` — keep it in `.gitignore`.

Or manually: Deployment Status → Build and Deploy → Create Build → (wait) → Deploy.

**Rebuild after every change.** The runtime uses the built artifact, not unsaved Canvas edits.

## 9. Test

1. **Data request tests:** Run Test on each data request in the ACXD UI.
2. **Widget tests (chat first):** Open the test widget. Run through:
   - Happy path: greet → intent → verify → service → resolve
   - Auth failure: wrong DOB 3 times → escalation
   - No-match: unintelligible input → re-prompt → escalation after limit
   - Edge cases: silence, profanity, unexpected numbers
3. **Widget tests (voice):** Repeat key scenarios with voice input.
4. **Analytics verification:** Confirm tags fire on expected paths in the ACXD analytics dashboard.
5. **Backend verification:** Check CloudWatch dashboard for Lambda errors, API latency.

## 10. Channel Wiring

<!-- AGENT: Amazon Connect contact flow configuration. -->

| Step | Action |
|------|--------|
| Create Connect contact flow | Route to ACXD application via the Agentic CX block (Workspace/Application/Alias) |
| TTS voice | Select voice for the use case |
| Escalation channel | Configure Instance ID, Contact Flow ID, IAM Role ARN |
| Call summary | Surface xxCallSummary as a contact attribute for the agent |
| Barge-in | Configure on the contact flow / Agentic CX block (ASR settings) as required |
| Phone number | Assign a phone number to the contact flow |

## Notes

<!-- AGENT: Engagement-specific observations and any net-new platform findings to capture
