#!/usr/bin/env bun
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ACXD Stage Exit Sensor (blocking, fires at the gate).
 *
 * Generic: runs the "## Exit criteria" list written in the current stage's own file, so each check lives beside
 * the step that creates what it checks and moves with it. The sensor knows nothing about any one artifact.
 *
 * The gate fires a sensor once per declared deliverable; this one acts only on the stage's FIRST declared
 * `produces` entry (the anchor) and passes the others, so the criteria run once per gate.
 *
 * Criteria (one per bullet, in the stage body under "## Exit criteria"):
 *   - run: <shell command>   met when the command exits 0 (its output becomes the finding)
 *   - files: <glob>          met when at least one file matches (relative to the project root)
 * Tokens: {{HARNESS_DIR}} = the harness dir (e.g. .kiro); <record> = this stage's record dir.
 *
 * Output: one JSON verdict { pass, findings_count, findings[] } on stdout; always exit 0.
 */
import { existsSync, readFileSync, readdirSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { spawnSync } from "child_process";

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function done(findings: string[], note?: string): never {
  const out: Record<string, unknown> = { pass: findings.length === 0, findings_count: findings.length, findings };
  if (note) out.note = note;
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

const stage = arg("--stage");
const outputPath = arg("--output-path");
if (!stage || !outputPath) done(["acxd-stage-exit: called without --stage and --output-path"]);

const harnessDir = resolve(dirname(import.meta.path), "..");
function findStageFile(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const hit = findStageFile(p); if (hit) return hit; }
    else if (e.name === `${stage}.md`) return p;
  }
  return undefined;
}
const stageFile = findStageFile(join(harnessDir, "aidlc-common", "stages")) ?? findStageFile(join(harnessDir, "stages"));
if (!stageFile) done([], `no stage file found for ${stage}`);
const text = readFileSync(stageFile!, "utf-8");

// Act only on the anchor deliverable (first produces entry).
const fm = text.split(/^---$/m)[1] ?? "";
const prodBlock = (fm.split(/^produces:/m)[1] ?? "").split(/^\S/m)[0];
const anchor = (prodBlock.match(/^\s+-\s+([\w-]+)/m) ?? [])[1];
if (!anchor || basename(outputPath!).replace(/\.[^.]+$/, "") !== anchor) done([], "not the anchor deliverable");

const sec = text.split(/^## Exit criteria\s*$/m)[1];
if (!sec) done([], "stage has no exit criteria");
const criteria = sec.split(/^## /m)[0].split("\n").map((l) => l.match(/^\s*-\s+(run|files):\s+(.+?)\s*$/)).filter(Boolean) as RegExpMatchArray[];

const record = dirname(resolve(outputPath!));
const sub = (s: string) => s.replaceAll("{{HARNESS_DIR}}", harnessDir).replaceAll("<record>", record);
const findings: string[] = [];
for (const [, kind, raw] of criteria) {
  const value = sub(raw.replace(/^`|`$/g, ""));
  if (kind === "files") {
    const hits = new Bun.Glob(value).scanSync({ cwd: process.cwd(), onlyFiles: true });
    if (hits.next().done) findings.push(`No file matches ${raw}`);
  } else {
    const r = spawnSync("sh", ["-c", value], { encoding: "utf-8", cwd: process.cwd(), timeout: 240_000 });
    if (r.status !== 0) {
      const msg = `${r.stderr ?? ""}${r.stdout ?? ""}`.trim().split("\n").slice(-15).join("\n");
      findings.push(`Exit criterion failed: ${raw}\n${msg || `exit ${r.status}`}`);
    }
  }
}
done(findings);
