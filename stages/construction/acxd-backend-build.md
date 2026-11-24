---
slug: acxd-backend-build
number: 3.65
name: Backend Service Construction
plugin: acxd
phase: construction
execution: ALWAYS
condition: Runs for platform, use-case, and platform-poc engagements. Skipped for acxd-poc (ACXD static mocks only, authored in resource creation).
lead_agent: aidlc-developer-agent
support_agents:
  - acxd-platform-agent
mode: inline
produces:
  - acxd-backend-code
  - acxd-iac-templates
  - acxd-backend-test-results
consumes:
  - artifact: acxd-backend-architecture
    required: true
  - artifact: acxd-api-specifications
    required: true
  - artifact: acxd-data-request-contracts
    required: false
  - artifact: acxd-flows
    required: false
requires_stage:
  - acxd-flow-build
sensors:
  - required-sections
  - acxd-stage-exit
scopes:
  - acxd-platform
  - acxd-usecase
  - acxd-platform-poc
  - enterprise
  - feature
  - mvp
  - classic
  - workshop
inputs: Backend architecture, API specifications, data request contracts, flow import artifacts
outputs: acxd-backend-code/, acxd-iac-templates/, acxd-backend-test-results.md
---

# Backend Service Construction

> **MANDATORY STAGE-OPEN EMISSION — the first thing the user sees in this stage (reading the stage file first is fine).**
> Emit the H1 header line AND the intro line below it VERBATIM — copy both exactly as written here, word for word.
> They are fixed strings, not a description to paraphrase: do NOT reword, summarise, shorten, regenerate, or
> re-emoji either line. The `#` header must render as a real heading the user sees (NOT a code block, NOT a plain
> sentence). Emit exactly these two lines:
>
> # 🛠️ Backend Service Construction
>
> Implements the backend designed in Backend Service Architecture — Python Lambda handlers and standalone CDK apps (mock-integration, adapter-integration, and Amazon Connect), authored from templates with a deployed cURL smoke test. **Produces:** the deployable backend services the flows' data requests call.
>
> This is not optional and it does NOT degrade as context grows or the work feels urgent: a stage that opens without
> this hero header is as incomplete as one that ends without its `# 🛠️ Backend Service Construction Complete` message (core
> stage-protocol §2). The opening header and the completion line are a matched pair — same emoji, same standard. Use
> the emoji exactly; never choose or re-check it.

MANDATORY: Follow stage-protocol.md for approval gates, question format, and completion messages.

Build the backend services that ACXD data requests call. Every handler MUST comply with the ACXD data
request contract — inputs via URL parameters and/or a JSON request body (nested allowed; flat preferred for
mocks), bare value object out, HTTP 200 for business-logic failures.

> **Only build backends for data requests that need one.** Per the integration tier chosen in backend design:
> **Tier 1 (direct)** Live sources have NO backend — ACXD calls the third-party API directly, so generate
> nothing for them here (they are configured in resource creation only). Build handlers + CDK only for
> **Tier 2/3** Live sources (adapter needed) and for APIs this solution deploys with synthetic data. Tier-1 and Static-mock
> sources produce no code in this stage.

## Constraints

- All Lambda handlers are Python (unless the project explicitly requires Node.js).
- All AWS infrastructure is deployed via a single CDK stack per use case (TypeScript CDK).
- Every handler is independently testable with a local event JSON.
- Security scans run before approval: `cdk-nag` (IaC — always runs, npm dep) plus optional `bandit` (SAST) and `pip-audit` (deps) if installed, else a documented manual review (see Step 7).

## Steps

> **Scope routing — acxd-platform-poc:** APIs this solution deploys with synthetic data are the default; the user may also define real contracts
> or point a source at a Live test endpoint. For **Mock** sources run the mock path (**Step 3b** static and/or
> deployed handlers, **Step 5** mock data). For any **Live** source, build the production handler + CDK as
> normal. Include **Step 4c (Connect)**, as its own scope guard says. For `acxd-usecase` and
> `acxd-platform`, run all steps.

### Step 1: Scaffold Backend Project Structure

```
backend/
├── cdk/
│   ├── app.ts                     # CDK app entry point
│   ├── stack.ts                   # Single CDK stack per use case
│   ├── package.json               # CDK + SDK dependencies
│   └── cdk.json                   # CDK config
├── shared/                        # Shared utilities across handlers
│   ├── response.py                # Standard ACXD response formatter
│   ├── validation.py              # Input validation helpers
│   └── secrets.py                 # Secrets Manager client wrapper
├── functions/
│   ├── verify-identity/
│   │   ├── handler.py
│   │   ├── requirements.txt
│   │   └── event.json             # Local test event
│   ├── check-balance/
│   │   ├── handler.py
│   │   ├── requirements.txt
│   │   └── event.json
│   └── ...per operation
├── tests/
│   ├── unit/
│   │   ├── test_verify_identity.py
│   │   └── test_check_balance.py
│   └── integration/
│       └── test_api_endpoints.py
└── buildspec.yml                  # CodeBuild spec (if using CodePipeline)
```

