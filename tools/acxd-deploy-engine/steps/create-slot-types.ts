// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Create custom slot types. Reads resources/slot-types.json.
// LAYER: EMITTER — builds & sends CreateSlotType inputs from resources/slot-types.json.
// Field is `slotTypeId` (VERIFIED, not `name`). Duplicate can 500 → treat500AsExists.
// Custom slot tokens are referenced WITHOUT the NLX. prefix (that's for built-ins). Returns count.
//
// Deterministic valueId (VERIFIED against the ACXD SDK):
// SlotTypeValue.valueId is CLIENT-SETTABLE, so the engine sets a deterministic id on every value at create
// time: `<slotTypeId><ValuePascalCase>` (e.g. slotType `xxYesNo`, value `yes` → `xxYesNoYes`). Flow
// user_choice branch conditions then reference that exact id directly as `constant_id` — NO runtime
// resolution (ListSlotTypes) and NO {slotType:value} placeholder. The ids are stable across workspaces
// (dev/staging/prod), which makes flow JSON portable. An authored value may override by supplying its own
// `valueId`; otherwise the deterministic one is derived here.
import { CreateSlotTypeCommand } from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';
import { createIdempotent } from '../lib/idempotency';
import { truncateDescription } from '../lib/text';

export interface SlotValue { value: string; valueId?: string; synonyms?: string[]; }
export interface SlotTypeDef {
  // [SDK gotcha] ACXD CreateSlotTypeCommand's id field is `slotTypeId`, NOT `name` (authoring to `name` fails).
  slotTypeId: string;
  values: SlotValue[];
  description: string;
}

// Derive the deterministic valueId for a value: <slotTypeId><ValuePascalCase>, letters only.
// PascalCase the value by splitting on any non-alphanumeric run and upper-casing each part's first letter.
// (Slot values are typically already single camelCase words, e.g. "newQuote" → "NewQuote".)
export function deriveValueId(slotTypeId: string, value: string): string {
  const pascal = value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return `${slotTypeId}${pascal}`;
}

export async function createSlotTypes(
  client: EngineClient,
  defs: SlotTypeDef[],
  log: Logger,
): Promise<number> {
  log.stage(`slot types: creating ${defs.length}`);
  let created = 0;
  for (const st of defs) {
    // Attach a deterministic valueId to every value (unless the author supplied one).
    const values = st.values.map((v) => ({
      value: v.value,
      valueId: v.valueId && v.valueId.trim() !== '' ? v.valueId : deriveValueId(st.slotTypeId, v.value),
      ...(v.synonyms !== undefined && { synonyms: v.synonyms }),
    }));
    const didCreate = await createIdempotent(`slotType ${st.slotTypeId}`, () =>
      client.send(new CreateSlotTypeCommand({
        slotTypeId: st.slotTypeId,
        values,
        description: truncateDescription(st.description),
      })), log, { treat500AsExists: true });
    if (didCreate) created++;
  }
  return created;
}
