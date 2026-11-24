---
target: requirements-analysis
plugin: acxd
adds:
  produces:
    - acxd-cx-requirements
  required_sections:
    - "Contact Centre Requirements"
fragments:
  - anchor: after-step:3
    order: 100
---

## fragment: after-step:3

### Step 3b (acxd): Contact Centre Requirements Dimensions

Extend the requirements analysis with CX-specific dimensions. Produce `acxd-cx-requirements.md`.

**Channel requirements:**
- Voice: ASR accuracy targets, TTS voice selection, barge-in behaviour, silence timeout (recommend 8–12s), DTMF fallback for accessibility
- Chat: rich content support (cards, carousels, quick replies), typing indicators, file attachment needs
- Live Sync (Voice+): which interactions benefit from visual guidance (forms, selections, confirmations)? Define trigger points.

**Latency budgets:**
- Voice round-trip target (sub-3s from utterance end to TTS start for deterministic flows; sub-5s acceptable for agentic)
- Data request timeout (recommend 8s hard limit; design for graceful degradation on timeout)
- Backend API SLA per integration

**Escalation criteria:**
- When does automation hand off to a human agent? Define explicit triggers: customer request, auth failure threshold, sentiment detection, compliance boundary, out-of-scope intent.
- Escalation context: what data transfers to the agent? (conversation summary, verified identity, account state)

**Compliance requirements:**
- Call recording consent: does the jurisdiction require explicit opt-in? At what point in the flow?
- PII handling: which fields require redaction in logs/analytics? (SSN, DOB, account numbers, card numbers)
- PCI scope: any payment flows? If yes, design secure payment isolation.
- Data residency: are there constraints on which region processes customer data?
- Audit trail: which interactions require immutable logging for regulatory review?

**Customer persona definitions:**
- Who calls/chats? (Age demographics, tech comfort, language preferences, accessibility needs)
- What is the expected emotional state? (Frustrated bill dispute vs routine inquiry)
- Persona drives conversation design: vocabulary level, confirmation frequency, error recovery patience.
