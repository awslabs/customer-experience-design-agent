// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Ensure a workspace exists — presence = intent.
// LAYER: EMITTER (ensure — presence=intent: reuse id from .env, else create + write back).
// If ACXD_WORKSPACE_ID is set in .env → reuse it (do NOT create). If blank → create it (synchronous;
// CreateWorkspaceCommand returns workspaceId directly — no GetWorkspace in the SDK), write the id back
// to .env, and let main apply the settle delay. Standalone unit: returns the workspace id.
//
// Create-time NAME resolution (presence = intent, ID vs NAME): the workspace name is user-overridable via
// ACXD_WORKSPACE_NAME in .env — when set it wins; otherwise the config default (cfg.name, which the agent
// derived from the use case) is used. So a user can rename the to-be-created workspace before deploy without
// editing the deploy config. (ACXD_WORKSPACE_ID = reuse an existing one; ACXD_WORKSPACE_NAME = name a new one.)
import { CreateWorkspaceCommand } from 'amazon-connect-acxd-sdk';
import type { EngineClient } from '../lib/client';
import type { Logger } from '../lib/log';
import { envVar, writeEnvVar } from '../lib/env-file';
import { assertValidResourceName } from '../lib/text';

export interface WorkspaceConfig {
  name: string;
  tags?: string[];
}

export interface EnsureWorkspaceResult {
  workspaceId: string;
  created: boolean;
}

export async function ensureWorkspace(
  client: EngineClient,
  cfg: WorkspaceConfig,
  log: Logger,
): Promise<EnsureWorkspaceResult> {
  const existing = envVar('ACXD_WORKSPACE_ID');
  if (existing) {
    log.stage(`workspace: using existing ${existing} (ACXD_WORKSPACE_ID set — not creating)`);
    return { workspaceId: existing, created: false };
  }

  const name = assertValidResourceName('workspace', envVar('ACXD_WORKSPACE_NAME') ?? cfg.name);
  log.stage(`workspace: creating "${name}"`);
  const out = await client.send<{ workspaceId?: string }>(
    new CreateWorkspaceCommand({ name, ...(cfg.tags ? { tags: cfg.tags } : {}) }),
  );
  const workspaceId = out?.workspaceId;
  if (!workspaceId) throw new Error('CreateWorkspace did not return a workspaceId');

  writeEnvVar('ACXD_WORKSPACE_ID', workspaceId);
  log.object(`✓ workspace ${workspaceId} (written to .env)`);
  return { workspaceId, created: true };
}