### Step 2: Implement the ACXD Response Formatter

Create the shared response utility that enforces the ACXD data request contract:

```python
# shared/response.py
import json
from decimal import Decimal

def acxd_response(data: dict, status_code: int = 200) -> dict:
    """Format a response compliant with the ACXD data request contract.
    
    Rules:
    - Bare value object — no wrapping envelope, no resolvedVariables key.
    - Formatted + raw fields for monetary values (e.g., balance: "$1,234.56", balanceRaw: 1234.56).
    - Boolean found/verified fields + success-only string messages.
    - HTTP 200 for business-logic failures (e.g., account not found) — ACXD cannot handle non-200.
    """
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(data, default=_serialize),
    }

def _serialize(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
```

### Step 3: Implement Lambda Handlers

For each backend operation in the API specifications, generate a handler:

```python
# functions/verify-identity/handler.py
import json
from shared.response import acxd_response
from shared.secrets import get_secret

def lambda_handler(event, context):
    """Verify caller identity.
    
    ACXD Data Request Contract:
      Request (JSON body): { "phoneNumber": "string", "dateOfBirth": "string" }   # nested objects allowed
      Response (bare value): { "verified": bool, "customerName": "string", "message": "string" }
    """
    body = json.loads(event.get("body", "{}"))
    
    phone = body.get("phoneNumber", "").strip()
    dob = body.get("dateOfBirth", "").strip()
    
    if not phone or not dob:
        # Business failure — still HTTP 200
        return acxd_response({
            "verified": False,
            "customerName": "",
            "message": "Missing required fields",
        })
    
    # Call upstream CRM / identity provider
    crm_api_key = get_secret("shared-crm-api-key")
    result = _verify_with_crm(phone, dob, crm_api_key)
    
    return acxd_response({
        "verified": result["found"],
        "customerName": result.get("name", ""),
        "message": "Verified" if result["found"] else "No matching record",
    })
```

**Response convention rules enforced per handler:**

| Data Type | Convention | Example |
|-----------|-----------|---------|
| Money | `formatted` (display) + `raw` (numeric) | `"balance": "$1,234.56", "balanceRaw": 1234.56` |
| Boolean lookup | `found` or `verified` (bool) + message (string, success-only) | `"verified": true, "message": "Verified"` |
| Date | ISO 8601 string | `"dueDate": "2026-10-15"` |
| List | Array of flat objects | `"transactions": [{"date": "...", "amount": 42.0}]` |
| Error | HTTP 200 + boolean false + message | `"found": false, "message": "Account not found"` |

**Flow-readable response validation:** Before requesting approval, verify that every field a FLOW reads
directly is a top-level key. A flow's `{dataRequestName.field:NLX.Variable}` reference resolves only
top-level keys, so any value the flow consumes must be top-level (scalar, or a top-level array). The
`responseSchema` itself DOES support nested objects and arrays (validated: the workshop `getPolicies` /
`getClaims` register nested schemas and import cleanly) — nesting does not break import; it only means a
`{dr.parent.child}` reference resolves blank. If a flow needs a value the upstream returns nested, flatten
that value to the top level at the Lambda boundary; deeper detail the flow never references may stay nested.
`[CONSOLE-VERIFIED]`


### Step 3b: Generate Handlers per Data Source Mode

Generate handlers based on each data source's mode from the integration inventory (not a global mock flag).
Each data source is one of three modes:

- **Live** → generate real integration handlers that call the external endpoint (production `backend/` code).
- **Mock — Static** → generate ACXD inline-static code (no infra, no public interface).
- **Mock — Deployed** → generate a real API Gateway + Lambda mock backend (public interface, CloudWatch logs).

**CRITICAL — the backend deployables are named for WHAT they are, each a standalone CDK app.** The backend
data source is `backend/mock-integration/` (synthetic data) OR `backend/adapter-integration/` (adapter to a
real system) — or neither, when the live API is called direct. The Amazon Connect flow is always its own
`backend/connect/` deployable. Structure (include only the folders this engagement needs):

