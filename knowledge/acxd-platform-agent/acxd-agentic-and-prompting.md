# ACXD Agentic Design & Prompting

Authoritative reference for ACXD's generative/agentic capabilities: the Generative Journey, generative text,
knowledge bases, agentic tools, prompt structure, and guardrails. Governed by `../KNOWLEDGE-ARCHITECTURE.md`.

Every fact carries a source tag — **[CONSOLE-VERIFIED]** / **[DOC]** / **[NEURA]** / **[SPECIALIST]** / **[SDK]**.
Untagged = ungrounded. On conflict: [CONSOLE-VERIFIED] > [DOC] > [NEURA] > [SPECIALIST] > [SDK].

> **⚙️ READ FIRST:** agentic nodes are authored with the **Flow DSL** factories (`generativeJourney`,
> `generativeText`, `knowledgeBaseNode`) — you do NOT hand-write node JSON. This file owns the DESIGN of agentic
> steps (when to use them, how to prompt, how exits work); `acxd-node-reference.md` owns the node shapes.

## When to go agentic (vs deterministic) [NEURA][DOC]

Use an agentic node for steps requiring judgement, open-ended understanding, flexible ordering, or reasoning
across systems. Use deterministic nodes for steps requiring precision/compliance (identity, money, disclosures).
Both belong in one governed flow — see `acxd-flow-design.md` for the governance principle. [NEURA]

## Generative Journey — the agentic node [DOC][CONSOLE-VERIFIED]

- **Purpose:** complete a multi-step task that may not happen in the same order every time — collect details out
  of order, call tools/Data Requests as needed, decide what to do next, exit via defined outcomes. [DOC]
- **Named exits wire POSITIONALLY** — declare each exit in the prompt in order; the node emits one childNode
  `{System.gjConditionIndex eq <index>}` per exit (0-based, prompt-declaration order) + `timeout` + `failure`.
  The exit NAMES live only in the prompt; the wiring is by index. Never wire a named exit as
  `{node_status eq "<name>"}` (does not bind). The DSL derives exits from the `exits: [{name, prompt}]` array (by index) so they cannot desync. [CONSOLE-VERIFIED]
- **Tools:** a Generative Journey calls Data Requests, Knowledge Bases, and flows-as-tools via its `tools[]` array — this is
  the mechanism that lets the agent query a KB or call a data request at runtime. Prose in the prompt names
  and guides the tools, but prose ALONE does not attach them: the model can only call tools present in
  `metadata.generativeJourney.tools[]`. Author them with the `generativeJourney({tools:[...]})` param; see
  "Agentic tools — what to attach" below for the verified wire shape and the attachment rule set.
  [CONSOLE-VERIFIED]
- **Model:** `modelType` is a node property — a value from the closed `GenerativeModelType` enum (list in `acxd-sdk-idl.ts`). [SDK-MODEL]
  **Default by task:** a Generative Journey (and Multimodal/Live Sync) is REASONING/ROUTING work, so it defaults to the project's **Q1 reasoning model** (Platform Config Step 2); Generative Text defaults to the **Q2 data-collection model**. The user confirms or overrides per node in Flow Design Step 9c. Author the chosen `modelType` on the node; do not leave it unset.
- **Natural-language human-escalation exits:** a Generative Journey named exit may be a plain-English condition captured in
  discovery (e.g. "If the customer sounds frustrated", "If they ask for a human"). These are HUMAN-ESCALATION
  points ONLY — wire each to the shared escalation path, never to another flow. Declare them in the prompt's
  `<exit>` section in order (they wire positionally like any named exit) and list them in `exits: [{name, prompt}]`.
- **Escalation crossing:** promote a flow-local value to a context var to carry it into escalation; escalate on
  the CALLER's signal (asks for a person / out of scope), NOT on a tool error/timeout/missing info. [DOC]

## Generative Journey prompt framework [CONSOLE-VERIFIED][DOC]

Every Generative Journey prompt uses the eight tagged sections in Flow Design Step 5: `<use-case>`, `<persona>`,
`<previous-context>`, `<task>`, `<data-to-capture>`, `<tools>`, `<rules>`, `<exit>`. In `<exit>`, each named exit
the prompt mentions must match the node's `exitConditions[{name, prompt}]` by name; array order is the index.
[SDK-MODEL + CONSOLE-VERIFIED]

## Agentic auth capture — Generative Journey dataCapture feeding a deterministic verify [CONSOLE-VERIFIED for dataCapture shape]

