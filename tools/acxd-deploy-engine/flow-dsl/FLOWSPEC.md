# FlowSpec — declarative flow authoring (reference)

A FlowSpec describes ONE flow as plain JSON data: its nodes and where each exit goes.
`build-specs.ts` turns every spec into the verified console wire format by calling the SAME node factories,
component builders and `FlowBuilder` as a TypeScript authoring script. Nothing you write is executed.

> **A FlowSpec is NOT flow JSON.** You write `flows/specs/<flowId>.flowspec.json` (authoring INPUT). The tool
> writes `flows/<flowId>.flow.json` (DSL OUTPUT — never hand-edit). Exit order, choice binding, continuation
> edges, slot attachment, canvas layout and the unwired-exit check all come from the factories.

## Build

```bash
npx --yes tsx {{HARNESS_DIR}}/tools/acxd-deploy-engine/flow-dsl/build-specs.ts <flowsDir>
```

- Reads `<flowsDir>/specs/*.flowspec.json` and the optional `<flowsDir>/flowset.json`.
- Builds every spec, then runs the **cross-flow checks** over the whole set.
- Writes `<flowsDir>/<flowId>.flow.json` only if EVERYTHING passes. Every problem is listed in one run.

## Two spec forms

**Component** (use a component builder; params are the builder's parameters minus `flowId`):

```json
{ "flowId": "billingEscalation", "component": "escalation",
  "params": { "aiDescription": "Summarises the conversation and hands over to a human agent." } }
```

Components: `authVerify` (deterministic capture only), `escalation`, `welcomeRouter`, `callback`, `faqLookup`.

**What each component reads and sets** (a flow that redirects into it must set every var it reads first):

| Component | Required params | Context vars it READS | Context vars it SETS |
|---|---|---|---|
| `escalation` | `aiDescription` (optional: `handoffSummaryContextVar` + `summaryPrompt`, `model`, `partingMessage`) | none (the Connect contact flow reads `escalationReason`; list it in `externalReads`) | `handoffSummaryContextVar` when a summary is configured |
| `authVerify` | `identifierSlot`, `identifierSlotType`, `verifyVariableId`, `verifiedField`, `captureFields`, `authenticatedContextVar`, `attemptsContextVar`, `maxRetries`, `onVerified`, `escalationFlowId` | `attemptsContextVar` | `authenticatedContextVar` (`'verified'`), each `captureFields` var, `attemptsContextVar`, `escalationReason` |
| `welcomeRouter` | `greeting`, `intentSlot`, `intentSlotType`, `routes`, `noMatchToFlowId`, `choosePrompt` | none | none |
| `callback` | per `exitMode` (see below) | none | `numberContextVar`, `reasonContextVar` (nativeEscalate) |
| `faqLookup` | `kbName`, `returnToFlowId`, `escalationFlowId` | none | `escalationReason` (on error) |

These builders produce a whole flow: use them only for a separate flow (e.g. escalation). Inside the use-case flow,
author the same steps as nodes (keep the conversation together).

> **`callback` has a required `exitMode` (discriminated union — author the matching params).** A callback flow
> is a terminal sink that MUST fulfil the callback; there is no acknowledge-only form.
> - **`nativeEscalate`** (VOICE — native Connect queued callback; least infra). Params:
>   `{ exitMode: "nativeEscalate", aiDescription, numberSlot, choosePrompt, confirmMessage, numberContextVar,
>   reasonContextVar }`. Captures the number, sets `numberContextVar` + `reasonContextVar` ("nativeCallback" /
>   "captureFailed"), then escalates; the Connect flow downstream runs Transfer-to-Queue(callback).
> - **`externalRecord`** (ANY channel incl. CHAT, and required for a scheduled window or a trackable list).
>   Params: `{ exitMode: "externalRecord", aiDescription, numberSlot, choosePrompt, confirmMessage,
>   recordVariableId, recordUrlParams }`. Records the request via a data_request, then terminates.
>
> ```json
> { "flowId": "billingCallback", "component": "callback",
>   "params": { "exitMode": "nativeEscalate", "aiDescription": "Capture a callback number and hand to the native queued callback.",
>     "numberSlot": "callbackNumber", "choosePrompt": "What is the best number to call you back on?",
>     "confirmMessage": "Thanks, we will call you back shortly.",
>     "numberContextVar": "callbackNumber", "reasonContextVar": "callbackReason" } }
> ```

**Nodes** (bespoke flow):

```json
{ "flowId": "billingMain",
  "aiDescription": "Helps a signed-in customer with their bill.",
  "slots": [],
  "nodes": [
    { "id": "start", "type": "start", "next": "get" },
    { "id": "get", "type": "data_request", "name": "Get balance", "dataRequest": "getBalance",
      "params": { "accountRef": "{accountRef:NLX.Context}" },
      "exits": { "success": "say", "timeout": "esc", "failure": "esc" } },   // in_progress is OMITTED (auto-terminated; declaring it is rejected)
    { "id": "say", "type": "basic", "messages": ["Your balance is {getBalance.balanceDue:NLX.Variable}."], "next": "terminate" },
    { "id": "esc", "type": "redirect", "to": "billingEscalation",
      "set": [{ "set": "escalationReason", "from": "const:systemUnavailable" }] }
  ] }
```

`id` is your local handle for wiring (any short unique string); the emitted node gets a UUID. `slots` lists
slots used only by Generative Journey `dataCapture` (`user_choice` nodes attach their own slot).

## Node types and their exits

Every exit a node has MUST be wired (`"terminate"` ends the conversation). A wrong or missing exit is
reported with the valid list.

| type | fields | exits (keys) |
|---|---|---|
| `start` | — | `next` |
| `basic` | `name?`, `messages?`, `set?`, `tags?` | `next` |
| `define` | `local`, `value` (number / boolean / string) | `next` |
| `user_choice` | `slot`, `slotType`, `elicit` (required: the question; a user_choice with no message fails), `values?` (enumerated), `examples?`, `sensitive?` | one per value + `no-match` (enumerated), or `captured` + `no-match` (free text) |
| `generative_journey` | `name` (required when a flow has more than one journey; SIT scenarios and the tracer refer to journeys by name), `prompt`, `exits?` `[{name,prompt}]`, `dataCapture?` `[{slot,required?}]`, `tools?` `[{kb,prompt}|{dataRequest,prompt}]`, `model?`, `maxTokens?`, `maxSteps?`, `temperature?`, `tags?` | `routes`: `captured` (if dataCapture), each named exit, `timeout`, `failure` |
| `data_request` | `dataRequest`, `params?` (URL placeholders), `body?` (JSON request body; nested allowed), `set?` | `success`, `timeout`, `failure` (OMIT `in_progress` — auto-terminated) |
| `split` | `branches` `[{name, when}]` | each branch name + `default` |
| `generative_text` | `name`, `prompt`, `model`, `local?`, `temperature?`, `maxTokens?` | `success`, `timeout`, `failure` |
| `knowledge_base` | `kb`, `question?` | `match`, `no_match`, `timeout`, `failure` |
| `redirect` | `to` (flowId), `set?` | none (one-way). The build keeps ONE exit node per kind and target (one redirect per target flow, one escalate, one terminate) and places them in one column at the far right; a redirect's `set` moves onto a node just before the shared exit. |
| `escalate` | — | none |
| `terminate` | — | none |

A Generative Journey's exits are declared under `routes` (its named exits are defined in `exits`).

## References (`from` and conditions)

`ctx:name` · `local:name` · `slot:name` · `var:dataRequest.field` · `field:dataRequest.field` · `sys:name` ·
`const:text` (always a STRING). **Number/boolean vars:** set a typed value directly with
`{ "set": var, "value": 0 }` or `{ "set": var, "value": true }`; it emits a real number/boolean constant, which
ACXD accepts. Only a STRING constant (`const:0` is the string `"0"`) into a number/boolean var is rejected. A
`define` local also works but is not needed. Never turn the var, or the API field, into a string to get a default:

```json
{ "id": "intake", "type": "basic", "set": [ { "set": "preApprovedDiscountLevel", "value": 0 } ], "next": "..." }
```

**Slot types:** attach slots with a custom slot type from `slot-types.json` or `NLX.AlphaNumeric` (use it for free text). No other built-in `NLX.*` type is available in ACXD (e.g. `NLX.FreeText`); the build rejects them. Slot keys are `name`, `type`, `examples`, `sensitive`, `aiDescription`, e.g. `{ "name": "pin", "type": "NLX.AlphaNumeric", "sensitive": true }`. The type key is `type` (not `slotType`); the build rejects any other key.

**Generative Journey prompts** use the eight tagged sections from Flow Design Step 5 (`<use-case>`, `<persona>`,
`<previous-context>`, `<task>`, `<data-to-capture>`, `<tools>`, `<rules>`, `<exit>`). The build blocks a prompt
missing `<use-case>`, `<previous-context>`, `<task>` or `<exit>`.

**Tokens in bodies, params, messages and prompts:** `{name:NLX.Context}` (context var), `{name:NLX.Local}` (local,
e.g. a Generative Text output), `{slot:NLX.AlphaNumeric}` (slot of the built-in type), `{slot:<slotTypeId>}` (slot of
a custom type: the slot type id with no `NLX.` prefix, e.g. `{paymentMethod:paymentMethodType}`). A custom-type slot never
takes an `NLX.` prefix. [CONSOLE-VERIFIED]

**Branching on a value a Generative Journey captured.** A journey cannot set a context var, and a split can only test
whether a slot exists. To branch on WHAT was captured (e.g. the chosen tier), copy the slot into a context var on the
next basic node, then split on the context var. Add the context var to `resources/context-vars.json` if it is not
there yet (a mechanical addition, allowed at authoring time):

```json
{ "id": "keepTier", "type": "basic", "set": [ { "set": "selectedTier", "from": "slot:selectedTier" } ], "next": "tierSplit" },
{ "id": "tierSplit", "type": "split", "name": "Coverage uplift?",
  "branches": [ { "name": "uplift", "when": { "ctx": "selectedTier", "op": "eq", "value": "customerProtect" } } ],
  "exits": { "uplift": "setUplift", "default": "price" } }
```

**Set every value before it is read, on every path in the flow.** Do not rely on an unset context var reading as
empty at runtime (not verified). Where a value genuinely has no meaning on a path (e.g. an account reference for a new
customer), set a true default on that path; a placeholder that only satisfies a check is not allowed (fix the
design; never drop behaviour to pass a check).

**Body values keep their type:** write every `body` field as `"{var:NLX.Context}"`. When `var` is a number or boolean context var, the build sends it with that type. Never quote, wrap or reword a value to convert it, and never change a var's type to string to make a body work.

**Copying a data-request field into a context var: always `var:`.** `field:` carries a redaction wrapper, so the
context var would hold `<<<...||redact>>>`; the pre-flight (check 19) rejects it.

**Reading a data-request field later in the same flow:** reference it directly as
`{dataRequestId.field:NLX.Variable}` in any later node on the request's success path: a message, a journey prompt,
a split, another request's body (a lone token there keeps the field's type, so a number or boolean field can feed
a number or boolean body field). The console shows the same token as `{dataRequestId.field}`. No context variable or
extra node is needed. A context variable is only for a value that must leave the flow: across a Redirect, or to
Amazon Connect on escalation. After a timeout or failure the request's fields are undefined, so read them only on the
success path.

