# -*- coding: utf-8 -*-
"""
build-panchanga-data.py
=======================
Builds the data the Panchanga tab loads, with no OCR:

  data/panchanga.json                   one record per day of 2026 and 2027 (the same for every district)
  data/panchanga/<district-slug>.json   per-district sunrise, sunset, the four kalas, yoga and karana

Sources
  2026 tithi, nakshatra, their end times   data/pdf-panchanga-data.json  (from the PV wall-calendar PDF)
  2027 tithi, nakshatra, their end times   data/Calander 2027.docx        (Table 1)
  Ugadi dates (samvatsara / Shaka change)  data/calendar-events.json      (from the event Word files)
  everything else is computed              scripts/compute-panchanga.py, scripts/compute-sun-times.py
      paksha, lunar months, ayana, sun rashi, moon rashi, yoga, karana, sunrise, sunset, kalas

A value that cannot be read or fails a check is left out (null). The tab shows "ಲಭ್ಯವಿಲ್ಲ" for it.
Nothing is guessed: the report printed at the end lists every such day.

Run from the repo root:  python scripts/build-panchanga-data.py
"""
import bisect
import datetime
import importlib.util
import json
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORE_PATH = "data/panchanga.json"
DISTRICT_DIR = "data/panchanga"
DOCX_2027 = "data/Calander 2027.docx"
PDF_JSON = "data/pdf-panchanga-data.json"
EVENTS_JSON = "data/calendar-events.json"
YEARS = (2026, 2027)
ORIGIN = datetime.date(2026, 1, 1)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


P = load("compute_panchanga", "scripts/compute-panchanga.py")
S = load("compute_sun_times", "scripts/compute-sun-times.py")

# ---------------------------------------------------------------- names
TITHI_NAMES = ["ಪಾಡ್ಯ", "ಬಿದಿಗೆ", "ತದಿಗೆ", "ಚೌತಿ", "ಪಂಚಮಿ", "ಷಷ್ಠಿ", "ಸಪ್ತಮಿ", "ಅಷ್ಟಮಿ", "ನವಮಿ", "ದಶಮಿ",
               "ಏಕಾದಶಿ", "ದ್ವಾದಶಿ", "ತ್ರಯೋದಶಿ", "ಚತುರ್ದಶಿ"]            # 1-14; then ಪೂರ್ಣಿಮಾ (15), ಅಮಾವಾಸ್ಯೆ (30)
TITHI_ALIAS = {"ಷಷ್ಟಿ": "ಷಷ್ಠಿ"}
NAKSHATRA_NAMES = ["ಅಶ್ವಿನಿ", "ಭರಣಿ", "ಕೃತ್ತಿಕಾ", "ರೋಹಿಣಿ", "ಮೃಗಶಿರ", "ಆರಿದ್ರಾ", "ಪುನರ್ವಸು", "ಪುಷ್ಯ", "ಆಶ್ಲೇಷ", "ಮಖ",
                   "ಪುಬ್ಬಾ", "ಉತ್ತರಾ", "ಹಸ್ತಾ", "ಚಿತ್ತಾ", "ಸ್ವಾತಿ", "ವಿಶಾಖ", "ಅನೂರಾಧ", "ಜ್ಯೇಷ್ಠ", "ಮೂಲ", "ಪೂರ್ವಾಷಾಢ",
                   "ಉತ್ತರಾಷಾಢ", "ಶ್ರವಣ", "ಧನಿಷ್ಠ", "ಶತಭಿಷ", "ಪೂರ್ವಾಭಾದ್ರ", "ಉತ್ತರಾಭಾದ್ರ", "ರೇವತಿ"]
