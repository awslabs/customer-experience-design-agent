// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Deterministic flow-path tracer CLI. No AWS, no LLM.
//   npx --yes tsx trace-cli.ts <flowsDir> <scenario.json | scenarios.json> [--json]
//   npx --yes tsx trace-cli.ts <flowsDir> --prompts  (print every Generative Journey's built prompt)
//   npx --yes tsx trace-cli.ts <flowsDir> --inputs   (list every slot/choice value, journey exit, split and data request)
// A scenario file holds one Scenario or an array of them (see lib/trace-flows.ts). Prints one line per step,
// each Redirect, the end state, and for every Generative Journey reached: its tools and the value of every
// {x:NLX.Context} token at that moment. Exit 0 always on a completed trace; exit 1 on bad input.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadFlowDocs, traceScenario, formatTrace, listBranchInputs, type Scenario } from './lib/trace-flows';

const args = process.argv.slice(2);
const json = args.includes('--json');
if (args.includes('--prompts')) {
  const d = args.find((a) => !a.startsWith('--'));
  if (!d) { console.error('usage: tsx trace-cli.ts <flowsDir> --prompts'); process.exit(1); }
  for (const f of Object.values(loadFlowDocs(resolve(d)) as unknown as Record<string, unknown>) as Array<{ flowId?: string; nodes?: Record<string, { type?: string; metadata?: { name?: string; generativeJourney?: { prompt?: string } } }> }>) {
    for (const n of Object.values(f.nodes ?? {})) {
      if (n.type !== 'generative_journey') continue;
      console.log(`=== ${f.flowId} / ${n.metadata?.name ?? '?'}\n${n.metadata?.generativeJourney?.prompt ?? ''}\n`);
    }
  }
  process.exit(0);
}
if (args.includes('--inputs')) {
  const d = args.find((a) => !a.startsWith('--'));
  if (!d) { console.error('usage: tsx trace-cli.ts <flowsDir> --inputs'); process.exit(1); }
  console.log(JSON.stringify(listBranchInputs(loadFlowDocs(resolve(d))), null, 2));
  process.exit(0);
}
const [dir, file] = args.filter((a) => a !== '--json');
if (!dir || !file) {
  console.error('usage: tsx trace-cli.ts <flowsDir> <scenario.json> [--json]');
  process.exit(1);
}
const raw = JSON.parse(readFileSync(resolve(file), 'utf8')) as Scenario | Scenario[];
const docs = loadFlowDocs(resolve(dir));
const results = (Array.isArray(raw) ? raw : [raw]).map((s) => traceScenario(docs, s));
console.log(json ? JSON.stringify(results, null, 2) : results.map(formatTrace).join('\n\n'));
