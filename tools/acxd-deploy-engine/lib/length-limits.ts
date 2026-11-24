// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Canonical ACXD field-length limits — the SINGLE SOURCE OF TRUTH for maximum character lengths on the
// resource/flow fields the deploy engine authors. The validator (validateFieldLengths, see
// steps/validate-field-lengths.ts) imports LENGTH_LIMITS directly, and the agent-facing authoring table in
// knowledge/acxd-platform-agent/acxd-sdk-idl.ts MIRRORS this table (annotated "mirrors lib/length-limits.ts").
// Keep the two in sync: this file is enforced; the IDL table steers authoring. When the SDK changes a limit,
// edit HERE first, then update the IDL mirror.
//
// LAYER: SUPPORT — shared constant table, no side effects.
//
// SOURCE: every value is the max from the ACXD Smithy model (model/*.smithy), one @length(max:N) per field,
// EXCEPT the guardrail descriptions, which carry a verified live/model divergence (see note on each).

// A limit entry: the max character length + the ground-truth source for that number.
export interface LengthLimit {
  max: number;
  source: string;   // provenance for the number (model shape name, or a console-verified override)
}

// ── Description fields (the headline set — NOT uniformly 200) ─────────────────────────────────────────────
// These are the fields most often authored long. They do NOT share one limit:
//   analytics-tag description = 64, guardrail (+rule) description = 100, everything else 200,
//   and flow aiDescription = 1000. A blanket "all descriptions <= 200" rule is WRONG in both directions.
export const DESCRIPTION_LIMITS = {
  analyticsTag:        { max: 64,   source: '[SDK] AnalyticsTagDescription @length(max:64), printable ASCII' },
  // Guardrail: the Smithy model stamps GuardrailDescription + GuardrailRule.description @length(max:100). The
  // live service's rejection threshold has proven INCONSISTENT across runs: an incremental redeploy once
  // rejected only at >200, but fresh and runs reject at >100 (the model limit). When a limit is
  // inconsistent, guard at the STRICTER value: 100 is accepted by the service in BOTH behaviours, so a <=100
  // description never fails on length, and pre-flight catches an overflow before any AWS call (fail early, not
  // mid-deploy). [CONSOLE-VERIFIED: live rejected rules[].description at >100.]
  guardrail:           { max: 100,  source: '[CONSOLE-VERIFIED] model=100; live rejects >100' },
  guardrailRule:       { max: 100,  source: '[CONSOLE-VERIFIED] model=100; live rejects >100' },
  dataRequest:         { max: 200,  source: '[SDK] DataRequest.description @length(max:200)' },
  knowledgeBase:       { max: 200,  source: '[SDK] KnowledgeBaseDescription @length(max:200)' },
  slotType:            { max: 200,  source: '[SDK] SlotTypeDescription @length(max:200)' },
  flow:                { max: 200,  source: '[SDK] FlowDescription @length(max:200)' },
  application:         { max: 200,  source: '[SDK] ApplicationDescription @length(max:200)' },
  role:                { max: 200,  source: '[SDK] RoleDescription @length(max:200)' },
  apiToken:            { max: 200,  source: '[SDK] ApiTokenDescription @length(max:200)' },
  liveSyncScript:      { max: 200,  source: '[SDK] LiveSyncScriptDescription @length(max:200)' },
  liveSyncScriptStep:  { max: 200,  source: '[SDK] LiveSyncScriptStep.description @length(max:200)' },
  // The ONE description-class field that is much LOOSER than 200 — do NOT clip it to 200.
  flowAiDescription:   { max: 1000, source: '[SDK] FlowAiDescription @length(max:1000)' },
} as const satisfies Record<string, LengthLimit>;

// ── Name / identifier fields ──────────────────────────────────────────────────────────────────────────────
export const NAME_LIMITS = {
  workspace:           { max: 36,   source: "[SDK] AnalyticsTagName/RoleName pattern 1-36, ^[A-Za-z0-9 ,.'-]+$" },
  application:         { max: 100,  source: '[SDK] ApplicationName @length(1-100)' },
  knowledgeBase:       { max: 100,  source: '[SDK] KnowledgeBaseName @length(1-100)' },
  guardrail:           { max: 100,  source: '[SDK] GuardrailName @length(1-100)' },
  guardrailRule:       { max: 100,  source: '[SDK] GuardrailRule.name @length(max:100)' },
  slotTypeId:          { max: 100,  source: '[SDK] SlotTypeId @length(3-100)' },
  dataRequestId:       { max: 100,  source: '[SDK] DataRequestId @length(3-100)' },
  flowId:              { max: 64,   source: '[SDK] FlowId @length(3-64)' },
  redirectTarget:      { max: 64,   source: '[SDK] RedirectTarget @length(3-64)' },
  attachedSlotName:    { max: 30,   source: '[SDK] AttachedSlot.name @length(3-30)' },
  analyticsTagName:    { max: 36,   source: '[SDK] AnalyticsTagName @length(1-36)' },
  programmaticUser:    { max: 128,  source: '[SDK] ProgrammaticUserName @length(1-128)' },
} as const satisfies Record<string, LengthLimit>;

// ── Other authored text fields ────────────────────────────────────────────────────────────────────────────
export const TEXT_LIMITS = {
  guardrailDetectionPrompt:   { max: 4000,  source: '[SDK] Detection.prompt @length(max:4000)' },
  guardrailDetectionPattern:  { max: 200,   source: '[SDK] Detection.pattern @length(max:200)' },
  guardrailEnforcementMessage:{ max: 500,   source: '[SDK] EnforcementBehavior.message @length(max:500)' },
  guardrailEnforcementPrompt: { max: 1000,  source: '[SDK] EnforcementBehavior.prompt @length(max:1000)' },
  guardrailKeyword:           { max: 50,    source: '[SDK] Keyword @length(1-50)' },
  guardrailMaskText:          { max: 50,    source: '[SDK] EnforcementBehavior.maskText @length(max:50)' },
  secretValue:                { max: 4096,  source: '[SDK] SecretValue @length(1-4096)' },
  resourceTag:                { max: 256,   source: '[SDK] *Tag @length(1-256) (flat array of <=5)' },
  kbArticlePayload:           { max: 10000, source: '[SDK] KnowledgeBaseArticle.payload @length(max:10000)' },
  conversationTtlMinutes:     { max: 1440,  source: '[SDK] settings.conversationTTL max 1440 (minutes, 24h)' },
} as const satisfies Record<string, LengthLimit>;
