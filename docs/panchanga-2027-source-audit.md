# 2027 Panchanga: source audit of `data/Calander 2027.docx`

Question: can the Word file replace the OCR/image pipeline for the Panchanga tab in 2027?
Answer: **partly.** It covers tithi, nakshatra, paksha, month, samvatsara, solar rashi and ayana. It does not state yoga, karana, sunrise/sunset, the kalas, chandra rashi or rashi bhavishya. Most of these are now computed (see below); Shubha Samaya and rashi bhavishya are not.

The file has two tables, each with 365 day rows (Jan 1 to Dec 31, 2027):

- **Table 1** (lines 1-574): weekday, tithi with end time, nakshatra with end time, under month/paksha headings.
- **Table 2** (lines 576-1118): weekday, solar rashi and solar day count (the "Hindu sankramana" column), Hijri month and day.

Other 2027 files: `Calander matter.docx` has events only. `Calander Matter s (1).docx` is 2026 events only. No 2027 images or `ocr-zones` exist.

Legend: ✅ explicitly present · 🟡 derivable · ❌ absent · ⚠️ present but has errors

---

## 1. What the Panchanga tab needs, and what the file has

"PV" = was shown in the old "ಪಿವಿ ಕ್ಯಾಲೆಂಡರ್ ಮಾತ್ರ" mode. "Full" = was shown only when that toggle was off. The toggle has since been removed and the tab always shows every field.

| # | Field | Tab mode | Status | Source / how |
|---|---|---|---|---|
| 1 | Tithi name | PV + Full | ✅ | Table 1, 365 days. Apr 6 name missing (see errors) |
| 2 | Tithi end time | PV + Full | ⚠️ | Table 1. Needs period-marker conversion; see errors |
| 3 | Nakshatra name | PV + Full | ✅ | Table 1, 365 days. Two omitted nakshatras (Nov 18, Dec 20) |
| 4 | Nakshatra end time | PV + Full | ⚠️ | Table 1. Same issues as #2 |
| 5 | Samvatsara | PV + Full | ✅ | Headings: Parabhava to Apr 6, Plavanga from Apr 7 (Ugadi) |
| 6 | Lunar month (ಮಾಸ) | PV + Full | ✅ | Headings. Order is correct all year |
| 7 | Shaka year | PV + Full | 🟡 | 1948 to Apr 6, 1949 from Apr 7. Not written in the file |
| 8 | Rahu Kala | PV + Full | 🟡 | Done, district-wise: the district's real sunrise-to-sunset day divided into eight parts, `data/kalas.json` (`scripts/compute-sun-times.py --kalas`). The printed calendar's fixed 06:00-18:00 table stays in `data/sun-times.json` (`weekdayTimings`) for comparison. See section 6, item 5 |
| 9 | Gulika Kala | PV + Full | 🟡 | Same |
| 10 | Yamaganda | PV + Full | 🟡 | Same |
| 11 | Paksha | Full | ✅ | From headings. Dec 14 heading is wrong |
| 12 | Yoga (name + end time) | Full | 🟡 | Done: computed per district for 2026 and 2027, `data/yoga-karana.json` (`scripts/compute-panchanga.py --yoga-karana`). Checked on 6 random 2026 photos: names correct, end times within 3 min |
| 13 | Karana (name + end time) | Full | 🟡 | Same file. Both the karana at sunrise and the next one are stored, and the tab should show both ("X till hh:mm, then Y till hh:mm"). The printed calendar shows only one of the two, with no rule that matches it (about 50/50) |
| 14 | Ayana | Full | 🟡 | Dakshinayana Jan 1-14; Uttarayana from Makara sankramana (Jan 15); Dakshinayana from Karka (ಕಟಕ) sankramana (Jul 17) |
| 15 | Solar rashi | Full | ✅ | Table 2: rashi named on the sankramana day, running until the next one |
| 16 | Chandra rashi | Full | 🟡 | Derivable from nakshatra and its end time, with the moon's rashi at the nakshatra boundary. Not written in the file |
| 17 | Sunrise / sunset | Full | 🟡 | Done: computed per district for 2026 and 2027, `data/sun-times.json` (`scripts/compute-sun-times.py`) |
| 18 | Artha Prahara | Full | 🟡 | Same file as Rahu (district-wise). The printed calendar uses a fixed weekday table (Mon 09:00-10:30, Tue 07:30-09:00, Wed 06:00-07:30, Thu 15:00-16:30, Fri 13:30-15:00, Sat 12:00-13:30, Sun 10:30-12:00) |
| 19 | Shubha Samaya | Full | ❌ | Source rule unknown; the 2026 values are OCR from the image |
| 20 | Rashi bhavishya (12 predictions) | Full | ❌ | Editorial content; cannot be computed |
| - | Hijri date | not shown | ✅ | Table 2. Present, but the tab does not display it |

