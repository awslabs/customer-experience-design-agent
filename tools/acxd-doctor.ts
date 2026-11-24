// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// ACXD plugin doctor check.
// Verifies the composed install contains all files the acxd plugin ships.
// It is deterministic and read-only: inspect the composed install, then emit
// the plugin doctor JSON contract on stdout.

import { existsSync } from "node:fs";
import { join } from "node:path";

const projectDir = process.env.AIDLC_PROJECT_DIR ?? process.cwd();
const harnessDir = process.env.AIDLC_HARNESS_DIR ?? ".claude";
const harnessRoot = join(projectDir, harnessDir);

const fix = `Run \`bun ${harnessDir}/tools/aidlc-utility.ts plugin-sync\` (or re-run the plugin's \`hooks/compose.ts\`).`;

function installed(
  relativePath: string,
  severity: "error" | "advisory",
): { pass: boolean; label: string; fix: string; severity: "error" | "advisory" } {
  // Check both the direct path and the aidlc-common/ prefix — different harnesses
  // install stages in different locations (e.g. Kiro IDE uses aidlc-common/stages/).
  const directExists = existsSync(join(harnessRoot, relativePath));
  const commonExists = relativePath.startsWith("stages/")
    ? existsSync(join(harnessRoot, "aidlc-common", relativePath))
    : false;
  return {
    pass: directExists || commonExists,
    label: `${relativePath} installed`,
    fix,
    severity,
  };
}

function buildChecks() {
  return [
  // Sensor scripts (error — sensors cannot run without these)
  installed("tools/aidlc-sensor-acxd-flow-coverage.ts", "error"),
  installed("tools/aidlc-sensor-acxd-deploy-status.ts", "error"),
  installed("tools/aidlc-sensor-acxd-stage-exit.ts", "error"),

  // Sensor manifests (error — without manifests the sensors are never wired)
  installed("sensors/aidlc-acxd-flow-coverage.md", "error"),
  installed("sensors/aidlc-acxd-deploy-status.md", "error"),
  installed("sensors/aidlc-acxd-stage-exit.md", "error"),

  // Scopes (error — without scopes the plugin has no entry points)
  installed("scopes/acxd-platform.md", "error"),
  installed("scopes/acxd-usecase.md", "error"),
  installed("scopes/acxd-enhancement.md", "advisory"),
  installed("scopes/acxd-poc.md", "advisory"),

  // Agent persona (error — 8 stages delegate to this agent)
  installed("agents/acxd-platform-agent.md", "error"),
  // SIT method file (error — Flow Design Step 9e and Flow Authoring Step 7b follow it)
  installed("knowledge/acxd-platform-agent/acxd-sit-method.md", "error"),
  installed("knowledge/acxd-platform-agent/acxd-dev-mode.md", "advisory"),

  // Stages — Ideation (error)
  installed("stages/ideation/acxd-cx-discovery.md", "error"),

  // Stages — Inception (error)
  installed("stages/inception/acxd-platform-config.md", "error"),
  installed("stages/inception/acxd-flow-design.md", "error"),
  installed("stages/inception/acxd-component-design.md", "error"),
  installed("stages/inception/acxd-backend-design.md", "advisory"),

  // Stages — Construction (error)
  installed("stages/construction/acxd-resource-creation.md", "error"),
  installed("stages/construction/acxd-flow-build.md", "error"),
  installed("stages/construction/acxd-backend-build.md", "advisory"),

  // Stages — Operation (error)
  installed("stages/operation/acxd-build-deploy.md", "error"),
  installed("stages/operation/acxd-operational-readiness.md", "advisory"),

  // Knowledge — shared overview (error — all agents need this)
  installed("knowledge/aidlc-shared/acxd-overview.md", "error"),

  // Knowledge — acxd-platform-agent (error — this agent leads 8 stages)
  installed("knowledge/acxd-platform-agent/acxd-node-reference.md", "error"),
  installed("knowledge/acxd-platform-agent/acxd-flow-design.md", "error"),
  installed("knowledge/acxd-platform-agent/acxd-variables-and-state.md", "error"),
  installed("knowledge/acxd-platform-agent/acxd-agentic-and-prompting.md", "error"),
  installed("knowledge/acxd-platform-agent/acxd-conversation-design.md", "error"),
  installed("knowledge/acxd-platform-agent/acxd-architecture-principles.md", "error"),
  installed("knowledge/acxd-platform-agent/acxd-sdk-idl.ts", "error"),

  // Knowledge — supporting agents (advisory)
  installed("knowledge/aidlc-developer-agent/acxd-integrations.md", "advisory"),
  installed("knowledge/aidlc-quality-agent/acxd-testing-and-deployment.md", "advisory"),
  installed("knowledge/aidlc-compliance-agent/acxd-compliance-guide.md", "advisory"),
  ];
}

// Guard: emit the contract JSON even if a check throws, so the plugin doctor
// never fails with an opaque non-zero exit + "required JSON shape" error. A thrown error
// becomes a single failing advisory check with the message, keeping stdout parseable.
try {
  const checks = buildChecks();
  process.stdout.write(JSON.stringify({ checks }) + "\n");
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const payload = { checks: [{ pass: false, label: "acxd-doctor self-check errored: " + message, severity: "advisory", fix }] };
  process.stdout.write(JSON.stringify(payload) + "\n");
}

