// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Create analytics tags. Reads resources/analytics-tags.json.
// LAYER: EMITTER — builds & sends CreateAnalyticsTag inputs from resources/analytics-tags.json.
// name + type + description all required (VERIFIED against .d.ts). Use camelCase — ACXD silently strips
// hyphens. The SDK validates `description` as printable ASCII, MAX 64 CHARS — the engine truncates to 64  // limit source: lib/length-limits.ts DESCRIPTION_LIMITS.analyticsTag (64)
// (ASCII-safe) so an over-long authored description can never fail the deploy.
// Returns count created.
import { CreateAnalyticsTagCommand } from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';
import { createIdempotent } from '../lib/idempotency';
import { truncateAscii } from '../lib/text';

export interface AnalyticsTagDef {
  name: string;
  type: string;   // AnalyticsTagType enum (VERIFIED 0.1.0): "positive" | "negative" | "neutral"
  description: string;
}

export async function createAnalyticsTags(
  client: EngineClient,
  defs: AnalyticsTagDef[],
  log: Logger,
): Promise<number> {
  log.stage(`analytics tags: creating ${defs.length}`);
  let created = 0;
  for (const t of defs) {
    const description = truncateAscii(t.description, 64);
    const didCreate = await createIdempotent(`analyticsTag ${t.name}`, () =>
      client.send(new CreateAnalyticsTagCommand({ name: t.name, type: t.type as never, description })), log);
    if (didCreate) created++;
  }
  return created;
}
