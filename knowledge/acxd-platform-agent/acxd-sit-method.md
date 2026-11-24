# CX Systems Integration Test (SIT) Method

Two tests share this method. **Part B, Architecture SIT** runs first, in Flow Design Step 9e, on the design before
anything is built. **Part A, Build SIT** runs in Flow Authoring Step 7b on the built flows. In both: judge only from
evidence, report before fixing, a gap the evidence shows is FAIL, loop at most the stated rounds, then the human
decides at the gate. Governed by `../KNOWLEDGE-ARCHITECTURE.md` (Tier 2, loaded on demand by the two SIT steps).

## Part A: Build SIT (Flow Authoring Step 7b)

While running it, act as an independent
reviewer: test what was BUILT, not what was intended, and judge only from the trace output. Do not fix flows while
testing; report first, then fix as Step 7b directs.

## Inputs (all from the project, nothing pre-written)

- **Approved user stories:** `acxd-user-stories.md` (User Stories stage record). Stories and acceptance
  criteria are the test cases.
- **Story Trace:** the Story Trace section of `acxd-flow-architecture.md` (Flow Design). It is the test plan:
  entry path, expected flows, data requests, where the outcome is delivered, caller trust level.
- **Built flows:** `flows/*.flow.json` and `flows/flowset.json` (Flow Authoring output).
- **Test data:** the seeded mock records (`backend/mock-integration/apis/*/data/*.json`) or, without a mock, the
  examples in the OpenAPI schema in `customer-context/`.

## Tools (deterministic; use them instead of reasoning about the flows)

- `npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/trace-cli.ts <flowsDir> --inputs` lists every user-choice
  slot and value id, Generative Journey exit and captured slot, split condition and data request, by flow.
  Bind every scenario to these exact names. Never guess a slot or value name.
- `npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/trace-cli.ts <flowsDir> <scenarios.json>` runs scenarios
  and prints each path, every Redirect with the context carried across it, the end state, and for each
  Generative Journey reached its tools and the value of every context token at that moment.
- `npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/trace-cli.ts <flowsDir> --prompts` prints every
  Generative Journey's built prompt, by flow and node.

## Method

1. **Write scenarios.** For each story, write the happy path plus each failure path its acceptance criteria name
   (wrong credentials, data request timeout/failure, not found, out of scope). Save them to
   `sit/<storyId>.scenarios.json` in this stage's record dir. A scenario sets: `entry`, `slots` (from `--inputs`),
   `dataRequests` as `{ "<dataRequestId>": { "status": "success" | "timeout" | "failure", "response": {...} } }`
   (from the test data), `journeys` exits. The tracer rejects any other key, so a typo fails loudly instead of
   tracing a default success.
   - **A `user_choice` slot takes a VALUE ID from `--inputs`** (e.g. `billingPaymentMade`), never the raw word
     (`accepted`): choice branches match on value IDs, so a raw word leaves the trace stuck.
   - **A node visited more than once** (a retry loop, a route back to the start) takes a LIST of exits, used one
     per visit with the last repeating, e.g. `"journeys": { "billingMain/Quote conversation":
     ["needsIntent", "data_captured"] }`. A single exit is reused on every visit and can loop forever.
   - Counters (`increment`/`decrement`) are modelled, so a retry limit (e.g. three wrong PINs, then escalation)
     can be traced: give the verify request a failing response and the trace walks the loop to its limit.
