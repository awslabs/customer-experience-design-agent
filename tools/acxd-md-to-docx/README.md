# acxd-md-to-docx — customer-facing Word converters (shared styling core)

Deterministic, purpose-built Markdown→DOCX converters for the ACXD customer-facing artefact set.
All three artefacts share **one styling core** (`acxd_docx_core.py`) so they read as a single set —
same brand line, title block, metadata table, heading hierarchy, tables, callouts, page breaks.

| Artefact | Converter | Notes |
|---|---|---|
| Consolidated Scoping Document | `../scoping-md-to-docx/scoping_md_to_docx.py` | thin entry point over the core |
| Consolidated Deployment Runbook | `runbook_md_to_docx.py` | merges deployment-runbook + deployment-scripts + promotion-runbook |
| ACXD Architecture Document | `architecture_md_to_docx.py` | layered Mermaid diagram handling |

## Usage

```bash
# Architecture document (auto-writes <name>.docx beside the source)
python3 architecture_md_to_docx.py <architecture.md> [-o out.docx]

# Consolidated runbook (auto-discovers the scripts + promotion siblings and merges them)
python3 runbook_md_to_docx.py <acxd-deployment-runbook.md> [scripts.md promotion.md] [-o out.docx]

# Scoping (unchanged CLI)
python3 ../scoping-md-to-docx/scoping_md_to_docx.py <consolidated-scoping.md> [out.docx]
```

## Styling (verified against the gold-standard AnyCare scoping doc)

- Brand line 15pt bold blue `#246FB5` · Title 28pt bold ink `#161D26` (Normal paragraph, not a heading)
  · Subtitle 13pt grey `#535B66`
- H1 17pt ink · H2 13.5pt blue · H3 11.5pt ink
- Metadata labels bold ink on `#EEF3F7`; blank value cells become **TBD** (editable by the human)
- Data-table header row white-on-`#246FB5`, Table Grid
- Code blocks: shaded single-cell monospace table
- Page breaks: TOC on its own page; first content section (Executive Summary) on a fresh page

## Mermaid diagrams (architecture doc) — layered strategy

1. **Render**: an installed `mmdc`, else `npx @mermaid-js/mermaid-cli@<MERMAID_CLI_VERSION>` (pinned in
   `architecture_md_to_docx.py`; never "latest") → PNG, embedded inline with a `Figure N.` caption.
   Set `ACXD_MERMAID=off` to skip rendering and make no network call.
2. **Fallback**: if the CLI is unavailable, a captioned shaded monospace "Mermaid source" block. Never
   hard-fails.

Set `ACXD_MERMAID=off` to force the source-block form (guaranteed-portable build).

## Missing/empty sections

Every converter carries a canonical section list. A section that is present-but-empty, or entirely absent,
is never silently dropped — its heading persists with a visible placeholder (SoP-specific wording where the
SoP is legitimately optional), so the reader can tell it was considered, not overlooked.

## Tests

`../../tests/acxd-md-to-docx/test_acxd_md_to_docx.py` — run `python3 -m unittest discover -s tests/acxd-md-to-docx`.

Pure python-docx. No system binaries required for the core (Mermaid rendering is the only optional external
tool, and it degrades gracefully). No network.
