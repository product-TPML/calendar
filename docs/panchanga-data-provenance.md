# Panchanga data: what is taken from a source, what is calculated, and how

For editors. Every value in the Panchanga tab (2026 and 2027) is in one of three groups:

1. **Taken from a source file.** Copied, with only the spelling and time format normalised.
2. **Calculated.** Worked out from the Sun's and Moon's positions or from sunrise and sunset. No source file is involved.
3. **Not available.** No source and no rule. The tab says "ಲಭ್ಯವಿಲ್ಲ".

The tab reads no OCR. The data is built by `python scripts/build-panchanga-data.py` into `data/panchanga.json` (per day) and `data/panchanga/<district>.json` (per district).

---

## 1. At a glance

| Value shown | Group | Source or method |
|---|---|---|
| Tithi name and end time, 2026 | Source | `data/pdf-panchanga-data.json`, extracted from the PV wall-calendar PDF |
| Nakshatra name and end time, 2026 | Source | Same file |
| Tithi name and end time, 2027 | Source | `data/Calander 2027.docx`, Table 1 |
| Nakshatra name and end time, 2027 | Source | Same file |
| Ugadi date (samvatsara and Shaka year change) | Source | `data/calendar-events.json`, the "ಸಂವತ್ಸರ ಚಾಂದ್ರಮಾನ ಯುಗಾದಿ" event (19-03-2026, 07-04-2027) |
| Samvatsara names | Source | Printed headers: 2026 PDF month headers and the 2027 Word file headers |
| Shaka year | Calculated | 1947 before Ugadi 2026, 1948 from it, 1949 from Ugadi 2027 |
| Paksha (Shukla/Krishna) | Calculated | From the tithi (section 3.3) |
| Lunar months (e.g. ಪುಷ್ಯ–ಮಾಘ) | Calculated | From new moons and the Sun's rashi (section 3.4) |
| Ayana | Calculated | From the Sun's sidereal longitude |
| Sun rashi, Moon rashi | Calculated | At sunrise |
| Yoga and its end time | Calculated | Sun plus Moon longitude |
| Karana, the next karana, and end times | Calculated | Moon minus Sun longitude |
| Sunrise and sunset, per district | Calculated | NOAA solar algorithm at the district headquarters |
| Rahu Kala, Gulika Kala, Yamaganda, Ardha Prahara, per district | Calculated | Eight equal parts of the district's sunrise-to-sunset day |
| Shubha Samaya | Not available | Rule unknown |
| Rashi bhavishya (12 daily predictions) | Not available | Editorial content, no source |

---

## 2. Taken from a source

### 2.1 2026 tithi and nakshatra: `data/pdf-panchanga-data.json`

- Extracted from `source/PDF Calendar PV.pdf` (12 pages, text layer only) by `scripts/extract-pdf-panchanga.py`. 365 days, each with name and end time. 7 tithis and 10 nakshatras are marked as running the full day.
- **What the build does to it:** it converts the end time to hours and minutes (a time past midnight keeps hours of 24 or more, e.g. 28.09 means 04:09 next day) and normalises nakshatra spelling variants to one spelling (section 2.4).
- **Check applied:** the name must be within one step of the calculated tithi or nakshatra at sunrise (section 4). All 365 tithi and 365 nakshatra names passed.
- **Not checked:** the end times. They are copied as printed.

### 2.2 2027 tithi and nakshatra: `data/Calander 2027.docx`, Table 1

- One row per day, read in order and checked against the weekday written in the row (all 365 matched).
- The tithi and nakshatra shown are the **first** ones listed in the row, which is the one running at sunrise. A second tithi on the same day is ignored.
- **Time markers are converted as follows.** "Sunrise" is the Bengaluru sunrise of that day.

  | Printed | Meaning used |
  |---|---|
  | ಬೆ (morning) h.mm | That morning. If it is more than 30 minutes before sunrise, the next morning |
  | ಮ (afternoon) | h + 12, except 10, 11 and 12 which stay as written |
  | ಸಾ (evening) | h + 12 |
  | ರಾ (night) | 6 to 11: h + 12; 12: 00:mm next day; 1 to 5: h:mm next day |
  | ಮಾ.ಬೆ (next morning) | Next day, h.mm |
  | ದಿ.ಪೂ (whole day) | Shown as "ದಿನಪೂರ್ತಿ" with no end time |

