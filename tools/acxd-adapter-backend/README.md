# Adapter Integration (Tier 2 — live API needs translation)

Deploy this **only** when the customer has a **live upstream system of record** — their own CRM, policy/
account database, identity-verification service, or similar back-end API that a Data Request needs to call —
**and** that API does not fit the ACXD Data Request contract directly (needs auth translation, response
flattening, status normalisation, or private-VPC reach). ("Live system" here is the customer's business data
source behind a Data Request; it is unrelated to the Amazon Connect instance, which is the separate telephony
channel every ACXD solution uses regardless of backend.)

- **Live API fits ACXD directly?** Deploy nothing here — point the Data Request at it with a Secret.
- **No live API yet?** Use `../mock-integration/` (synthetic data), not this folder.

## Upstream secrets

Store any upstream credential in AWS Secrets Manager under the fixed path
`acxd/<projectName>/<environment>/<name>` (for example `acxd/northwindEnergyBilling/dev/upstream`).
The stack grants the adapter Lambdas read access to that path only, and the handler derives the name from
`PROJECT_NAME` and `ENVIRONMENT`, so no extra configuration is needed.

## Deploy
```bash
cd cdk
npm install
npx cdk deploy --context environment=<env> --context projectName=<projectName> --context region=<region>
```
Stack: `AcxdAdapterStack` (name `acxd-<projectName>-<env>`). API Gateway + adapter Lambda(s) under
`functions/` that call the customer's external system of record and flatten the response to the ACXD contract.
`functions/verify-identity/handler.py` is the starting handler — copy it per operation.
