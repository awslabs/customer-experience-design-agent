---
target: intent-capture
plugin: acxd
adds:
  required_sections:
    - "Contact Centre Context"
    - "Engagement Pattern"
fragments:
  - anchor: after-step:2
    order: 100
---

## fragment: after-step:2

### Step 2b (acxd): Contact Centre Context & Engagement Qualification

Before refining the intent statement, capture the contact centre landscape:

**Current state:**
- What contact centre platform is in use today? (Amazon Connect, Genesys, Avaya, other)
- What channels are active? (Voice inbound, voice outbound, chat, email, SMS, social)
- What automation exists? (DTMF IVR, basic chatbot, none)
- What are the top pain points? (Long handle times, high escalation, after-hours gaps, agent attrition)

**Automation goals:**
- Which customer interactions should be automated first?
- What does success look like? (Containment rate target, AHT reduction, CSAT improvement)
- Are there compliance constraints? (PCI, PII, call recording consent, data residency)

**Engagement pattern probe:**
- "Is the goal to solve one specific customer interaction, or to build a platform hosting multiple automated journeys?"
- "Are there other use cases identified beyond the initial one? How many?"
- "Will multiple teams build on this platform?"

Record the preliminary engagement pattern signal in the intent statement:
- `use-case-lead` — single use case, deploy and done
- `platform-single` — platform build starting with one lead use case
- `platform-multi` — platform build with multiple initial use cases

This signal is confirmed during CX Discovery (stage 1.8) but capturing it early steers scope selection.