State changes (`set`): `{ "set": var, "from": ref }`, `{ "set": var, "value": number | boolean }`, `{ "clear": var }`, `{ "clearSlot": slot }`,
`{ "increment": var }`, `{ "decrement": var }`.

Split conditions (`when`), one per branch:
`{ "ctx": var, "op": "eq|neq|gte|...|exists|not_exists", "value": v }` ·
`{ "var": "dataRequest.field", "op": "exists" | "eq", "value": v }` ·
`{ "slot": slot, "op": "exists" | "not_exists" }`.

## Node field notes

**`user_choice` `values` are PLAIN STRINGS, not objects.** The enumerated values are a flat array of strings;
each string becomes one exit key (plus `no-match`). Do NOT wrap them as `{ "value": "accepted" }` objects — the
builder calls `.split()` on each entry, so an object throws `value.split is not a function` and the node fails to
build (and any node that referenced it then reports "unknown target" as a cascade). Correct form:

```json
{ "id": "ask", "type": "user_choice", "slot": "outcome", "slotType": "NLX.AlphaNumeric",
  "values": ["accepted", "saved", "followUp", "declined"],
  "exits": { "accepted": "doAccept", "saved": "doSave", "followUp": "doFollowUp",
             "declined": "doDecline", "no-match": "reprompt" } }
```

