# -*- coding: utf-8 -*-
"""
extract-pdf-panchanga.py
=======================
Production extraction of panchanga data from "PDF Calendar PV.pdf"
(12 monthly wall-calendar pages, year 2026) using ONLY the PDF text layer
(pymupdf page.get_text("words")). No OCR.

Kannada words in the PDF use the legacy Nudi font encoding. Tokens are mapped
to Kannada via the baked NUDI_NAME_MAP (source:
.playwright-mcp/pdf-bootstrap-map4.txt, majority names) plus a small manual
override dict. We do NOT algorithmically decode the Nudi encoding.

Outputs:
  data/pdf-panchanga-data.json     per-date extracted fields (all 365 dates)
  data/pdf-extraction-report.txt   coverage / diagnostics report
"""
import io
import json
import re
from collections import Counter, defaultdict
from datetime import date as dtdate

import pymupdf

PDF_PATH = "PDF Calendar PV.pdf"

# ---------------------------------------------------------------------------
# Baked token -> Kannada name map.
# Source: .playwright-mcp/pdf-bootstrap-map4.txt (TITHI MAP + NAKSHATRA MAP,
# majority names). Tithi and nakshatra tokens do not collide.
# ---------------------------------------------------------------------------
NUDI_NAME_MAP = {
    'C£ÀÆgÁzsÀ': 'ಅನೂರಾಧ',
    'CªÀiÁªÁ¸Éå': 'ಅಮಾವಾಸ್ಯೆ',
    'C±ÉèÃµÀ': 'ಅಶ್ಲೇಷ',
    'C²é¤': 'ಅಶ್ವಿನಿ',
    'CµÀÖ«Ä': 'ಅಷ್ಟಮಿ',
    'CμÀÖ«Ä': 'ಅಷ್ಟಮಿ',
    'DjzÁæ': 'ಆರಿದ್ರಾ',
    'D±ÉèÃµÀ': 'ಆಶ್ಲೇಷ',
    'D±ÉèÃμÀ': 'ಆಶ್ಲೇಷ',
    'GvÀÛgÀ': 'ಉತ್ತರ',
    'GvÀÛgÁ': 'ಉತ್ತರಾ',
    'GvÀÛgÁ¨sÁzÀæ': 'ಉತ್ತರಾಭಾದ್ರ',
    'GvÀÛgÁµÁqsÀ': 'ಉತ್ತರಾಷಾಢ',
    'GvÀÛgÁμÁqsÀ': 'ಉತ್ತರಾಷಾಢ',
    'KPÁzÀ²': 'ಏಕಾದಶಿ',
    'PÀÈwÛPÁ': 'ಕೃತ್ತಿಕಾ',
    'ZÀvÀÄzÀð²': 'ಚತುರ್ದಶಿ',
    'ZËw': 'ಚೌತಿ',
    'avÀÛ': 'ಚಿತ್ತ',
    'avÁÛ': 'ಚಿತ್ತಾ',
    'eÉåÃµÀ×': 'ಜ್ಯೇಷ್ಠ',
    'gÉÃªÀw': 'ರೇವತಿ',
    'gÉÆÃ»tÂ': 'ರೋಹಿಣಿ',
    'vÀ¢UÉ': 'ತದಿಗೆ',
    'vÀæAiÉÆÃzÀ²': 'ತ್ರಯೋದಶಿ',
    'zsÀ¤µÀ×': 'ಧನಿಷ್ಠ',
    'zsÀ¤µÁÖ': 'ಧನಿಷ್ಠಾ',
    'zÀ±À«Ä': 'ದಶಮಿ',
    'zÁézÀ²': 'ದ್ವಾದಶಿ',
    '£ÀªÀ«Ä': 'ನವಮಿ',
    '£ÀªÀÄ«Ä': 'ನವಮಿ',
    '¥ÀAZÀ«Ä': 'ಪಂಚಮಿ',
    '¥ÀÅ£ÀªÀð¸ÀÄ': 'ಪುನರ್ವಸು',
    '¥ÀÅ¨Áâ': 'ಪುಬ್ಬ',
    '¥ÀÅµÀå': 'ಪುಷ್ಯ',
    '¥ÀÅμÀå': 'ಪುಷ್ಯ',
    '¥ÀÇtÂðªÀiÁ': 'ಪೂರ್ಣಿಮಾ',
    '¥ÀÇªÀð¨sÁzÀæ': 'ಪೂರ್ವಭಾದ್ರ',
    '¥ÀÇªÁð¨sÁzÀæ': 'ಪೂರ್ವಾಭಾದ್ರ',
    '¥ÀÇªÁðµÁqsÀ': 'ಪೂರ್ವಾಷಾಢ',
    '¥ÀÇªÁðμÁqsÀ': 'ಪೂರ್ವಾಷಾಢ',
    '¥ÁqÀå': 'ಪಾಡ್ಯ',
    '¨sÀgÀtÂ': 'ಭರಣಿ',
    '©¢UÉ': 'ಬಿದಿಗೆ',
    'ªÀÄR': 'ಮಘ',
    'ªÀÄÆ®': 'ಮೂಲ',
    'ªÀÄÈUÀ²gÀ': 'ಮೃಗಶಿರ',
    'ªÀÄÈUÀ²gÁ': 'ಮೃಗಶಿರಾ',
    '«±ÁR': 'ವಿಶಾಖ',
    '±ÀvÀ©üµÀ': 'ಶತಭಿಷ',
    '±ÀvÀ©üμÀ': 'ಶತಭಿಷ',
    '±ÀæªÀt': 'ಶ್ರವಣ',
    '¸À¥ÀÛ«Ä': 'ಸಪ್ತಮಿ',
    '¸Áéw': 'ಸ್ವಾತಿ',
    'ºÀ¸ÀÛ': 'ಹಸ್ತ',
    'ºÀ¸ÁÛ': 'ಹಸ್ತಾ',
    'μÀ¶×': 'ಷಷ್ಠಿ',
    # fragment-suffixed / variant tokens (baked verbatim from the map)
    '(¨É.¸Áéw(¨É.eÁ.': 'ಸ್ವಾತಿ',
    '+GvÀÛgÁ¨sÁzÀæ': 'ಉತ್ತರಾಭಾದ್ರ',
    'C£ÀÆgÁzsÀ(¢£À¥ÀÇwð)': 'ಅನೂರಾಧ',
    'C£ÀÆgÁzsÀ(¨É.': 'ಅನೂರಾಧ',
    'C£ÀÆgÁzsÀ(¸Á.': 'ಅನೂರಾಧ',
    'C²é¤(gÁ.': 'ಅಶ್ವಿನಿ',
    'CµÀÖ«Ä(¢£À¥ÀÇwð)': 'ಅಷ್ಟಮಿ',
    'CµÀÖ«Ä(¨É.': 'ಅಷ್ಟಮಿ',
    'DjzÁæ(¸Á.': 'ಆರಿದ್ರಾ',
    'DjzÁæ+': 'ಆರಿದ್ರಾ',
    'D±ÉèÃµÀ(gÁ.': 'ಆಶ್ಲೇಷ',
    'D±ÉèÃµÀ(ªÀiÁ.': 'ಆಶ್ಲೇಷ',
    'GvÀÛgÁ(gÁ.': 'ಉತ್ತರಾ',
    'GvÀÛgÁ¨sÁzÀæ(ªÀÄ.': 'ಉತ್ತರಾಭಾದ್ರ',
    'GvÀÛgÁµÁqsÀ(¢£À¥ÀÇwð)': 'ಉತ್ತರಾಷಾಢ',
    'KPÁzÀ²(ªÀÄ.': 'ಏಕಾದಶಿ',
    'PÀÈwÛPÁ(¨É.': 'ಕೃತ್ತಿಕಾ',
    'ZËw(¨É.': 'ಚೌತಿ',
    'avÁÛ(gÁ.': 'ಚಿತ್ತಾ',
    'avÁÛ(¨É.eÁ': 'ಚಿತ್ತಾ',
    'eÉåÃµÀ×(gÁ.': 'ಜ್ಯೇಷ್ಠ',
    'gÉÃªÀw(gÁ.': 'ರೇವತಿ',
    'vÀæAiÉÆÃzÀ²(gÁ': 'ತ್ರಯೋದಶಿ',
    'vÀæAiÉÆÃzÀ²(¢£À¥ÀÇwð)': 'ತ್ರಯೋದಶಿ',
    'zsÀ¤µÀ×(¨É.eÁ': 'ಧನಿಷ್ಠ',
    '¥ÀAZÀ«Ä(¢£À¥ÀÇwð)': 'ಪಂಚಮಿ',
    '¥ÀÅ¨Áâ(gÁ.': 'ಪುಬ್ಬ',
    '¥ÀÇªÁðµÁqsÀ(¢£À¥ÀÇwð)': 'ಪೂರ್ವಾಷಾಢ',
    '¥ÁqÀå(¢£À¥ÀÇwð)': 'ಪಾಡ್ಯ',
    'ªÀÄR(gÁ.': 'ಮಘ',
    'ªÀÄÆ®(gÁ.': 'ಮೂಲ',
    'ªÀÄÆ®(¢£À¥ÀÇwð)': 'ಮೂಲ',
    'ªÀÄÆ®(ªÀÄ': 'ಮೂಲ',
    '«±ÁR(¢£À¥ÀÇwð)': 'ವಿಶಾಖ',
    '«±ÁR(¨É.': 'ವಿಶಾಖ',
    '«±ÁR(ªÀiÁ.¨É': 'ವಿಶಾಖ',
    '«±ÁR(ªÀÄ.': 'ವಿಶಾಖ',
    '±ÀvÀ©üµÀ(¨É.': 'ಶತಭಿಷ',
    '±ÀæªÀt(¢£À¥ÀÇwð)': 'ಶ್ರವಣ',
    '±ÀæªÀt(¨É.': 'ಶ್ರವಣ',
    '¸À¥ÀÛ«Ä(ªÀiÁ.¨É.': 'ಸಪ್ತಮಿ',
    '¸À¥ÀÛ«ÄeÁ.': 'ಸಪ್ತಮಿ',
    '¸Áéw(gÁ.': 'ಸ್ವಾತಿ',
    '¸Áéw(¢£À¥ÀÇwð)': 'ಸ್ವಾತಿ',
    '¸Áéw(ªÀÄ.': 'ಸ್ವಾತಿ',
    'ºÀ¸ÁÛ(gÁ.': 'ಹಸ್ತಾ',
    'ºÀ¸ÁÛ(¨É.': 'ಹಸ್ತಾ',
}

