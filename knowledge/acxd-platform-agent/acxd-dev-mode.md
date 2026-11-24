# ACXD Development Mode

Governed by `../KNOWLEDGE-ARCHITECTURE.md` (loaded on demand: read this file only when dev mode is on).

Dev mode is a developer aid for building the plugin. It records two things the agent would otherwise absorb
silently: harness problems (for the plugin's developers) and design judgements (for the solution's designers).
It never changes the customer-facing workflow; when it is off, none of this applies and nothing is said about it.

## Turning it on

Dev mode is on while `customer-context/acxd-dev-mode.txt` exists. Check at the start of every stage (the file can
be added or removed between stages).

- When on, show one plain line after the stage header: `Dev mode enabled (customer-context/acxd-dev-mode.txt present)`.
  In CX Discovery it goes at step 3 of the opening sequence.
- The first time it is on in a run, create `acxd-dev-observations.md` at the project root if it does not exist,
  with only a header: title `# ACXD Harness & Design Observations`, a one-line purpose, the date, and the focus
  directive if any. Never overwrite an existing log.
- If the marker file contains text, that text is a **focus directive**: log every decision, assumption,
  simplification, or skipped or merged question in the named area, even ones you would not normally record. It adds
  to the standing categories; it never narrows them.

## What to record

Record an entry whenever one of these happens, including when you resolved it cleanly (a clean recovery is what
would otherwise stay invisible):

| Category | Audience | Record when |
|---|---|---|
| `tool-failure` | harness | A tool or command fails, times out or returns something unexpected and you retry or work around it; includes a file not found where an instruction said it would be. |
| `instruction-conflict` | harness | Two instructions disagree, including a plugin rule against a core rule. Core wins; record both, and the behaviour you produced, especially if it matches neither. |
| `ambiguity` | harness or design | An instruction (harness) or the SoP or use case (design) can be read more than one way and you chose a reading. |
| `agent-intervention` | harness | You had to reason through or reconcile an instruction beyond the stage's normal flow. |
| `design-deviation` | design | You made a substantive design choice the approved design or guidance did not specify: dropped, added or rerouted an edge, flow, read or field; used a default to pass a check; simplified "for the POC"; moved a security or auth boundary. If you think "I'll simplify / default / drop this", record it. |
| `sit-finding` | design | A build finding, a Build SIT FAIL or an Architecture SIT FAIL was sent back and you fixed it: record the check or test, the cause and the fix. Repeats across runs show which design mistakes keep recurring. |
| `environment-gap` | harness | A tool, library or binary the work needed was missing and you installed, substituted or worked around it. Repeats are the evidence to make that dependency built in. |

Never record secrets, tokens, PII or customer content: describe the shape of the problem, not its values.
Recording never blocks or slows the stage.

## When to write

1. **During the stage:** keep a running note only. Do not write the file.
2. **At stage completion** (after the completion message, before learnings and the gate): post a chat digest,
   heading `Dev-mode findings — <stage>`, 3 to 6 bullets, Design first then Harness, or one line saying none.
3. **After the gate is approved:** append the stage's entries to `acxd-dev-observations.md` in one write, before the
   next stage starts. Best effort: if the write fails, say so in chat and carry on.

The digest and the file are both required; the workflow's own audit log does not replace either.

## Entry format

Each entry is one block, appended in stage order, with a heading that names the date, audience and category, then four short fields:

```
## [<ISO-8601 timestamp>] [harness|design] <category> — <stage slug>
- **What happened:** <one or two sentences>
- **Offending instruction or tool:** <file and section, or tool name; quote short conflicting text>
- **How I resolved it:** <the choice and why>
- **Impact / recommendation:** <harness: what to change in the plugin, or "none — transient"; design: what to review or decide>
```
