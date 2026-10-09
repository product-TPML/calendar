# Prajavani Kannada Cultural Calendar

A static, mobile-first web app showing Kannada religious and cultural events by day, week and month, with daily Panchanga details. Plain HTML, CSS and JavaScript; no build step.

## Run it

```
serve-calendar.bat            # serves http://localhost:8000/index.html
node tests/app.test.js        # run the tests (from the repo root)
```

Open the app over HTTP, not `file://`, so the data files can load. See `AGENTS.md` for details.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `assets/` | The app (must stay at the repo root: the browser loads data by these paths) |
| `data/pv-calendar-data.json` | District event data the app loads |
| `data/calendar-events.json` | Day-level events for 2026 and 2027, shown as Karnataka-wide events. Generated from the Word calendars in `data/` by `scripts/extract-docx-events.py` (see its docstring). Other files in `data/` are local and ignored |
| `data/panchanga.json`, `data/panchanga/<district>.json` | Panchanga tab data for 2026 and 2027, no OCR. `panchanga.json` has one record per day (tithi, nakshatra, paksha, lunar months, ayana, sun and moon rashi, samvatsara, Shaka year); each district file has that district's sunrise, sunset, Rahu/Gulika/Yamaganda/Ardha Prahara, yoga and karana. Built by `python scripts/build-panchanga-data.py` (see its docstring for the sources). Shubha Samaya and the daily rashi bhavishya are not available and the tab says so |
| `ocr-zones/` | Old OCR output. The app no longer reads it |
| `epaper/` | Cultural-event candidates (`cultural-event-candidates.json`) and the browser extension that collects them |
| `editorial/` | Editorial CSV exports and the log of applied OCR corrections |
| `scripts/` | Data pipeline: image download, OCR, PDF extraction and merge, CSV exports. Run them from the repo root, for example `node scripts/export-editorial.js` |
| `docs/` | Architecture notes and plans (`architecture.md`, `calendar-events-plan.md`, `ocr-zones.md`, ...) |
| `tests/` | `app.test.js` (Node, no framework) |
| `google-form/` | Apps Script that routes form submissions to district sheets |
| `source/` | Local source material (PDF calendar, form responses, original logo). Ignored by git |
| `tessdata/` | Tesseract language data for the OCR pipeline. Ignored by git |
