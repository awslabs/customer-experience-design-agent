// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Small text helpers shared by step modules.
// LAYER: SUPPORT — shared text helpers (truncation, resource-name validation).

/** Truncate a description to a max (default 200, the common ACXD cap). Per-field maxima are NOT uniform —
 * see lib/length-limits.ts (DESCRIPTION_LIMITS); pass the right max for the field (e.g. analytics-tag = 64). */
export function truncateDescription(desc: string, max = 200): string {
  if (!desc) return desc;
  return desc.length <= max ? desc : `${desc.slice(0, max - 1)}…`;
}

/**
 * Truncate to a hard limit using ONLY printable ASCII (no non-ASCII ellipsis). Used for fields the SDK
 * validates as printable ASCII with a short cap — notably the analytics-tag `description` (max 64 chars).
 * Trailing whitespace is trimmed; if truncation occurs, an ASCII "..." marker is included within the cap.
 */
export function truncateAscii(text: string, max: number): string {
  if (!text) return text;
  // Drop any non-printable-ASCII chars first (keep 0x20–0x7E), then cap length.
  const ascii = text.replace(/[^\x20-\x7E]/g, '').trim();
  if (ascii.length <= max) return ascii;
  return `${ascii.slice(0, max - 3).trimEnd()}...`;
}


/**
 * Validate a user-supplied Workspace / Application NAME (from ACXD_WORKSPACE_NAME / ACXD_APPLICATION_NAME in
 * .env, or the deploy-config default) BEFORE the create API call, so a bad name fails loudly with an
 * actionable message instead of an opaque server rejection.
 *
 * VERIFIED against the GA SDK model: an Application name is `^[A-Za-z0-9 _-]+$`, length 1–100 — letters,
 * digits, spaces, hyphen and underscore only (NOT camelCase-restricted; spaces/`_`/`-` are allowed). The
 * Workspace name has no documented pattern in the model, so we apply the same friendly rule for consistency
 * Per-kind rules from the verified Smithy model:
 *   workspace   name: pattern ^[A-Za-z0-9 ,.'-]+$, length 1–36
 *   application name: pattern ^[A-Za-z0-9 _-]+$,   length 1–100
 * The 36-char workspace cap matters for the `<projectName>Workspace` default: a projectName longer than
 * 27 chars overflows it — this guard turns that into an actionable pre-flight error, not an opaque
 * server-side CreateWorkspace rejection.
 * Throws on violation; returns the trimmed name on success.
 */
const WORKSPACE_NAME_RE = /^[A-Za-z0-9 ,.'-]+$/;
const APPLICATION_NAME_RE = /^[A-Za-z0-9 _-]+$/;
export function assertValidResourceName(kind: 'workspace' | 'application', name: string): string {
  const n = (name ?? '').trim();
  const envKey = kind === 'workspace' ? 'ACXD_WORKSPACE_NAME' : 'ACXD_APPLICATION_NAME';
  const max = kind === 'workspace' ? 36 : 100;
  const re = kind === 'workspace' ? WORKSPACE_NAME_RE : APPLICATION_NAME_RE;
  const charsetHelp = kind === 'workspace'
    ? "letters, digits, spaces, comma (,) dot (.) apostrophe (') and hyphen (-) (pattern ^[A-Za-z0-9 ,.'-]+$)"
    : 'letters, digits, spaces, underscore (_) and hyphen (-) (pattern ^[A-Za-z0-9 _-]+$)';
  if (n.length === 0) {
    throw new Error(`${kind} name is empty — set ${envKey} in .env (${charsetHelp}; 1–${max} chars).`);
  }
  if (n.length > max) {
    const hint = kind === 'workspace'
      ? ` The default is "<projectName>Workspace"; a projectName over 27 chars overflows the ${max}-char workspace cap. ` +
        `Either shorten the projectName or set a shorter ${envKey} in .env.`
      : ` Shorten ${envKey} in .env.`;
    throw new Error(`${kind} name "${n}" is ${n.length} chars — the limit is ${max}.${hint}`);
  }
  if (!re.test(n)) {
    throw new Error(
      `${kind} name "${n}" has characters ACXD does not allow. Use ${charsetHelp}. ` +
      `Fix ${envKey} in .env — e.g. "AnyCare Insurance Quote".`,
    );
  }
  return n;
}


/**
 * Validate an AUTHORED ACXD IDENTIFIER — a context variable name, slot type id, or analytics tag label — BEFORE
 * the create API call. ACXD requires these to be letters-only camelCase (NO digits, hyphens, underscores, or
 * other characters); a digit is rejected at the server with the opaque "key is not in the expected format" (a
 * context-var name with a trailing digit, e.g. accountNumberLast4, is the classic trip). Failing loudly here
 * turns that opaque server error into an actionable authoring message. `[VERIFIED]`
 *
 * This is DISTINCT from assertValidResourceName: that governs the Workspace/Application DISPLAY name (a looser
 * rule that allows digits/spaces/-/_); this governs authored identifiers referenced inside flows, which are the
 * strict letters-only class. Throws on violation; returns the name on success.
 */
const LEGAL_ACXD_NAME = /^[A-Za-z]+$/;
export function assertLegalAcxdName(
  kind: 'context variable' | 'slot type' | 'analytics tag',
  name: string,
): string {
  if (!LEGAL_ACXD_NAME.test(name ?? '')) {
    throw new Error(
      `illegal ${kind} name "${name}" — ACXD ${kind} names must be letters-only camelCase (NO digits, hyphens, ` +
      `or underscores; ACXD rejects them as "not in the expected format"). Rename however reads best — drop the ` +
      `number (accountNumberLast4 → accountLastDigits) or spell it out (→ accountNumberLastFour). Fix it in ` +
      `resources/*.json and any flow reference to it.`,
    );
  }
  return name;
}
