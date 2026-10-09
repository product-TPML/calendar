# Panchanga view vs PDF Calendar PV — field comparison

Date: 2026-09-29 · Source PDF: `source/PDF Calendar PV.pdf` (12 pages, one per month, Prajavani 2026 wall calendar)

## Question

Can every data point the calendar app's Panchanga view needs be extracted from
`source/PDF Calendar PV.pdf`?

**Answer: No.** The PDF fully covers tithi, nakshatra, weekday, calendar years
(month-level), events, and 3 of the 5 kāla timings. Nine of the view's data
points are missing or only derivable with extra logic.

## Panchanga view data points (current source of truth)

From `app.js` (`normalizeOCR`, `panchangaHTML`). The app fetches
`ocr-zones/<date>/structured-ocr.json`, which is produced by `scripts/ocr_month.ps1`
from the daily sheet photos in `data/2026/<month>/<date>.jpg`:

| Field | Daily sheet zone |
|---|---|
| tithi name, end, nextDay | bottom_table_1 |
| paksha | bottom_table_2 |
| nakshatra name, end, nextDay | bottom_table_1 |
| yoga name, end | bottom_table_1 |
| karana name, end | bottom_table_1 |
| ayana | bottom_table_1 |
| solar rashi | bottom_table_2 (`ಸೂರ್ಯರಾಶಿ`) |
| chandra rashi | bottom_table_3 (`ಚಂದ್ರ ರಾಶಿಯಲ್ಲಿ ಪ್ರವೇಶ`) + date_right_1 |
| samvatsara, shaka year, months | date_left |
| sunrise, sunset | date_right_2 |
| timings: rahu, gulika, yamaganda, ardha prahara, shubha samaya | bottom_table_2 |
| jathaka (12 rashi predictions) | jathaka panel |

## What the PDF contains

Verified visually on pages 1 (January) and 7 (July); verified across all 12
pages via text-layer token counts.

Per month page (uniform layout):

- **Per date table** (split left = 1–24, right = 25–end):
  `ಇಂ.ತಾ. | ಸೌರ ತೇದಿ | ಮುಸ್ಲಿಂ ಚಾಂದ್ (Hijri) | ವಾರ | ತಿಥಿ + end time | ನಕ್ಷತ್ರ + end time | ಹಬ್ಬ ಜಾತ್ರೆ ಇತ್ಯಾದಿ`
- **Month header:**
  `ಶಾಲಿವಾಹನ ಶಕೆ 1947/1948, ವಿಕ್ರಮ ಶಕೆ 2082, ಹಿಜರಿ ಶಕೆ 1447/1448`,
  samvatsara name (ವಿಶ್ವಾವಸು / ಪರಾಭವ), ayana, ritu, ಮಾಸ (e.g. ಪುಷ್ಯ–ಮಾಘ)
- **Month grid:** per-weekday `ರಾಹು ಕಾಲ / ಗುಳಿಕೆ ಕಾಲ / ಯಮಗಂಡ ಕಾಲ` (3 ranges),
  plus full-moon/new-moon markers and festival badges
- **Extras:** rain nakshatras (`ಮಳೆ ನಕ್ಷತ್ರಗಳು`), ವಿಶೇಷಗಳು special-days list,
  adjacent-month mini grids

## Field-by-field comparison

Legend: ✅ present · ⚠️ partial/derivable · ❌ absent

| Panchanga field | In PDF? | Notes |
|---|---|---|
| tithi name + end | ✅ | e.g. `ತ್ರಯೋದಶಿ (ರಾ.8.46)` — 12h time + ಬೆ./ಮ./ಸಾ./ರಾ. prefix |
| nakshatra name + end | ✅ | e.g. `ರೋಹಿಣಿ (ರಾ.9.50)` |
| samvatsara | ✅ | month header (`ಶ್ರೀ ವಿಶ್ವಾವಸು ನಾಮ ಸಂವತ್ಸರ`) |
| shaka year | ✅ | `ಶಾಲಿವಾಹನ ಶಕೆ 1947` (+ Vikrama 2082, Hijri 1447) |
| months / masa | ✅ | month header (`ಪುಷ್ಯ–ಮಾಘ ಮಾಸ`) |
| rahu, gulika, yamaganda | ✅ | per weekday in month grid; matches daily sheet (Sunday 4.30–6.00 etc.) |
| paksha | ❌ | 0 occurrences in the whole PDF; tithi position would have to be inferred |
| yoga name + end | ❌ | only sporadic event mentions (`ಪುಷ್ಕರ ಯೋಗ`, `ಅಮೃತ ಸಿದ್ಧಿ ಯೋಗ`) |
| karana name + end | ❌ | 0 occurrences |
| ayana | ⚠️ | month-level only; transition months print one/both labels (Jan: `ದಕ್ಷಿಣಾಯಣ ಉತ್ತರಾಯಣ`, Jul: `ದಕ್ಷಿಣಾಯನ` only) — no per-date value |
| solar rashi | ❌ | only via Sankranti event dates (`ಮಕರ ಸಂಕ್ರಾಂತಿ`) |
| chandra rashi | ❌ | 0 occurrences |
| sunrise / sunset | ❌ | neither `ಸೂರ್ಯೋದಯ` nor `ಸೂರ್ಯಾಸ್ತ` anywhere |
| ardha prahara | ❌ | not printed |
| shubha samaya | ❌ | not printed |
| jathaka (12 rashi predictions) | ❌ | zero rashi names (ಮೇಷ etc.) in the whole file |