Each value in `values` must have a matching key in `exits`, plus a `no-match` exit.

**`data_request` sends values two ways, usable together on any method.** `params` fills `{placeholder}` tokens in
the data request's URL (path or query). `body` is the JSON request body: keys are field names, values are a
reference token string (`"{accountNumber:NLX.AlphaNumeric}"`, `"{ctx:NLX.Context}"`) or literal text, or a NESTED
object/array for a nested body. Every `params` key must have a matching `{placeholder}` in the URL, and every
field in the data request's `requestSchema.required` must be supplied in `body` or `params`; the build pre-flight
fails otherwise. **Typed fields:** a number, boolean or object body field takes a value of that type: a lone
`"{ctx:NLX.Context}"` token for a number/boolean context var, or a lone `"{dataRequestId.field:NLX.Variable}"`
token (each keeps its type); any other text, and every slot token, is a string and fails a typed field. Follow the API's contract. For an API this solution deploys, prefer a flat `body` for POST writes and sensitive
values (a PIN never goes in the URL), and `params` for GET reads.

```json
{ "id": "verify", "type": "data_request", "name": "Verify identity", "dataRequest": "verifyIdentity",
  "body": { "accountNumber": "{accountNumber:NLX.AlphaNumeric}", "pin": "{pin:NLX.AlphaNumeric}" },
  "exits": { "success": "check", "timeout": "esc", "failure": "esc" } }

{ "id": "pay", "type": "data_request", "name": "Make payment", "dataRequest": "makePayment",
  "body": { "amount": "{paymentAmount:NLX.Context}",
            "account": { "ref": "{accountRef:NLX.Context}", "method": "{paymentMethod:NLX.Context}" } },
  "exits": { "success": "confirm", "timeout": "esc", "failure": "esc" } }
```

