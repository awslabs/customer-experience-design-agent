// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Create secrets programmatically via CreateSecretCommand. [SDK gotcha] the value field is `secretValue`,
// NOT `value` (authoring to `value` fails ACXD validation). VERIFIED.
// LAYER: EMITTER — builds & sends CreateSecret inputs (values from .env).
// CORRECTION (2026-09-10): secrets CAN be created programmatically — the stale "add by hand in the
// console" claim is wrong. The only requirement is that the VALUE be supplied to the process, which we
// read from .env (one URL and credential per API, e.g. BILLING_API_URL / BILLING_API_KEY). Reads resources/secrets.json, which
// maps each secret name → the env var holding its value. FAILS LOUDLY if a declared secret's env var is unset
// (every secret here is referenced by a data request, so a silently-skipped secret = a data request that fails
// at runtime — a classic silent-late failure. Better to stop the deploy with an actionable message).
import { CreateSecretCommand } from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';
import { createIdempotent } from '../lib/idempotency';
import { envVar } from '../lib/env-file';
import { truncateDescription } from '../lib/text';

export interface SecretDef {
  name: string;
  envVar: string;          // which .env var holds the value (e.g. "BILLING_API_URL")
  description: string;
  isSensitive?: boolean;
}

export async function createSecrets(
  client: EngineClient,
  defs: SecretDef[],
  log: Logger,
): Promise<number> {
  log.stage(`secrets: creating ${defs.length}`);
  let created = 0;
  for (const s of defs) {
    const raw = envVar(s.envVar);
    // A base URL (any *_URL key) is stored without trailing slashes: data requests append /<path>, and a CDK
    // output such as AuthApiUrl ends in '/'. Trimmed here so the value can be pasted as-is.
    const secretValue = raw && /_URL$/.test(s.envVar) ? raw.replace(/\/+$/, '') : raw;
    if (!secretValue) {
      throw new Error(
        `secret "${s.name}" has no value: its env var ${s.envVar} is not set in .env. Every declared secret is ` +
        `referenced by a data request, so a missing value would deploy a broken application. Set ${s.envVar} in ` +
        `.env (API keys and URLs: run openapi-wiring-cli.ts --env-example to list them, and enter the values).`,
      );
    }
    const didCreate = await createIdempotent(`secret ${s.name}`, () =>
      client.send(new CreateSecretCommand({
        name: s.name,
        secretValue,
        description: truncateDescription(s.description),
        isSensitive: s.isSensitive ?? true,
      })), log, { treat500AsExists: true });
    if (didCreate) created++;
  }
  return created;
}
