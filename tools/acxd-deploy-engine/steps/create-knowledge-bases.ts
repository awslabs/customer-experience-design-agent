// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Create knowledge bases, then PUBLISH each (VERIFIED: a KB is invisible to flows until published).
// LAYER: EMITTER — builds & sends CreateKnowledgeBase inputs, then publishes each.
// Reads resources/knowledge-bases.json. This step creates the KB shell and publishes it so flows can bind it;
// content (articles/documents) is loaded afterwards by steps/load-kb-content.ts from each KB's `content` folder.
//
// KB id capture (VERIFIED: CreateKnowledgeBaseCommand returns the full
// KnowledgeBase incl. knowledgeBaseId SYNCHRONOUSLY). We capture the id from the create RESPONSE and return
// a name->id map, so flow creation can resolve {kbName} tokens WITHOUT a ListKnowledgeBasesCommand round-trip.
// On a re-run where the KB already exists (create skipped, no response id), we fall back to a single
// ListKnowledgeBasesCommand to recover the id for those names only.
import { CreateKnowledgeBaseCommand, PublishKnowledgeBaseCommand, ListKnowledgeBasesCommand } from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';
import { createIdempotent } from '../lib/idempotency';
import { truncateDescription } from '../lib/text';

export interface KnowledgeBaseDef {
  name: string;
  type: string;              // e.g. "documents" | "articles"
  description: string;
  publish?: boolean;         // default true
  content?: string;          // folder of content files (relative to the deploy config); loaded by load-kb-content.ts
}

export interface CreateKnowledgeBasesResult {
  created: number;
  nameToId: Map<string, string>;   // KB name -> server UUID (captured at create; List-recovered on re-run)
}

// Recover ids for KB names we did NOT capture at create time (already existed on a re-run). One paginated
// ListKnowledgeBasesCommand, filtered to just the missing names. Skipped entirely if nothing is missing.
async function recoverMissingIds(
  client: EngineClient,
  missing: Set<string>,
  nameToId: Map<string, string>,
  log: Logger,
): Promise<void> {
  if (missing.size === 0) return;
  let nextToken: string | undefined;
  do {
    const out = await client.send<{ items?: Array<{ knowledgeBaseId?: string; name?: string }>; nextToken?: string }>(
      new ListKnowledgeBasesCommand(nextToken ? { nextToken } : {}),
    );
    for (const kb of out?.items ?? []) {
      if (kb.name && kb.knowledgeBaseId && missing.has(kb.name)) {
        nameToId.set(kb.name, kb.knowledgeBaseId);
        missing.delete(kb.name);
      }
    }
    nextToken = out?.nextToken;
  } while (nextToken && missing.size > 0);
  if (missing.size) log.warn(`could not resolve knowledge base id(s) for: ${[...missing].join(', ')}`);
}

export async function createKnowledgeBases(
  client: EngineClient,
  defs: KnowledgeBaseDef[],
  log: Logger,
): Promise<CreateKnowledgeBasesResult> {
  log.stage(`knowledge bases: creating ${defs.length}`);
  let created = 0;
  const nameToId = new Map<string, string>();
  const missing = new Set<string>();   // names whose id we did not capture (already existed)
  for (const kb of defs) {
    const didCreate = await createIdempotent(`knowledgeBase ${kb.name}`, async () => {
      const out = await client.send<{ knowledgeBaseId?: string }>(new CreateKnowledgeBaseCommand({
        name: kb.name,
        type: kb.type as never,
        description: truncateDescription(kb.description),
      }));
      const kbId = out?.knowledgeBaseId;
      if (kbId) {
        nameToId.set(kb.name, kbId);   // capture the id from the create response (no List needed)
        if (kb.publish ?? true) {
          // SDK VERIFIED (0.1.0): PublishKnowledgeBaseRequest.knowledgeBaseId — the SHORT `Id` form, NOT
          // `knowledgeBaseIdentifier`. (Publish/KB commands use `…Id`; only build/deploy use `…Identifier`.)
          await client.send(new PublishKnowledgeBaseCommand({ knowledgeBaseId: kbId }));
          log.debug(`published knowledgeBase ${kb.name} (${kbId})`);
        }
      }
    }, log, { treat500AsExists: true });
    if (didCreate) created++;
    else missing.add(kb.name);   // existed already — recover its id via List below
  }
  // Recover ids only for KBs that already existed (create skipped, so no response id captured).
  await recoverMissingIds(client, missing, nameToId, log);
  return { created, nameToId };
}
