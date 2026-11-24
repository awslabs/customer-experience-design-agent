---
target: deployment-execution
plugin: acxd
adds:
  required_sections:
    - "ACXD Deployment Verification"
fragments:
  - anchor: after-step:3
    order: 100
---

## fragment: after-step:3

### Step 3b (acxd): ACXD Deployment Verification

After deployment execution completes, verify the ACXD-specific deployment:

**Build status verification:**
- Confirm `GetApplicationBuildCommand` returns `COMPLETED` status
- If `FAILED`: retrieve build error details, check for common failures (invalid flow JSON, missing resource references, untrained slot types with no utterances)
- Record build ID and timestamp in deployment log

**Deployment status verification:**
- Confirm `GetApplicationDeploymentCommand` returns active deployment
- Record deployment ID, build ID, and environment in deployment log

**Functional verification (post-deploy):**
- Open ACXD widget in the target environment
- Run the core test conversation for each use case (happy path)
- Verify: greeting renders, intent classification works, data requests return data, escalation triggers correctly, conversation reaches End node

**Analytics tag verification:**
- Trigger each tagged interaction path
- Confirm analytics events fire in ACXD analytics dashboard:
  - Completion tags (successful resolution)
  - Escalation tags (handoff to agent)
  - Milestone tags (key interaction points — auth success, payment complete)
  - Failure tags (error conditions — backend timeout, auth failure)
  - Friction tags (reprompts, fallbacks, unexpected paths)

**Connect contact flow verification:**
- Confirm the Amazon Connect contact flow routes to the ACXD application correctly
- Test inbound call → Connect → ACXD handoff → conversation → escalation → Connect queue
- Verify caller ID and context data pass through the handoff

**Rollback readiness:**
- Confirm previous known-good build ID is recorded
- Verify rollback procedure: redeploy previous build via `CreateApplicationDeploymentCommand` with prior `buildId`
- Document rollback decision criteria (error rate threshold, latency spike, critical bug)
