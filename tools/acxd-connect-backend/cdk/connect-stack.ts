// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ACXD Connect Integration Stack — CDK (TypeScript)
 *
 *   npm run deploy      (runbook Stage 3)
 *
 * Wires into an EXISTING Amazon Connect instance (CONNECT_INSTANCE_ARN). It never creates, owns, or deletes
 * the instance, so deleting this stack removes only the contact flow, queue, and routing profile it created.
 *
 * Deploys the Amazon Connect resources that wire an Amazon Connect Customer instance to a deployed
 * ACXD application: the integration contact flow, an escalation queue, and a routing profile.
 *
 * The contact flow is NOT hand-authored here. It is the AWS-authored best-practice flow shipped as
 * `mainflow.json` (adapted once from the Agentic CX Designer workshop's MainFlow — flow logging,
 * Contact Lens voice + chat analytics, the Agentic CX block with its four pathways, and the escalation
 * hand-off that carries the agent's handoffSummary back to the contact record). This stack loads that
 * JSON and substitutes only the small set of ACCOUNT-SPECIFIC values as placeholders, then deploys it
 * via `AWS::Connect::ContactFlow`. The agent's job is to supply those values (as CDK context / stack
 * props) — it never authors or regenerates the flow graph.
 *
 * Placeholders substituted into mainflow.json:
 *   __CONTACT_FLOW_NAME__        → `acxd-${projectName}-connect`
 *   __ACXD_WORKSPACE_ID__        → props.acxdWorkspaceId       (ACXD workspace UUID)
 *   __ACXD_APPLICATION_ID__      → props.acxdApplicationId     (ACXD application UUID)
 *   __ACXD_DEPLOYMENT_KEY__      → props.acxdDeploymentKey     (deployment key)
 *   __ACXD_SAMPLE_CUSTOMER_ID__  → props.sampleCustomerId      (optional sample id for the Agentic CX block)
 *   __ESCALATION_QUEUE_ARN__     → the escalation queue ARN (created here, or props.escalationQueueArn)
 *   __ESCALATION_QUEUE_NAME__    → the escalation queue display name (canvas metadata only)
 *
 * The Agentic CX block references the ACXD application by Workspace / Application / Alias. There is NO
 * Amazon Lex bot to provision or reference — the ACXD build stands up the underlying orchestration; the
 * contact flow reaches it through the Agentic CX block.
 *
 * Prerequisites:
 *   - An existing Amazon Connect Customer instance (instance ARN required as input)
 *   - The ACXD application built and deployed first (Workspace/Application ids + alias required)
 *
 * Post-deployment customer steps (see runbook): claim a phone number and point it at this contact flow,
 * create agent users and assign them to the routing profile, set hours of operation.
 *
 * Provenance: [VERIFIED] — contact flow adapted from the GA Agentic CX Designer workshop MainFlow.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as connect from 'aws-cdk-lib/aws-connect';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AcxdConnectStackProps extends cdk.StackProps {
  environment: string;
  projectName: string;
  /** ARN of the EXISTING Amazon Connect instance to wire into (prerequisite; never created here). */
  connectInstanceArn: string;
  /** ACXD workspace UUID (Workspace settings → Advanced). Written back to .env by the deploy engine. */
  acxdWorkspaceId: string;
  /** ACXD application UUID. Written back to .env by the deploy engine on create. */
  acxdApplicationId: string;
  /** ACXD deployment alias (the value the Agentic CX block serves). */
  acxdDeploymentKey: string;
  /** Optional sample identifier pre-filled on the Agentic CX block's Context Variables (test convenience). */
  sampleCustomerId?: string;
  /**
   * Optional: reuse an EXISTING escalation queue ARN instead of creating one. When omitted, the stack
   * creates an escalation queue (default) and a routing profile for it.
   */
  escalationQueueArn?: string;
  /**
   * Hours-of-operation ARN for the CREATED escalation queue (required unless escalationQueueArn is set).
   * An existing resource in the instance, e.g. the built-in "Basic Hours". Supplied via .env
   * HOURS_OF_OPERATION_ARN; find it with `aws connect list-hours-of-operations` (see the runbook).
   * There is no default: Connect hours-of-operation ids are per-instance UUIDs, never a fixed path.
   */
  hoursOfOperationArn?: string;
}

/**
 * ACXD Connect integration — best-practice contact flow (from mainflow.json) + escalation queue +
 * routing profile, wired to a deployed ACXD application via the Agentic CX block.
 */
export class AcxdConnectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AcxdConnectStackProps) {
    super(scope, id, props);

    const {
      environment,
      projectName,
      connectInstanceArn,
      acxdWorkspaceId,
      acxdApplicationId,
      acxdDeploymentKey,
      sampleCustomerId,
      escalationQueueArn,
      hoursOfOperationArn,
    } = props;

    const contactFlowName = `acxd-${projectName}-connect`;

    const instanceArn = connectInstanceArn;

    // =====================================================================
    // ESCALATION QUEUE — create by default, or reference an existing one
    // =====================================================================
    // USER: set hours of operation and assign agents post-deployment.
    let queueArn: string;
    let escalationQueueName: string;
    let createdQueue: connect.CfnQueue | undefined;
    let routingProfile: connect.CfnRoutingProfile | undefined;

