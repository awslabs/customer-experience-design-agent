// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// SDK conformance check: re-tests the platform behaviours the engine depends on that the SDK model does not
// document, against the live workspace of a deployed PoC. Run it after every amazon-connect-acxd-sdk version bump.
//
// It creates small probe flows (prefix "sdkProbe"), reads them back with GetFlow and reports PASS / CHANGED per
// check, then deletes them. It never touches other flows. Checks that can only be judged in the ACXD console are
// printed as a manual checklist at the end (see tests/sdk-conformance/MANUAL-CHECKS.md).
//
// Usage (from tools/acxd-deploy-engine, after npm install), pointing at a deployed AnyCare PoC distribution:
//   ACXD_ENV_FILE="$ACXD_DIST/.env" npx tsx ../../tests/sdk-conformance/sdk-conformance.ts
// That .env already holds AWS_REGION, ACXD_API_TOKEN and ACXD_WORKSPACE_ID. Use a PoC / dev workspace, never
// production. Add --keep to leave the probe flows in place for console inspection. See MANUAL-CHECKS.md.
//
// Not part of `npm test` (it needs credentials and a live workspace).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { makeClient, type EngineClient } from '../../tools/acxd-deploy-engine/lib/client';
import { flow } from '../../tools/acxd-deploy-engine/flow-dsl/builder';
import {
  startNode, basicNode, dataRequest, userChoice, split,
} from '../../tools/acxd-deploy-engine/flow-dsl/nodes';

// This file lives outside the engine folder, so packages resolve from the engine's node_modules
// (run it from tools/acxd-deploy-engine, as in the usage line above).
const engineRequire = createRequire(join(process.cwd(), 'package.json'));
const sdk = engineRequire('amazon-connect-acxd-sdk') as Record<string, new (input: unknown) => unknown>;
const { CreateFlowCommand, GetFlowCommand, DeleteFlowCommand } = sdk;
(engineRequire('dotenv') as { config: (o: object) => unknown }).config({ path: process.env.ACXD_ENV_FILE ?? '.env', override: true });
const KEEP = process.argv.includes('--keep');

type Result = { id: string; name: string; status: 'PASS' | 'CHANGED' | 'ERROR'; detail: string };
const results: Result[] = [];
const created: string[] = [];

function sdkVersion(): string {
  try { return (engineRequire('amazon-connect-acxd-sdk/package.json') as { version: string }).version; } catch { return 'unknown'; }
}

async function send<T>(c: EngineClient, cmd: unknown): Promise<T> { return c.send<T>(cmd); }

async function createAndRead(c: EngineClient, doc: Record<string, unknown>): Promise<Record<string, unknown>> {
  const flowId = String(doc.flowId);
  try { await send(c, new DeleteFlowCommand({ flowIdentifier: flowId } as never)); } catch { /* not there */ }
  // Send the CreateFlow shape the engine sends (slots -> slotTypes; choice source slot -> slotType).
  const { slots, ...rest } = doc as { slots?: unknown[] } & Record<string, unknown>;
  if (Array.isArray(slots) && slots.length) rest.slotTypes = slots;
  for (const n of Object.values((rest.nodes ?? {}) as Record<string, Record<string, unknown>>)) {
    const ch = (n.metadata as Record<string, unknown> | undefined)?.choice as Record<string, unknown> | undefined;
    if (n.type === 'user_choice' && ch?.source === 'slot') { ch.source = 'slotType'; ch.slotTypeId = ch.slotId; delete ch.slotId; }
  }
  await send(c, new CreateFlowCommand(rest as never));
  created.push(flowId);
  return send<Record<string, unknown>>(c, new GetFlowCommand({ flowIdentifier: flowId } as never));
}

