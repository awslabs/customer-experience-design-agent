// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Mock EngineClient for deterministic tests — records every command sent and returns canned outputs.
// No live ACXD account. Lets the tests assert creation order, presence=intent branching, and the
// build/deploy poll → terminal-status transition.
// NOTE: lives under plugin-root tests/ (not tools/) so the plugin build does not copy it into installs.
// Imports reach up into the engine at tools/acxd-deploy-engine/.
import type { EngineClient } from '../../tools/acxd-deploy-engine/lib/client';

export interface Recorded { type: string; input: Record<string, unknown>; }

export interface MockOptions {
  // number of GetApplicationBuild/Deployment polls before returning a terminal status
  buildPollsUntilDone?: number;
  deployPollsUntilDone?: number;
  buildTerminal?: string;
  deployTerminal?: string;
}

export function makeMockClient(opts: MockOptions = {}): { client: EngineClient; recorded: Recorded[] } {
  const recorded: Recorded[] = [];
  let buildPolls = 0;
  let deployPolls = 0;
  const buildDoneAt = opts.buildPollsUntilDone ?? 1;
  const deployDoneAt = opts.deployPollsUntilDone ?? 1;

  const client: EngineClient = {
    raw: {} as never,
    workspaceId: undefined,
    withWorkspace(id: string) { return { ...client, workspaceId: id }; },
    async send<T>(command: unknown): Promise<T> {
      const type = (command as { constructor: { name: string } }).constructor.name;
      const input = (command as { input?: Record<string, unknown> }).input ?? {};
      recorded.push({ type, input });
      switch (type) {
        case 'CreateWorkspaceCommand': return { workspaceId: 'ws-mock-001' } as T;
        case 'CreateApplicationCommand': return { applicationId: 'app-mock-001' } as T;
        case 'CreateApplicationBuildCommand': return { buildId: 'build-mock-001' } as T;
        case 'GetApplicationBuildCommand': {
          buildPolls++;
          return { status: buildPolls >= buildDoneAt ? (opts.buildTerminal ?? 'COMPLETED') : 'IN_PROGRESS' } as T;
        }
        case 'CreateApplicationDeploymentCommand': return { deploymentId: 'deploy-mock-001' } as T;
        case 'GetApplicationDeploymentCommand': {
          deployPolls++;
          return { deploymentStatus: deployPolls >= deployDoneAt ? (opts.deployTerminal ?? 'ACTIVE') : 'DEPLOYING' } as T;
        }
        case 'CreateKnowledgeBaseCommand': return { knowledgeBaseId: 'kb-mock-001' } as T;
        default: return {} as T;   // context vars, slots, secrets, tags, data requests, flows, publish
      }
    },
  };
  return { client, recorded };
}
