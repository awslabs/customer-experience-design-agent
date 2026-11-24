# ACXD Flow Design

Authoritative reference for designing ACXD flows: architecture, invocation, default flows, flow boundaries, the
deterministic-vs-agentic decision, and the one-way redirect model. Governed by `../KNOWLEDGE-ARCHITECTURE.md`.

Every fact carries a source tag — **[CONSOLE-VERIFIED]** (proven from a real console export / live import) /
**[DOC]** (official Skill Builder course) / **[NEURA]** / **[SPECIALIST]** / **[SDK]** (SDK digest / IDL). An
untagged claim is ungrounded. On conflict: [CONSOLE-VERIFIED] > [DOC] > [NEURA] > [SPECIALIST] > [SDK].

> **⚙️ READ FIRST — how flows are authored here:** you compose flows by calling the **Flow DSL** factories
> (`tools/acxd-deploy-engine/flow-dsl/`) — component builders + node factories + `FlowBuilder`. You do NOT
> hand-write node-graph JSON and you do NOT call the SDK; the DSL emits the verified wire shape and the deploy
> engine creates the flows at deploy time. This file is the DESIGN layer (what flows to build and why); the DSL
> is the authoring mechanism; `acxd-node-reference.md` owns per-node semantics. No shape is duplicated here.

## What a flow is

A flow is a structured conversation path for one user goal/task — a graph of nodes with a `flowId`, optional
routing data (an `aiDescription` for intent recognition), attached slots, and variables. Flows together form
the application's conversation logic. [DOC]

## How a flow is invoked (four ways) [DOC]

1. **User-invoked** — the user's utterance matches the flow's routing `aiDescription` (intent recognition).
2. **Application default** — the flow is assigned to a default role (Welcome / Fallback / Unknown / Escalation).
3. **Redirect** — another flow deliberately transfers control via a redirect node (one-way).
4. **Agent tool** — the flow is exposed as a tool an agentic node may call.