### Summary

- **Extractable:** tithi, nakshatra, weekday, samvatsara, shaka year, masa,
  rahu/gulika/yamaganda, events.
- **Missing:** paksha, yoga, karana, chandra rashi, per-date solar rashi,
  per-date ayana, sunrise/sunset, ardha prahara, shubha samaya, jathaka.
- **PDF-only extras** (if ever wanted): ಸೌರ (Sauramana) date, Hijri date,
  Vikrama shaka, rain nakshatras, special-days list.

## Caveats

1. **End-time values disagree with the daily sheets.** Sampled dates show
   10–100 min differences, e.g.:

   | Date | Tithi (daily sheet) | Tithi (PDF) | Nakshatra (daily sheet) | Nakshatra (PDF) |
   |---|---|---|---|---|
   | 01-01-2026 | 22.23 | ರಾ.8.46 (≈20:46) | 22.49 | ರಾ.9.50 (≈21:50) |
   | 02-01-2026 | 18.54 | ಸಾ.6.28 (≈18:28) | 20.04 | ರಾ.8.14 (≈20:14) |
   | 03-01-2026 | 15.33 | ಸಾ.4.24 (≈16:24) | 17.28 | ಸಾ.6.36 (≈18:36) |

   Switching the Panchanga view to the PDF would change displayed values.

2. **Time format differs.** The PDF prints 12-hour times with ಬೆ./ಮ./ಸಾ./ರಾ.
   prefixes; the app currently expects 24-hour-ish values where `>= 24` means
   next day (`panchangaEnd`, `nextDay`). A converter would need to map
   prefixes and infer next-day for post-midnight ends.

3. **Extraction mechanics (updated after implementation).** The PDF text
   layer uses legacy non-Unicode Nudi fonts (`Nudi01e`, `Nudi15e`, ...) — the
   Kannada words copy as mojibake (`ªÀÄPÀgÀ` = ಮಕರ), while digits, dates and
   times copy exactly. OCR is NOT the way: Tesseract (kan) fails to read these
   glyphs even on clean high-resolution crops. The working approach (now
   implemented) is text-layer extraction for structure/times plus a baked
   mojibake→Kannada token map for names (built by aligning PDF tokens against
   the existing OCR data; every token in the 2026 edition is covered).

## Evidence artifacts

- Rendered pages: `.playwright-mcp/pdf-pages/` (250 dpi PNGs + zoomed crops)
- Text-layer dump: `.playwright-mcp/pdf-text-pymupdf.txt`
- Token counts / contexts: `.playwright-mcp/pdf-token-analysis.txt`,
  `.playwright-mcp/pdf-token-counts2.txt`, `.playwright-mcp/pdf-token-counts3.txt`
- Daily-sheet cross-checks: `ocr-zones/01-01-2026/` … `04-01-2026/`

## Follow-up: implementation (data extraction + merge)

Implemented and run on 2026-09-29.

### Scripts

- `scripts/extract-pdf-panchanga.py` — extracts the PDF via its text layer only
  (no OCR): tithi/nakshatra name + end time (+ `fullDay` marker cells),
  samvatsara/shaka year per month, weekday kāla timings. Output:
  `data/pdf-panchanga-data.json` (365/365 dates, 0 unparsed times,
  0 unmapped tokens) + `data/pdf-extraction-report.txt`.
- `scripts/merge-panchanga-pdf.js` — merges PDF values into the per-date OCR
  records. **PDF wins** for `panchanga.tithi`, `panchanga.nakshatra` and
  `timings.rahuKala/gulikaKala/yamaganda`; everything else (paksha, yoga,
  karana, ayana, ritu, solarRashi, chandraEntryRashi, sunrise/sunset,
  arthaPrahara, shubhaSamaya, jathaka, events) keeps OCR values. OCR is
  snapshotted to `structured-ocr.ocr-source.json` before the first overwrite
  and always re-read from there, so the merge is idempotent. Dry-run by
  default; `node scripts/merge-panchanga-pdf.js --apply` writes merged
  `ocr-zones/<date>/structured-ocr.json` (365 records, including 15 PDF-only
  dates that had no OCR photos: 30-05 and 18–31-12). Per-record provenance in
  `mergeSources`; report at `data/panchanga-merge-report.json`.

### Measured source differences (why displayed values change)

Only ~18% of dates agree within 30 minutes; the median absolute difference is
≈ 1.5–2 h (tithi |Δ| median ≈ 113 min, nakshatra ≈ 101 min; ≥ 4 h on ~21% of
dates). The monthly PDF and the daily sheets genuinely print different end
times (verified against the printed pages). Per the stated policy, the merged
data uses the PDF values; to prefer OCR for these instead, the merge policy in
`scripts/merge-panchanga-pdf.js` is the one place to change (or restore from
`structured-ocr.ocr-source.json`).

### Re-running

```powershell
python scripts/extract-pdf-panchanga.py      # regenerate PDF data
node scripts/merge-panchanga-pdf.js          # dry-run summary
node scripts/merge-panchanga-pdf.js --apply  # write merged records
```

After regenerating OCR with `scripts/ocr_month.ps1`, delete the affected dates'
`structured-ocr.ocr-source.json` to re-snapshot, then merge again.
