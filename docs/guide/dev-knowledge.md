# Knowledge and provenance

The agent's knowledge is layered so the model receives it in a consistent order: general framing first, specific
detail and examples last, closest to where it acts. `knowledge/KNOWLEDGE-ARCHITECTURE.md` is the map and is read
first.

- **Persona** (`agents/acxd-platform-agent.md`): design principles, hard rules and how to work with the AI-DLC
  harness, stated at the most general level, plus the knowledge load list.
- **Tier 3, principles:** `acxd-architecture-principles.md` (written as tests) and
  `acxd-counter-intuitive-patterns.md` (platform traps, each with what enforces it).
- **Tier 2, design guidance:** flow design, agentic design and prompting, conversation design.
- **Tier 1, implementation reference:** node reference, variables and state, and the typed IDL (`acxd-sdk-idl.ts`).
- **Loaded on demand:** the IDL when authoring, the SIT method (`acxd-sit-method.md`) at the two SIT steps, and
  `acxd-dev-mode.md` only when developer mode is on.
- **Supporting knowledge** for the AI-DLC support agents: overview, integrations, testing and compliance.

Each tier states its concepts at its own level and shares key vocabulary with the tier above, rather than pointing
at it by number; a pointer is used only to route the agent to an on-demand file or to name where a shape lives.

Every non-trivial fact carries a source tag. When sources disagree, the order is:

```
[CONSOLE-VERIFIED]  >  [DOC]  >  [NEURA]  >  [SPECIALIST]  >  [SDK] / [SDK-MODEL]
```

`[GA-GAP]` marks a known platform gap, and an untagged or `[UNVERIFIED]` claim is never relied on for a
consequential step without telling the user. Never tag an unverified claim `[CONSOLE-VERIFIED]`: the tag is a
contract, not decoration. Validate any emitted wire field against the SDK's Smithy model, never against
console-to-console diffs, which round-trip the import shape and hide fields the API drops.

The coherence scan used during development checks the knowledge against this map: file placement, load order, tier
fit, pointers between tiers, tag vocabulary, narrative order, examples, and the total the model carries into every
stage.

---

[Documentation home](index.md)