When the Agentic Design Principle is `hybrid`/`agentic` and the customer accepts it, collect multiple identity factors in ONE
natural turn instead of sequential `user_choice` prompts — WITHOUT moving the auth DECISION off a deterministic
mechanism. Pattern:

1. A **Generative Journey** with `dataCapture: [{required:true, type:'slot', name:'accountNumber'}, {required:true,
   type:'slot', name:'pin'}]` elicits both factors conversationally ("tell me your account number and PIN") and
   takes its `captured` exit only once both required slots are filled. The `captured` exit is separate from the
   named exits (wire shape: `acxd-node-reference.md` generative_journey). [CONSOLE-VERIFIED]
2. The `captured` exit flows into the **SAME deterministic verify** used by `buildAuthVerify`: the verify
   `dataRequest` (reads the captured slots via urlParam tokens) → `Verified?` `split` on the response → mark
   verified / retry / escalate.

**The decision floor holds:** the Generative Journey does COLLECTION only; the deterministic verify data request + split makes
the pass/fail DECISION. The LLM never adjudicates identity. Attach both slots (a Generative Journey dataCapture slot is NOT
auto-attached — attach it explicitly). Retry: on a `Verified?`-fail the deterministic path re-elicits (re-enter
the Generative Journey or fall back to a `user_choice` re-prompt) and increments the attempts counter as usual.