- **Tolerated typing slips:** Kannada digits, a missing dot ("ಸಾ.425" as 4.25), a missing closing bracket, a repeated name inside the bracket, "ರಾತ್ರಿ" for ರಾ, "ಬೆ.ಜಾ" for ಮಾ.ಬೆ.
- **Left unavailable rather than guessed:**

  | Date | Field | Why |
  |---|---|---|
  | 19-02-2027 | Nakshatra | ಶ್ರವಣ is out of sequence with the calculation |
  | 06-04-2027 | Tithi | The row has a time but no tithi name |
  | 15-06-2027 | Nakshatra end time | Marker "ಆ" is not valid. The name is kept |
  | 26-09-2027 | Nakshatra end time | No period marker. The name is kept |

- **Known errors that are not detected and are shown as printed:** all other entries in section 5 of `docs/panchanga-2027-source-audit.md` (for example nakshatras omitted on 18–19 Nov and 20–21 Dec, which look right to the one-step check but leave a wrong name on those days).

### 2.3 Samvatsara and Ugadi

- The samvatsara names are the printed ones (ವಿಶ್ವಾವಸು until Ugadi 2026, ಪರಾಭವ from Ugadi 2026, ಪ್ಲವಂಗ from Ugadi 2027).
- Ugadi dates come from the event Word files: the earliest "ಸಂವತ್ಸರ ಚಾಂದ್ರಮಾನ ಯುಗಾದಿ" entry in each year. For 2026 the files list two (19 and 20 March, the first labelled "ಸಿದ್ದಾಂತೇ", the second "ವಾಕ್ಯೇ"). The earlier one is used.

### 2.4 Spelling normalised

Nakshatra variants are mapped to one spelling: ಮಘ→ಮಖ, ಪುಬ್ಬ→ಪುಬ್ಬಾ, ಉತ್ತರ→ಉತ್ತರಾ, ಹಸ್ತ→ಹಸ್ತಾ, ಚಿತ್ತ→ಚಿತ್ತಾ, ಅನುರಾಧ→ಅನೂರಾಧ, ಜ್ಯೇಷ್ಟ→ಜ್ಯೇಷ್ಠ, ಧನಿಷ್ಟ/ಧನಿಷ್ಠಾ/ಧನಿಷ್ಟಾ→ಧನಿಷ್ಠ, ಅಶ್ಲೇಷ→ಆಶ್ಲೇಷ, ಮೃಗಶಿರಾ→ಮೃಗಶಿರ, ಪೂರ್ವಭಾದ್ರ→ಪೂರ್ವಾಭಾದ್ರ, ಉತ್ತಾರಾಷಾಢ→ಉತ್ತರಾಷಾಢ. Tithi: ಷಷ್ಟಿ→ಷಷ್ಠಿ. The list is in `scripts/build-panchanga-data.py` (`NAKSHATRA_ALIAS`, `TITHI_ALIAS`).

---

## 3. Calculated, and how

All calculation code is in `scripts/compute-panchanga.py` (Sun, Moon, yoga, karana) and `scripts/compute-sun-times.py` (sunrise, sunset, kalas). They use no network and no third-party package.

### 3.1 The Sun and the Moon

| Item | Method |
|---|---|
| Sun's longitude | NOAA solar-position series (geometric longitude, mean equinox of date) |
| Moon's longitude | Meeus, *Astronomical Algorithms*, chapter 47: the 59 periodic longitude terms plus the three additive terms. Nutation is not applied (it changes the Moon by about 0.005°, less than a minute of time) |
| Self-check | Meeus's worked example (1992 April 12, 0h TD) must give 133.162655° within 0.0005°. The build stops if it does not |
| Time | IST (UTC+5:30). Positions are taken at Terrestrial Time: UT + ΔT, with ΔT = 69.4 + 0.45 × (year − 2026) seconds |
| Sidereal longitude | Tropical longitude minus the Lahiri (Chitrapaksha) ayanamsa: 23.85306° + 0.0139697° per year from J2000 |

### 3.2 The five elements

Let the elongation be the Moon's longitude minus the Sun's, in degrees from 0 to 360.

| Element | Rule | End time |
|---|---|---|
| Tithi (used only for checking and paksha) | floor(elongation ÷ 12°) + 1, giving 1 to 30 | When the elongation reaches the next multiple of 12° |
| Karana | floor(elongation ÷ 6°) + 1, giving 1 to 60. Number 1 is ಕಿಂಸ್ತುಘ್ನ, numbers 2 to 57 repeat ಬವ, ಬಾಲವ, ಕೌಲವ, ತೈತಿಲ, ಗರಜ, ವಣಿಜ, ವಿಷ್ಟಿ, and 58 to 60 are ಶಕುನಿ, ಚತುಷ್ಪಾದ, ನಾಗವ | Next multiple of 6° |
| Nakshatra (used only for checking) | floor(sidereal Moon ÷ 13°20′) + 1, giving 1 to 27 | Next multiple of 13°20′ |
| Yoga | floor((sidereal Sun + sidereal Moon) ÷ 13°20′) + 1, giving 1 to 27 | Next multiple of 13°20′ |

