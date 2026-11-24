#!/usr/bin/env python3
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""acxd_docx_core — shared, deterministic Markdown→DOCX rendering core for the ACXD
customer-facing artefact set.

Three artefacts share ONE styling core so they read as a single set:
  1. Consolidated Scoping Document   (scoping-md-to-docx)
  2. Consolidated Deployment Runbook (acxd-md-to-docx/runbook_md_to_docx.py)
  3. ACXD Architecture Document       (acxd-md-to-docx/architecture_md_to_docx.py)

This module owns every visual decision (palette, fonts, title block, metadata table,
heading hierarchy, data tables, lists, callouts, code blocks, page breaks) so the three
converters are guaranteed identical. Per-doc converters supply only:
  - the canonical section list (for never-silently-drop completeness handling), and
  - optional block hooks (e.g. the architecture converter's Mermaid handler).

Verified against the gold-standard AnyCare Consolidated Scoping Document:
  brand line 15pt bold blue #246FB5 · title 28pt bold ink #161D26 (Normal paragraph, NOT a
  heading) · subtitle 13pt grey #535B66 · H1 17pt ink · H2 13.5pt blue · H3 11.5pt ink ·
  metadata labels bold ink on #EEF3F7 · data-table header row white-on-#246FB5 · Table Grid.

