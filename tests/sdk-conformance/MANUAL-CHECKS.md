# SDK conformance checks (run on every `amazon-connect-acxd-sdk` bump)

The deploy engine depends on platform behaviour that the SDK model does not document. Each behaviour is a
pattern in `knowledge/acxd-platform-agent/acxd-counter-intuitive-patterns.md`, stamped
`[verified-as-of SDK x.y.z]`. On every SDK bump, re-run these checks before releasing. When a check passes,
update the stamp. When a check shows CHANGED, the platform has moved: update the pattern, the engine code
that enforces it, and its test, or retire the pattern if the workaround is no longer needed.

The checks run against a deployed AnyCare Insurance quote PoC: its distribution folder, its `.env` and its
workspace. The deployed solution must be the one built with the new SDK version (deploy it from the runbook
first). The automated probes add a few flows named `sdkProbe…` to that workspace and delete them afterwards;
they never touch the PoC's own flows.

## 0. Set up the shell (once per terminal)

```bash
REPO=~/Desktop/customer-experience-design-agent
ACXD_DIST=~/Desktop/acxd-aidlc-kiro-poc-NN/anyCareInsuranceQuote-dist-YYYYMMDD-HHMM
cd "$ACXD_DIST"
set -a; . ./.env; set +a
```

Replace `NN` and the date with the PoC you are checking. The `.env` already holds `AWS_REGION`,
`ACXD_API_TOKEN` and `ACXD_WORKSPACE_ID` from the deploy.

## 1. Automated checks (about 2 minutes)

```bash
cd "$REPO/tools/acxd-deploy-engine"
npm install
ACXD_ENV_FILE="$ACXD_DIST/.env" npx tsx ../../tests/sdk-conformance/sdk-conformance.ts --keep
```

`--keep` leaves the probe flows in the workspace for console check M8. Section 3 removes them.

| Check | Pattern | What it proves |
|---|---|---|
| P1 | 1, 2 | Data-request exits keep their targets in the engine's order (in_progress first, unwired) |
| P3 | user-choice binding | A user choice's slot binding survives CreateFlow (`source: slotType`, `slotTypeId`) |
| P4 | typed values | Number and boolean constants are stored typed, not as strings |
| P5 | split model | `split.modelType` is stored as sent |
| P6 | idempotency | Which error CreateFlow returns for an existing flow (the engine treats 500 as "exists"; 409 is also fine) |

Exit code 0 = all pass; 1 = at least one CHANGED or ERROR.

## 2. Console checks (about 15 minutes)

Open the PoC's workspace and the `anyCareInsuranceQuoteApp` application in the ACXD console. For test-widget
checks, use a customer from the runbook's **Mock API Test Data** table (`deployment/` in the distribution
folder). For mock API calls, look at the mock Lambda's CloudWatch log (the runbook's Stage 1 names the stack).

| # | Pattern | Steps | Expected |
|---|---|---|---|
| M1 | 1 | Open flow `quoteMain`, node **Verify identity**. Check its success, timeout and failure exits | Each exit goes to its own target; none moved to the success target |
| M2 | 2 | Same node: look for an in_progress exit | Present and unconnected; no canvas warning |
| M3 | 3 | In the PoC's `.env` set `AUTH_API_URL` to an unreachable address, re-run the engine (runbook Stage 2), then in the test widget sign in as an existing customer twice. Restore `AUTH_API_URL` and re-run the engine afterwards | Both attempts go to the "verification unavailable" path and escalate; the flow never loops back to retry the call |
| M4 | 5 | In `quoteMain`, follow a terminal path (for example quote saved) | It ends in a **terminate** node; no "disconnected node" warning anywhere in the flow |
| M5 | 6 | Test widget: sign in with a valid account number and PIN from the test data table | The **Verified?** split passes the caller on to their held policies |
| M6 | 7 | Same conversation: after sign-in, the agent tells you which policies you hold | It shows the real policy tiers, not a `<<<…redact>>>` marker |
| M7 | 9 | Only if the flow has a Generative Text node (AnyCare's current build has none): run the path through it | Its output appears only where a later message reads it |
| M8 | user-choice binding | Open probe flow `sdkProbeChoice`, node **Pick**. Then open `quoteMain` and check every user choice node | Slot shown as bound; no "resolved placeholder must be filled in" warning on any user choice |

## 3. Remove the probe flows

```bash
cd "$REPO/tools/acxd-deploy-engine"
ACXD_ENV_FILE="$ACXD_DIST/.env" npx tsx ../../tests/sdk-conformance/sdk-conformance.ts
rm -rf node_modules
```

Running without `--keep` repeats the checks and deletes the `sdkProbe…` flows.

## Result log

| Date | SDK version | PoC | Automated | Console | Notes |
|---|---|---|---|---|---|
| | | | | | |
