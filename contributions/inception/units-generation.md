---
target: units-generation
plugin: acxd
adds:
  required_sections:
    - "Flow Unit Decomposition"
fragments:
  - anchor: after-step:3
    order: 100
---

## fragment: after-step:3

### Step 3b (acxd): Flow Unit Decomposition

Map each generated unit of work to its ACXD flow set:

**Unit → flow mapping:**
- Each unit of work = one use-case flow set consisting of:
  - One use-case flow, plus separate flows only where a flow test requires them (e.g. escalation)
  - Associated resources (data requests, slot types, secrets, knowledge bases)

**Ownership:**
- Each unit owns its flows and resources, named in its use-case namespace. Similar patterns in two units (auth,
  escalation) are built in each unit, not shared: their details differ and flows are workspace-scoped.

**Build order:**
- Within a unit, build any flow that is a Redirect target before the flows that redirect to it.
- Flag any circular dependencies between flows — these indicate a design problem.

**Resource allocation per unit:**
- List the ACXD resources each unit requires (data requests, slot types, secrets, knowledge bases)
- This feeds directly into the resource creation stage (3.45)
