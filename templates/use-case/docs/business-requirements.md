# <Use Case Name>: Business Requirements

<!-- AGENT: This template is populated during CX Discovery (Stage 1.8) and refined during
     Requirements Analysis (Stage 2.3). Replace all <placeholders> with engagement-specific content.
     Delete guidance comments before presenting to the customer. -->

## Use Case Overview

| Field | Value |
|-------|-------|
| **Use Case Name** | <name> |
| **Engagement Pattern** | <use-case-lead / platform-single / platform-multi> |
| **AI-DLC Scope** | <acxd-platform / acxd-usecase / acxd-poc / acxd-enhancement> |
| **Classification** | <deterministic / agentic / hybrid> |
| **Priority** | <P1 / P2 / P3> |
| **Estimated Contact Volume** | <N contacts/day> |
| **Current AHT** | <N seconds> |

## Description

<!-- One paragraph describing the customer interaction from greeting to resolution.
     What does the customer want? What steps does the agent (human or automated) take? -->

## User Stories

<!-- Format: As a <persona>, I want to <action>, so that <benefit>.
     Include at least: caller happy path, caller error path, agent escalation path. -->

| # | User Story | Acceptance Criteria | Classification |
|---|-----------|-------------------|----------------|
| 1 | As a caller, I want to ... | Given ... When ... Then ... | Deterministic |
| 2 | As a caller, I want to ... | Given ... When ... Then ... | Agentic |
| 3 | As an agent, I want to ... | Given ... When ... Then ... | Deterministic |

## Deterministic vs Agentic Classification

<!-- AGENT: Apply the decision framework from acxd-flow-design.md (deterministic vs agentic).
     Identity/money/compliance = deterministic. Open-ended understanding = agentic. -->

| Interaction Segment | Classification | Rationale |
|--------------------|---------------|-----------|
| Identity verification | Deterministic | Fixed steps, auditable, compliance-sensitive |
| <segment> | <classification> | <rationale> |

## Contact Centre Baseline Metrics

<!-- AGENT: Capture from CX Discovery Step 5. Mark "N/A" if not tracked. -->

| Metric | Current Baseline | Target (30 days) | Target (90 days) |
|--------|-----------------|-------------------|-------------------|
| Containment rate | | | |
| Average handle time (AHT) | | | |
| First contact resolution (FCR) | | | |
| Customer satisfaction (CSAT) | | | |
| Escalation rate | | | |
| Cost per contact | | | |
| Abandonment rate | | | |
| Contact volume (this use case) | | | |

## External Integration Requirements

<!-- AGENT: From CX Discovery Step 4. One row per external system. -->

| System | Type | Access Method | Read/Write | Compliance | Owner |
|--------|------|--------------|------------|------------|-------|
| <CRM name> | CRM | API key | Read | PII | <team> |
| <payment system> | Payment | OAuth | Write | PCI | <team> |

## Channel Requirements

<!-- AGENT: Which channels does this use case serve? -->

| Channel | Required | Notes |
|---------|----------|-------|
| Voice (Amazon Connect) | Yes / No | |
| Chat (ACXD widget) | Yes / No | |
| Live Sync (Voice+) | Yes / No | |
| SMS / async | Yes / No | |

## Compliance & Security

<!-- AGENT: Compliance requirements specific to this use case. -->

- Call recording consent: <one-party / two-party jurisdiction>
- PII handling: <what PII is captured, how is it handled>
- PCI scope: <yes/no — does this use case handle payment card data>
- Data residency: <region requirements>

## Success Criteria

<!-- AGENT: How will we know this use case is successful? Tie to baseline metrics. -->

1. <criterion — e.g., "Containment rate reaches 60% within 30 days of go-live">
2. <criterion>
3. <criterion>