Totals: 5 of 8 PV-mode fields present (the 3 kalas are missing). 8 of 20 fields present or derivable in Full mode.

---

## 2. Explicitly present (parse directly)

- [x] Tithi names, 365 days (Apr 6 missing)
- [x] Nakshatra names, 365 days
- [x] Tithi and nakshatra end times, as text with period markers (ಬೆ, ಮ, ಸಾ, ರಾ, ಮಾ.ಬೆ, ದಿ.ಪೂ)
- [x] Month and paksha, as headings above each block of days
- [x] Samvatsara, in headings
- [x] Solar rashi and solar day count, all 12 sankramanas in order:
  Makara Jan 15, Kumbha Feb 14, Meena Mar 14, Mesha Apr 14, Vrishabha May 15, Mithuna Jun 15, Karka (ಕಟಕ) Jul 17, Simha Aug 17, Kanya Sep 17, Tula Oct 18, Vrischika Nov 17, Dhanu Dec 16
- [x] Hijri month and day (not used by the tab)
- [x] Weekday on every row. All 365 match real 2027 dates in both tables, except May 10 in Table 2
- [x] 19 days with two tithis or two nakshatras, written with "+"
- [x] 24 days using the full-day marker ದಿ.ಪೂ (tithi or nakshatra covers the whole day)

## 3. Derivable (not written, but can be computed)

- [ ] Shaka year: 1948 until Apr 6, 1949 from Apr 7
- [ ] Ayana: Dakshinayana for Jan 1-14, Uttarayana from Makara sankramana (Jan 15), Dakshinayana from Karka sankramana (Jul 17)
- [ ] Chandra rashi: from nakshatra and end time, or an ephemeris
- [x] Sunrise and sunset: computed per district, `data/sun-times.json`
- [x] Rahu Kala, Gulika Kala, Yamaganda, Artha Prahara: computed district-wise from real sunrise and sunset (`data/kalas.json`). The fixed-day weekday table as printed is kept in `weekdayTimings` of `data/sun-times.json`
- [ ] 24-hour times and next-day flags for the tab (`endsAt`, `nextDay`): from the markers, using sunrise to resolve "ಬೆ" and "ದಿ.ಪೂ"

## 4. Absent (not in the file, not derivable from it)

- [ ] Shubha Samaya
- [ ] Rashi bhavishya (12 daily predictions)

---

## 5. Errors found

### 5a. Table 1: tithi and nakshatra

