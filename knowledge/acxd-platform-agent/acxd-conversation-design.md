# ACXD Conversation Design

Authoritative reference for conversational-experience design: persona, error recovery, silence, confirmation,
channel/voice strategy, and CX metrics. Governed by `../KNOWLEDGE-ARCHITECTURE.md`.

Every fact carries a source tag — **[CONSOLE-VERIFIED]** / **[DOC]** / **[NEURA]** / **[SPECIALIST]** / **[SDK]**.
Untagged = ungrounded. On conflict: [CONSOLE-VERIFIED] > [DOC] > [NEURA] > [SPECIALIST] > [SDK].

> **Scope:** this file owns the CX/experience layer — HOW the conversation should feel and behave. Node shapes
> live in `acxd-node-reference.md`; agentic prompting in `acxd-agentic-and-prompting.md`; this file does not
> duplicate them.

## Persona [DOC]

Define the application's consistent personality before writing prompts: formal or casual, industry vocabulary,
name, voice. Consistency matters — customers notice tone shifts between flows. Lock the persona in the
Generative Journey prompt ROLE section and apply it to all Basic-node messages so every turn sounds like one
assistant. [DOC]

## Error recovery [DOC]

The No-match experience is where customers give up — design recovery as carefully as the happy path.
A standard recovery stack [DOC]:
1. No-match on a capture → one bounded retry.
2. Retry exhausted → a brief re-orient ("I didn't catch that. Want to try again, or is there something else I
   can help with?").
3. New intent expressed → route to it; still unresolved → route to the agentic catch-all / KB for a best-effort
   answer, or escalate.
Escalate on the caller's signal or genuine exhaustion — never dead-end. [DOC]

## Silence handling (voice) [DOC]

Configure the silence timeout at the Connect contact-flow level. In the ACXD flow: after first silence, a brief
neutral re-prompt ("I'm still here. How can I help?"); after a second silence, route to escalation or end the
call gracefully. [DOC]

## Confirmation patterns [DOC]

- **Voice:** keep confirmations short — re-reads add latency ("I'll transfer $50. Confirm?" beats a full
  read-back). [DOC]
- **Chat:** can be richer — a summary card with formatted values before the confirm action. [DOC]
- **Write actions ALWAYS require explicit confirmation** — never confirm a state-changing action silently. [DOC]

## Channel strategy [DOC]

- Design for the channel: voice needs brevity, spoken-friendly wording, and pronunciation care; chat can use
  richer formatting, cards, and lists. [DOC]
- **Channel-aware output:** branch wording/format on the channel (a System variable) where the experience
  differs materially between voice and chat. [DOC]
- **Cross-channel handoff** (e.g. voice → a digital view) is a Live Sync concern (below).

## Voice provider & pipeline [NEURA][DOC]

- **Amazon Connect agentic voice** is the AWS-recommended provider for agentic voice (NOT Polly, NOT Nova
  Sonic). [NEURA]
- The **TTS voice persona is set in the Connect contact flow's Set Voice block**, NOT in ACXD; the locale set
  there auto-propagates to ASR. The ASR engine type is chosen on the Agentic CX block. [NEURA][CONSOLE-VERIFIED]
- Agentic Voice is a modular ASR→LLM→TTS pipeline (auditable), not end-to-end speech-to-speech. Lex remains the
  internal orchestration/state layer. [CONSOLE-VERIFIED]
- **SSML** for spoken read-back of identifiers (spell-out) improves voice accuracy. [CONSOLE-VERIFIED]

## Live Sync (Voice+) — multimodal design [DOC]

Turn a spoken exchange into a visual guided experience where it adds value: multi-field forms, list selections
(products, appointment slots), pre-write confirmation summaries, PCI-safe payment input. A Live Sync node
activates the front-end (Touchpoint SDK); design the web/mobile view alongside the voice flow. Web front-end
capability. [DOC]

## Conversation-design capture in discovery [DOC]

Capture these in CX Discovery so the design is intentional, not emergent:
- **Persona / tone / brand voice.**
- **Guardrails & sensitive topics** — PII handling, prohibited/regulated topics, escalate-instead-of-answer,
  compliance drivers (privacy regime, sector conduct standard). [DOC]
- **Channels** — voice, chat, async; cross-channel handoffs; voice-specific constraints.
- **Termination** — end in ACXD vs return to Connect (per use case). (See `acxd-flow-design.md`.)

## CX metrics (design to measure) [DOC]

Contact-centre KPIs the design should enable measuring: **containment rate, average handle time (AHT),
first-contact resolution (FCR), CSAT, cost per contact, escalation rate.** Escalation Rate is a free ACXD
dashboard metric — don't tag for it. Tie user stories to the KPIs they move. [DOC][CONSOLE-VERIFIED]

## Go-live / cutover [DOC]

Plan phased rollout, fallback routing, agent preparation, and a rollback plan. Compliance is cross-cutting:
call-recording consent, data redaction, auditability. [DOC]
