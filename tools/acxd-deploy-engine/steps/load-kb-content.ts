// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Load knowledge-base CONTENT, then re-publish each KB that received content.
// LAYER: EMITTER — reads each KnowledgeBaseDef.content folder (relative to the deploy config) and uploads it.
//
//   articles  KB: every *.json file is an array of { "question": string, "answer": string } and each entry becomes
//                 one CreateKnowledgeBaseArticle { question:{text}, responses:[{type:'text', body}] }.
//                 [SDK-MODEL + GA example lib/ensure.js createArticle]
//   documents KB: every *.md / *.txt / *.pdf / *.html file is registered with PutKnowledgeBaseDocument
//                 (documentId = file name, contentType from the extension), which returns a pre-signed { url,
//                 fields } form; the file is then POSTed there as multipart form data. [SDK-MODEL; the pre-signed
//                 POST mechanics are the standard S3 form upload and are UNVERIFIED against ACXD until a run
//                 confirms uploadStatus becomes UPLOADED.]
// Idempotent enough to re-run: documents use documentId = file name (PUT is @idempotent); articles are created
// again on a re-run, so re-running against a populated articles KB duplicates entries (log.warn says so).
// A KB is invisible to flows until published, so each KB that received content is published again.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import {
  CreateKnowledgeBaseArticleCommand, PutKnowledgeBaseDocumentCommand, PublishKnowledgeBaseCommand,
} from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';

export interface KnowledgeBaseContentDef {
  name: string;
  type: string;            // "articles" | "documents"
  content?: string;        // folder of content files, relative to the deploy config's directory
}

const DOC_TYPES: Record<string, string> = {
  '.md': 'text/markdown', '.txt': 'text/plain', '.pdf': 'application/pdf', '.html': 'text/html',
};

export interface LoadKbContentResult { articles: number; documents: number; kbsLoaded: string[] }

async function uploadToPresigned(url: string, fields: Record<string, unknown>, name: string,
  contentType: string, body: Buffer): Promise<void> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields ?? {})) form.append(k, String(v));
  form.append('file', new Blob([new Uint8Array(body)], { type: contentType }), name);   // file part MUST be last
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload of ${name} failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
}

export async function loadKnowledgeBaseContent(
  client: EngineClient,
  defs: KnowledgeBaseContentDef[],
  nameToId: Map<string, string>,
  baseDir: string,
  log: Logger,
): Promise<LoadKbContentResult> {
  const result: LoadKbContentResult = { articles: 0, documents: 0, kbsLoaded: [] };
  const withContent = defs.filter((d) => d.content);
  if (withContent.length === 0) { log.stage('knowledge base content: none declared (no "content" folder on any KB)'); return result; }
  log.stage(`knowledge base content: loading ${withContent.length} KB(s)`);
  for (const kb of withContent) {
    const kbId = nameToId.get(kb.name);
    if (!kbId) throw new Error(`knowledge base "${kb.name}" has content but no id was resolved; cannot load it`);
    const dir = resolve(baseDir, kb.content as string);
    if (!existsSync(dir) || !statSync(dir).isDirectory())
      throw new Error(`knowledge base "${kb.name}": content folder not found: ${dir}`);
    const files = readdirSync(dir).filter((f) => !f.startsWith('.')).sort();
    let loaded = 0;
    if (kb.type === 'articles') {
      log.warn(`articles KB "${kb.name}": articles are created on every run; re-running against a populated KB duplicates them`);
      for (const f of files.filter((x) => extname(x).toLowerCase() === '.json')) {
        const entries = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Array<{ question?: string; answer?: string }>;
        if (!Array.isArray(entries)) throw new Error(`${f}: expected an array of {question, answer}`);
        for (const [i, e] of entries.entries()) {
          if (!e?.question || !e?.answer) throw new Error(`${f}[${i}]: each entry needs "question" and "answer"`);
          await client.send(new CreateKnowledgeBaseArticleCommand({
            knowledgeBaseId: kbId, question: { text: e.question }, responses: [{ type: 'text', body: e.answer }],
          } as never));
          loaded++; result.articles++;
        }
      }
    } else if (kb.type === 'documents') {
      for (const f of files) {
        const contentType = DOC_TYPES[extname(f).toLowerCase()];
        if (!contentType) { log.warn(`documents KB "${kb.name}": skipping unsupported file ${f}`); continue; }
        const out = await client.send<{ url?: string; fields?: Record<string, unknown> }>(
          new PutKnowledgeBaseDocumentCommand({ knowledgeBaseId: kbId, documentId: f, contentType } as never),
        );
        if (!out?.url) throw new Error(`PutKnowledgeBaseDocument for ${f} returned no upload url`);
        await uploadToPresigned(out.url, out.fields ?? {}, f, contentType, readFileSync(join(dir, f)));
        log.object(`✓ document ${kb.name}/${f}`);
        loaded++; result.documents++;
      }
    } else {
      throw new Error(`knowledge base "${kb.name}": unknown type "${kb.type}" (expected articles | documents)`);
    }
    if (loaded === 0) { log.warn(`knowledge base "${kb.name}": content folder has no loadable files: ${dir}`); continue; }
    await client.send(new PublishKnowledgeBaseCommand({ knowledgeBaseId: kbId }));
    log.object(`✓ knowledgeBase ${kb.name}: ${loaded} item(s) loaded, re-published`);
    result.kbsLoaded.push(kb.name);
  }
  return result;
}