NAKSHATRA_ALIAS = {"ಮಘ": "ಮಖ", "ಪುಬ್ಬ": "ಪುಬ್ಬಾ", "ಉತ್ತರ": "ಉತ್ತರಾ", "ಹಸ್ತ": "ಹಸ್ತಾ", "ಚಿತ್ತ": "ಚಿತ್ತಾ", "ಅನುರಾಧ": "ಅನೂರಾಧ",
                   "ಜ್ಯೇಷ್ಟ": "ಜ್ಯೇಷ್ಠ", "ಧನಿಷ್ಟ": "ಧನಿಷ್ಠ", "ಧನಿಷ್ಠಾ": "ಧನಿಷ್ಠ", "ಧನಿಷ್ಟಾ": "ಧನಿಷ್ಠ", "ಅಶ್ಲೇಷ": "ಆಶ್ಲೇಷ",
                   "ಮೃಗಶಿರಾ": "ಮೃಗಶಿರ", "ಪೂರ್ವಭಾದ್ರ": "ಪೂರ್ವಾಭಾದ್ರ", "ಉತ್ತಾರಾಷಾಢ": "ಉತ್ತರಾಷಾಢ"}
YOGA_NAMES = ["ವಿಷ್ಕಂಭ", "ಪ್ರೀತಿ", "ಆಯುಷ್ಮಾನ್", "ಸೌಭಾಗ್ಯ", "ಶೋಭನ", "ಅತಿಗಂಡ", "ಸುಕರ್ಮ", "ಧೃತಿ", "ಶೂಲ", "ಗಂಡ", "ವೃದ್ಧಿ", "ಧ್ರುವ",
              "ವ್ಯಾಘಾತ", "ಹರ್ಷಣ", "ವಜ್ರ", "ಸಿದ್ಧಿ", "ವ್ಯತೀಪಾತ", "ವರೀಯಾನ್", "ಪರಿಘ", "ಶಿವ", "ಸಿದ್ಧ", "ಸಾಧ್ಯ", "ಶುಭ", "ಶುಕ್ಲ",
              "ಬ್ರಹ್ಮ", "ಐಂದ್ರ", "ವೈಧೃತಿ"]
KARANA_MOVABLE = ["ಬವ", "ಬಾಲವ", "ಕೌಲವ", "ತೈತಿಲ", "ಗರಜ", "ವಣಿಜ", "ವಿಷ್ಟಿ"]
KARANA_NAMES = ["ಕಿಂಸ್ತುಘ್ನ"] + [KARANA_MOVABLE[i % 7] for i in range(56)] + ["ಶಕುನಿ", "ಚತುಷ್ಪಾದ", "ನಾಗವ"]   # 1..60
RASHI_NAMES = ["ಮೇಷ", "ವೃಷಭ", "ಮಿಥುನ", "ಕರ್ಕ", "ಸಿಂಹ", "ಕನ್ಯಾ", "ತುಲಾ", "ವೃಶ್ಚಿಕ", "ಧನು", "ಮಕರ", "ಕುಂಭ", "ಮೀನ"]
MASA_NAMES = ["ಚೈತ್ರ", "ವೈಶಾಖ", "ಜ್ಯೇಷ್ಠ", "ಆಷಾಢ", "ಶ್ರಾವಣ", "ಭಾದ್ರಪದ", "ಆಶ್ವಯುಜ", "ಕಾರ್ತಿಕ", "ಮಾರ್ಗಶಿರ", "ಪುಷ್ಯ", "ಮಾಘ", "ಫಾಲ್ಗುಣ"]
SAMVATSARA = {2026: ("ವಿಶ್ವಾವಸು", "ಪರಾಭವ"), 2027: ("ಪರಾಭವ", "ಪ್ಲವಂಗ")}   # before / after that year's Ugadi
SHAKA_BEFORE = {2026: 1947, 2027: 1948}                                      # +1 from Ugadi on
WEEKDAYS_KN = ["ಸೋಮ", "ಮಂಗಳ", "ಬುಧ", "ಗುರು", "ಶುಕ್ರ", "ಶನಿ", "ಭಾನು"]            # Monday first
KDIGITS = str.maketrans("೦೧೨೩೪೫೬೭೮೯", "0123456789")


