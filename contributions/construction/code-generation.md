---
target: code-generation
plugin: acxd
adds:
  required_sections:
    - "ACXD Backend Generation"
fragments:
  - anchor: after-step:3
    order: 100
---

## fragment: after-step:3

### Step 3b (acxd): ACXD Backend Generation

Generate backend code and SDK scripts that comply with ACXD platform conventions:

**Lambda handler pattern (data request backend):**
```python
def handler(event, context):
    # 1. Parse the JSON request body (nested objects/arrays are allowed; read them as nested dicts/lists)
    body = json.loads(event.get("body") or "{}")
    account_id = body["accountId"]
    
    # 2. Canonicalise caller-supplied IDs
    account_id = account_id.strip().upper()
    
    # 3. Call downstream service
    result = service.get_balance(account_id)
    
    # 4. Return bare value object (no wrapper envelope)
    return {
        "statusCode": 200,
        "body": json.dumps({
            "balance": result.balance,
            "balanceFormatted": f"${result.balance:,.2f}",
            "currency": result.currency,
            "found": True
        })
    }
```

**Key conventions:**
- JSON request body in (flat preferred for mocks, nested allowed), bare value object out — no `resolvedVariables` envelope
- HTTP 200 for business failures (`{"found": false, "reason": "..."}`)
- HTTP 4xx/5xx only for infrastructure errors
- Formatted + raw fields for monetary values
- Boolean `found`/`verified` fields for lookup/verification results
- Canonicalise all caller-supplied identifiers (trim, case-normalise)

**CDK stack generation:**
- One CDK stack per use case containing API Gateway + stateless adapter Lambda functions (that call the
  customer's external systems of record). **No DynamoDB by default.**
- Add a DynamoDB table (on-demand capacity, TTL for transient data) ONLY when a justified store is required
  — idempotency, cross-disconnect session state, cache, or audit (see Backend Design Step 4).
- IAM roles scoped to exactly what each Lambda calls (typically Secrets Manager for the upstream credential;
  DynamoDB actions only when a justified table exists).
- Environment variables for ACXD workspace ID and environment name

**Node SDK resource creation scripts:**
- Generate scripts using `amazon-connect-acxd-sdk` for:
  - Secrets (`CreateSecretCommand`)
  - Data requests (`CreateDataRequestCommand`)
  - Slot types (`CreateSlotTypeCommand`)
  - Knowledge bases (`CreateKnowledgeBaseCommand`)
  - Flow scaffolds (`CreateFlowCommand` with `untrained: true`)
  - Application assembly (`CreateApplicationCommand`, `AttachFlowCommand`)
- Scripts are idempotent: check for existing resource before creating
- All scripts read configuration from the environment's `.env` (workspace name, API token, environment)
