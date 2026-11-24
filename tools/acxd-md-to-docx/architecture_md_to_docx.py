#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""architecture_md_to_docx — ACXD Architecture Document (customer-facing Word doc).

Same shared styling as the Consolidated Scoping Document (acxd_docx_core), plus a LAYERED
Mermaid diagram strategy so embedded architecture diagrams render as real pictures when the
tooling is present, and degrade gracefully when it is not:

  1. TRY  render each ```mermaid``` block to PNG via `npx @mermaid-js/mermaid-cli@<pinned>` (mmdc) and
          embed the image inline with a caption.
  2. ELSE emit a clean captioned, shaded monospace 'Diagram (Mermaid source)' block — never
          hard-fail, always deterministic and portable.

Set ACXD_MERMAID=off to force the fallback (e.g. for a guaranteed-portable build).

Usage:
    python3 architecture_md_to_docx.py <architecture.md> [-o out.docx]
"""
import sys, os, re, shutil, subprocess, tempfile, argparse

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import acxd_docx_core as core   # noqa: E402
from docx.shared import Inches   # noqa: E402

CANONICAL_SECTIONS = [
    "Executive Summary",
    "Solution Architecture Overview",
    "Flow Architecture",
    "Data Architecture",
    "Variable & State Architecture",
    "Security Architecture",
    "Observability Architecture",
    "Deployment Architecture",
    "Resource Inventory",
    "Decisions Log",
    "Path to Production",
]

_MERMAID_COUNTER = {"n": 0}


# Pinned Mermaid CLI version for the npx fallback (never fetch "latest"). Bump deliberately after testing.
# Check the current release with: npm view @mermaid-js/mermaid-cli version
MERMAID_CLI_VERSION = "11.17.0"


def _mermaid_available():
    if os.environ.get("ACXD_MERMAID", "").lower() in ("off", "0", "false", "no"):
        return False
    # mmdc via npx, or a global install
    return shutil.which("npx") is not None or shutil.which("mmdc") is not None


def _try_render_mermaid(code_lines):
    """Attempt to render a Mermaid diagram to a PNG. Returns the PNG path or None."""
    src = "\n".join(code_lines).strip()
    if not src:
        return None
    workdir = tempfile.mkdtemp(prefix="acxd-mmd-")
    mmd = os.path.join(workdir, "diagram.mmd")
    png = os.path.join(workdir, "diagram.png")
    with open(mmd, "w", encoding="utf-8") as f:
        f.write(src)
    # Prefer a direct mmdc, else the pinned npx package (no install prompt: -y). Puppeteer no-sandbox for headless.
    cfgs = []
    if shutil.which("mmdc"):
        cfgs.append(["mmdc", "-i", mmd, "-o", png, "-b", "transparent"])
    if shutil.which("npx"):
        cfgs.append(["npx", "-y", f"@mermaid-js/mermaid-cli@{MERMAID_CLI_VERSION}", "-i", mmd, "-o", png, "-b", "transparent"])
    for cmd in cfgs:
        try:
            # cmd is a fixed argument list (mmdc, or npx with the pinned MERMAID_CLI_VERSION) plus temp paths this
            # function created; no shell, and no document text reaches the command line (the diagram is in the file).
            subprocess.run(cmd, cwd=workdir, capture_output=True, timeout=120, check=True)  # nosec B603  # nosemgrep: python.lang.security.audit.dangerous-subprocess-use-audit
            if os.path.exists(png) and os.path.getsize(png) > 0:
                return png
        except Exception:
            continue
    return None


def _mermaid_hook(doc, lang, code_lines):
    """code_block_hook for render_body: handle ```mermaid``` blocks; return True if handled."""
    if (lang or "").lower() != "mermaid":
        return False
    _MERMAID_COUNTER["n"] += 1
    idx = _MERMAID_COUNTER["n"]
    png = _try_render_mermaid(code_lines) if _mermaid_available() else None
    if png:
        try:
            doc.add_picture(png, width=Inches(6.3))
            # center the image paragraph
            doc.paragraphs[-1].alignment = 1
            core.add_caption(doc, f"Figure {idx}. Architecture diagram (rendered from Mermaid).")
            return True
        except Exception:
            pass  # fall through to source block
    # Fallback — captioned styled source block
    core.add_caption(doc, f"Figure {idx}. Architecture diagram — Mermaid source "
                          f"(render with the Mermaid CLI or https://mermaid.live to view as a picture).")
    core.add_code_block(doc, code_lines, lang="mermaid-source")
    return True


def _promote_body_headings(lines, start_index):
    """Gold-standard consistency: if the document authored its top sections at '##' (with the
    single '#' used only for the title, which the title block already consumed), shift every
    heading in the body up one level (## -> #, ### -> ##, ...) so sections render as H1 like the
    scoping and runbook docs. No-op if the body already uses '#' sections. Fenced code blocks are
    left untouched (a '#' inside a ``` block is a comment, not a heading)."""
    body = lines[start_index:]
    in_fence = False
    min_level = 9
    for l in body:
        if l.strip().startswith("```"):
            in_fence = not in_fence; continue
        if in_fence:
            continue
        m = re.match(r"^(#{1,6})\s", l)
        if m:
            min_level = min(min_level, len(m.group(1)))
    if min_level != 2:
        return lines  # already H1 sections (or no headings) — leave as-is
    out = lines[:start_index]
    in_fence = False
    for l in body:
        if l.strip().startswith("```"):
            in_fence = not in_fence; out.append(l); continue
        m = re.match(r"^(#{2,6})(\s.*)$", l)
        out.append(("#" * (len(m.group(1)) - 1) + m.group(2)) if (m and not in_fence) else l)
    return out


def convert(arch_path, out_path=None, meta=None):
    _MERMAID_COUNTER["n"] = 0
    lines = open(arch_path, encoding="utf-8").read().split("\n")
    doc = core.new_document()
    non_section = {"table of contents", "contents"}
    canon_by_norm = {core.norm_title(s): s for s in CANONICAL_SECTIONS}

    def is_content_section(nrm):
        return nrm in canon_by_norm and nrm not in non_section

    start = core.render_title_block(doc, lines, non_section, canon_by_norm, is_content_section)
    lines = _promote_body_headings(lines, start)
    core.render_body(
        doc, lines, start,
        canonical_sections=CANONICAL_SECTIONS,
        non_section_titles=non_section,
        code_block_hook=_mermaid_hook,
    )
    if out_path is None:
        out_path = os.path.splitext(arch_path)[0] + ".docx"
    doc.save(out_path)
    return out_path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("architecture")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()
    out = convert(a.architecture, a.out)
    print(f"WROTE {out}")