**A journey prompt that references a data request needs it attached as a tool.** Reference its fields as
`{dataRequestId.field:NLX.Variable}`; a prompt reference without the tool fails the build.

```json
{ "id": "advisor", "type": "generative_journey", "name": "Billing advisor",
  "prompt": "<previous-context>The caller is signed in. Their balance is {getBalance.balanceDue:NLX.Variable}, due {getBalance.dueDate:NLX.Variable}.</previous-context> ...",
  "tools": [ { "dataRequest": "getBalance", "prompt": "Refresh the balance if the caller says they have just paid." } ],
  "routes": { "humanHandoff": "esc", "timeout": "esc", "failure": "esc" } }
```

## Cross-flow checks (`flowset.json`, optional)

```json
{ "authFlagVar": "authStatus",
  "identityVars": ["accountRef", "customerName"],
  "externalVars": [],
  "entryFlows": ["billingMain"],
  "sinks": [ { "flowId": "billingEscalation", "variant": "escalate" } ],
  "privilegedTools": ["getBalance"],
  "externalReads": [ { "var": "escalationReason", "readBy": "Connect contact flow (queue routing)" } ] }
```

Over the WHOLE set, the build fails when:
1. a flow reads a context var that **no flow sets** (unless listed in `externalVars`);
2. a flow reads a context var that is **not set on every redirect path** into it;
3. a node **sets an identity var before sign-in**: sign-in is the node that sets `authFlagVar` (e.g. `authStatus`),
   inside one flow or across flows. `authFlagVar` is REQUIRED whenever `identityVars` is set; the build fails without it.
