# -*- coding: utf-8 -*-
"""
extract-docx-events.py
======================
Builds the day-level event list the app shows (data/calendar-events.json) from
the Word calendars:

  data/Calander Matter s (1).docx   2026 events
  data/Calander matter.docx         2027 events

Each docx has a "<month> <year>" heading followed by one line per day; a day's
line is a comma-separated list of events. The script
  - checks every month has exactly one line per calendar day,
  - strips the "1." day number some months carry (and checks it equals the day),
  - splits a line into separate events: at commas, at ". " before a Kannada
    letter, and after a closing bracket that is followed by more text (never
    inside brackets),
  - keeps a place list that ends in "...ಗಳಲ್ಲಿ" (for example
    "ಉಡುಪಿ, ಮಂತ್ರಾಲಯಗಳಲ್ಲಿ ಉತ್ಸವ") together as one event,
  - applies the reviewed SPLITS below for lines where the docx lacks a comma.

Text is otherwise left as typed in the docx; spelling is not corrected.

Run from the repo root (stdlib only):
  python scripts/extract-docx-events.py
Output: data/calendar-events.json (loaded by the app)
  { "source": "...", "events": { "DD-MM-YYYY": ["<event>", ...] } }
Pass --report to also print what was flagged for editorial review.
"""
import argparse
import calendar
import json
import re
import sys
import zipfile

SOURCES = [
    (2026, "data/Calander Matter s (1).docx"),
    (2027, "data/Calander matter.docx"),
]
OUT_PATH = "data/calendar-events.json"

MONTHS = {"ಜನವರಿ": 1, "ಫೆಬ್ರವರಿ": 2, "ಮಾರ್ಚಿ": 3, "ಏಪ್ರಿಲ್": 4, "ಮೇ": 5, "ಜೂನ್": 6, "ಜುಲೈ": 7,
          "ಆಗಸ್ಟ್": 8, "ಸೆಪ್ಟಂಬರ್": 9, "ಅಕ್ಟೋಬರ್": 10, "ನವಂಬರ್": 11, "ಡಿಸಂಬರ್": 12}

# Words that make a short fragment an event of its own rather than a place name.
# EVENT_PARTS match anywhere in the fragment (they end compound words such as
# "ಪುಣ್ಯದಿನ"); EVENT_WORDS must be a whole word (so "ಮೇಳಿಗೆ" is not "ಮೇಳ").
EVENT_PARTS = ("ರಥ", "ತ್ಸವ", "ಜಾತ್ರೆ", "ಜಯಂತಿ", "ರಾಧನೆ", "ದಿನ", "ವ್ರತ", "ಏಕಾದಶಿ", "ಹಬ್ಬ", "ಪೂಜೆ", "ವರ್ಧಂತಿ",
               "ನಕ್ಷತ್ರ", "ಸಂಕ್ರಾಂತಿ", "ಹುಣ್ಣಿಮೆ", "ಅಮಾವಾಸ್ಯೆ", "ಚತುರ್ಥಿ", "ಪಂಚಮಿ", "ಷಷ್ಠಿ", "ಷಷ್ಟಿ", "ಸಪ್ತಮಿ",
               "ಷ್ಟಮಿ", "ನವಮಿ", "ದಶಮಿ", "ದ್ವಾದಶಿ", "ತ್ರಯೋದಶಿ", "ಚತುರ್ದಶಿ", "ಕಾರ್ಣೀಕ", "ಕಾರ್ಣಿಕ", "ಕಾರಣಿಕ",
               "ಪಾಡ್ಯಮಿ", "ಪ್ರದೋಷ", "ಶಿವರಾತ್ರಿ", "ನವರಾತ್ರಿ", "ಗ್ರಹಣ", "ದೀಪ", "ಮಾವಾಸ್ಯೆ", "ದರ್ಶನ",
               "ರಂಭ", "ಸಮಾಪ್ತಿ", "ರಂಜಾನ್", "ಕ್ರಿಸ್", "ಅನಧ್ಯಯನ")
