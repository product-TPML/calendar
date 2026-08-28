# Calendar Event Integration Plan

## Goal

Use `data/pv-calendar-data.json` as the calendar's user-facing event source while
keeping the existing OCR records for panchanga, timings, and rashi data.

This is an event-display replacement, not a replacement for the complete daily
record.

## UI and navigation redesign

### Date-wise home behavior

- The home/day view represents the currently selected date, not always today.
- On first visit, default to the actual current date.
- Persist the selected date for the browser session in `sessionStorage` as
  `pvDate` using `DD-MM-YYYY`.
- Save it after day navigation, month-cell selection, and swipes.
- The `ಇಂದು` button in the masthead is the only explicit jump to the actual
  current date; compute today when the button is pressed.
- The day tab should be renamed from `ಇಂದು` to `ದಿನ`, since it may show a date
  other than today. It must not reset the date when selected.
- The district filter remains session-scoped in `sessionStorage` as `pvDistrict`.

### Masthead

- Remove the redundant `ನಿತ್ಯ ಪಂಚಾಂಗ` heading/brand treatment.
- Make the selected date the visual focus: large day number with weekday and
  month/year stacked beside it.
- Keep previous/next day controls and add a prominent `ಇಂದು` button.
- Make the date area horizontally swipeable: left advances one day, right goes
  back one day.
- Swipe only when horizontal movement is dominant and exceeds roughly 40–50px;
  ignore vertical scrolling and gestures starting on buttons, links, selects,
  inputs, or other controls.

### Day-view order

1. Prominent masthead date
2. Slim date-context card with samvatsara, shaka year, and month names
3. Existing events card, moved immediately below the date context
4. Panchanga cards (tithi, nakshatra, yoga, karana)
5. Full-width panchanga meta strip (ayana, solar rashi, chandra rashi)
6. Timings
7. Rashi

District and Karnataka events remain grouped inside the existing events card.
Move the district selector inline beside the `ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು` heading and
remove any custom CSS arrow so the native select has only one dropdown arrow.

The current hero date number/weekday/month can be removed once the masthead is
redesigned. Keep only its useful metadata in the slim context card.

### Panchanga layout

The panchanga area has seven values in total: four main cards plus the three-item
meta strip. The meta strip containing `ಚಂದ್ರ ರಾಶಿ` should span the full width of
the two-column layout, with three equal columns where values are available.

### Month-view swipe

- Keep the Month tab and month grid.
- Make the month header/grid horizontally swipeable: left advances one month,
  right goes back one month.
- Keep day-cell taps distinct from swipes; a swipe starting on a day button must
  not trigger accidental selection.
- Preserve the selected date and highlight the actual today cell separately.

### Week view

- Add a seven-day vertical agenda view between Day and Month.
- Show every day one below another, with complete event names and optional places;
  do not truncate event titles in this view.
- Group each day's events into selected-district and Karnataka-wide events.
- Show range events on every covered day.
- Use a colored left border and dot for each event: vermillion for district
  events and green for Karnataka-wide events.
- Include text labels or grouped headings so meaning does not depend on color.
- Keep the week header sticky while scrolling.
- Clicking a day heading or event opens the detailed Day view.
- Swipe the week header left/right to move one week backward/forward.

### Event color coding

- District relevance uses the existing vermillion accent.
- Karnataka relevance uses the existing green accent.
- `Assumed district relevance` remains in the district group, with an optional
  subtle dotted border or `Assumed` indicator.
- Add a compact legend where event colors are first shown.
- Never use color as the only distinction; preserve headings, labels, and text.

