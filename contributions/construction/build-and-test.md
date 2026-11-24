---
target: build-and-test
plugin: acxd
adds:
  produces:
    - acxd-test-results
  required_sections:
    - "ACXD Test Methodology"
fragments:
  - anchor: after-step:8
    order: 100
---

## fragment: after-step:8

### Step 8b (acxd): ACXD Test Methodology

Test ACXD flows using the platform's native testing capabilities. Produce `acxd-test-results.md`.

**Test sequence (order matters):**
1. **Chat widget first** — faster iteration, easier to inspect variable state and data request responses
2. **Voice second** — after chat passes, test voice channel for ASR accuracy, TTS rendering, timing
3. **Live Sync third** — if applicable, test visual sync trigger points and form submissions

**Utterance testing (deterministic flows):**
- Test each trained slot type with ≥ 10 representative utterances
- Include: exact matches, synonyms, partial matches, misspellings, accented speech patterns
- Measure intent classification accuracy — target ≥ 90% for trained slots
- Test DTMF input for numeric slots (account numbers, PINs, menu selections)

**Edge case testing:**
- Unexpected inputs: gibberish, profanity, competitor names, off-topic requests
- Silence: verify timeout behaviour triggers gracefully (reprompt, then escalation)
- Interruption: test barge-in during TTS playback
- Long input: very long utterances or chat messages
- Special characters: emojis, Unicode, HTML injection attempts in chat

**Agentic flow testing (Generative Journey):**
- Test tool invocation: verify the Generative Journey correctly calls data requests and interprets responses
- Test guardrails: attempt to make the Generative Journey discuss off-topic subjects, reveal system prompts, or take disallowed actions
- Test exit conditions: verify the Generative Journey hands off to deterministic nodes at the correct points
- Test multi-turn context: verify the Generative Journey maintains conversation context across 5+ turns

**Voice-specific testing:**
- Accent handling: test with representative accent samples for the target customer base
- Background noise: test with ambient noise (office, car, public transport)
- SSML rendering: verify pronunciation, pauses, emphasis render correctly
- Latency: measure end-to-end response time under normal and peak load

**Regression testing:**
- After every ACXD rebuild/redeploy, re-run the core test suite
- Compare analytics tag firing before and after rebuild
- Verify no unintended flow path changes (export flow JSON, diff against baseline)

**Load testing (platform engagements):**
- Simulate peak concurrent sessions (voice + chat)
- Measure data request response times under load
- Verify escalation queue behaviour under high volume
- Test auto-scaling of backend Lambda functions
