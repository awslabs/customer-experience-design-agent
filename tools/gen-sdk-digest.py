#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""
Generate an SDK API digest from an installed amazon-connect-acxd-sdk package (developer reference only; NOT a knowledge file loaded by the agent).

This keeps the SDK reference AUTHORITATIVE and DRIFT-FREE: it extracts field
names, types, and enums directly from the SDK's own TypeScript definitions
rather than hand-transcribing them (which would go stale silently).

USAGE (on an SDK version bump):
    1. In a scratch project:  npm install amazon-connect-acxd-sdk@<version>
    2. python3 gen-sdk-digest.py <path-to>/node_modules/amazon-connect-acxd-sdk \\
              <path-to>/knowledge/acxd-platform-agent/sdk-api-digest.md
    3. Update the 'Pinned version' the script prints; diff the output; if any
       command/field SHAPES changed, review sdk-usage-rules.md for staleness.

The installed dist-types/ remain the ultimate source of truth. This digest is a
convenience index so the agent never has to guess a field or parameter.
"""
import re, os, sys, json

# Commands that make up the Track 2 deployment surface (resource creation + build/deploy).
CORE = [
    "CreateWorkspaceCommand", "CreateSecretCommand", "CreateSlotTypeCommand", "CreateDataRequestCommand",
    "CreateKnowledgeBaseCommand", "CreateContextVariableCommand", "CreateAnalyticsTagCommand",
    "CreateGuardrailCommand", "CreateFlowCommand", "CreateApplicationCommand",
    "CreateApplicationBuildCommand", "GetApplicationBuildCommand",
    "CreateApplicationDeploymentCommand", "GetApplicationDeploymentCommand",
    "PublishKnowledgeBaseCommand", "CreateKnowledgeBaseArticleCommand",
    "ListApplicationsCommand", "ListFlowsCommand", "ListDataRequestsCommand", "ListSecretsCommand",
]


def parse_sdk(dist_types: str):
    models = open(os.path.join(dist_types, "models", "models_0.d.ts")).read()
    enums_src = open(os.path.join(dist_types, "models", "enums.d.ts")).read()
    cmd_dir = os.path.join(dist_types, "commands")

    interfaces = {}
    for m in re.finditer(r'export interface (\w+) \{(.*?)\n\}', models, re.S):
        fields = []
        for fm in re.finditer(r'^\s*(\w+)(\??):\s*([^;]+);', m.group(2), re.M):
            ftype = re.sub(r'\s+', ' ', fm.group(3).strip()).replace(' | undefined', '')
            fields.append((fm.group(1), fm.group(2) == '?', ftype))
        interfaces[m.group(1)] = fields

    enums = {}
    for m in re.finditer(r'export declare const (\w+): \{(.*?)\};', enums_src, re.S):
        enums[m.group(1)] = [v.strip('"') for v in re.findall(r'readonly \w+:\s*("[^"]*")', m.group(2))]

    commands = {}
    for f in sorted(os.listdir(cmd_dir)):
        if not f.endswith("Command.d.ts"):
            continue
        cname = f[:-5]
        src = open(os.path.join(cmd_dir, f)).read()
        inp = re.search(rf'{cname}Input extends (\w+)', src)
        outp = re.search(rf'{cname}Output extends (\w+)', src)
        commands[cname] = {"input": inp.group(1) if inp else None,
                           "output": outp.group(1) if outp else None}
    return interfaces, enums, commands


def get_version(pkg_root: str) -> str:
    return json.load(open(os.path.join(pkg_root, "package.json"))).get("version", "unknown")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    pkg_root, out_path = sys.argv[1], sys.argv[2]
    dist_types = os.path.join(pkg_root, "dist-types")
    version = get_version(pkg_root)
    interfaces, enums, commands = parse_sdk(dist_types)

    def render(name):
        if name not in interfaces:
            return None, []
        rows, nested = [], []
        for fname, opt, ftype in interfaces[name]:
            base = re.sub(r'\[\]$', '', ftype)
            if base in interfaces:
                nested.append(base)
            note = ("enum: " + ", ".join(f'`{v}`' for v in enums[base])) if base in enums else ""
            rows.append((fname, ftype, "" if opt else "**yes**", note))
        return rows, nested

    L = [f"# ACXD Node SDK — API Digest",
         "",
         "> **AUTO-GENERATED — do not hand-edit.** Regenerate with tools/gen-sdk-digest.py.",
         "> The installed dist-types/ .d.ts files remain the ultimate authority. Never guess a field.",
         "",
         "| | |", "|---|---|",
         "| **Package** | `amazon-connect-acxd-sdk` |",
         f"| **Pinned version** | **{version}** |",
         "| **Client class** | `AgenticCXDesignerClient` |",
         f"| **Totals** | {len(commands)} commands, {len(interfaces)} interfaces, {len(enums)} enums |",
         ""]

    referenced = set()
    L.append("## Commands (Track 2 deployment surface)")
    for cmd in CORE:
        if cmd not in commands:
            L.append(f"\n### {cmd}\n\n_(not in this SDK version)_")
            continue
        inp, outp = commands[cmd]["input"], commands[cmd]["output"]
        L.append(f"\n### {cmd}\n\n**Input** (`{inp}`):\n")
        rows, nested = render(inp); referenced.update(nested)
        if rows:
            L.append("| field | type | required | notes |\n|---|---|---|---|")
            L += [f"| `{fn}` | `{ft}` | {rq} | {nt} |" for fn, ft, rq, nt in rows]
        L.append(f"\n**Output** (`{outp}`):\n")
        orows, on = render(outp); referenced.update(on)
        if orows:
            L.append("| field | type |\n|---|---|")
            L += [f"| `{fn}` | `{ft}` |" for fn, ft, rq, nt in orows]

    L.append("\n---\n\n## Referenced types")
    done, queue = set(), list(referenced)
    while queue:
        t = queue.pop(0)
        if t in done:
            continue
        done.add(t)
        rows, nested = render(t)
        if rows is None:
            continue
        L.append(f"\n### {t}\n\n| field | type | required | notes |\n|---|---|---|---|")
        L += [f"| `{fn}` | `{ft}` | {rq} | {nt} |" for fn, ft, rq, nt in rows]
        queue += [n for n in nested if n not in done]

    L.append("\n---\n\n## Enums (all)")
    L.append("")
    for name in sorted(enums):
        L.append(f"- **{name}**: " + ", ".join(f'`{v}`' for v in enums[name]))

    open(out_path, "w").write("\n".join(L))
    print(f"Wrote {out_path} for amazon-connect-acxd-sdk@{version} "
          f"({len(commands)} commands, {len(interfaces)} interfaces, {len(enums)} enums)")


if __name__ == "__main__":
    main()
