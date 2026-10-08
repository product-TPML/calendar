# -*- coding: utf-8 -*-
"""
compute-panchanga.py
====================
Computes tithi, nakshatra, yoga and karana (with the time each one ends) for a
date, from the Sun's and Moon's positions. Prototype: no network, no
third-party package.

  Sun   NOAA solar-position series (as in compute-sun-times.py).
  Moon  Meeus, "Astronomical Algorithms" ch. 47 (longitude terms only).
  Time  IST (UTC+5:30). The positions are taken at TT (UT + delta-T).
  Zodiac for nakshatra and yoga: sidereal, Lahiri (Chitrapaksha) ayanamsa.

Definitions
  tithi     = floor((Moon - Sun) / 12 deg) + 1           (1..30)
  karana    = floor((Moon - Sun) / 6 deg) + 1            (1..60)
  nakshatra = floor(Moon_sidereal / 13 deg 20')  + 1     (1..27)
  yoga      = floor((Sun_sid + Moon_sid) / 13 deg 20') + 1 (1..27)
Each is reported as the one running at sunrise, with the moment it ends.

Use:  from the repo root,  python scripts/compute-panchanga.py 2026-11-30
      python scripts/compute-panchanga.py --longitudes    # writes data/sun-moon-longitudes.json
      python scripts/compute-panchanga.py --yoga-karana   # writes data/yoga-karana.json (district-wise)
"""
import datetime
import importlib.util
import json
import math
import sys

IST = 5.5

# --- Meeus table 47.A, longitude: (D, M, M', F, coefficient in 1e-6 degree)
MOON_TERMS = [
    (0, 0, 1, 0, 6288774), (2, 0, -1, 0, 1274027), (2, 0, 0, 0, 658314), (0, 0, 2, 0, 213618),
    (0, 1, 0, 0, -185116), (0, 0, 0, 2, -114332), (2, 0, -2, 0, 58793), (2, -1, -1, 0, 57066),
    (2, 0, 1, 0, 53322), (2, -1, 0, 0, 45758), (0, 1, -1, 0, -40923), (1, 0, 0, 0, -34720),
    (0, 1, 1, 0, -30383), (2, 0, 0, -2, 15327), (0, 0, 1, 2, -12528), (0, 0, 1, -2, 10980),
    (4, 0, -1, 0, 10675), (0, 0, 3, 0, 10034), (4, 0, -2, 0, 8548), (2, 1, -1, 0, -7888),
    (2, 1, 0, 0, -6766), (1, 0, -1, 0, -5163), (1, 1, 0, 0, 4987), (2, -1, 1, 0, 4036),
    (2, 0, 2, 0, 3994), (4, 0, 0, 0, 3861), (2, 0, -3, 0, 3665), (0, 1, -2, 0, -2689),
    (2, 0, -1, 2, -2602), (2, -1, -2, 0, 2390), (1, 0, 1, 0, -2348), (2, -2, 0, 0, 2236),
    (0, 1, 2, 0, -2120), (0, 2, 0, 0, -2069), (2, -2, -1, 0, 2048), (2, 0, 1, -2, -1773),
    (2, 0, 0, 2, -1595), (4, -1, -1, 0, 1215), (0, 0, 2, 2, -1110), (3, 0, -1, 0, -892),
    (2, 1, 1, 0, -810), (4, -1, -2, 0, 759), (0, 2, -1, 0, -713), (2, 2, -1, 0, -700),
    (2, 1, -2, 0, 691), (2, -1, 0, -2, 596), (4, 0, 1, 0, 549), (0, 0, 4, 0, 537),
    (4, -1, 0, 0, 520), (1, 0, -2, 0, -487), (2, 1, 0, -2, -399), (0, 0, 2, -2, -381),
    (1, 1, 1, 0, 351), (3, 0, -2, 0, -340), (4, 0, -3, 0, 330), (2, -1, 2, 0, 327),
    (0, 2, 1, 0, -323), (1, 1, -1, 0, 299), (2, 0, 3, 0, 294),
]