Use the sequential `user_choice` capture (via `buildAuthVerify`'s `secondFactorSlot`) for deterministic
collection; use this Generative-Journey-dataCapture front-end for agentic collection. Choose per the flow's design-lean
(flow-design Step 9b).

**How it is built:** `buildAuthVerify` is deterministic-only, so the agentic version is a **bespoke node-factory
flow** that reproduces the builder's verify / retry / escalate structure with the Generative Journey in place of the two
`user_choice` capture nodes. Set captured account data (e.g. `accountRef`) on **Mark verified** only, never on
the verify data request. [UNVERIFIED] The Generative Journey re-entry-on-retry behaviour in this bespoke auth
flow is not yet confirmed on a live deploy; verify it against a console export before relying on it.

## Generative Text — single-shot generation [DOC][CONSOLE-VERIFIED]

- **Purpose:** dynamically create / rewrite / summarize / classify / format text in ONE step; output stored as a
  local. No multi-turn reasoning, no tool orchestration. [DOC]
- **Config:** `{modelType, name (= the produced local), prompt, maxTokens, temperature}`; exits
  `success/timeout/failure`. Read the produced local downstream via `{name:NLX.Local}`. [CONSOLE-VERIFIED]
- **Typical use:** summarise the conversation for a human agent before escalating (exclude PII). [CONSOLE-VERIFIED]

## Knowledge Bases [DOC][CONSOLE-VERIFIED]

- **Two ways to answer from a KB:** (a) a dedicated `knowledge_base` node (deterministic Q&A step); (b) a KB
  attached to a Generative Journey as a tool (agent decides when to consult). [DOC]
- **KB resource:** a `documents` or `articles` knowledge base (fields: `KnowledgeBaseDef` in `acxd-sdk-idl.ts`).
  It must be PUBLISHED before flows can use it; the engine publishes on create. [CONSOLE-VERIFIED]
- **Verbatim vs summarise** is a per-KB mode — use verbatim for compliance-sensitive content. [DOC]
- **Engine resolves `{kbName}`** — the DSL authors a `{kbName}` placeholder; the engine maps it to the KB's
  server UUID at create time (the flow author never hard-codes a UUID). [CONSOLE-VERIFIED]

## Agentic tools — what to attach [DOC][CONSOLE-VERIFIED][NEURA]

Tools give a Generative Journey capability beyond conversation. A Generative Journey that exists to let a customer DIVERGE from the scripted
flow (ask general questions, discover knowledge) should be equipped for that divergence, not just its narrow
task — but equipped SELECTIVELY, because too many or poorly-described tools degrade selection accuracy.

**Tool kinds:**
- **Data Request** — retrieve/send info from an external system.
- **Knowledge Base** — answer from approved content.
- **Flow-as-tool (MCP-enabled flow)** — invoke a structured workflow while the agent stays in control (preferred
  flow-tool pattern); vs a **handover flow** that takes deterministic control until it redirects back.

**Wire shape:** `acxd-node-reference.md` generative_journey (tools). Author tools with the
`generativeJourney({tools:[{kb,prompt}|{dataRequest,prompt}]})` DSL param; array order is selection priority, and
the engine resolves `{kbName}` to the KB id. [CONSOLE-VERIFIED]

**The Generative Journey tool-attachment RULE SET** (apply when deciding what to attach — enforced at flow design):
1. **Caps (soft guardrails):** data-request tools **≤ 6** per Generative Journey (aim 4–6); knowledge bases **≤ 2** (aim 1–2).
   Beyond the cap, attach ONLY the top-ranked resources (rule 3 ordering).
2. **Description-quality gate (per tool, before attaching):** attach only if BOTH (a) plausibly relevant to
   off-script/divergent queries this Generative Journey could field, AND (b) its description (this tool `prompt` + the
   data-request/KB description) is sharp and unambiguous enough the model won't misfire. Low-relevance OR
   low-description-accuracy tools are NOT attached.
3. **Order-aware placement:** the `tools[]` array order IS the selection priority (the ACXD UI's tool up/down
   position). Attach in descending relevance×description-clarity — sharpest/most-relevant first; a weak-but-
   passing tool goes last; never place a low-relevance/ambiguous tool ahead of a clearly-defined one.
4. **Framing test:** ask "could a diverging user ask something this tool/KB serves", not "does this Generative Journey's task
   need it". General GET/list (no required filter) are divergence-rich — subject to rule 2 AND a PII/side-effect
   check: an unfiltered list can expose other customers' data, so confirm the request is access-scoped and
   read-only before attaching. ("GET-style" is not automatically side-effect-free.) [NEURA]
5. **Per-tool prompt is mandatory:** every attached tool gets a real one-line usage hint (when to call, what it
   returns, what to do on no-answer). An empty prompt deploys but is a rule-2 failure — never ship one. [NEURA]

## Guardrails [DOC]

Guardrails evaluate user input or AI output at runtime for safety/compliance/brand. Shape (verified export):
`trigger` (input/output) + `rules[].enforcement.behavior.prompt|message` + `detection.method: llmJudge`.
Place guardrails as a cross-cutting control; capture PII handling, prohibited/regulated topics, and
escalate-instead-of-answer rules in discovery. [DOC][CONSOLE-VERIFIED]

### PII Handling (the model-facing control)

The rule lives in the **PII Handling** principle (`acxd-architecture-principles.md`). In short: keep PII out of the model's prompts/tools by default; when the model needs a value, pass only that
and mask the rest with an ACXD application-level guardrail; the decision floor still means the model never makes
an auth/identity/compliance decision; and any PII-through-model design must be a named security section in the
architecture document.

## Analytics tags on agentic nodes [CONSOLE-VERIFIED][DOC]

A Generative Journey (and other nodes) may carry `metadata.tags:[{label}]` — conversation-milestone **analytics** tags (distinct
from resource tags; see `acxd-variables-and-state.md`). Three defaults ship (`automated`/`helpful`/
`not_helpful`); Escalation Rate is a free dashboard metric (don't tag for it). Tag labels are camelCase,
event-named, placed on nodes (not retroactive). [CONSOLE-VERIFIED][DOC]

## Voice provider [DOC][NEURA]

For agentic voice, **Amazon Connect agentic voice** is the AWS-recommended provider (NOT Polly, NOT Nova Sonic);
`mainflow.json` uses `AMAZON_AGENTIC_VOICE`. The TTS voice persona is set in the Connect contact flow's Set Voice
block, NOT in ACXD. Locale set there auto-propagates to ASR. [NEURA][DOC] (Detail in
`acxd-conversation-design.md`.)

## Component builders emit these patterns

The verified agentic component patterns (agentic servicing journey, escalation-with-summary, FAQ/KB lookup) are
IMPLEMENTED as DSL component builders (`buildEscalation`, `buildFaqLookup`, and the journey factory), not
re-described as pattern prose. Author them by calling the builders. [CONSOLE-VERIFIED]


## Handover between Generative Journeys

One journey is the default: keep the conversation together. When two are needed, the second journey's `<previous-context>` (Flow Design Step 5)
says what the first one did and which values it set. Where the first journey has gathered more
than the captured slots carry (what the caller asked, preferences, concerns), it may hand over a short summary:
a string context var `conversationSummary` (one or two sentences), referenced in the next prompt as
`{conversationSummary:NLX.Context}`. The summary only smooths a handover that has a reason; it is never a reason to
split a journey. [UNVERIFIED: how a journey sets a context var from the conversation; if it cannot, a Generative Text
node can write the summary before the handover.]
