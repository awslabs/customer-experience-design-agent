# ACXD Flow DSL — Node Factories (Phase 1) — DESIGN

The DSL is an ADDITIVE authoring layer above the deploy engine: it does not change the engine's
emitter/orchestration path, it gives the author typed node factories so flows are correct-by-construction
instead of hand-authored node JSON (the class of error the factories exist to remove).

**FlowSpec (declarative authoring) is the default path.** `spec.ts` (`buildFromSpec`) builds a
flow from JSON data by calling these same factories/builders; `build-specs.ts` builds a directory of specs and
runs the cross-flow checks in `../lib/flowset-checks.ts`. Format: `FLOWSPEC.md`. TypeScript authoring scripts
remain a per-flow fallback. Test: `tests/acxd-deploy-engine/flow-dsl/spec.test.ts`.

**Build progress:**
- DONE: `core.ts` - exit-handle model (ExitHandle/NodeResult), typed refs, verified condition builders,
  deriveValueId, uuid.
- DONE: `nodes.ts` - full node-factory inventory: startNode, basicNode, define, userChoice (capture/present
  discriminated union), state-mod setters (setContext/setBoolean/setNumber/clear/increment/decrement),
  generativeJourney (named-exit handles), dataRequest (urlParams + JSON body/payload, nested allowed), redirect (no
  recognized_flow), split, generativeText, knowledgeBaseNode, escalate, terminateNode.
- DONE: `builder.ts` - FlowBuilder (registers factory nodes, auto-attaches referenced slots, wires exit
  handles, ENFORCES edge-completeness at emit — an unwired exit throws with all offenders listed — and
  emits the FlowDoc the engine consumes). `flow(id, aiDescription)` convenience constructor.
- DONE: `roundtrip.test.ts` - self-contained assertion script proving the model end-to-end (run
  `npx tsx flow-dsl/roundtrip.test.ts`). Logic-simulated in Python (sandbox cannot run tsx): 12/12
  assertions pass — 6 nodes, slot auto-attached once, journey wires all 5 exits incl. the NAMED
  humanHandoff, showChoices/displayFormat typed, UUID node ids; an unwired exit THROWS; wiring a
  nonexistent exit THROWS. AND the emitted FlowDoc passes a faithful validateFlowRefs simulation
  (slots attached, context vars in vocab, define-local produced in-flow) — reference-clean, would pass
  the engine's up-front gate.
- DONE: `components.ts` - all five fully-parameterised component builders (buildAuthVerify, buildEscalation,
  buildWelcomeRouter, buildCallback, buildFaqLookup). Domain text is caller-supplied (by
  construction). Each returns a fully-wired, reference-clean FlowDoc; each has a round-trip assertion.
  Two factory gaps were caught + fixed by BUILDING real components: (a) userChoice free-capture had no
  forward exit (added a 'captured' handle for the values:[] case); (b) generativeText conflated display
  name with produced-local id (added `producesLocal` + exposed it on the result, killing a stringly-typed
  reference). Both are the DSL improving itself through use.
- NEXT: wire the DSL into the authoring stage (acxd-flow-build) as the authoring surface, and begin the
  post-DSL rule/warning sweep (authored-value-rules-log.md) to delete the hand-authoring noise the factories
  now make redundant. Phase 2 = graph-composition layer (auto-layout canvasMetadata; edge-completeness is
  already enforced at emit).

