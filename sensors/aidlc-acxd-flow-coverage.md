---
id: acxd-flow-coverage
kind: deterministic
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-acxd-flow-coverage.ts
default_severity: advisory
description: Reports whether all requirements map to at least one ACXD flow (acxd plugin, advisory)
category: document-shape
matches: "**/{aidlc-docs,intents}/**"
input_schema:
  output_path: string
  stage_slug: string
output_schema:
  pass: boolean
  findings_count: integer
  covered_count: integer
  total_count: integer
timeout_seconds: 5
---

# ACXD Flow Coverage Sensor

Reports whether every identified requirement from the requirements-analysis stage maps to at least one ACXD
flow produced in acxd-flow-design (or acxd-component-design for acxd-enhancement).

## What it checks

Reads `acxd-flow-coverage.json` from the stage output path. This file is produced by `acxd-flow-design`
and contains a requirements-to-flow mapping. The sensor counts:

- `total_count` — total requirements captured in requirements-analysis
- `covered_count` — requirements that map to at least one flow
- `findings_count` — requirements with no flow coverage (total - covered)
- `pass` — true when `findings_count == 0`

## Severity

Advisory — uncovered requirements are surfaced as a warning, not a blocker. The agent should address
uncovered requirements before leaving the Inception phase, but the workflow is not halted.

## Output file format (`acxd-flow-coverage.json`)

```json
{
  "requirements": [
    {
      "id": "REQ-001",
      "description": "Customer can authenticate by account number and date of birth",
      "flows": ["shared-verify-identity"]
    },
    {
      "id": "REQ-002",
      "description": "Customer can check current account balance",
      "flows": ["uc-account-balance"]
    },
    {
      "id": "REQ-003",
      "description": "Customer can dispute a transaction",
      "flows": []
    }
  ]
}
```

A requirement with an empty `flows` array is uncovered. The sensor reports each uncovered requirement
by ID and description so the agent knows exactly what to address.