4. a redirect targets a flow **not in the set**.
5. a flow DECLARED a terminal sink in `sinks` violates its contract — it contains a `redirect` node (a sink
   must NEVER redirect onward — the defining rule), or it has NO terminal node at all. A sink MAY mix terminals
   (e.g. `terminate` on success + `escalate` on an error/capture-fail path); `variant` is an optional intent
   label, not a single-kind constraint. See "Terminal sink flows" in the flow-design knowledge. `sinks` is
   opt-in — declare only genuine dead-ends (NOT a flow with several onward exits).

It also fails on **design findings**. These block the build (and the deploy pre-flight) until you fix the design,
or, only when the behaviour is intended, record it in `flowset.json` with a reason:
- **dead data**: a data request's response fields are never read in the flow that called it. Data-request output
  does not survive a Redirect, so use it there or promote what later flows need to a context var. If a field is
  genuinely not needed (an echo of the request, a write with no useful response), record it:
  `"unusedFields": { "getBalance": { "fields": ["accountRef"], "reason": "echo of the request" } }`
  (`"*"` for the whole response). A reason is required.
- **dead state**: a context var is set but no flow reads it. List a var in `externalReads` only if something
  outside the flows really reads it, and name that reader (`readBy`). A bare name does not silence the warning.
- **needless copy**: a context var set from a data-request field on one node and read only in the flow that set it
  (a var set on more than one node carries one value from separate branches and is not reported). Later nodes
  in the same flow read the field directly as `{dataRequestId.field:NLX.Variable}`; remove the var and the copy. A
  context var is only for a value that leaves the flow (a Redirect, or Connect listed in `externalReads`).
- **unbounded re-prompt**: a `user_choice` no-match path that returns to the same choice without incrementing a
  counter. Increment a counter on the re-prompt node, split on it, and escalate after the bound.
- **shared-tier**: a Generative Journey reachable both before and after the sign-in node (Architecture Principle 13)
  with a tool listed in `privilegedTools` attached, or whose prompt reads an `identityVars` value. This cannot be
  recorded as intended: give the authenticated path its own journey for that data, and merge the paths again for
  deterministic nodes. Always declare `privilegedTools` (`[]` if none); a
  shared-tier journey with data-request tools fails until it is declared. Journeys with only safe tools pass.
- **unused Generative Text**: a `generative_text` node is silent; it only writes its output to a local (`local`, or a
  camelCase name derived from its `name`). If nothing in the flow shows or uses that local, the build fails. Show it in
  the next message, e.g. `"{billSummary:NLX.Local} Would you like to pay now?"`. This cannot be recorded as intended.


**`entryFlows` must be declared explicitly whenever any flow redirects BACK to the entry flow** (a back-edge).
The default "entry = any flow with no inbound redirect" would then NOT treat the entry flow as an entry (it has
an inbound redirect) and would mis-root the reachability analysis. Set `entryFlows` explicitly in that case.

Ordering is checked at flow level along redirects; order WITHIN one flow is not modelled. The same checks
run again in the deploy engine's pre-flight, so a hand-edited `.flow.json` is still caught.

**Split conversation finding.** Inside one flow, a Generative Journey that leads to another through message or
state-setting nodes only, or a journey that captures a slot an earlier journey on the path already captured, blocks
the build (keep the conversation together). Merge them, or record the pair with a reason:
`"separateJourneys": [{ "journeys": ["<node name>", "<node name>"], "reason": "..." }]`.
