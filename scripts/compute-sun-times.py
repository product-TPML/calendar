# -*- coding: utf-8 -*-
"""
compute-sun-times.py
====================
Computes sunrise and sunset (IST, seconds dropped as in the printed calendar) for every Karnataka district
and every day of 2026 and 2027, and writes data/sun-times.json.

No network and no third-party package: it is the public NOAA solar-position
algorithm (sunrise = the sun's upper edge on the horizon, standard
refraction, zenith 90.833 degrees) at each district headquarters.

District names are the ones used by data/pv-calendar-data.json and the app.
Coordinates are approximate (two decimals, a few hundred metres); a change of
0.01 degree of longitude moves the times by about 2 seconds.

Output shape:
  { "source": "...", "years": [2026, 2027],
    "districts": { "Bagalkot": { "lat": 16.18, "lon": 75.70,
                                 "2026": { "sunrise": ["HH:MM", ... 365], "sunset": [...] },
                                 "2027": { ... } }, ... } }
The arrays are indexed by day of the year (index 0 = 1 January).

The file also holds "weekdayTimings": Rahu Kala, Gulika Kala, Yamaganda and
Artha Prahara for each weekday. Each is one eighth (1.5 h) of a FIXED
06:00-18:00 day, exactly as the printed calendar does, so they do not depend on
the district or on the real sunrise and sunset. (Open decision: dividing the
real sunrise-to-sunset day instead; kalas() supports that, see the audit docs.)

Run from the repo root:
  python scripts/compute-sun-times.py            # writes data/sun-times.json
  python scripts/compute-sun-times.py --check    # self-checks only, writes nothing
  python scripts/compute-sun-times.py --kalas    # writes data/kalas.json: the four timings per district, per day

--kalas divides each district's REAL sunrise-to-sunset day into eight parts (the
traditional method), unlike weekdayTimings above, which uses the printed
calendar's fixed 06:00-18:00 day. Times are rounded to the nearest minute.
"""
import argparse
import datetime
import json
import math
import sys

OUT_PATH = "data/sun-times.json"
KALAS_PATH = "data/kalas.json"
YEARS = (2026, 2027)
IST = 5.5

# District headquarters (latitude, longitude).
DISTRICTS = {
    "Bagalkot": (16.18, 75.70),
    "Ballari": (15.14, 76.92),
    "Belagavi": (15.85, 74.50),
    "Bengaluru Rural": (13.30, 77.54),               # Doddaballapura
    "Bengaluru South (Ramanagara)": (12.72, 77.28),  # Ramanagara
    "Bengaluru Urban": (12.97, 77.59),
    "Bidar": (17.91, 77.52),
    "Chamarajanagar": (11.93, 76.94),
    "Chikkaballapur": (13.44, 77.73),
    "Chikkamagaluru": (13.32, 75.77),
    "Chitradurga": (14.23, 76.40),
    "Dakshina Kannada": (12.91, 74.86),              # Mangaluru
    "Davanagere": (14.46, 75.92),
    "Dharwad": (15.46, 75.01),
    "Gadag": (15.42, 75.63),
    "Hassan": (13.01, 76.10),
    "Haveri": (14.79, 75.40),
    "Kalaburagi": (17.33, 76.83),
    "Kodagu": (12.42, 75.74),                        # Madikeri
    "Kolar": (13.14, 78.13),
    "Mandya": (12.52, 76.90),
    "Mysuru": (12.30, 76.64),
    "Koppal": (15.35, 76.15),
    "Raichur": (16.21, 77.34),
    "Shivamogga": (13.93, 75.57),
    "Tumakuru": (13.34, 77.12),
    "Udupi": (13.34, 74.74),
    "Uttara Kannada": (14.81, 74.13),                # Karwar
    "Vijayapura": (16.83, 75.71),
    "Vijayanagara": (15.27, 76.39),                  # Hosapete
    "Yadgir": (16.76, 77.14),
}

# Slot (1-8) of the daytime eighths, by weekday (0 = Monday ... 6 = Sunday).
KALA_SLOT = {
    "rahuKala":     (2, 7, 5, 6, 4, 3, 8),
    "gulikaKala":   (6, 5, 4, 3, 2, 1, 7),
    "yamaganda":    (4, 3, 2, 1, 7, 6, 5),
    "arthaPrahara": (3, 2, 1, 7, 6, 5, 4),
}
FIXED_DAY = (6 * 60, 18 * 60)        # the printed calendar's day, in minutes
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def julian_day(date):
    """Julian day number at 00:00 UTC of a calendar date."""
    return date.toordinal() + 1721424.5


