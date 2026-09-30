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
| `data/pv-calendar-data.json` | Event data the app loads. Other files in `data/` are generated and ignored |
| `ocr-zones/<DD-MM-YYYY>/structured-ocr.json` | Per-day Panchanga records the app loads lazily. Other files in these folders are OCR intermediates and are ignored |
| `epaper/` | Cultural-event candidates (`cultural-event-candidates.json`) and the browser extension that collects them |
| `editorial/` | Editorial CSV exports and the log of applied OCR corrections |
| `scripts/` | Data pipeline: image download, OCR, PDF extraction and merge, CSV exports. Run them from the repo root, for example `node scripts/export-editorial.js` |
| `docs/` | Architecture notes and plans (`architecture.md`, `calendar-events-plan.md`, `ocr-zones.md`, ...) |
| `tests/` | `app.test.js` (Node, no framework) |
| `google-form/` | Apps Script that routes form submissions to district sheets |
| `source/` | Local source material (PDF calendar, form responses, original logo). Ignored by git |
| `tessdata/` | Tesseract language data for the OCR pipeline. Ignored by git |