PENDING PROOF: `npx tsc --noEmit` + `npx tsx flow-dsl/roundtrip.test.ts` on-device (the sandbox verifies
structure + logic only; the user's local run is the type + runtime proof).

## Purpose

Turn flow authoring from "hand-write node-graph JSON (and get a node's internal shape wrong)" into "call
typed factories that emit correct SDK node shapes by construction." This eliminates — structurally, not via
validator guards — the recurring authored-value bug classes captured in `sdk-direct-refactor-plan.md`
section D and `authored-value-rules-log.md`.

Ground truth for every shape: `knowledge/acxd-platform-agent/acxd-sdk-idl.ts` (PART B + PART C) — the
factories emit exactly those interfaces, and encapsulate every `⚠️ DEVIATES FROM SDK` trap so the author
never meets it.

## The core idea: EXIT HANDLES DERIVED FROM CONFIG

The flagship bug class (Generative Journey named-exit desync, showChoices, disconnected edges) all stem from one thing: the
node's exits and the wired `childNodes` edges are authored SEPARATELY and drift apart. The DSL removes the
possibility:

- Every factory returns a `NodeResult` = `{ node, exits }`.
- `exits` is a set of typed EXIT HANDLES **derived from the node's own config** — a `userChoice` with 3
  value branches yields exactly those 3 value-exit handles plus the standard status handles; a
  `generativeJourney({ exitConditions: [...] })` yields exactly one handle per named exit; etc.
- You cannot invent an exit the node doesn't have, and you cannot forget one the node does have — the
  handle set IS the config.
- Wiring is `handle.to(targetNode)` / `handle.exitApplication()` / `handle.terminate()`. The composition
  layer (phase 2) will REQUIRE every handle be wired (or explicitly terminal) before emit — turning the
  "disconnected edge → Fallback" anti-pattern into a compile-time completeness check.

Phase 1 delivers the factories + handle model + a minimal FlowBuilder that assembles nodes and emits the
`FlowDoc`. Phase 2 adds the graph-composition layer (auto-layout of `canvasMetadata`, edge-completeness
enforcement).

## Phase-1 factory inventory (one per node type we author today)

| Factory | Emits | Bug classes eliminated (section D) |
|---|---|---|
| `startNode()` | type:start | — (structural) |
| `basicNode({ messages, stateMods })` | type:basic | — |
| `userChoice({ slot, capture \| present })` | type:user_choice + ChoiceConfig | #9 choiceDisplayFormat enum (typed), #10 showChoices⇒prompt (discriminated union), #12 capture-only resolved-placeholder (capture sets showChoices:false), slot auto-attach |
| `split({ branches })` | type:split | derives value/ctx branch exits |
| `redirect({ toFlow })` | type:redirect + RedirectConfig | recognized_flow inexpressible (type union excludes it) |
| `define({ name, value })` | type:define + DefineConfig | — (used by setters) |
| `dataRequest({ id, urlParams, body })` | type:data_request + NodeDataRequest | urlParams→URL {placeholders}; body→JSON `payload` (nested objects become nested `recursive` operands); name=id auto |
| `generativeText({ name, prompt, model })` | type:generative_text | modelType enum typed |
| `generativeJourney({ prompt, model, exitConditions, tools })` | type:generative_journey | #6a FLAGSHIP named-exit desync (one handle per exitCondition) |
| `knowledgeBaseNode({ kbName, question })` | type:knowledge_base | {kbName} placeholder handled |
| `escalate()` / `terminate()` / `exitApplication()` | type:escalate/terminate | terminal handles |

### State-modification setters (kill the constant→number/boolean class, #8/#f)
- `setContext(name, ref)` — set a context var from a typed ref (context/local/field/slot).
- `setBoolean(name, literal)` / `setNumber(name, literal)` — AUTO-EMIT the define-node-local pattern
  (ACXD has no "set a literal boolean/number" operand). The author writes `setBoolean('multiPolicyFlag',
  true)`; the factory emits the hidden `define` local + the `{type:local}` state-mod. The constant-into-
  number/boolean shape is simply not reachable through the API.
- `clear(name)` / `increment(name)` / `decrement(name)` — the other verified modifications.

### Typed refs (kill the operand-type class)
- `ctxRef(name)` → `{type:'context', name}` · `localRef(name)` → `{type:'local', name}` ·
  `fieldRef('dr.field')` → `{type:'field', name}` · `slotRef(name)` → `{type:'slot', name}`.
- Payload/urlParams builders take these typed refs — a `constant` string can only come from an explicit
  string literal, never from a number/boolean ref.

## What stays authored (content judgment no factory can generate)
- The TEXT of prompts and messages (a factory can REQUIRE a prompt; it can't write a good one).
- WHICH handler an exit targets (retry / escalation / exit) — the author wires the handle; the factory
  guarantees the handle exists and must be wired.
- The flow TOPOLOGY (which nodes, in what shape) — the graph is the design work; the DSL removes JSON-shape
  reasoning, not design reasoning.

## Component builders (phase-1 tail, after the node factories)
Parameterised whole-flow builders (auth-verify, escalation, welcome-router, callback,
faq-lookup) — e.g. `buildAuthVerify({ slots, maxRetries, escalationTarget })` returns a verified node graph.
Collapses the former component-pattern prose to typed builder signatures.

## Non-goals for phase 1
- Graph-composition layer (auto-layout + edge-completeness enforcement) — phase 2.
- Replacing the engine emitter/orchestration — the DSL PRODUCES the FlowDoc the engine already consumes;
  `create-flows.ts` is unchanged (it still reads `flows/*.flow.json`). The DSL is how those files get
  AUTHORED, deterministically, instead of by hand.