Pure python-docx. No system binaries, no network. Deterministic.
"""
import re
import sys
try:
    from docx import Document
    from docx.shared import Pt, Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
except ImportError:
    sys.stderr.write(
        'ERROR: python-docx is not installed, so the Word (.docx) converter cannot run.\n'
        'Install it, then re-run this command:\n'
        '    pip3 install python-docx\n'
    )
    raise SystemExit(1)

# ---- Brand palette (verified against the gold-standard scoping doc) ----
INK  = RGBColor(0x16, 0x1D, 0x26)   # near-black navy — title, H1, H3, metadata labels
BLUE = RGBColor(0x24, 0x6F, 0xB5)   # brand line + H2 + table header fill
TEAL = RGBColor(0x0E, 0x7C, 0x7B)   # optional accent (not used on headings)
GREY = RGBColor(0x53, 0x5B, 0x66)   # subtitle + callouts
BODY = RGBColor(0x22, 0x26, 0x2B)   # body text (Normal)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
CODE_INK = RGBColor(0x1B, 0x1F, 0x24)   # code text
HDR_FILL = "246FB5"      # data-table header row shading (blue)
META_FILL = "EEF3F7"     # metadata label cell shading (light blue-grey)
CODE_FILL = "F4F6F8"     # code block shading (very light grey)
FONT = "Calibri"
MONO = "Consolas"

_DEFAULT_PLACEHOLDER = "Not provided in the source document — to be completed."


# ============================ low-level helpers ============================

def _shade(cell, hexfill):
    """Fill a table cell — shading element appended with correct attribute order."""
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hexfill)
    tcPr.append(shd)


_INLINE = re.compile(r"(\*\*.+?\*\*|\*[^*]+\*|`[^`]+`)")


def emit_runs(paragraph, text):
    """Render markdown inline emphasis (**bold**, *italic*, `code`) into runs."""
    for seg in _INLINE.split(text):
        if not seg:
            continue
        if seg.startswith("**") and seg.endswith("**"):
            r = paragraph.add_run(seg[2:-2]); r.bold = True
        elif seg.startswith("`") and seg.endswith("`"):
            r = paragraph.add_run(seg[1:-1]); r.font.name = MONO; r.font.size = Pt(9.5); r.font.color.rgb = BLUE
        elif seg.startswith("*") and seg.endswith("*"):
            r = paragraph.add_run(seg[1:-1]); r.italic = True
        else:
            paragraph.add_run(seg)


def norm_title(text):
    """Normalise a heading for matching: drop numbering, trailing '(full)'/qualifiers, case."""
    t = re.sub(r"`[^`]*`", "", text)                 # drop inline code spans
    t = re.sub(r"^\s*\d+(\.\d+)*[.)]?\s*", "", t)     # leading "3." / "3.1)" numbering
    t = re.sub(r"\s*\([^)]*\)\s*$", "", t)            # trailing "(full)" / "(this phase)" etc.
    t = t.replace("*", "").replace("—", "-")
    return re.sub(r"\s+", " ", t).strip().lower()


def is_table_row(line):
    return line.lstrip().startswith("|") and line.rstrip().endswith("|")


def _is_separator(cells):
    return all(re.fullmatch(r":?-{2,}:?", c.strip()) for c in cells if c.strip() != "") and any(cells)


def split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


# ============================ document setup ============================

def setup_styles(doc):
    """Apply the shared style set to a fresh Document. Verified heading values."""
    n = doc.styles["Normal"]; n.font.name = FONT; n.font.size = Pt(10.5); n.font.color.rgb = BODY
    for lvl, (sz, col) in {1: (17, INK), 2: (13.5, BLUE), 3: (11.5, INK)}.items():
        st = doc.styles[f"Heading {lvl}"]
        st.font.name = FONT; st.font.size = Pt(sz); st.font.color.rgb = col; st.font.bold = True
        st.paragraph_format.space_before = Pt(10 if lvl == 1 else 6); st.paragraph_format.space_after = Pt(3)
    for s in doc.sections:
        s.top_margin = Inches(0.8); s.bottom_margin = Inches(0.8)
        s.left_margin = Inches(0.9); s.right_margin = Inches(0.9)


def page_break(doc):
    """Hard page break so the next content starts on a fresh page."""
    p = doc.add_paragraph()
    run = p.add_run()
    run.add_break(WD_BREAK.PAGE)


# ============================ block renderers ============================

def add_metadata_table(doc, rows):
    """Label/value layout table (gold standard): bold+shaded label cells in even columns,
    plain value cells in odd columns. A blank value beside a non-empty label becomes 'TBD'."""
    if not rows:
        return
    ncols = max(len(r) for r in rows)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    t = doc.add_table(rows=len(rows), cols=ncols)
    t.style = "Table Grid"; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = t.cell(ri, ci)
            cell.text = ""
            p = cell.paragraphs[0]; p.paragraph_format.space_after = Pt(1); p.paragraph_format.space_before = Pt(1)
            val_clean = re.sub(r"^\*\*(.+)\*\*$", r"\1", val.strip())
            is_label = (ci % 2 == 0)
            if not is_label and val_clean == "" and ci - 1 >= 0 and row[ci - 1].strip():
                val_clean = "TBD"
            emit_runs(p, val_clean)
            for r in p.runs:
                r.font.size = Pt(9.5)
                if is_label:
                    r.bold = True; r.font.color.rgb = INK
            if is_label:
                _shade(cell, META_FILL)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def add_data_table(doc, rows):
    """Data table: first row treated as header (bold + shaded blue, white text)."""
    if not rows:
        return
    ncols = max(len(r) for r in rows)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    t = doc.add_table(rows=len(rows), cols=ncols)
    t.style = "Table Grid"; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = t.cell(ri, ci)
            cell.text = ""
            p = cell.paragraphs[0]; p.paragraph_format.space_after = Pt(1); p.paragraph_format.space_before = Pt(1)
            is_hdr = (ri == 0)
            val_clean = re.sub(r"^\*\*(.+)\*\*$", r"\1", val.strip()) if is_hdr else val
            emit_runs(p, val_clean)
            for r in p.runs:
                r.font.size = Pt(9)
                if is_hdr:
                    r.bold = True; r.font.color.rgb = WHITE
            if is_hdr:
                _shade(cell, HDR_FILL)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def _reflow_trailing_comments(lines, lang=""):
    """For shell-style code blocks, move an inline trailing `# comment` ABOVE its command and
    put a blank line between each resulting comment/command (or bare-command) pair, so long
    'command   # comment' lines no longer wrap unreadably in the fixed-width code cell.

    Scoped to shell languages (bash/sh/zsh/console/shell or unlabelled) so JSON/TS/PY blocks,
    where '#' is not a line comment or is syntactically meaningful, are left untouched. A '#'
    is treated as a trailing comment ONLY when it is preceded by whitespace and is not inside a
    single- or double-quoted string on that line. Lines that are already a standalone comment,
    or have no inline comment, pass through unchanged (still blank-separated for readability).
    """
    if lang and lang.lower() not in ("bash", "sh", "zsh", "console", "shell", "shellsession"):
        return lines

    def split_trailing_comment(line):
        in_s = in_d = False
        for idx, ch in enumerate(line):
            if ch == "'" and not in_d:
                in_s = not in_s
            elif ch == '"' and not in_s:
                in_d = not in_d
            elif ch == "#" and not in_s and not in_d and idx > 0 and line[idx - 1] in " \t":
                return line[:idx].rstrip(), line[idx:].rstrip()
        return line.rstrip(), None

    out = []
    pairs = []  # build logical pairs first so we can blank-separate them
    for raw in lines:
        if raw.strip() == "":
            continue  # drop blank input lines; we re-insert consistent spacing between pairs
        stripped = raw.lstrip()
        if stripped.startswith("#"):
            pairs.append([raw.rstrip()])            # already a standalone comment line
            continue
        cmd, comment = split_trailing_comment(raw)
        if comment:
            pairs.append([comment, cmd])            # comment ABOVE command
        else:
            pairs.append([cmd])                     # bare command
    for k, pair in enumerate(pairs):
        if k > 0:
            out.append("")                          # blank line between pairs
        out.extend(pair)
    return out


def add_code_block(doc, lines, lang=""):
    """Render a fenced code block as a shaded, monospace, single-cell table (keeps it
    visually distinct and unbroken across the page). lang is shown as a small caption."""
    lines = _reflow_trailing_comments(lines, lang)
    if lang and lang.lower() not in ("mermaid",):
        cap = doc.add_paragraph(); cap.paragraph_format.space_after = Pt(0); cap.paragraph_format.space_before = Pt(4)
        rc = cap.add_run(lang.lower()); rc.italic = True; rc.font.size = Pt(8); rc.font.color.rgb = GREY
    t = doc.add_table(rows=1, cols=1)
    t.style = "Table Grid"; t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.cell(0, 0); cell.text = ""
    _shade(cell, CODE_FILL)
    first = True
    for ln in lines:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        p.paragraph_format.space_after = Pt(0); p.paragraph_format.space_before = Pt(0)
        r = p.add_run(ln if ln else "")
        r.font.name = MONO; r.font.size = Pt(9); r.font.color.rgb = CODE_INK
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def add_caption(doc, text):
    """Small grey italic caption (used under rendered diagrams)."""
    p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(2); p.paragraph_format.space_after = Pt(6)
    r = p.add_run(text); r.italic = True; r.font.size = Pt(9); r.font.color.rgb = GREY
    return p


def placeholder_para(doc, wording=None):
    p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(6)
    r = p.add_run(f"[ {wording or _DEFAULT_PLACEHOLDER} ]")
    r.italic = True; r.font.color.rgb = GREY


# ============================ title block ============================

def render_title_block(doc, lines, non_section_titles, canon_by_norm, is_content_section):
    """Render the leading brand line / title / subtitle exactly like the gold standard,
    consuming lines up to the first metadata table / TOC / content-section heading.

    Returns the index of the first line NOT consumed by the title block.
    """
    n = len(lines)

    def _next_nonempty(k):
        while k < n and lines[k].strip() == "":
            k += 1
        return k

    def _clean(s):
        return re.sub(r"^#{1,6}\s+", "", re.sub(r"\*\*", "", s)).strip()

    scan = _next_nonempty(0)
    tb = []
    j = scan
    while j < n and len(tb) < 3:
        s = lines[j].strip()
        if s == "":
            j += 1; continue
        if is_table_row(lines[j]):
            break
        hm = re.match(r"^(#{1,6})\s+(.*)$", s)
        if hm:
            nt = norm_title(hm.group(2))
            if nt in non_section_titles or is_content_section(nt) or re.match(r"^\d+[.)]\s", hm.group(2)):
                break
        tb.append((j, s)); j += 1

    if not tb:
        return scan

    texts = [t for _, t in tb]
    brand = title = subtitle = None
    idx = 0
    if idx < len(texts) and texts[idx].startswith("**") and texts[idx].endswith("**") and not texts[idx].startswith("# "):
        brand = _clean(texts[idx]); idx += 1
    if idx < len(texts):
        title = _clean(texts[idx]); idx += 1
    if idx < len(texts):
        subtitle = _clean(texts[idx]); idx += 1
    if brand:
        p = doc.add_paragraph(); r = p.add_run(brand); r.font.size = Pt(15); r.font.color.rgb = BLUE; r.bold = True
        p.paragraph_format.space_after = Pt(2)
    if title:
        p = doc.add_paragraph(); r = p.add_run(title); r.font.size = Pt(28); r.font.color.rgb = INK; r.bold = True
        p.paragraph_format.space_after = Pt(2)
    if subtitle:
        p = doc.add_paragraph(); r = p.add_run(subtitle); r.font.size = Pt(13); r.font.color.rgb = GREY
        p.paragraph_format.space_after = Pt(6)
    return tb[-1][0] + 1


# ============================ main render walk ============================

def render_body(
    doc,
    lines,
    start_index,
    canonical_sections,
    non_section_titles=None,
    placeholder_for=None,
    code_block_hook=None,
    metadata_max_rows=6,
):
    """Walk the markdown body from start_index and render every block.

    Parameters let each converter customise without duplicating the walk:
      canonical_sections : ordered list of expected section display-titles (completeness).
      non_section_titles : set of normalised titles that are structural (TOC etc.).
      placeholder_for    : optional fn(display_title)->str for section-specific wording.
      code_block_hook    : optional fn(doc, lang, code_lines)->bool. Return True if the
                           hook fully handled the block (e.g. Mermaid → image); else the
                           core renders it as a styled code block. Called for every fence.
      metadata_max_rows  : max rows for the leading metadata table detection.
    """
    non_section_titles = non_section_titles or {"table of contents", "contents"}
    canon_by_norm = {norm_title(s): s for s in canonical_sections}

    def is_content_section(nrm):
        return nrm in canon_by_norm and nrm not in non_section_titles

    def _placeholder(display):
        wording = placeholder_for(display) if placeholder_for else None
        placeholder_para(doc, wording)

    n = len(lines)
    i = start_index
    seen_heading = False
    seen_titles = set()
    section_has_body = {}
    cur_section = None
    toc_break_done = False
    body_break_done = False

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if stripped == "":
            i += 1; continue

        # Fenced code block (``` … ```)
        fence = re.match(r"^```\s*(\w+)?\s*$", stripped)
        if fence:
            lang = (fence.group(1) or "").strip()
            block = []
            i += 1
            while i < n and not lines[i].strip().startswith("```"):
                block.append(lines[i]); i += 1
            i += 1  # consume closing fence
            if cur_section is not None:
                section_has_body[cur_section] = True
            handled = False
            if code_block_hook is not None:
                handled = bool(code_block_hook(doc, lang, block))
            if not handled:
                add_code_block(doc, block, lang)
            continue

        # Headings
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            seen_heading = True
            level = min(len(m.group(1)), 3)
            title_raw = m.group(2)
            nrm = norm_title(title_raw)
            if not toc_break_done and nrm in non_section_titles:
                page_break(doc); toc_break_done = True
            elif not body_break_done and is_content_section(nrm):
                page_break(doc); body_break_done = True; toc_break_done = True
            if cur_section is not None and not section_has_body.get(cur_section, False):
                _placeholder(canon_by_norm.get(cur_section, cur_section))
            doc.add_heading("", level=level)
            h = doc.paragraphs[-1]
            emit_runs(h, title_raw)
            for r in h.runs:
                r.font.bold = True
            seen_titles.add(nrm)
            if level <= 2 and is_content_section(nrm):
                cur_section = nrm; section_has_body[nrm] = False
            elif level <= 2:
                cur_section = None
            elif cur_section is not None:
                section_has_body[cur_section] = True
            i += 1; continue

        # Any non-empty, non-heading line means the current section has body content.
        if cur_section is not None:
            section_has_body[cur_section] = True

        # Tables
        if is_table_row(line):
            block_rows = []
            while i < n and is_table_row(lines[i]):
                cells = split_row(lines[i])
                if not _is_separator(cells):
                    block_rows.append(cells)
                i += 1
            if not seen_heading and len(block_rows) and len(block_rows[0]) >= 4 and len(block_rows) <= metadata_max_rows:
                add_metadata_table(doc, block_rows)
            else:
                add_data_table(doc, block_rows)
            continue

        # Bullet list
        mb = re.match(r"^\s*[-*]\s+(.*)$", line)
        if mb:
            p = doc.add_paragraph(style="List Bullet"); p.paragraph_format.space_after = Pt(2)
            emit_runs(p, mb.group(1))
            i += 1; continue

        # Numbered list
        mn = re.match(r"^\s*\d+[.)]\s+(.*)$", line)
        if mn:
            p = doc.add_paragraph(style="List Number"); p.paragraph_format.space_after = Pt(2)
            emit_runs(p, mn.group(1))
            i += 1; continue

        # Blockquote / callout
        mq = re.match(r"^>\s?(.*)$", line)
        # A fenced code block INSIDE a blockquote ("> ```bash" ... "> ```") must render as a real
        # code block. Without this the fence lines fell through as italic quote text, so the ``` markers were
        # printed literally and the trailing-comment reflow never ran.
        if mq and re.match(r"^```\s*(\w+)?\s*$", mq.group(1).strip()):
            lang = (re.match(r"^```\s*(\w+)?", mq.group(1).strip()).group(1) or "").strip()
            block = []
            i += 1
            while i < n:
                inner = re.match(r"^>\s?(.*)$", lines[i])
                if not inner or inner.group(1).strip().startswith("```"):
                    break
                block.append(inner.group(1)); i += 1
            if i < n and re.match(r"^>\s?```", lines[i]):
                i += 1  # consume closing quoted fence
            if cur_section is not None:
                section_has_body[cur_section] = True
            handled = False
            if code_block_hook is not None:
                handled = bool(code_block_hook(doc, lang, block))
            if not handled:
                add_code_block(doc, block, lang)
            continue
        if mq:
            p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(6)
            emit_runs(p, mq.group(1))
            for r in p.runs:
                r.italic = True; r.font.color.rgb = GREY
            i += 1; continue

        # Horizontal rule -> skip
        if re.fullmatch(r"-{3,}|_{3,}|\*{3,}", stripped):
            i += 1; continue

        # Plain paragraph. Markdown treats a single newline inside a paragraph as a SOFT wrap
        # (a space), and only a blank line as a paragraph break. The source markdown is often
        # hard-wrapped to a console width, so greedily gather all consecutive plain lines into ONE
        # paragraph (joined by spaces) instead of emitting one Word paragraph per wrapped line.
        # Stop at anything the loop handles as its own block: blank, heading, list, table row,
        # blockquote, fence, or horizontal rule.
        def _starts_other_block(ln):
            st = ln.strip()
            if st == "":
                return True
            if re.match(r"^#{1,6}\s+", st):               # heading
                return True
            if re.match(r"^\s*[-*]\s+", ln):              # bullet
                return True
            if re.match(r"^\s*\d+[.)]\s+", ln):           # numbered
                return True
            if is_table_row(ln):                          # table
                return True
            if re.match(r"^>\s?", ln):                    # blockquote
                return True
            if re.match(r"^```", st):                     # fence
                return True
            if re.fullmatch(r"-{3,}|_{3,}|\*{3,}", st):    # horizontal rule
                return True
            return False

        para_lines = [stripped]
        i += 1
        while i < n and not _starts_other_block(lines[i]):
            para_lines.append(lines[i].strip())
            i += 1
        para_text = " ".join(para_lines).strip()

        p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(6)
        if para_text.startswith("*") and para_text.endswith("*") and not para_text.startswith("**"):
            r = p.add_run(para_text.strip("*")); r.italic = True; r.font.color.rgb = GREY
        else:
            emit_runs(p, para_text)

    # Completeness pass — never silently drop a section
    if cur_section is not None and not section_has_body.get(cur_section, False):
        _placeholder(canon_by_norm.get(cur_section, cur_section))
    missing = [s for s in canonical_sections if norm_title(s) not in seen_titles]
    if missing:
        note = doc.add_paragraph(); note.paragraph_format.space_before = Pt(8)
        rn = note.add_run("The following expected sections were not present in the source document and are "
                          "flagged for completion:")
        rn.italic = True; rn.font.color.rgb = GREY
        for s in missing:
            doc.add_heading("", level=2)
            h = doc.paragraphs[-1]; emit_runs(h, s)
            for r in h.runs:
                r.font.bold = True
            _placeholder(s)


def new_document():
    """Return a fresh Document with shared styles applied."""
    doc = Document()
    setup_styles(doc)
    return doc