| Date | Line | Problem | Probable fix (confirm against print) |
|---|---|---|---|
| Feb 19 | 94 | Nakshatra ಶ್ರವಣ is out of sequence (Punarvasu, ?, Ashlesha) | ಪುಷ್ಯ |
| Feb 20 | 96 | `ಚತುರ್ದಶಿ(ಸಾ.7.36)` makes chaturdashi last 34 hours and purnima 10 | ಬೆ.7.36 |
| Apr 6 | 180 | Row has `(ಮಾ.ಬೆ.5.12)` with no tithi name | ಅಮಾವಾಸ್ಯೆ |
| Jun 15 | 283 | `ಸ್ವಾತಿ(ಆ.7.55)`: "ಆ" is not a valid marker | ಸಾ or ರಾ |
| Jul 20 | 335 | `ಶ್ರವಣ (ಸಾ.425)` has no dot | ಸಾ.4.25 |
| Jul 27 | 342 | `ಭರಣಿ(ರಾ.2.೧3)` mixes Kannada and Latin digits | ರಾ.2.13 |
| Aug 29 | 392 | `ದ್ವಾದಶಿ (ಬೆ.6.24 )ತ್ರಯೋದಶಿ (ರಾ.4.25)` has no "+" separator | add "+" |
| Aug 31 | 395 | `ಮಖ(ರಾ.11.41` has no closing bracket | close bracket |
| Sep 13 | 411 | `ಶ್ರವಣ (ಶ್ರವಣ ಬೆ.6.45)` repeats the name | ಬೆ.6.45 |
| Sep 19 | 419 | `ಚೌತಿ(ರಾತ್ರಿ.4.58)` non-standard marker | ರಾ.4.58 |
| Sep 26 | 426 | `ಪುಷ್ಯ(11.06)` has no period marker | ಬೆ or ರಾ |
| Oct 6 | 448 | `ಸಪ್ತಮಿ(ಬೆ.ಜಾ 5.18)` non-standard marker | ಮಾ.ಬೆ.5.18 |
| Nov 9 | 495 | `ಏಕಾದಶಿ(ದಿಪೂ)` missing dots | ದಿ.ಪೂ |
| Nov 18-19 | 508-509 | ಆರಿದ್ರಾ then ಪುಷ್ಯ: ಪುನರ್ವಸು is omitted | add ಪುನರ್ವಸು and its end time |
| Dec 20-21 | 557-559 | ಪುಬ್ಬಾ then ಹಸ್ತಾ: ಉತ್ತರಾ is omitted | add ಉತ್ತರಾ and its end time |
| Jul 25-26 | 340-341 | Two consecutive full-day tithis (ಸಪ್ತಮಿ, ಅಷ್ಟಮಿ); the next end time implies ~71 h for ನವಮಿ | needs check against print |

