# Editorial CSV

`calendar-editorial.csv` is a flat, one-row-per-date export of every
`ocr-zones/<date>/structured-ocr.json` file, produced by
`node scripts/export-editorial.js` (run from the repo root).

## Purpose

This file is **photo-facing editorial review**: each row is one calendar
date, and the `source_image` column points at the scanned photo the row was
OCR'd from. The **source image is authoritative** — when reviewing or
editing, compare cell values against the photo in
`data/2026/<month>/<date>.jpg` and fix OCR mistakes in the **content
fields** (events, panchanga, jathaka, timings, quote, calendar). The
`source_image` and `date` columns are identifiers, not content.

## Editing workflow

1. Import `editorial/calendar-editorial.csv` into Google Sheets
   (File → Import → Upload).
2. There is **one row per date** — do not merge, split, or add rows.
3. **Do not rename columns** — the reverse converter keys off the exact
   column names in row 1.
4. **Blank cells are allowed.** Leave a cell empty where the value is
   unknown or not visible in the photo; do not fill it with placeholders.
5. All content cells are free text — commas, quotes, and newlines inside
   cells are fine.

## Jathaka columns

The jathaka section is 12 fixed columns named after the canonical Kannada
rashi names: **ಮೇಷ, ವೃಷಭ, ಮಿಥುನ, ಕರ್ಕಾಟಕ, ಸಿಂಹ, ಕನ್ಯಾ, ತುಲಾ, ವೃಶ್ಚಿಕ,
ಧನಸ್ಸು, ಮಕರ, ಕುಂಭ, ಮೀನ**. Each cell holds only that day's prediction
for the rashi. These names are verified identical in every source record,
so the column set never varies; do not rename or reorder them.

Note: the plain `rashi` column (near `sunset`) is the calendar's rashi
span (e.g. ಧನು/ಮಕರ) — separate from the 12 jathaka rashi columns.

## Panchanga `*_end_time` semantics

Each of `tithi_end_time`, `nakshatra_end_time`, `yoga_end_time`,
`karana_end_time` holds one of:

- **Raw endsAt text** as printed on the page, e.g. `26.57` or `09.15`.
  Values `>= 24` (e.g. `26.57`) mean the time is on the **next day** in
  the source's convention.
- **`FULL DAY`** — the item spans the whole date; there is no transition
  during the date.
- **blank** — neither value was available.

A future reverse converter can reconstruct the nested JSON flags from
this: `nextDay = true` when the value is `>= 24`, `fullDay = true` when
the cell is `FULL DAY`, `fullDay = false` otherwise, and `endsAt` as the
raw text.

## Timing columns

The Kala timings are split into ranges. `rahuKala`, `gulikaKala`,
`yamaganda`, and `arthaPrahara` each have one range and contribute three
columns: `<key>_prefix`, `<key>_from`, `<key>_to`.

`shubhaSamaya` (ಶುಭ ಸಮಯ) is the only field with **two ranges on some
dates**, so it contributes six columns: `<key>_prefix`, `<key>_from`,
`<key>_to` (first range) plus `<key>_prefix_2`, `<key>_from_2`,
`<key>_to_2` (second range, blank when absent).

`_from`/`_to` hold the printed time tokens exactly as OCR'd (e.g.
`06:00`, `0731`). The `_prefix` cell holds a canonical abbreviated period:

| Canonical | Meaning | OCR variants normalized to it |
|-----------|---------|-------------------------------|
| `ಬೆ.` | morning | ಬೆ., ಬಿ., ಬ., ಭ., ಚೆ., ಚ. |
| `ಮ.` | afternoon | ಮ., ಮ, ಪ. |
| `ಸ.` | evening | ಸ., ಸ, ಸಾ. |
| `ರಾ.` | night | ರಾ. |
| `ಜ.` | distinct (retained as-is) | ಜ. |

An unrecognized prefix is written as **`UNKNOWN`** and reported in the
script's warning output with the date and key — the **source image is
authoritative**, so correct it by comparing against `source_image`.

## Round-trip

When edits are done, export the sheet back to CSV (File → Download →
Comma-separated values) and feed it to the reverse converter, which maps
each row back into the nested `structured-ocr.json` shape so the app data
can be regenerated.

Regenerate the export any time with:

```
node scripts/export-editorial.js
```

## Panchanga review sheet

`panchanga-review.csv` is a flat, one-row-per-date export of the **Panchanga
tab data only** (no events), produced by `node scripts/export-panchanga-review.js`
(run from the repo root). It covers all 365 dates of 2026 in chronological
order.

## Purpose

This sheet is for reviewing the merged panchanga data (OCR + PDF): each row
mirrors exactly what the app's Panchanga view displays, plus a
`*_source` column per field group recording where that value came from.

## Source labels

| mergeSources value | Source cell |
|---|---|
| `pdf` | `PV Calendar` |
| `ocr` / `ocr-neighbor` | `kannada calendar.in` |

- `tithi_*` → `mergeSources.tithi`; `nakshatra_*` → `mergeSources.nakshatra`;
  each timing → `mergeSources["timings.<key>"]`.
- Calendar fields use the granular key (`calendar.months`,
  `calendar.samvatsara`, `calendar.shakaYear`) when present, else the plain
  `calendar` key.
- paksha / yoga / karana / ayana / solar_rashi / chandra_rashi / sunrise /
  sunset default to `kannada calendar.in` when the value is present.
- `jathaka_source` is `kannada calendar.in` when any prediction is present.
- **A source cell is left blank whenever its value cell is blank** (no data
  to source). This affects, for example, yoga/karana on the 15 PDF-only
  dates, and any unparseable OCR timing string that the app drops.

## Column semantics

- `date`: ISO `YYYY-MM-DD`. (Not `DD-MM-YYYY`: Google Sheets/Excel auto-convert
  `DD-MM-YYYY` inconsistently on import — days 1–12 become dates, day 13+ stay
  text — so ISO is used to stay unambiguous in every locale.)
- `months`: OCR months joined with `–` (en dash); empty and `—` items dropped.
- `*_ends`: app rendering of `endsAt` — `HH:MM`, `ಮರುದಿನ HH:MM` for
  next-day ends, or `—` for full-day markers / missing data.
- Timings (`rahu_kala` … `shubha_samaya`): `HH:MM – HH:MM` when the stored
  string yields two usable time tokens; blank otherwise (the app drops the
  timing). Values >=24 on endsAt mean next day.
- Jathaka: 12 fixed columns named after the canonical Kannada rashi names;
  each holds that day's prediction for the rashi.

Regenerate the sheet any time with:

```
node scripts/export-panchanga-review.js
```
