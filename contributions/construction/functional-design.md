---
target: functional-design
plugin: acxd
adds:
  required_sections:
    - "Flow Node Graph"
fragments:
  - anchor: after-step:4
    order: 100
---

## fragment: after-step:4

### Step 4b (acxd): Flow Node Graph Specification

For each unit's flow set, produce a node-level graph specification:

**Per flow, define:**
- Node inventory: list every node with type (Start, End, Condition, SetVariable, DataRequest, GenerativeJourney, GenerativeText, Redirect, Escalation, Message, SSML, LiveSync, WaitForInput)
- Edge map: source → target for every connection, including condition-branch labels (true/false, match values)
- State modifications: which variables are read, written, or promoted at each node
- Variable references: map every `{{slot.x}}`, `{{context.x}}`, `{{dataRequest.x}}` to its source

**Flow development rules to enforce:**
- Every flow has exactly one Start node and at least one End node
- Every Condition node has both true and false branches connected
- No orphan nodes (every node reachable from Start)
- Data request nodes have timeout handling (Condition on response status)
- Generative Journey nodes have explicit exit conditions and fallback paths
- Redirect nodes specify all context-in parameters; receiving flow declares context-out
- Escalation nodes include conversation summary and verified context data

**Node graph format:**
```
[Start] → [SetVariable: channel] → [Condition: returning_customer]
  ├─ true → [Redirect: shared-auth-verify] → [Condition: auth_verified]
  │   ├─ true → [DataRequest: dr-account-getDetails] → [GenerativeJourney: servicing]
  │   └─ false → [Message: auth_failed] → [Escalation: agent_queue]
  └─ false → [Redirect: shared-gather-details] → ...
```
