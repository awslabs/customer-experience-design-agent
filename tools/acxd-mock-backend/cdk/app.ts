#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * CDK app for the APIs this solution deploys. SHIPPED, FIXED — do not edit per engagement.
 *
 * Deploys ONE parent stack, acxd-<projectName>-<env>-mock-apis, with one nested stack per API. The APIs are the
 * folders under ../apis/ (one per generated OpenAPI file, named by its API id, e.g. apis/authApi). Each API's key
 * is read from .env as the SCREAMING_SNAKE form of <apiId>Key (authApi -> AUTH_API_KEY), written by the API wiring
 * tool with --generate-keys. Everything else comes from the distribution-root .env:
 *   ACXD_PROJECT_NAME, AWS_REGION, ACXD_ENVIRONMENT (default dev).
 *
 * Deploy:  npm run deploy      (no --context flags; values come from .env)
 * cdk-nag is intentionally NOT applied here: synthetic-data, throwaway backend (see ../README.md).
 */
import * as fs from "fs";
import * as path from "path";
import { config as loadDotenv } from "dotenv";
import { App } from "aws-cdk-lib";
import { AcxdMockStack, MockApiDef } from "./stack";

const app = new App();

// Distribution-root .env (the same file the ACXD engine and Connect stack read), resolved relative to THIS file
// (<root>/backend/mock-integration/cdk/app.ts -> <root>/.env). ACXD_ENV_FILE overrides.
const envFile = process.env.ACXD_ENV_FILE
  ? path.resolve(process.env.ACXD_ENV_FILE)
  : path.resolve(__dirname, "..", "..", "..", ".env");
if (fs.existsSync(envFile)) loadDotenv({ path: envFile, override: true }); // .env wins over stale shell exports

// Optional tuning (stageName, memoryMb, timeoutSeconds) at the mock root.
const cfgPath = path.join(__dirname, "..", "mock.config.json");
const cfg: Record<string, unknown> = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};

const fail = (m: string): never => { throw new Error(`${m} (checked ${envFile})`); };
const projectName = (app.node.tryGetContext("mockName") as string) || process.env.ACXD_PROJECT_NAME || fail("ACXD_PROJECT_NAME is not set in .env");
const region = (app.node.tryGetContext("region") as string) || process.env.AWS_REGION || fail("AWS_REGION is not set in .env");
const env = (app.node.tryGetContext("environment") as string) || process.env.ACXD_ENVIRONMENT || "dev";

const screaming = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
const apisDir = path.join(__dirname, "..", "apis");
const apiIds = fs.existsSync(apisDir)
  ? fs.readdirSync(apisDir).filter((d) => fs.statSync(path.join(apisDir, d)).isDirectory()).sort()
  : [];
if (!apiIds.length) throw new Error(`no API folders in ${apisDir} (one apis/<apiId>/ per generated OpenAPI file)`);

const apis: MockApiDef[] = apiIds.map((apiId) => {
  const keyEnv = screaming(`${apiId}Key`);
  const value = process.env[keyEnv];
  if (!value || value.length < 20) {
    throw new Error(`${keyEnv} is not set in .env (or is shorter than 20 characters). Run the API wiring tool with --generate-keys first.`);
  }
  return { apiId, apiKeyValue: value };
});

new AcxdMockStack(app, `acxd-${projectName}-${env}-mock-apis`, {
  mockName: projectName,
  apis,
  stageName: (cfg.stageName as string) || "dev",
  memoryMb: (cfg.memoryMb as number) ?? undefined,
  timeoutSeconds: (cfg.timeoutSeconds as number) ?? undefined,
  env: { region },
});
