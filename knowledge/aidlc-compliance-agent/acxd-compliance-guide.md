# ACXD Contact Centre Compliance Guide

For the aidlc-compliance-agent. Covers compliance requirements specific to contact centre automation on ACXD.
All compliance guidance should be validated against the customer's specific regulatory obligations and legal counsel.

---

## Call Recording Consent

### Jurisdiction Rules
- **One-party jurisdictions** (most of the US): only one party to a call needs to consent to recording. The system (AWS/ACXD) is a party, so recording can proceed without explicit caller consent announcement — but many organisations announce it anyway as best practice.
- **Two-party (all-party) jurisdictions** (California, many EU countries, Australia): ALL parties must consent before recording begins. The bot **must announce recording and obtain consent** before capturing any data in these jurisdictions.

### ACXD Implementation
- Place the recording consent announcement and consent capture at the VERY START of the Welcome flow — before any data is collected.
- Use a User Choice node to capture consent (Yes/No slot). Route `No` to a graceful exit ("Understood. For assistance without recording, please call [alternative number]. Goodbye.").
- Route `Yes` to the main interaction.
- Contact Lens call recording is controlled at the Amazon Connect contact flow level — ensure the Connect contact flow enables recording only after consent is obtained.

---

## PII Handling

### In ACXD Flows
- **Sensitive flag**: enable the Sensitive flag on any slot capturing PII (SSN, account number, card number, date of birth, health info). Sensitive slots are excluded from ACXD logs.
- **No PII in Basic node messages**: never echo PII back in a spoken message unless necessary. If you must confirm, echo only a masked version ("I have your account ending in 1234").
- **Context variable sensitivity**: use `isSensitive: true` on context variables that hold PII.
- **Do not store PII in analytics tags**: tag labels are for category tracking, not data capture.

### Contact Lens Redaction
Amazon Connect Contact Lens can redact PII from transcripts and recordings. Configure redaction for:
- Credit card numbers
- SSN
- Phone numbers
- Dates of birth (in healthcare contexts)

Enable this at the Connect contact flow level.

### Backend Handling
- Never log PII at the Lambda level. Use structured logging with sensitive field exclusion.
- Do not store raw PII in DynamoDB unless the data model requires it — store tokenised/hashed references where possible.
- Ensure DynamoDB encryption at rest is enabled (it is the default, but verify explicitly).

---

## PCI-DSS Compliance (Payment Card Industry)

**The ACXD platform should NOT be used to capture card numbers directly.**

### Compliant Patterns
1. **Out-of-band payment link**: the ACXD flow sends the caller a payment link (SMS/email via a data request to a notification service). The caller completes payment on a PCI-compliant hosted page outside the voice/chat channel.
2. **DTMF/IVR tokenisation**: if voice card capture is required, route to a PCI-compliant IVR segment that captures DTMF and tokenises via a payment gateway without ACXD seeing the card number.
3. **Agent-assisted payment**: escalate to a live agent who uses a PCI-compliant agent desktop tool.

### What to Avoid
- Do NOT capture card numbers in ACXD User Choice or Generative Journey nodes (even with Sensitive flag — not PCI-compliant).
- Do NOT pass card numbers through Lambda/DynamoDB without PCI certification of that infrastructure.

---

## HIPAA (Healthcare)

If the contact centre handles Protected Health Information (PHI):
- Confirm AWS HIPAA eligibility of all services used (Amazon Connect, Lambda, DynamoDB, Bedrock — all eligible with BAA).
- AWS Business Associate Agreement (BAA) must be in place.
- Confirm ACXD's HIPAA eligibility with the AWS team before using ACXD for PHI.
- Contact Lens is HIPAA-eligible — enable redaction for health identifiers.

---

## Data Residency `[DOC]`

ACXD workspace region = data residency location. ACXD workspaces are created in specific AWS regions. Confirm:
- The workspace is created in the correct region for the customer's data residency requirements.
- Backend services (Lambda, DynamoDB, API Gateway) are deployed in the same region.
- Bedrock/LLM inference region — confirm model availability in the required region.
- Amazon Connect instance region must match or have a documented cross-region justification.

---

## Audit Trail

For regulated industries, ensure a complete audit trail:

| Layer | Mechanism |
|-------|----------|
| ACXD analytics | Tags on key nodes (auth, confirmation, completion, escalation) — see playbook Rule 20 |
| Amazon Connect | Contact Trace Records (CTR) — every contact logged with timestamps and routing decisions |
| Contact Lens | Call recording + transcript + sentiment analysis |
| Lambda logs | CloudWatch Logs — every tool invocation logged (exclude PII in log messages) |
| DynamoDB | Point-in-time recovery enabled; CloudTrail for write auditability if required |

**Retention**: set log retention policies per regulatory requirement (often 7 years for financial services).

---

## Consent Management (Marketing / Upselling)

If the contact centre uses ACXD flows for marketing, upselling, or preference capture:
- Respect existing marketing opt-out preferences — check before presenting an upsell offer.
- Provide a clear opt-out path during the interaction.
- TCPA compliance (US) for outbound voice and SMS — do not contact numbers on Do Not Call lists.
- GDPR/CCPA right-to-be-forgotten — ensure the data model supports deletion requests.

---

## Compliance Cross-Cutting Concerns (All Flows)

Apply these to every ACXD flow across all use cases:

1. **Guardrail configuration**: configure an output guardrail to enforce: no investment/tax/legal/medical advice, no discriminatory content based on protected characteristics, no off-topic sensitive content.
2. **Safe fallback**: every Generative Journey must have a compliant never-do list with a safe fallback: "I can't help with that, but I can connect you with a specialist."
3. **No irreversible actions without confirmation**: any write action (payment, account change, case creation) requires explicit confirmation from the caller before execution.
4. **Escalation path always available**: callers must always be able to reach a human agent. The escalation path must never be blocked by a flow error.
5. **Session timeout**: set `conversationTTL` on the application to an appropriate value for the use case (default is 5 minutes).

---

## Compliance Checklist for Operational Readiness

Before go-live:
- [ ] Call recording consent announcement tested and working in applicable jurisdictions
- [ ] Sensitive flag enabled on all PII slots
- [ ] Contact Lens redaction configured and tested
- [ ] No card numbers flow through ACXD or backend
- [ ] BAA in place if handling PHI
- [ ] Workspace in correct region for data residency
- [ ] Audit trail configured (CTR, CloudWatch, Contact Lens)
- [ ] Log retention policies set
- [ ] Output guardrail deployed and tested
- [ ] Opt-out/Do-Not-Call compliance verified (if outbound/marketing)
- [ ] Escalation path tested and never blocked