# Manual corrections on top of the baked map (from the validated prototype):
OVERRIDES = {
    'KPÁzÀ²(¢£À¥ÀÇwð)': 'ಏಕಾದಶಿ',   # map said ದಶಮಿ (total=1) - wrong
    'C£ÀÄgÁzsÀ': 'ಅನುರಾಧ',           # PDF prints ಅನುರಾಧ (July page, u-matra); no trailing ಾ
}

# ---------------------------------------------------------------------------
# Layout constants (verified on all 12 pages)
# ---------------------------------------------------------------------------
DATE_RE = re.compile(r"^[^\d]{0,4}(\d{1,2})[^\d]{0,2}$")
TIME_RE = re.compile(r"^\(?([^\d(]{0,12}?)(\d{1,2})[.](\d{2})\)?$")
NEXTDAY_MARKER = "(¢£À¥ÀÇwð)"            # "(ಮರುದಿನ)" - full-day marker

PREFIX_MAP = {
    "gÁ": "night",          # ರಾತ್ರಿ
    "¨É": "morning",        # ಬೆಳಿಗ್ಗೆ
    "ªÀÄ": "afternoon",     # ಮಧ್ಯಾಹ್ನ
    "¸Á": "evening",        # ಸಾಯಂಕಾಲ
    "ªÀiÁ.¨É": "nextmorning",  # ಮಾ.ಬೆ. - ಮಾರನೇ ದಿನ ಬೆಳಿಗ್ಗೆ
}

