# Calendar Event Integration Plan

## Goal

Use `data/pv-calendar-data.json` as the calendar's user-facing event source while
keeping the existing OCR records for panchanga, timings, and rashi data.

This is an event-display replacement, not a replacement for the complete daily
record.

## Product decisions

### District selector

- Add one native, labeled district `<select>` to the Today and Month views.
- Populate it from all 31 worksheet names, including districts with no events.
- Store the selection in `sessionStorage`.
- Default to `Select district` / state-only rather than silently choosing a district.
- Preserve the selected date and month when the district changes.
- Show two event sections in Today:
  - Selected district events
  - Karnataka-wide events
- Include events marked `Assumed district relevance` in the selected district section.
- Do not display the raw relevance labels as normal event copy.
- Show an explicit empty state when a section has no events.

### Monthly district calendar

- Reuse the existing Month view; do not add another top-level tab.
- Mark dates with a dot or event count based on the selected district.
- Add a dated event agenda below the month grid so event details are not hidden
  behind dots.
- Show event title and optional place; omit missing places.
- Preserve duplicate titles when their places or source records differ.

### Karnataka map

Add this after the selector and monthly calendar are working.

- Make the monthly map the primary map view; defer day/week maps until there is
  evidence they are useful.
- Color districts by local event count for the selected month.
- Use hover for desktop discovery, but support click/tap and keyboard focus.
- Open a panel or popover with that district's events grouped by date.
- Do not count Karnataka-wide events once per district; show them separately.
- Provide a list/table alternative for mobile and accessibility.
- Use a licensed Karnataka district-boundary SVG or GeoJSON asset and document
  its source and license before adding it.

## Event data model

Load the PV JSON once and build one in-memory index used by Today, Month, and Map:

```js
{
  sourceDistrict,
  dateStart,
  dateEnd,
  rawDate,
  title,
  place,
  scope
}
```

Persisted JSON maps to this model as follows:

- `date` is the inclusive start date.
- `date_end` is an optional inclusive end date; when absent, the event is a
  single-day event and `dateEnd` equals `dateStart`.
- Keep `rawDate` only in the in-memory model or QA output when useful; do not
  display it as user-facing copy.

Filtering rules:

- `localEvents`: all dated rows from the selected district sheet, including
  assumed district relevance.
- `stateEvents`: rows from any sheet whose relevance is exactly
  `Relevant for Karnataka`.
- If one source record qualifies for both groups, render it once.
- Treat `dateStart` through `dateEnd` as an inclusive interval for Today, Month,
  and Map filtering.
- Keep the source district internally for traceability.
- Escape titles and places with the existing `esc()` helper.

Do not parse district names out of free-form Kannada event text. The worksheet
district is the reliable district assignment; text parsing would inherit OCR
errors.

## Data and date handling

- Keep the JSON as a separate source from `ocr-zones/<date>/structured-ocr.json`.
- Normalize valid dates to string keys; do not use `new Date("YYYY-MM-DD")`, which
  can introduce timezone shifts.
- Read `date` as the range start and optional `date_end` as the inclusive range
  end. A range event should appear on every covered day cell, but only once in
  the agenda with its date span shown.
- The current JSON has two range records: `2026-09-01`–`2026-09-11` and
  `2026-09-08`–`2026-09-14`.
- The two formerly empty Bidar dates were filled by carrying forward the
  immediately preceding dates; treat these as editorial assumptions during
  future review.
- Keep any future malformed or undated entries out of date cells rather than
  guessing, and expose them in a small review/QA bucket.
- Preserve the distinction between confirmed and assumed district relevance in
  the data model, even if the default UI does not emphasize it.
- Keep the current 145 records and all worksheet names intact.

## Implementation phases

### Phase 1 — Data contract and validation

- Define the loader's accepted date formats and range behavior.
- Validate that all current dates are ISO strings and that every `date_end` is
  on or after its `date`.
- Add focused fixtures for single dates, inclusive ranges, malformed dates, and
  null dates.

### Phase 2 — Shared event index

- Add one PV JSON fetch and cache it in `app.js`.
- Build the normalized event index and date lookup.
- Keep PV load failure separate from OCR-day failure; show an event-data error
  instead of falling back to fabricated or stale event data.

### Phase 3 — Today view

- Add the session-level district selector.
- Replace the current OCR event card with the shared local/state projection.
- Keep the existing event expansion behavior for long lists.

### Phase 4 — Month view

- Replace the old OCR-based event marker with filtered PV events.
- Add event counts or dots to every day covered by an event interval.
- Add the monthly dated agenda below the grid, showing range spans once.

### Phase 5 — Monthly Karnataka map

- Add the licensed district-boundary asset.
- Add local event-count styling and selected-district details.
- Add keyboard, tap, and list/table access paths.
- Keep Karnataka-wide events in a separate statewide summary.

### Phase 6 — Editorial and source documentation

- Update the About/source text to mention the PV event data.
- Document the local-versus-state filtering rule.
- If future editorial updates need event district metadata, extend the CSV
  contract by adding columns; do not rename existing columns.

## Files likely to change

- `app.js` — loading, indexing, filtering, Today and Month rendering
- `index.html` — selector, monthly agenda, map container, source copy
- `styles.css` — selector, agenda, map states, responsive layout
- `app.test.js` — loader, filtering, rendering, and failure tests
- `data/pv-calendar-data.json` — only when editorial data is intentionally updated

No backend, build step, or new dependency is justified for the current 145-record
dataset.

## Verification

Automated tests should cover:

- selected district plus Karnataka-wide filtering
- no duplicate event in both sections
- empty districts and empty months
- assumed district labels
- single-day dates, inclusive ranges, malformed dates, and undated records
- PV load failure
- monthly event markers and agenda contents
- range events appearing on every covered day but only once in the agenda
- map counts using unique events rather than counting each covered day as a new event
- preservation of the selected date/month after changing district

Manual verification:

1. Start the app with `serve-calendar.bat`.
2. Use `http://localhost:8000/index.html`, not `file://`.
3. Check Today and Month views with an empty district and a populated district.
4. Check desktop hover, keyboard focus, tap behavior, and mobile layout for the
   map once it exists.

## Out of scope for the first implementation

- Replacing panchanga, timings, or rashi data
- Automatic Kannada spelling/content correction
- Automatically guessing future unresolved dates
- `localStorage` persistence
- Day/week map views before the monthly map proves useful
