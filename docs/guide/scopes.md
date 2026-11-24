# Engagement scopes

A **scope** sets how deeply each stage runs and which steps fire, so a fast proof of concept and a full platform build
follow proportionate paths. Start with `acxd-platform-poc`.

|  | `acxd-platform` | `acxd-usecase` | `acxd-platform-poc` | `acxd-poc` | `acxd-enhancement` |
| --- | --- | --- | --- | --- | --- |
| **Goal** | Multi-use-case platform with reusable architecture | One production-ready customer journey | Validate a realistic platform slice + path to production | Demo ACXD itself, fast | Add/modify flows on existing platform |
| **Depth** | Comprehensive | Standard | Standard | Minimal | Minimal |
| **Relative speed** | Most comprehensive | Moderate | Fast | Fastest | Fast |
| **CX Discovery** | ✅ Full | ✅ Full | ✅ Full | ✅ Scoped to one UC | ❌ Skipped |
| **Platform Config** | ✅ Multi-env, multi-team | ✅ Standard | ✅ Standard | ✅ Minimal (single workspace) | ✅ Verify existing |
| **User Stories & Scoping** | ✅ Full | ✅ Full | ✅ Full | ✅ Light | ✅ Scopes the change |
| **Flow Design** | ✅ Cross-UC comparison | ✅ Full | ✅ Full | ✅ Simplified | ❌ Skipped |
| **Component Design** | ❌ Not used (flow boundaries set in Flow Design) | ❌ Not used | ❌ Not used | ❌ Not used | ✅ Brownfield discovery (reuse an existing library) |
| **Backend Design & Build** | ✅ CDK; one mock API per OpenAPI file | ✅ CDK; one mock API per OpenAPI file | ✅ Deployed mocks by default; real contracts / live test endpoint optional | ❌ Skipped (no external backend) | ❌ Existing backend |
| **API Mock** | ✅ Static or API Gateway–hosted | ✅ Static or API Gateway–hosted | ✅ Static or API Gateway–hosted | ✅ ACXD static (inline) only | ✅ Static or API Gateway–hosted |
| **External Authentication** | ✅ Full (vetted auth patterns) | ✅ Full (vetted auth patterns) | ✅ Full (vetted auth patterns) | ❌ None (simulated via static mock) | ✅ Existing |
| **Synthetic Knowledge Base Content** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Operational Readiness** | ✅ Full (monitoring, runbook, cutover, onboarding guide) | ✅ Full | ✅ Light (architecture doc + distribution only) | ✅ Light (architecture doc + distribution only) | ❌ Skipped |
| **Summary and learnings prompts** | ✅ On | ✅ On | ❌ Off (faster run; gates still apply) | ❌ Off | ✅ On |
| **Architecture Document** | ✅ Consolidated handover doc | ✅ Consolidated handover doc | ✅ Full (with path to production) | ✅ Simplified (mocked APIs as blocks, path to production) | ❌ Not produced |
| **CI/CD Pipeline** | ✅ Full split pipeline | ✅ Standard | ❌ Skipped (deferred to production) | ❌ Manual deploy | ❌ Uses existing |
| **Output** | Production platform + handover pack for sprint teams | Production-deployable solution | Realistic platform slice + architecture doc + path to production | Working conversation in ACXD test widget | Updated flows on existing platform |

### Choosing a scope

| Command | When to use |
| --- | --- |
| `/aidlc --scope acxd-platform-poc` | **Recommended starting point**: realistic mocked (or live) integrations, knowledge and auth, minus operationalisation |
| `/aidlc --scope acxd-platform` | Full platform build: multiple use cases, enterprise CI/CD |
| `/aidlc --scope acxd-usecase` | Single use-case delivery: one complete customer journey |
| `/aidlc --scope acxd-poc` | Rapid ACXD-only proof of concept: the fastest path to a working demo |
| `/aidlc --scope acxd-enhancement` | Enhancement to an existing ACXD deployment |


---

[Documentation home](index.md)
