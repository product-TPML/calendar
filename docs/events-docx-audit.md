# Events audit: Word calendars (2026 and 2027)

The day-level events the app shows now come only from two Word files. The PDF-based events are gone.

| Year | Source file | Days | Events |
|---|---|---|---|
| 2026 | `data/Calander Matter s (1).docx` | 365 | 1,314 |
| 2027 | `data/Calander matter.docx` | 365 | 1,436 |
| Total | | 730 | 2,750 |

`scripts/extract-docx-events.py` turns them into `data/calendar-events.json`. The format is the same as before (`{ source, events: { "DD-MM-YYYY": [ ... ] } }`), so the app reads it with no format change. This audit used only the two event files and the 2027 Panchanga file (`Calander 2027.docx`). It does not use OCR or the PDF.

---

## 1. Structure

- [x] Each file has 12 month headings (`ಜನವರಿ 2026` ... `ಡಿಸಂಬರ್ 2027`).
- [x] Every month has exactly one non-empty line per calendar day (31, 28, 31, 30 ...). The script stops with an error if a month does not.
- [x] A line is a comma-separated list of events.
- [x] Some months print the day number before the events (2027 Jan to Mar, 2026 May). The script strips it, and checks it equals the day.
- [x] No day is empty. Events per day: 1 to 10 (most days have 3 to 5).
- [x] All 730 date keys are valid calendar dates. No blank events.

## 2. How lines became separate events

