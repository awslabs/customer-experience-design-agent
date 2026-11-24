---
id: acxd-stage-exit
kind: deterministic
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-acxd-stage-exit.ts
default_severity: blocking
fire_on: gate
description: Runs the stage's own exit criteria before its approval gate opens (acxd plugin, blocking)
category: process-gate
matches: "**/{aidlc-docs,intents}/**"
input_schema:
  output_path: string
  stage_slug: string
output_schema:
  pass: boolean
  findings_count: integer
  findings: string[]
timeout_seconds: 300
---

# ACXD Stage Exit Sensor

Runs the `## Exit criteria` list in the current stage's file when the stage opens its approval gate, and blocks
the gate until every criterion is met. Each criterion is written in the stage that creates what it checks, so it
moves with that step. The sensor itself is generic and knows nothing about any one artifact.

## Criteria format

Under a `## Exit criteria` heading in the stage body, one bullet per criterion:

- `run: <command>` is met when the command exits 0. Use a shipped tool that owns the rule.
- `files: <glob>` is met when at least one file matches, relative to the project root.

`{{HARNESS_DIR}}` and `<record>` (the stage's record dir) are substituted. A criterion should pass on an empty
set (for example no APIs), so no per-case conditions are needed.

## When it runs

The gate fires a sensor once per declared deliverable. This sensor acts only on the stage's first `produces`
entry and passes the others, so the criteria run once per gate. To use it, add `acxd-stage-exit` to a stage's
`sensors:` list and add the `## Exit criteria` section.

## On failure

The gate stays closed and the detail file lists each failed criterion with the tool's output. Fix the cause and
re-open the gate. An override is a separate, logged human decision.
