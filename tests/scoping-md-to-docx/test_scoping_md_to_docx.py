#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""Deterministic tests for the scoping-md-to-docx converter.

Lives under the plugin-root tests/ (NOT tools/) so the plugin build never copies it into
installs. Reaches up into tools/scoping-md-to-docx/ to load the converter.

Run:  python3 test_scoping_md_to_docx.py
Requires python-docx (same dependency the converter uses).
"""
import importlib.util, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CONVERTER = os.path.normpath(os.path.join(HERE, "..", "..", "tools", "scoping-md-to-docx", "scoping_md_to_docx.py"))

# Load the converter module from its file path.
_spec = importlib.util.spec_from_file_location("scoping_md_to_docx", CONVERTER)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
convert = _mod.convert

from docx import Document
from docx.oxml.ns import qn

SAMPLE = """**AnyCare Insurance**

**Consolidated Scoping Document**

Conversational Quote & Policy Enquiry Assistant on Amazon Connect (ACXD)

| **Prepared for** | Head of Digital & CX | **Engagement** | ACXD platform PoC |
|---|---|---|---|
| **Scope** | acxd-platform-poc | **Status** | Scoping complete |

*Self-contained scope for the engagement.*

# Table of Contents

1.  Executive Summary
2.  Discovery Findings

# 1. Executive Summary

AnyCare wants to lift **quote completion** and reduce cost-to-serve.

# 2. Discovery Findings

## 2.1 Landscape

*Partially inferred — flagged for confirmation.*

| **Dimension** | **Finding** | **Source** |
|---|---|---|
| Process today | Advisor-led | [FROM-SOP] §4 |
| Channels | Voice and chat | [FROM-CONTEXT] |

- First consequence with `code` token
- Second consequence
"""

def _shaded(cell):
    return bool(cell._tc.findall(".//" + qn("w:shd")))

def run():
    failures = []
    with tempfile.TemporaryDirectory() as td:
        md = os.path.join(td, "consolidated-scoping.md")
        with open(md, "w", encoding="utf-8") as f:
            f.write(SAMPLE)
        out = convert(md)
        assert os.path.exists(out), "output .docx not created"
        d = Document(out)

        heads = [(p.style.name, p.text) for p in d.paragraphs if p.style.name.startswith("Heading")]
        htext = [t for _, t in heads]
        if "1. Executive Summary" not in htext: failures.append("missing H1 'Executive Summary'")
        if "2.1 Landscape" not in htext: failures.append("missing H2 '2.1 Landscape'")
        if not any(s == "Heading 2" for s, _ in heads): failures.append("no Heading 2 style applied")

        if len(d.tables) != 2: failures.append(f"expected 2 tables, got {len(d.tables)}")

        # metadata table: label cells (col 0,2) shaded; value cells (1,3) not
        meta = d.tables[0]
        r0 = meta.rows[0].cells
        if not _shaded(r0[0]) or _shaded(r0[1]) or not _shaded(r0[2]):
            failures.append("metadata table label/value shading wrong")

        # data table: full header row shaded + bold
        data = d.tables[1]
        hdr = data.rows[0].cells
        if not all(_shaded(c) for c in hdr):
            failures.append("data table header row not fully shaded")
        if not all(any(r.bold for r in c.paragraphs[0].runs) for c in hdr):
            failures.append("data table header row not bold")

        # provenance tags preserved
        alltext = "\n".join(p.text for p in d.paragraphs) + "\n" + "\n".join(
            c.text for t in d.tables for row in t.rows for c in row.cells)
        if "[FROM-SOP]" not in alltext: failures.append("provenance tag [FROM-SOP] lost")

    if failures:
        print("FAIL:")
        for f in failures: print("  -", f)
        sys.exit(1)
    print("PASS — all scoping-md-to-docx checks green")

if __name__ == "__main__":
    run()