HEADER_TITHI = "wy"
HEADER_NAKSHATRA = "£ÀPÀëvÀæ"
HEADER_SHAKA = "±Á°ªÁºÀ£À"            # ಶಾಲಿವಾಹನ
HEADER_SAMVATSARA = "¸ÀAªÀvÀìgÀ"      # ಸಂವತ್ಸರ

SAMVATSARA_MAP = {
    "«±ÁéªÀ¸ÀÄ": "ವಿಶ್ವಾವಸು",
    "¥ÀgÁ¨sÀªÀ": "ಪರಾಭವ",
    "¥ÀgÁ¨sÁªÀ": "ಪರಾಭವ",
}

# Kala labels in Unicode (grid is rendered in Unicode Kannada on the pages).
KALA_LABELS = {
    "ರಾಹು": "rahu",
    "ಗುಳಿಕ": "gulika",
    "ಯಮಗಂಡ": "yamaganda",
}

# Standard weekday kala slot table: 12h printed form + 24h output.
STANDARD_KALA = {
    "Sunday":    {"rahu":      ("4.30", "6.00", "16:30 - 18:00"),
                  "gulika":    ("3.00", "4.30", "15:00 - 16:30"),
                  "yamaganda": ("12.00", "1.30", "12:00 - 13:30")},
    "Monday":    {"rahu":      ("7.30", "9.00", "07:30 - 09:00"),
                  "gulika":    ("1.30", "3.00", "13:30 - 15:00"),
                  "yamaganda": ("10.30", "12.00", "10:30 - 12:00")},
    "Tuesday":   {"rahu":      ("3.00", "4.30", "15:00 - 16:30"),
                  "gulika":    ("12.00", "1.30", "12:00 - 13:30"),
                  "yamaganda": ("9.00", "10.30", "09:00 - 10:30")},
    "Wednesday": {"rahu":      ("12.00", "1.30", "12:00 - 13:30"),
                  "gulika":    ("10.30", "12.00", "10:30 - 12:00"),
                  "yamaganda": ("7.30", "9.00", "07:30 - 09:00")},
    "Thursday":  {"rahu":      ("1.30", "3.00", "13:30 - 15:00"),
                  "gulika":    ("9.00", "10.30", "09:00 - 10:30"),
                  "yamaganda": ("6.00", "7.30", "06:00 - 07:30")},
    "Friday":    {"rahu":      ("10.30", "12.00", "10:30 - 12:00"),
                  "gulika":    ("7.30", "9.00", "07:30 - 09:00"),
                  "yamaganda": ("3.00", "4.30", "15:00 - 16:30")},
    "Saturday":  {"rahu":      ("9.00", "10.30", "09:00 - 10:30"),
                  "gulika":    ("6.00", "7.30", "06:00 - 07:30"),
                  "yamaganda": ("1.30", "3.00", "13:30 - 15:00")},
}
DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
             "Friday", "Saturday"]

