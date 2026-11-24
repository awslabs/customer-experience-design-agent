// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Create context variables (primitives — created first). Reads resources/context-vars.json.
// LAYER: EMITTER — builds & sends CreateContextVariable inputs from resources/context-vars.json.
// Schema note (VERIFIED): the field is `schema` (a JSON-schema doc with type/description/
// isSensitive), NOT a top-level `type`. Standalone unit: returns count created.
import { CreateContextVariableCommand } from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';
import { createIdempotent } from '../lib/idempotency';
import { truncateDescription } from '../lib/text';

export interface ContextVarDef {
  name: string;
  schemaType: string;      // "string" | "boolean" | "number" | ...
  description: string;
  sensitive?: boolean;
}

export async function createContextVars(
  client: EngineClient,
  defs: ContextVarDef[],
  log: Logger,
): Promise<number> {
  log.stage(`context variables: creating ${defs.length}`);
  let created = 0;
  for (const cv of defs) {
    const didCreate = await createIdempotent(`contextVariable ${cv.name}`, () =>
      client.send(new CreateContextVariableCommand({
        name: cv.name,
        schema: {
          type: cv.schemaType,
          description: truncateDescription(cv.description),
          isSensitive: !!cv.sensitive,
        },
      })), log);
    if (didCreate) created++;
  }
  return created;
}
