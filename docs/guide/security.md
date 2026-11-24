# Security

The agent is instructed never to deploy, and never to look for or read AWS credentials. That is an instruction to an
AI model, not an enforced control. **Kiro's tool approvals are the control**: Kiro asks before the agent runs a shell
command or reads a file, unless you have approved it automatically.

- **Use Supervised mode** (or at least do not auto-approve shell commands) on a machine that holds AWS credentials or
  `.env` files. Review any command that mentions `aws`, `cdk deploy`, `~/.aws` or `.env` before approving it.
- **Use a least-privilege AWS profile or role** for deployment, with only the permissions the generated runbook
  needs, ideally in a sandbox account for proofs of concept.
- **Keep `.env` private.** It holds your ACXD API key. The deploy engine writes it with owner-only permissions
  (`0600`); if you create it by hand, run `chmod 600 .env`. Never commit it (it is in `.gitignore`).
- **Treat files in `customer-context/` as untrusted input.** The model reads everything you put there; a document
  could contain text that tries to redirect the agent. Kiro's approvals and your review at each gate are the defence.
  The guardrails the agent configures protect the deployed customer conversation, not the build agent.

To report a security issue, see [SECURITY.md](../../SECURITY.md).

---

[Documentation home](index.md)