```
backend/
├── mock-integration/           ← API serving ACXD data requests with SYNTHETIC data (no live API yet)
│   │                             COPIED from the fixed tool {{HARNESS_DIR}}/tools/acxd-mock-backend/ — do NOT hand-author
│   │                             (create the destination folder first and copy with absolute paths)
│   ├── handler.py              ← fixed core: /{operation} routing + plain-lookup + ops override
│   ├── validate.py             ← fixed: checks every apis/<apiId>/ folder, prints each API's operations
│   ├── apis/                   ← ONE folder per generated OpenAPI file, named by its API id
│   │   ├── authApi/
│   │   │   ├── data/           ← agent-authored JSON, one file per operation of this API
│   │   │   │   └── verifyIdentity.json
│   │   │   └── ops/            ← agent-authored, OPTIONAL: <operation>.py for computed operations
│   │   └── policyPricingApi/
│   │       ├── data/
│   │       │   ├── getCustomerPolicies.json
│   │       │   └── requestQuote.json
│   │       └── ops/
│   ├── static/                 ← inline-static code strings (for Static-mode data requests)
│   │   └── <operation>.js
│   ├── mock.config.json        ← OPTIONAL tuning: stageName / memoryMb / timeoutSeconds
│   ├── cdk/                    ← fixed CDK app: ONE parent stack acxd-<projectName>-<env>-mock-apis with one nested
│   │                             stack per API (its own API Gateway + Lambda)
│   └── README.md
├── adapter-integration/        ← ONLY if a live API needs translation (auth/flatten/VPC); else omit
│   │                             COPIED from the fixed tool {{HARNESS_DIR}}/tools/acxd-adapter-backend/ — adapt the handler(s)
│   ├── cdk/                    ← CDK stack: API Gateway + adapter Lambda(s) → real system (AcxdAdapterStack)
│   ├── functions/              ← adapter Lambda handlers, one dir per operation
│   └── README.md
└── connect/                    ← Amazon Connect integration flow (contact flow via Agentic CX block, escalation queue, routing profile)
    │                             COPIED from the fixed tool {{HARNESS_DIR}}/tools/acxd-connect-backend/ — do NOT hand-author the flow
    ├── cdk/                    ← CDK stack: AcxdConnectStack (connect-stack.ts + mainflow.json) — wires into your EXISTING instance, deployed AFTER the ACXD app
    └── README.md
```

**Mock vs adapter vs direct is chosen per data source at discovery.** `mock-integration/` ships editable
seed JSON with a fixed Lambda (no data layer); `adapter-integration/` fronts the real system of record; a
direct live API needs no backend folder at all. Either way the ACXD flows are identical. The **`connect/`
stack always deploys for every scope except the minimal `acxd-poc`** (it wires voice/chat to the ACXD
application). Keep the throwaway property (no cdk-nag, seed JSON) on `mock-integration/` — never on
`connect/` or `adapter-integration/`.

**Mock data always lives in external editable JSON files** — never inline in code. For every mocked
operation whose response carries a payload (POSTs) or is keyed by a filter/path parameter, generate
`backend/mock-integration/apis/<apiId>/data/<operation>.json` with **3 example response patterns** the user can edit before deploying:

```json
{
  "ACC1001": { "verified": true, "customerId": "CUST1001", "customerName": "Sarah Chen" },
  "ACC1002": { "verified": true, "customerId": "CUST1002", "customerName": "James Mitchell" },
  "_default": { "verified": false, "message": "Account not found" }
}
```

**Generate identifiers with NO hyphens or other separators** — account numbers, customer ids, policy numbers,
and any value a caller types or speaks to be matched (data keys AND id values in the response). Use plain
alphanumerics only (`ACC1001`, `CUST1001`, not `ACC-1001` / `CUST-1001`). The ACXD test console / capture can
drop punctuation from a typed value (e.g. `ACC-1001` arrives as `ACC1001`). The shipped handler matches keys
canonically, so a hyphenated key still resolves, but a live API may not: keep generated identifiers hyphen-free so
the data, the design documents and any later live API all agree.

#### Mock — Static (inline-static)

For sources to mock with **Static** style: generate an inline-static code string that ACXD
runs inside its own runtime. No API Gateway, no Lambda, **no public interface** — nothing to secure. The
code reads the request parameters, looks up the matching pattern in the operation's data file, and returns
a flat bare value object:

```javascript
// backend/mock-integration/static/verifyIdentity.js — set as webhook.code with implementation: "inline-static"
const DATA = { /* contents of backend/mock-integration/apis/authApi/data/verifyIdentity.json, inlined at resource-creation time */ };
function handler(input) {
  const key = (input.accountId || "").trim().toUpperCase();
  return DATA[key] || DATA["_default"];
}
```

At resource-creation time, the contents of `backend/mock-integration/apis/<apiId>/data/<operation>.json` are injected into the inline-static
`code` string so the user edits ONE JSON file and re-runs resource creation to update responses.

#### Mock — Deployed (API Gateway + Lambda)

For sources to mock with **Deployed** style, use the **shipped, fixed mock tool** —
`{{HARNESS_DIR}}/tools/acxd-mock-backend/` — copied into the project at `backend/mock-integration/` (the backend-build stage does this copy). **Do NOT hand-author the
CDK stack, the Lambda, or the handler.** That code is fixed and tested (per API: API Gateway + one path-routing
Python Lambda + bundled JSON, x-api-key + usage plan, CloudWatch access logs, cdk-nag suppressions,
explicit region pinning, CommonJS so `__dirname` resolves). Re-authoring it per run was the source of the
recurring mock-stack defects (`AcxdMockStack` naming, `"type":"module"` + `__dirname`, `fromAsset` path).
The harness supplies only **declarative content**; the mechanism is shipped.