2. **Trace.** Run the tracer per story file. Do not re-derive the path yourself.
3. **Judge each acceptance criterion** from the trace output only, with exactly one of three verdicts:
   - **PASS**: a trace fact shows it (routing, Redirects, end state, a context value set when a node is reached),
     or the narrow Generative Journey check below answers yes.
   - **FAIL**: a trace shows the outcome missing (wrong end state, value UNSET at the node that delivers it,
     the journey lacks the information, a privileged tool on a shared-tier journey).
   - A gap the trace CAN see is FAIL, never NOT TRACED: no node sets the value, no path reaches the node, or no
     input makes the outcome happen. Fix the design; do not move it to live testing.
   - **NOT TRACED**: the criterion cannot be shown by a trace. Give the reason, one of: *not walked* (no scenario
     reached it), *structural only* (the edge exists but no trace walked it), *configuration only* (a prompt or
     setting says it will happen), *runtime only* (guardrails, model judgement, voice, wording). These are the
     items for live testing on the deployed solution.
   Never write "PASS (structural)" or "PASS by configuration": a claim the trace does not show is NOT TRACED.
   - Routing, Redirects, end state and context values are FACTS from the trace: PASS/FAIL directly.
   - For a Generative Journey step, ask ONE narrow question and answer only it: *"Generative Journey <node>.
     Context: <tokens and values from the trace>. Tools: <list>. Prompt: <prompt>. Does the node have the
     information needed for: <acceptance criterion>? Answer yes or no, and name what is missing."* Do NOT imagine
     the conversation or write what the caller would hear. Information present = yes; you are not testing
     wording or model quality.
   - Check shared-tier journeys: a journey an unauthenticated caller can reach must have no privileged tool and
     no privileged value in its prompt: FAIL otherwise (the build already blocks both).
   - Check each story's outcome against the Story Trace row: if the trace says the outcome is delivered through a
     context var or node, the trace must show that var set (not UNSET) when that node is reached on the story's
     path. A value set in one flow and never read again (a dead-data or dead-state warning) is usually this FAIL.
   - **Shown, not just computed.** When a criterion says the caller is shown, told or given something (a summary,
     a price, a reference), PASS only if a message on the traced path shows it: the message text, or a
     `{<local>:NLX.Local}` / `{<var>:NLX.Context}` token in it whose value is set at that point. A Generative Text
     node shows nothing by itself, so reaching it is not evidence. A value that is set but never shown is a FAIL.
3b. **Conversation narrative test** (one per traced path that visits a Generative Journey). Take the journeys the
   trace visited, in order, and read their prompts **from the built `flows/*.flow.json`** (`--prompts`), never from
   the design spec, as one conversation. Judge:
   - **Sections:** each prompt has all eight sections, each specific to this journey: FAIL if one is missing,
     empty or generic (e.g. a `<task>` that does not name the questions to ask).
   - **Completeness:** every field a data request on the path needs is collected by some journey before it.
   - **Overlap:** two journeys on the path own the same field or topic: FAIL.
   - **Re-ask or contradiction:** a journey asks for a value already captured, or says it does not need something
     an earlier journey asked for: FAIL.
   - **Previous context:** each `<previous-context>` matches what the trace shows the caller did and which values
     are set; a claim not on the path, or something on the path left out: FAIL. Every `{x:NLX.Context}` token in
     the prompt is described there and is set on that path at that point: FAIL otherwise.
   - **Merge candidate:** journeys on the path that meet a Flow Design Step 5 merge test with no recorded reason: FAIL.
   Record one row per path (journeys in order, verdict, finding). Wording and tone stay on the Live test list.
4. **Report.** Write `acxd-sit-results.md` in this stage's record dir:
   - a table: story, acceptance criterion, scenario, PASS / FAIL / NOT TRACED, evidence (the trace line or context
     value; for NOT TRACED, the reason and what to test live);
   - a short **Live test list**: every NOT TRACED criterion, phrased as a test to run on the deployed solution;
   - a **Design findings** list: every finding recorded as intended in `flowset.json` (`unusedFields`,
     `externalReads`), with its reason, so the gate reviewer sees each decision;
   - for each FAIL, one plain fix instruction naming the flow and what is missing, for example: "`billingMain`
     calls `getBalance` but promotes nothing; the signed-in journey has no balance. Promote `balanceDue` to a
     context var after the call and add it to the journey's `<previous-context>`.";
   - a **Fixed during SIT** section: before you overwrite the table, append one line for every build finding and
     every FAIL from that round that you then fixed (round, story or check, finding, fix made). Never overwrite
     this section; it shows the reviewer what failed first, not only the final result;
   - a one-line iteration log entry at the bottom for EVERY build or SIT round (round number, date, open findings, pass / fail / not traced counts). Overwrite the table on each run;
     keep the Fixed during SIT lines and the log lines from earlier runs.