def tithi_number(name):
    """Tithi number 1-30 for a name that is unambiguous (ಪೂರ್ಣಿಮಾ = 15, ಅಮಾವಾಸ್ಯೆ = 30), else 1-15 within its paksha."""
    name = TITHI_ALIAS.get(name, name)
    if name == "ಪೂರ್ಣಿಮಾ":
        return 15
    if name == "ಅಮಾವಾಸ್ಯೆ":
        return 30
    return TITHI_NAMES.index(name) + 1 if name in TITHI_NAMES else None


def nakshatra_name(name):
    name = NAKSHATRA_ALIAS.get(name, name)
    return name if name in NAKSHATRA_NAMES else None


def tithi_name_ok(name, computed):
    """The printed tithi is the one at sunrise; allow one step either way for a boundary close to sunrise."""
    n = tithi_number(name)
    if n is None:
        return False
    for c in (computed - 1, computed, computed + 1):
        c = (c - 1) % 30 + 1
        if (n == c) or (n < 15 and c % 15 == n % 15 and c not in (15, 30)):
            return True
    return False


def nakshatra_ok(name, computed):
    n = NAKSHATRA_NAMES.index(name) + 1
    return min((n - computed) % 27, (computed - n) % 27) <= 1


# ---------------------------------------------------------------- time helpers
def hhmm_number(minutes):
    """Minutes after midnight (may exceed 1440) -> the number h.mm the app reads (26.10 = 02:10 next day)."""
    return round(minutes // 60 + (minutes % 60) / 100.0, 2)


def parse_time(raw, sunrise):
    """Printed 'marker.h.mm' text -> (minutes after midnight, full_day). (None, False) if it cannot be read safely."""
    s = raw.translate(KDIGITS).replace("‌", "").replace("‍", "")
    s = re.sub(r"\s+", "", s)
    if "ದಿ" in s and "ಪೂ" in s:
        return None, True
    m = re.search(r"(\d{1,2})[.:]?(\d{2})\)?$", s)
    if not m:
        return None, False
    h, mi = int(m.group(1)), int(m.group(2))
    if mi > 59 or h > 12:
        return None, False
    if "ಮಾ.ಬೆ" in s or "ಮಾ ಬೆ" in s or "ಬೆ.ಜಾ" in s or "ಮಾಬೆ" in s:
        return 1440 + h * 60 + mi, False
    if "ಬೆ" in s:
        t = h * 60 + mi
        return (t + 1440 if t < sunrise - 30 else t), False
    if "ಮ" in s:
        return (h if h in (10, 11, 12) else h + 12) * 60 + mi, False
    if "ಸಾ" in s:
        return (h if h == 12 else h + 12) * 60 + mi, False
    if "ರಾ" in s:
        if h == 12:
            return 1440 + mi, False
        return (1440 + h * 60 + mi if h <= 5 else (h + 12) * 60 + mi), False
    return None, False                      # no usable marker


# ---------------------------------------------------------------- 2027 Word file
def docx_rows(path):
    """Table 1 of Calander 2027.docx -> one text row per day (365)."""
    xml = zipfile.ZipFile(os.path.join(ROOT, path)).read("word/document.xml").decode("utf8")
    paras = ["".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)) for p in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S)]
    paras = [p.strip() for p in paras if p.strip()]
    heads = [i for i, p in enumerate(paras) if re.match(r"^\S+\s+2027$", p.replace("‌", "").strip())]
    end = heads[12]                             # the second table starts at the second "ಜನವರಿ 2027"
    rows = []
    for line in paras[:end]:
        if line.startswith("ಶ್ರೀ") or re.match(r"^\S+\s+2027$", line.replace("‌", "")):
            continue
        s = re.sub(r"^[\d೦-೯.\s‌‍]+", "", line)
        if s and s.split()[0] in WEEKDAYS_KN:
            rows.append(s)
        elif rows:
            rows[-1] += " " + s                 # continuation line (second tithi / the nakshatra)
    return rows


