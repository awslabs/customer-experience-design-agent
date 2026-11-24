# ACXD Architecture Principles

Conversational-CX architecture practices: the design judgement that experience teaches and that a customer cannot
simply look up. These are PRINCIPLES (context + rule + why), not node mechanics
(`acxd-node-reference.md`) or per-flow design steps (`acxd-flow-design.md`). Governed by
`../KNOWLEDGE-ARCHITECTURE.md`.

Every fact carries a source tag — **[CONSOLE-VERIFIED]** / **[DOC]** / **[NEURA]** / **[SPECIALIST]** / **[SDK]** / **[SDK-MODEL]**
(`[GA-GAP]` marks a platform gap).
An untagged claim is a design principle (our own engineering judgement), not a platform fact. On any platform
conflict: [CONSOLE-VERIFIED] > [DOC] > [NEURA] > [SPECIALIST] > [SDK].

> **How to use this file:** apply these at flow design and flow build. Each principle names where the design
> must RECORD its decision so the choice is explicit and reviewable, never implicit.

---

## 1. Classify every outcome — business negative vs control-plane failure vs user failure

**The single most important principle.** Every node outcome falls into exactly one of three kinds, and each is
handled a DIFFERENT way. Conflating them produces flows that, for example, escalate an empty policy list as if it
were a system error.

| Kind | What it is | How to handle it |
|---|---|---|
| **Business negative** | A SUCCESSFUL response whose meaning is "nothing / no / not found" — KB `no_match`, "account not found", "no policies held", "not eligible" | A designed, first-class path. Tell the customer, offer the next step. **NEVER escalation.** |
| **Control-plane failure** | A technical fault — `timeout` or `failure` on a node that calls out (data_request, knowledge_base, generative_journey, generative_text, Live Sync) | Self-managed by ACXD. Error message → escalation. **No flow-level retry** (see `acxd-node-reference.md`). |
| **User failure** | The caller gave something unusable — `user_choice` No match, unclear input | A bounded re-prompt, then escalation when the bound is reached. |

**Rule:** at flow design, label every node's outcomes against these three kinds. A result that is a valid
business answer gets its own path; only a technical fault reaches the control-plane error path. **Why:** the
three have opposite correct behaviours — retrying a business negative is pointless, escalating one is poor CX,
and re-prompting a system failure spins uselessly. ACXD's `failure` exit carries no error code, so the flow
cannot tell a transient fault from a permanent one — which is exactly why control-plane failures are never
retried at the flow level. [CONSOLE-VERIFIED]

---

## 2. Data Collection — separate from decision, and led by the design lean

The decision floor covers the decision only; how the inputs are collected follows the design lean.
**Test: does this step decide (a verdict, a price, access)?** If yes, the decision is deterministic (a data request
and split). If it only collects input, collection follows the design lean, auth included:
- **Deterministic lean → `user_choice`.** One slot per node, exact Match / No match, fixed paths.
- **Hybrid or agentic lean → Generative Journey with `dataCapture`.** Several slots in natural turns, followed by
  the deterministic step that decides (e.g. the verify data request). Structured data or authentication is not a
  reason to fall back to `user_choice`.

Flow design records the `Collection modality` (`agentic` | `deterministic`) for every input-capturing step, taken
from the lean.

**After a decision, return to the lean.** A deterministic decision (verify, price, approve) is one step, not the
rest of the journey. The conversation about its result (present it, answer questions about it, capture what the
caller wants to do) follows the design lean: in hybrid or agentic mode a Generative Journey that reads the result
from context variables and exits on each outcome; in deterministic mode a `user_choice` with its question.

---

## 3. State lifecycle — every variable has an end, not just a beginning

A context variable needs an owner, a setter, a consumer AND a point where it is cleared. The design-contract
rules already cover the first three; the lifecycle end is the gap that bites.

**Rule:**
- **Clear credentials and one-time values immediately after the step that used them** (a PIN, an OTP, a
  just-verified identifier the flow no longer needs). Do not let them persist in session state.
- **Decide each flag's behaviour on flow re-entry.** A caller who re-enters a flow may still carry
  `authStatus = 'verified'` or a stale selection from earlier — decide on purpose whether that is reused or
  reset, rather than inheriting it by accident.

**Why:** sensitive values lingering in state, and flags silently surviving a re-entry, are both quiet
correctness and privacy defects that never show up in a happy-path test.

---

## 4. Entry guards — a flow defends its own preconditions

**Test: can this node be reached with a value it reads still unset?** A Fallback/Unknown cold entry, or a branch
that skips the setter, are the usual ways. If yes, put a split before it on that value and route the missing case
(e.g. to sign-in). The build's setter and reachability checks find most cases; the cold entry is the one to check
by hand (it is not a Redirect).

---

## 5. Bounded conversations with a way out

**Test: can the caller stay on a path forever, or be unable to reach a person?** If yes, add a bound and an exit:
- Every retry is bounded by a counter and split, including a no-match re-prompt loop back to a `user_choice`:
  after the bound, escalate.