KARANA_MOVABLE = ("Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti")


def delta_t(year):
    """TT - UT in seconds (smooth approximation, good to about a second for 2020-2030)."""
    return 69.4 + 0.45 * (year - 2026)


def moon_longitude(jde):
    """Geometric mean-equinox-of-date longitude of the Moon, degrees."""
    t = (jde - 2451545.0) / 36525.0
    lp = 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t + t ** 3 / 538841 - t ** 4 / 65194000
    d = 297.8501921 + 445267.1114034 * t - 0.0018819 * t * t + t ** 3 / 545868 - t ** 4 / 113065000
    m = 357.5291092 + 35999.0502909 * t - 0.0001536 * t * t + t ** 3 / 24490000
    mp = 134.9633964 + 477198.8675055 * t + 0.0087414 * t * t + t ** 3 / 69699 - t ** 4 / 14712000
    f = 93.2720950 + 483202.0175233 * t - 0.0036539 * t * t - t ** 3 / 3526000 + t ** 4 / 863310000
    a1 = 119.75 + 131.849 * t
    a2 = 53.09 + 479264.290 * t
    e = 1 - 0.002516 * t - 0.0000074 * t * t
    total = 0.0
    for kd, km, kmp, kf, coef in MOON_TERMS:
        arg = math.radians(kd * d + km * m + kmp * mp + kf * f)
        total += coef * (e ** abs(km)) * math.sin(arg)
    total += 3958 * math.sin(math.radians(a1)) + 1962 * math.sin(math.radians(lp - f)) + 318 * math.sin(math.radians(a2))
    return (lp + total / 1e6) % 360


def sun_longitude(jde):
    """True (geometric) longitude of the Sun, mean equinox of date, degrees."""
    t = (jde - 2451545.0) / 36525.0
    l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
    m = math.radians(357.52911 + t * (35999.05029 - 0.0001537 * t))
    c = (math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
         + math.sin(2 * m) * (0.019993 - 0.000101 * t) + math.sin(3 * m) * 0.000289)
    return (l0 + c) % 360


def lahiri(jde):
    """Lahiri (Chitrapaksha) ayanamsa in degrees: 23 deg 51' 11\" at J2000 plus precession."""
    return 23.85306 + 0.0139697 * (jde - 2451545.0) / 365.25


def jde_of(date, minutes_ist):
    """Julian day (TT) of a local IST time on a date."""
    jd_ut = date.toordinal() + 1721424.5 + (minutes_ist - IST * 60) / 1440.0
    return jd_ut + delta_t(date.year) / 86400.0


def angles(jde):
    """(elongation, Moon sidereal, Sun sidereal) in degrees."""
    mo, su = moon_longitude(jde), sun_longitude(jde)
    ay = lahiri(jde)
    return (mo - su) % 360, (mo - ay) % 360, (su - ay) % 360


def quantity(kind, jde):
    """The angle (degrees, 0-360) whose steps define each element."""
    elong, moon_s, sun_s = angles(jde)
    return {"tithi": elong, "karana": elong, "nakshatra": moon_s, "yoga": (moon_s + sun_s) % 360}[kind]


STEP = {"tithi": 12.0, "karana": 6.0, "nakshatra": 360.0 / 27, "yoga": 360.0 / 27}


