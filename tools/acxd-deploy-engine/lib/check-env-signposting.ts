// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Authoring/packaging-time check: every secret declared in resources/secrets.json names an env var (`envVar`)
// that the deploy engine reads from .env at deploy. If that var is not listed in the shipped .env.example, the
// operator is never told to set it, and the deploy fails one missing var at a time. This check lists ALL such
// unsignposted vars at once, before deploy.
//
// LAYER: SUPPORT — pure, no AWS calls, no side effects, no self-invocation (safe to import from a CLI).
import { readFileSync } from 'node:fs';

interface SecretEntry { name?: string; envVar?: string }

// Keys defined (uncommented `KEY=`) in an .env-format file.
export function envFileKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

// Throws listing every secret whose envVar is missing from the .env.example; returns the checked count on success.
export function checkSecretsSignposted(secretsPath: string, envExamplePath: string): number {
  const raw = JSON.parse(readFileSync(secretsPath, 'utf8')) as unknown;
  const list: SecretEntry[] = Array.isArray(raw)
    ? (raw as SecretEntry[])
    : Array.isArray((raw as { secrets?: unknown })?.secrets) ? (raw as { secrets: SecretEntry[] }).secrets : [];
  const keys = envFileKeys(readFileSync(envExamplePath, 'utf8'));
  const problems: string[] = [];
  for (const s of list) {
    if (!s.envVar) { problems.push(`secret "${s.name ?? '?'}" has no "envVar"`); continue; }
    if (!keys.has(s.envVar)) problems.push(`secret "${s.name ?? '?'}" reads ${s.envVar}, which is not listed in ${envExamplePath}`);
  }
  if (problems.length > 0) {
    throw new Error(
      `Secrets not signposted in .env.example:\n  - ${problems.join('\n  - ')}\n`
      + 'API secrets and their .env keys come from the OpenAPI files: run openapi-wiring-cli.ts --apis <dir> '
      + '--resources <dir> --env-example <.env.example> rather than adding keys by hand.',
    );
  }
  return list.length;
}
