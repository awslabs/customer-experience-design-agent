# ACXD Counter-Intuitive Patterns

ACXD behaviours where the platform does the opposite of what a capable engineer or model would predict. Each entry
is a platform fact, not design advice. An entry belongs here only if it is (1) counter-intuitive, (2) verified, with
a source tag, and (3) load-bearing: getting it wrong silently mis-routes, drops data, or fails deploy. Design
guidance lives in the architecture principles; full mechanics live in `acxd-node-reference.md`. Governed by
`../KNOWLEDGE-ARCHITECTURE.md` (Tier 3).

Each title carries `[verified-as-of SDK <version>]`. On an SDK bump (the one pin is
`tools/acxd-deploy-engine/package.json`), re-verify each entry and remove any the platform has fixed.

Read the titles before designing or authoring a flow. "Enforced" names the code that already guards the trap;
where nothing enforces it, the design must.

## 1. Data-request status exits bind by POSITION, not by condition value — [CONSOLE-VERIFIED] [verified-as-of SDK 0.2.0]
CreateFlow binds the exits in the order `in_progress, success, timeout, failure`, whatever the conditions say. Any
other order silently routes one status to another's target. Enforced: the factory emits that order; check 14.

## 2. `in_progress` must be left unconnected — [CONSOLE-VERIFIED] [verified-as-of SDK 0.2.0]
A wired `in_progress` fires before the response is set. Leave it with no target. Enforced: the builder terminates
it; check 15 fails a wired one.

## 3. Timeout and failure are self-managed: never retry them in the flow — [CONSOLE-VERIFIED] [verified-as-of SDK 0.2.0]
Re-entering a node after a timeout or failure re-evaluates the stored error without calling the API again, and the
failure exit carries no error code. A flow-level retry loop can never succeed. Route both to a short message and
escalation. Applies to every node with these exits. Not enforced: design it.

## 4. Redirect is one-way — [CONSOLE-VERIFIED] [verified-as-of SDK 0.2.0]
A Redirect hands control to another flow and never returns; nodes after it are unreachable. Anything that must
continue the same conversation stays inline in the flow. Not enforced: design it.

## 5. `terminate` is a node you wire into — [CONSOLE-VERIFIED] [verified-as-of SDK 0.2.0]
An exit with no target is a canvas error, not an end. End a path by wiring it to a `terminate` node (or escalate /
redirect). Enforced: the builder injects one terminate node per flow and retargets terminal exits.

## 6. Compare a boolean response field to boolean `true`, not the string `'true'` — [CONSOLE-VERIFIED] [verified-as-of SDK 0.2.0]
A split comparing a JSON boolean to `'true'` never matches, so valid input takes the else path. Not enforced:
author `variableEqCondition(..., true)`.

## 7. A data-request field is read directly in its own flow; copy it only to leave the flow — [CONSOLE-VERIFIED] [verified-as-of SDK 0.2.0]
After a successful request, later nodes in the same flow read `{dataRequestId.field:NLX.Variable}` directly; no
context variable is needed. Copy to a context var only to cross a Redirect or reach Connect, and then with the
`variable` operand: a `type:"field"` operand copies a redaction wrapper (`<<<name:...||redact>>>`) instead of the
value. Enforced: check 19.

## 8. `requestSchema` describes the body; only the node `payload` sends it — [SDK-MODEL] [verified-as-of SDK 0.2.0]
Defining a request body schema on the data request sends nothing. The node must carry the body (`body` in the
DSL / FlowSpec). Enforced: check 17 (required body fields must be sent).

## 9. A Generative Text node shows nothing — [CONSOLE-VERIFIED] [verified-as-of SDK 0.2.0]
It writes its output to a local only. A later message must show `{name:NLX.Local}`. Enforced: the unused
Generative Text finding.
