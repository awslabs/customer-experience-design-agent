// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Deploy-config shape type + fail-loud validator — the SINGLE SOURCE OF TRUTH for the acxd-deploy.config.json
// shape the engine requires. main.ts imports validateConfig from here and runs it immediately after config load
// (before any field is used); the standalone validate-config-cli.ts imports the SAME function so an authoring-
// time check is byte-identical to the deploy-time check. Do not re-implement this shape anywhere else.
//
// LAYER: SUPPORT — pure, no AWS calls, no side effects, no self-invocation (safe to import from a CLI).

export interface DeployConfig {
  project: string;
  workspace: { name: string; tags?: string[] };
  application: { name: string; description?: string; defaultFlows?: Record<string, string>; guardrails?: string[] };
  settleMs?: number;
  resources: Record<string, string>;
  flows: { dir: string; order: string[] };
}

export const REQUIRED_RESOURCE_KEYS = [
  'contextVariables', 'slotTypes', 'secrets', 'analyticsTags', 'dataRequests', 'knowledgeBases',
] as const;

// Validate the deploy config has the shape the engine requires, and FAIL LOUD naming the exact missing or
// mis-shaped field(s). Throws on any problem; returns cleanly when the config is valid.
export function validateConfig(cfg: DeployConfig, configPath: string): void {
  const problems: string[] = [];
  if (!cfg || typeof cfg !== 'object') problems.push('config is not a JSON object');
  if (!cfg.project || typeof cfg.project !== 'string')
    problems.push('missing required field "project" (a camelCase string, e.g. "northwindEnergyBilling")');
  if (!cfg.workspace || typeof cfg.workspace.name !== 'string')
    problems.push('missing required field "workspace.name"');
  if (!cfg.application || typeof cfg.application.name !== 'string')
    problems.push('missing required field "application.name"');
  if (!cfg.resources || typeof cfg.resources !== 'object' || Array.isArray(cfg.resources)) {
    problems.push('missing or mis-shaped "resources": it must be a MAP of resource type -> file path '
      + '(e.g. {"contextVariables":"resources/context-vars.json", ...}), NOT {"dir":"resources"}');
  } else {
    for (const k of REQUIRED_RESOURCE_KEYS) {
      if (typeof cfg.resources[k] !== 'string')
        problems.push(`missing "resources.${k}" (path to the ${k} JSON file, e.g. "resources/${k === 'contextVariables' ? 'context-vars' : k.replace(/([A-Z])/g, '-$1').toLowerCase()}.json")`);
    }
  }
  if (!cfg.flows || typeof cfg.flows.dir !== 'string' || !Array.isArray(cfg.flows.order))
    problems.push('missing or mis-shaped "flows": needs { "dir": "flows", "order": [<flowId>, ...] }');
  if (problems.length > 0) {
    throw new Error(
      `Invalid deploy config at ${configPath}:\n  - ${problems.join('\n  - ')}\n`
      + 'Author it by copying acxd-deploy.config.template.json and filling the placeholders '
      + '(see acxd-deploy.config.example.json for a filled example). Do NOT hand-write the shape.',
    );
  }
}
