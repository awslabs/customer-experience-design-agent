---
name: acxd-enhancement
plugin: acxd
depth: Minimal
test_strategy: Minimal
keywords:
  - acxd enhancement
  - acxd change
  - modify flow
  - update flow
  - add flow
  - brownfield
description: Enhancement to an existing ACXD deployment — add or modify flows on an established platform
skeleton: off
runner: true
---

# acxd-enhancement scope

Brownfield-focused enhancement — 12 core stages plus 7 ACXD plugin stages. Minimal depth and test strategy
for targeted changes to an existing deployment.

## When to use

- Adding a new use case to an existing ACXD platform
- Modifying existing flows (prompt tuning, new data request, flow restructure)
- Sprint team building on an established platform with existing component library
- Incremental change on an established platform — fast, since the platform foundation already exists

## Why these stages, why skip those

Begins with Reverse Engineering (exports existing flows, inventories resources, maps component library).
Skips all Ideation stages (the platform already exists). Retains Requirements Analysis, platform config
(verify existing), flow design, component design (brownfield discovery — reuse existing components),
resource creation (only new), flow build (only changed/new), and deployment.

## Membership

Keyword triggers: `acxd enhancement`, `acxd change`, `modify flow`, `update flow`, `add flow`, `brownfield`.