**Routing data (`aiDescription`):** enable routing + give a specific, action-oriented description ("A flow that
updates an existing hotel reservation for a guest") so intent recognition knows when to invoke it. Leave routing
blank ONLY when the flow is reached solely as an application default or via a forced redirect. [DOC]
An empty `aiDescription` on a routable flow makes it silently unreachable — NLU can't route to it. [CONSOLE-VERIFIED]

## Application default flows [CONSOLE-VERIFIED][DOC]

An application maps four default roles; the SDK `DefaultFlows` keys are `welcome`/`fallback`/`unknown`/
`escalation` (plus `frustration`/`help`/`repeat`/`resume`). The console labels the incomprehension default
"Incomprehension"; the SDK key is `escalation`. [CONSOLE-VERIFIED]
- **`welcome` is REQUIRED** once the application has attached flows — the API rejects an app with flows but no
  welcome default ("This application has flows but no default welcome flow"). [CONSOLE-VERIFIED]
- Canonical mapping: `welcome` and `fallback`+`unknown` → the use-case flow (its first Generative Journey is the
  catch-all); `escalation` → the escalation flow. [DOC]

## Flow architecture and naming

- **Flow boundaries — keep the conversation together:** the caller experiences one continuous conversation, so a
  use case stays in one flow unless a part passes a flow test; greeting, sign-in, servicing and decision steps are nodes.
- The **agentic servicing journey** (a Generative Journey) is the catch-all — map it to fallback/unknown; do NOT author a separate
  "nothing matched" flow. [DOC]
- **Each use case owns its flows and resources.** Flows and resources are workspace-scoped while use cases are
  separated by application, so nothing is shared across use cases and nothing is named `shared…`.
- **DSL builders** (`buildEscalation`, `buildCallback`, and others in `flow-dsl/DESIGN.md`) build a whole flow: use them only for a separate flow; inside the use-case flow author the same steps as nodes.
- **Build order:** author any flow that is a Redirect target before the flows that redirect to it. [CONSOLE-VERIFIED]
- **Naming:** use-case namespace (`billingMain`, `billingEscalation`); camelCase, letters only, no digits/hyphens (see
  `acxd-variables-and-state.md` for the full naming rule). [CONSOLE-VERIFIED]

## Conversation termination — a per-use-case decision [DOC][NEURA]

Decide per use case in discovery: does the conversation END in ACXD or RETURN to Connect?
- **Exit application** node → terminal, ends the session inside ACXD (FAQ resolved, self-service complete). [DOC]
- **Return to Connect** → the Agentic CX block routes on the exit condition ACXD returns; the **escalate** node
  is the human-handoff mechanism (with a continuation path back). Use when Connect must route further (queue,
  transfer, more IVR). [DOC][NEURA]

## Terminal sink flows — a declared class [CONSOLE-VERIFIED + design judgement]

Some flows exist ONLY to be a dead-end that other flows redirect INTO: a caller is sent there to be
handed off or to have a request recorded, and the conversation does not come back. `billingEscalation` is the canonical example. These form a **declared class — a terminal sink flow** — defined by its exit contract:

1. It is a **redirect target** — other flows hand control into it (via redirect, or as a default flow).
2. It **MUST NOT redirect onward** to any other flow — not explicitly (a `redirect` node) and not implicitly
   (being the Fallback/Unknown flow, or having routing enabled). This is the critical loop-prevention property
   and the DEFINING rule of the class.
3. **Every path ends in a terminal node** — an `escalate` or a `terminate`. A sink MAY mix the two (e.g.
   `terminate` on the happy path, `escalate` on an error/capture-fail path); it is not required to use only one
   kind. What it may never do is leave a path on a non-terminal node or send one onward via redirect.
4. It has **no unconnected exit edges** — every internal path converges on a terminal node. (The one allowed
   dangling edge anywhere is data_request `in_progress`.)

**Two exit variants (named by their PRIMARY/happy-path exit — a sink may still escalate on an error path regardless of variant; rules 1-4 are identical):**

| Variant | Single exit | Terminal action | Example |
|---|---|---|---|
| **Escalate sink** | the **Escalate** node | hand to Amazon Connect — a human agent, OR Connect's native queued-callback (see below) | an escalation flow; a callback flow (native mode) |
| **Record-then-terminate sink** | a **data_request → `terminate`** | write the request to an external system (DynamoDB/CRM), then end the ACXD session | a callback flow (external mode) |

**Callback is a sink with a real fulfilment — never an acknowledge-only dead-end.** A flow that tells the caller
"we'll call you back" and then just ends, with no escalate and no data_request, is a BROKEN sink (it promises an
action nothing performs). A callback sink MUST either:
- **Native queued callback (voice only):** capture the callback number into a context var, then **Escalate** —
  the Connect contact flow downstream of the Agentic CX block runs `Set Customer Callback Number → Transfer to
  Queue (Callback tab)`, i.e. Connect's native queued callback. Native callback is a **telephony dial-out**
  primitive, so it is **voice only** — there is no native "call back on a chat thread". [SPECIALIST: Amazon Connect]
- **External system (any channel, incl. chat; required for scheduled/windowed callbacks or a trackable list):**
  capture number (+ desired window) → a **data_request** writes it to an external system → an external scheduler
  dials later via `StartOutboundVoiceContact`. For **chat**, this is the only option — a chat "call me back" is a
  cross-channel request (chat in, voice out) fulfilled by the external pattern. [SPECIALIST: Amazon Connect]

**Opt-in, never inferred.** A flow is a sink only when the design DECLARES it one. Do NOT infer the sink contract
from "it is a redirect target": a flow with several onward exits is not a sink. The defining test is **one
sanctioned exit AND never redirects onward**. A flow with branching onward outcomes is not a sink.

## Closed resource vocabulary (design-time rule) [CONSOLE-VERIFIED]

A flow may reference ONLY resources that exist — context variables, custom slot types, data requests defined in
`resources/*.json` (see `acxd-resource-inventory.md` for authoritative names). Referencing a name that was not
created is the top cause of the post-deploy "references X, but X is not attached / no longer defined"
notifications. Register control-flow vars (retry counters, gate flags) too, not just business-data vars. [CONSOLE-VERIFIED]

## Conversation-design concerns

Persona, error-recovery architecture, silence handling, confirmation patterns, channel/voice strategy, and CX
KPIs are owned by `acxd-conversation-design.md` — not duplicated here.