**One deployed API per OpenAPI file.** Each generated API gets its own API Gateway and Lambda (its own logs,
metrics and faults), as a nested stack inside ONE parent stack, `acxd-<projectName>-<env>-mock-apis`, deployed
with one command. This holds for a single API too. Never serve two OpenAPI files from one API.

**What you author (this is the ONLY per-engagement work):**
1. **`backend/mock-integration/apis/<apiId>/data/<operation>.json`** — one folder per OpenAPI file, named by its
   API id (`x-acxd-api-id`, e.g. `authApi`), and one file per operation of that API, holding the canned responses
   keyed by the lookup value, with a `_default` fallback.
2. **`backend/mock-integration/apis/<apiId>/ops/<operation>.py`** — OPTIONAL, only for a **computed** operation
   (one that must calculate a value, e.g. a quote with discount math, or compare a secret like a PIN). It exposes
   `handle(params, data) -> dict`. For a deterministic reference such as a quote number, use `zlib.crc32` (a checksum),
   not `hashlib.sha1`/`md5`: SAST flags those as weak hashes even when not used for security. A plain "match a key → return its JSON" lookup needs **no** file here.
   (Template: `ops/getQuote.py.example`.)
3. Nothing else: project name, region and environment come from `.env`; the APIs are the `apis/` folders.
   `mock.config.json` is optional tuning only (`stageName`/`memoryMb`/`timeoutSeconds`).

The **data request URL's final path segment**, the `{operation}` route path segment, `apis/<apiId>/data/<operation>.json`,
and `apis/<apiId>/ops/<operation>.py` ALL share the same camelCase operation id — one token, four names aligned. So the URL
you authored in `resources/data-requests.json` at resource-creation (e.g. `.../verifyIdentity?...`) IS the
operation id, and its data file is `apis/authApi/data/verifyIdentity.json`. Author the URL segment in camelCase up front so
no rename is needed here (a kebab path like `/verify-identity` will not match the data file). **No data
layer** — responses come from the shipped JSON; a mock never uses DynamoDB/RDS/S3.

**How the mock receives its values (two channels — neither is automatic).** `[CONSOLE-VERIFIED]` A value reaches the mock
ONLY through what the flow NODE sends; a field listed in `requestSchema` is not sent just because it is listed.
- **JSON request body (preferred for mocks):** the node's `body` (FlowSpec) / `payload` sends a JSON object; the
  mock's `handler.py` parses it and passes it to your op as `params` (nested objects/arrays arrive as nested
  dicts/lists). Use for POST writes and any sensitive input such as a PIN.
- **URL parameters:** each value is an explicit `{param}` placeholder in the data request's URL (query or path),
  e.g. `{billingApiUrl:NLX.Secret}/getQuote?productLine={productLine}`, filled by the node's `params`/`urlParams`.
  Use for GET reads. An unresolved `{placeholder}` at runtime is `400 UNSUBSTITUTED_PLACEHOLDER`.
The handler merges both (body wins on a clash). When authoring an `ops/<operation>.py`, read only the fields the
node actually sends in its body or URL. The engine pre-flight checks the node supplies every `required`
`requestSchema` field and that every URL param has a placeholder. (See `acxd-sdk-idl.ts` DataRequestDef / NodeDataRequest.)

**`.example` files are inert.** The shipped tool includes `*.example` templates (e.g. `ops/getQuote.py.example`,
`mock.config.json.example`). `validate.py` and the handler's auto-discovery match only exact
`<operation>.json` / `<operation>.py` names, so `.example` files are ignored — leave them as reference or
delete them; they neither load nor break validation.

**Test through the router, not just the op.** A functional test of a mock operation calls `lambda_handler` with
`pathParameters.operation` set to the data request's `dataRequestId` (and `MOCK_API_DIR=apis/<apiId>`), never `handle()`
directly, so a path that does not match the data request fails here rather than after deploy.

**Validate, then deploy** (one command for all APIs; values from `.env`):
```bash
cd "$ACXD_DIST"
set -a; . ./.env; set +a
cd backend/mock-integration
# Reports each API's operations; fails loudly on any bad data/ops file.
python3 validate.py
cd cdk && npm install
npm run deploy
```
Each API's key is in `.env` (`<API>_KEY`, e.g. `AUTH_API_KEY`), generated once, before the first deploy, by the API
wiring tool, which fills only blank keys of generated APIs (40 characters):
`npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/openapi-wiring-cli.ts --apis customer-context --generate-keys <dist>/.env`.
The app reads `ACXD_PROJECT_NAME`, `AWS_REGION` and `ACXD_ENVIRONMENT` from the distribution-root `.env`, and one
key per `apis/<apiId>/` folder; it fails at synth naming any missing key. CDK bootstrap is NOT part of this step:
the runbook does it once in Prerequisites.

> **The deployed CloudFormation stack is `acxd-<projectName>-<env>-mock-apis`** (one parent, one nested stack per
> API). Its outputs are `<ApiId>Url` and `<ApiId>KeyId` per API (e.g. `AuthApiUrl`).

