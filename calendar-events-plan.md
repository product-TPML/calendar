# Kannada Religious and Cultural Event Calendar Plan

## Product direction

Build a Kannada religious and cultural event calendar, not a general-purpose
daily Panchanga, auspicious-timing, rashi, or horoscope app.

The product's value is helping people discover **what is happening, where, and
when**: festivals, jatres, fairs, observances, community events, and other
Kannada cultural dates.

The PV event dataset is the primary user-facing source. The existing OCR daily
records remain available as source material, but panchanga details are not a
dependency for the event calendar MVP.

## Product decisions

- Primary navigation has four items: `ದಿನ`, `ವಾರ`, `ತಿಂಗಳು`, and `ಹೆಚ್ಚು`
  (Day, Week, Month, More).
- Day, Week, and Month are event-discovery views, not separate astrology tools.
- The selected date is restored for the browser session, while reload opens on
  Day.
- The actual current date is reached only through the `ಇಂದು` control.
- District is an optional filter. The default is all-district selection plus
  Karnataka-wide events.
- Do not silently choose a home district.
- Keep no Karnataka map, backend, build step, or new dependency in this scope.
- Remove good timings, rashi, and horoscope from the primary user experience.
- Panchanga metadata may return later as an optional "day details" section; it
  is not required to render an event day.

## Core user experience

### Sticky masthead

- Show the active date, week range, or month/year in one contextual sticky
  masthead.
- Keep previous/next controls and the `ಇಂದು` button.
- The masthead must not duplicate a second large date header in the content.
- Day shows the selected date, Week shows the visible Sunday–Saturday range,
  and Month shows the visible month/year.
- Keep content and sticky toolbars below the measured masthead height.
- Use the masthead and toolbar heights, not hard-coded pixel offsets, when
  positioning content or deciding which stream period is active.

### Day view

Order the page around events:

1. Selected date context.
2. Event filter and event summary.
3. Selected-district events.
4. Karnataka-wide events.
5. Optional day details only when that feature is explicitly enabled.

Rules:

- Show event title, date/range, and optional place.
- Show an explicit empty state when no event matches the selected date/filter.
- Keep local and Karnataka-wide events grouped, but do not repeat scope labels
  on every event row.
- Keep the district selector inside the event area.
- Do not require an OCR record for the event view.
- Do not render good timings, rashi, or horoscope in the MVP.

### Mobile section access

- Keep the mobile `ವಿಭಾಗಗಳು` FAB only if the Day view has enough sections to
  justify it.
- The current event-first MVP should prefer normal scrolling unless optional
  day details create multiple long sections.
- If retained, the FAB must scroll below the measured masthead and move focus
  without causing a second scroll.

### Week view

- Show the Sunday–Saturday week containing the selected date.
- Render one outer card per week with seven clearly separated day rows.
- Do not restore a card around every day unless separators fail at real mobile
  widths.
- Each date row has a clear header band: weekday on the left, complete date on
  the right.
- Do not show inline Karnataka labels or festival counts in the date header.
- Keep event scope labels only where they clarify the actual event list.
- Show complete event names and optional places.
- Show inclusive range events on every covered date.
- Clicking a day or event opens that date in Day.
- Continuously append/prepend nearby weeks as the user scrolls.
- Update the masthead from the week whose content begins below the masthead and
  Week toolbar.
- District changes preserve the selected date and visible week.

### Month view

- Show a continuous vertical stream of month blocks.
- Keep the native district selector in the sticky Month toolbar.
- Date cells show event presence using accessible labels and, where useful,
  compact district/state indicators.
- Add the dated agenda below the grid so dots are not the only event detail.
- Group agenda rows by date and event scope.
- Show a range event on every covered date cell but only once in the agenda,
  with its complete date span.
- Every date cell opens the detailed event Day view.
- Update the masthead from the month whose block begins below the masthead and
  Month toolbar.

### More / Settings

- Keep the canonical district selector here and synchronize it with Day, Week,
  and Month.
- Keep accessibility settings such as large text and Kannada digits.
- Explain the event source and the district/state filtering rule.
- Do not use More as a dumping ground for horoscope or unrelated religious
  features.

## Event scope and presentation

- District relevance uses the existing vermillion accent.
- Karnataka-wide relevance uses the existing green accent.
- Retain text headings and accessible labels; color is never the only meaning.
- Treat `Assumed district relevance` as a district event in the interface.
- Do not expose raw editorial relevance labels to users.
- Keep the source district and relevance internally for editorial QA.
- Use visual legends only where both scopes are actually shown.

## District selector

- Use a native labelled `<select>` in Day, Week, Month, and More.
- Populate all 31 worksheet names, including districts with no events.
- Keep all selector instances synchronized through `state.district`.
- Show contextual district counts beside selector options:
  - Day: selected date.
  - Week: visible week.
  - Month: visible month.
  - More: all valid event data.
- Count each source record once, including range records, and exclude
  Karnataka-wide rows from district counts.
- Store the selection in `sessionStorage` as `pvDistrict`.
- Preserve the selected date and visible period when the district changes.

## Event data model

Load the PV JSON once and build one normalized index shared by Day, Week, and
Month:

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

