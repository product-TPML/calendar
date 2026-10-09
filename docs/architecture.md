# Architecture

## Panchanga tab (current)

The tab reads no OCR. `scripts/build-panchanga-data.py` writes `data/panchanga.json` (per day) and `data/panchanga/<district>.json` (per district).

- 2026 tithi and nakshatra with end times: `data/pdf-panchanga-data.json`, extracted from the PV wall-calendar PDF by `scripts/extract-pdf-panchanga.py`.
- 2027 tithi and nakshatra: `data/Calander 2027.docx`, Table 1.
- Computed in `scripts/compute-panchanga.py` and `scripts/compute-sun-times.py`: paksha, lunar months, ayana, sun and moon rashi, yoga, karana (the one at sunrise and the next), sunrise, sunset, Rahu/Gulika/Yamaganda/Ardha Prahara.
- A value that cannot be read or fails the cross-check is left out and the tab shows "ಲಭ್ಯವಿಲ್ಲ". Shubha Samaya and the daily rashi bhavishya have no source and always show it.
- See `docs/panchanga-2027-source-audit.md` for the Word-file audit.

## Legacy OCR pipeline (not used by the app)

- `scripts/download.js` downloads daily Kannada calendar images using the site’s date-based URL pattern and stores them under `data/{year}/{month}/`.
- `scripts/ocr_month.ps1` runs ImageMagick crops and Kannada Tesseract OCR for each available date, producing structured JSON and raw zone outputs under `ocr-zones/`.
- `scripts/ocr_month.ps1` uses tolerant time parsing, full-table fallback text for lower rows, and keyword fallbacks for Paksha and timing fields.
- `scripts/retry_paksha.ps1` performs targeted Paksha recovery without rerunning the full monthly pipeline.
- `editorial/observer-corrections-applied.jsonl` records high-confidence visual corrections applied after OCR review.
- `docs/ocr-zones.md` is the source of truth for fixed image coordinates, row divisions, overlap, and OCR settings.
- `tessdata/`, `data/`, and `ocr-zones/` are local generated artifacts and are intentionally excluded from version control.
