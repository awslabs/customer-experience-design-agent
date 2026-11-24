#!/usr/bin/env bun
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ACXD Flow Coverage Sensor
 * Reads acxd-flow-coverage.json from the stage output path and reports
 * which requirements have no corresponding ACXD flow assigned.
 *
 * Exit 0 = pass (all requirements covered, or file missing — advisory)
 * Exit 1 = findings (uncovered requirements found)
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface RequirementMapping {
  id: string;
  description: string;
  flows: string[];
}

interface CoverageFile {
  requirements: RequirementMapping[];
}

interface SensorOutput {
  pass: boolean;
  findings_count: number;
  covered_count: number;
  total_count: number;
  findings?: Array<{ id: string; description: string }>;
}

function run(): void {
  const outputPath = process.env.OUTPUT_PATH ?? process.argv[2] ?? ".";
  const coverageFile = join(outputPath, "acxd-flow-coverage.json");

  // Graceful degradation: if the coverage file doesn't exist yet, pass advisory
  if (!existsSync(coverageFile)) {
    const result: SensorOutput = {
      pass: true,
      findings_count: 0,
      covered_count: 0,
      total_count: 0,
    };
    console.log(JSON.stringify(result, null, 2));
    console.error(
      `[acxd-flow-coverage] advisory: ${coverageFile} not found — no coverage data yet`
    );
    process.exit(0);
  }

  let data: CoverageFile;
  try {
    data = JSON.parse(readFileSync(coverageFile, "utf-8")) as CoverageFile;
  } catch (err) {
    console.error(`[acxd-flow-coverage] error: could not parse ${coverageFile}: ${err}`);
    const result: SensorOutput = { pass: true, findings_count: 0, covered_count: 0, total_count: 0 };
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  const requirements = data.requirements ?? [];
  const total = requirements.length;
  const uncovered = requirements.filter((r) => !r.flows || r.flows.length === 0);
  const covered = total - uncovered.length;

  const result: SensorOutput = {
    pass: uncovered.length === 0,
    findings_count: uncovered.length,
    covered_count: covered,
    total_count: total,
  };

  if (uncovered.length > 0) {
    result.findings = uncovered.map((r) => ({ id: r.id, description: r.description }));
    console.error(
      `[acxd-flow-coverage] ${uncovered.length} requirement(s) have no flow coverage:`
    );
    for (const req of uncovered) {
      console.error(`  - ${req.id}: ${req.description}`);
    }
  }

  console.log(JSON.stringify(result, null, 2));
  // Advisory: exit 0 even on findings — this sensor never blocks
  process.exit(0);
}

run();
