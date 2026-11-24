# Getting started

This guide installs the agent into an AI-DLC project in **Kiro IDE** and starts your first engagement. Check
[Setting up](setting-up.md) first.

> AI-DLC and this agent support a range of agent harnesses, but the agent has so far been developed and tested only
> on Kiro IDE. We recommend Kiro IDE until other harnesses are validated.

## Kiro IDE

Kiro is an AI IDE that brings structure to AI-assisted development with spec-driven workflows. We recommend
at least **8 GB of RAM** and **4 GB of free disk space**.

### Kiro IDE overview

- **The file explorer** (left) shows your project workspace, including the AI-DLC `.kiro/` harness directory
  and the files the agent produces.
- **The editor** (centre) opens files, scoping documents and the deployment artifacts the agent generates.
- **The chat panel** (right) is where you work with the agent, pick the model, and run `/aidlc` commands.
- **The integrated terminal** (**Terminal** menu, or `` Ctrl + ` ``) is where you run the install and deploy
  commands.

### Install Kiro IDE

Download and install Kiro from **[https://kiro.dev/downloads/](https://kiro.dev/downloads/)**. When you open
it for the first time:

1. Sign in and select your Kiro subscription.

   > **A Kiro Pro subscription (or greater) is required.** The agent needs **Claude Opus 4.8 or later**,
   > which is not available on the free Kiro tier. See [Kiro pricing](https://kiro.dev/pricing/).

2. Skip importing VS Code settings if prompted.
3. Choose a theme and set up the integrated shell when prompted; the install needs the shell.

---

## Create your project workspace

You use **one folder**: the project workspace. It is the folder you open in Kiro, where the AI-DLC harness
(`.kiro/`) is created and where you run the workflow.

> **Why one folder, and why the plugin source is removed later.** Kiro reads the AI-DLC harness from the
> `.kiro/` directory at the root of the folder you open, and treats everything else in that folder as context.
> You put the agent's source in this folder only to build and sync it into `.kiro/`, then delete the source
> before running any `/aidlc` command, so its stage and persona instructions never mix with the composed
> harness.

1. Create a clean, empty project folder, for example `~/Desktop/my-acxd-project`.
2. Open it in Kiro: **File > Open Folder**. If Kiro shows a trust prompt or a Restricted Mode banner, choose
   **Trust Folder & Continue** (or **Manage > Trust**); the agent cannot write into an untrusted workspace.
3. Open the Kiro integrated terminal. It opens in the folder you just opened. Run every command below from
   this terminal.

---

## Set the Kiro model

In the Kiro chat panel's model picker, select **Claude Opus 4.8 (max effort)**, the recommended model for the
agent at the time of writing.

---

## Install the AI-DLC runtime and dependencies

### Install bun

`bun` is the JavaScript runtime the AI-DLC engine uses to build the plugin. See
[bun install](https://bun.com/docs/installation) for more detail.

**1. Install bun:**

**macOS / Linux:**
```bash
curl -fsSLo bun-install.sh https://bun.sh/install   # download the installer
less bun-install.sh                                    # review it
bash bun-install.sh && rm bun-install.sh               # run it
```
**Windows (PowerShell):**
```powershell
irm bun.sh/install.ps1 -OutFile bun-install.ps1   # download, review, then run:
powershell -ExecutionPolicy Bypass -File .\bun-install.ps1
```

**2. Put bun on your PATH.** The installer places bun in `~/.bun/bin/`.

**macOS (zsh):**
```bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```
**Windows:** the installer usually adds bun to PATH. If `bun --version` fails, add `%USERPROFILE%\.bun\bin`
to your user PATH and restart your terminal.

**3. Verify bun:**
```bash
bun --version
```

**4. Install the docx converter dependency.** The agent generates the consolidated scoping document,
architecture document and deployment runbook as Word (`.docx`) files using `python-docx`:
```bash
pip3 install python-docx
```

> Some systems block system-wide `pip3` installs. If so, create a virtual environment first:
> `python3 -m venv .venv` and `source .venv/bin/activate` (Windows: `.venv\Scripts\activate`), then run the
> install command above.

### Install the AI-DLC runtime

See [AWS AI-DLC](https://github.com/awslabs/aidlc-workflows) for more detail.

**1. Install the AI-DLC workflow:**

**macOS / Linux / WSL:**
```bash
curl -fsSLo aidlc-install.sh https://github.com/awslabs/aidlc-workflows/releases/download/v2.11.0/install.sh
less aidlc-install.sh                                  # review it
sh aidlc-install.sh && rm aidlc-install.sh
```
**Windows (PowerShell):**
```powershell
irm https://github.com/awslabs/aidlc-workflows/releases/download/v2.11.0/install.ps1 -OutFile aidlc-install.ps1   # download, review, then run:
powershell -ExecutionPolicy Bypass -File .\aidlc-install.ps1
```

**2. Verify the install:**
```bash
aidlc --version
```
If this fails, open a new terminal to pick up the updated environment, re-run the bun PATH export above, and
try again.

**3. Configure the AI-DLC harness for Kiro** (creates the `.kiro/` harness in this workspace):
```bash
# answer 'y' to initialize
aidlc config --harness kiro-ide
```

**About the `aidlc config` prompts (Kiro IDE):** it runs an 8-section setup check and asks you to resolve any
section marked `[needs]`.
- **Models**: reappears each run. On Kiro IDE model policy cannot be recorded, so any choice here is advisory.
  Press **Enter** or pick **1 -> thorough**. The real model control is the Kiro chat model picker.
- **Settings scope**: press **Enter** for `project` (recommended).
- **Runtime / Providers / Trust / Workspace**: normally `[ok]` on Kiro IDE.

Full detail: [AI-DLC Getting Started](https://github.com/awslabs/aidlc-workflows/blob/main/docs/guide/01-getting-started.md).

---

## Install the Customer Experience (CX) Design Agent

The agent is an AI-DLC plugin. You put its source INTO the project workspace, build and sync it into the
`.kiro/` harness, then remove the source. After the sync the plugin lives entirely inside `.kiro/`.

### Configure the AI-DLC project

Create the inputs folder:

```bash
# a folder for the business-process / use-case files you give the agent
# (SoPs, requirements, user stories, architecture diagrams, metrics)
mkdir customer-context

# (OPTIONAL) turn on developer mode logging with this marker file. See note below.
touch customer-context/acxd-dev-mode.txt
```

**Optional: developer mode.** When `customer-context/acxd-dev-mode.txt` is present, the agent logs its
self-corrections and design decisions to `./acxd-dev-observations.md`, giving developers insight into what it
did and why. Leave the file empty for standard logging, or put a short **focus prompt** in it to ask for extra
detail on specific areas, for example:

```text
Log all knowledge base design, deployment and data ingestion decisions, and any discovery question you skip, merge or simplify.
```

Omit the file for a normal run, and delete it to turn developer mode off.

### Get the agent source

Clone this repository into the project workspace and rename the folder to `acxd`. The AI-DLC plugin tooling
resolves the plugin by this folder name, so the rename is required before the build.

```bash
# clone the source (it lands in a folder named customer-experience-design-agent)
git clone https://github.com/awslabs/customer-experience-design-agent.git

# rename the folder to acxd (required: the plugin tooling resolves the plugin by this folder name)
mv customer-experience-design-agent acxd
```

If you downloaded a zip of the source instead, extract it into the project workspace and rename the extracted
folder (`customer-experience-design-agent`, or `customer-experience-design-agent-main` for a GitHub zip) to `acxd`
the same way.

### Build the plugin and sync it into the project

**1. Build and sync:**

```bash
# the project workspace is the folder Kiro opened in (the current directory)
PROJECT_WORKSPACE=`pwd`

# the agent source folder (renamed to acxd in the previous step)
ACXD_SOURCE=$PROJECT_WORKSPACE/acxd

# Build the projection from the acxd plugin source.
# The compose-hook-absent WARNING is expected and benign.
bun .kiro/tools/aidlc-plugin-build.ts $ACXD_SOURCE kiro-ide

# Install (compose) the plugin into the project's .kiro/ harness dir
PLUGIN_ROOT=$ACXD_SOURCE/dist/kiro-ide
AIDLC_PLUGIN_ROOT="$PLUGIN_ROOT" AIDLC_PROJECT_DIR="$(pwd)" AIDLC_HARNESS_DIR=.kiro aidlc engine plugin sync
```

**2. Remove the source (IMPORTANT: do this before any `/aidlc` command):**

```bash
# remove the source now that it is built and synced into .kiro/
rm -rf $ACXD_SOURCE
```

The project workspace should now contain only `.kiro/` and `customer-context/`.

**3. Confirm the plugin is installed.** In the **Kiro chat panel**:

```
/aidlc plugin list
```

You should see the `acxd` plugin at the latest composed release version (0.1.0 at the time of writing).

## Start your ACXD engagement

In the **Kiro IDE chat panel**, select and start a scope for your engagement:

| Command | When to use |
| --- | --- |
| `/aidlc --scope acxd-platform-poc` | **Recommended starting point**: fast path to a platform solution; realistic mocked (or live) integrations, knowledge and auth, minus operationalisation |
| `/aidlc --scope acxd-platform` | Full platform build: multiple use cases, enterprise CI/CD |
| `/aidlc --scope acxd-usecase` | Single use-case delivery: one complete customer journey |
| `/aidlc --scope acxd-poc` | Rapid ACXD-only proof of concept: the fastest path to a working demo |
| `/aidlc --scope acxd-enhancement` | Enhancement to an existing ACXD deployment |

**For your first engagement, start with `acxd-platform-poc`**: the best balance of speed and
realism. Integrations, knowledge, and authentication are mocked by default (deployed API Gateway +
Lambda mocks), and you can point any source at a live endpoint when ready. It skips only the
operationalisation tail (monitoring, runbooks, cutover, CI/CD), so you validate the whole system and
establish a path to production. The work carries straight over to `acxd-usecase` or `acxd-platform`
when you productionise.

```
# Enter in the Kiro chat panel (not the terminal)
/aidlc --scope acxd-platform-poc
```

> For the full scope comparison see [Engagement scopes](scopes.md).

---

## Complete the ACXD Agent workflow

The Customer Experience (CX) Design Agent loads all of the relevant context (this can take a few minutes), then greets
you with the welcome banner below. From here you follow the process through discovery, design, build,
and deployment of an ACXD customer-experience solution.

```
     █████╗  ██████╗██╗  ██╗██████╗
    ██╔══██╗██╔════╝╚██╗██╔╝██╔══██╗
    ███████║██║      ╚███╔╝ ██║  ██║
    ██╔══██║██║      ██╔██╗ ██║  ██║
    ██║  ██║╚██████╗██╔╝ ██╗██████╔╝
    ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═════╝

    Customer Experience (CX) Design Agent
    for Amazon Connect Agentic CX Designer
    AI-Driven Development Lifecycle

Welcome — I'm the Customer Experience (CX) Design Agent. I'm your Amazon Connect Agentic CX Designer (ACXD) specialist — I'll guide you through designing, building, and deploying an enterprise-grade conversational AI solution on Amazon Connect.

We'll work through this together: discovery → design → build → deploy. Every decision goes through you — I propose, you approve. Let's get started.
```

---

[Documentation home](index.md)
