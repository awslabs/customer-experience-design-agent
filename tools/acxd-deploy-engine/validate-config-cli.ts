// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Standalone authoring-time check for acxd-deploy.config.json. Runs the SAME validateConfig the deploy engine
// runs (imported from lib/validate-config.ts), so a pass here is byte-identical to the deploy-time gate — the
// agent does not hand-roll a structural check or depend on jsonschema being installed.
//
// Usage:  npx --yes tsx validate-config-cli.ts [path/to/acxd-deploy.config.json] [--env-example <path>]
//         (defaults to ./acxd-deploy.config.json, or $ACXD_DEPLOY_CONFIG if set)
//         --env-example: also check every secret's envVar (resources.secrets) is listed in that .env.example.
//
// Exit 0 + "config valid" when the shape is correct; exit 1 + the offender list when it is not. No AWS calls,
// no side effects, no dependency beyond tsx (already used to run the engine).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { validateConfig, DeployConfig } from './lib/validate-config';
import { checkSecretsSignposted } from './lib/check-env-signposting';
import { validateFieldLengths } from './steps/validate-field-lengths';

function main(): void {
  const argv = process.argv.slice(2);
  const ei = argv.indexOf('--env-example');
  const envExample = ei >= 0 ? argv[ei + 1] : undefined;
  if (ei >= 0 && !envExample) { console.error('✗ --env-example needs a path'); process.exit(1); return; }
  const positional = argv.filter((_, i) => ei < 0 || (i !== ei && i !== ei + 1));
  const arg = positional[0] ?? process.env.ACXD_DEPLOY_CONFIG ?? 'acxd-deploy.config.json';
  const configPath = resolve(arg);

  let cfg: DeployConfig;
  try {
    cfg = JSON.parse(readFileSync(configPath, 'utf8')) as DeployConfig;
  } catch (err) {
    console.error(`✗ could not read/parse ${configPath}: ${(err as Error)?.message ?? err}`);
    process.exit(1);
    return;
  }

  try {
    validateConfig(cfg, configPath);
  } catch (err) {
    // validateConfig throws with the full, actionable offender list already formatted.
    console.error(`✗ ${(err as Error)?.message ?? err}`);
    process.exit(1);
    return;
  }

  console.log(`✓ config valid: ${configPath} (shape matches the deploy engine contract)`);

  // Same description-length pre-flight the engine runs (steps/validate-field-lengths.ts), so an over-limit
  // description is caught at authoring time, not at deploy. Resource paths resolve relative to the config file.
  const load = (rel?: string): unknown =>
    rel ? JSON.parse(readFileSync(resolve(dirname(configPath), rel), 'utf8')) : [];
  try {
    validateFieldLengths({
      slotTypes: load(cfg.resources.slotTypes),
      knowledgeBases: load(cfg.resources.knowledgeBases),
      dataRequests: load(cfg.resources.dataRequests),
      guardrails: load(cfg.resources.guardrails),
    });
  } catch (err) {
    console.error(`✗ ${(err as Error)?.message ?? err}`);
    process.exit(1);
    return;
  }
  console.log('✓ descriptions within ACXD length limits');

  if (envExample) {
    const secretsPath = resolve(dirname(configPath), cfg.resources.secrets);
    const envPath = resolve(envExample);
    try {
      const n = checkSecretsSignposted(secretsPath, envPath);
      console.log(`✓ secrets signposted: all ${n} secret env vars are listed in ${envPath}`);
    } catch (err) {
      console.error(`✗ ${(err as Error)?.message ?? err}`);
      process.exit(1);
    }
  }
}

main();