- Every Generative Journey has a human-escalation exit (natural-language escalation prompts are captured in
  discovery; see `acxd-cx-discovery.md`).

---

## 6. Escalation is a handover, not a hang-up

When a conversation escalates, the human agent should receive what the bot already learned, so the caller is not
asked everything again.

**Rule:** before the handoff, set a conversation summary, a **reason code from a fixed enumerated list**, and the
data already captured/verified (names, references, verification status). `buildEscalation` does the summary;
the reason code and captured-data pass-through are the design's job in the flow that escalates. The escalation
flow is a **terminal sink flow** — the escalate variant: it only ever reaches its Escalate node and never
redirects onward (see "Terminal sink flows" in `acxd-flow-design.md` for the full class, incl. the callback
sink). **Why:** re-asking a frustrated caller everything they already provided is the worst moment of most
contact-centre journeys, and a sink that redirects onward can loop a caller back into the journey they were
being removed from.

---

## 7. Latency budget — especially on voice

Silence on a voice call is far worse than a slow chat turn. Latency is a design constraint, not an afterthought.

**Rule:**
- Avoid chaining data requests on a voice turn; prefer one call, or speak before a known-slow call.
- Keep Generative Journey tool lists short — every attached tool adds model deliberation time (the ≤6
  data-requests / ≤2 KBs caps also serve latency).
- Choose the model by channel — a low-latency model for voice.
- `alwaysRetrigger = false` on a GET of static data within a flow is a legitimate latency/backend-load saving
  (see `acxd-node-reference.md` data_request) — a per-API opt-out chosen in discovery, never applied blindly.

**Why:** a correct answer that arrives after three seconds of dead air on a phone call is still a bad
experience.

---

## 8. PII Handling — the model-facing privacy control

Privacy is handled first by design: what the model can see, which slots are sensitive, what is logged. ACXD
guardrails add a runtime check on top, attached at the APPLICATION level (`settings.guardrails`), not as a flow
node. Authored as `resources/guardrails.json` (Resource Creation Step 5c; `GuardrailDef` in the IDL). [SDK-MODEL]

**Rule:**
- **Keep PII out of the model's prompts and tool scope by default.** A Generative Journey sees its prompt, its
  tool outputs and (optionally) the transcript; place names, addresses, card or account numbers or health data
  there only when the task genuinely needs the value, and mark the source slot `sensitive`.
- **Guardrails flag; they do not mask the conversation.** Use an output guardrail that fires only when an actual
  private value is present, not when the bot asks for one. Do not add an input PII guardrail: it would block the
  credentials a journey is capturing.
- **The decision floor still holds** whatever the model sees: no authentication, identity or compliance decision
  is the model's.
- **Any design that routes PII through the model is called out** in the architecture document's security section.
- **Detection method:** prefer `llmJudge` or `keyword`; use `regex` only for a customer-supplied fixed-format
  identifier, never a guessed PII pattern (formats vary by country).

**Why:** limiting what the model sees limits what can leak, and a flag-only output check catches a leak without
breaking the conversation.

---

## 9. Shape values at the API boundary, not in the flow

Callers say "A-C-C one double-oh two", "nineteen ninety-eight" or "yeah"; systems expect `ACC1002`, `1998` and
`true`. A flow captures what the caller says as text and cannot convert it.

**Rule:** the API boundary accepts values in the form the flow holds them. Identifiers match canonically (no
separators in generated ids; the backend trims, upcases, strips separators). A value the caller states (a year,
an age, an amount, a yes/no answer) is a `string` field in an API this solution generates, and the backend parses
it. Values a system produces (prices, levels, flags) keep their real types. For a customer's own API with a typed
field fed by a caller answer, an adapter converts it. **Why:** a format or type mismatch turns a valid caller into
a "not found" or a failed request, and no flow-side workaround is reliable.

---

## 10. Observability by design

You cannot improve what you cannot see. Tagging only "success" milestones hides where callers actually drop out.

**Rule:** tag every milestone and decision point on the success path, and set `escalationReason` on every
escalation and failure path so analytics can segment where and why callers leave (escalate and redirect nodes
cannot carry tags). **Why:** this is what
produces containment rate, drop-out points, and escalation reasons — the business-value numbers an ROI case
needs — rather than only "how many finished".

---

## 11. Test every outcome, not just the happy path

**Test: for each story, can you name the scenario that triggers each outcome kind (Principle 1) and the human
request?** The SIT method (`acxd-sit-method.md`) writes these scenarios and traces them; flow design names the
mock data each one needs.

---

## 12. A Generative Journey's tools and knowledge are its reason to exist — attach by the design lean

Unless the design lean is deterministic, prefer Generative Journeys with data requests and knowledge sources
attached as tools for the caller-facing conversation, so the caller gets a natural, conversational experience
rather than a fixed sequence of deterministic nodes.

