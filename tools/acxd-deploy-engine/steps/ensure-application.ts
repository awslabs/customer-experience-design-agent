// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Ensure an application exists — presence = intent.
// LAYER: EMITTER (ensure — presence=intent: reuse id from .env, else create + write back).
// If ACXD_APPLICATION_ID is set → reuse it (do NOT create). If blank → create it (synchronous;
// CreateApplicationCommand returns applicationId directly — no GetApplication in the SDK), write the id
// back to .env, and let main apply the settle delay. ApplicationSettings are built from the ACXD_APP_*
// .env vars (only consumed when creating). Standalone unit: returns the application id.
import { CreateApplicationCommand } from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';
import { envVar, writeEnvVar } from '../lib/env-file';
import { assertValidResourceName } from '../lib/text';

export interface ApplicationConfig {
  name: string;
  description?: string;
  // Map of default-behaviour role → target flowId (string). The API REQUIRES at least `welcome` once an
  // application has attached flows (`This application has flows but no default welcome flow`) `[VERIFIED
  // required]`. Keys: welcome/fallback/unknown/escalation (+ frustration/help/repeat/resume). The engine
  // wraps each string as the SDK's { flowId } shape. Authored in the deploy config (not .env).
  defaultFlows?: Record<string, string>;
  // Guardrail NAMES to attach to this application (resolved to ids and emitted as
  // settings.guardrails:[{ guardrailId }]). Authored in the deploy config application block.
  guardrails?: string[];
}

export interface FlowRef {
  flowId: string;
}

export interface EnsureApplicationResult {
  applicationId: string;
  created: boolean;
}

/**
 * Build the ApplicationSettings object from ACXD_APP_* env vars.
 * SDK-VERIFIED (amazon-connect-acxd-sdk@0.1.0, installed .d.ts): the real ApplicationSettings fields are
 * `languageCode` (enum, e.g. "en-US"), `languageCodes` (array), `defaultFlows`, `conversationTTL`, etc.
 * There is NO `defaultLanguage`, `channels`, or `sessionTimeoutSeconds` field — the earlier mapping used
 * those non-existent names, so the app was created with no valid language (unroutable / ValidationException).
 * We set `languageCode` (required for a routable app) and `conversationTTL` (from the session-timeout knob).
 * `conversationTTL` is in MINUTES, max 1440 (24h) `[VERIFIED — "settings.conversationTTL must be at
 * most 1440"]`. The knob is authored in SECONDS (ACXD_APP_SESSION_TIMEOUT_SECONDS) so .env stays intuitive;
 * we convert seconds→minutes here (round to nearest minute, min 1) and clamp to the 1440 cap.
 * The four default-behaviour flows (welcome/fallback/unknown/incomprehension) remain a documented manual
 * console step for now — set them via `settings.defaultFlows` in a later change if that step is automated.
 * NOTE: `welcome` is now set from `application.defaultFlows` in the deploy config (see buildAppSettings) —
 * the API rejects an application that has flows but no default welcome flow.
 */
export function buildAppSettings(cfg?: ApplicationConfig, guardrailIds?: Map<string, string>): Record<string, unknown> {
  const languageCode = envVar('ACXD_APP_DEFAULT_LANGUAGE') ?? 'en-US';
  const settings: Record<string, unknown> = { languageCode };
  // Attach guardrails by id (resolved from the names in cfg.guardrails). A guardrail is a global
  // resource referenced here on the application — settings.guardrails:[{ guardrailId }] (VERIFIED: Smithy
  // ApplicationSettings.guardrails + autocare application.js). Unknown names are skipped with the caller warning.
  if (cfg?.guardrails && cfg.guardrails.length && guardrailIds) {
    const refs: Array<{ guardrailId: string }> = [];
    for (const name of cfg.guardrails) {
      const id = guardrailIds.get(name);
      if (id) refs.push({ guardrailId: id });
    }
    if (refs.length) settings.guardrails = refs;
  }
  // Optional: carry the session-timeout knob to the real field. conversationTTL is in MINUTES (max 1440);
  // the knob is in seconds, so convert seconds→minutes (round, min 1) and clamp to the 24h cap.
  const ttlRaw = envVar('ACXD_APP_SESSION_TIMEOUT_SECONDS');
  if (ttlRaw && !Number.isNaN(Number(ttlRaw))) {
    const minutes = Math.max(1, Math.round(Number(ttlRaw) / 60));
    settings.conversationTTL = Math.min(minutes, 1440);
  }
  // Default-behaviour flows: wrap each configured role → { flowId }. `welcome` is REQUIRED once the app has
  // attached flows (VERIFIED). Only emit keys the config provides; the SDK accepts a partial map.
  // Use the PLAIN member names (welcome/fallback/unknown/escalation/…): the SDK serializes them to the wire
  // keys ACXD.Welcome/ACXD.Fallback/… automatically (they carry @jsonName in the model). Because we go
  // through CreateApplicationCommand, we author member names and the SDK maps them — do NOT hand-write the
  // ACXD.* keys here. (They would only be needed if the defaultFlows JSON were passed raw, bypassing the SDK.)
  const df = cfg?.defaultFlows;
  if (df && Object.keys(df).length) {
    const defaultFlows: Record<string, { flowId: string }> = {};
    for (const [role, flowId] of Object.entries(df)) {
      if (flowId) defaultFlows[role] = { flowId };
    }
    if (Object.keys(defaultFlows).length) settings.defaultFlows = defaultFlows;
  }
  return settings;
}

export async function ensureApplication(
  client: EngineClient,
  cfg: ApplicationConfig,
  flows: FlowRef[],
  log: Logger,
  guardrailIds?: Map<string, string>,
): Promise<EnsureApplicationResult> {
  const existing = envVar('ACXD_APPLICATION_ID');
  if (existing) {
    log.stage(`application: using existing ${existing} (ACXD_APPLICATION_ID set — not creating)`);
    return { applicationId: existing, created: false };
  }

  // Warn on any configured guardrail name we could not resolve to an id (so it is silently dropped, not failed).
  if (cfg.guardrails && cfg.guardrails.length) {
    const unresolved = cfg.guardrails.filter((n) => !(guardrailIds && guardrailIds.has(n)));
    if (unresolved.length) log.warn(`application guardrails not found (skipped): ${unresolved.join(', ')}`);
  }
  const settings = buildAppSettings(cfg, guardrailIds);
  // Create-time NAME resolution (ID vs NAME): ACXD_APPLICATION_NAME in .env overrides the config default
  // (cfg.name, agent-derived from the use case) so the user can rename the new application before deploy.
  const name = assertValidResourceName('application', envVar('ACXD_APPLICATION_NAME') ?? cfg.name);
  log.stage(`application: creating "${name}" (settings from .env: ${JSON.stringify(settings)})`);
  const out = await client.send<{ applicationId?: string }>(
    new CreateApplicationCommand({
      name,
      settings: settings as never,
      ...(cfg.description ? { description: cfg.description } : {}),
      ...(flows.length ? { flows: flows as never } : {}),
    }),
  );
  const applicationId = out?.applicationId;
  if (!applicationId) throw new Error('CreateApplication did not return an applicationId');

  writeEnvVar('ACXD_APPLICATION_ID', applicationId);
  log.object(`✓ application ${applicationId} (written to .env)`);
  return { applicationId, created: true };
}
