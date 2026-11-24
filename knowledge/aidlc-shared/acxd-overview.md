# ACXD Platform Overview

> Shared knowledge for **all** AI-DLC agents. Load this before any ACXD plugin stage.

## What ACXD Is

Amazon Connect Agentic CX Designer (ACXD) is a feature of Amazon Connect for building conversational AI experiences on voice and chat channels. [DOC]

**Resource hierarchy:**

- **Workspace** → the top-level container and deployment unit. One workspace compiles to one application. Shared resources (slots, context variables, data requests, knowledge bases, guardrails, secrets, integrations) live at workspace level.
- **Application** → the deployable artifact assembled from flows and resources within a workspace. Exactly one application per workspace.
- **Flows** → directed graphs of nodes that define conversation logic. Two categories: deterministic (fixed paths, auditable) and agentic (LLM-driven via Generative Journey).
- **Nodes** → atomic units of conversation: Basic, User Choice, User Input, Data Request, Split, Redirect, Loop, Generative Text, Generative Journey, Knowledge Base, Escalate. [DOC]

## Platform capabilities and gaps

Known platform gaps are tagged `[GA-GAP]` throughout plugin knowledge:

**What the SDK CAN do (verified against the pinned `amazon-connect-acxd-sdk`; see `tools/acxd-deploy-engine/package.json`):** create every ACXD resource —
context variables, slot types, data requests, knowledge bases, **flows with full node graphs**
(`CreateFlowCommand`), applications, **workspaces** (`CreateWorkspaceCommand`), **secrets**
(`CreateSecretCommand`). Build and deploy are a human step in the console (see the runbook).

**Gaps:**
| Gap | Reality / workaround |
|-----|------------|
| No CloudFormation/CDK *resource types* for ACXD | Use the Node SDK for the ACXD resource lifecycle (CDK is only for the AWS backend). |
| No IAM / SigV4 auth — API key only | API key tokens + rotation procedure. |
| Build & deploy are async, no event/webhook | Poll `Get*Build/Deployment` with timeout + retry. |
| Slot types / data requests / KB: no List/Get + 500 on duplicate | Idempotency helper treats 500 as "exists" for those types. |
| ACXD flow-level metrics only in the ACXD UI | No native CloudWatch export/alerting for flow analytics. |
| Flow-referenced secrets must be selectable in the console | Create via SDK, then verify/bind in the console where a flow references one. |

**SDK rule — no exceptions:** All programmatic operations use the GA Node SDK `amazon-connect-acxd-sdk`. No cURL, no direct REST calls, no pre-release service endpoints. [CONSOLE-VERIFIED]

## Core Concepts

**Turns.** A turn is one exchange: the AI sends messages, then waits for user input. A turn can span multiple flows via Redirect nodes. [DOC]

**Deterministic vs Agentic.** Identity verification, money movement, and compliance gates run on deterministic flows with fixed, auditable paths. Open-ended understanding and complex multi-turn tasks use Generative Journey with tools and knowledge bases. An LLM-judged exit is not a dependable compliance gate. [CONSOLE-VERIFIED]

**Variables.** Five types, distinguished by scope and colour in the UI:

| Type | Colour | Scope | Use |
|------|--------|-------|-----|
| Local / Define | Purple | Flow | Temporary values, counters, boolean constants |
| Slot | Green | Flow | Capture user input (one slot per User Choice node) |
| Data Request | Orange | Session (after fetch) | API response fields |
| Context | Pink | Cross-flow session | Shared state carried across a Redirect |
| System | Teal | Platform-managed | `capturedIntent`, `isVoice`, `channelType`, `transcript` |

**Promotion rule:** Promote a slot or local variable to a Context variable to share it across flows. [CONSOLE-VERIFIED]

**Variable tokens:** Use `{Name:NLX.Type}` syntax via the picker. Hand-typed curly braces render as literal text — always use the variable picker. [CONSOLE-VERIFIED]

## Key Constraints — All Agents Must Know

1. **Build-then-deploy.** The runtime uses the built artifact, not live canvas edits. Rebuild after every change. [DOC]
2. **Description field limits (NOT uniform).** ACXD text fields have DIFFERENT caps: most `description` fields cap at **200** chars, but guardrail (and guardrail-rule) descriptions cap at **100**, the analytics-tag description at **64**, and a flow's `aiDescription` allows **1000** (do not clip it to 200). Author one tight sentence and keep the full version in the resource inventory manifest. The engine enforces the exact per-field limits at pre-flight; the authoritative table is `tools/acxd-deploy-engine/lib/length-limits.ts` (mirrored in `acxd-sdk-idl.ts`). [CONSOLE-VERIFIED][SDK]
3. **Generative Journey prompt discipline.** Generative Journey will not read back tool responses, ask follow-up questions, or end conversations unless its prompt explicitly instructs it to. Every Generative Journey prompt uses the eight tagged sections in Flow Design Step 5 (`<use-case>`, `<persona>`, `<previous-context>`, `<task>`, `<data-to-capture>`, `<tools>`, `<rules>`, `<exit>`). [CONSOLE-VERIFIED]
4. **Flow boundaries.** Keep the conversation together: a new node or flow only for a named reason. Redirect is one-way: values a later flow needs are set as context variables before the Redirect; nothing returns to the caller. [CONSOLE-VERIFIED]
5. **Connect integration.** A single Connect integration stack wires ACXD (into the customer's existing Connect instance, a prerequisite) to Amazon Connect: the contact flow reaches ACXD via the **Agentic CX block** (referencing the ACXD Workspace/Application/Alias), plus an escalation queue and routing profile. You do NOT provision or wire an Amazon Lex bot — the ACXD build stands up the underlying orchestration. The plugin ships this as a fixed CDK stack (`connect-stack.ts` + `mainflow.json`), deployed after the ACXD application. [CONSOLE-VERIFIED]
6. **Observability split.** ACXD has its own built-in analytics (node-traversal rates by analytics tag, conversation volumes, dashboard in the ACXD workspace UI). This is NOT CloudWatch — ACXD analytics live in the ACXD UI only `[GA-GAP]`. Sentiment analysis and call summaries are Amazon Connect Contact Lens (separate service). Backend service metrics (Lambda, API Gateway, DynamoDB) are in CloudWatch. There is no native CloudWatch export for ACXD flow-level metrics at GA. [CONSOLE-VERIFIED]

## Engagement Patterns

CX Discovery qualifies every engagement into one of three patterns:

| Pattern | Description | Scope |
|---------|-------------|-------|
| **Use-Case Lead** | Single use case, deploy and done | `acxd-usecase` |
| **Platform Lead — Single UC** | First use case on a platform that will host more | `acxd-platform` |
| **Platform Lead — Multi UC** | Several use cases, parallel sprint teams | `acxd-platform` |

Each use case owns its flows and resources, named in its namespace.

The engagement pattern gates all downstream decisions: resource grouping, naming conventions, CI/CD complexity, security posture, scope selection, and depth. [CONSOLE-VERIFIED]

7. **Voice persona is set in Amazon Connect, NOT in ACXD.** The TTS voice, speech rate, and voice persona are configured in the Connect contact flow (e.g. UpdateContactTextToSpeechVoice block). ACXD controls the conversational content; Connect controls how it sounds. [DOC]
