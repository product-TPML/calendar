# Calendar Event Integration Plan

## Goal

Use `data/pv-calendar-data.json` as the user-facing event source while keeping
the existing OCR records as the required source for the detailed Day view,
including panchanga, timings, and rashi data.

This replaces the event display, not the complete daily OCR record.

## Locked product decisions

- The primary navigation has four items: `ದಿನ`, `ವಾರ`, `ತಿಂಗಳು`, and `ಹೆಚ್ಚು`
  (Day, Week, Month, More).
- Week replaces the standalone Rashi tab in the bottom navigation.
- Rashi remains available as a collapsible section inside Day; there is no
  separate top-level Rashi view.
- There is no Karnataka map view in this scope.
- Day depends on its OCR record. If the selected date has no usable OCR record,
  show the Day as unavailable rather than rendering a partial Day screen.
- Week and Month use the PV event index and do not preload OCR records for every
  date they display.
- On reload, restore the selected date and district for the browser session, but
  open on Day.

## UI and navigation redesign

### Date-wise home behavior

- Day represents the currently selected date, not always today.
- On a new browser session, default to the actual current date.
- Persist the selected date in `sessionStorage` as `pvDate` using
  `DD-MM-YYYY`.
- Validate a restored `pvDate`; fall back to the actual current date if it is
  missing or invalid.
- Save the selected date after arrow navigation, week/month navigation,
  month-cell selection, event/day selection, and swipes.
- The `ಇಂದು` button is the only explicit jump to the actual current date.
  Compute today when the button is pressed, then open Day.
- Selecting the Day tab must preserve the selected date; it must not reset to
  today.
- Persist the district in `sessionStorage` as `pvDistrict`. If the saved value
  does not match a current worksheet, reset to `Select district` / state-only.
- Do not persist the active tab. A reload opens Day using the restored date and
  district.

### Bottom navigation

Use four primary items:

1. `ದಿನ` — Day
2. `ವಾರ` — Week
3. `ತಿಂಗಳು` — Month
4. `ಹೆಚ್ಚು` — More / Settings

Rashi is not a bottom-navigation destination. It remains a section in Day and
is reachable through normal scrolling and the Day section-jump control.

### Masthead

- Remove the redundant `ನಿತ್ಯ ಪಂಚಾಂಗ` heading/brand treatment.
- Make the selected date the visual focus: large day number with weekday and
  month/year stacked beside it.
- Keep previous/next day controls and add a prominent `ಇಂದು` button.
- Do not turn day number, weekday, and month/year into separate view-navigation
  buttons. Day, Week, and Month are selected through the bottom navigation.
- Make the date area horizontally swipeable: left advances one day and right
  goes back one day.
- Require at least 48px horizontal movement and horizontal dominance over
  vertical movement.
- Ignore gestures starting on buttons, links, selects, inputs, or other
  controls, and preserve vertical scrolling with `touch-action: pan-y`.

### Day-view order

1. Prominent masthead date
2. Slim date-context card with samvatsara, shaka year, and month names
3. Events card
4. Panchanga cards: tithi, nakshatra, yoga, and karana
5. Full-width panchanga meta strip: ayana, solar rashi, and chandra rashi
6. Timings
7. Collapsible Rashi section

District and Karnataka-wide events remain grouped inside the events card. Put a
native district selector inline beside the `ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು` heading and
remove the custom CSS arrow so the native select has only one dropdown arrow.

Remove the current duplicate hero date number/weekday/month after the masthead
is redesigned. Keep its useful calendar metadata in the slim context card.

If the selected date's OCR record is unavailable, retain the masthead and show
a clear Day-unavailable state. Do not fabricate, borrow, or merge another date's
OCR data.

### Day section-jump control

Add a mobile-only floating action button above the bottom navigation for quick
section access. It is a section jumper, not continuous automatic scrolling.

- Hide it at the top of Day and reveal it after approximately one viewport of
  vertical scrolling.
- Label it `ವಿಭಾಗಗಳು` and use a list/navigation icon; do not use an ambiguous
  down arrow.