| Rule | Effect |
|---|---|
| Split at every comma | Base rule |
| Split at ". " before a Kannada letter | The docx uses a full stop as a comma in places ("ಕೊಳ್ಳೆಗಾಲ. ಮುಳಬಾಗಿಲುಗಳಲ್ಲಿ ರಥ"). Initials such as "ಬೆಂ." and "ಆರ್." are not split |
| Split after `)` when more text follows | "ಸಂಕಷ್ಟ ಚತುರ್ಥಿ(ಚಂ.ಉ.ರಾ 9.18) ಕಾವೂರು ಮಹಾಲಿಂಗೇಶ್ವರ ರಥ" becomes two events |
| Never split inside brackets | "ಸೂರ್ಯಗ್ರಹಣ (ಭಾರತದಲ್ಲಿ ಅಗೋಚರ, ಆಚರಣೆ ಇಲ್ಲ)" stays one event |
| Keep place lists together | "ಉಡುಪಿ, ಮಂತ್ರಾಲಯಗಳಲ್ಲಿ ಉತ್ಸವ" is one event. Bare place names directly before "&lt;place&gt; ರಥ/ಜಾತ್ರೆ/ಉತ್ಸವ" are folded in too ("ಶಿಡ್ಲಘಟ್ಟ, ಕಟಪಾಡಿ ಜಾತ್ರೆ"). 132 events are place lists |
| 11 reviewed splits | Lines where the docx has no comma between two events, listed in `SPLITS` in the script |
| 4 reviewed "not a place" exceptions and 2 reviewed joins | `NOT_PLACES` and `JOINS` in the script |
| Dropped | 1 repeated event ("ಪಾಮ್‌ ಸಂಡೇ", 29-03-2026), 1 stray character ("ಟ", 24-05-2027), stray trailing `\`, `.` and `:` |

**Known limit.** About 390 events are a single short word with no event word in it (for example "ಅನಧ್ಯಯನ", "ಮಾರಿಶಿಡಿ"). The script cannot tell these from a place name, so they stay as separate events. Where a missing comma hides two events inside a longer phrase, only the 11 splits above were found. Others may remain.

## 3. Date alignment (does each line belong to its date?)

Checked with the docx files only.

- [x] **Fixed-date holidays** fall on the right day wherever they appear: New Year (Jan 1), Republic Day (Jan 26), Independence Day (Aug 15), Gandhi Jayanti (Oct 2), Labour Day (May 1), Ambedkar Jayanti (Apr 14), Christmas and Christmas Eve (Dec 25, 24), Teachers' Day (Sep 5), Children's Day (Nov 14), April Fools' Day (Apr 1), Environment Day (Jun 5), World AIDS Day (Dec 1), Press Freedom Day (May 3), Valentine's Day (Feb 14, 2026 only) and Human Rights Day (Dec 10, 2026 only).
- [x] **2027 tithi cross-check.** About 150 events name a tithi (ಏಕಾದಶಿ, ಪ್ರದೋಷ, ಸಂಕಷ್ಟ ಚತುರ್ಥಿ, ಅಮಾವಾಸ್ಯೆ, ಹುಣ್ಣಿಮೆ, ಮಾಸ ಶಿವರಾತ್ರಿ, ಕಾಲಾಷ್ಟಮಿ and so on). All but 3 fall on a day whose tithi in `Calander 2027.docx` matches. This also shows the 2027 event lines and the 2027 Panchanga rows are attached to the same dates.
- [ ] **2026 tithi cross-check not done.** The only 2026 tithi source is the OCR records, which this audit does not use.
- [x] **Weekday-named events** ("ಸೋಮ ಪ್ರದೋಷ", "ಶನಿ ಪ್ರದೋಷ", "ಗುರು ಪೂರ್ಣಿಮಾ", "ಮಂಗಳ ಗೌರಿ ವ್ರತ", "ಬುಧ ವಕ್ರಾರಂಭ") are event names, not weekday labels, and are kept.

## 4. Content problems in the source files

These are in the Word files themselves. They are not changed in `calendar-events.json`, so an editor can fix them in the docx and re-run the script.

| Date | Event | Problem |
|---|---|---|
| 25-06-2026 | ನಾಲ್ಕನೇ ಶನಿವಾರ | A Thursday. The 4th Saturday of June 2026 is Jun 27 |
| 26-12-2027 | ನಾಲ್ಕನೆಯ ಶನಿವಾರ | A Sunday. The 4th Saturday of December 2027 is Dec 25 |
| 28-08-2026, 11-09-2026 | ಶ್ರಾವಣ ಶನಿವಾರ, ಕಡೆ ಶ್ರಾವಣ ಶನಿವಾರ | Both are Fridays |
| 22-07-2027 | ಅಷಾಢ ಆಡಿ ಶುಕ್ರವಾರ | A Thursday. The same event is on Fri 23-07-2027 (spelled ಆಷಾಢ) |
| 23-05-2027 | ಪ್ರದೋಷ | The tithi is ತದಿಗೆ, so it does not match. This month's Pradosha is already on 17-05-2027 ("ಸೋಮ ಪ್ರದೋಷ"). Probably misplaced |
| 10-11-2027 | ಪ್ರದೋಷ | The tithi table puts Trayodashi at the 11th (starts 8.04 am) |
| 19-01-2027 | ವೈಷ್ಣವ ಶ್ರೀ ವೈಷ್ಣವ ಏಕಾದಶಿ | One day after the Ekadashi tithi. This is expected for the Vaishnava observance, so not an error |
| 01-03-2026, 31-07-2027 | ಪ್ರದೇಷ | Probably "ಪ್ರದೋಷ" |
| 30-12-2027 | ಮರ್ಗಶಿರ ಲಕ್ಷ್ಮಿ ವ್ರತ | Probably "ಮಾರ್ಗಶಿರ" |
| 17-11-2027 | ಸಂಕಷ್ಟ ಚತುರ್ಥ (…) | Probably "ಚತುರ್ಥಿ" |
| 25-01-2027 | ಸಂಕಷ್ಟ ಚತುರ್ಥಿ(ಚಂ.ಉ.ರಾ ೯.೧೮) | Kannada digits; every other row uses 0-9 |
| 24-05-2027 | (end of line) | A lone "ಟ", probably the start of "ಟ್ರಿನಿಟಿ ಸಂಡೇ", which is on the 23rd. Dropped |

**Not in the files:** International Women's Day (Mar 8) in either year, and Valentine's Day (Feb 14) and Human Rights Day (Dec 10) in 2027. They may simply not be in the printed calendar.

## 5. Spelling and formatting consistency

Only differences inside the docx files are shown here. Nothing was corrected.

- **104 events** appear in more than one form that differ only in spacing or the invisible joiner (ZWNJ). Examples: "ಮಹಾ ಪ್ರದೋಷ" / "ಮಹಾಪ್ರದೋಷ", "ಮಾಸ ಶಿವರಾತ್ರಿ" / "ಮಾಸಶಿವರಾತ್ರಿ", "ರಥ ಸಪ್ತಮಿ" / "ರಥಸಪ್ತಮಿ", "ಸಂಕಷ್ಟ ಚತುರ್ಥಿ (…)" / "ಸಂಕಷ್ಟ ಚತುರ್ಥಿ(…)".
- **Spelling variants of one event:** ಕಾರ್ಣೀಕ / ಕಾರ್ಣಿಕ / ಕಾರಣಿಕ; ವಿನಾಯಕ ಚತುರ್ಥಿ / ವಿನಾಯಕಿ ಚತುರ್ಥಿ; ಎರಡನೆಯ / ಎರಡನೇ / ಎರಡನೆ ಶನಿವಾರ; ಮುಕ್ತಾಬಾಯಿ / ಮುಕ್ತಬಾಯಿ ಪುಣ್ಯದಿನ; ಹೆಮ್ಮರಗಾಲ ಕೃಷ್ಣೋತ್ಸವ / ಕೃಷ್ಣೊತ್ಸವ.
- **161 events contain a ZWNJ** after a half consonant ("ಕಾರ್‌"). It is kept as typed.
- **Distinct events:** 1,976 out of 2,750. The rest are repeats across days and years (for example "ಸರ್ವತ್ರ ಏಕಾದಶಿ" appears 43 times).

## 6. What changed in the repo

- [x] `data/calendar-events.json`: new, 730 days, 2,750 events
- [x] `scripts/extract-docx-events.py`: new
- [x] `app.js`: the event loader now reads `data/calendar-events.json`. The Settings toggle that highlighted PV calendar events was removed afterwards (`index.html`, `app.js`, `styles.css`)
- [x] `tests/app.test.js`: updated to the new file name (89 passed, 0 failed)
- [x] `README.md`, `.gitignore`: point to the new file
- [x] Removed `data/pdf-events.json` and `scripts/extract-pdf-events.py`
- [ ] Not touched: the OCR pipeline and the PDF scripts for the Panchanga tab (`extract-pdf-panchanga.py`, `merge-panchanga-pdf.js`). Panchanga data for 2026 still comes from OCR. 2027 Panchanga is covered in `docs/panchanga-2027-source-audit.md`
- [ ] The two Word files stay in `data/`, which git ignores. The script needs them to regenerate the JSON. Say if they should move to a tracked folder.

## 7. How to regenerate

```
python scripts/extract-docx-events.py --report
node tests/app.test.js
```
