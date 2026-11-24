---
target: contract-design
plugin: acxd
adds:
  produces:
    - acxd-data-request-contracts
  required_sections:
    - "ACXD Data Request Contracts"
fragments:
  - anchor: after-step:3
    order: 100
---

## fragment: after-step:3

### Step 3b (acxd): ACXD Data Request Contracts

Design data request contracts that comply with the ACXD platform conventions. Produce `acxd-data-request-contracts.md`.

**Request format — JSON body (flat preferred for generated/mock contracts; nesting allowed):**
```json
{
  "accountId": "{{context.verified_account_id}}",
  "action": "getBalance"
}
```
- ACXD supports nested JSON request bodies (objects and arrays) as well as URL parameters, on any method. For a
  generated or mocked contract, PREFER a flat JSON body (simpler to test and read); nesting is fine whenever the
  real API's contract nests.
- Variable references use `{{slot.name}}` or `{{context.name}}` syntax in the ACXD data request configuration.
- One endpoint per operation (do not overload a single endpoint with an `action` discriminator unless operations share the same request shape).

**Response format — bare value object:**
```json
{
  "balance": 1234.56,
  "balanceFormatted": "$1,234.56",
  "currency": "AUD",
  "lastUpdated": "2026-09-01T10:30:00Z"
}
```
- Return a flat object with the requested values. No wrapper envelope, no `resolvedVariables` nesting.
- Every monetary value returns both raw numeric (`balance`) and pre-formatted string (`balanceFormatted`).
- Boolean results use `found`/`verified` naming: `{"verified": true, "verificationMethod": "DOB"}`.

**Response conventions:**
- HTTP 200 for business-logic failures (e.g., account not found): `{"found": false, "reason": "Account not found"}`. Flow logic branches on the `found` field.
- HTTP 4xx/5xx only for infrastructure errors (auth failure, timeout, service down).
- Success-only string fields: return a human-readable string only when the outcome is positive. Absence of the field = negative outcome.

**Contract documentation per data request:**
| Field | Description |
|-------|-------------|
| Name | `dr-{usecase}-{operation}` (e.g., `dr-billing-getBalance`) |
| Endpoint | `POST /api/v1/{resource}/{operation}` |
| Request fields | List with types and variable source |
| Response fields | List with types and consumption point in flow |
| Timeout | Recommended 8s |
| Error handling | Flow behaviour on timeout / 4xx / 5xx |
| Consumers | Which flows call this data request |
