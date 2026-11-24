# Connect Integration (deploys LAST — after the ACXD SDK stage)

Deploys the Amazon Connect integration contact flow (`mainflow.json` — Agentic CX block, flow logging,
Contact Lens voice + chat analytics, four pathways, escalation hand-off), an escalation queue, and a
routing profile. There is **no Lex bot** — the Agentic CX block references the ACXD application directly.

**Deploy after the ACXD SDK stage**, because the Agentic CX block needs the ACXD Workspace / Application /
Deployment key the SDK deploy creates and writes back to the distribution-root `.env`.

This CDK app is **always delivered complete and synthesisable**. It is one stack,
`acxd-<projectName>-<env>-connect`, deployed with `npm run deploy`.

**Prerequisite: an existing Amazon Connect instance you have admin access to**, in the same region as
`AWS_REGION`. This stack wires into that instance via `CONNECT_INSTANCE_ARN`. It never creates, owns, or deletes
the instance, so deleting the stack removes only the contact flow, queue and routing profile it created. If you
need an instance, see [Create an Amazon Connect instance](https://docs.aws.amazon.com/connect/latest/adminguide/amazon-connect-instances.html).

Order: set `CONNECT_INSTANCE_ARN`, generate the ACXD API key from that instance (manual, Admin Hub), run the
ACXD build, then deploy this stack last (runbook Stage 3).

## Deploy

**The distribution-root `.env` is the single source of truth.** `app.ts` loads it from its own location
(`<snapshot>/backend/connect/cdk/app.ts` → `<snapshot>/.env`), independent of the shell's cwd, and prints the
file it loaded. To change a value, edit `.env` and re-run.

Set in `.env`:
- `AWS_REGION`, `ACXD_PROJECT_NAME`, `ACXD_ENVIRONMENT` (default `dev`; keep identical across runs)
- `CONNECT_INSTANCE_ARN` (your existing instance)
- `ACXD_DEPLOYMENT_KEY` (the console's "Deployment key")
- Auto-filled by the SDK stage: `ACXD_WORKSPACE_ID`, `ACXD_APPLICATION_ID`
- `HOURS_OF_OPERATION_ARN`: required when the stack creates the escalation queue (see below)
- Optional: `ESCALATION_QUEUE_ARN` (blank = the stack creates one, which needs `HOURS_OF_OPERATION_ARN`), `ACXD_SAMPLE_CUSTOMER_ID`

**Set the hours-of-operation ARN by hand**, together with `ACXD_DEPLOYMENT_KEY` (both before this deploy). Ids are
per-instance UUIDs, so there is no default. Print the built-in "Basic Hours" ARN (instance id = last segment of
`CONNECT_INSTANCE_ARN`) and paste it into `.env` as `HOURS_OF_OPERATION_ARN`:

```bash
aws connect list-hours-of-operations --instance-id <instance-id> --region <AWS_REGION> --query "HoursOfOperationSummaryList[?Name=='Basic Hours'].Arn" --output text
```

```bash
cd backend/connect/cdk     # from the distribution snapshot root
npm install
# CDK bootstrap: once per account and region, in the runbook Prerequisites (not part of this deploy).
npm run deploy
```

The deploy fails loudly, naming the `.env` path it checked, if `CONNECT_INSTANCE_ARN`, `ACXD_PROJECT_NAME` or (when creating the queue)
`HOURS_OF_OPERATION_ARN` is missing. Record the outputs (contact flow ARN, escalation queue ARN, routing profile ARN). Post-deploy (customer
console): claim a phone number → this contact flow, assign agents → routing profile, set hours of operation,
choose the Set-voice persona.

## Native queued callback wiring (callback flows only)

A callback flow (`buildCallback`) in **`nativeEscalate`** mode captures a callback number
and **escalates** with two context variables set — it does NOT dial. The dial-out is Amazon Connect's
native queued callback, which you wire ONCE in this contact flow. (Native queued callback is **voice /
telephony only** — for chat or scheduled callbacks the flow must use `externalRecord` mode instead, which
records to an external system; nothing below applies to that mode.)

**Variables ACXD escalates with** (read on the Connect side as `$.AgenticCX.ContextVariables.<name>`):

| Context var | Meaning |
|-------------|---------|
| `callbackNumber` | the phone number to dial back (promoted from the captured slot) |
| `callbackReason` | `nativeCallback` (number captured → run the callback transfer) or `captureFailed` (no number → send to a normal agent queue) |

**Prerequisites (one-time, this instance):**
- A **callback queue** added to the relevant **routing profile(s)** as a *callback* channel.
- **Outbound caller ID** configured on that queue (required for the dial-out leg).

**Contact-flow steps on the Agentic CX block's Escalation branch:**
1. **Set contact attributes** (recommended) — copy `$.AgenticCX.ContextVariables.callbackNumber` and
   `…callbackReason` into contact attributes so later blocks and logs can read them.
2. **Check contact attributes** — branch on `callbackReason`:
   - `nativeCallback` → steps 3–5 (do the callback).
   - `captureFailed` (or any other value) → **Transfer to queue** (normal agent queue; live agent, no dial).
3. **Set customer callback number** — set it from `$.AgenticCX.ContextVariables.callbackNumber`
   (or the contact attribute from step 1).
4. **Set working queue** → the **callback queue**.
5. **Transfer to queue** with the **Callback** option. Connect holds the caller's place and dials
   `callbackNumber` when an agent is free.

**Validate end-to-end:** place a voice test contact, force the callback path (make the backend
unavailable so the flow routes to the callback flow), give a number, and confirm the ACXD flow
**escalates** (not terminates); then confirm in Connect that the contact enters the callback queue with
`callbackNumber` populated, and that an available agent triggers the dial-out. Test the `captureFailed`
branch (decline a number twice) → should transfer to the normal agent queue instead.

> ACXD hands off; Connect fulfils. Without these steps a callback flow escalates with the number set and
> then nothing dials. There is no native Connect API that lists pending queued callbacks — if you need to
> list or cancel them, use `externalRecord` mode (external system + scheduler), not native queued callback.