### Wireframes

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ ‹   28  ಆಗಸ್ಟ್ 2026 · ಶುಕ್ರವಾರ                         ›  ಇಂದು │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ಪರಾಭವ ನಾಮ ಸಂವತ್ಸರ · ಶಕ 1948 · ಚೈತ್ರ–ವೈಶಾಖ              │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ಇಂದಿನ ಹಬ್ಬಗಳು / ವಿಶೇಷ ದಿನಗಳು                         ▾ │ │
│ │   ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು                         [ಜಿಲ್ಲೆ ▾] │ │
│ │   • ಕಾರ್ಯಕ್ರಮ 1   • ಕಾರ್ಯಕ್ರಮ 2   • ಕಾರ್ಯಕ್ರಮ 3          │ │
│ │   ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು                                 │ │
│ │   • ಕರ್ನಾಟಕ ಕಾರ್ಯಕ್ರಮ                                  │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────┬────────────────────────┐         │
│ │ ತಿಥಿ                   │ ನಕ್ಷತ್ರ                │         │
│ │ ಯೋಗ                   │ ಕರಣ                   │         │
│ └────────────────────────┴────────────────────────┘         │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ಆಯನ              │ ಸೂರ್ಯ ರಾಶಿ       │ ಚಂದ್ರ ರಾಶಿ       │ │
│ └──────────────────────────────────────────────────────────┘ │
│ │ ಸಮಯಗಳು — ಕಾಲ                                      ▾   │ │
│ │ ರಾಶಿ ಭವಿಷ್ಯ                                        ▾   │ │
├──────────────────────────────────────────────────────────────┤
│              [ದಿನ]   [ತಿಂಗಳು]   [ರಾಶಿ]   [ಹೆಚ್ಚು]           │
└──────────────────────────────────────────────────────────────┘
```

Mobile:

```text
┌──────────────────────────────────┐
│ ‹  28 · ಶುಕ್ರವಾರ          › ಇಂದು │  ← swipe here
│    ಆಗಸ್ಟ್ 2026                  │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │ ಪರಾಭವ · ಶಕ 1948             │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ ಇಂದಿನ ಹಬ್ಬಗಳು…          ▾   │ │
│ │ ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು [ಜಿಲ್ಲೆ▾]│ │
│ │ • ಕಾರ್ಯಕ್ರಮ                  │ │
│ │ ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು       │ │
│ │ • ಕಾರ್ಯಕ್ರಮ                  │ │
│ └──────────────────────────────┘ │
│ ┌──────────────┬──────────────┐ │
│ │ ತಿಥಿ         │ ನಕ್ಷತ್ರ      │ │
│ │ ಯೋಗ          │ ಕರಣ         │ │
│ └──────────────┴──────────────┘ │
│ ┌──────────────┬──────────────┐ │
│ │ ಆಯನ          │ ಸೂರ್ಯ ರಾಶಿ  │ │
│ │ ಚಂದ್ರ ರಾಶಿ   │              │ │
│ └──────────────┴──────────────┘ │
│        ಸಮಯಗಳು — ಕಾಲ             │
│        ರಾಶಿ ಭವಿಷ್ಯ               │
└──────────────────────────────────┘
```

## Product decisions

### District selector

- Add the canonical native, labeled district `<select>` to Settings.
- Add a direct district selector to the Week and Month toolbars.
- On Day, expose the current district as a compact header chip that opens
  Settings; keep the selector beside the district-events heading only if it does
  not duplicate the header control.
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

Load the PV JSON once and build one in-memory index used by Day, Week, Month, and Map:

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

### Phase 3 — Masthead redesign

- Remove the redundant `ನಿತ್ಯ ಪಂಚಾಂಗ` heading/brand treatment.
- Make the selected date prominent with day number, weekday, and month/year.
- Make day, weekday, and month/year visibly clickable for Day, Week, and Month.
- Add a prominent `ಇಂದು` button that returns to the actual current date.
- Add the district chip that opens Settings.

### Phase 4 — Day view cleanup

- Rename the `ಇಂದು` tab to `ದಿನ`; it must preserve the selected date.
- Remove the duplicate hero date details after the masthead is upgraded.
- Move the existing events card directly below the date-context card.
- Keep district and Karnataka events inside that existing card.
- Move the district selector beside the district-events heading when it is not
  duplicated by the header chip.
- Remove the custom select arrow and keep only the native arrow.
- Make the panchanga meta strip full width across the two-column layout.

### Phase 5 — Date persistence and district access

- Default to today only on a new browser session.
- Persist the selected date in `sessionStorage` as `pvDate`.
- Save the date after navigation, swipes, and month-cell selection.
- Add the canonical district selector to Settings and direct selectors to Week
  and Month toolbars.
- Keep the district in `sessionStorage` as `pvDistrict`.

### Phase 6 — Week view

- Add a seven-day vertical agenda with one day below another.
- Show complete event names and optional places without truncation.
- Group each day into selected-district and Karnataka-wide events.
- Show inclusive range events on every covered day.
- Use vermillion for district events and green for Karnataka-wide events, with
  text labels and a legend so color is never the only meaning.
- Make day headings and event rows open the detailed Day view.
- Keep the week header sticky while scrolling.

### Phase 7 — Header swipe navigation

- Swipe the Day header left/right to move one day.
- Swipe the Week header left/right to move one week.
- Swipe the Month header/grid left/right to move one month.
- Require a horizontal threshold of roughly 40–50px and dominant horizontal
  movement.
- Ignore gestures starting on controls and preserve vertical scrolling with
  `touch-action: pan-y`.
- Ignore swipes while data is loading and support reduced-motion behavior.

### Phase 8 — Month view

- Keep the Month tab and add a direct district selector to its toolbar.
- Show event chips or counts in date cells using the filtered event projection.
- Mark every date covered by an inclusive range.
- Keep the full date-wise agenda below the grid, listing each event once with
  its date span.
- Make every day cell open its detailed Day view.

### Phase 9 — Monthly Karnataka map

- Add the licensed district-boundary asset.
- Color districts by unique local event count for the selected month.
- Show district details on hover, click, tap, and keyboard focus.
- Keep Karnataka-wide events in a separate statewide summary.
- Provide a list/table alternative for mobile and accessibility.

### Phase 10 — Editorial and source documentation

- Update the About/source text to mention the PV event data.
- Document the local-versus-state filtering rule.
- If future editorial updates need event district metadata, extend the CSV
  contract by adding columns; do not rename existing columns.

## Files likely to change

- `app.js` — loading, indexing, filtering, date state, swipes, and view rendering
- `index.html` — masthead, view containers, selectors, agenda, and source copy
- `styles.css` — masthead, agenda, event colors, map states, responsive layout
- `app.test.js` — loader, filtering, persistence, swipe, rendering, and failure tests
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
- week ordering, full event names, day navigation, and event color labels
- date/weekday/month header navigation and Today reset behavior
- horizontal day/week/month swipes, vertical-scroll rejection, and control rejection
- map counts using unique events rather than counting each covered day as a new event
- preservation of the selected date/month after changing district

Manual verification:

1. Start the app with `serve-calendar.bat`.
2. Use `http://localhost:8000/index.html`, not `file://`.
3. Check Day, Week, Month, Rashi, and Settings with empty and populated districts.
4. Verify full event names, range events, event color labels, and clickable dates.
5. Verify header clicks, Today reset, session persistence, and day/week/month swipes.
6. Check desktop hover, keyboard focus, tap behavior, and mobile layout for the
   map once it exists.

## Out of scope for the first implementation

- Replacing panchanga, timings, or rashi data
- Automatic Kannada spelling/content correction
- Automatically guessing future unresolved dates
- Day/week map views before the monthly map proves useful