A Generative Journey answers off-script only from the knowledge bases and read data requests attached to it as
tools. One with none can capture a slot but cannot answer anything.

**Test, per candidate tool or knowledge base: would a caller on this path reasonably ask something it answers,
and may that caller see the result?**
- **Agentic / hybrid lean:** attach every candidate that passes (default on). Exclude one only for a recorded
  reason: it fails the second half of the test, its description is too weak to call reliably, or tool load (about
  4-6 data-request tools and 1-2 knowledge bases is a guideline; exceed it with a reason rather than split the
  conversation, see Principle 14).
- **Deterministic lean:** attach only candidates with a specific reason.
- **May the caller see it:** a data request qualifies only if it is read-only and returns data scoped to the
  signed-in caller, on a journey after sign-in. One that can return another caller's data needs `[HUMAN-REVIEW]`
  sign-off. A write or compute request is never a tool: it is a deterministic `data_request` node.

The default posture is set in CX Discovery (`[HUMAN-REVIEW]`); flow design presents a per-journey Tool & KB review
(`[HUMAN-REVIEW]`) showing each candidate, attached or excluded with its reason.

---

## 13. Callers at a lower trust level never reach data meant for a higher one — separate the journeys, share the rest

A trust level is how far the flow has confirmed who the caller is. Each level unlocks data meant only for a caller
confirmed to that level: personal or account-specific details, a customer's records, or actions on their account.
General information anyone may see (products, prices, policies, opening hours) needs no level. A flow can serve
callers at different levels: unauthenticated and signed in is the common case; partial identification, step-up
verification and staff versus customer are others. A trust level is set by a deterministic decision (a verify data
request and split), never by a journey.

**Test: can a caller at a lower trust level reach this Generative Journey?** If yes, it must have no data request
attached as a tool, and receive no value from an earlier node, that is meant for a higher level. Give each trust
level its own Generative Journey for agentic data access. Merge the paths again for deterministic nodes wherever
possible, so they are not duplicated. The build checks the signed-in level: it fails a journey reachable both
before and after the node that sets `authFlagVar` when it has a tool listed in `flowset.json` `privilegedTools`, or
its prompt reads an `identityVars` value.

---

## 14. Flow boundaries — keep the conversation together

The caller experiences one continuous conversation and never sees a boundary between flows; a flow boundary goes
only where the conversation can hand over cleanly. **Test: does this part of the use case pass a flow test
(below)?** If not, it is nodes in the use-case flow.

**Requirements are outcomes, not nodes.** A user story, SoP step or requirement describes what the caller must
achieve; it never maps to its own node, journey or flow. The end-to-end design delivers the requirements together,
and the caller should never notice a handover. So a flow has as few Generative Journeys as its reasons allow: one
where there is no sign-in; where there is, one before sign-in and one after. Every extra journey is a handover
that can break the conversation, so it needs one of the node reasons below.

**A use case stays in one flow unless a part passes one of the flow tests below.** Where it uses a Generative Journey, bring the journey forward and let it carry as
much of the conversation as the caller is permitted to have at that point, with every tool and knowledge base
Principle 12 attaches for that caller. The caller has one natural discussion, and later nodes read earlier values
directly.

Inside the flow, start a new node only for a reason the design can name:
1. **A deterministic decision** (the decision floor): authentication verdict, price, eligibility. A data request
   and split, never a journey tool.
2. **A value a later step needs.** Journey tool results cannot be passed on, so fetch it in a data-request node.
3. **A change of trust level.** Callers at a lower trust level never reach data meant for a higher one (Principle 13).
4. **A step whose design lean is deterministic.**

**Flow tests.** A part of the use case becomes its own flow only when it is:
- **A destination reached from several places** that ends the conversation or always continues to the same next
  step (escalation). Redirect is one-way, so nothing that must return to its caller becomes a separate flow.
- **Fallback/Unknown**, which ACXD routes to itself.
- **Size, as a stated exception:** if one flow becomes too large to author or review, split it at one of the node
  boundaries above and record why. Values the next flow needs are set as context variables before the Redirect.

A part that passes none of these stays as nodes in the use-case flow; splitting for any other reason fragments the
conversation.

**Across a handover, carry the conversation.** Where two journeys are both needed, the second starts from what the
first learned: its prompt's `<previous-context>` (Flow Design Step 5) says what was captured, and it never re-asks a value
already captured.

**Naming:** every flow and resource is named in the use-case namespace (`billingMain`, `billingEscalation`), never
`shared…`. Flows and resources are workspace-scoped while use cases are separated by application, so a generic name
collides or misleads. The DSL builders (`buildEscalation`, `buildAuthVerify`, ...) each build a whole flow: use them
only for a separate flow; inside the use-case flow, author the same steps as nodes.

**Sign-in is a node, not a flow.** Declare the context var that the sign-in node sets (e.g. `authStatus`) as
`authFlagVar` in `flowset.json`. The build then treats everything reachable without passing that node as
before sign-in, inside one flow or across flows, for the identity and shared-tier checks.