DAYS_IN_MONTH = {1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30,
                 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def clean_name_for_lookup(name_raw):
    """Strip time-prefix/nextday fragments and stray artifacts from a raw
    joined name token, yielding the base token for map lookup."""
    name = name_raw.strip()
    name = re.sub(r"\([^()]*$", "", name)     # trailing '(prefix' fragment
    name = re.sub(r"^\([^.\d]*\.", "", name)  # leading '(xxx.' fragment
    name = re.sub(r"eÁ\.?$", "", name)        # stray 'eÁ.' suffix
    name = name.strip(" .+")
    # unify Nudi glyph variants of µ/μ (Greek mu vs micro sign)
    name = name.replace("\u00b5", "\u03bc")
    return name


def resolve_prefix(pre):
    """Normalise a raw time prefix (may carry stray 'eÁ' artifacts, extra dots
    or a doubled prefix) into a known prefix kind, or None."""
    pre = pre.replace(" ", "")
    pre = re.sub(r"eÁ\.?", "", pre)           # stray 'eÁ'/'eÁ.' artifacts
    while pre.endswith("."):
        pre = pre[:-1]
    while pre.startswith("."):
        pre = pre[1:]
    if pre in PREFIX_MAP:
        return PREFIX_MAP[pre]
    # doubled / repeated prefix: '¨É.¨É' -> '¨É'
    parts = [p for p in pre.split(".") if p]
    if len(parts) >= 2 and len(set(parts)) == 1 and parts[0] in PREFIX_MAP:
        return PREFIX_MAP[parts[0]]
    if pre.startswith("ªÀiÁ"):
        return "nextmorning"
    return None


def parse_time_token(token):
    """Parse a reconstructed time token like '(gÁ.8.46)'.
    Returns (ends_at, next_day) or ('UNKNOWN', reason) when unparsable."""
    m = TIME_RE.match(token)
    if not m:
        return "UNKNOWN", token
    pre = m.group(1)
    h, mi = int(m.group(2)), m.group(3)
    kind = resolve_prefix(pre)
    if kind is None:
        return "UNKNOWN", pre
    if kind == "morning":
        hh = h
    elif kind in ("afternoon", "evening"):
        hh = h + 12 if h < 12 else h
    elif kind == "night":
        hh = h + 24 if h <= 5 else (24 if h == 12 else (h + 12 if h < 12 else h))
    else:  # nextmorning
        hh = h + 24
    return "%d.%s" % (hh, mi), hh >= 24


def cell_time(name_raw, time_words):
    """Reconstruct the full time token for one panchanga cell.
    Returns (ends_at, next_day, raw_time, full_day, unparsed_prefix) where
    ends_at is None when there is no numeric time."""
    full_day = False
    if name_raw.endswith(NEXTDAY_MARKER):
        full_day = True
    # trailing '(prefix' fragment glued onto the name is part of the time
    m = re.search(r"\([^()]*$", name_raw)
    frag = m.group(0) if m else ""
    # stray 'eÁ'/'eÁ.' suffix is the leftover of a '(¨É.' fragment
    if not frag and re.search(r"eÁ\.?$", name_raw):
        frag = "(¨É."
    if full_day:
        # nextday marker *is* the cell content; no numeric time printed.
        # nextDay=false / full-day semantics (matches the validated OCR data).
        return None, False, NEXTDAY_MARKER, True, None
    if frag:
        combined = re.sub(r"^\+|\+$", "", frag + "".join(time_words))
        if time_words:
            ends, nd = parse_time_token(combined)
            if ends != "UNKNOWN":
                return ends, nd, combined, False, None
            # the fragment was a stray (e.g. next-day prefix belonging to
            # another row); fall back to the time words alone
            ends, nd = parse_time_token(re.sub(r"^\+|\+$", "", "".join(time_words)))
            if ends != "UNKNOWN":
                return ends, nd, re.sub(r"^\+|\+$", "", "".join(time_words)), False, None
            return None, None, combined, False, (nd, combined)
        # only a dangling prefix fragment - nothing numeric to parse
        return None, None, combined, False, None
    # no fragment: time words stand alone
    if not time_words:
        return None, None, None, False, None
    combined = re.sub(r"^\+|\+$", "", "".join(time_words))
    if combined.endswith(NEXTDAY_MARKER):
        return None, False, NEXTDAY_MARKER, True, None
    ends, nd = parse_time_token(combined)
    if ends == "UNKNOWN":
        return None, None, combined, False, (nd, combined)
    return ends, nd, combined, False, None


def pair_column(ws):
    """Pair one column's words into (y, name_raw, time_words) rows.
    ws: words (x0, y0, x1, word) in this column.
    A row closes when a digit word or the next-day marker appears."""
    ws = sorted(ws, key=lambda w: (w[1], w[0]))
    rows = []
    name_words, time_words = [], []

    def flush(anchor_y):
        y = name_ys[0] if name_ys else (time_ys[0] if time_ys else anchor_y)
        rows.append((y, "".join(name_words), list(time_words)))

    name_ys, time_ys = [], []
    for (x, y, x1, t) in ws:
        if t == "+":
            continue
        # merged word like 'ªÀÄR(ªÀÄ.2.52)' = name + (time)
        mm = re.match(r"^([^\d(]+)(\(.*)$", t)
        if mm:
            name_words.append(mm.group(1))
            name_ys.append(y)
            t = mm.group(2)
        if re.search(r"\d", t) or t == NEXTDAY_MARKER:
            time_words.append(t)
            time_ys.append(y)
            flush(y)
            name_words, time_words = [], []
            name_ys, time_ys = [], []
        else:
            name_words.append(t)
            name_ys.append(y)
    if name_words or time_words:
        flush(ws[-1][1] if ws else 0.0)
    return rows


def align_rows_to_anchors(rows, anchors, gap_cost=40.0):
    """Align column rows (each (y, name_raw, time_words), in y-order) to date
    anchors via DP minimising |row_y - anchor_y| plus a penalty for rows that
    lack a time word (dangling fragments) or a name.
    Returns list aligned to anchors (one row per anchor, or None)."""

    def row_cost(row, ay):
        y, name, times = row
        c = abs(y - ay)
        if not times:
            c += 30.0      # dangling row (fragment, no numeric time)
        if not name:
            c += 20.0      # no name
        return c

    N = len(anchors)
    M = len(rows)
    INF = float("inf")
    dp = [[INF] * (M + 1) for _ in range(N + 1)]
    for i in range(N + 1):
        for j in range(M + 1):
            if i == 0 and j == 0:
                dp[i][j] = 0.0
            elif i == 0:
                dp[i][j] = dp[i][j - 1] + gap_cost      # extra row
            elif j == 0:
                dp[i][j] = dp[i - 1][j] + gap_cost      # missing row
            else:
                match = dp[i - 1][j - 1] + row_cost(rows[j - 1], anchors[i - 1][1])
                skip_row = dp[i][j - 1] + gap_cost
                skip_anchor = dp[i - 1][j] + gap_cost
                dp[i][j] = min(match, skip_row, skip_anchor)
    # backtrack
    aligned = [None] * N
    i, j = N, M
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            match = dp[i - 1][j - 1] + row_cost(rows[j - 1], anchors[i - 1][1])
            if abs(dp[i][j] - match) < 1e-9:
                aligned[i - 1] = rows[j - 1]
                i -= 1
                j -= 1
                continue
        if j > 0 and abs(dp[i][j] - (dp[i][j - 1] + gap_cost)) < 1e-9:
            j -= 1
            continue
        # skip anchor (missing row)
        i -= 1
    return aligned


# ---------------------------------------------------------------------------
# Page header data: shaka year + samvatsara
# ---------------------------------------------------------------------------
def extract_month_header(words):
    """Return (samvatsara, shaka_year, notes) for one page."""
    # group words into lines
    lines = {}
    for x, y, x1, t in words:
        lines.setdefault(round(y, 1), []).append((x, t))

    # ---- shaka year: left/main header line containing ±Á°ªÁºÀ£À ----
    shaka = None
    shaka_cands = []
    for y, ws in lines.items():
        if any(t == HEADER_SHAKA for _, t in ws):
            toks = sorted(ws)
            yi = [i for i, (_, t) in enumerate(toks) if t == HEADER_SHAKA]
            for i in yi:
                for x2, t2 in toks[i + 1:]:
                    m = re.match(r"^(\d{4})", t2)
                    if m:
                        shaka_cands.append((x2, y, int(m.group(1))))
                        break
    if shaka_cands:
        shaka_cands.sort()  # by x then y -> left/main header first
        shaka = shaka_cands[0][2]

    # ---- samvatsara: mapped token on a ¸ÀAªÀvÀìgÀ line ----
    sam_cands = []
    for y, ws in lines.items():
        toks = [t for _, t in ws]
        if any(HEADER_SAMVATSARA in t for t in toks):
            for x, t in ws:
                if t in SAMVATSARA_MAP:
                    sam_cands.append((y, x, t))
    samvatsara = None
    sam_note = ""
    names = {SAMVATSARA_MAP[t] for _, _, t in sam_cands}
    if "ವಿಶ್ವಾವಸು" in names and "ಪರಾಭವ" in names:
        # March transition page: use the pre-Ugadi samvatsara
        samvatsara = "ವಿಶ್ವಾವಸು"
        sam_note = "page shows both ವಿಶ್ವಾವಸು and ಪರಾಭವ; used pre-Ugadi ವಿಶ್ವಾವಸು"
    elif names:
        samvatsara = sorted(names)[0]
    return samvatsara, shaka, sam_note


# ---------------------------------------------------------------------------
# Per-table extraction
# ---------------------------------------------------------------------------
def find_tables(words):
    """Locate left and right panchanga table name-column edges.
    Returns (L_tx, L_nx) and (R_tx, R_nx) or None entries."""
    def find_hdr(x0, x1):
        tits = [w for w in words if w[3] == HEADER_TITHI and x0 <= w[0] <= x1]
        naks = [w for w in words if w[3] == HEADER_NAKSHATRA and x0 <= w[0] <= x1]
        if not tits or not naks:
            return None
        return (min(tits, key=lambda w: w[1])[0] - 14,
                min(naks, key=lambda w: w[1])[0] - 14)

    return find_hdr(30, 400), find_hdr(840, 1150)


def extract_side(words, tx, nx, ylim, side, month):
    """Extract date anchors and per-date name/time rows for one table side.
    Uses per-column pairing + DP alignment to the date anchors.
    Returns (rows, info) where rows is a list of dicts with date keys."""
    # ---- date anchors ----
    cand = []
    for x, y, x1, t in words:
        m = DATE_RE.match(t)
        if not m:
            continue
        n = int(m.group(1))
        if 1 <= n <= 31 and ylim[0] <= y <= ylim[1] and (nx - 150) <= x <= (tx - 40):
            cand.append((x, y, n, t))
    clusters = Counter(round(cx / 6) * 6 for cx, _, _, _ in cand)
    cx0 = None
    for cx, cnt in sorted(clusters.items()):
        if cnt >= 4:
            cx0 = cx
            break
    if cx0 is None:
        return [], {}

    anchors = []
    seen = {}
    for cx, y, n, t in sorted(cand, key=lambda c: c[1]):
        if abs(round(cx / 6) * 6 - cx0) <= 7 and n not in seen:
            seen[n] = y
            anchors.append((n, y))
    anchors.sort(key=lambda a: a[1])
    if not anchors:
        return [], {}

    # ---- per-column word collection + pairing ----
    min_y = min(y for _, y in anchors)
    max_y = max(y for _, y in anchors)
    y_lo = max(78.0, min_y - 30.0)
    y_hi = max_y + 20.0
    mid = (tx + nx) / 2
    tithi_col = [w for w in words if tx - 8 <= w[0] < mid and y_lo <= w[1] <= y_hi]
    naks_col = [w for w in words if mid <= w[0] <= nx + 34 and y_lo <= w[1] <= y_hi]
    tithi_rows = pair_column(tithi_col)
    naks_rows = pair_column(naks_col)
    t_aligned = align_rows_to_anchors(tithi_rows, anchors)
    n_aligned = align_rows_to_anchors(naks_rows, anchors)

    rows = []
    for i, (dnum, ay) in enumerate(anchors):
        t_row = t_aligned[i]
        n_row = n_aligned[i]
        rows.append({
            "date": dnum,
            "t_name": t_row[1] if t_row else "",
            "t_times": t_row[2] if t_row else [],
            "n_name": n_row[1] if n_row else "",
            "n_times": n_row[2] if n_row else [],
            "t_extra": t_row is None,
            "n_extra": n_row is None,
        })
    info = {"anchors": len(anchors), "cluster_x": cx0,
            "dates": sorted(seen.keys()), "side": side,
            "tithi_rows": len(tithi_rows), "naks_rows": len(naks_rows)}
    return rows, info


# ---------------------------------------------------------------------------
# Kala grid
# ---------------------------------------------------------------------------
def norm_grid_num(tok):
    s = re.sub(r"[^\d.]", "", tok)
    return s if re.match(r"^\d{1,2}\.\d{2}$", s) else None


def extract_kala_grid(words):
    """Extract the 7 weekday rahu/gulika/yamaganda ranges.
    Returns (weekdayTimings dict, mismatches list)."""
    labels = []  # (y, x, kind)
    for x, y, x1, t in words:
        if 300 <= x <= 460 and t in KALA_LABELS:
            labels.append((round(y, 1), x, KALA_LABELS[t]))

    by_kind = {"rahu": [], "gulika": [], "yamaganda": []}
    for y, x, kind in labels:
        by_kind[kind].append(y)
    rahu_rows = sorted(set(by_kind["rahu"]))
    if len(rahu_rows) != 7:
        return None, ["expected 7 rahu rows, found %d" % len(rahu_rows)]

    result = {}
    mismatches = []
    for i, ry in enumerate(rahu_rows):
        day = DAY_NAMES[i]
        slot = {}
        for kind, dy in (("rahu", 0.0), ("gulika", 10.5), ("yamaganda", 21.0)):
            ty = ry + dy
            yl = min(by_kind[kind], key=lambda yy: abs(yy - ty))
            if abs(yl - ty) > 3:
                mismatches.append("%s %s: no label near y=%.1f" % (day, kind, ty))
                slot[kind] = None
                continue
            # numbers on the label's line within the timing column
            nums = []
            for x, y, x1, t in words:
                if abs(y - yl) < 0.6 and 390 <= x <= 445:
                    nv = norm_grid_num(t)
                    if nv:
                        nums.append((x, nv))
            nums.sort()
            if len(nums) < 2:
                mismatches.append("%s %s: expected 2 numbers, got %r" % (day, kind, nums))
                slot[kind] = None
                continue
            start12, end12 = nums[0][1], nums[1][1]
            std = STANDARD_KALA[day][kind]
            if (start12, end12) != (std[0], std[1]):
                mismatches.append(
                    "%s %s: parsed %s-%s differs from standard %s-%s; using standard"
                    % (day, kind, start12, end12, std[0], std[1]))
            slot[kind] = std[2]
        if all(slot.values()):
            result[day] = {"rahuKala": slot["rahu"],
                           "gulikaKala": slot["gulika"],
                           "yamaganda": slot["yamaganda"]}
    return result, mismatches


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    doc = pymupdf.open(PDF_PATH)
    report = []
    dates = {}
    months = {}
    page_info = []
    time_problems = []
    unmapped = defaultdict(list)          # cleaned token -> dates
    map_usage = Counter()                 # cleaned token -> (name, count)
    used_tokens = Counter()
    missing_cells = []                    # dates with any null field
    grid_mismatches = []
    nextday_markers = []                  # dates using the full-day marker
    sam_transition_pages = []
    weekday_timings = {}

    for pi in range(12):
        month = pi + 1
        page = doc[pi]
        words = [(w[0], w[1], w[2], w[4]) for w in page.get_text("words")]

        samvatsara, shaka, sam_note = extract_month_header(words)
        months[str(month)] = {"samvatsara": samvatsara, "shakaYear": shaka}
        if sam_note:
            sam_transition_pages.append((month, sam_note))

        (l_tbl, r_tbl) = find_tables(words)
        sides = [("L", l_tbl, (60, 765)), ("R", r_tbl, (60, 360))]
        if month == 1:
            grid, gm = extract_kala_grid(words)
            if grid is None:
                grid_mismatches.append("page1 grid extraction failed")
            weekday_timings = grid or {}
            grid_mismatches += gm

        for side, tbl, ylim in sides:
            if not tbl:
                report.append("p%d %s: table headers not found" % (month, side))
                continue
            tx, nx = tbl
            rows, info = extract_side(words, tx, nx, ylim, side, month)
            page_info.append((month, side, info.get("anchors", 0),
                              info.get("dates", [])))
            for r in rows:
                dnum = r["date"]
                key = "%02d-%02d-2026" % (dnum, month)
                if key in dates:
                    continue  # right side duplicates left in overlap safety
                t_ends, t_nd, t_raw, t_full, t_un = cell_time(
                    r["t_name"], r["t_times"])
                n_ends, n_nd, n_raw, n_full, n_un = cell_time(
                    r["n_name"], r["n_times"])
                if t_un:
                    time_problems.append((key, "tithi", t_un))
                if n_un:
                    time_problems.append((key, "nakshatra", n_un))
                if t_full:
                    nextday_markers.append((key, "tithi"))
                if n_full:
                    nextday_markers.append((key, "nakshatra"))

                # name mapping
                def map_name(name_raw, kind):
                    cleaned = clean_name_for_lookup(name_raw)
                    used_tokens[cleaned] += 1
                    name = None
                    cands = []
                    for c in (name_raw, cleaned, cleaned.replace("\u03bc", "\u00b5")):
                        if c not in cands:
                            cands.append(c)
                    for cand in cands:
                        if cand in OVERRIDES:
                            name = OVERRIDES[cand]
                            break
                    if name is None:
                        for cand in cands:
                            if cand in NUDI_NAME_MAP:
                                name = NUDI_NAME_MAP[cand]
                                break
                    if name is None:
                        unmapped[cleaned].append(key + "/" + kind)
                    else:
                        map_usage[(cleaned, name)] += 1
                    return name

                t_name = map_name(r["t_name"], "tithi")
                n_name = map_name(r["n_name"], "nakshatra")

                tithi = {"name": t_name, "endsAt": t_ends, "nextDay": t_nd,
                         "fullDay": bool(t_full), "rawTime": t_raw}
                naks = {"name": n_name, "endsAt": n_ends, "nextDay": n_nd,
                        "fullDay": bool(n_full), "rawTime": n_raw}
                if (t_name is None or n_name is None or
                        (t_ends is None and t_raw != NEXTDAY_MARKER) or
                        (n_ends is None and n_raw != NEXTDAY_MARKER)):
                    missing_cells.append((key, tithi, naks))
                dates[key] = {"tithi": tithi, "nakshatra": naks}

    # ---- sanity: all 365 dates present ----
    expected = set()
    for m in range(1, 13):
        for d in range(1, DAYS_IN_MONTH[m] + 1):
            expected.add("%02d-%02d-2026" % (d, m))
    found = set(dates)
    missing_dates = sorted(expected - found)

    # per-page anchor summary
    per_page = defaultdict(dict)
    for month, side, cnt, dts in page_info:
        per_page[month][side] = (cnt, dts)

    # ---- build JSON ----
    data = {
        "source": {"pdf": "PDF Calendar PV.pdf",
                   "generatedBy": "extract-pdf-panchanga.py"},
        "weekdayTimings": weekday_timings,
        "months": {m: months[m] for m in sorted(months, key=int)},
        "dates": {k: dates[k] for k in sorted(dates)},
    }
    io.open("data/pdf-panchanga-data.json", "w", encoding="utf-8").write(
        json.dumps(data, ensure_ascii=False, indent=1))

    # ---- report ----
    R = report.append
    R("==============================================================")
    R("KANNADA CALENDAR PDF PANCHANGA EXTRACTION REPORT")
    R("source: PDF Calendar PV.pdf (text layer only, pymupdf)")
    R("==============================================================")
    R("")
    R("1. DATES")
    R("   total found: %d / 365" % len(found))
    if missing_dates:
        R("   MISSING DATES: %s" % ", ".join(missing_dates))
    R("   per-page anchors:")
    for m in sorted(per_page):
        l = per_page[m].get("L", (0, []))
        r = per_page[m].get("R", (0, []))
        R("     p%-2d L=%2d (1..%d)  R=%d (%s)"
          % (m, l[0], max(l[1]) if l[1] else 0, r[0],
             (",").join(map(str, r[1])) if r[1] else "-"))
    R("")
    R("2. MONTH HEADER DATA")
    for m in sorted(months, key=int):
        d = months[m]
        R("   month %s: samvatsara=%s shakaYear=%s"
          % (m, d["samvatsara"], d["shakaYear"]))
    for m, note in sam_transition_pages:
        R("   NOTE month %d: %s" % (m, note))
    R("")
    R("3. WEEKDAY KALA TIMINGS (parsed from month grid)")
    for day in DAY_NAMES:
        if day in weekday_timings:
            wt = weekday_timings[day]
            R("   %-9s rahu=%s gulika=%s yamaganda=%s"
              % (day, wt["rahuKala"], wt["gulikaKala"], wt["yamaganda"]))
        else:
            R("   %-9s MISSING" % day)
    if grid_mismatches:
        R("   grid mismatches:")
        for g in grid_mismatches:
            R("     %s" % g)
    R("")
    R("4. TOKEN->NAME MAP USED (cleaned token -> Kannada name, count)")
    for (tok, name), cnt in sorted(map_usage.items(), key=lambda kv: -kv[1]):
        R("   %-28s %-16s %3d" % (tok, name, cnt))
    R("")
    R("5. NEXT-DAY / FULL-DAY MARKERS (time cell is '(¢£À¥ÀÇwð)')")
    if nextday_markers:
        for key, kind in nextday_markers:
            R("   %s %s" % (key, kind))
    R("   count: %d (tithi: %d, nakshatra: %d)"
      % (len(nextday_markers),
         sum(1 for _, k in nextday_markers if k == "tithi"),
         sum(1 for _, k in nextday_markers if k == "nakshatra")))
    R("   These cells were visually verified on the rendered pages")
    R("   (crops in .playwright-mcp/fullday-crops/): each prints the")
    R("   full-day marker '(¢£À¥ÀÇwð)' in place of a numeric time.")
    R("")
    R("6. UNPARSED TIME TOKENS (must be 0)")
    if time_problems:
        for key, kind, (pre, raw) in time_problems:
            R("   %s %s prefix=%r raw=%r" % (key, kind, pre, raw))
    R("   count: %d" % len(time_problems))
    R("")
    R("7. UNMAPPED NAME TOKENS")
    for tok in sorted(unmapped):
        R("   %r -> %s" % (tok, ", ".join(unmapped[tok])))
    R("   count: %d" % sum(len(v) for v in unmapped.values()))
    R("")
    R("8. DATES WITH MISSING / NULL FIELDS (excluding full-day markers)")
    if missing_cells:
        for key, tithi, naks in missing_cells:
            R("   %s tithi=%s nakshatra=%s" % (key, tithi, naks))
    R("   count: %d" % len(missing_cells))
    R("")
    R("   Note: dates where a cell shows '(¢£À¥ÀÇwð)' (next-day/full-day")
    R("   marker) have endsAt=null by design; see section 5.")
    R("")
    R("9. SANITY SUMMARY")
    tithi_names = Counter()
    naks_names = Counter()
    for key in sorted(dates):
        t = dates[key]["tithi"].get("name")
        n = dates[key]["nakshatra"].get("name")
        if t:
            tithi_names[t] += 1
        if n:
            naks_names[n] += 1
    R("   tithi name counts (each should be ~20-25):")
    for name, cnt in sorted(tithi_names.items(), key=lambda kv: -kv[1]):
        R("     %-14s %d" % (name, cnt))
    R("   nakshatra name counts:")
    for name, cnt in sorted(naks_names.items(), key=lambda kv: -kv[1]):
        R("     %-16s %d" % (name, cnt))
    R("")
    R("==============================================================")
    R("dates=%d/365 unparsed=%d unmapped=%d missing_null=%d"
      % (len(found), len(time_problems),
         sum(len(v) for v in unmapped.values()), len(missing_cells)))
    io.open("data/pdf-extraction-report.txt", "w", encoding="utf-8").write(
        "\n".join(report))
    print("dates=%d/365 unparsed=%d unmapped=%d missing_null=%d nextday=%d"
          % (len(found), len(time_problems),
             sum(len(v) for v in unmapped.values()), len(missing_cells),
             len(nextday_markers)))


if __name__ == "__main__":
    main()