**After deploy, TEST the mock directly with cURL before creating any ACXD resources.** This is the real
confirmation the backend works — ACXD data-request creation does NOT test the URL, so validate it here first.

The stack outputs each API's base URL (**`<ApiId>Url`**, e.g. `AuthApiUrl`). Record them at deploy time (the deploy
prints them), or read them later in the **CloudFormation console → the `acxd-<projectName>-<env>-mock-apis` stack →
Outputs tab**. Put each in `.env` as that API's `<API>_URL` (paste it as shown); the keys are already there. Then
smoke-test each API from `.env`:

```bash
cd "$ACXD_DIST"
set -a; . ./.env; set +a
curl -sS "${BILLING_API_URL%/}/getPolicies?customerId=CUST001" -H "x-api-key: $BILLING_API_KEY"
```

A JSON response confirms the API is live and the key works. Use the API's own `.env` names (the API wiring tool
prints them with `--runbook`).

To edit responses: the user changes `backend/mock-integration/apis/<apiId>/data/<operation>.json` and redeploys the mock stack (or re-runs
resource creation for Static mode). One editable JSON file per operation — that is the entire "data layer".

The deployed backend is a separate CDK stack from the production backend — deploy it, smoke-test it (above),
then point the data requests at its URL in External mode.

**Migration to live:** in both mock modes the ACXD flows are identical to the live design. Switching to a
real backend is a data-request change only (swap inline-static → external, or repoint the external URL) —
no flow changes. When the live backend is ready, replace the mock data source inside `backend/mock-integration/`
with the live adapter (the `connect/` stack and the ACXD flows are unaffected).

**All mock handlers follow the ACXD data request contract** — inputs from the JSON body and/or URL parameters,
bare value object out, HTTP 200 for business failures. ACXD flows don't know or care whether the backend is static, mock, or real.

### Step 4: Generate CDK Stack

Generate a single CDK stack per use case. **By default the stack is API Gateway + stateless adapter
Lambda(s) only — no data layer.** The adapter Lambdas call the customer's external system of record and
flatten the response to the ACXD contract. Include a DynamoDB table ONLY when Backend Design Step 4 flagged
a justified store (idempotency, cross-disconnect session state, cache, or audit) — and then only for the
functions that need it. The `# --- Data layer ---` block below is therefore **conditional**, not default:

```typescript
// cdk/stack.ts — TypeScript CDK. Lambda HANDLERS remain Python (packaged as assets); only the CDK is TS.
import { Stack, StackProps, CfnOutput, Duration } from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface AcxdAdapterStackProps extends StackProps { environment: string; }

export class AcxdAdapterStack extends Stack {
  constructor(scope: Construct, id: string, props: AcxdAdapterStackProps) {
    super(scope, id, props);
    const { environment } = props;

    // --- Data layer (CONDITIONAL — include ONLY if Backend Design Step 4 justified a store) ---
    // Default integration adapters are stateless; omit this block entirely when no store is justified.
    // const dataTable = new dynamodb.Table(this, "DataTable", {
    //   tableName: `acxd-${environment}-data`,
    //   partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
    //   sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
    //   billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    //   timeToLiveAttribute: "ttl",         // transient data (idempotency/cache/session) should expire
    //   removalPolicy: RemovalPolicy.DESTROY,
    // });

    // --- Lambda handlers (Python handler code, packaged as an asset) ---
    const verifyFn = new lambda.Function(this, "VerifyIdentityFn", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.lambda_handler",
      code: lambda.Code.fromAsset("functions/verify-identity"),
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        ENVIRONMENT: environment,
        // TABLE_NAME: dataTable.tableName,   // only if a justified store exists
      },
    });
    // dataTable.grantReadData(verifyFn);      // only if a justified store exists
    verifyFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: ["*"],   // Scope to specific secrets in production
    }));

    // ... additional function constructs per operation

    // --- API Gateway ---
    const api = new apigw.RestApi(this, "AcxdApi", {
      restApiName: `acxd-${environment}-api`,
      deployOptions: { stageName: environment },
    });
    const apiKey = api.addApiKey("AcxdApiKey");
    const plan = api.addUsagePlan("AcxdUsagePlan", {
      apiStages: [{ api, stage: api.deploymentStage }],
    });
    plan.addApiKey(apiKey);

    const verifyResource = api.root.addResource("verify-identity");
    verifyResource.addMethod("POST", new apigw.LambdaIntegration(verifyFn), { apiKeyRequired: true });

    // --- Outputs ---
    new CfnOutput(this, "ApiUrl", { value: api.url });
  }
}
```

```bash
# CDK bootstrap is done once in the runbook's Prerequisites, not here.
cd cdk && cdk synth && cdk deploy --context environment=dev
```

For platform engagements, the CDK stack can be parameterised per use case via context or separate stack
instantiations sharing common constructs (API Gateway, and any justified shared table).

### Step 4b: Add Observability Constructs to CDK Stack

