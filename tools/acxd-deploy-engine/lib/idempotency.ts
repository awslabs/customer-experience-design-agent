// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Idempotent create wrapper — brownfield/re-run safety.
// LAYER: SUPPORT — idempotent create wrapper (brownfield/re-run safety).
// ACXD signals "already exists" inconsistently: sometimes a ConflictException (409), sometimes a
// 500 on duplicate for certain resource types (slot types, data requests).
// createIdempotent treats those as "exists" (logs skip) and rethrows anything else.
import type { Logger } from './log';

export interface IdemOptions {
  // [SDK gotcha] slot types, data requests and knowledge bases return HTTP 500 (not 409) on a duplicate create
  // AND expose no List/Get to pre-check — so for those types a 500 on create is treated as "already exists".
  treat500AsExists?: boolean;
}

function looksLikeExists(err: unknown, treat500AsExists: boolean): boolean {
  const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const name = (e?.name ?? '').toLowerCase();
  const msg = (e?.message ?? '').toLowerCase();
  const code = e?.$metadata?.httpStatusCode;
  if (name.includes('conflict') || code === 409) return true;
  if (msg.includes('already exists') || msg.includes('duplicate')) return true;
  if (treat500AsExists && code === 500) return true;
  return false;
}

/**
 * Run a create fn idempotently. Returns true if created, false if it already existed.
 */
export async function createIdempotent(
  label: string,
  fn: () => Promise<unknown>,
  log: Logger,
  opts: IdemOptions = {},
): Promise<boolean> {
  try {
    await fn();
    log.object(`✓ ${label}`);
    return true;
  } catch (err) {
    if (looksLikeExists(err, !!opts.treat500AsExists)) {
      log.object(`• ${label} (exists — skipped)`);
      return false;
    }
    log.error(`failed: ${label} — ${(err as Error).message}`);
    throw err;
  }
}