- Tapping it opens a small sheet or menu with:
  - `ಹಬ್ಬಗಳು` — Events
  - `ಪಂಚಾಂಗ`
  - `ಸಮಯಗಳು` — Timings
  - `ರಾಶಿ ಭವಿಷ್ಯ`
  - `ಮೇಲಕ್ಕೆ` — Back to top
- Selecting an item smoothly scrolls to that section and moves keyboard focus
  to the section heading.
- Respect `prefers-reduced-motion` by jumping without animation.
- Keep the control clear of the bottom navigation and safe-area inset.
- Do not show this FAB on desktop.

### Panchanga layout

The panchanga area has seven values: four main cards plus the three-item meta
strip. The meta strip should span the full width of the two-column layout, with
equal columns for the available values.

### Week view

- Add Week as the second bottom-navigation destination, between Day and Month.
- Use Sunday through Saturday, matching the existing Month grid.
- Opening Week shows the seven-day week containing the selected date.
- Show every day vertically, with complete event names and optional places; do
  not truncate event titles.
- Group each day's events into selected-district and Karnataka-wide sections.
- Show an inclusive range event on every covered day.
- Use a vermillion left border and dot for district events and green for
  Karnataka-wide events.
- Preserve grouped headings and text labels so meaning never depends on color.
- Keep the week header sticky while scrolling.
- Clicking a day heading or event selects that date and opens Day.
- Swipe the week header left/right to move exactly one seven-day week backward
  or forward while retaining the same weekday as the selected date.
- Changing the district must not change the selected date or displayed week.

### Month view

- Keep the existing Month tab and grid.
- Add a direct native district selector to the Month toolbar.
- Make the month header/grid horizontally swipeable: left advances one month
  and right goes back one month.
- Keep day-cell taps distinct from swipes; a swipe starting on a day button must
  not trigger accidental selection.
- Preserve the selected date and highlight the actual today cell separately.
- Do not preload the month's OCR daily files. Month markers and agenda content
  come from the shared PV event index.
- Use two possible presence dots in each date cell:
  - Vermillion dot: one or more selected-district events
  - Green dot: one or more Karnataka-wide events
- Both dots may appear on the same date. Do not put event counts in the date
  cells.
- Add a dated agenda below the grid so details are not hidden behind dots.
- Group agenda events by date and then by selected-district/Karnataka-wide scope.
- Show event title and optional place; omit missing places.
- Show a range event on every covered date cell but only once in the monthly
  agenda, with its complete date span.
- Make every day cell open its detailed Day view.

### Event color coding

- District relevance uses the existing vermillion accent.
- Karnataka relevance uses the existing green accent.
- Treat `Assumed district relevance` like other district events in the
  user-facing interface. Do not show an `Assumed` badge or raw relevance label
  to users.
