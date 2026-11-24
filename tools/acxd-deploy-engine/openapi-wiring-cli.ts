// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// API wiring CLI: derives ACXD secrets, data-request urls/auth headers, the .env API block and the runbook .env
// bullets from the solution's OpenAPI files. Deterministic; no AWS calls. See lib/openapi-wiring.ts.
//
//   npx --yes tsx openapi-wiring-cli.ts --apis <dir-or-file>... [actions]
// Actions (any combination):
//   --resources <dir>          rewrite <dir>/data-requests.json (method, url, auth headers) and <dir>/secrets.json
//   --env-example <file>       fill the API block of a .env / .env.example (values already entered are kept)
//   --generate-keys <file>     fill blank API keys of GENERATED APIs in a .env with random 40-character keys
//   --check <file> --template <file>   drift check: outside the block == template, inside == OpenAPI files (exit 1 on drift)
//   --runbook                  print the runbook's ".env update" bullets for the APIs
//   --inventory <file>         check every API id in the inventory's "API integrations" table has an OpenAPI file
//                              (an inventory with no API rows passes; no OpenAPI files is then not an error)
// Exit 1 on any problem (unsupported auth scheme, data request with no matching operation, drift).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { wireApi, applyWiring, fillEnvBlock, checkEnvBlock, generateKeys, renderRunbookBullets, type ApiWiring } from './lib/openapi-wiring';


const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const apiArgs: string[] = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--apis') { for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++) apiArgs.push(args[j]); }
if (!apiArgs.length) { console.error('usage: tsx openapi-wiring-cli.ts --apis <dir-or-file>... [--resources <dir>] [--env-example <file>] [--generate-keys <file>] [--check <file> --template <file>] [--runbook]'); process.exit(1); }

// API ids listed in the inventory's "## API integrations" table (first column, after the header row).
const invPath = opt('--inventory');
let inventoryIds: string[] | undefined;
if (invPath) {
  const inv = readFileSync(resolve(invPath), 'utf8');
  const sec = (inv.split(/^## API integrations\s*$/m)[1] ?? '').split(/^## /m)[0];
  inventoryIds = sec.split('\n').filter((l) => /^\s*\|/.test(l)).slice(2)
    .map((l) => l.split('|')[1]?.trim().replace(/`/g, '') ?? '').filter((id) => /^[A-Za-z][A-Za-z0-9]*$/.test(id));
  if (!/^## API integrations\s*$/m.test(inv)) { console.error(`  • ${invPath} has no "## API integrations" table.`); process.exit(1); }
  if (!inventoryIds.length) { console.log('no API integrations in the inventory: nothing to check'); process.exit(0); }
}

// yaml is the tool's only package dependency. Load it here so a missing install gives one clear instruction.
let parseYaml: (text: string) => unknown;
try {
  ({ parse: parseYaml } = await import('yaml'));
} catch {
  console.error(`The API wiring tool needs its packages. Run:  cd ${resolve(import.meta.dirname ?? '.')} && npm ci   then re-run this command.`);
  process.exit(1);
}

const files: string[] = [];
for (const a of apiArgs) {
  const p = resolve(a);
  if (!statSync(p, { throwIfNoEntry: false })) continue;
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p).sort()) if (/openapi\.(ya?ml|json)$/i.test(f)) files.push(join(p, f));
  } else files.push(p);
}
if (!files.length) { console.error(`no OpenAPI files (*openapi.yaml|yml|json) found in ${apiArgs.join(', ')}`); process.exit(1); }

const problems: string[] = [];
const apis: ApiWiring[] = [];
for (const f of files) {
  try {
    const text = readFileSync(f, 'utf8');
    const doc = /\.json$/i.test(f) ? JSON.parse(text) : parseYaml(text);
    apis.push(wireApi(f, doc));
  } catch (e) { problems.push(`${f}: ${(e as Error).message}`); }
}
if (problems.length) { for (const p of problems) console.error(`  • ${p}`); process.exit(1); }
if (inventoryIds) {
  const have = new Set(apis.map((a) => a.apiId));
  for (const id of inventoryIds) if (!have.has(id)) problems.push(`API "${id}" is in the integration inventory but has no OpenAPI file in ${apiArgs.join(', ')} (or its info.x-acxd-api-id differs).`);
  if (problems.length) { for (const p of problems) console.error(`  • ${p}`); process.exit(1); }
}
for (const a of apis) console.log(`api ${a.apiId} (${a.kind}): ${a.operations.length} operation(s), credentials: ${a.credentials.map((c) => `${c.secretName} [${c.kind}]`).join(', ') || 'none'}`);

const res = opt('--resources');
if (res) {
  const drPath = join(resolve(res), 'data-requests.json');
  const sPath = join(resolve(res), 'secrets.json');
  const drs = JSON.parse(readFileSync(drPath, 'utf8'));
  let secrets: never[] = [];
  try { secrets = JSON.parse(readFileSync(sPath, 'utf8')); } catch { /* no secrets file yet */ }
  const out = applyWiring(apis, drs, secrets);
  problems.push(...out.problems);
  writeFileSync(drPath, JSON.stringify(out.dataRequests, null, 2) + '\n');
  writeFileSync(sPath, JSON.stringify(out.secrets, null, 2) + '\n');
  console.log(`wired ${drPath} and ${sPath} (${out.secrets.length} secret(s))`);
}
const envEx = opt('--env-example');
if (envEx) { const p = resolve(envEx); writeFileSync(p, fillEnvBlock(readFileSync(p, 'utf8'), apis)); console.log(`filled the API block in ${p}`); }
const gen = opt('--generate-keys');
if (gen) {
  const p = resolve(gen);
  const alnum = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const rnd = (n: number) => Array.from(randomBytes(n), (b) => alnum[b % alnum.length]).join('');
  const r = generateKeys(readFileSync(p, 'utf8'), apis, rnd);
  writeFileSync(p, r.text, { mode: 0o600 });
  console.log(r.filled.length ? `generated: ${r.filled.join(', ')}` : 'no blank generated-API keys to fill');
}
const chk = opt('--check');
if (chk) {
  const tpl = opt('--template');
  if (!tpl) problems.push('--check needs --template <the shipped .env.example>');
  else {
    const p = checkEnvBlock(readFileSync(resolve(chk), 'utf8'), readFileSync(resolve(tpl), 'utf8'), apis);
    problems.push(...p);
    if (!p.length) console.log('OK .env API block matches the template and the OpenAPI files');
  }
}
if (args.includes('--runbook')) console.log('\n' + renderRunbookBullets(apis));
if (problems.length) { for (const p of problems) console.error(`  • ${p}`); process.exit(1); }