- **Which one is shown.** The one running at the district's sunrise, with the moment it ends. For karana, the next karana and its end time are shown as well, because a karana lasts about six hours and a day has two or three.
- **How the end time is found.** The code steps forward in 30-minute steps until the element's index changes, then halves the interval 40 times. The result is accurate to a fraction of a second of the model, and about 1–2 minutes against the printed daily photos.
- **Boundary days.** When a boundary falls within minutes of a district's sunrise, two districts can show different yoga or karana on the same day. In the data this happens on 322 district-days out of about 22,600.

### 3.3 Paksha

- If the tithi name from the source is ಪೂರ್ಣಿಮಾ, Shukla. If it is ಅಮಾವಾಸ್ಯೆ, Krishna.
- Otherwise: Shukla if the calculated tithi at sunrise is 1 to 15, Krishna if 16 to 30.

### 3.4 Lunar months

- **New moons** are the moments the elongation passes 0°.
- A lunar month runs from one new moon to the next (the amanta system used in Karnataka).
- The month is named after the Sun's **sidereal rashi at the start of the month**: Meena gives ಚೈತ್ರ, Mesha ವೈಶಾಖ, Vrishabha ಜ್ಯೇಷ್ಠ, Mithuna ಆಷಾಢ, Karka ಶ್ರಾವಣ, Simha ಭಾದ್ರಪದ, Kanya ಆಶ್ವಯುಜ, Tula ಕಾರ್ತಿಕ, Vrishchika ಮಾರ್ಗಶಿರ, Dhanu ಪುಷ್ಯ, Makara ಮಾಘ, Kumbha ಫಾಲ್ಗುಣ.
- If the Sun is in the same rashi at the start and end of a lunation (no sankranti inside it), that month is **ಅಧಿಕ**, and the next month with the same name is **ನಿಜ**. This gives ಅಧಿಕ ಜ್ಯೇಷ್ಠ (17 May to 15 Jun 2026) and ನಿಜ ಜ್ಯೇಷ್ಠ.
- The tab shows, for each calendar month, the lunar months that overlap it, as the printed calendar does.

### 3.5 Ayana, sun rashi, moon rashi

| Item | Rule |
|---|---|
| Ayana | ಉತ್ತರಾಯಣ when the Sun's sidereal longitude is 270° to 360° or 0° to 90° (Makara to Mithuna), else ದಕ್ಷಿಣಾಯನ |
| Sun rashi | floor(sidereal Sun ÷ 30°), at sunrise |
| Moon rashi | floor(sidereal Moon ÷ 30°), at sunrise. The time the Moon enters the next rashi is not shown |

The day-level values (paksha, rashis, ayana, months) use Bengaluru's sunrise. Yoga, karana, sunrise, sunset and the kalas use each district's own.

### 3.6 Sunrise and sunset

- NOAA solar algorithm: the Sun's upper edge on the horizon, standard refraction (zenith 90.833°), IST.
- Computed at each district's headquarters (`DISTRICTS` in `scripts/compute-sun-times.py`).
- The seconds are dropped (not rounded), as the printed calendar does. For Bengaluru this matches the printed daily photos to the minute.
- **Coordinates.** Each district uses the headquarters town (Bengaluru Rural: Doddaballapura; Bengaluru South: Ramanagara; Dakshina Kannada: Mangaluru; Kodagu: Madikeri; Uttara Kannada: Karwar; Vijayanagara: Hosapete). The values (four decimals) were checked on 8 Oct 2026 against two independent lookups, the English Wikipedia article for the town and OpenStreetMap, and the mean is used. Where OpenStreetMap returned only a district-boundary centre (Chamarajanagar, Gadag, Haveri, Kolar, Koppal, Yadgir), the Wikipedia value alone is used. The earlier two-decimal values agreed with these to within 0.05°. The largest effect is Mangaluru (0.04° north of the new value), which moved sunrise and sunset by 8.5 seconds. Because the printed time drops the seconds, about 5–9% of the minute values in a district changed by one minute.

### 3.7 Rahu Kala, Gulika Kala, Yamaganda, Ardha Prahara

