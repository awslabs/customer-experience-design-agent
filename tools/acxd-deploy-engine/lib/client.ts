// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// ACXD SDK client factory + a shared send wrapper.
// LAYER: SUPPORT — SDK client factory + send wrapper (no resource knowledge).
// Region + API token come from .env (loaded by dotenv in main.ts). A workspace-scoped client is
// produced with withWorkspace() once the workspace id is known — workspace-scoped resource creation
// needs it, while workspace/account-level ops (CreateWorkspace) omit it.
import { AgenticCXDesignerClient } from 'amazon-connect-acxd-sdk';
import { envVar } from './env-file';

export interface EngineClient {
  raw: AgenticCXDesignerClient;
  workspaceId?: string;
  send<T>(command: unknown): Promise<T>;
  withWorkspace(workspaceId: string): EngineClient;
}

function build(workspaceId?: string): EngineClient {
  const region = envVar('AWS_REGION');
  const apiKey = envVar('ACXD_API_TOKEN');
  if (!region) throw new Error('AWS_REGION is not set in .env');
  if (!apiKey) throw new Error('ACXD_API_TOKEN is not set in .env');

  const raw = new AgenticCXDesignerClient({
    region,
    apiKey,
    ...(workspaceId ? { workspaceId } : {}),
  });

  return {
    raw,
    workspaceId,
    send<T>(command: unknown): Promise<T> {
      return raw.send(command as never) as Promise<T>;
    },
    withWorkspace(id: string): EngineClient {
      return build(id);
    },
  };
}

export function makeClient(): EngineClient {
  return build();
}