    if (escalationQueueArn) {
      // Reuse a customer's established queue. No routing profile is created — the customer already
      // owns the agent routing for that queue.
      queueArn = escalationQueueArn;
      escalationQueueName = 'existing-escalation-queue';
    } else {
      escalationQueueName = `acxd-${projectName}-${environment}-escalation`;
      // The queue needs a REAL hours-of-operation ARN from the instance (ids are UUIDs; a
      // `${instanceArn}/operating-hours/default`-style literal is rejected with "Invalid parameter:
      // HoursOfOperationId"). app.ts requires HOURS_OF_OPERATION_ARN when no queue is reused.
      if (!hoursOfOperationArn) {
        throw new Error('[acxd-connect] HOURS_OF_OPERATION_ARN is required to create the escalation queue ' +
          '(or set ESCALATION_QUEUE_ARN to reuse an existing queue).');
      }

      createdQueue = new connect.CfnQueue(this, 'AcxdEscalationQueue', {
        instanceArn,
        name: escalationQueueName,
        description: `Escalation queue for ACXD ${projectName} (${environment}) — human agent hand-off`,
        hoursOfOperationArn,
        status: 'ENABLED',
      });
      queueArn = createdQueue.attrQueueArn;

      // Routing profile so agents can be assigned to the escalation queue (voice + chat).
      routingProfile = new connect.CfnRoutingProfile(this, 'AcxdRoutingProfile', {
        instanceArn,
        name: `acxd-${projectName}-${environment}-routing`,
        description: `Routing profile for ACXD ${projectName} escalation agents`,
        defaultOutboundQueueArn: queueArn,
        mediaConcurrencies: [
          { channel: 'VOICE', concurrency: 1 },
          { channel: 'CHAT', concurrency: 3 },
        ],
        queueConfigs: [
          { delay: 0, priority: 1, queueReference: { channel: 'VOICE', queueArn } },
          { delay: 0, priority: 1, queueReference: { channel: 'CHAT', queueArn } },
        ],
      });
    }

    // =====================================================================
    // CONTACT FLOW — load mainflow.json and substitute the account-specific placeholders
    // =====================================================================
    // The flow graph (Agentic CX block, four pathways, logging, analytics, escalation hand-off) is
    // fixed best-practice content. We only fill in the values that are specific to this account.
    const templatePath = join(__dirname, 'mainflow.json');
    let flowContent = readFileSync(templatePath, 'utf8');

    const substitutions: Record<string, string> = {
      __CONTACT_FLOW_NAME__: contactFlowName,
      __ACXD_WORKSPACE_ID__: acxdWorkspaceId,
      __ACXD_APPLICATION_ID__: acxdApplicationId,
      __ACXD_DEPLOYMENT_KEY__: acxdDeploymentKey,
      __ACXD_SAMPLE_CUSTOMER_ID__: sampleCustomerId ?? '',
      __ESCALATION_QUEUE_ARN__: queueArn,
      __ESCALATION_QUEUE_NAME__: escalationQueueName,
    };
    for (const [token, value] of Object.entries(substitutions)) {
      flowContent = flowContent.split(token).join(value);
    }

    // Fail fast if any placeholder was left unsubstituted (a missing prop would otherwise deploy a
    // broken flow that only errors at conversation time).
    const leftover = flowContent.match(/__[A-Z_]+__/g);
    if (leftover) {
      throw new Error(
        `mainflow.json has unsubstituted placeholder(s): ${[...new Set(leftover)].join(', ')} — ` +
          `check the stack props (acxdWorkspaceId / acxdApplicationId / acxdDeploymentKey / escalation queue).`,
      );
    }

    const contactFlow = new connect.CfnContactFlow(this, 'AcxdIntegrationContactFlow', {
      instanceArn,
      name: contactFlowName,
      description: `ACXD integration flow for ${projectName} (${environment}) — Agentic CX block, analytics, escalation hand-off`,
      type: 'CONTACT_FLOW',
      content: flowContent,
      state: 'ACTIVE',
    });
    if (createdQueue) contactFlow.addDependency(createdQueue);

    // =====================================================================
    // OUTPUTS
    // =====================================================================
    new cdk.CfnOutput(this, 'ConnectInstanceArn', {
      value: instanceArn,
      description: 'Amazon Connect instance ARN this flow is wired into — claim a phone number here',
    });
    new cdk.CfnOutput(this, 'ContactFlowArn', {
      value: contactFlow.attrContactFlowArn,
      description: 'ACXD integration contact flow ARN — assign a phone number to this flow',
    });
    new cdk.CfnOutput(this, 'ContactFlowName', {
      value: contactFlowName,
      description: 'ACXD integration contact flow name',
    });
    new cdk.CfnOutput(this, 'EscalationQueueArn', {
      value: queueArn,
      description: escalationQueueArn
        ? 'Escalation queue ARN (existing, supplied as input)'
        : 'Escalation queue ARN (created) — assign agents via the routing profile',
    });
    if (routingProfile) {
      new cdk.CfnOutput(this, 'RoutingProfileArn', {
        value: routingProfile.attrRoutingProfileArn,
        description: 'Routing profile ARN — assign agents to this profile',
      });
    }
  }
}