def running_at(kind, date, minutes_ist):
    """(index starting at 0, end time in IST minutes after midnight of `date`; >= 1440 means next day)."""
    jde0 = jde_of(date, minutes_ist)
    q0 = quantity(kind, jde0)
    idx = int(q0 // STEP[kind])
    need = (idx + 1) * STEP[kind] - q0                    # degrees still to go, > 0
    lo, hi = 0.0, 3.0 * 1440                              # minutes after the start time
    for _ in range(60):
        mid = (lo + hi) / 2
        gone = (quantity(kind, jde0 + mid / 1440.0) - q0) % 360
        if gone < need:
            lo = mid
        else:
            hi = mid
    return idx, minutes_ist + (lo + hi) / 2


def karana_name(index):
    """Name for a 0-based karana index (0..59)."""
    if index == 0:
        return "Kimstughna"
    if index >= 57:
        return ("Shakuni", "Chatushpada", "Naga")[index - 57]
    return KARANA_MOVABLE[(index - 1) % 7]


def hhmm(minutes):
    total = int(minutes)
    return "%02d:%02d" % ((total // 60) % 24, total % 60)


def day(date, sunrise_minutes):
    """The four elements running at sunrise, each with its end time (IST)."""
    out = {}
    for kind in ("tithi", "nakshatra", "yoga", "karana"):
        idx, end = running_at(kind, date, sunrise_minutes)
        out[kind] = {"index": idx + 1, "end": end}
    out["karana"]["name"] = karana_name(out["karana"]["index"] - 1)
    return out


def self_check():
    """Meeus example 47.a: the Moon's geometric longitude on 1992 April 12 at 0h TD
    is 133.162655 degrees (133.167265 once nutation is added)."""
    got = moon_longitude(2448724.5)
    assert abs(got - 133.162655) < 0.0005, "Moon longitude %.6f != 133.162655" % got


RASHI = ("Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya", "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena")
LONGITUDES_PATH = "data/sun-moon-longitudes.json"


def write_longitudes():
    """Sun and Moon at sunrise (Bengaluru) for every day of 2026 and 2027."""
    spec = importlib.util.spec_from_file_location("sun_times", "scripts/compute-sun-times.py")
    st = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(st)
    lat, lon = st.DISTRICTS["Bengaluru Urban"]
    years = {}
    for year in (2026, 2027):
        rows, d = [], datetime.date(year, 1, 1)
        while d.year == year:
            rise = int(st.sun_minutes(d, lat, lon)[0])          # whole minutes, as printed
            _, moon_s, sun_s = angles(jde_of(d, rise))
            rows.append([st.hhmm(rise), round(sun_s, 4), RASHI[int(sun_s // 30)],
                         round(moon_s, 4), RASHI[int(moon_s // 30)]])
            d += datetime.timedelta(days=1)
        years[str(year)] = rows
    with open(LONGITUDES_PATH, "w", encoding="utf8") as f:
        json.dump({"source": "computed by scripts/compute-panchanga.py (Sun: NOAA series; Moon: Meeus ch.47 longitude terms; Lahiri ayanamsa)",
                   "place": "Bengaluru Urban sunrise",
                   "columns": ["sunrise IST", "sun sidereal deg", "sun rashi", "moon sidereal deg", "moon rashi"],
                   "note": "one row per day, index 0 = 1 January; positions are at that day's sunrise",
                   **years}, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote %s: %d + %d days" % (LONGITUDES_PATH, len(years["2026"]), len(years["2027"])))


YOGA_KARANA_PATH = "data/yoga-karana.json"
YOGA_NAMES = ("Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula", "Ganda",
              "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva",
              "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti")


def boundaries(kind, start, end, step_min=30):
    """Sorted times (minutes after `start` midnight IST) at which `kind` moves to its next index."""
    jde0 = jde_of(start, 0)
    out, t = [], 0.0
    prev = int(quantity(kind, jde0) // STEP[kind])
    while t < end:
        t2 = t + step_min
        cur = int(quantity(kind, jde0 + t2 / 1440.0) // STEP[kind])
        if cur != prev:
            lo, hi = t, t2
            for _ in range(40):
                mid = (lo + hi) / 2
                if int(quantity(kind, jde0 + mid / 1440.0) // STEP[kind]) == prev:
                    lo = mid
                else:
                    hi = mid
            out.append((lo + hi) / 2)
            prev = cur
        t = t2
    return out


def write_yoga_karana():
    """Yoga and karana running at each district's sunrise, 2026-2027. Bengaluru Urban in full;
    other districts only where their sunrise gives a different record."""
    import bisect
    spec = importlib.util.spec_from_file_location("sun_times", "scripts/compute-sun-times.py")
    st = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(st)
    origin = datetime.date(2026, 1, 1)
    days = (datetime.date(2028, 1, 1) - origin).days
    span = (days + 3) * 1440
    ends = {k: boundaries(k, origin, span) for k in ("yoga", "karana")}
    first = {k: int(quantity(k, jde_of(origin, 0)) // STEP[k]) for k in ends}

    def fmt(t, base):                       # minutes after origin -> "HH:MM" with +1/+2 for later days
        m = int(t) - base * 1440
        return "%02d:%02d%s" % ((m // 60) % 24, m % 60, "" if m < 1440 else "+%d" % (m // 1440))

    def record(offset, rise):
        t = offset * 1440 + rise
        yi = bisect.bisect_right(ends["yoga"], t)
        ki = bisect.bisect_right(ends["karana"], t)
        return [(first["yoga"] + yi) % 27 + 1, fmt(ends["yoga"][yi], offset),
                (first["karana"] + ki) % 60 + 1, fmt(ends["karana"][ki], offset),
                (first["karana"] + ki + 1) % 60 + 1, fmt(ends["karana"][ki + 1], offset)]

    base, over = {}, {}
    for year in (2026, 2027):
        d0 = (datetime.date(year, 1, 1) - origin).days
        n = 366 if year % 4 == 0 else 365
        for name, (lat, lon) in sorted(st.DISTRICTS.items()):
            rows = []
            for i in range(n):
                rise = int(st.sun_minutes(datetime.date(year, 1, 1) + datetime.timedelta(days=i), lat, lon)[0])
                rows.append(record(d0 + i, rise))
            if name == "Bengaluru Urban":
                base[str(year)] = rows
            else:
                over.setdefault(name, {})[str(year)] = rows
    diffs = {}
    for name, yrs in over.items():
        for y, rows in yrs.items():
            for i, r in enumerate(rows):
                if r != base[y][i]:
                    diffs.setdefault(name, {}).setdefault(y, {})[str(i)] = r
    with open(YOGA_KARANA_PATH, "w", encoding="utf8") as f:
        json.dump({"source": "computed by scripts/compute-panchanga.py (Lahiri sidereal; sunrise from compute-sun-times.py)",
                   "columns": ["yoga 1-27 at sunrise", "yoga ends IST", "karana 1-60 at sunrise", "karana ends IST",
                              "next karana 1-60", "next karana ends IST"],
                   "note": "'base' is Bengaluru Urban, index 0 = 1 January. 'overrides' lists, per district, only the days whose record differs from base. +1 = ends the next day. Karana 1 = Kimstughna, 2-57 = Bava..Vishti x8, 58-60 = Shakuni, Chatushpada, Naga",
                   "yogaNames": YOGA_NAMES, "base": base, "overrides": diffs},
                  f, ensure_ascii=False, separators=(",", ":"))
    total = sum(len(v) for y in diffs.values() for v in y.values())
    print("wrote %s: base %d days; %d district-days differ across %d districts" % (YOGA_KARANA_PATH, len(base["2026"]) + len(base["2027"]), total, len(diffs)))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf8")
    self_check()
    if "--yoga-karana" in sys.argv:
        write_yoga_karana()
        sys.exit(0)
    if "--longitudes" in sys.argv:
        write_longitudes()
        sys.exit(0)
    arg = sys.argv[1] if len(sys.argv) > 1 else "2026-11-30"
    date = datetime.date.fromisoformat(arg)
    res = day(date, 6 * 60 + 25)
    for k, v in res.items():
        print(k, v["index"], "ends", hhmm(v["end"]), "(+1 day)" if v["end"] >= 1440 else "", v.get("name", ""))