function nodesByName(stored: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const n of Object.values((stored.nodes ?? {}) as Record<string, Record<string, unknown>>)) {
    const nm = (n.metadata as Record<string, unknown> | undefined)?.name;
    if (typeof nm === 'string') out[nm] = n;
  }
  return out;
}
function targetName(stored: Record<string, unknown>, nodeId: unknown): string {
  const n = ((stored.nodes ?? {}) as Record<string, Record<string, unknown>>)[String(nodeId)];
  return String((n?.metadata as Record<string, unknown> | undefined)?.name ?? n?.type ?? nodeId);
}

async function check(id: string, name: string, fn: () => Promise<[boolean, string]>): Promise<void> {
  try { const [ok, detail] = await fn(); results.push({ id, name, status: ok ? 'PASS' : 'CHANGED', detail }); }
  catch (e) { results.push({ id, name, status: 'ERROR', detail: String((e as Error)?.message ?? e) }); }
}

async function main(): Promise<void> {
  if (!process.env.ACXD_WORKSPACE_ID) throw new Error('ACXD_WORKSPACE_ID must be set (point ACXD_ENV_FILE at a deployed PoC distribution .env)');
  const c = makeClient().withWorkspace(process.env.ACXD_WORKSPACE_ID);
  console.log(`SDK conformance check: amazon-connect-acxd-sdk ${sdkVersion()}, workspace ${process.env.ACXD_WORKSPACE_ID}\n`);

  // P1 + P2: data-request exits bind by position; in_progress must be first and unwired.
  // Probe A sends the exits in the engine's order. Probe B sends success first, in_progress wired to "Wrong".
  await check('P1', 'data_request exits keep their targets in engine order', async () => {
    const f = flow('sdkProbeExitOrder', 'SDK probe: data request exit order');
    const s = f.add(startNode()); const dr = f.add(dataRequest({ name: 'Probe request', variableId: 'sdkProbeMissing' }));
    const ok = f.add(basicNode({ name: 'On success', messages: ['success'] }));
    const to = f.add(basicNode({ name: 'On timeout', messages: ['timeout'] }));
    const fl = f.add(basicNode({ name: 'On failure', messages: ['failure'] }));
    s.exit('next').to(dr); dr.exit('success').to(ok); dr.exit('timeout').to(to); dr.exit('failure').to(fl);
    for (const n of [ok, to, fl]) n.exit('next').terminate();
    const stored = await createAndRead(c, f.emit() as unknown as never);
    const n = nodesByName(stored)['Probe request'];
    const edges = ((n?.childNodes ?? []) as Array<Record<string, unknown>>).map((e) =>
      `${JSON.stringify((e.conditions as Array<Record<string, unknown>> | undefined)?.[0]?.right ?? 'next')}->${targetName(stored, e.nodeId)}`);
    const okEdges = edges.some((e) => e.includes('success') && e.endsWith('On success')) &&
      edges.some((e) => e.includes('timeout') && e.endsWith('On timeout')) &&
      edges.some((e) => e.includes('failure') && e.endsWith('On failure'));
    return [okEdges, edges.join(' | ')];
  });

  // P3: user_choice binding: console shape source "slot" + slotId must arrive as slotType + slotTypeId.
  await check('P3', 'user_choice slot binding survives CreateFlow', async () => {
    const f = flow('sdkProbeChoice', 'SDK probe: user choice binding');
    const s = f.add(startNode());
    const uc = f.add(userChoice({ name: 'Pick', slotName: 'probePick', slotType: 'NLX.AlphaNumeric', elicit: 'Pick one.' }));
    const done = f.add(basicNode({ name: 'Done', messages: ['ok'] }));
    s.exit('next').to(uc); for (const e of uc.exits) e.to(done); done.exit('next').terminate();
    const stored = await createAndRead(c, f.emit() as unknown as never);
    const ch = (nodesByName(stored)['Pick']?.metadata as Record<string, unknown> | undefined)?.choice as Record<string, unknown> | undefined;
    return [ch?.source === 'slotType' && ch?.slotTypeId === 'probePick', JSON.stringify(ch ?? {})];
  });

  // P4: typed constant operands (number / boolean) are stored as typed, not as strings.
  await check('P4', 'number and boolean constants keep their type', async () => {
    const f = flow('sdkProbeTyped', 'SDK probe: typed constants');
    const s = f.add(startNode());
    const b = f.add(basicNode({ name: 'Set typed', messages: ['ok'], stateMods: [
      { type: 'context', name: 'probeCount', modification: 'set', value: { type: 'constant', value: 0 } },
      { type: 'context', name: 'probeFlag', modification: 'set', value: { type: 'constant', value: true } },
    ] as never }));
    s.exit('next').to(b); b.exit('next').terminate();
    const stored = await createAndRead(c, { ...(f.emit() as unknown as object), contextVariables: [{ name: 'probeCount', type: 'number' }, { name: 'probeFlag', type: 'boolean' }] } as never);
    const mods = ((nodesByName(stored)['Set typed']?.metadata as Record<string, unknown> | undefined)?.stateModifications ?? []) as Array<Record<string, unknown>>;
    const vals = mods.map((m) => (m.value as Record<string, unknown> | undefined)?.value);
    return [typeof vals[0] === 'number' && typeof vals[1] === 'boolean', JSON.stringify(vals)];
  });

  // P5: split modelType is stored as sent (SplitModelType).
  await check('P5', 'split modelType is stored', async () => {
    const f = flow('sdkProbeSplit', 'SDK probe: split model');
    const s = f.add(startNode());
    const sp = f.add(split({ name: 'Branch', branches: [] }));
    const d = f.add(basicNode({ name: 'Default', messages: ['ok'] }));
    s.exit('next').to(sp); sp.exit('default').to(d); d.exit('next').terminate();
    const stored = await createAndRead(c, f.emit() as unknown as never);
    const m = (nodesByName(stored)['Branch']?.metadata as Record<string, unknown> | undefined)?.split;
    return [JSON.stringify(m ?? {}).includes('haiku-4-5'), JSON.stringify(m ?? {})];
  });

  // P6: creating a flow that already exists: which error does the SDK return now (engine treats 500 as "exists")?
  await check('P6', 'create on an existing flow returns a recognisable error', async () => {
    const f = flow('sdkProbeExists', 'SDK probe: duplicate create');
    const s = f.add(startNode()); const d = f.add(basicNode({ name: 'Hi', messages: ['hi'] }));
    s.exit('next').to(d); d.exit('next').terminate();
    const doc = f.emit() as unknown as Record<string, unknown>;
    await createAndRead(c, doc);
    try { await send(c, new CreateFlowCommand(doc as never)); return [false, 'second create succeeded'] as [boolean, string]; }
    catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      const code = err.$metadata?.httpStatusCode;
      return [code === 500 || code === 409, `HTTP ${code} ${err.name} (500 = current engine assumption; 409 = SDK improved, engine still OK)`];
    }
  });

  if (!KEEP) {
    for (const id of created) { try { await send(c, new DeleteFlowCommand({ flowIdentifier: id } as never)); } catch { /* ignore */ } }
  }

  console.log('Result  Check                                                   Detail');
  for (const r of results) console.log(`${r.status.padEnd(7)} ${r.id}  ${r.name.padEnd(52)} ${r.detail}`);
  const bad = results.filter((r) => r.status !== 'PASS');
  console.log(`\n${results.length - bad.length}/${results.length} pass. ${bad.length ? 'A CHANGED result means the platform behaviour moved: review the matching pattern in knowledge/acxd-platform-agent/acxd-counter-intuitive-patterns.md before releasing.' : ''}`);
  console.log('Now run the console checks in tests/sdk-conformance/MANUAL-CHECKS.md' + (KEEP ? ' (probe flows kept).' : ' (re-run with --keep to inspect the probes).'));
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
