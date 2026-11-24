#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""Tests for the shared acxd_docx_core renderer and the runbook + architecture converters.

Locks in the gold-standard styling shared across the three customer-facing artefacts and the
layered Mermaid handling. Pure python-docx; no network, no system binaries. Run:
    python3 -m unittest discover -s tests/acxd-md-to-docx
"""
import os, sys, re, tempfile, unittest

_TESTS = os.path.dirname(os.path.abspath(__file__))
_PLUGIN = os.path.dirname(os.path.dirname(_TESTS))
_TOOLS = os.path.join(_PLUGIN, "tools", "acxd-md-to-docx")
for _p in (_TOOLS,):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import acxd_docx_core as core          # noqa: E402
import runbook_md_to_docx as runbook   # noqa: E402
import architecture_md_to_docx as arch # noqa: E402
from docx import Document              # noqa: E402
from docx.oxml.ns import qn            # noqa: E402


def _col(r):
    return str(r.font.color.rgb) if (r.font.color and r.font.color.type is not None) else None


def _fill(cell):
    e = cell._tc.find(qn("w:tcPr"))
    if e is None:
        return None
    s = e.find(qn("w:shd"))
    return s.get(qn("w:fill")) if s is not None else None


def _write(tmp, name, text):
    p = os.path.join(tmp, name)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)
    return p


RUNBOOK_MD = """# Deployment Runbook — Demo

- **Scope:** `acxd-platform-poc` · **Date:** 2026-09-10 · **Region:** `ap-southeast-2`
- **Target:** single workspace.

> intro note.

## Pre-deployment checklist

- [ ] Creds active.

## Stage 1 — Backend data source (backend/mock-integration/)

```bash
cd backend/mock-integration/cdk
npm install
npx cdk deploy
```

## Stage 2 — ACXD SDK

```bash
ACXD_DEPLOY_CONFIG=../acxd-deploy.config.json npm run deploy
```
"""

ARCH_MD = """# Demo — Architecture Document

- **Scope:** `acxd-platform-poc` · **Region:** `ap-southeast-2`
- **Date:** 2026-09-10

## 1. Executive Summary

A conversational assistant.

## 2. Solution Architecture Overview

```mermaid
flowchart LR
  A[Caller] --> B[Amazon Connect]
  B --> C[ACXD]
```

Some prose.

## 6. Security Architecture

Auth details.
"""


class TestCore(unittest.TestCase):
    def test_title_block_and_headings(self):
        tmp = tempfile.mkdtemp()
        # Force mermaid fallback so the test is deterministic and offline.
        os.environ["ACXD_MERMAID"] = "off"
        out = arch.convert(_write(tmp, "a.md", ARCH_MD))
        d = Document(out)
        # title 28pt ink, brand not required here (single # title consumed as title)
        self.assertTrue(any(r.font.size and r.font.size.pt == 28 and _col(r) == "161D26"
                            for p in d.paragraphs[:5] for r in p.runs))
        # sections promoted to H1 (## in source -> # rendered)
        h1 = [p.text for p in d.paragraphs if p.style.name == "Heading 1"]
        self.assertTrue(any(t.startswith("1. Executive Summary") for t in h1))

    def test_heading_style_values(self):
        d = core.new_document()
        self.assertEqual(d.styles["Heading 1"].font.size.pt, 17)
        self.assertEqual(str(d.styles["Heading 1"].font.color.rgb), "161D26")
        self.assertEqual(d.styles["Heading 2"].font.size.pt, 13.5)
        self.assertEqual(str(d.styles["Heading 2"].font.color.rgb), "246FB5")


class TestRunbook(unittest.TestCase):
    def test_merge_and_style(self):
        tmp = tempfile.mkdtemp()
        out = runbook.convert(_write(tmp, "acxd-deployment-runbook.md", RUNBOOK_MD),
                              meta={"prepared_for": "Head of CX", "status": "POC"})
        d = Document(out)
        # gold-standard title block
        self.assertTrue(any(r.font.size and r.font.size.pt == 28 and _col(r) == "161D26"
                            for p in d.paragraphs[:5] for r in p.runs))
        self.assertTrue(any(r.font.size and r.font.size.pt == 15 and _col(r) == "246FB5"
                            for p in d.paragraphs[:5] for r in p.runs))
        # metadata table with shaded ink label
        self.assertEqual(_fill(d.tables[0].cell(0, 0)), "EEF3F7")
        # code blocks rendered (bash) — a single-cell shaded table containing the command
        self.assertTrue(any("npx cdk deploy" in c.text
                            for t in d.tables for row in t.rows for c in row.cells))

    def test_missing_section_placeholder(self):
        tmp = tempfile.mkdtemp()
        # Runbook with only stage 1 — path to production absent -> flagged.
        md = "# Deployment Runbook — Demo\n\n- **Scope:** `x`\n\n> note\n\n## Stage 1 — Backend\n\nDeploy.\n"
        out = runbook.convert(_write(tmp, "acxd-deployment-runbook.md", md))
        d = Document(out)
        alltext = "\n".join(p.text for p in d.paragraphs)
        self.assertIn("were not present in the source", alltext)


class TestArchitectureMermaid(unittest.TestCase):
    def test_mermaid_fallback_block(self):
        tmp = tempfile.mkdtemp()
        os.environ["ACXD_MERMAID"] = "off"   # force fallback
        out = arch.convert(_write(tmp, "a.md", ARCH_MD))
        d = Document(out)
        # a Figure caption and the mermaid source block are present
        self.assertTrue(any(p.text.startswith("Figure ") for p in d.paragraphs))
        self.assertTrue(any("flowchart LR" in c.text
                            for t in d.tables for row in t.rows for c in row.cells))

    def test_all_canonical_or_flagged(self):
        tmp = tempfile.mkdtemp()
        os.environ["ACXD_MERMAID"] = "off"
        out = arch.convert(_write(tmp, "a.md", ARCH_MD))
        d = Document(out)
        # Sections 3,4,5,7,8,9,10,11 absent from the fixture -> flagged, none silently dropped.
        alltext = "\n".join(p.text for p in d.paragraphs)
        self.assertIn("were not present in the source", alltext)
        self.assertTrue(any(p.text == "Data Architecture" for p in d.paragraphs))


if __name__ == "__main__":
    unittest.main(verbosity=2)
