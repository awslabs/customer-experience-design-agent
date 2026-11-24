---
target: deployment-pipeline
plugin: acxd
adds:
  required_sections:
    - "ACXD SDK Deployment"
fragments:
  - anchor: after-step:3
    order: 100
---

## fragment: after-step:3

### Step 3b (acxd): ACXD SDK Deployment Pipeline

Extend the deployment pipeline with the ACXD SDK deployment track:

**Split pipeline architecture:**
- **Track 1 (AWS-native):** CodePipeline / GitHub Actions → `cdk deploy` (backend integration stack: Lambda + API Gateway + data store only if justified) → Connect integration stack (contact flow via Agentic CX block from `mainflow.json`, escalation queue, routing profile) — deployed after the ACXD app exists
- **Track 2 (ACXD SDK):** Node.js scripts → create/update resources → build application → poll for build completion → deploy application → verify

Track 1 deploys first (backends must be live before ACXD data requests can reach them). Track 2 follows.

**ACXD SDK deployment steps:**

1. **Resource sync** — run SDK resource creation scripts (idempotent: creates if missing, updates if changed). Secrets, data requests, slot types, knowledge bases, flow scaffolds.

2. **Build** — invoke `CreateApplicationBuildCommand` with workspace ID and application ID.
   ```javascript
   const buildResponse = await client.send(new CreateApplicationBuildCommand({
     workspaceId: config.workspaceId,
     applicationId: config.applicationId
   }));
   ```

3. **Poll for build completion** — ACXD builds are async `[GA-GAP]`. Poll `GetApplicationBuildCommand` every 15s with a 10-minute timeout. Exit codes: `COMPLETED`, `FAILED`, `TIMED_OUT`.

4. **Deploy** — on successful build, invoke `CreateApplicationDeploymentCommand`.
   ```javascript
   const deployResponse = await client.send(new CreateApplicationDeploymentCommand({
     workspaceId: config.workspaceId,
     applicationId: config.applicationId,
     buildId: buildResponse.buildId
   }));
   ```

5. **Verify** — confirm deployment status, run smoke test in widget, verify analytics tags firing.

**Multi-environment flow (platform engagements):**
- dev: deploy on every merge to `dev` branch (auto)
- staging: deploy on merge to `staging` branch (auto + integration test gate)
- prod: deploy on release tag (manual approval gate + smoke test)
- Each environment uses its own workspace ID and API token (stored in Secrets Manager)
