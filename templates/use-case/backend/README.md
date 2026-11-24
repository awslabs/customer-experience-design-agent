# Backend deployables

The backend has up to three sibling deployables, chosen per data source at discovery. Deploy in this order:

| Order | Folder | When it exists | Stack | Notes |
|------|--------|----------------|-------|-------|
| 1 | `mock-integration/` | No live API yet (POC/demo/future-state) | `acxd-<projectName>-<env>-mock-apis` (one nested stack per API) | Synthetic data. **Copied from the fixed tool** `{{HARNESS_DIR}}/tools/acxd-mock-backend/` by the backend-build stage — do not hand-author. Agent authors only `apis/<apiId>/data/` and optional `apis/<apiId>/ops/`, one folder per generated API. |
| 1 | `adapter-integration/` | Live API needs translation (auth/flatten/VPC) | `AcxdAdapterStack` | **Copied from the fixed tool** `{{HARNESS_DIR}}/tools/acxd-adapter-backend/`. API GW + adapter Lambda(s) → customer's real system of record; adapt the handler(s) per operation. |
| — | *(none)* | Live API fits ACXD directly (public, static-key, flat, 200-on-failure) | — | No backend code — just an ACXD Data Request + Secret. |
| 3 | `connect/` | Every scope except minimal `acxd-poc` | `AcxdConnectStack` | **Copied from the fixed tool** `{{HARNESS_DIR}}/tools/acxd-connect-backend/` — do NOT hand-author the contact flow. Amazon Connect integration flow. Deploys LAST, after the ACXD SDK stage (Stage 2). |

Stage 2 (between 1 and 3) is the ACXD SDK deploy engine at `acxd-sdk/acxd-deploy-engine/`.

A single use case may have some data requests **direct** (no folder) and others **mocked** — mock is a
data-source concept inside `mock-integration/`, never mixed into the production folders.

Each folder is a **standalone CDK app** (`cd <folder>/cdk && npm install && npx cdk deploy …`). Region is
pinned explicitly on every deploy — never the ambient `AWS_REGION`.
