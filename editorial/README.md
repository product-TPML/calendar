# Editorial CSV

`calendar-editorial.csv` is a flat, one-row-per-date export of every
`ocr-zones/<date>/structured-ocr.json` file, produced by
`node export-editorial.js` (run from the repo root).

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

The five Kala timings (`rahuKala`, `gulikaKala`, `yamaganda`,
`arthaPrahara`, `shubhaSamaya`) are split into up to two time ranges.
Each key contributes six columns: `<key>_prefix`, `<key>_from`,
`<key>_to` (first range) and `<key>_prefix_2`, `<key>_from_2`,
`<key>_to_2` (second range, blank when absent). `ಶುಭ ಸಮಯ`
(`shubhaSamaya`) has **two ranges on some dates** — the second range is
only filled there; the other four keys have one range.

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
node export-editorial.js
```