EVENT_WORDS = {"ಯೋಗ", "ಕಲ್ಯಾಣ", "ಮೇಳ", "ವಾರ", "ಶನಿವಾರ"}
# Initials/abbreviations that end in "." but do not end an event ("ಬೆಂ. ಕೋಟೆ").
ABBREVIATIONS = {"ಬೆಂ", "ಆರ್", "ಎನ್", "ಕೆ", "ಎಚ್", "ಡಾ", "ಎಸ್", "ಎಂ"}
IN_PLACES = re.compile(r"ಗಳಲ್ಲಿ|ಗಳಲಿ")

# Reviewed fixes for lines the generic rules get wrong.
# SPLITS: the docx has no comma between two events. Key: (date, segment as it
# comes out of the comma split); value: the events it is really made of.
SPLITS = {
    ("12-01-2026", "ರಾಷ್ಟ್ರೀಯ ಯುವಕರ ದಿನ ಮುರೇರಡ್ಕ ಶಿರಾಡಿ ದೈವ ಉತ್ಸವ"): ["ರಾಷ್ಟ್ರೀಯ ಯುವಕರ ದಿನ", "ಮುರೇರಡ್ಕ ಶಿರಾಡಿ ದೈವ ಉತ್ಸವ"],
    ("13-01-2026", "ತಲಕಾಡು ಕೀರ್ತಿನಾರಾಯಣ ವರ್ಧಂತಿ ರಂಗನಾಥ ಶಠಗೋಪ ಮಹಾದೇಶಿಕಾರ್‌ ತಿರುನಕ್ಷತ್ರ"): ["ತಲಕಾಡು ಕೀರ್ತಿನಾರಾಯಣ ವರ್ಧಂತಿ", "ರಂಗನಾಥ ಶಠಗೋಪ ಮಹಾದೇಶಿಕಾರ್‌ ತಿರುನಕ್ಷತ್ರ"],
    ("27-03-2026", "ಸಂತೆ ಬೆನ್ನೂರು ರಾಮಚಂದ್ರ ರಥ ನಂಜನಗೂಡು ಶ್ರೀಕಂಠ ಮುಡಿ ಉತ್ಸವ"): ["ಸಂತೆ ಬೆನ್ನೂರು ರಾಮಚಂದ್ರ ರಥ", "ನಂಜನಗೂಡು ಶ್ರೀಕಂಠ ಮುಡಿ ಉತ್ಸವ"],
    ("20-04-2026", "ಪರಶುರಾಮ ಉತ್ಸವ ಶಂಬೂರು ಸುಬ್ರಹ್ಮಣ್ಯ ಉತ್ಸವ"): ["ಪರಶುರಾಮ ಉತ್ಸವ", "ಶಂಬೂರು ಸುಬ್ರಹ್ಮಣ್ಯ ಉತ್ಸವ"],
    ("15-10-2026", "ತಲಕಾಡು ಜನ್ಮದಿನೋತ್ಸವ ವಿಶ್ವವಿಶೇಷ ದೃಷ್ಟಿಚೇತನರ ದಿನ"): ["ತಲಕಾಡು ಜನ್ಮದಿನೋತ್ಸವ", "ವಿಶ್ವವಿಶೇಷ ದೃಷ್ಟಿಚೇತನರ ದಿನ"],
    ("11-12-2026", "ವಿದ್ಯಾ ವಲ್ಲಭ ತೀರ್ಥರ ಆರಾಧನೆ ವಿಶ್ವ ಹಣಕಾಸು ಸಂಸ್ಥೆ ದಿನ"): ["ವಿದ್ಯಾ ವಲ್ಲಭ ತೀರ್ಥರ ಆರಾಧನೆ", "ವಿಶ್ವ ಹಣಕಾಸು ಸಂಸ್ಥೆ ದಿನ"],
    ("06-02-2027", "ಪುರಂದರ ದಾಸರ ಪುಣ್ಯದಿನ ಗರುಡ ಜಯಂತಿ"): ["ಪುರಂದರ ದಾಸರ ಪುಣ್ಯದಿನ", "ಗರುಡ ಜಯಂತಿ"],
    ("29-04-2027", "ಪಡುಬಿದ್ರೆ ಗಣಪತಿ ವರ್ಧಂತಿ ಸವಡಿ ರಥ"): ["ಪಡುಬಿದ್ರೆ ಗಣಪತಿ ವರ್ಧಂತಿ", "ಸವಡಿ ರಥ"],
    ("25-01-2027", "ಮೂಗೂರು ಚಿಗುರು ಕಡಿಯುವುದು ನೆಲಮಂಗಲ ಲಕ್ಷ್ಮಿಚೆನ್ನಕೇಶವ ರಥ"): ["ಮೂಗೂರು ಚಿಗುರು ಕಡಿಯುವುದು", "ನೆಲಮಂಗಲ ಲಕ್ಷ್ಮಿಚೆನ್ನಕೇಶವ ರಥ"],
    ("10-12-2026", "ಯಲಹಂಕ ವೀರಭದ್ರ ಕಾರ್ತಿಕ್ ವಿಶ್ವಸಂಸ್ಥೆ ಮಾನವ ಹಕ್ಕುಗಳ ದಿನಾಚರಣೆ"): ["ಯಲಹಂಕ ವೀರಭದ್ರ ಕಾರ್ತಿಕ್", "ವಿಶ್ವಸಂಸ್ಥೆ ಮಾನವ ಹಕ್ಕುಗಳ ದಿನಾಚರಣೆ"],
    ("11-09-2027", "ಝಲ ಝಲನಿ ಏಕಾದಶಿ ತಿರುಪತಿ ವೆಂಕಟೇಶ ಜಯಂತಿ"): ["ಝಲ ಝಲನಿ ಏಕಾದಶಿ", "ತಿರುಪತಿ ವೆಂಕಟೇಶ ಜಯಂತಿ"],
}
# JOINS: a short place name that belongs with the segment after it. Value: separator.
JOINS = {
    ("24-08-2026", "ರೋಣ"): " ",
    ("08-03-2027", "ಅರಗ"): ", ",
}
# NOT_PLACES: short segments that look like place names but are events, so they
# must not be folded into the "...ಗಳಲ್ಲಿ" place list that follows them.
NOT_PLACES = {
    ("29-11-2026", "ನೀಲಾವರ ಮಹಿಷಮರ್ಧನಿ ತೀರ್ಥ"),
    ("20-12-2026", "ಸ್ವರ್ಗದ ಬಾಗಿಲು ತೆರೆಯುವುದು"),
    ("06-03-2027", "ಷಬ್-ಎ-ಕ್ವಾಡರ್‌"),
    ("12-04-2027", "ಸ್ಕಂದ ದವನಾರ್ಪಣ"),
}