Deploy monitoring **alongside the infrastructure** — not as an afterthought in operational readiness.
Add these constructs to the CDK stack:

**Health check endpoint:**
```typescript
// Add a /health endpoint for smoke testing and canary monitoring
const healthFn = new lambda.Function(this, "HealthCheckFn", {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: "index.handler",
  code: lambda.Code.fromInline(
    "import json, time\n" +
    "def handler(event, context):\n" +
    "    return {'statusCode': 200, 'body': json.dumps({'status': 'healthy', 'timestamp': int(time.time())})}\n"
  ),
  timeout: Duration.seconds(5),
});
const healthResource = api.root.addResource("health");
healthResource.addMethod("GET", new apigw.LambdaIntegration(healthFn)); // deliberately public — no API key
```

**CloudWatch alarms (critical thresholds):**
```typescript
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";

// SNS topic for alarm notifications
const alarmTopic = new sns.Topic(this, "AcxdAlarmTopic", { displayName: `ACXD ${environment} Alarms` });

// Lambda error rate alarm — per function
verifyFn.metricErrors({ period: Duration.minutes(5) }).createAlarm(this, "VerifyErrorAlarm", {
  alarmName: `acxd-${environment}-verify-identity-errors`,
  threshold: 3,
  evaluationPeriods: 2,
  comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
}).addAlarmAction(new cwActions.SnsAction(alarmTopic));

// API Gateway 5xx alarm
api.metricServerError({ period: Duration.minutes(5) }).createAlarm(this, "Api5xxAlarm", {
  alarmName: `acxd-${environment}-api-5xx`,
  threshold: 5,
  evaluationPeriods: 2,
}).addAlarmAction(new cwActions.SnsAction(alarmTopic));

// API Gateway latency alarm (p95)
api.metricLatency({ period: Duration.minutes(5), statistic: "p95" }).createAlarm(this, "ApiLatencyAlarm", {
  alarmName: `acxd-${environment}-api-latency-p95`,
  threshold: 5000,   // 5 seconds — ACXD data request timeout is 8s
  evaluationPeriods: 3,
}).addAlarmAction(new cwActions.SnsAction(alarmTopic));
```

**CloudWatch dashboard (backend health at a glance):**
```typescript
const dashboard = new cw.Dashboard(this, "AcxdDashboard", {
  dashboardName: `acxd-${environment}-backend-health`,
});
dashboard.addWidgets(
  new cw.GraphWidget({ title: "Lambda Errors", left: [verifyFn.metricErrors()] }),
  new cw.GraphWidget({ title: "API Latency (p50/p95)", left: [
    api.metricLatency({ statistic: "p50" }),
    api.metricLatency({ statistic: "p95" }),
  ] }),
  new cw.GraphWidget({ title: "API 5xx", left: [api.metricServerError()] }),
  // Add a DynamoDB Throttles widget ONLY if a justified store exists:
  // new cw.GraphWidget({ title: "DynamoDB Throttles", left: [dataTable.metricThrottledRequestsForOperation("GetItem")] }),
);
```

This ensures that when the backend deploys, monitoring is immediately active — no manual setup needed.

### Step 4c: Connect Integration Stack (all scopes except minimal acxd-poc)

**Scope guard:** Include the Connect integration stack for **every scope EXCEPT the minimal `acxd-poc`** —
including `acxd-platform-poc`. The Connect flow is what wires voice/chat to the ACXD application, so a
platform POC that omits it isn't demonstrating the real integration. Only pure `acxd-poc` (ACXD-only,
test-widget validation) skips it.

**ALWAYS copy in the complete Connect CDK app — never reduce it to a README.** Copy the full template
**from the fixed tool `{{HARNESS_DIR}}/tools/acxd-connect-backend/`** into the project at `backend/connect/`
as-is (`cdk/connect-stack.ts`, `cdk/mainflow.json`, `cdk/app.ts`, `cdk/package.json`, `cdk/cdk.json`,
`cdk/tsconfig.json`, `README.md`) — exactly as the mock backend is copied from `{{HARNESS_DIR}}/tools/acxd-mock-backend/`.
The Connect stack is a fixed harness artifact — **do NOT hand-author the contact flow, and do NOT ship a
placeholder folder with only a README** (if `connect-stack.ts`/`mainflow.json` seem absent, they are at that
tool path — do not conclude the template is missing and do not fabricate one). The code is always delivered,
complete and synthesisable. The agent's only job is to ensure the account-specific values are present in the
distribution-root `.env` (see below).

The stack deploys:
- The AWS best-practice contact flow from **`mainflow.json`** — the **Agentic CX block** (which references
  the ACXD application by **Workspace / Application / Alias**), flow logging, Contact Lens voice + chat
  analytics, the four Agentic CX pathways (Default / Escalation / Idle Timeout / Error), and the escalation
  hand-off that carries the agent's `handoffSummary` back to the contact record.
- Escalation queue for human agent hand-off (created by default; an existing queue ARN can be supplied).
- Routing profile that includes the escalation queue.

