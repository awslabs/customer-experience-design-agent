// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Level-aware logger for the ACXD deploy engine.
// LAYER: SUPPORT — level-aware logger.
// ACXD_LOG_LEVEL controls verbosity:
//   stages  = one line per object TYPE and per phase (workspace/app/build/deploy)
//   objects = the above + one line per individual object created (✓ / skip)   [default]
//   debug   = the above + request params, full responses, ids, poll ticks, settle delays,
//             and the raw build/deploy status strings (feeds terminal-status pinning)
// Sensitive values (secret values, PII) are NEVER logged at any level.

export type LogLevel = 'stages' | 'objects' | 'debug';

const ORDER: Record<LogLevel, number> = { stages: 0, objects: 1, debug: 2 };

export interface Logger {
  level: LogLevel;
  stage(msg: string, ...rest: unknown[]): void;
  object(msg: string, ...rest: unknown[]): void;
  debug(msg: string, ...rest: unknown[]): void;
  warn(msg: string, ...rest: unknown[]): void;
  error(msg: string, ...rest: unknown[]): void;
  result(obj: Record<string, unknown>): void;
}

function coerceLevel(raw: string | undefined): LogLevel {
  const v = (raw ?? 'objects').trim().toLowerCase();
  return v === 'stages' || v === 'objects' || v === 'debug' ? v : 'objects';
}

/** Redact obvious secret-bearing keys before any debug dump. */
export function redact(obj: unknown): unknown {
  if (obj == null || typeof obj !== 'object') return obj;
  const SECRET_KEYS = /(secret|token|apikey|api_key|password|pin|authorization)/i;
  const clone: Record<string, unknown> = Array.isArray(obj) ? ([] as never) : {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    clone[k] = SECRET_KEYS.test(k) ? '***REDACTED***' : (typeof v === 'object' ? redact(v) : v);
  }
  return clone;
}

export function makeLogger(rawLevel: string | undefined): Logger {
  const level = coerceLevel(rawLevel);
  const at = (min: LogLevel) => ORDER[level] >= ORDER[min];
  const ts = () => new Date().toISOString();
  return {
    level,
    stage: (m, ...r) => { if (at('stages')) console.log(`[${ts()}] ▸ ${m}`, ...r); },
    object: (m, ...r) => { if (at('objects')) console.log(`[${ts()}]   ${m}`, ...r); },
    debug: (m, ...r) => { if (at('debug')) console.log(`[${ts()}] · ${m}`, ...r.map(redact)); },
    warn: (m, ...r) => console.warn(`[${ts()}] ⚠ ${m}`, ...r),
    error: (m, ...r) => console.error(`[${ts()}] ✗ ${m}`, ...r),
    // One machine-readable summary line per run, for pipeline/log consumption.
    result: (obj) => console.log(`RESULT ${JSON.stringify(obj)}`),
  };
}
