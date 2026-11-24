# Customer Experience (CX) Design Agent documentation

The Customer Experience (CX) Design Agent is an open-source [AI-DLC](https://github.com/awslabs/aidlc-workflows)
plugin that runs inside your IDE and takes you from a business process to a working conversational AI solution on
Amazon Connect Agentic CX Designer (ACXD). You set the direction and approve each step; the agent produces the
scoping, the design, the deployable code and a runbook.

> **Prefer a guided path?** The workshop
> [Customer Experience (CX) Design Agent: From Business Process to Live Conversational CX Agent](https://catalog.us-east-1.prod.workshops.aws/workshops/f130d600-59f4-4059-9eae-4573648d06a2/)
> walks you through installing the agent and running, deploying and testing an engagement end to end.

## User guide

1. [What is the CX Design Agent?](what-is-cx-design-agent.md)
2. [How the CX Design Agent works](how-it-works.md): the plugin, the AI-DLC lifecycle, the stages and what each produces
3. [Concepts](concepts.md): the Agentic Design Principle, the deterministic core, systems integration testing, mock
   APIs and synthetic knowledge
4. [Setting up](setting-up.md): prerequisites and dependencies
5. [Getting started](getting-started.md): install the agent in Kiro IDE and start an engagement
6. [Security](security.md)
7. [Engagement scopes](scopes.md)
8. [Deploying the solution](deploying.md)

## Developer guide

1. [Authoring flows with FlowSpec](dev-authoring-flows.md)
2. [The ACXD deploy engine](dev-deploy-engine.md)
3. [Knowledge and provenance](dev-knowledge.md)
4. [Developing the plugin](dev-developing-the-plugin.md): repository layout, development loop, tests, extending,
   developer mode, the plugin doctor and supported models
