---
name: acxd-platform-poc
plugin: acxd
depth: Standard
test_strategy: Standard
keywords:
  - acxd platform poc
  - platform poc
  - platform proof of concept
  - validation slice
  - realistic poc
  - path to production poc
description: Fast path to a platform solution — realistic mocked (or optionally live) integrations, knowledge and auth, minus the operationalisation stages
skeleton: off
runner: true
summary_confirmation: off
learnings: off
---

# acxd-platform-poc scope

A fast path to a **platform** solution. This is the middle ground between `acxd-poc` (demo ACXD only,
everything external mocked and simple) and `acxd-usecase` (full production single use case). It validates a
realistic vertical slice of the platform — realistic integrations, knowledge, and authentication that prove
out the path to production — while deferring the operationalisation work (monitoring, runbooks, cutover,
onboarding, CI/CD, environment promotion) that a production go-live requires.

Use it to prove the whole system works end-to-end and to establish an easy on-ramp to a production platform,
without committing to the full production-hardening tail.

## When to use

- You want to validate a realistic slice of the platform (API, knowledge, auth), not just demonstrate ACXD
- You want mocked integrations by default, but with the option to define real API contracts and to test
  against a live endpoint in the test environment
- You need a consolidated architecture document and a packaged deliverable that shows the path to production
- You are NOT yet ready for operational go-live (no monitoring/runbook/cutover/CI-CD required yet)
- A fast path to a realistic platform slice — quicker than a full platform build, richer than a POC

## How it differs from adjacent scopes

- **vs `acxd-poc`:** Platform POC keeps the realism levers — Backend Design & Build (deployed API Gateway + Lambda mocks, user-defined API
  contracts, optional live test endpoint), and the full architecture document. `acxd-poc` is ACXD-only:
  static inline mocks, synthetic data, no external auth capability, no backend stages.
- **vs `acxd-usecase`:** The ONLY difference is Platform POC skips the operationalisation steps. Everything
  else is identical. The moment you need monitoring, an operational runbook, a cutover plan, sprint-team
  onboarding, CI/CD, or environment promotion, you are in `acxd-usecase` (or `acxd-platform`).

## Integration defaults

APIs deployed by this solution with synthetic data, and synthetic knowledge, are the **default**. Per data source, the user may optionally:

- Define the real API contract (request/response shape, field names) so the mock mirrors production, and
- Point the source at a **live endpoint in the test environment** instead of a mock.

Switching a source between mock and live is a data-request change only — no ACXD flow changes.

## ACXD stages included

| Stage | Notes |
|-------|-------|
| CX Discovery (1.8) | Full discovery, scoped to the platform-poc slice |
| Platform Config (2.65) | Platform levers configured (workspace, integrations, channels, security) |
| User Stories & Scoping (2.70) | Detailed, approvable user stories tied to KPIs; scoping snapshot generated |
| Flow Design (2.75) | Full flow topology, variable strategy, prompt specs |
| Backend Design (2.78) | Mock contracts by default; user may define real contracts or a live test endpoint |
| Resource Creation (3.45) | SDK-automated resource creation |
| Flow Build (3.55) | Generate importable .flow.json |
| Backend Build (3.65) | Deployed API Gateway + Lambda mocks (and production handlers for any live source) |
| Build & Deploy (4.15) | Deploy to ACXD workspace |
| Operational Readiness (4.35) | **Architecture document (full) + distribution folder only** — all operationalisation steps skipped |

## ACXD stages skipped

Platform POC does not skip any ACXD stage outright — it runs Operational Readiness in a reduced form
(architecture document + distribution folder only). The operationalisation *steps* within that stage
(analytics verification, guardrails, monitoring, runbook, resource inventory audit, target metrics, cutover
plan, post-go-live measurement, environment promotion, sprint-team onboarding) are skipped.

## Membership

Keyword triggers: `acxd platform poc`, `platform poc`, `platform proof of concept`, `validation slice`,
`realistic poc`, `path to production poc`.
