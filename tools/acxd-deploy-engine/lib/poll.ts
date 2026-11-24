// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Bounded polling — used ONLY for the two async operations (build, deploy).
// LAYER: SUPPORT — bounded polling (build/deploy only; unused while those are manual).
// Synchronous create calls do NOT poll (they return their id directly + a 2s settle in main).
// pollUntil calls statusFn() on an interval with backoff, matching the returned status string
// (case-insensitively) against success[] / failed[] sets. Unknown → keep polling until timeoutMs,
// then throw (cost/runaway control — the reason this bound exists).
import type { Logger } from './log';

export interface PollConfig {
  intervalMs: number;
  backoff: number;
  maxIntervalMs: number;
  timeoutMs: number;
  success?: string[];
  failed?: string[];
}

const DEFAULT_SUCCESS = ['completed', 'succeeded', 'active', 'deployed', 'success'];
const DEFAULT_FAILED = ['failed', 'error', 'cancelled', 'canceled'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PollResult {
  status: string;
  elapsedMs: number;
}

/**
 * Poll statusFn() until a terminal status is seen or timeoutMs elapses.
 * @param statusFn returns the current status string (e.g. GetApplicationBuild.status)
 * @param cfg      poll knobs from acxd-deploy.config.json (build/deploy only)
 * @param label    for logging ("build" / "deploy")
 * @param log      level-aware logger; raw status is logged at debug (feeds terminal-string pinning)
 */
export async function pollUntil(
  statusFn: () => Promise<string>,
  cfg: PollConfig,
  label: string,
  log: Logger,
): Promise<PollResult> {
  const success = (cfg.success ?? DEFAULT_SUCCESS).map((s) => s.toLowerCase());
  const failed = (cfg.failed ?? DEFAULT_FAILED).map((s) => s.toLowerCase());
  const start = Date.now();
  let interval = cfg.intervalMs;

  for (;;) {
    const elapsed = Date.now() - start;
    if (elapsed > cfg.timeoutMs) {
      throw new Error(`${label}: timed out after ${Math.round(elapsed / 1000)}s (limit ${Math.round(cfg.timeoutMs / 1000)}s) — aborting to avoid runaway polling`);
    }
    let status = '';
    try {
      status = String(await statusFn());
    } catch (err) {
      log.warn(`${label}: status check errored (will retry): ${(err as Error).message}`);
    }
    const norm = status.trim().toLowerCase();
    log.debug(`${label}: status="${status}" (elapsed ${Math.round(elapsed / 1000)}s)`);

    if (success.includes(norm)) {
      log.stage(`${label}: ${status} (${Math.round(elapsed / 1000)}s)`);
      return { status, elapsedMs: elapsed };
    }
    if (failed.includes(norm)) {
      throw new Error(`${label}: terminal failure status "${status}" after ${Math.round(elapsed / 1000)}s`);
    }
    await sleep(interval);
    interval = Math.min(Math.round(interval * cfg.backoff), cfg.maxIntervalMs);
  }
}
