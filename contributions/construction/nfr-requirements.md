---
target: nfr-requirements
plugin: acxd
adds:
  produces:
    - acxd-cx-nfr-requirements
  required_sections:
    - "Voice & Chat NFRs"
    - "CX Compliance Requirements"
fragments:
  - anchor: after-step:6
    order: 100
---

## fragment: after-step:6

### Step 6b (acxd): Voice & Chat NFRs

Produce `acxd-cx-nfr-requirements.md` with CX-specific non-functional requirements:

**Voice channel:**
- End-to-end latency: < 3s for deterministic paths, < 5s acceptable for agentic paths (utterance end → TTS start)
- ASR accuracy target: ≥ 90% for trained slot types, ≥ 85% for open utterances
- TTS quality: neural voice, consistent persona across all flows
- Silence timeout: 8–12s (configurable per node; shorter for confirmations, longer for complex input)
- Barge-in: enabled for menus and confirmations, disabled during critical instructions
- DTMF fallback: available for numeric input (account numbers, PINs, menu selections)
- Concurrent voice sessions: sized to peak contact volume + 20% headroom

**Chat channel:**
- Message delivery latency: < 2s for deterministic, < 4s for agentic
- Rich content rendering: cards, carousels, quick reply buttons tested across target browsers/devices
- Typing indicator: displayed during data request and LLM processing
- Session timeout: 15 minutes inactivity (configurable), with warning at 12 minutes
- File attachment: if required, maximum size and allowed MIME types defined

**Live Sync (Voice+):**
- Visual render latency: < 1s after trigger event
- Form submission handling: synchronise visual input with voice flow state
- Fallback: voice-only path if Live Sync fails to connect

### Step 6c (acxd): CX Compliance Requirements

**Call recording consent:**
- Jurisdiction-specific opt-in/opt-out rules identified
- Consent capture point in flow defined (typically after greeting, before data collection)
- Recording pause/resume for PCI-scoped segments

**PII redaction:**
- Fields requiring redaction in logs and analytics: SSN, DOB, card numbers, account numbers, passwords
- Redaction method: Contact Lens redaction rules or ACXD-level variable masking
- Retention policy per data classification

**Data residency:**
- Customer data processing region confirmed (must match Connect instance region)
- Cross-region data transfer constraints documented

**Audit trail:**
- Interactions requiring immutable logging: identity verification, payment processing, consent capture, escalation decisions
- Log format and retention period defined
