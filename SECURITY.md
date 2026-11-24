# Security

## Reporting a vulnerability

If you discover a potential security issue in this project, notify AWS/Amazon Security via the
[vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/) or by email to
[aws-security@amazon.com](mailto:aws-security@amazon.com). Please do **not** create a public GitHub issue.

## Security model

- The plugin is source code that runs locally in Kiro IDE. It has no hosted service, telemetry or credentials of its own.
- The agent is instructed never to deploy and never to read AWS credentials. That is an instruction to an AI model,
  not an enforced control: **Kiro's tool approvals are the enforcement layer.** Use Supervised mode, or do not
  auto-approve shell commands, on machines that hold AWS credentials or `.env` files.
- Deployment is always a human step from the generated runbook, into your own AWS account. Use a least-privilege
  profile or role, ideally in a sandbox account for proofs of concept.
- `.env` holds your ACXD API key. It is written with owner-only permissions (`0600`) and is excluded by `.gitignore`.
- Treat documents in `customer-context/` as untrusted input; review the agent's work at every approval gate.

See [Security](docs/guide/security.md) for setup guidance.