- Preserve assumed/confirmed relevance internally for editorial review and QA.
- Add a compact legend where the two event colors are first shown.
- Never use color as the only distinction; retain headings, labels, and text.

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
│ │ ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು                           [ಜಿಲ್ಲೆ ▾] │ │
│ │ • ಕಾರ್ಯಕ್ರಮ                                              │ │
│ │ ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು                                   │ │
│ │ • ಕಾರ್ಯಕ್ರಮ                                              │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────┬────────────────────────┐         │
│ │ ತಿಥಿ                   │ ನಕ್ಷತ್ರ                │         │
│ │ ಯೋಗ                    │ ಕರಣ                    │         │
│ └────────────────────────┴────────────────────────┘         │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ಆಯನ              │ ಸೂರ್ಯ ರಾಶಿ       │ ಚಂದ್ರ ರಾಶಿ       │ │
│ └──────────────────────────────────────────────────────────┘ │
│ │ ಸಮಯಗಳು — ಕಾಲ                                      ▾   │ │
│ │ ರಾಶಿ ಭವಿಷ್ಯ                                        ▾   │ │
├──────────────────────────────────────────────────────────────┤
│              [ದಿನ]   [ವಾರ]   [ತಿಂಗಳು]   [ಹೆಚ್ಚು]            │
└──────────────────────────────────────────────────────────────┘
```

Mobile Day after scrolling:

```text
┌──────────────────────────────────┐
│ ‹  28 · ಶುಕ್ರವಾರ          › ಇಂದು │
│    ಆಗಸ್ಟ್ 2026                  │
├──────────────────────────────────┤
│                                  │
│        Day sections              │
│                                  │
│                       [ವಿಭಾಗಗಳು] │
├──────────────────────────────────┤
│    ದಿನ      ವಾರ     ತಿಂಗಳು  ಹೆಚ್ಚು │
└──────────────────────────────────┘
```

## District selector

- Use a native, labelled district `<select>` in the Day events heading and the
  Week and Month toolbars.
- Also expose the same canonical setting under More / Settings, but do not add
  a separate district chip that only redirects users to Settings.
- Populate every selector from all 31 worksheet names, including districts with
  no events.
- Keep all selector instances synchronized through `state.district`.
- Store the selection in `sessionStorage` as `pvDistrict`.
- Default to `Select district` / state-only rather than silently choosing a
  district.
- Preserve the selected date, week, and month when the district changes.
- Show two event sections:
  - Selected district events
  - Karnataka-wide events
- Include assumed district records in the selected-district section without
  exposing the raw relevance value.
- Show an explicit empty state when either section has no events.

## Event data model

Load the PV JSON once and build one in-memory index used by Day, Week, and Month:

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
- `date_end` is the optional inclusive end date. When absent, `dateEnd` equals
  `dateStart`.
- Keep `rawDate` only in the in-memory model or QA output; do not display it as
  user-facing copy.

Filtering rules:

- `localEvents`: all dated rows from the selected district worksheet except
  records whose relevance is exactly `Relevant for Karnataka`. This includes
  assumed district relevance.
- `stateEvents`: rows from any worksheet whose relevance is exactly
  `Relevant for Karnataka`.
- Render one source record at most once in a view.
- Treat `dateStart` through `dateEnd` as an inclusive interval for Day, Week,
  and Month filtering.
- Keep the source district internally for traceability.
- Escape titles and places with the existing `esc()` helper.

Do not parse district names out of free-form Kannada event text. The worksheet
is the reliable district assignment; text parsing would inherit OCR errors.

## Data and date handling

- Keep the PV JSON separate from
  `ocr-zones/<DD-MM-YYYY>/structured-ocr.json`.
- Accept event dates only as strict, real calendar dates in `YYYY-MM-DD` format.
- Validate `date_end` using the same rule and require it to be on or after
  `date`.
- Bound range expansion so a malformed future record cannot create an infinite
  loop or freeze the application.
- Keep malformed, undated, reversed, or unexpectedly long ranges out of the
  user-facing index and expose them in a review/QA bucket.
- Normalize valid dates to string keys. Do not use `new Date("YYYY-MM-DD")`,
  which can introduce timezone shifts.
- A range event appears on every covered Day/Week/date cell but only once in the
  monthly agenda with its date span.
- The current JSON has two ranges: `2026-09-01`–`2026-09-11` and
  `2026-09-08`–`2026-09-14`.
- The two formerly empty Bidar dates were filled by carrying forward the
  immediately preceding dates; retain them as editorial assumptions.
- Preserve confirmed versus assumed district relevance internally.
- Keep the current 145 records and all 31 worksheet names intact.

## Implementation phases

### Phase 1 — Data contract and validation

- Implement strict ISO date validation and real-calendar-date checking.
- Require every `date_end` to be on or after `date`.
- Add a maximum range guard and a QA bucket for rejected records.
- Add focused fixtures for single dates, inclusive ranges, malformed dates,
  reversed ranges, unexpectedly long ranges, and null dates.

### Phase 2 — Shared event index and navigation state

- Fetch the PV JSON once and cache it in `app.js`.
- Build the normalized event index and date lookup used by Day, Week, and Month.
- Keep PV load failure explicit; do not substitute OCR events, fabricated data,
  or stale event data.
- Add validated `pvDate` and `pvDistrict` session restoration.
- Default the active view to Day after a reload.
- Remove Month's OCR preloading; fetch an OCR record only when a detailed Day
  view needs it.

### Phase 3 — Masthead and Day redesign

- Remove the redundant brand treatment and duplicate hero date.
- Make the selected date prominent and add the actual-today button.
- Rename the Today tab to Day and make it preserve the selected date.
- Replace the standalone Rashi view/tab with Week in the bottom navigation.
- Keep Rashi as a collapsible Day section.
- Move the events card below the date-context card.
- Put the native district selector beside the district-events heading.
- Make the panchanga meta strip full width.

### Phase 4 — Week view

- Add the Sunday–Saturday agenda containing the selected date.
- Add grouped district and Karnataka-wide events with full, untruncated names.
- Show inclusive range events on every covered day.
- Make day headings and event rows select the date and open Day.
- Keep the Week header sticky.
- Add the direct district selector to the Week toolbar.

### Phase 5 — Month view

- Add the direct district selector to the Month toolbar.
- Add vermillion and green presence dots to date cells.
- Mark every date covered by an inclusive range.
- Add the grouped date-wise agenda and list each range only once with its span.
- Make every day cell select the date and open Day.

### Phase 6 — Gesture and quick-navigation behavior

- Add 48px, horizontally dominant Day, Week, and Month swipes.
- Ignore gestures starting on controls and preserve vertical scrolling.
- Ignore swipes while required data is loading.
- Add the mobile Day `ವಿಭಾಗಗಳು` section-jump FAB and reduced-motion behavior.
- Move keyboard focus to the destination heading after a section jump.

### Phase 7 — Settings, source documentation, and final QA

- Add the synchronized district selector to Settings.
- Update About/source text to mention both PV event data and OCR daily data.
- Document the local-versus-state filtering rule.
- If future editorial updates require additional district metadata, add CSV
  columns without renaming existing columns.
- Complete automated logic tests and manual browser verification.

## Files likely to change

- `app.js` — loading, validation, indexing, filtering, date/view state, swipes,
  section jumping, and rendering
- `index.html` — masthead, Week view, navigation, selectors, agenda, FAB, and
  source copy
- `styles.css` — masthead, agenda, event colors, FAB, sticky states, responsive
  layout, and reduced-motion behavior
- `app.test.js` — loader, validation, filtering, persistence, navigation, and
  rendering tests
- `data/pv-calendar-data.json` — only when editorial data is intentionally
  updated

No backend or build step is justified for the current 145-record dataset.

## Verification

### Automated logic tests

- strict valid/invalid date handling and bounded range expansion
- selected district plus Karnataka-wide filtering
- no source record rendered twice in one view
- empty districts and empty months
- assumed district records treated as district events without a user-facing
  assumption label
- single dates, inclusive ranges, malformed dates, reversed ranges, and null
  dates
- PV load failure
- valid/invalid `pvDate` and `pvDistrict` restoration
- reload opens Day while retaining the valid selected date and district
- Today button computes the current date at click time and opens Day
- Day tab preserves the selected date
- Sunday–Saturday week boundaries, ordering, and seven-day navigation
- complete Week event names and date-to-Day navigation
- Month scope dots and grouped agenda contents
- range events appearing on every covered date but only once in the Month agenda
- preservation of selected date/week/month after changing district

### Manual browser verification

1. Start the app with `serve-calendar.bat`.
2. Use `http://localhost:8000/index.html`, not `file://`.
3. Check Day, Week, Month, and Settings with empty and populated districts.
4. Confirm the bottom navigation is Day, Week, Month, More and there is no
   standalone Rashi tab.
5. Confirm Rashi remains accessible inside Day and through the section-jump FAB.
6. Verify full event names, range events, scope colors/labels, and clickable
   dates.
7. Verify Today reset, session restoration, and day/week/month swipes.
8. Test vertical-scroll rejection and gestures starting on controls on real
   touch devices.
9. Test the mobile FAB appearance threshold, menu, safe-area clearance, focus
   movement, and reduced-motion behavior.
10. Verify desktop and mobile layouts, sticky Week header, keyboard navigation,
    and native district selectors.

## Out of scope

- Any Karnataka map view
- A standalone top-level Rashi view or bottom-navigation item
- Replacing the OCR panchanga, timings, or rashi source
- Automatic Kannada spelling/content correction
- Automatically guessing unresolved or malformed dates
