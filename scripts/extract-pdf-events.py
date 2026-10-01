# -*- coding: utf-8 -*-
"""
extract-pdf-events.py
=====================
Extracts the per-date event/festival text (the wide column to the right of
tithi/nakshatra) from "PDF Calendar PV.pdf" using the PDF text layer.

The text is in the legacy Nudi01e ANSI font encoding, so it is converted to
Unicode with aravindavk/ascii2unicode's `knconverter` (GPL-3.0). That file is
NOT vendored here; pass its path:

  git clone https://github.com/aravindavk/ascii2unicode
  python scripts/extract-pdf-events.py --converter ascii2unicode/knconverter

Run from the repo root. Output: data/pdf-events.json (loaded by the app)
  { "source": "...", "events": { "DD-MM-YYYY": ["<event>", ...] } }
"""
import argparse
import datetime
import importlib.machinery
import importlib.util
import io
import json
import re
from collections import Counter

import pymupdf

PDF_PATH = "source/PDF Calendar PV.pdf"
OUT_PATH = "data/pdf-events.json"
YEAR = 2026
EVENT_COL_OFFSET = 36      # event column starts this far right of the nakshatra header edge
EVENT_COL_WIDTH = 125


def load_module(path, name):
    loader = importlib.machinery.SourceFileLoader(name, path)
    spec = importlib.util.spec_from_loader(name, loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def date_anchors(words, ex, tx, nx):
    """Date-number anchors of one table side: the x-cluster of day numbers,
    keeping only the leading run of consecutive days (drops mini-calendar digits)."""
    cand = []
    for x, y, x1, t in words:
        m = ex.DATE_RE.match(t)
        if m and 1 <= int(m.group(1)) <= 31 and 78 <= y <= 760 and (nx - 150) <= x <= (tx - 40):
            cand.append((x, y, int(m.group(1))))
    clusters = Counter(round(c[0] / 6) * 6 for c in cand)
    cx0 = next(cx for cx, n in sorted(clusters.items()) if n >= 4)
    seen = {}
    for x, y, n in sorted(cand, key=lambda c: c[1]):
        if abs(round(x / 6) * 6 - cx0) <= 7 and n not in seen:
            seen[n] = y
    anchors = sorted(seen.items(), key=lambda a: a[1])
    run = [anchors[0]]
    for a in anchors[1:]:
        if a[0] != run[-1][0] + 1:
            break
        run.append(a)
    return run


def row_rules(page, x0):
    """Y positions of the horizontal grid rules spanning the event column that
    starts at x0 (page.get_drawings(); rows sit between consecutive rules)."""
    ys = []
    for dr in page.get_drawings():
        r = dr["rect"]
        if r.height < 2.5 and r.y0 > 75 and r.x0 < x0 + 15 and r.x1 > x0 + EVENT_COL_WIDTH - 40:
            if not ys or abs(r.y0 - ys[-1]) > 1.5:
                ys.append(r.y0)
    return sorted(ys)


def fix_leftovers(text):
    """Legacy glyph sequences knconverter leaves undecoded (found by scanning the output)."""
    return (text.replace("ೆÇ್ಪೀ", "್ಪೋ")  # ತೆಪೆÇ್ಪೀತ್ಸವ -> ತೆಪ್ಪೋತ್ಸವ
                .replace("ೆÇೀ", "ೋ")   # ೆÇೀ -> ೋ  (ದೀಪೆÇೀತ್ಸವ -> ದೀಪೋತ್ಸವ)
                .replace("ೆÇ", "ೊ")          # ೆÇ  -> ೊ  (ಪೆÇಳಲಿ -> ಪೊಳಲಿ)
                .replace("ø", "ೃ")                 # ø -> ೃ    (ಸಂಸ್ಕøತ -> ಸಂಸ್ಕೃತ)
                .replace("À", ""))                       # stray inherent-a carrier


# ---------------------------------------------------------------------------
# Splitting a day's text into events. Commas are unreliable on their own:
#  - a list of places sharing one trailing event word is ONE event
#    ("ಹುಂಚ, ಕನಕಪುರ, ಶಿವನಸಮುದ್ರಗಳಲ್ಲಿ ರಥ"), so bare place names are glued
#    forward onto the next segment when it ends in a shared noun (ರಥ, ಜಾತ್ರೆ,
#    ಉತ್ಸವ, ...) or contains a "...ಗಳಲ್ಲಿ" place;
#  - the PDF drops the comma when an entry wraps, so we also split after an
#    event noun or a closing ")" when a new phrase follows.
# Word lists were tuned by reviewing the output for all 365 dates.
# ---------------------------------------------------------------------------
EV_NOUNS = ('ರಥ','ಜಾತ್ರೆ','ತ್ಸವ','ಜಯಂತಿ','ದಿನ','ವ್ರತ','ಆರಾಧನೆ','ಯೋಗ','ಪೂಜೆ','ಏಕಾದಶಿ','ದ್ವಾದಶಿ','ತ್ರಯೋದಶಿ','ಚತುರ್ದಶಿ','ಅಮಾವಾಸ್ಯೆ','ಹುಣ್ಣಿಮೆ','ಪೂರ್ಣಿಮಾ','ಪಾಡ್ಯಮಿ','ಪಂಚಮಿ','ಸಪ್ತಮಿ','ಷ್ಟಮಿ','ನವಮಿ','ಷಷ್ಠಿ','ಚತುರ್ಥಿ','ಚೌತಿ','ಹಬ್ಬ','ಡೇ','ಮಹಾಲಯ','ಯುಗಾದಿ','ಪರಿಷೆ','ಕರಗ','ಸಂಕ್ರಮಣ','ಪ್ರದೋಷ','ಮಧ್ಯಾರಾಧನೆ','ಆರಾಧನೋತ್ಸವ','ದೀಪೋತ್ಸವ','ಪುಣ್ಯತಿಥಿ','ಕಾಲಾಷ್ಟಮಿ','ಅನಧ್ಯಯನ','ಚಂದ್ರದರ್ಶನ','ಶಿವರಾತ್ರಿ','ತೃತೀಯ','ನಕ್ಷತ್ರ','ವಾರ','ತೀರ್ಥ','ದೀಪ','ನೈಟ್','ರಂಭ','ಕಾರ್ಣಿಕ')
KNOWN_EVENTS = {'ಕ್ರಿಸ್‍ಮಸ್','ಕ್ರಿಸ್ಮಸ್','ಯಮದ್ವಿತೀಯ','ಕಲಿಯುಗಾದಿ','ಹುತ್ತರಿ','ಮಧ್ಯಾಷ್ಟಮಿ','ಯತಿಮಹಾಲಯ'}
CONT = {'ಆರಂಭ','ಸಮಾಪ್ತಿ','ಮತ್ತು','ಮುಕ್ತಾಯ','ಪ್ರಾರಂಭ'}
SHARED = ('ರಥ','ಜಾತ್ರೆ','ಉತ್ಸವ','ದೀಪೋತ್ಸವ','ಆರಾಧನೆ','ಆರಾಧನೋತ್ಸವ','ಮಧ್ಯಾರಾಧನೆ')
PLACE_SUFFIX = ('ಹಳ್ಳಿ','ಕೋಡಿ','ಗುಡ್ಡ','ಪುರ','ಸಂಗಮ','ಕಟ್ಟೆ','ಬೆಟ್ಟ','ಪೇಟೆ')
def is_ev(w): return w.endswith(EV_NOUNS)
def kind(seg):
    ws=seg.split()
    if seg in KNOWN_EVENTS or is_ev(ws[-1]) or ws[-1].endswith(')'): return 'ev'
    if len(ws)==1 or (len(ws)==2 and ws[-1].endswith(PLACE_SUFFIX)): return 'bare'
    return 'amb'
def shares(seg): return seg.split()[-1].endswith(SHARED) or any(w.endswith('ಗಳಲ್ಲಿ') for w in seg.split())
def split_events(text):
    """Split one day's decoded text into individual events (see module docstring)."""
    segs=[s.strip() for s in re.sub(r'(?<=\S{5})\. ', ', ', text).split(',') if s.strip()]
    pieces=[]
    for s in segs:   # no-comma joins: break after an event noun / ')' followed by a new phrase
        ws=s.split(); cur=[]
        for i,w in enumerate(ws):
            cur.append(w)
            nxt=ws[i+1] if i+1<len(ws) else None
            if nxt and nxt not in CONT and (w.endswith(')') or (w in ('ಯೋಗ','ಜಯಂತಿ','ರಥ','ಜಾತ್ರೆ','ಉತ್ಸವ','ದಿನ','ವ್ರತ','ಪೂಜೆ','ಹಬ್ಬ','ಆರಾಧನೆ'))):
                pieces.append(' '.join(cur)); cur=[]
        if cur: pieces.append(' '.join(cur))
    res=[];pend=[]
    for i,s in enumerate(pieces):
        k=kind(s)
        nk=kind(pieces[i+1]) if i+1<len(pieces) else None
        if k=='amb' and pieces[i].split()[-1] in CONT: k='ev'
        if k=='bare' or (k=='amb' and nk=='bare' ) or False: pend.append(s); continue
        if pend:
            if k=='ev' and shares(s): res.append(', '.join(pend+[s])); pend=[]; continue
            res.extend(pend); pend=[]
        res.append(s)
    res.extend(pend)
    return res


def join_lines(ws):
    """Words -> text lines (y-clustered, then left to right)."""
    ws = sorted(ws, key=lambda w: w[1])
    lines, cur = [], []
    for w in ws:
        if cur and w[1] - cur[0][1] > 3:
            lines.append(cur)
            cur = []
        cur.append(w)
    if cur:
        lines.append(cur)
    return " ".join(w[3] for line in lines for w in sorted(line, key=lambda w: w[0]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--converter", required=True, help="path to ascii2unicode knconverter")
    args = ap.parse_args()
    kn = load_module(args.converter, "knconverter")
    ex = load_module("scripts/extract-pdf-panchanga.py", "ex_panchanga")

    doc = pymupdf.open(PDF_PATH)
    out = {}
    for pi in range(12):
        month = pi + 1
        words = [(w[0], w[1], w[2], w[4]) for w in doc[pi].get_text("words")]
        left, right = ex.find_tables(words)
        for tx, nx in (left, right):
            anchors = date_anchors(words, ex, tx, nx)
            x0 = nx + EVENT_COL_OFFSET
            rules = row_rules(doc[pi], x0)
            for day, y in anchors:
                try:
                    key = datetime.date(YEAR, month, day).strftime("%d-%m-%Y")
                except ValueError:
                    continue            # stray digit that is not a day of this month
                lo = max((r for r in rules if r <= y + 6), default=None)
                hi = min((r for r in rules if r > y + 6), default=None)
                if lo is None or hi is None:
                    print("no row rules around %02d-%02d (y=%.0f)" % (day, month, y))
                    continue
                ws = [w for w in words
                      if x0 <= w[0] < x0 + EVENT_COL_WIDTH and lo <= (w[1] + 4) < hi]
                raw = join_lines(ws)
                text = fix_leftovers(kn.process_line(raw.replace("μ", "µ")))
                out[key] = split_events(text)

    with io.open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"source": "PDF Calendar PV.pdf", "events": out}, f, ensure_ascii=False, indent=1, sort_keys=True)
    empty = [k for k, v in out.items() if not any(v)]
    print("dates: %d / 365, events: %d, empty: %d" % (len(out), sum(len(v) for v in out.values()), len(empty)))
    if empty:
        print("empty:", ", ".join(sorted(empty)))


if __name__ == "__main__":
    main()
