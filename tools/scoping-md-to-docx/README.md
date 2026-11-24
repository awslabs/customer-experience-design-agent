# scoping-md-to-docx

Deterministic, professionally-styled converter for the **consolidated scoping document** —
the customer-facing artefact that directly influences whether the AIVT engagement proceeds.

Purpose-built (NOT a generic md→docx). It knows the `consolidated-scoping.md` structure and
renders each part to a fixed, branded Word style so the customer gets the same great output
every time — no per-run improvisation, no harness guesswork.

## Usage

```bash
python3 scoping_md_to_docx.py consolidated-scoping.md            # → consolidated-scoping.docx
python3 scoping_md_to_docx.py consolidated-scoping.md out.docx   # explicit output path
```

Pure `python-docx`. No system binaries, no network, deterministic.

## What it renders (matches the agreed gold standard)

- **Title block** — brand line (teal), title (navy, 28pt), subtitle (grey)
- **Metadata table** (label/value, appears before the first heading) — bold navy **shaded label
  cells** in even columns; plain value cells
- **Table of Contents** and numbered **H1** sections / **H2** sub-sections — real Word
  `Heading 1/2/3` styles (Word Navigation Pane + TOC field work)
- **Data tables** (pipe tables) — real Word tables, **bold blue shaded header row**, `Table Grid`
- **Inline** `**bold**`, `*italic*`, `` `code` ``; **bullet** and **numbered** lists
- **Italic callouts** (blockquotes and wholly-italic note lines) → grey italic
- Provenance tags (`[FROM-SOP]`, `[INFERENCE]`, `[FROM-CONTEXT]`) preserved verbatim

**Resilient fallback:** anything outside the known structure still converts cleanly as
styled paragraphs/lists/tables — a slightly-varied document never fails.

## Word-clean output

Table borders/shading are written with correct OOXML attribute order, headings use built-in
Word styles, and no external images or update-fields are emitted — so Word opens the file with
**no repair or "update fields" prompt**. That clean-open is part of the customer experience.

## Where the workflow uses it

The User Stories & Scoping stage generates `consolidated-scoping.md`, then (on user request)
runs this converter to produce `consolidated-scoping.docx`. See `acxd-user-stories.md` Step 4a.

## Tests

Tests live at the plugin root — `tests/scoping-md-to-docx/` — NOT under `tools/` (the plugin
build rejects test/fixture payload under `tools/`). Run them from there.
