---
id: acxd-deploy-status
kind: deterministic
command: bun {{HARNESS_DIR}}/tools/aidlc-sensor-acxd-deploy-status.ts
default_severity: blocking
description: Reports ACXD application build and deployment status (acxd plugin)
category: process-gate
matches: "**/{aidlc-docs,deploy}/**"
input_schema:
  output_path: string
  stage_slug: string
output_schema:
  pass: boolean
  build_status: string
  deploy_status: string
  application_id: string
timeout_seconds: 10
---

# ACXD Deploy Status Sensor

Reports the result of an ACXD application build and deployment operation. Used as a gate in the
`acxd-build-deploy` stage to confirm a build and deployment completed successfully before the stage
is marked approved.

## What it checks

Reads `acxd-deploy-status.json` from the stage output path. This file is written by the SDK deployment
script (generated in `acxd-build-deploy`) and updated after each poll cycle.

- `build_status` — one of `PENDING`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`
- `deploy_status` — one of `PENDING`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`
- `application_id` — the ACXD application ID (from UI config ``)
- `pass` — true only when both `build_status == "SUCCEEDED"` and `deploy_status == "SUCCEEDED"`

## Severity

Blocking — a failed or incomplete build/deploy prevents the stage from being approved. The agent must
investigate the failure, fix the root cause (usually a stale resource reference, missing secret, or
knowledge base not yet indexed), and re-run the deployment script.

## Output file format (`acxd-deploy-status.json`)

```json
{
  "application_id": "app-abc123",
  "build_id": "bld-xyz789",
  "build_status": "SUCCEEDED",
  "deploy_id": "dep-def456",
  "deploy_status": "SUCCEEDED",
  "build_started_at": "2026-09-02T10:00:00Z",
  "build_completed_at": "2026-09-02T10:03:22Z",
  "deploy_completed_at": "2026-09-02T10:04:15Z",
  "environment": "staging"
}
```

## Common failure causes

- `build_status: FAILED` — usually a missing or mis-named resource (slot, data request, knowledge base).
  Check the ACXD console build logs.
- `deploy_status: FAILED` after `build_status: SUCCEEDED` — usually a Connect integration issue.
  Verify the Connect integration stack is deployed and the Agentic CX block's Workspace/Application/Alias match the deployed ACXD application.
- Status stuck at `IN_PROGRESS` — the polling script timed out. Re-run the deployment script; the build
  continues server-side and the script will resume polling.