def paragraphs(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf8")
    return ["".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
            for p in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S)]


def month_blocks(path, year):
    blocks, cur = {}, None
    for text in paragraphs(path):
        s = text.strip()
        m = re.match(r"^(\S+?)[‌‍]*\s+%d\s*$" % year, s)
        if m and m.group(1).replace("‌", "") in MONTHS:
            cur = MONTHS[m.group(1).replace("‌", "")]
            blocks[cur] = []
        elif cur and s:
            blocks[cur].append(s)
    return blocks


def is_place_fragment(seg, key=None):
    return ((key, seg) not in NOT_PLACES and len(seg.split()) <= 3 and not IN_PLACES.search(seg)
            and not any(p in seg for p in EVENT_PARTS) and not EVENT_WORDS.intersection(seg.split()))


def comma_split(text):
    """Split at commas and at ". " before a Kannada letter, but not inside brackets;
    also split after a closing bracket that is followed by more text."""
    parts, depth, cur, i = [], 0, "", 0
    while i < len(text):
        c = text[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth = max(depth - 1, 0)
        if depth == 0 and (c == "," or (c == "." and text[i + 1:i + 2] == " " and re.match(r"[ಀ-೿]", text[i + 2:i + 3] or "")
                                         and cur.split()[-1:] not in [[a] for a in ABBREVIATIONS])):
            parts.append(cur)
            cur = ""
        else:
            cur += c
            if c == ")" and depth == 0 and re.match(r"\s+[ಀ-೿]", text[i + 1:i + 3]):
                parts.append(cur)
                cur = ""
        i += 1
    parts.append(cur)
    return parts


def split_events(line, key=None):
    segs = [p.strip().rstrip(".:\\").strip() for p in comma_split(re.sub(r"\s+", " ", line).strip().strip(",")) if p.strip()]
    segs = [p for p in segs if len(p) > 1 or FLAGS.append((key, "stray character dropped: " + p))]
    out, i = [], 0
    while i < len(segs):
        if (key, segs[i]) in JOINS and i + 1 < len(segs):
            out.append(segs[i] + JOINS[(key, segs[i])] + segs[i + 1])
            i += 2
            continue
        if is_place_fragment(segs[i], key):
            j = i
            while j < len(segs) and is_place_fragment(segs[j], key):
                j += 1
            if j < len(segs) and IN_PLACES.search(segs[j]):
                out.append(", ".join(segs[i:j + 1]))
                i = j + 1
                continue
        out.append(segs[i])
        i += 1
    return fold_bare_places(out, key)


FESTIVAL_END = ("ರಥ", "ರತ", "ಜಾತ್ರೆ", "ಜಾತ್ರ", "ಉತ್ಸವ")


def fold_bare_places(events, key=None):
    """Single place names that sit directly before "<place> ರಥ/ಜಾತ್ರೆ/ಉತ್ಸವ" are
    that festival's other venues: "ಶಿಡ್ಲಘಟ್ಟ, ಕಟಪಾಡಿ ಜಾತ್ರೆ" is one event."""
    out, run = [], []
    for ev in events:
        words = ev.split()
        if len(words) == 1 and is_place_fragment(ev, key):
            run.append(ev)
            continue
        if run and 1 < len(words) <= 3 and words[-1] in FESTIVAL_END and not any(p in " ".join(words[:-1]) for p in EVENT_PARTS):
            out.append(", ".join(run + [ev]))
        else:
            out.extend(run)
            out.append(ev)
        run = []
    out.extend(run)
    return out


FLAGS = []


def build(paths=SOURCES):
    events, flags = {}, FLAGS
    for year, path in paths:
        blocks = month_blocks(path, year)
        for month in range(1, 13):
            lines = blocks.get(month)
            days = calendar.monthrange(year, month)[1]
            if lines is None or len(lines) != days:
                sys.exit("%s %s-%02d: expected %d day lines, found %s" % (path, year, month, days, None if lines is None else len(lines)))
            for day, line in enumerate(lines, 1):
                key = "%02d-%02d-%d" % (day, month, year)
                m = re.match(r"^(\d{1,2})(\s*[.)])?\s*", line)
                if m and int(m.group(1)) == day:       # "5." / "5 " day number printed before the events
                    line = line[m.end():]
                elif m and m.group(2):
                    flags.append((key, "day number %s on line %d" % (m.group(1), day)))
                    line = line[m.end():]
                items = []
                for ev in split_events(line, key):
                    for part in SPLITS.get((key, ev), [ev]):
                        if part not in items:      # a docx line repeats an event now and then
                            items.append(part)
                        else:
                            flags.append((key, "duplicate event dropped: " + part))
                events[key] = items
    return events, flags


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="print flagged lines")
    args = ap.parse_args()
    events, flags = build()
    names = " + ".join(p.split("/")[-1] for _, p in SOURCES)
    with open(OUT_PATH, "w", encoding="utf8") as f:
        json.dump({"source": names, "events": events}, f, ensure_ascii=False, indent=1)
    total = sum(len(v) for v in events.values())
    print("wrote %s: %d days, %d events" % (OUT_PATH, len(events), total))
    if args.report:
        for key, msg in flags:
            print("FLAG", key, msg)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf8")
    main()
