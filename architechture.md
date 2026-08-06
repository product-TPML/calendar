# Architecture

- `download.js` downloads daily Kannada calendar images using the site’s date-based URL pattern and stores them under `data/{year}/{month}/`.
- `ocr_month.ps1` runs ImageMagick crops and Kannada Tesseract OCR for each available date, producing structured JSON and raw zone outputs under `ocr-zones/`.
- `ocr_month.ps1` uses tolerant time parsing, full-table fallback text for lower rows, and keyword fallbacks for Paksha and timing fields.
- `retry_paksha.ps1` performs targeted Paksha recovery without rerunning the full monthly pipeline.
- `observer-corrections-applied.jsonl` records high-confidence visual corrections applied after OCR review.
- `ocr-zones.md` is the source of truth for fixed image coordinates, row divisions, overlap, and OCR settings.
- `tessdata/`, `data/`, and `ocr-zones/` are local generated artifacts and are intentionally excluded from version control.
