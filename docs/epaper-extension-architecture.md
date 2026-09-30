# Prajavani ePaper Extension Architecture

## Status

This document records the ePaper behavior verified during browser inspection
and the smallest practical architecture for a future local-search extension.
It is documentation only. No extension has been implemented yet.

Confirmed observations are separated from proposed design decisions. The
observations were made against `https://epaper.prajavani.net/` for Prajavani
(`publisher=PV`) on 2026-08-30 and 2026-08-31.

## Goal

Build a browser extension that can:

- Select one or more Prajavani editions.
- Select a date or date range.
- Download the available ePaper manifest and article HTML.
- Store normalized article records locally.
- Search the downloaded Kannada text by title, body, edition, date, and page.
- Resume interrupted downloads without repeating successful work.

The first version should be local-only. It does not need a backend, account
database, custom search server, or OCR pipeline.

## Confirmed Data Flow

The ePaper web app is a client-side viewer over a separate API and CDN. Page
clicking is not the source of truth.

1. Fetch the available edition list.
2. Fetch the dates available for an edition and month.
3. Fetch the issue manifest for an edition and date.
4. Flatten the manifest's sections, pages, and article records.
5. Fetch each article's HTML file from the CDN.
6. Parse `.articleDetail` into a normalized local record.
7. Use page images as a fallback/reference for records with no text.

The UI itself stays at `/`; page, date, and edition selections do not require
route changes. Page changes replace the current image and page metadata.

## Confirmed Endpoints

### Edition list

```text
GET https://api-epaper-prod.deccanherald.com/epaper/editions?publisher=PV
```

The response contains one parent edition (`Karnataka`) and edition records such
as:

```json
{
  "id": 11,
  "edition_number": 4,
  "edition_short_code": "BC",
  "edition_name": "ಬೆಂಗಳೂರು ನಗರ"
}
```

Use `edition_number` in later requests, not the record's `id`. For example,
Bengaluru uses `edition_number=4`, while its record `id` is `11`.

### Available dates

```text
GET https://api-epaper-prod.deccanherald.com/epaper/available-dates?month=8&year=2026&publisher=PV&edition=4
```

The response contains date strings in `YYYYMMDD` form and a `hasData` flag:

```json
{
  "month": 8,
  "year": 2026,
  "publisher": "PV",
  "dates": [
    { "date": "20260831", "hasData": true }
  ],
  "totalDays": 31,
  "availableDays": 31
}
```

The date picker requested this endpoint for the selected month and edition.

### Issue manifest

```text
GET https://api-epaper-prod.deccanherald.com/epaper/data?date=20260831&edition=4&publisher=PV
```

The response contains:

- `data_url_suffix`, used for page images, thumbnails, and PDFs.
- `html_url_suffix`, used for article HTML.
- Publication date and edition name.
- Sections and pages.
- Page dimensions and display metadata.
- Advertisement regions.
- Article IDs, HTML paths, placement coordinates, and content element IDs.

Example URL composition:

```text
html_url_suffix + htmlFile
```

For 2026-08-31 Bengaluru, this produced paths under:

```text
https://assets-prod.prajavani.net/PV/20260831/pp3-20260831_4/pp3-20260831_4/
```

### Article HTML

An article manifest record can look like:

```json
{
  "contentElementId": "/dcx/atom/document/doc87dv...",
  "id": "915657525",
  "htmlFile": "article/webepaper/html/915657525.html",
  "top": "50.794437%",
  "left": "2.1789882%",
  "width": "10.894941%",
  "height": "27.408146%"
}
```

The resulting HTML is a fragment, not a complete document. It uses:

- `.articleDetail` as the root.
- `h3` for an optional kicker/highline.
- `h1` for the headline.
- `.bodytext p` for article paragraphs.
- `.pictures img` for article images.

Article image paths can be relative. Resolve them with `new URL(src,
articleUrl)` before storing them.

The article route is also available for human viewing:

```text
https://epaper.prajavani.net/article/{articleId}?date=YYYY-MM-DD&edition_No={editionNumber}&pageNumber={pageNumber}
```

The route is useful as a citation or “open article” link, but the CDN HTML
file is the better extraction source because it avoids UI navigation.

## Important Data Limitations

### The manifest is not guaranteed to contain every printed article

For 2026-08-31 Bengaluru, the manifest contained 18 article records, mostly
on the `04 ರಾಜ್ಯ` and `01 GEN DESK` pages. Other page entries had no article
records even though the ePaper showed page images or thumbnails.