def docx_day(row, sunrise):
    """-> (tithi, nakshatra) each {"name", "ends" (minutes) or None, "full"} or None."""
    tithi = nak = None
    for name, inner in re.findall(r"([ಀ-೿‌‍]*)\s*\(([^)]*)\)?", row):
        name = name.replace("‌", "").replace("‍", "").strip()
        inner_name = re.sub(r"[\d೦-೯.:()\s]+", "", inner)
        if not name and not tithi and inner_name:
            name = ""
        t, full = parse_time(inner, sunrise)
        entry = {"name": name, "ends": t, "full": full}
        if name in ("ಮಂಗಳ",):
            continue
        if (TITHI_ALIAS.get(name, name) in TITHI_NAMES) or name in ("ಪೂರ್ಣಿಮಾ", "ಅಮಾವಾಸ್ಯೆ"):
            if tithi is None:
                tithi = entry
        elif name and nakshatra_name(name):
            if nak is None:
                nak = entry
        elif not name and tithi is None:
            tithi = entry                       # a time with no name (a source error): kept without a name
    return tithi, nak


# ---------------------------------------------------------------- astronomy
def minute_of(date):
    return (date - ORIGIN).days * 1440


def sunrise_minutes(date, lat, lon):
    return int(S.sun_minutes(date, lat, lon)[0])