def solar_position(jd):
    """(equation of time in minutes, declination in radians) at Julian day jd."""
    t = (jd - 2451545.0) / 36525.0
    l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
    m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    mr = math.radians(m)
    c = (math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t))
         + math.sin(2 * mr) * (0.019993 - 0.000101 * t) + math.sin(3 * mr) * 0.000289)
    omega = 125.04 - 1934.136 * t
    app_long = l0 + c - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))
    obliq = 23 + (26 + seconds / 60) / 60 + 0.00256 * math.cos(math.radians(omega))
    decl = math.asin(math.sin(math.radians(obliq)) * math.sin(math.radians(app_long)))
    y = math.tan(math.radians(obliq) / 2) ** 2
    l0r = math.radians(l0)
    eqt = 4 * math.degrees(y * math.sin(2 * l0r) - 2 * e * math.sin(mr)
                           + 4 * e * y * math.sin(mr) * math.cos(2 * l0r)
                           - 0.5 * y * y * math.sin(4 * l0r) - 1.25 * e * e * math.sin(2 * mr))
    return eqt, decl


def sun_minutes(date, lat, lon):
    """(sunrise, sunset) as local IST minutes after midnight, floating point."""
    jd0 = julian_day(date)
    guess = {"rise": 6 * 60.0, "set": 18 * 60.0}     # local-time guesses, refined below
    out = {}
    for which in ("rise", "set"):
        minutes = guess[which]
        for _ in range(3):
            eqt, decl = solar_position(jd0 + (minutes - IST * 60) / 1440.0)
            latr = math.radians(lat)
            cos_ha = (math.cos(math.radians(90.833)) / (math.cos(latr) * math.cos(decl))
                      - math.tan(latr) * math.tan(decl))
            ha = math.degrees(math.acos(max(-1.0, min(1.0, cos_ha))))
            noon = 720 - 4 * lon - eqt + IST * 60
            minutes = noon - 4 * ha if which == "rise" else noon + 4 * ha
        out[which] = minutes
    return out["rise"], out["set"]


