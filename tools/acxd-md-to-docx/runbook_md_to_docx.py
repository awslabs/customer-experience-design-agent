#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""runbook_md_to_docx — Consolidated Deployment Runbook (customer-facing Word doc).

Merges the three deployment source files into ONE portable runbook, styled identically to
the Consolidated Scoping Document (shared acxd_docx_core):
  1. acxd-deployment-runbook.md   (the operational runbook — pre-checks, stages, verify, rollback)
  2. acxd-promotion-runbook.md    (path to production: env model, promotion pipeline, switchover)
The deploy-engine reference (acxd-deployment-scripts.md) is NOT merged: the runbook covers everything an operator
needs; the engine reference ships in design/ for developers.

Each source file's own H1 title + metadata bullets are demoted into the merged body as an H1
section; a single gold-standard title block + metadata table is authored at the top.

Usage:
    python3 runbook_md_to_docx.py <runbook.md> [<scripts.md> <promotion.md>] [-o out.docx]
    # If only the first is given, the sibling scripts/promotion files are auto-discovered
    # (same directory, or the standard record-dir layout). Missing sources degrade gracefully.
"""
import sys, os, re, argparse

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
core = None   # acxd_docx_core (python-docx) loads only when a docx is written, so --check-only needs no extra package


def _core():
    global core
    if core is None:
        import acxd_docx_core as _c
        core = _c
    return core

# Canonical sections for the consolidated runbook (order = document order).
CANONICAL_SECTIONS = [
    # EXACT section headings a correct deployment-runbook uses (the runbook author in acxd-build-deploy.md
    # RULE 5 is instructed to emit these verbatim as `## ` headings, with any folder/detail on a SUBTITLE line
    # beneath, not inside the heading). Matching is EXACT (normalised), so these must equal the authored
    # headings; a parenthetical suffix baked into a heading would NOT match and would be mis-flagged.
    "Prerequisites",
    "Stage 1 — Backend",
    "Stage 2 — ACXD SDK",
    "Stage 3 — Amazon Connect",
    "Post-deployment Verification",
    "Rollback",
    # Sibling files merged in AFTER the runbook by this consolidator (graceful-degrade / _PLACEHOLDER on absence):
    "Path to Production",
]

# Section-specific placeholder wording where absence is meaningful.
_PLACEHOLDER = {
    "Path to Production":
        "No path-to-production runbook was provided. For a POC this may be deferred; it will "
        "capture the environment model, promotion pipeline, and mock-to-live switchover when the "
        "platform is stood up.",
}


def _placeholder_for(display):
    return _PLACEHOLDER.get(display)


def _strip_leading_title_block(text):
    """Drop a source file's own leading H1 + metadata bullets + intro blockquote, returning the
    remaining body. We re-title each merged file with a clean H1 section heading instead."""
    lines = text.split("\n")
    i = 0
    n = len(lines)
    # skip leading blanks
    while i < n and lines[i].strip() == "":
        i += 1
    # drop a leading H1
    if i < n and re.match(r"^#\s+", lines[i].strip()):
        i += 1
    # drop following metadata bullets / blank / blockquote lines until the first real heading or para
    while i < n:
        s = lines[i].strip()
        if s == "" or s.startswith("- ") or s.startswith(">"):
            i += 1; continue
        break
    return "\n".join(lines[i:]).strip()


def _discover_siblings(primary):
    """Given the deployment-runbook path, find scripts + promotion beside it or in the record dir."""
    d = os.path.dirname(primary)
    cands = {
        "scripts": ["acxd-deployment-scripts.md"],
        "promotion": ["acxd-promotion-runbook.md"],
    }
    found = {}
    for key, names in cands.items():
        for nm in names:
            p = os.path.join(d, nm)
            if os.path.exists(p):
                found[key] = p; break
            # try the operational-readiness sibling dir for promotion
            alt = os.path.join(os.path.dirname(d), "acxd-operational-readiness", nm)
            if os.path.exists(alt):
                found[key] = alt; break
    return found


def build_markdown(runbook_path, scripts_path=None, promotion_path=None, meta=None):
    """Assemble the merged consolidated-runbook markdown (title block + 3 sections)."""
    meta = meta or {}
    # Derive metadata from the runbook's own header if not supplied.
    raw = open(runbook_path, encoding="utf-8").read()
    # Pull a Scope / Date / Region hint from the first metadata bullet if present.
    scope = meta.get("scope", "")
    date = meta.get("date", "")
    region = meta.get("region", "")
    m = re.search(r"Scope:\*\*?\s*`?([\w-]+)`?", raw)
    if m and not scope:
        scope = m.group(1)
    m = re.search(r"Date:\*\*?\s*([0-9-]+)", raw)
    if m and not date:
        date = m.group(1)
    m = re.search(r"Region:\*\*?\s*`?([\w-]+)`?", raw)
    if m and not region:
        region = m.group(1)

    customer = meta.get("customer", "AnyCare Insurance")
    subtitle = meta.get("subtitle", "Deployment Runbook — Amazon Connect (ACXD)")

    head = [
        f"**{customer}**",
        "# Consolidated Deployment Runbook",
        f"**{subtitle}**",
        "",
        f"| Prepared for | {meta.get('prepared_for','')} | Scope | {scope} |",
        f"| Region | {region} | Date | {date} |",
        f"| Deployment model | {meta.get('model','Manual, developer-initiated')} | Status | {meta.get('status','')} |",
        "",
        "> This runbook brings the deployment procedure and the path to production together in one "
        "document. Every step is inlined in full, so you do not need to open any other file to run the deployment.",
        "",
        "## Table of Contents",
        "",
        "1. Deployment Procedure",
        "2. Path to Production",
        "",
        "# 1. Deployment Procedure",
        "",
        _strip_leading_title_block(raw),
    ]
    if promotion_path and os.path.exists(promotion_path):
        head += ["", "# 2. Path to Production", "",
                 _strip_leading_title_block(open(promotion_path, encoding="utf-8").read())]
    return "\n".join(head)


def check_required_content(runbook_text):
    """Return warnings for runbook content the build-deploy stage mandates but the agent can drop.

    Content checks only (headings are handled by the completeness pass). Advisory: the converter still
    writes the docx; the stage treats any warning as a failure to fix before the approval gate.
    """
    import re as _re
    warnings = []
    has_mock = "mock-integration" in runbook_text
    if has_mock:
        if not _re.search(r"(?im)^#{2,6}\s*Mock API Test Data|\*\*Mock API Test Data[.:]?\*\*", runbook_text):
            warnings.append("missing 'Mock API Test Data' table (one row per seeded mock record) after the Stage 1 smoke test")
        if not _re.search(r"set -a;\s*\.\s*\./\.env;\s*set \+a", runbook_text):
            warnings.append("Stage 1 smoke test does not source ./.env (expected: set -a; . ./.env; set +a)")
        if _re.search(r"<MockApiUrl>|<keyValue>", runbook_text):
            warnings.append("smoke test uses pasted <MockApiUrl>/<keyValue> placeholders instead of the API's $<API>_URL and credential from ./.env")
        if _re.search(r"--context\s+(mockName|apiKeyEnv)=", runbook_text):
            warnings.append("Stage 1 mock deploy passes --context mockName/apiKeyEnv; the mock APIs app reads .env, use 'npm run deploy'")
    pos_deploy = runbook_text.find("cd backend/connect/cdk")
    if pos_deploy >= 0:
        pos_hoo = runbook_text.find("`HOURS_OF_OPERATION_ARN` =")
        if pos_hoo < 0 or pos_hoo > pos_deploy:
            warnings.append("no 'HOURS_OF_OPERATION_ARN = ...' update block before the Connect deploy (set it with ACXD_DEPLOYMENT_KEY at the end of Stage 2)")
    if "ACXD_DIST=" not in runbook_text:
        warnings.append("missing ACXD_DIST=$(pwd) capture in 'Before you start'")
    return warnings


def check_blocking_content(runbook_text):
    """Return errors for content without which the runbook cannot deploy. These BLOCK the conversion."""
    import re as _re
    errors = []
    if not _re.search(r"ACXD_ENV_FILE=\.\./\.\./\.env\s+ACXD_DEPLOY_CONFIG=\.\./acxd-deploy\.config\.json\s+npm run deploy", runbook_text):
        errors.append("Stage 2 is missing the engine command "
                      "'ACXD_ENV_FILE=../../.env ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy' "
                      "(a bare 'npm run deploy' cannot find the config)")
    for step in ["Create the ACXD solution", "Review the solution", "Build and deploy the application",
                 "Test it", "Save the deployment key"]:
        if not _re.search(r"(?im)^#{3,4}\s*\d*\.?\s*" + _re.escape(step), runbook_text):
            errors.append(f"Stage 2 is missing the step '### {step}...'")
    if "mock-integration" in runbook_text and \
            not _re.search(r"(?im)^#{2,6}\s*Mock API Test Data|\*\*Mock API Test Data[.:]?\*\*", runbook_text):
        errors.append("missing 'Mock API Test Data' table (one row per seeded mock record) after the Stage 1 smoke test")
    if not _re.search(r"(?im)^#{3,4}\s*\d*\.?\s*Check your AWS access", runbook_text):
        errors.append("Prerequisites is missing the step '### 3. Check your AWS access and prepare the account for CDK' (cdk bootstrap)")
    stage1 = runbook_text.find("## Stage 1")
    if stage1 >= 0 and "cdk bootstrap" in runbook_text[stage1:]:
        errors.append("'cdk bootstrap' appears in a deploy stage; it runs once in Prerequisites only")
    return errors


def convert(runbook_path, out_path=None, scripts_path=None, promotion_path=None, meta=None):
    if scripts_path is None and promotion_path is None:
        sib = _discover_siblings(runbook_path)
        scripts_path = sib.get("scripts"); promotion_path = sib.get("promotion")
    _core()
    md = build_markdown(runbook_path, scripts_path, promotion_path, meta)
    lines = md.split("\n")
    doc = core.new_document()
    non_section = {"table of contents", "contents"}
    canon_by_norm = {core.norm_title(s): s for s in CANONICAL_SECTIONS}

    def is_content_section(nrm):
        return nrm in canon_by_norm and nrm not in non_section

    start = core.render_title_block(doc, lines, non_section, canon_by_norm, is_content_section)
    core.render_body(
        doc, lines, start,
        canonical_sections=CANONICAL_SECTIONS,
        non_section_titles=non_section,
        placeholder_for=_placeholder_for,
    )
    if out_path is None:
        out_path = os.path.splitext(runbook_path)[0].replace("acxd-deployment-runbook", "consolidated-runbook") + ".docx"
    doc.save(out_path)
    return out_path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("runbook")
    ap.add_argument("scripts", nargs="?", default=None)
    ap.add_argument("promotion", nargs="?", default=None)
    ap.add_argument("-o", "--out", default=None)
    ap.add_argument("--check-only", action="store_true",
                    help="run the blocking content checks and print every error; write no docx (no python-docx needed)")
    a = ap.parse_args()
    with open(a.runbook, encoding="utf-8") as fh:
        _errors = check_blocking_content(fh.read())
    if a.check_only:
        for e in _errors:
            print(f"ERROR runbook content: {e}")
        print("OK runbook structure" if not _errors else f"{len(_errors)} runbook structure error(s)")
        sys.exit(1 if _errors else 0)
    if _errors:
        for e in _errors:
            print(f"ERROR runbook content: {e}")
        print("Runbook NOT converted. Restore the missing content from the stage's runbook instructions, then re-run.")
        sys.exit(1)
    out = convert(a.runbook, a.out, a.scripts, a.promotion)
    print(f"WROTE {out}")
    with open(a.runbook, encoding="utf-8") as fh:
        _warns = check_required_content(fh.read())
    for w in _warns:
        print(f"WARNING runbook content: {w}")
    if not _warns:
        print("OK runbook content: test data, .env smoke test, ACXD_DIST present")