- Each district's day, from its own sunrise to its own sunset (unrounded), is split into **eight equal parts**.
- Each weekday uses one part, by this table (parts numbered from sunrise):

  | | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
  |---|---|---|---|---|---|---|---|
  | Rahu Kala | 2 | 7 | 5 | 6 | 4 | 3 | 8 |
  | Gulika Kala | 6 | 5 | 4 | 3 | 2 | 1 | 7 |
  | Yamaganda | 4 | 3 | 2 | 1 | 7 | 6 | 5 |
  | Ardha Prahara | 3 | 2 | 1 | 7 | 6 | 5 | 4 |

- Start and end are rounded to the nearest minute.
- **Difference from the printed calendar.** The printed calendar divides a fixed 06:00 to 18:00 day, so every place and date gets the same times. The values here differ from it by about 19 minutes on average and by up to about an hour. The printed table is kept in `data/sun-times.json` (`weekdayTimings`) for comparison. This was chosen on 8 Oct 2026; whether to show the printed values as well is open.

---

## 4. Checks run on the data

| Check | Result |
|---|---|
| Source tithi name within one step of the calculated tithi at sunrise (2026 and 2027, 730 days) | All pass except the 2027 exceptions listed in section 2.2 |
| Source nakshatra name within one step of the calculated one | Same |
| 2027 Word rows: weekday written in the row equals the real weekday | 365 of 365 |
| Calculated paksha against the 2027 Word headings (ಶುದ್ಧ/ಬಹುಳ) | Agrees on all days except 14–27 Dec 2027 and 19 Jun 2027, where the Word headings are wrong or a day off |
| Calculated lunar months against the 2027 Word headings | Agrees, except December 2027 (the Word heading repeats ಮಾರ್ಗಶಿರ ಶುದ್ಧ) |
| Calculated lunar months against the 2026 PDF month headers | Agrees on 10 of 12 pages. The October header repeats September's (ಶ್ರಾವಣ–ಭಾದ್ರಪದ, should be ಭಾದ್ರಪದ–ಆಶ್ವಯುಜ). The June header is garbled |
| Yoga and karana against 6 random 2026 daily photos (16 Jun, 19 Mar, 23 Jul, 1 Dec, 25 Jan, 7 Feb) | Yoga and karana names correct on all 6. Yoga end times within 3 minutes, karana within 2 |
| Sunrise and sunset against the printed daily photos | Matches to the minute on the days compared |

### Differences you should know about

- **The printed karana is sometimes the first and sometimes the second of the day.** In the 6 photos, 4 print the first and 2 print the second. Across the saved 2026 values the split is about half and half, with no rule found. The tab shows both.
- **Tithi and nakshatra end times in the sources differ from the calculation.** For 2027, the Word file's tithi end time minus the calculated one has a median of about −33 minutes, and only 14% are within 30 minutes (351 days). For nakshatra the median is about −2 minutes, with 19% within 30 minutes (347 days). On the 2026 photos, the printed times agree with the calculation to 1–2 minutes, while the PDF values often do not (1 Jan 2026: PDF 20:46 and 21:50, photo 22:23 and 22:49). The tab shows the source values, as decided. An editor with the printed 2026 and 2027 calendars can confirm which is right.

---

## 5. How to verify

```
python scripts/build-panchanga-data.py          # rebuilds the data, prints every day left unavailable and the month list
python scripts/compute-panchanga.py 2026-11-30  # tithi, nakshatra, yoga, karana for one date, at 06:25 sunrise
python scripts/compute-sun-times.py --check     # 199 self-checks on sunrise, sunset and kalas
node tests/app.test.js                          # the tab's behaviour, 99 checks
```

To check one day by hand: open `data/panchanga.json`, find `"DD-MM-YYYY"`, and compare with the printed calendar. For the district values, open `data/panchanga/<district>.json`; row *n* of a year is day number *n* + 1 (row 0 is 1 January), and the columns are listed at the top of the file.

## 6. Not available, and open questions

| Item | Status |
|---|---|
| Shubha Samaya | No rule found. Shown as "ಲಭ್ಯವಿಲ್ಲ" |
| Rashi bhavishya | No source. Shown as "ಲಭ್ಯವಿಲ್ಲ" |
| Time the Moon enters the next rashi | Not calculated yet |
| Kala basis (real sunrise-sunset or the printed fixed day) | Real chosen; whether to also show the printed values is open |
| Which almanac for tithi and nakshatra times | Source values shown; see the differences above |
| Errors in the 2027 Word file | Listed in `docs/panchanga-2027-source-audit.md`; not corrected in the file |