def hhmm(minutes, truncate=False):
    """HH:MM. Rounds to the nearest minute; truncate=True drops the seconds instead."""
    total = int(math.floor(minutes if truncate else minutes + 0.5))
    return "%02d:%02d" % (total // 60, total % 60)


def kalas(date, sunrise, sunset):
    """{"rahuKala": ("HH:MM", "HH:MM"), ...}: the weekday's eighth of the day
    between sunrise and sunset (minutes after midnight)."""
    eighth = (sunset - sunrise) / 8.0
    out = {}
    for name, slots in KALA_SLOT.items():
        n = slots[date.weekday()]
        out[name] = (hhmm(sunrise + (n - 1) * eighth), hhmm(sunrise + n * eighth))
    return out


def weekday_timings():
    """The four weekday timings on the fixed 06:00-18:00 day."""
    monday = datetime.date(2026, 1, 5)
    out = {}
    for i, name in enumerate(WEEKDAYS):
        k = kalas(monday + datetime.timedelta(days=i), *FIXED_DAY)
        out[name] = {key: "%s - %s" % k[key] for key in KALA_SLOT}
    return out


def build():
    districts = {}
    for name, (lat, lon) in sorted(DISTRICTS.items()):
        rec = {"lat": lat, "lon": lon}
        for year in YEARS:
            rises, sets = [], []
            day = datetime.date(year, 1, 1)
            while day.year == year:
                r, s = sun_minutes(day, lat, lon)
                rises.append(hhmm(r, truncate=True))   # the printed calendar drops the seconds
                sets.append(hhmm(s, truncate=True))
                day += datetime.timedelta(days=1)
            rec[str(year)] = {"sunrise": rises, "sunset": sets}
        districts[name] = rec
    return districts


def build_kalas():
    """{district: {year: [[rahu, gulika, yamaganda, artha] per day]}}, each "HH:MM-HH:MM"
    from the district's real sunrise and sunset (unrounded) on that day."""
    out = {}
    for name, (lat, lon) in sorted(DISTRICTS.items()):
        rec = {}
        for year in YEARS:
            rows, day = [], datetime.date(year, 1, 1)
            while day.year == year:
                rise, sset = sun_minutes(day, lat, lon)
                k = kalas(day, rise, sset)
                rows.append(["%s-%s" % k[key] for key in KALA_SLOT])
                day += datetime.timedelta(days=1)
            rec[str(year)] = rows
        out[name] = rec
    return out


def check(districts):
    """Sanity checks that fail loudly; returns the number of checks run."""
    n = 0

    def ok(cond, msg):
        nonlocal n
        n += 1
        if not cond:
            sys.exit("CHECK FAILED: " + msg)

    mins = lambda hm: int(hm[:2]) * 60 + int(hm[3:])
    ok(len(districts) == 31, "31 districts")
    for name, rec in districts.items():
        for year in YEARS:
            days = 366 if year % 4 == 0 else 365
            r, s = rec[str(year)]["sunrise"], rec[str(year)]["sunset"]
            ok(len(r) == days and len(s) == days, "%s %d has %d days" % (name, year, days))
            lengths = [mins(b) - mins(a) for a, b in zip(r, s)]
            ok(all(10 * 60 + 30 <= x <= 13 * 60 + 30 for x in lengths), name + " day length 10.5-13.5 h")
            ok(all(5 * 60 + 30 <= mins(a) <= 7 * 60 + 15 for a in r), name + " sunrise 05:30-07:15")
    # Day-of-year index 171 is 21 June 2026: the longest day, longer in the north.
    ok(mins(districts["Bidar"]["2026"]["sunset"][171]) - mins(districts["Bidar"]["2026"]["sunrise"][171])
       > mins(districts["Mysuru"]["2026"]["sunset"][171]) - mins(districts["Mysuru"]["2026"]["sunrise"][171]),
       "Bidar's June day is longer than Mysuru's")
    # East sees the sun first: on any day Kolar (78.1E) rises before Belagavi (74.5E).
    ok(all(mins(a) < mins(b) for a, b in zip(districts["Kolar"]["2027"]["sunrise"], districts["Belagavi"]["2027"]["sunrise"])),
       "Kolar sunrise earlier than Belagavi all 2027")
    # Rahu Kala on a Thursday is the 6th eighth; Monday the 2nd.
    thu = datetime.date(2026, 1, 1)
    r, s = sun_minutes(thu, 12.97, 77.59)
    ok(kalas(thu, r, s)["rahuKala"][0] == hhmm(r + 5 * (s - r) / 8), "Thursday Rahu starts after 5 eighths")
    # The printed calendar's weekday table, spot-checked cell by cell.
    wt = weekday_timings()
    for day, key, want in (("Thursday", "rahuKala", "13:30 - 15:00"), ("Thursday", "gulikaKala", "09:00 - 10:30"),
                           ("Thursday", "yamaganda", "06:00 - 07:30"), ("Monday", "arthaPrahara", "09:00 - 10:30"),
                           ("Wednesday", "arthaPrahara", "06:00 - 07:30"), ("Sunday", "rahuKala", "16:30 - 18:00"),
                           ("Friday", "yamaganda", "15:00 - 16:30"), ("Thursday", "arthaPrahara", "15:00 - 16:30")):
        ok(wt[day][key] == want, "%s %s is %s" % (day, key, want))
    ok(len(wt) == 7 and all(len(v) == 4 for v in wt.values()), "7 weekdays x 4 timings")
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="run self-checks, write nothing")
    ap.add_argument("--kalas", action="store_true", help="write data/kalas.json (district-wise, real sunrise/sunset)")
    args = ap.parse_args()
    if args.kalas:
        data = build_kalas()
        with open(KALAS_PATH, "w", encoding="utf8") as f:
            json.dump({"source": "computed by scripts/compute-sun-times.py --kalas",
                       "basis": "the district's real sunrise-to-sunset day divided into eight equal parts",
                       "columns": list(KALA_SLOT), "note": "per district and year, one row per day (index 0 = 1 January)",
                       "districts": data}, f, ensure_ascii=False, separators=(",", ":"))
        print("wrote %s: %d districts" % (KALAS_PATH, len(data)))
        return
    districts = build()
    count = check(districts)
    print("%d self-checks passed" % count)
    if args.check:
        return
    with open(OUT_PATH, "w", encoding="utf8") as f:
        json.dump({"source": "computed by scripts/compute-sun-times.py (NOAA solar algorithm, IST)",
                   "years": list(YEARS),
                   "kalaBasis": "weekdayTimings = printed calendar's fixed 06:00-18:00 day, for comparison; district-wise values are in data/kalas.json",
                   "weekdayTimings": weekday_timings(), "districts": districts}, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote %s: %d districts x %d years" % (OUT_PATH, len(districts), len(YEARS)))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf8")
    main()