5. **Verdict.** A story PASSES only when every one of its criteria is PASS; it FAILS if any criterion is FAIL;
   otherwise it is NOT TRACED. No FAIL: READY. Any FAIL: NOT READY, with the fix list. The FIRST line of
   `acxd-sit-results.md` is a fixed, machine-readable verdict line:
   `SIT: <pass>/<total> pass, <fail> fail, <notTraced> not traced — READY` (or `— NOT READY`).
   The findings are shown at the approval gate; the human decides.
6. **Architecture faults are not patched here.** If the fix for a FAIL would add, remove or merge a flow or a
   Generative Journey, or move a data request to a different flow, do not make it. Mark the criterion
   **FAIL (architecture)**, give the verdict NOT READY, and state the change in the fix list as "return to Flow
   Design: <change>". The human decides at the gate whether to reopen Flow Design.

## Progress in chat (keep it brief)

Emit one short line as you go, so the user sees the test running:

- `🧪 Build SIT: <n> stories, <m> scenarios`
- `🧪 <storyId> · <scenario> · <flowA → flowB → flowC> · ✓` or `· ✗ <what is missing>` or `· ○ not traced (<reason>)`
- `🧪 Build SIT result: <pass>/<total> pass, <fail> fail, <notTraced> not traced` then the table location.

No other narration.

## Limits

- You test that paths are reachable and that each journey has the information it needs. You do not test
  conversation quality; live testing on the deployed solution is still required.
- The build's cross-flow checks follow Redirects only. A Fallback/Unknown flow entered cold, and values a
  Generative Journey tool fills at runtime, are invisible to them: cover both with scenarios here.
- A design gap belongs to Flow Design: report it as FAIL (architecture) (item 6), including when the Story Trace
  itself has no outcome.


## Part B: Architecture SIT (Flow Design Step 9e)

Inputs: the approved user stories, the SoP, and this stage's `acxd-flow-architecture.md`, `acxd-variable-map.md` and
`acxd-prompt-specs.md`. Judge from what the artifacts state, not from intent.

**The six tests.** One row each, with evidence (the table row or section that shows it):

| # | Test | PASS when |
|---|---|---|
| 1 | Flow boundaries: keep the conversation together | every flow in the Flow-Set Summary names the flow test it passes |
| 2 | Fewest journeys: keep the conversation together | each path has one journey, or one before and one after sign-in; any extra names its node reason |
| 3 | One conversation (Step 5) | the merge review and conversation script show no back-to-back journeys, repeated capture or repeated topic without a recorded reason, and every prompt spec has all eight sections (Step 5) |
| 4 | Data requests in order (Step 1c) | each data request sits after the nodes that set its inputs, on every path, and before the nodes that use its outputs; no input or business rule was dropped |
| 5 | Deterministic decisions: decision separate from collection | every verdict, price and access decision is a data request plus split, never a journey |
| 6 | Every story delivered (Step 9d) | every story row names where its outcome is delivered, on the path the story's caller takes |

**Verdicts:** PASS, FAIL, or **DEFERRED** when a test cannot be judged from the design (a runtime behaviour, or a
fact only the built flows show). Give the reason and where it is checked instead: Build SIT (Part A) or live testing.
A gap the artifacts show is FAIL, never DEFERRED.

**Loop.** For each FAIL, fix the design artifacts and re-run the six tests. At most 2 rounds; log one line per
round (round, date, pass / fail / deferred), and one **Fixed during SIT** line per FAIL you fixed (test, finding,
fix made). If a FAIL remains after round 2, stop and list it at the gate with its
fix instruction.

**Verdict line** (first line of the section):
`Architecture SIT: <pass>/6 pass, <fail> fail, <deferred> deferred — READY` (or `— NOT READY` if any FAIL).

**Progress in chat:** `🏛️ Architecture SIT: round <n>` then one line per test, `🏛️ <#> <test> · ✓` / `· ✗ <gap>` /
`· ○ deferred (<where checked>)`, then the verdict line. No other narration.
