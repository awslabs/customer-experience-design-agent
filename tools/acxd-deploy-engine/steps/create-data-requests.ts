// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Create data requests. Reads resources/data-requests.json.
// LAYER: EMITTER — builds & sends CreateDataRequest inputs from resources/data-requests.json.
// Every data request nests a `webhook` (VERIFIED). implementation selects how it's served:
//   inline-static → canned responses inside ACXD runtime (no backend)
//   external      → an API (yours, or one this solution deploys); url + auth headers from the API wiring tool
//   mcp           → MCP gateway
// URL params and a JSON request body are both supported on any method (the node supplies the values). Duplicate can 500 → treat500AsExists.
// External creation validates schema shape only — it does NOT test reachability. Returns count.
import { CreateDataRequestCommand } from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';
import { createIdempotent } from '../lib/idempotency';
import { truncateDescription } from '../lib/text';

export interface WebhookHeader { key: string; value: string; sensitive?: boolean; }
export interface DataRequestDef {
  dataRequestId: string;
  description: string;
  implementation: 'external' | 'inline-static' | 'mcp';
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';   // SDK WebhookMethod; body or URL params on any method
  url?: string;                      // for external; may contain {secretName} + {param} placeholders
  headers?: WebhookHeader[];
  code?: string;                     // for inline-static (the canned-response logic)
  requestSchema?: unknown;
  responseSchema?: unknown;
}

export async function createDataRequests(
  client: EngineClient,
  defs: DataRequestDef[],
  log: Logger,
): Promise<number> {
  log.stage(`data requests: creating ${defs.length}`);
  let created = 0;
  for (const dr of defs) {
    const webhook: Record<string, unknown> = { implementation: dr.implementation };
    if (dr.implementation === 'external') {
      webhook.method = dr.method ?? 'GET';
      // The runtime substitutes URL {placeholder} tokens ONLY when the webhook carries an `environments`
      // map; a bare top-level `webhook.url` is sent VERBATIM (the literal "{param}" → 404). VERIFIED against
      // the GA order-lookup example (webhook.url lives inside environments) + WebhookConfig/WebhookEnvironments
      // in the SDK model. Emit the authored url into BOTH production and development environments (same url —
      // a single deploy target); headers go inside each environment. Do NOT set a bare top-level webhook.url.
      const env: Record<string, unknown> = { url: dr.url };
      if (dr.headers) env.headers = dr.headers;
      webhook.environments = { production: env, development: env };
    } else if (dr.implementation === 'inline-static') {
      webhook.code = dr.code;
    }
    const didCreate = await createIdempotent(`dataRequest ${dr.dataRequestId}`, () =>
      client.send(new CreateDataRequestCommand({
        dataRequestId: dr.dataRequestId,
        type: 'object',
        description: truncateDescription(dr.description),
        webhook: webhook as never,
        ...(dr.requestSchema ? { requestSchema: dr.requestSchema as never } : {}),
        ...(dr.responseSchema ? { responseSchema: dr.responseSchema as never } : {}),
      })), log, { treat500AsExists: true });
    if (didCreate) created++;
  }
  return created;
}
