# Setting up

Before you install, check you have the following.

## Prerequisites

| Requirement | Notes |
|---|---|
| **Kiro IDE** | Installed below. A **Kiro Pro** subscription (or greater) is required. |
| **An AWS account** | With access to **Amazon Connect** and **ACXD** in an ACXD-supported region. Needed to deploy, not to install. |
| **AWS credentials** | For your AWS account. Needed to deploy, not to install. |
| **An Amazon Connect instance** | An existing instance you have admin access to, in the same region. The solution never creates one; if you need one, see [Create an Amazon Connect instance](https://docs.aws.amazon.com/connect/latest/adminguide/amazon-connect-instances.html). Needed to deploy, not to install. |

---

## Software dependencies

**Install these yourself first (not covered by the steps below):**

| Dependency | Version | Why it is needed |
|---|---|---|
| **Node.js** | 26 LTS (minimum 22.x) | Runs the AWS CDK and the ACXD deploy engine (`npx tsx`) at deploy time. Includes `npm` / `npx`. |
| **Git** | any recent version | Clones this repository. |
| **AWS CLI** | v2 | Configures and verifies your AWS credentials (`aws sts get-caller-identity`); used by the deploy steps. |
| **Python** | 3.12 | The agent generates its Word (`.docx`) documents with `python-docx` (installed below). 3.12 also matches the runtime of the mock integration backend (an AWS Lambda), so you can run or edit it locally. |
| **A modern web browser** | current Chrome / Edge / Firefox / Safari | For the AWS console and the ACXD test widget. |

**The steps below install these for you:**

| Dependency | Installed in | Purpose |
|---|---|---|
| **Kiro IDE** | Install Kiro IDE | The AI IDE that runs the agent. |
| **bun** | Install bun | JavaScript runtime used to build the plugin and run the AI-DLC tools. |
| **AI-DLC runtime** | Install the AI-DLC runtime | The `aidlc` CLI and harness the plugin runs inside. |

> **Corporate laptops:** installing Kiro, bun, Node and the AI-DLC runtime may need administrator
> privileges, and some corporate networks block the install endpoints (`kiro.dev`, `bun.sh`, `github.com`).

---

[Documentation home](index.md)