Time markers that look wrong (a "ರಾ" (night) marker at 6-7 o'clock; "ಸಾ" (evening) is more likely): confirm each.

| Date | Line | Entry |
|---|---|---|
| May 11 | 232 | `ಪುನರ್ವಸು(ರಾ.7.21)` |
| May 15 | 237 | `ದಶಮಿ(ರಾ.7.36)` |
| Jun 7 | 274 | `ತದಿಗೆ(ರಾ.7.11)` |
| Oct 29 | 475 | `ಅಮಾವಾಸ್ಯೆ(ರಾ.6.44)` |
| Dec 5 | 539 | `ಸಪ್ತಮಿ(ರಾ.6.06)` |

### 5b. Headings

- [ ] **Dec 14-27:** heading says "ಮಾರ್ಗಶಿರ ಶುದ್ಧ" but the tithis are Krishna paksha after the Dec 13 purnima. Should be ಬಹುಳ. The same heading is repeated in Table 2 (line 1080).
- [ ] **Aug 1:** heading `ಶ್ರೀ ಪ್ಲವಂಗ ನಾಮ ಆಷಾಢ ಬಹುಳ` is missing "ಸಂವತ್ಸರ".
- [ ] **Aug 3:** heading `ಶ್ರೀ ಪ್ಲವಂಗ ನಾಮ ಶ್ರಾವಣ ಶುದ್ಧ` is missing "ಸಂವತ್ಸರ".
- [ ] **Spelling varies:** "ಸಂವತ್ಸರದ", "ನಾಮ" sometimes missing, "ಶುದ್ದ" for "ಶುದ್ಧ", "ಜ್ಯೇಷ್ಟ"/"ಜ್ಯೇಷ್ಠ".
- [ ] **Repeated heading:** Dec 2027 has the same "ಮಾರ್ಗಶಿರ ಶುದ್ಧ" heading twice (lines 533 and 549); the second one is the one that should read ಬಹುಳ.

### 5c. Table 2: solar and Hijri

- [ ] **May 10** (line 766): weekday says ಭಾನು; should be ಸೋಮ.
- [ ] **May 8** (line 764): Hijri day is 31. Hijri months have at most 30 days.
- [ ] **Jan 1** (line 579): labelled "ಧನು ಸಂಕ್ರಮಣ" but the solar day is 16. It is a mid-month label, not a sankramana.
- [ ] **Oct 1** (line 975): labelled "ಕನ್ಯಾ ಸಂಕ್ರಮಣ" but the solar day is 15. Same problem.
- [ ] **May 15** (line 771) and **Jul 17** (line 862): no "ಸಂಕ್ರಮಣ" word. They are only identifiable because the counter resets to 01.
- [ ] **Mar 11** (line 687): Hijri day typed as "o2" (letter o).
- [ ] **Apr 1** (line 712): stray word "ದಶಮಿ" in the row.

### 5d. Format and meaning problems for a parser

- [ ] **Most rows have no day numbers.** Only Jan and Mar number the days in Table 1; Feb and Apr-Dec do not (Table 2 numbers Jan and Mar only too). A parser must count rows in order.
- [ ] **Nakshatra on a continuation line** on the days with two tithis (about 19 days). Rows must be joined.
- [ ] **The "ಬೆ" marker can mean the next morning.** Jan 6 `ಮೂಲ(ಬೆ.6.09)` and Jan 29 `ಸ್ವಾತಿ(ಬೆ.5.55)` end at dawn on the following day, not the same morning. Taken literally they give 2.5 h and 6 min nakshatras.
- [ ] **"ಮಾ.ಬೆ" is used inconsistently.** Jun 7 uses `ಆರಿದ್ರಾ(ಮಾ.ಬೆ.5.27)` for 5:27 the same morning.
- [ ] **"ದಿ.ಪೂ" has two meanings.** It usually means "carries into the next day", but on days like Jul 25-26 it appears on two consecutive days.
- [ ] **Spelling variants** of nakshatra names: ಉತ್ತರ/ಉತ್ತರಾ, ಹಸ್ತ/ಹಸ್ತಾ, ಆರ್ದಾ/ಆರಿದ್ರಾ, ಅನೂರಾಧ/ಅನುರಾಧ, ಜ್ಯೇಷ್ಟ/ಜ್ಯೇಷ್ಠ, ಧನಿಷ್ಠ/ಧನಿಷ್ಟ/ಧನಿಷ್ಟಾ, ಉತ್ತಾರಾಷಾಢ (Mar 4). The tab's current output uses whichever the data holds, so these need normalising.

### 5e. What checked out

- [x] 365 rows in Table 1 and 365 in Table 2, with the right number of days per month.
- [x] Table 1 weekdays match real 2027 dates on every row.
- [x] Table 2 weekdays match, except May 10.
- [x] Tithi order is correct all year, except where the errors above break it.
- [x] Nakshatra order is correct all year, except Feb 19, Nov 18-19, Dec 20-21.
- [x] The 12 sankramanas fall in zodiac order, about 30 days apart.
- [x] Paksha headings match the tithis, except Dec 14.

---

## 6. Decisions needed

1. **Yoga and karana: decided.** Computed from astronomy per district (`data/yoga-karana.json`), and the tab shows both karanas of the day. The Word files and the printed calendar do not state either. Still to check: the computed tithi/nakshatra times differ from the docx by a median of about 30 minutes (the daily photos agree with the computation), so which almanac the tab should follow is open.
2. **Shubha Samaya and rashi bhavishya:** source them separately, or drop them for 2027? (Artha Prahara is a fixed weekday table and needs no source.)
3. **Corrections:** who verifies the errors in section 5 against the printed 2027 calendar before parsing?
4. **Data path: done.** The tab no longer reads OCR. `scripts/build-panchanga-data.py` builds `data/panchanga.json` and `data/panchanga/<district>.json` from this file (2027), the PV PDF data (2026) and the computed values. Fields with no source (Shubha Samaya, rashi bhavishya) or a source error show "ಲಭ್ಯವಿಲ್ಲ" in the tab.
5. **Basis for Rahu, Gulika, Yamaganda and Artha Prahara: decided, district-wise.** The data now divides each district's real sunrise-to-sunset day into eight parts (`data/kalas.json`), so the values differ from the printed calendar, which uses a fixed 06:00-18:00 day for every place and date. The printed 2026 values in the photos all follow the fixed table. Open: whether the tab should show the district-wise values only, or also the printed fixed ones.