There is **no Amazon Lex bot to provision or wire** — the Agentic CX block reaches the ACXD application
directly; the ACXD build stands up the underlying orchestration. (No `lexBotArn`, no Connect→Lex IAM.)

**The Amazon Connect instance is a PREREQUISITE, never a deployed resource.** The operator supplies an AWS
account with an existing Connect instance they have admin access to; the stack wires into it via
`CONNECT_INSTANCE_ARN` and never creates, owns, or deletes it. Never add instance creation to this stack or any
other.

**Values come ONLY from the distribution-root `.env`.** `app.ts` loads the snapshot-root `.env` itself (resolved
from its own location) — the SAME file the SDK engine reads and writes. Every Connect key (`CONNECT_INSTANCE_ARN`,
`ACXD_PROJECT_NAME`, `ACXD_ENVIRONMENT`, `ACXD_DEPLOYMENT_KEY`, and the optional queue / sample-customer keys) is
already in the engine's `.env.example` template. Do NOT add them anywhere else, and never put Connect values on the
command line. The deploy is `npm run deploy` from `backend/connect/cdk`, LAST (runbook Stage 3), after the ACXD
application is built and deployed, because the Agentic CX block references the ACXD ids. Always deliver the
complete `backend/connect/` folder; nothing is scaffolded-but-missing.

This is a **working integration** — once the ACXD app exists and the ids are supplied, the contact flow,
queue, and routing profile are functional immediately after deployment.

**Customer-configured resources (NOT in the CDK stack — documented in the operational runbook):**
- Phone number claim and assignment to the contact flow
- Agent user creation and assignment to the routing profile
- Hours of operation for the escalation queue
- Custom hold music or queue whisper flows
- Additional contact flows for specific entry points (e.g. different phone numbers per product)

### Step 5: Generate Seed and Mock Data

For development and testing:
- DynamoDB seed script (`scripts/seed-data.py`) — **production/live backend only**, populates test records in
  the real data layer. Mocks do NOT use this — a mock's data lives entirely in its shipped `backend/mock-integration/apis/<apiId>/data/*.json`.
- Mock event JSONs per handler (`functions/*/event.json`) — local testing via `pytest` with mocked AWS clients.
- Mock response data — the editable `backend/mock-integration/apis/<apiId>/data/<operation>.json` files (shipped with the mock Lambda); these
  are the single source of mock responses for both Static and deployed-backend styles.

### Step 6: Generate Unit Tests

For each handler:

```python
# tests/unit/test_verify_identity.py
import json
from functions.verify_identity.handler import lambda_handler

def test_successful_verification():
    event = {"body": json.dumps({"phoneNumber": "+61400000001", "dateOfBirth": "1990-01-15"})}
    response = lambda_handler(event, None)
    body = json.loads(response["body"])
    assert response["statusCode"] == 200
    assert body["verified"] is True
    assert body["customerName"] != ""

def test_missing_fields_returns_200_with_false():
    event = {"body": json.dumps({})}
    response = lambda_handler(event, None)
    body = json.loads(response["body"])
    assert response["statusCode"] == 200  # Business failure = still 200
    assert body["verified"] is False

def test_not_found_returns_200_with_false():
    event = {"body": json.dumps({"phoneNumber": "+61499999999", "dateOfBirth": "1900-01-01"})}
    response = lambda_handler(event, None)
    body = json.loads(response["body"])
    assert response["statusCode"] == 200
    assert body["verified"] is False
```

### Step 7: Run Security Scans

Before requesting approval, run the security checks. **`cdk-nag` (IaC) always runs** — it is an npm dependency
wired as a `cdk synth` Aspect. **`bandit` and `pip-audit` are OPTIONAL Python tools** — run them if installed;
otherwise fall back to the documented manual review and record which path was taken.

```bash
# SAST — static analysis for Python handler security (OPTIONAL — Python tool, not an npm dep)
if command -v bandit >/dev/null 2>&1; then
  bandit -r functions/ -ll
else
  echo "bandit not installed — performing manual SAST review (see checklist below)"
fi

# Dependency audit — known vulnerabilities in handler deps (OPTIONAL — Python tool)
if command -v pip-audit >/dev/null 2>&1; then
  pip-audit -r functions/verify-identity/requirements.txt
else
  echo "pip-audit not installed — manually confirm handler deps are current"
fi

# IaC security — CDK best practices (PRODUCTION backend stack only). ALWAYS runs.
# cdk-nag runs as a synth Aspect on backend/adapter-integration/cdk. It is NOT applied to the throwaway backend/mock-integration/cdk stack.
cd backend/adapter-integration/cdk && npm install && npx cdk synth   # cdk-nag Aspect runs here (adapter stack); must pass with zero findings
```

> **To enable automated Python SAST** (recommended for production-track engagements; not needed for a
> mock-only POC): `pipx install bandit pip-audit` (or `pip install bandit pip-audit`). These are Python tools
> and are deliberately NOT part of the Node/TS `npm install` chain.

