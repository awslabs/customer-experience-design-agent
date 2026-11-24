// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// .env reader + idempotent in-place writer.
// LAYER: SUPPORT — .env read + idempotent in-place write (honours ACXD_ENV_FILE).
// The engine persists newly-created ids (ACXD_WORKSPACE_ID / ACXD_APPLICATION_ID) back to .env
// so re-runs and CI/CD pick them up. writeEnvVar updates a key in place if present, appends if not,
// and preserves comments/blank lines/ordering of the rest of the file.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';

export function envPath(): string {
  return process.env.ACXD_ENV_FILE ?? '.env';
}

/** Update or append KEY=value in the .env file, preserving everything else. */
export function writeEnvVar(key: string, value: string, file = envPath()): void {
  if (!/^[A-Z0-9_]+$/.test(key)) throw new Error(`invalid .env key "${key}" (expected A-Z, 0-9, _)`);
  const line = `${key}=${value}`;
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  // Match an existing assignment (commented-out or live), first occurrence.
  const re = new RegExp(`^#?\\s*${key}=.*$`, 'm');
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    if (text.length && !text.endsWith('\n')) text += '\n';
    text += `${line}\n`;
  }
  // .env holds ACXD_API_TOKEN and other secrets: owner read/write only.
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** Read a single env var from the live process env (dotenv has already loaded .env in main). */
export function envVar(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

/** True when a var is present and non-empty — "presence = intent" (reuse vs create). */
export function isSet(key: string): boolean {
  return envVar(key) !== undefined;
}
