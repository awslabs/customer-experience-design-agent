---
target: scope-definition
plugin: acxd
adds:
  required_sections:
    - "ACXD Scope Selection"
fragments:
  - anchor: after-step:2
    order: 100
---

## fragment: after-step:2

### Step 2b (acxd): ACXD Scope Selection

When the project involves Amazon Connect Agentic CX Designer (ACXD), select one of the four ACXD engagement scopes based on the CX Discovery report and the qualified engagement pattern:

**Decision matrix:**

| Signal | Scope | Depth | Stages |
|--------|-------|-------|--------|
| Platform build — multiple use cases, enterprise CI/CD, multi-environment | `acxd-platform` | Comprehensive | 33 core + 10 ACXD (≈43) |
| Single use-case delivery — one customer journey, standalone or module within larger engagement | `acxd-usecase` | Standard | 23 core + 8 ACXD (≈31) |
| Enhancement to existing ACXD deployment — add or modify flows on established platform | `acxd-enhancement` | Minimal | 12 core + 6 ACXD (≈18) |
| Rapid proof of concept — demonstrate the art of the possible, demo-ready in days | `acxd-poc` | Minimal | 8 core + 4 ACXD (≈12) |

**Qualification questions (from CX Discovery):**

1. "Is this a new platform build or an enhancement to an existing one?" → existing = `acxd-enhancement`
2. "Is the goal a quick demo for stakeholder buy-in?" → yes = `acxd-poc`
3. "Will multiple use cases be built, or just one?" → multiple = `acxd-platform`, one = `acxd-usecase`
4. "Will multiple teams build concurrently on this platform?" → yes = `acxd-platform`

**Scope determines downstream behaviour:**
- **Component design stage**: runs only for `acxd-enhancement` (reusing an existing library); other scopes set flow boundaries in Flow Design (keep the conversation together)
- **Backend design/build stages**: skipped for `acxd-poc` (mock backends only) and `acxd-enhancement` (backend assumed existing)
- **Operational readiness**: skipped for `acxd-poc` (demo scope doesn't need ops runbook)
- **CI/CD pipeline complexity**: full split pipeline for `acxd-platform`, lightweight for `acxd-usecase`, manual for `acxd-poc`

Set the scope in the AI-DLC configuration:
```
scope: acxd-platform    # or acxd-usecase, acxd-enhancement, acxd-poc
```

If the engagement pattern is ambiguous, start with `acxd-usecase` — it can be upgraded to `acxd-platform` during inception if more use cases or teams emerge.