Possible future field, only when editorial data supports it:

```js
eventType // festival, jatre, fair, observance, cultural, public holiday
```

Do not infer `eventType` from noisy free-form Kannada text in the MVP.

Filtering rules:

- District events are all dated records from the selected district except rows
  whose relevance is exactly `Relevant for Karnataka`.
- Karnataka-wide events are rows from any worksheet with that exact relevance.
- Render one source record at most once in a view.
- Treat `dateStart` through `dateEnd` as an inclusive interval.
- Escape titles and places with the existing `esc()` helper.
- Omit missing places instead of displaying null-like placeholders.

## Data quality

- Keep PV JSON separate from OCR daily files.
- Accept only strict, real `YYYY-MM-DD` dates.
- Validate `date_end` and require it to be on or after `date`.
- Bound range expansion so malformed data cannot create an infinite loop.
- Keep malformed, undated, reversed, or excessively long ranges out of the
  user-facing index and expose them in a QA bucket.
- Preserve raw dates and confirmed/assumed relevance for editorial review.
- Do not parse district names from event titles.
- On PV failure, show an event-data error. Do not substitute OCR events or
  fabricated data.

## Implementation phases

### Phase 1 — Event-first information architecture

- Make event discovery the primary Day experience.
- Remove good timings, rashi, and horoscope from the MVP UI.
- Keep the four-item Day/Week/Month/More navigation.
- Update product title, description, About copy, and source language to say
  Kannada religious and cultural events.

### Phase 2 — Event contract and index

- Fetch PV JSON once and cache it.
- Normalize valid single-date and range records.
- Add strict validation, bounded ranges, and a QA rejection bucket.
- Keep PV load failure explicit.
- Use one shared event index for all three event views.

### Phase 3 — Date and district state

- Restore and validate `pvDate` and `pvDistrict` in session storage.
- Default to the actual current date and Day on a new/reloaded session.
- Make `ಇಂದು` the explicit current-date action.
- Preserve the selected date and period on district changes.

### Phase 4 — Event-first Day view

- Render the selected date's event summary and grouped event lists.
- Keep the native district selector inside the event area.
- Remove the Panchanga/timings/rashi dependency from Day rendering.
- Keep an optional extension point for future day details without making it
  part of the event MVP.

### Phase 5 — Week view

- Render the continuous Sunday–Saturday event stream.
- Use one outer weekly card with separated day rows.
- Right-align complete dates in each row header.
- Omit inline Karnataka labels and festival counts from date headers.
- Keep full event titles, places, range coverage, and date navigation.
- Use measured masthead/toolbar offsets for initial positioning and period
  recognition.

### Phase 6 — Month view

- Render the continuous month stream and contextual masthead.
- Add event indicators and the dated agenda.
- Preserve range coverage and date-to-Day navigation.
- Keep the district selector contextual to the visible month.

### Phase 7 — Settings, accessibility, and QA

- Synchronize the More district selector.
- Verify keyboard focus, native selectors, large text, and reduced motion.
- Keep the mobile section FAB only if the final Day content needs it.
- Complete automated tests and manual desktop/mobile verification.

## Files likely to change

- `app.js` — event index, filtering, date/view state, rendering, navigation
- `index.html` — event-first navigation, masthead, view structure, source copy
- `styles.css` — event layout, sticky states, responsive layout, accessibility
- `app.test.js` — validation, filtering, persistence, navigation, rendering
- `data/pv-calendar-data.json` — only for intentional editorial updates
- `calendar-events-plan.md` — this product and implementation plan

No backend or build step is justified for the current 145-record dataset.

## Verification

### Automated logic tests

- valid/invalid dates and bounded range handling
- district plus Karnataka-wide filtering
- no duplicate source record rendering
- empty districts, dates, and months
- assumed district records treated as district events
- PV load failure without OCR fallback
- valid/invalid date and district restoration
- reload opens Day with the selected date and district
- Today action computes the current date at click time
- Sunday–Saturday week boundaries and navigation
- complete Week event names and date-to-Day navigation
- Week date alignment and absence of inline festival counts
- Month indicators and grouped agenda contents
- range events on every covered date but once in the agenda
- district changes preserve date and visible period

### Manual browser verification

1. Start with `serve-calendar.bat`.
2. Use `http://localhost:8000/index.html`, not `file://`.
3. Check Day, Week, Month, and More at mobile and desktop widths.
4. Confirm the event-first Day view does not require OCR data.
5. Confirm Week dates are right-aligned and date rows are clearly separated.
6. Confirm Week date headers do not show Karnataka labels or festival counts.
7. Confirm Month indicators, agenda ranges, and date navigation.
8. Verify district filtering, empty states, and PV load failure.
9. Verify sticky masthead content never hides the first visible toolbar or date.
10. Verify keyboard navigation, large text, reduced motion, and touch scrolling.

## Out of scope for the event MVP

- Good timings / auspicious-time recommendations
- Rashi and horoscope content
- A standalone Panchanga product experience
- Karnataka map view
- A backend or build pipeline
- Automatic Kannada spelling or event-type classification
- Guessing unresolved or malformed dates
