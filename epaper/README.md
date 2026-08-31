# ePaper Collector

This folder contains the pre-extension proof collector for Prajavani ePaper.
It is intentionally separate from the calendar application.

## Console collector

`collect-console.js` is designed to run in the logged-in
`https://epaper.prajavani.net/` page through the browser console or Playwright's
page context.

It:

- Reads the active session values in memory only.
- Uses the same authenticated manifest request headers as the ePaper app.
- Fetches all editions for one date.
- Fetches every manifest article HTML file for accessible editions.
- Reports `200`, `403`, and other failures per edition.
- Counts pages with no article metadata and image-only article HTML.
- Returns no access-token values and writes no files.

## Run in the connected MCP browser

The source can be injected into the current page and executed without copying
credentials into a script:

```js
await page.addScriptTag({ path: "epaper/extension/collect-console.js" });
const report = await page.evaluate(() => collectPrajavaniEpaper("2026-08-31"));
console.log(report.summary);
```

For a smaller article-extraction check, limit the editions while keeping the
same authenticated flow:

```js
const report = await page.evaluate(() => collectPrajavaniEpaper("2026-08-31", {
  editionNumbers: [4, 14],
}));
```

Use `{ fetchArticles: false }` when validating only edition and manifest
coverage across the full edition list.

When using the MCP browser tools, the equivalent operation is to load the file
with Playwright and call `collectPrajavaniEpaper` through page evaluation. Keep
the logged-in ePaper tab open while the collector runs.

## Output interpretation

- `auth.sessionDetected`: the page had an active access token.
- `auth.accessTypeDetected`: an AccessType token was available or fetched.
- `auth.paid`: the page's paid-status flag was `paid`.
- `summary.accessible`: editions whose manifest was successfully returned.
- `summary.forbidden`: editions rejected with HTTP 403.
- `pagesWithoutArticles`: pages not represented by structured article records.
- `imageOnlyArticles`: article HTML responses containing images but no text.

The collector is a validation harness, not the final extension. It does not
persist results, refresh a session after a 401, OCR page images, or search text.
Those are deliberate next steps after coverage is measured.

## Extension

The first Chrome/Edge Manifest V3 extension lives in `epaper/extension/`. Load
that folder as an unpacked extension from `chrome://extensions`, then keep
the logged-in `https://epaper.prajavani.net/` tab open.

The side panel provides:

- Date selection.
- Inclusive start/end date collection.
- Multi-edition selection with All, Bengaluru, and None shortcuts.
- One-click article extraction.
- Per-edition progress and failure status.
- Local Kannada text search.
- Optional From/To date filters across the local shelf.
- JSON shelf export/import and local shelf clearing.

The extension stores data in the `prajavani-epaper` IndexedDB database:

- `editions`: edition catalog records.
- `issues`: date/edition crawl status.
- `pages`: page metadata and image, thumbnail, and PDF URLs.
- `articles`: normalized text, raw HTML, article images, placement, and source
  URLs.
- `jobs`: crawl progress and completion status.

Raw HTML is retained for each successful article fetch. Page and article media
are referenced by URL rather than downloaded as binary files. Access tokens are
used only in the ePaper page context and are not stored by the extension.

Collection dates are inclusive. The extension runs one manifest/article crawl
per date and keeps each date/edition as a separate issue record, so rerunning a
range upserts the same records instead of merging unrelated issues.

Date crawls run with a concurrency limit of two. Within each date, the
collector limits editions to three concurrent jobs and article HTML requests
to four per active edition.

Switching away from, navigating away from, or closing the ePaper tab stops the
active crawl. Completed date/edition records remain in the local shelf, and
the job is marked `cancelled`.

## Safety

- Do not paste or print token values.
- Do not commit collector output containing article data unless explicitly
  intended.
- Respect the ePaper account's edition access and the site's terms.
