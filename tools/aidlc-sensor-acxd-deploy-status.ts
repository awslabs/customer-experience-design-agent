#!/usr/bin/env bun
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ACXD Deploy Status Sensor
 * Reads acxd-deploy-status.json from the stage output path and reports
 * whether the most recent ACXD build and deployment succeeded.
 *
 * Exit 0 = pass (both build and deploy SUCCEEDED)
 * Exit 1 = fail (either build or deploy FAILED / still IN_PROGRESS / file missing)
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface DeployStatusFile {
  application_id: string;
  build_id?: string;
  build_status: string;
  deploy_id?: string;
  deploy_status: string;
  build_started_at?: string;
  build_completed_at?: string;
  deploy_completed_at?: string;
  environment?: string;
}

interface SensorOutput {
  pass: boolean;
  build_status: string;
  deploy_status: string;
  application_id: string;
  environment?: string;
  error?: string;
}

function run(): void {
  const outputPath = process.env.OUTPUT_PATH ?? process.argv[2] ?? ".";
  const statusFile = join(outputPath, "acxd-deploy-status.json");

  // Missing file = blocking failure: deployment script has not run yet
  if (!existsSync(statusFile)) {
    const result: SensorOutput = {
      pass: false,
      build_status: "UNKNOWN",
      deploy_status: "UNKNOWN",
      application_id: "UNKNOWN",
      error: `${statusFile} not found — run the deployment script first`,
    };
    console.error(`[acxd-deploy-status] FAIL: ${result.error}`);
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  let data: DeployStatusFile;
  try {
    data = JSON.parse(readFileSync(statusFile, "utf-8")) as DeployStatusFile;
  } catch (err) {
    const result: SensorOutput = {
      pass: false,
      build_status: "PARSE_ERROR",
      deploy_status: "PARSE_ERROR",
      application_id: "UNKNOWN",
      error: `Could not parse ${statusFile}: ${err}`,
    };
    console.error(`[acxd-deploy-status] FAIL: ${result.error}`);
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const buildOk = data.build_status === "SUCCEEDED";
  const deployOk = data.deploy_status === "SUCCEEDED";
  const pass = buildOk && deployOk;

  const result: SensorOutput = {
    pass,
    build_status: data.build_status ?? "UNKNOWN",
    deploy_status: data.deploy_status ?? "UNKNOWN",
    application_id: data.application_id ?? "UNKNOWN",
    environment: data.environment,
  };

  if (!pass) {
    if (!buildOk) {
      console.error(
        `[acxd-deploy-status] FAIL: build_status is "${data.build_status}" — expected SUCCEEDED`
      );
      if (data.build_status === "IN_PROGRESS") {
        console.error(
          "  The polling script may have timed out. Re-run the deployment script to resume polling."
        );
      } else if (data.build_status === "FAILED") {
        console.error(
          "  Check the ACXD console build logs for missing or mis-named resources (slots, data requests, knowledge bases)."
        );
      }
    }
    if (!deployOk) {
      console.error(
        `[acxd-deploy-status] FAIL: deploy_status is "${data.deploy_status}" — expected SUCCEEDED`
      );
      if (data.deploy_status === "FAILED") {
        console.error(
          "  Verify the Connect integration stack is deployed and the Agentic CX block's Workspace/Application/Alias match the deployed ACXD application."
        );
      }
    }
  } else {
    console.error(
      `[acxd-deploy-status] PASS: build SUCCEEDED, deploy SUCCEEDED (app: ${data.application_id}, env: ${data.environment ?? "unspecified"})`
    );
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(pass ? 0 : 1);
}

run();
