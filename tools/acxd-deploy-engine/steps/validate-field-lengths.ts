// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Consolidated field-length pre-flight. Validates the character length of authored DESCRIPTION fields across
// every resource type against the canonical table (lib/length-limits.ts), BEFORE any AWS call, and throws
// listing every offender at once. This is the backstop; the IDL authoring table (mirroring the same limits)
// steers the agent to author within range in the first place.
//
// LAYER: VALIDATOR — pure, no AWS calls, no side effects. Called from main.ts pre-flight (block 0b).
//
// Scope note: this guards the fields most often authored long and most costly to discover late — the
// description fields (which do NOT share one limit: analytics-tag=64, guardrail=200-live, aiDescription=1000,
// the rest 200). Guardrail descriptions are also guarded in create-guardrails.ts (same table); running both is
// harmless (idempotent check) and keeps the guardrail step self-contained. Name/identifier limits are already
// covered by assertLegalAcxdName + assertValidResourceName; the TEXT_LIMITS set (prompts, messages, secret
// values) is available in the table for future guards but not swept here (those rarely overflow in practice).
import { DESCRIPTION_LIMITS } from '../lib/length-limits';

type Named = { description?: string };

// Check a list of authored defs that each carry an optional `description`, against one limit entry.
function checkDescriptions(
  kind: string,
  defs: unknown,
  limitKey: keyof typeof DESCRIPTION_LIMITS,
  nameOf: (d: Record<string, unknown>) => string,
  over: string[],
): void {
  if (!Array.isArray(defs)) return;
  const max = DESCRIPTION_LIMITS[limitKey].max;
  for (const raw of defs as Named[]) {
    const d = raw as Record<string, unknown>;
    const desc = typeof d.description === 'string' ? d.description : undefined;
    if (desc && desc.length > max) {
      over.push(`${kind} "${nameOf(d)}" description is ${desc.length} chars (max ${max})`);
    }
  }
}

export interface FieldLengthInputs {
  slotTypes?: unknown;
  knowledgeBases?: unknown;
  dataRequests?: unknown;
  // guardrails are validated in create-guardrails.ts (nested rules); included here too for a single early sweep.
  guardrails?: unknown;
}

// Throws if any authored description exceeds its canonical limit. Lists every offender.
export function validateFieldLengths(inputs: FieldLengthInputs): void {
  const over: string[] = [];
  const name = (d: Record<string, unknown>) => String(d.name ?? d.slotTypeId ?? d.dataRequestId ?? d.knowledgeBaseId ?? d.id ?? '?');

  checkDescriptions('slot type', inputs.slotTypes, 'slotType', name, over);
  checkDescriptions('knowledge base', inputs.knowledgeBases, 'knowledgeBase', name, over);
  checkDescriptions('data request', inputs.dataRequests, 'dataRequest', name, over);

  // guardrails: top-level + nested rule descriptions (guardrail live limit)
  if (Array.isArray(inputs.guardrails)) {
    const gMax = DESCRIPTION_LIMITS.guardrail.max;
    const rMax = DESCRIPTION_LIMITS.guardrailRule.max;
    for (const raw of inputs.guardrails as Array<Record<string, unknown>>) {
      const gName = String(raw.name ?? '?');
      const gDesc = typeof raw.description === 'string' ? raw.description : undefined;
      if (gDesc && gDesc.length > gMax) {
        over.push(`guardrail "${gName}" description is ${gDesc.length} chars (max ${gMax})`);
      }
      const rules = Array.isArray(raw.rules) ? (raw.rules as Array<Record<string, unknown>>) : [];
      for (const r of rules) {
        const rDesc = typeof r.description === 'string' ? r.description : undefined;
        if (rDesc && rDesc.length > rMax) {
          over.push(`guardrail "${gName}" rule "${String(r.name ?? '?')}" description is ${rDesc.length} chars (max ${rMax})`);
        }
      }
    }
  }

  if (over.length) {
    throw new Error(
      `authored description(s) exceed the ACXD field-length limit — shorten each to one tight sentence ` +
      `(limits in lib/length-limits.ts):\n  - ${over.join('\n  - ')}`,
    );
  }
}
