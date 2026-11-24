---
target: domain-design
plugin: acxd
adds:
  required_sections:
    - "ACXD Architecture Patterns"
fragments:
  - anchor: after-step:4
    order: 100
---

## fragment: after-step:4

### Step 4b (acxd): ACXD Architecture Patterns

Overlay the domain model with ACXD-specific architecture decisions:

**Deterministic vs agentic classification per domain entity:**
- Identity verification, money movement, compliance gates, routing → **deterministic flows** (fixed nodes, auditable paths, no LLM variance)
- Open-ended understanding, FAQ resolution, complex multi-turn servicing → **agentic flows** (Generative Journey with tools)
- Mixed interactions → deterministic shell with agentic segments (e.g., deterministic auth → agentic servicing → deterministic payment)

**Flow boundaries (keep the conversation together):**
- A use case stays in one flow unless a part passes one of the flow tests; its other boundaries are nodes.

**Resource ownership:**
- Each use case owns its flows and resources, named in its namespace; nothing is shared across use cases
  (flows and resources are workspace-scoped while use cases are separated by application)
- Every resource carries a verbose description identifying its consumers

**Variable lifecycle:**
- Slot variables: captured from user utterances (ASR/NLU output)
- Context variables: set programmatically or passed between flows via Redirect
- Data request variables: populated from backend API responses
- System variables: channel, locale, session metadata
- Promotion pattern: slot → validated context variable after verification
- Flows receive context-in via Redirect parameters; return context-out via context variable conventions

**Generative Journey placement:**
- Use Generative Journey nodes for: open-ended FAQ, complex multi-turn gathering, situations where the conversation path cannot be predetermined
- Do NOT use Generative Journey for: identity verification, payment processing, compliance-gated actions, simple yes/no routing
- Every Generative Journey node needs a prompt specification (ROLE/CONTEXT/ACTIONS/STYLE/COMPLIANCE)
