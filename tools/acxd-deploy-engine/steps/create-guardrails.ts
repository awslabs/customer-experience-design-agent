// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Create guardrails, then return a name->id map so the application step can attach them via
// settings.guardrails:[{ guardrailId }]. // LAYER: EMITTER — builds & sends CreateGuardrail inputs; captures the id from the create response.
//
// A guardrail is a GLOBAL ACXD resource (NOT a flow node — it has no exits and never appears in the node
// graph). It is created like any resource, then REFERENCED on the application in settings.guardrails, exactly
// as knowledge bases are created then referenced. VERIFIED against the Smithy model (model/guardrails.smithy)
// and the GA autocare-voice-assistant example (guardrail.js + application.js): CreateGuardrailCommand returns
// the full Guardrail incl. guardrailId synchronously; the application attaches it by { guardrailId }.
//
// Mirrors create-knowledge-bases.ts: capture the id from the create RESPONSE (no List round-trip); on a re-run
// where the guardrail already exists (create skipped, no response id), recover its id via one ListGuardrails.
import { CreateGuardrailCommand, ListGuardrailsCommand } from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';
import { createIdempotent } from '../lib/idempotency';

// ── Authoring shape (resources/guardrails.json) — the VERIFIED CreateGuardrail input ─────────────────────────
// trigger: "input" (applied to the caller's message) | "output" (applied to the agent/model's message).
// Each rule: a detection (how a match is found) + an enforcement (what happens on a match).
export interface GuardrailDetection {
  method: 'regex' | 'keyword' | 'llmJudge';
  pattern?: string;            // regex only — a CUSTOMER-SUPPLIED pattern (never a shipped/guessed one)
  keywords?: string[];         // keyword only
  prompt?: string;             // llmJudge only — the yes/no judgement prompt
  threshold?: number;          // llmJudge only (0-1)
}
export interface GuardrailEnforcementBehavior {
  message?: string;            // modify/flag: the message shown
  prompt?: string;             // modify: rewrite prompt (mutually exclusive with message)
  flowId?: string;             // route/modify: target flow
  maskChar?: string;           // mask: single char (e.g. "*")
  maskText?: string;           // mask: replacement text
}
export interface GuardrailEnforcement {
  action: 'mask' | 'modify' | 'route' | 'flag';
  tags?: string[];
  behavior?: GuardrailEnforcementBehavior;
}
export interface GuardrailRuleDef {
  name: string;
  detection: GuardrailDetection;
  enforcement: GuardrailEnforcement;
  description?: string;
  active?: boolean;            // default true
}
export interface GuardrailDef {
  name: string;
  trigger: 'input' | 'output';
  rules: GuardrailRuleDef[];
  description?: string;
  active?: boolean;            // default true
  fallbackBehavior?: { type: 'continue' | 'routeToFlow'; flowId?: string };
}

export interface CreateGuardrailsResult {
  created: number;
  nameToId: Map<string, string>;   // guardrail name -> server UUID (captured at create; List-recovered on re-run)
}

async function recoverMissingIds(
  client: EngineClient,
  missing: Set<string>,
  nameToId: Map<string, string>,
  log: Logger,
): Promise<void> {
  if (missing.size === 0) return;
  let nextToken: string | undefined;
  do {
    const out = await client.send<{ items?: Array<{ guardrailId?: string; name?: string }>; nextToken?: string }>(
      new ListGuardrailsCommand(nextToken ? { nextToken } : {}),
    );
    for (const g of out?.items ?? []) {
      if (g.name && g.guardrailId && missing.has(g.name)) {
        nameToId.set(g.name, g.guardrailId);
        missing.delete(g.name);
      }
    }
    nextToken = out?.nextToken;
  } while (nextToken && missing.size > 0);
  if (missing.size) log.warn(`could not resolve guardrail id(s) for: ${[...missing].join(', ')}`);
}

// Pre-flight length guard for guardrail descriptions. Limits come from the canonical table
// (lib/length-limits.ts) — guardrail description + rule description, capped at 100 characters
// ("description must be at most 100 characters"). [CONSOLE-VERIFIED] Fails loud listing EVERY offender before any AWS call, so a run is not a one-at-a-time
// discovery of over-length strings after resources have already been created.
import { DESCRIPTION_LIMITS } from '../lib/length-limits';

export function validateGuardrailDescriptions(defs: GuardrailDef[]): void {
  const gMax = DESCRIPTION_LIMITS.guardrail.max;
  const rMax = DESCRIPTION_LIMITS.guardrailRule.max;
  const over: string[] = [];
  for (const g of defs) {
    if (g.description && g.description.length > gMax) {
      over.push(`guardrail "${g.name}" description is ${g.description.length} chars (max ${gMax})`);
    }
    for (const r of g.rules ?? []) {
      if (r.description && r.description.length > rMax) {
        over.push(`guardrail "${g.name}" rule "${r.name}" description is ${r.description.length} chars (max ${rMax})`);
      }
    }
  }
  if (over.length) {
    throw new Error(
      `guardrail description(s) too long — shorten to one tight sentence:\n  - ${over.join('\n  - ')}`,
    );
  }
}

export async function createGuardrails(
  client: EngineClient,
  defs: GuardrailDef[],
  log: Logger,
): Promise<CreateGuardrailsResult> {
  validateGuardrailDescriptions(defs);   // fail loud BEFORE any AWS call
  log.stage(`guardrails: creating ${defs.length}`);
  let created = 0;
  const nameToId = new Map<string, string>();
  const missing = new Set<string>();
  for (const g of defs) {
    const didCreate = await createIdempotent(`guardrail ${g.name}`, async () => {
      const out = await client.send<{ guardrailId?: string }>(new CreateGuardrailCommand({
        name: g.name,
        trigger: g.trigger as never,
        active: g.active ?? true,
        ...(g.description ? { description: g.description } : {}),
        ...(g.fallbackBehavior ? { fallbackBehavior: g.fallbackBehavior as never } : {}),
        rules: g.rules.map((r) => ({
          name: r.name,
          detection: r.detection as never,
          enforcement: r.enforcement as never,
          active: r.active ?? true,
          ...(r.description ? { description: r.description } : {}),
        })) as never,
      }));
      const gId = out?.guardrailId;
      if (gId) {
        nameToId.set(g.name, gId);
        log.debug(`created guardrail ${g.name} (${gId})`);
      }
    }, log, { treat500AsExists: true });
    if (didCreate) created++;
    else missing.add(g.name);
  }
  await recoverMissingIds(client, missing, nameToId, log);
  return { created, nameToId };
}