**If bandit/pip-audit are unavailable, do not install them; perform this manual SAST review** and record it: no
`eval`/`exec`/`shell=True`/`os.system`, no hardcoded secrets or tokens, inputs validated, JSON-only I/O, any
local dev server binds `127.0.0.1`. In the security-scan results, record for each check whether it was
**tool-run** or **manual review** — never claim a tool ran when it did not.

Log all findings. Critical and high findings MUST be resolved before approval.
Medium findings are documented with justification if accepted.

> **The agent NEVER deploys and NEVER goes looking for AWS credentials. Local verification + handoff is the
> ONLY path this stage takes — always, regardless of the model running it.** This is a hard rule, not a
> model-discretion judgement call:
> - **Do NOT search for, read, or use AWS credentials** from any local source — no `~/.aws/credentials` or
>   `~/.aws/config`, no `AWS_*` environment variables, no `aws sts get-caller-identity` / `aws iam
>   list-account-aliases` probing, no CLI profile. Do not try to determine whether an account is
>   sandbox-or-production; do not offer to deploy because credentials happen to be present. The presence of
>   usable credentials is NOT authorisation to deploy, and finding them is not this stage's job.
> - **Do NOT run `cdk bootstrap`, `cdk deploy`, or any command that creates, changes, or deletes a real AWS
>   resource.** `cdk synth` (no AWS calls) is the only CDK command this stage runs.
> - **Always take the local-verification stop:** run the local, non-destructive checks — `validate.py`, the
>   handler unit tests, and `cdk synth` (run synth in a temporary copy of the CDK folder, never inside the record
>   tree, so no `node_modules/` or `cdk.out/` is left there) — produce the deploy-ready artifacts + the exact deploy runbook, and
>   mark the live steps (cdk bootstrap, cdk deploy, cURL smoke test, the ACXD integration test below, Connect
>   deploy) as NOT-RUN in the test-results artifact, handed off to the operator to run from the runbook.
> This holds whether or not credentials are present: with none it is obviously the only option; with some it is
> STILL the only option. Deployment is an operator action, performed by a human from the runbook, never by the
> agent. (A future release may add a dedicated, deterministic deploy step that explicitly ASKS the operator
> where to find credentials and which account to use before any deploy — until that exists, the agent does not
> deploy.) Production-safety rules forbid the agent creating AWS resources, so this handoff is the correct
> behaviour, not a gap.

### Step 8: Integration Test Against ACXD Data Requests

After deployment to the dev environment:
1. Create a test data request in ACXD pointing to the dev API endpoint.
2. Trigger the data request from an ACXD flow (or the widget test harness).
3. Verify the request reaches the backend as authored (URL params and/or JSON body) and the response matches
   the contract — bare value object out.
4. Verify ACXD correctly maps response fields to flow variables.

### Step 9: Open the Approval Gate

Run `bun {{HARNESS_DIR}}/tools/aidlc-orchestrate.ts report --stage acxd-backend-build --result awaiting-approval`.

### Step 10: Present Completion & Request Approval

Review path: this stage's engine-resolved record dir.

Present all handler code, CDK stack, test results, and security scan results.

**Design changes made during build (MANDATORY section: a failed check is a design defect, never drop behaviour to pass it):** list every behavioural change made in this stage (what changed, why, effect on the customer outcome), or state "None". Mechanical reconciliations do not belong here.
Standard 2-option approval (Approve / Request Changes).
STOP for the human response. Report Approve with
`--result approved --user-input "<exact choice>"`; report
Request Changes with `--result rejected --user-input "<feedback>"`, revise the
artifacts, then report `--result revised` before re-presenting.

## Exit criteria

Checked by code when the approval gate opens; the gate stays closed until each passes. Fix the cause, not the check.

- run: `if [ -d "<record>/backend/mock-integration" ]; then cd "<record>/backend/mock-integration" && python3 validate.py; fi`

## Learn

While running this stage, record observations in the engine-created
`<record>/<phase>/<stage>/memory.md`. Treat it as an output-only target:
never read, probe, create, or initialize it. Follow the active harness's
diary-write discipline: add entries through the stage's review-step ritual
(NOT by hand-editing `memory.md`) — the ritual records them under Interpretations,
Deviations, Tradeoffs, and Open questions, each with an ISO 8601 timestamp.

Record an entry only when a **genuine insight arose while running this stage** — a platform constraint you discovered, a non-obvious tradeoff you weighed, a workaround you found, or something that behaved unexpectedly and how you resolved it. These are the observations worth carrying to a future run.

The configuration and settings the user selected during the stage are captured in the stage artifacts and belong there — a restatement of a chosen engagement pattern, an authoritative SoP, a scope, or any selected option is a record of the decision, not a learning, so leave it out of `memory.md`. Most runs produce nothing worth recording under Interpretations, Deviations, or Tradeoffs; an empty stage memory is the normal, expected outcome.
