---
name: acxd-poc
plugin: acxd
depth: Minimal
test_strategy: Minimal
keywords:
  - acxd poc
  - acxd demo
  - acxd proof of concept
  - quick demo
  - show me acxd
description: Rapid ACXD proof of concept — minimal input, ACXD static mocks / synthetic data, no external auth, fast path to deploying ACXD flows
skeleton: off
runner: true
summary_confirmation: off
learnings: off
---

# acxd-poc scope

Express proof-of-concept — the fastest path to a working ACXD flow deployed in your workspace. This scope
demonstrates **ACXD itself**: all external integrations are mocked with ACXD static (inline) responses and
synthetic data, kept as fast and simple as possible. There is no external backend, no deployed mock
infrastructure, and no external authentication capability.

If you need realistic integrations, deployed mocks, user-defined API contracts, live test endpoints, or real
authentication to validate a path to production, use `acxd-platform-poc` instead.

## When to use

- "Show me what ACXD can do" — proving the art of the possible
- Quick demo for stakeholder buy-in before committing to a full engagement
- Internal testing and harness validation
- Minimal input, everything external mocked and simple
- The fastest path to a working ACXD flow

## What this scope is (and isn't)

- **Integrations:** ACXD static (inline) mocks only, with synthetic data authored during resource creation.
  No API Gateway + Lambda, no external backend.
- **Authentication:** No external auth capability. If a flow needs a sense of "verified", it is simulated
  with a static mock response — no real identity provider or credential check.
- **Knowledge:** Synthetic knowledge base content, generated for the demo.
- **Backend stages:** Backend Design and Backend Build do NOT run (there is no external backend to design or
  build). Static mock data is authored inline during Resource Creation.

For realistic APIs, knowledge, auth, deployed mocks, or a path to production → `acxd-platform-poc`.

## ACXD stages included

| Stage | Why included |
|-------|-------------|
| CX Discovery (1.8) | Gather use case requirements and prior context — scoped to one use case |
| Platform Config (2.65) | Minimal — single workspace, single environment |
| User Stories & Scoping (2.70) | Short set of stories: the minimum the flows are designed and tested against |
| Flow Design (2.75) | Design the flow topology, variable strategy, prompt specs |
| Resource Creation (3.45) | SDK-automated resource creation, including inline static mock data + synthetic KB content |
| Flow Build (3.55) | Generate importable .flow.json |
| Build & Deploy (4.15) | Deploy to ACXD workspace |
| Operational Readiness (4.35) | Simplified architecture document + distribution folder only |

## ACXD stages skipped

| Stage | Why skipped |
|-------|------------|
| Backend Design (2.78) | No external backend — integrations are ACXD static mocks authored in Resource Creation |
| Backend Build (3.65) | No external backend — nothing to build or deploy |

## Membership

Keyword triggers: `acxd poc`, `acxd demo`, `acxd proof of concept`, `quick demo`, `show me acxd`.
