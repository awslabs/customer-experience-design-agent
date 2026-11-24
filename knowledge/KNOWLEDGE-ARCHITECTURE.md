# ACXD Plugin Knowledge Architecture

**Read this file first.** It defines how the ACXD knowledge layer is organised, the ground-truth precedence
every other file obeys, and the provenance-tagging contract. The files that reference it are written assuming
you have this framing already in place.

## How this knowledge is organised

The agent does three jobs: make discovery/design decisions, author declarative resources + FlowSpecs to the
verified shape, and present choices to the user. Knowledge is layered so only the relevant tier need load:

- **Persona** (`agents/acxd-platform-agent.md`) — the agent's operating instructions and the knowledge
  load-list. It decides what loads; it is not itself a knowledge file.
- **Tier 1 — Implementation reference** (load when authoring a node/resource): `acxd-node-reference.md`,
  `acxd-variables-and-state.md`, `acxd-sdk-idl.ts`.
- **Tier 2 — Design guidance** (load when designing flows): `acxd-flow-design.md`,
  `acxd-agentic-and-prompting.md`, `acxd-conversation-design.md`.
- **Tier 3 — Architecture principles** (design + review): `acxd-architecture-principles.md`,
  `acxd-counter-intuitive-patterns.md` (the bounded set of ACXD behaviours that violate intuition; read at
  design + build to avoid reasoning back into a known trap).

- **Loaded on demand by a stage** (not in the persona list): `acxd-sdk-idl.ts` (Tier 1, read when authoring
  resources or FlowSpecs), `acxd-sit-method.md` (Tier 2, read at Flow Design Step 9e and Flow Authoring Step 7b),
  and `acxd-dev-mode.md` (Tier 2, read only when dev mode is on).
- **Supporting knowledge** (loaded by the AI-DLC support agents, same provenance rules): `aidlc-shared/acxd-overview.md`
  (platform overview, all agents), `aidlc-developer-agent/acxd-integrations.md`,
  `aidlc-quality-agent/acxd-testing-and-deployment.md`, `aidlc-compliance-agent/acxd-compliance-guide.md`.

### Load order and direction
The persona load list runs from general to specific: this map, then Tier 3 (principles), Tier 2 (design
guidance), then Tier 1 (implementation reference), so the most detailed facts and examples are the last thing
read before the agent acts. Each file follows the same order internally: purpose and rule first, detail and
examples last.
- **Each tier states its concepts at its own level of abstraction.** A higher tier never substitutes a reference
  for the concept ("per Principle 14", "see `<file>`" in place of the idea): when context is summarised, a
  reference survives only as an empty label. State the idea in the tier's own words instead.
- **Shared vocabulary links the tiers.** The same concept uses the same key phrase at every tier (the persona's
  statement, the principle's title and opening line), so the model links them without numbers or file names.
- **Pointers are allowed only where they do work:**
  - *Routing*: a stage tells the agent which on-demand file to read now (keeps that content out of context
    until needed).
  - *Ownership*: one short clause saying where a shape or field list lives ("wire shape: `acxd-node-reference.md`"),
    so the agent does not look for or invent it elsewhere.
  - *Upward pointers* from a lower tier ("design guidance: see `<file>`") add nothing for the model; use only
    where a reader would otherwise apply the detail without its design rule.
- Never depend on a pointed-to file's content to be correct. Each fact has one home.

**Not in the knowledge layer:** the SDK field-names, shapes and gotchas live in the deploy engine as
deterministic code (with an explanatory comment on the enforcing line) and in the typed IDL
(`acxd-sdk-idl.ts`). The engine, not the agent, owns the SDK contract, so SDK reference the agent must not
author against directly is not kept here.

## Ground-truth sources (in precedence order)

1. **[CONSOLE-VERIFIED]** — shapes/behaviour confirmed from a real ACXD console export or a live
   import/validate result. Highest authority: it is what the platform physically accepts. Wins over every
   other source on any conflict about wire shape or accepted behaviour.
2. **[DOC]** — the official AWS ACXD Skill Builder training course (`acxd-aws-skills-builder.docx`).
   Authoritative for concepts, node semantics, design method, conversation design, division of responsibilities.
3. **[NEURA]** — the Neura Amazon-Connect/ACXD specialist agent. Grounded; authoritative for
   design/best-practice and product behaviour. Consulted for design/best-practice decisions.
4. **[SPECIALIST]** — the AWS Specialist SA agent. Authoritative for AWS-wide architecture; for ACXD wire
   shapes it answers from the SDK/API reference (which can differ from the console wire format), so it is
   cross-checked, not taken alone.
5. **[SDK]** — the typed IDL (`acxd-sdk-idl.ts`) + the installed package `dist-types/`. Authoritative for the
   CreateXCommand INPUT contract (a different shape from the console wire format for some fields).

### The standing divergence every knowledge file must respect
The **console import/export wire format** and the **SDK CreateFlowCommand input** are NOT identical for some
fields (e.g. flow slot attach: wire `slots` vs SDK `slotTypes`; user_choice source: wire `source:"slot"`+`slotId`
vs SDK `source:"slotType"`+`slotTypeId`). Knowledge files describe the shape the AUTHOR writes and the ENGINE
consumes — the **wire format** the DSL emits — and note the SDK divergence where relevant. On any wire-shape
conflict, [CONSOLE-VERIFIED] wins.

## Provenance tagging (per fact)

Every non-trivial fact carries a source tag: **[CONSOLE-VERIFIED] / [DOC] / [NEURA] / [SPECIALIST] / [SDK]**.
`[SDK-MODEL]` = read from the SDK Smithy model (same rank as [SDK]). `[GA-GAP]` marks a known platform gap (a
label, not a source).
The tag is a source label, not a decision date — state the verified fact, not how it was arrived at.

**Stage labels (not source tags).** Stages also use bracketed labels to mark questions, inputs or design rows:
`[HUMAN-REVIEW]`, `[HUMAN-IF-UNGROUNDED]`, `[FROM-SOP]`, `[FROM-CONTEXT]`, `[USER-DEFINED]`, `[HARNESS-DEFAULT]`,
`[FIELD-LEARNED]`, `[MOCK]`, `[MOCK CONTENT]`, `[UNTESTED PATH]`, `[VOICE]`. They say how an item is handled, not
where a fact came from, and never replace a source tag.

**Unverified facts.** A fact with no source tag (or one tagged **[UNVERIFIED]**) is anecdotal and ungrounded.
Treat it as additional context ONLY, and rely on it only where no grounded information is available. It never
overrides a tagged fact. **When a substantial decision, design choice, or build step would depend on an
unverified fact, say so explicitly to the user and get their confirmation before proceeding** — never let an
ungrounded fact silently drive a consequential step.

## Conflict protocol
When two sources disagree, do NOT silently pick one. State both, apply the precedence order, mark the
resolution in-line, and surface it to the user when it is consequential.

## The DSL/IDL own shape; knowledge owns intent
The `flow-dsl/` component builders + node factories ARE the authoring reference for flow construction, and the
IDL is the typed shape authority. Knowledge files describe WHEN/WHY (design intent, semantics) and point to the
DSL/IDL for the HOW (exact shape). No knowledge file re-describes a node shape the IDL/DSL already owns.
