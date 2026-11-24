#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""scoping-md-to-docx — Consolidated Scoping Document (customer-facing Word doc).

Thin entry point over the shared acxd_docx_core renderer, so this document, the Consolidated
Deployment Runbook, and the ACXD Architecture Document are styled identically and read as one
artefact set. All visual decisions (title block, metadata table, heading hierarchy, tables,
lists, callouts, code blocks, page breaks, missing-section placeholders) live in the core.

Gold-standard skeleton the user-stories stage authors (Step 4a):
    **<Customer Name>**
    # Consolidated Scoping Document
    **<Solution subtitle on Amazon Connect (ACXD)>**

    | Prepared for | … | Engagement | … |
    | Authoritative source | … | Scope baseline | … |
    | Scope | … | Status | … |

    > intro note
    ## Table of Contents
    …
    # 1. Executive Summary
    …

Usage:
    python3 scoping_md_to_docx.py <input.md> [output.docx]
"""
import sys, os

_HERE = os.path.dirname(os.path.abspath(__file__))
_CORE_DIR = os.path.join(os.path.dirname(_HERE), "acxd-md-to-docx")
for _p in (_CORE_DIR, _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)
import acxd_docx_core as core   # noqa: E402

# Canonical scoping sections, in order (completeness — never silently drop one).
CANONICAL_SECTIONS = [
    "Executive Summary",
    "Use Case Overview",
    "Discovery Findings",
    "Standard Operating Procedure Deconstruction",
    "Use Case Priority",
    "Guardrails & Sensitive Topics",
    "User Stories & Deliverables",
    "External Interfaces Requiring Approval",
    "Out of Scope",
]

_PLACEHOLDER = {
    "Standard Operating Procedure Deconstruction":
        "No Business Process Document / SoP was provided for this engagement, so there is no "
        "deconstruction to report. If one is supplied, this section will capture the step-by-step "
        "agent / human / hybrid breakdown.",
}


def _placeholder_for(display):
    return _PLACEHOLDER.get(display)


def convert(md_path, out_path=None):
    lines = open(md_path, "r", encoding="utf-8").read().split("\n")
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
        out_path = os.path.splitext(md_path)[0] + ".docx"
    doc.save(out_path)
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python3 scoping_md_to_docx.py <input.md> [output.docx]", file=sys.stderr)
        sys.exit(2)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else None
    out = convert(src, dst)
    print(f"WROTE {out}")