def lunar_months(span_minutes):
    """List of (start_minute, name, kind) for each lunar month (new moon to new moon, amanta); kind is
    'adhika' / 'nija' / ''. A lunation that starts and ends with the Sun in the same rashi has no
    sankranti in it and is the extra (adhika) month. The month is named after the Sun's rashi at its start."""
    lead = 60
    origin = ORIGIN - datetime.timedelta(days=lead)
    news = []                                   # new-moon times, minutes after ORIGIN
    for t in P.boundaries("tithi", origin, span_minutes + lead * 1440):
        elong = P.angles(P.jde_of(origin, 0) + t / 1440.0)[0]
        if min(elong, 360 - elong) < 0.05:      # the boundary between tithi 30 and tithi 1
            news.append(t - lead * 1440)
    out = []
    for i, t in enumerate(news[:-1]):
        rashi = [int(P.angles(P.jde_of(ORIGIN, 0) + x / 1440.0)[2] // 30) for x in (t, news[i + 1])]
        name = MASA_NAMES[(rashi[0] + 1) % 12]
        kind = "adhika" if rashi[0] == rashi[1] else ""
        out.append([t, name, kind])
    for i in range(1, len(out)):                # the month after an adhika one is the nija month of the same name
        if out[i - 1][2] == "adhika" and out[i][1] == out[i - 1][1]:
            out[i][2] = "nija"
    return out


def masa_label(name, kind):
    return {"adhika": "ಅಧಿಕ ", "nija": "ನಿಜ "}.get(kind, "") + name


# ---------------------------------------------------------------- main build
def main():
    sys.stdout.reconfigure(encoding="utf8")
    P.self_check()
    report = []

    pdf = json.load(open(os.path.join(ROOT, PDF_JSON), encoding="utf8"))["dates"]
    events = json.load(open(os.path.join(ROOT, EVENTS_JSON), encoding="utf8"))["events"]
    ugadi = {}
    for key in sorted(events, key=lambda k: (k[-4:], k[3:5], k[:2])):
        if any("ಸಂವತ್ಸರ ಚಾಂದ್ರಮಾನ ಯುಗಾದಿ" in e for e in events[key]):
            ugadi.setdefault(int(key[-4:]), datetime.datetime.strptime(key, "%d-%m-%Y").date())
    assert set(ugadi) == set(YEARS), "Ugadi dates not found in calendar-events.json: %s" % ugadi

    lat, lon = S.DISTRICTS["Bengaluru Urban"]
    rows27 = docx_rows(DOCX_2027)
    assert len(rows27) == 365, "expected 365 docx rows, got %d" % len(rows27)

    days_total = 365 * 2
    span = (days_total + 3) * 1440
    masas = lunar_months(span + 40 * 1440)
    ends = {k: P.boundaries(k, ORIGIN, span) for k in ("yoga", "karana")}
    first = {k: int(P.quantity(k, P.jde_of(ORIGIN, 0)) // P.STEP[k]) for k in ends}

    core = {}
    month_names = {}
    for year in YEARS:
        d = datetime.date(year, 1, 1)
        while d.year == year:
            key = d.strftime("%d-%m-%Y")
            off = minute_of(d)
            rise = sunrise_minutes(d, lat, lon)
            jde = P.jde_of(d, rise)
            elong, moon_s, sun_s = P.angles(jde)
            c_tithi = int(elong // 12) + 1
            c_nak = int(moon_s // (360 / 27)) + 1
            rec = {}

            # --- tithi and nakshatra: PDF (2026) or Word file (2027)
            if year == 2026:
                src = pdf.get(key) or {}
                t, n = src.get("tithi"), src.get("nakshatra")
                tith = {"name": t["name"], "ends": (None if t.get("fullDay") else float(t["endsAt"])), "full": bool(t.get("fullDay"))} if t else None
                nk = {"name": n["name"], "ends": (None if n.get("fullDay") else float(n["endsAt"])), "full": bool(n.get("fullDay"))} if n else None
                for e in (tith, nk):
                    if e and e["ends"] is not None:
                        e["ends"] = int(e["ends"]) * 60 + round((e["ends"] - int(e["ends"])) * 100)
            else:
                row = rows27[(d - datetime.date(2027, 1, 1)).days]
                if row.split()[0] != WEEKDAYS_KN[d.weekday()]:
                    sys.exit("weekday mismatch on %s: row starts %s" % (key, row.split()[0]))
                tith, nk = docx_day(row, rise)

            for label, entry, ok_fn, computed in (("tithi", tith, tithi_name_ok, c_tithi), ("nakshatra", nk, None, c_nak)):
                if entry is None or not entry["name"]:
                    report.append("%s %s: name missing in source" % (key, label))
                    rec[label] = None
                    continue
                if label == "tithi":
                    entry["name"] = TITHI_ALIAS.get(entry["name"], entry["name"])
                    good = tithi_name_ok(entry["name"], computed)
                else:
                    entry["name"] = nakshatra_name(entry["name"]) or entry["name"]
                    good = entry["name"] in NAKSHATRA_NAMES and nakshatra_ok(entry["name"], computed)
                if not good:
                    report.append("%s %s: '%s' does not match the calculation (#%d); left unavailable" % (key, label, entry["name"], computed))
                    rec[label] = None
                    continue
                if entry["full"]:
                    rec[label] = {"name": entry["name"], "fullDay": True}
                elif entry["ends"] is None:
                    report.append("%s %s: end time unreadable; name kept" % (key, label))
                    rec[label] = {"name": entry["name"]}
                else:
                    rec[label] = {"name": entry["name"], "ends": hhmm_number(entry["ends"])}

            # --- paksha (tithi name decides at the full/new moon, the calculation otherwise)
            tname = (rec.get("tithi") or {}).get("name")
            if tname == "ಪೂರ್ಣಿಮಾ":
                paksha = "ಶುಕ್ಲ"
            elif tname == "ಅಮಾವಾಸ್ಯೆ":
                paksha = "ಕೃಷ್ಣ"
            else:
                paksha = "ಶುಕ್ಲ" if c_tithi <= 15 else "ಕೃಷ್ಣ"
            rec["paksha"] = paksha
            rec["ayana"] = "ಉತ್ತರಾಯಣ" if (sun_s >= 270 or sun_s < 90) else "ದಕ್ಷಿಣಾಯನ"
            rec["solarRashi"] = RASHI_NAMES[int(sun_s // 30)]
            rec["chandraRashi"] = RASHI_NAMES[int(moon_s // 30)]
            idx = bisect.bisect_right([m[0] for m in masas], off + rise) - 1
            month_names.setdefault(d.strftime("%Y-%m"), [])
            label = masa_label(masas[idx][1], masas[idx][2])
            if label not in month_names[d.strftime("%Y-%m")]:
                month_names[d.strftime("%Y-%m")].append(label)
            before, after = SAMVATSARA[year]
            new_year = d >= ugadi[year]
            rec["samvatsara"] = after if new_year else before
            rec["shakaYear"] = SHAKA_BEFORE[year] + (1 if new_year else 0)
            core[key] = rec
            d += datetime.timedelta(days=1)

    for key, rec in core.items():
        rec["months"] = month_names[key[6:] + "-" + key[3:5]]

    # --- per-district file
    os.makedirs(os.path.join(ROOT, DISTRICT_DIR), exist_ok=True)

    def fmt(t, base):
        m = int(t) - base
        return "%02d:%02d%s" % ((m // 60) % 24, m % 60, "" if m < 1440 else "+%d" % (m // 1440))

    slugs = {}
    for name, (dlat, dlon) in sorted(S.DISTRICTS.items()):
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        slugs[name] = slug
        out = {}
        for year in YEARS:
            rows, d = [], datetime.date(year, 1, 1)
            while d.year == year:
                off = minute_of(d)
                rs, ss = S.sun_minutes(d, dlat, dlon)
                kal = S.kalas(d, rs, ss)
                rise = int(rs)
                yi = bisect.bisect_right(ends["yoga"], off + rise)
                ki = bisect.bisect_right(ends["karana"], off + rise)
                rows.append([
                    S.hhmm(rs, truncate=True), S.hhmm(ss, truncate=True)] +
                    ["%s-%s" % kal[k] for k in ("rahuKala", "gulikaKala", "yamaganda", "arthaPrahara")] + [
                    (first["yoga"] + yi) % 27 + 1, fmt(ends["yoga"][yi], off),
                    (first["karana"] + ki) % 60 + 1, fmt(ends["karana"][ki], off),
                    (first["karana"] + ki + 1) % 60 + 1, fmt(ends["karana"][ki + 1], off)])
                d += datetime.timedelta(days=1)
            out[str(year)] = rows
        with open(os.path.join(ROOT, DISTRICT_DIR, slug + ".json"), "w", encoding="utf8") as f:
            json.dump({"district": name, "lat": dlat, "lon": dlon,
                       "columns": ["sunrise", "sunset", "rahuKala", "gulikaKala", "yamaganda", "arthaPrahara",
                                   "yoga", "yogaEnds", "karana", "karanaEnds", "nextKarana", "nextKaranaEnds"],
                       "note": "one row per day, index 0 = 1 January. Times are IST; +1 means the next day. "
                               "Yoga 1-27, karana 1-60: names are in data/panchanga.json. Kalas divide the district's real sunrise-sunset day into eight",
                       **out}, f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(ROOT, CORE_PATH), "w", encoding="utf8") as f:
        json.dump({"source": "built by scripts/build-panchanga-data.py: 2026 tithi/nakshatra from the PV PDF, 2027 from Calander 2027.docx, the rest computed",
                   "defaultDistrict": "Bengaluru Urban", "districts": slugs,
                   "yogaNames": YOGA_NAMES, "karanaNames": KARANA_NAMES,
                   "unavailable": ["shubhaSamaya", "rashiBhavishya"],
                   "days": core}, f, ensure_ascii=False, separators=(",", ":"))

    print("wrote %s (%d days) and %d files in %s/" % (CORE_PATH, len(core), len(slugs), DISTRICT_DIR))
    print("%d notes:" % len(report))
    for line in report:
        print("  " + line)
    print("months per calendar month:")
    for k in sorted(month_names):
        print("  %s %s" % (k, " / ".join(month_names[k])))


if __name__ == "__main__":
    main()