The supplied `ನಗರದಲ್ಲಿ ಇಂದು` article route also resolved successfully even
though that article was not present in the current manifest's article list.

Therefore:

- Treat manifest articles as the reliable structured-text set, not proof of
  complete page coverage.
- Store every page record, including pages with zero articles.
- Mark pages with no structured articles as `image-only` or `unindexed`.
- Do not silently claim that a crawl contains every visible newspaper item.
- Add OCR only if “every printed article” is a hard requirement after testing
  the manifest coverage.

### Some article HTML is image-only

Several successful article HTML responses contained an image but no `h1` or
body paragraphs. These records should remain in the local issue inventory with
an extraction status such as `image-only`, rather than being discarded.

### IDs must remain strings

Article IDs can exceed JavaScript's safe integer range. Keep `id`, page IDs,
and content element IDs as strings everywhere, including IndexedDB keys.

## Edition and Authentication Boundaries

The edition list exposes 32 Karnataka editions, including Bengaluru, Mysuru,
Ramanagara, Bengaluru Rural, and others.

Access is not uniform by edition/date, and the ePaper app uses extra
authentication headers for manifest requests:

- With the app's authenticated headers, all 32 editions returned `200` for
  2026-08-31.
- Ramanagara (`edition=14`) also returned `200` for 2026-08-30.
- An unadorned request to Ramanagara (`edition=14`) for 2026-08-31 returned
  `403` with:

```text
Guests and Freemium users can only access Bengaluru edition
```

The Playwright session was verified as logged in because
`https://sso.tpml.in/auth/me` returned `200`. The app's ePaper Axios client
still uses the same `/epaper/data` endpoint, but adds these headers when a
session exists:

- `Authorization: Bearer {accessToken}`
- `x-accesstype-jwt: {accessTypeToken}`
- `x-is-paid: true|false`

The AccessType token is obtained with:

```text
POST https://sso.tpml.in/auth/accesstype-pv-token
```

That request uses the bearer access token and the returned token is cached by
the site as `jwt_token`. The app refreshes the session and retries after a
`401`. A raw page-context fetch that omits these app-managed headers can return
the freemium `403` even though the browser is logged in, so raw-fetch status
results must not be treated as a definitive account-entitlement test.

The extension must respect the server response. It must not attempt to bypass
edition restrictions or copy session tokens into extension storage.

For authenticated use, the extension should reuse the site's authenticated
request path where permitted. The proof collector fetched all 32 manifests
with the app-generated headers and successfully fetched 201 article HTML files
across Bengaluru and Ramanagara. It must not copy, log, or persist the access
or AccessType tokens.

## Proposed Extension Shape

The target is a Manifest V3 extension, with no backend in the first version.

### Service worker

Responsibilities:

- Start and resume crawl jobs.
- Request editions, dates, manifests, and article HTML.
- Normalize and persist records.
- Enforce a small concurrency limit and retry transient failures.
- Report progress to the UI.

The worker must checkpoint after each issue and article because Manifest V3
service workers can be stopped between events. A job should be resumable from
IndexedDB rather than relying on one long-running JavaScript promise.

### Side panel or popup UI

The UI should provide:

- Edition selector populated from the edition endpoint.
- Month/date selector populated from `available-dates`.
- Manual start, pause, resume, retry, and cancel controls.
- Current issue/article progress and failure counts.
- Search input and filters for edition, date, section, and page.
- A result link back to the ePaper article route when one can be formed.

A side panel is preferable for search and progress because it has more space
than a popup. A popup is sufficient for a smaller first UI if browser support
is the priority.

### Content script

A content script is optional, not the crawler's primary mechanism. It may be
used to:

- Add a “save this issue/article” control to the ePaper page.
- Read the currently selected date, edition, and page for convenience.
- Open stored search results in the original site.

Direct API/CDN fetching should remain the normal path. The extension should
not automate hundreds of page-arrow clicks.

### Authenticated request bridge

There is no separate authenticated ePaper content endpoint. The app's
authenticated request path is:

1. Obtain the site's access token from its session mechanism.
2. Request an AccessType token from `sso.tpml.in/auth/accesstype-pv-token`.
3. Call the same API endpoints with `Authorization`, `x-accesstype-jwt`, and
   `x-is-paid` headers.
4. Refresh the session and retry once after a `401`.

The extension should not read or persist raw tokens. The authenticated bridge
has been validated in the console collector, but its extension-safe session
integration still needs to be implemented:

- First verify the app-generated request headers for a paid account.
- Prefer reusing the active page/session request path over recreating the site's
  token storage logic.
- Keep unauthenticated collection as a separate mode for publicly accessible
  editions.
- Treat a `403` as an entitlement result only after the request is confirmed to
  contain the app's authentication headers.

### Local storage

Use IndexedDB for issue manifests, pages, articles, crawl jobs, and failures.
Use `chrome.storage.local` for small user preferences such as the selected
edition and date range.

Do not use a new search dependency initially. Normalize Kannada text and use
case-insensitive substring matching across the locally loaded records. Add an
inverted index only if real corpus size makes simple matching too slow.

## Implemented Prototype

The first extension slice is now organized under `epaper/extension/`:

- `manifest.json` defines the Chrome/Edge Manifest V3 extension and narrow host
  permissions.
- `panel.html`, `panel.css`, and `panel.js` provide the side panel collection
  and search UI.
- `content-bridge.js` runs on the logged-in ePaper page and keeps the
  authenticated extraction work in page context.
- `background.js` owns IndexedDB persistence, job status, progress, search, and
  JSON export data access.
- `collect-console.js` is the shared manifest/article collector used by both
  the console proof and the extension bridge.

The IndexedDB database is `prajavani-epaper` with these object stores:

- `editions`: edition catalog records.
- `issues`: date/edition status and crawl counts.
- `pages`: page metadata and media URLs.
- `articles`: normalized fields plus raw HTML, source URLs, image URLs, and
  extraction status.
- `jobs`: resumable crawl status.

The extension stores raw article HTML but does not download binary page or
article media. It uses session tokens only in memory in the ePaper page
context; token values are not sent to the side panel, returned in reports, or
persisted in IndexedDB.

The implemented side panel accepts an inclusive start and end date. The page
bridge loops through each date and sends each completed date/edition to the
background worker, which stores it under `PV:{date}:{editionNumber}`. Search
accepts optional From and To dates and filters the stored article records before
matching the query text.

The bridge runs at most two dates concurrently. Each date still limits itself
to three concurrent editions, and each active edition limits article HTML to
four concurrent requests.

## Proposed Data Model

### Edition

```js
{
  editionNumber: "4",
  sourceId: "11",
  shortCode: "BC",
  name: "ಬೆಂಗಳೂರು ನಗರ",
  parent: "Karnataka"
}
```

### Issue

```js
{
  key: "PV:20260831:4",
  publisher: "PV",
  date: "2026-08-31",
  dateCompact: "20260831",
  editionNumber: "4",
  editionName: "ಬೆಂಗಳೂರು ನಗರ",
  dataUrlSuffix: ".../PV/20260831/data/",
  htmlUrlSuffix: ".../PV/20260831/pp3-20260831_4/pp3-20260831_4/",
  status: "complete",
  fetchedAt: "...",
  articleCount: 18
}
```

### Page

```js
{
  key: "PV:20260831:4:1761191",
  issueKey: "PV:20260831:4",
  id: "1761191",
  sectionName: "PJ",
  name: "STATE",
  displayName: "04 ರಾಜ್ಯ",
  pageNo: "04",
  absPageNo: 4,
  width: 1285,
  height: 2014,
  imageUrl: ".../webepaper/photos/1761191.webp",
  thumbnailUrl: ".../webepaper/photos/thumbs/1761191.png",
  pdfUrl: ".../webepaper/pdf/1761191.pdf",
  articleCount: 10
}
```

### Article

```js
{
  key: "PV:20260831:4:915657525",
  issueKey: "PV:20260831:4",
  pageKey: "PV:20260831:4:1761191",
  id: "915657525",
  contentElementId: "/dcx/atom/document/doc87dv...",
  title: "...",
  kicker: "...",
  bodyText: "...",
  imageUrls: [],
  articleHtmlUrl: ".../article/webepaper/html/915657525.html",
  siteUrl: ".../article/915657525?date=...",
  placement: {
    top: "...",
    left: "...",
    width: "...",
    height: "..."
  },
  extraction: "text",
  fetchedAt: "..."
}
```

Suggested extraction values are `text`, `image-only`, `empty`, `forbidden`,
`not-found`, and `failed`.

## Crawl Algorithm

The initial implementation should use a bounded, checkpointed pipeline:

1. Load and cache the edition list.
2. Convert the requested date range into months.
3. Fetch `available-dates` for each selected edition/month.
4. Skip dates where `hasData` is false.
5. Fetch one issue manifest for each available date.
6. Upsert the issue and every page before downloading articles.
7. Create an article task for each manifest article.
8. Fetch article HTML with a small concurrency limit, initially 3-5 requests.
9. Parse and normalize the fragment.
10. Upsert each article and checkpoint the task status.
11. Mark the issue complete only after all tasks have terminal statuses.

Use the issue key and article key for idempotency. A retry must update the same
record, not create duplicates.

## Parsing Rules

- Parse HTML with `DOMParser`.
- Read the first non-empty `h1` as `title`.
- Read the first non-empty `h3` as `kicker`.
- Read `.bodytext` paragraphs, preserving paragraph boundaries with newlines.
- Strip ad placeholders and empty elements.
- Resolve relative image URLs against the article HTML URL.
- Normalize Unicode to NFC and collapse repeated whitespace for the searchable
  field.
- Keep the original title/body text separately if later editorial comparison
  matters.
- Escape text only at render time; never inject article HTML into the search UI.

## Failure Handling

Record failures instead of aborting the whole crawl:

- `403`: mark the edition/date as restricted and stop retrying automatically.
- `404`: mark the article or issue as unavailable.
- `429`: retry with backoff and lower concurrency.
- `5xx` or network error: retry a small number of times, then leave as failed.
- Invalid JSON or missing manifest fields: mark the issue malformed.
- HTML with no text but an image: mark `image-only`.

The UI should show partial completion. One inaccessible city edition should not
erase successfully downloaded Bengaluru records.

## Permissions and Security

Keep permissions narrow:

- Host permissions for `epaper.prajavani.net`.
- Host permissions for `api-epaper-prod.deccanherald.com`.
- Host permissions for `assets-prod.prajavani.net`.
- `storage` for local records and preferences.

Add `alarms` only if scheduled crawling is explicitly required. Do not add
tabs, downloads, identity, or broad `<all_urls>` permissions without a concrete
feature requiring them.

Security rules:

- Never log or persist access tokens, cookies, or authorization headers.
- Do not expose raw article HTML through an unsafe `innerHTML` rendering path.
- Treat API and CDN content as untrusted input.
- Respect server-side edition and subscription restrictions.
- Keep the crawler user initiated until background scheduling is justified.

## Search Design

The first search implementation can scan normalized local records and filter
by:

- `title`
- `kicker`
- `bodyText`
- edition name
- date
- section/page name

Results should display title, date, edition, page, extraction status, and a
short matching-text preview. Search should include `image-only` records in
metadata filters but should not pretend they contain searchable text.

If substring scans become slow, the next upgrade is a token-to-article
inverted index in IndexedDB. No external full-text library is justified before
that limit is measured.

## Open Questions

- Is the target browser Chrome/Edge only, or must Firefox also be supported?
- Should authenticated users be able to crawl every edition their account can
  open, or should the first version restrict itself to Bengaluru?
- Does “all articles” mean all structured article records, or every visible
  article in page images, which would require OCR for missing regions?
- Should the extension retain only text and URLs, or cache article/page images
  locally too?
- What date retention limit is useful for the local database?
- Is scheduled daily crawling needed, or is manual date-range crawling enough?

## Recommended Implementation Order

1. Build a one-issue collector for Bengaluru using the three confirmed API
   stages and direct article HTML fetches.
2. Persist issue/page/article records in IndexedDB with resume-safe statuses.
3. Add a minimal search side panel for downloaded records.
4. Add date ranges and all editions, preserving `403` results as explicit
   access failures.
5. Measure manifest coverage before deciding whether OCR is necessary.
6. Add page-image caching, scheduling, or a full-text index only when usage
   demonstrates the need.

## Verification Checklist

- Edition list maps `edition_number` correctly and does not use the catalog ID.
- Available dates are requested per month and edition.
- Issue keys are stable across reruns.
- Large numeric IDs remain strings.
- All manifest pages are stored, including pages with zero articles.
- Article HTML is fetched from `html_url_suffix + htmlFile`.
- Relative article images resolve to absolute CDN URLs.
- Text and image-only articles receive different extraction statuses.
- A 403 does not cause an infinite retry loop.
- Interrupted jobs resume without duplicate issues or articles.
- Search never renders untrusted article HTML.
- Bengaluru and at least one inaccessible edition are tested.
- The extension does not store or print credentials or tokens.
