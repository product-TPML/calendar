# Events and notices: from Google Sheets to the site

How district events and utility notices (power cut, water supply, public work, railway) should travel from editorial's Google Sheets to the calendar. This is a plan. Nothing in it is built yet; see [Not built yet](#not-built-yet).

## The flow

```
Bureau reporter
   │  fills a Google Form
   ▼
Google Sheet (private)              one spreadsheet for events, one for notices
   │  router script copies each response to its district tab;
   │  the bureau edits or cancels rows there
   ▼
Daily build on Cloudflare Pages     also started by "Publish now" in the sheet
   │  reads the district tabs, keeps active rows and reader-facing columns
   ▼
JSON files on Cloudflare Pages      events.json, utility-notices.json
   │  plain static files
   ▼
Calendar app on the CMS             fetches the JSON when a reader opens it
```

Three properties this gives:

- **The sheets stay private.** Only the build reads them. Reporter emails, the `Edit Access` tab, edit history and cancelled rows never leave Google.
- **Readers never reach Google or GitHub.** They download a static file from Cloudflare.
- **Reader traffic cannot use up a quota.** See [Limits](#limits).

What the site displays is public by definition. The design controls which fields are published, not whether published fields can be seen.

## The two spreadsheets

Both use the same setup: a Google Form feeding `Form Responses 1`, with `google-form/PV_District_Response_Router.gs` copying each response to its district tab.

Tabs in each spreadsheet:

- `Form Responses 1`
- `Edit Access` (District | Office Email Address | Bureau Chief)
- The 31 district tabs
- `Routing Log`
- `Unmapped`

The router adds these columns to each district tab: `_Source Row`, `Cancellation Status` (Active or Cancelled), `Edit Count`, `Last Edited By`, `Last Edited At`, `Edit History`.

The build reads the district tabs, not `Form Responses 1`, so bureau edits and cancellations are respected.

### Events spreadsheet (exists)

Form columns, from the copy of the responses workbook dated 24 September. Check them against the live sheet before building.

| Column | Published | Notes |
|---|---|---|
| Timestamp | No | |
| Email Address | No | |
| District | Yes | |
| Date of the event | Yes | |
| Time of the event | Yes | |
| Name of the Calendar event | Yes | |
| Description of the Calendar event | Yes | |
| Event Venue Name | Yes | |
| Google location link | Yes | |
| Relevance of event | Yes | |
| Local place name | Yes | |
| Editorial Text | No | Built by a formula for print |
| Router columns | No | Rows marked Cancelled are left out |

**The form does not feed the site today.** The site's district events come from `data/pv-calendar-data.json`, which was made from a separate workbook, `data/PV Calendar data.xlsx` (date, festival name, place, relevance). Nothing in the repo turns form responses into site data. For events, this flow connects the form to the site for the first time.

### Notices spreadsheet (to be created)

One notice per submission.

| Question | Google Forms type | Required | Notes |
|---|---|---|---|
| District | Dropdown | Yes | The same 31 names as the events form |
| Category | Dropdown | Yes | Power Cut, Water Supply, Public Work, Railway |
| Type | Dropdown | No | Road closure, Train cancelled, Train partly cancelled, Train delayed, Special train extended, Temporary halt |
| Date from | Date | Yes | |
| Date to | Date | No | Blank means a single day |
| Specific dates | Short answer with a pattern check | No | Only for scattered dates, typed as `12-10-2026, 14-10-2026` |
| Time from | Time | No | |
| Time to | Time | No | |
| Notice text | Paragraph, about 2,500 characters at most | Yes | The notice only, in Kannada |
| Areas affected | Paragraph | No | Becomes the part behind "ಪೂರ್ತಿ ಓದಿ" |
| Also show in | Checkboxes (the 31 districts) | No | For notices that span districts, mainly railway |
| Article link | Short answer, validation "Text is URL" | No | Lets the site link to the full story |

Everything except Timestamp, Email Address and the router columns is published. Rows marked Cancelled are left out; "Cancelled" doubles as "notice withdrawn".

#### Why a form, not the sheet editorial first sent

The first sheet (`PV Calendar Utility Data.xlsx`) had one row per district and one column per category. It could not be imported:

- Several notices, and unrelated stories, pasted into one cell.
- One date column for a whole row, though notices in the same row had different dates.
- Dates stored month-first: three cells showing `12-10-2026` held 10 December, while the notices said 12 October.
- Rows with no date, or only "Saturday".
- District names spelt differently from the site's.
- Railway notices filed under the bureau that sent them, not the districts they affect.

A cleaned version is on the `Notices` sheet of that workbook.

#### Where Google Forms needs a workaround

- **Type depending on Category.** Forms has no dependent dropdowns. A section per category would put each section's Type in its own column. Use one Type dropdown with all the options and leave it optional.
- **Specific dates.** A date question takes one date. Use short answer with a pattern check.
- **Article link.** There is no URL question type. Use short answer with response validation set to "Text is URL".
- **Date order.** Forms cannot check that "Date to" is not before "Date from". The build has to catch that.
- **Pasted stories.** Forms cannot stop someone pasting an unrelated story into the notice field. The character cap and a line of help text reduce it. The bureau's edit rights on its district tab are the backstop.

#### Settings to get right

- **Question titles must start with the English word.** The router finds columns by header prefix, as it does for "District.  ಜಿಲ್ಲೆ". It formats any column whose header starts with "Date" or "Time", so "Date from  ಆರಂಭ ದಿನಾಂಕ" works and "Start date" does not.
- **Set the spreadsheet's locale to India.** Dates then display day-first, and an editor who retypes a date on a district tab gets the day they meant.
- **Cap the notice text length.** About 2,500 characters fits the longest real notice received so far (roughly 1,800).

#### Router changes for notices

- There is no Editorial Text column. The router only writes that formula when the column exists, so it skips it.
- The "Editorial text for a date" sidebar in the menu needs removing or adapting.

## The daily build

A small Cloudflare Pages project holds only the data files. Each build:

1. Reads the district tabs of both spreadsheets.
2. Drops rows marked Cancelled and columns not meant for readers.
3. Applies the rules below.
4. Publishes `events.json` and `utility-notices.json`.

A scheduled trigger starts the build once a day.

**Publish now.** Power cuts are often announced the evening before or the same morning, so a notice filed after the daily run would miss its day. A "Publish now" item in each sheet's menu starts the same build.

### How the build reads a private sheet

Two options. Either way the credential is an encrypted setting in the Cloudflare project, never in the page or the JSON.

1. **A Google service account** with view-only access to the two spreadsheets. The cleanest option. It needs a Google Cloud project, which the Workspace admin may have to allow.
2. **A small Apps Script endpoint** that returns the filtered JSON only when called with a key. No Cloud project needed. The script must be a standalone one owned by the administrator, not attached to the spreadsheet: bureau reporters are editors of the spreadsheet, and editors can open an attached script and read its stored keys.

The same caution applies to "Publish now": if the address that starts a build is stored in a script attached to the spreadsheet, every editor can read it. It can only start builds, so the worst case is using up the monthly build allowance.

### Rules the build applies

Both files:

- Rename "Bengaluru South (formerly Ramanagara)", the router's name, to "Bengaluru South (Ramanagara)", the site's name.
- Leave out rows marked Cancelled.

Events:

- Change the relevance value "Whole of Karnataka" to the site's "Relevant for Karnataka".

Notices:

- Join "Notice text" and "Areas affected" with a blank line.
- Repeat a notice under each district ticked in "Also show in".
- Skip or flag rows where "Date to" is before "Date from".

### File shapes

Events, in the shape the site already reads, with the form's extra fields added:

```json
{
  "sheets": {
    "Mysuru": [
      {
        "date": "2026-10-20",
        "name_of_festival": "Event name",
        "place": "Local place name",
        "relevance": "Assumed district relevance",
        "time": "18:30",
        "description": "Description",
        "venue": "Venue name",
        "map_link": "https://maps.app.goo.gl/..."
      }
    ]
  }
}
```

Notices, in the shape the site already reads:

```json
{
  "districts": {
    "Mysuru": [
      {
        "category": "Power Cut",
        "type": "",
        "start": "2026-10-12",
        "end": "2026-10-12",
        "dates": [],
        "time": "10:00-17:00",
        "text": "First paragraph.\n\nAreas affected."
      }
    ]
  }
}
```

- `category` is one of Power Cut, Water Supply, Public Work, Railway.
- `start` and `end` are `YYYY-MM-DD`. A missing `end` means a single day.
- `dates` lists the active days when the notice is not every day from `start` to `end`. Otherwise it is empty.
- `time` is `HH:MM-HH:MM`, or empty.
- `text` paragraphs are separated by a blank line. The site shows the first and puts the rest behind "ಪೂರ್ತಿ ಓದಿ".

## The site on the CMS

The calendar app will be served from the CMS, and the data from Cloudflare Pages. That is two domains, which needs:

- **Cross-site permission.** The Pages project sends a header naming the site's domain as allowed. One config file.
- **CMS security policy.** Some CMS platforms restrict which domains a page's scripts may contact. Not checked yet; ask the CMS provider whether a fetch to the Pages domain is allowed.
- **A data address in the app.** The app loads data from its own `data/` folder today. It needs a setting for where the data lives.
- **A short cache time on the JSON,** about ten minutes, so an update reaches readers promptly.

The Panchanga files and `calendar-events.json` could move to the same Pages project, so all the app's data comes from one place.

## Limits

| Where | Limit | Use in this flow |
|---|---|---|
| Readers downloading the JSON | Cloudflare does not count requests for static files on Pages against a quota | Any number of readers |
| Cloudflare Pages builds | 500 a month on the free plan | About 30 a month, plus "Publish now" |
| Google | Per-minute and per-day caps on reading a sheet | One read per spreadsheet per build |
| GitHub | Not in a reader's path | Stores the code for the data project |

No Cloudflare Worker runs when a reader loads the page, so the free plan's 100,000 Worker requests a day does not apply.

The build and Worker numbers were read from Cloudflare's limits pages on 12 October 2026. Check the current figures before launch, in particular that static file requests are still uncounted.

## Open decisions

1. **The 145 events already on the site** came from the old workbook, not the form.
   - **Keep both (recommended):** the build publishes form events, and the app merges them with the existing file. Nothing disappears on day one.
   - **Move them into the form sheet** once, so the sheet is the single source. Cleaner in the long run, but the rows have to be imported.
2. **How the build reads the sheets:** service account or keyed Apps Script endpoint.
3. **Whether the app shows the extra event fields** (time, description, map link). Event cards show only name and place today.

## Setup steps

Steps marked "to be written" need code that does not exist yet. The rest need the Google, Cloudflare and CMS accounts.

Settle the three [open decisions](#open-decisions) first. The steps assume a Google service account; the fallback is a keyed Apps Script endpoint if the Workspace admin will not allow a Cloud project.

### A. The notices spreadsheet

1. Create a new blank spreadsheet. Open Extensions > Apps Script, paste `google-form/PV_Notices_Form_Builder.gs` and `google-form/PV_Notices_Response_Router.gs` as two files, and run `createNoticesForm`. It builds the form from the table under [Notices spreadsheet](#notices-spreadsheet-to-be-created) and links it to the spreadsheet.
2. Set the spreadsheet's locale to India (File > Settings).
3. Copy the `Edit Access` tab across from the events spreadsheet.
4. Run `setupDistrictRouting` (menu: District Routing > Run complete setup).
5. Submit one test notice and confirm it lands on the right district tab.

### B. Read access for the build

6. In Google Cloud Console, create a project and enable the Google Sheets API.
7. Create a service account in that project and download its JSON key.
8. Share both spreadsheets (events and notices) with the service account's email address as Viewer.

### C. The data project on Cloudflare

9. Create a new GitHub repository for the data project. It holds the build script and a headers file (both to be written).
10. In the Cloudflare dashboard, create a Pages project connected to that repository, with the build command and output folder the build script needs.
11. Add the project's encrypted settings: the service account key, the two spreadsheet IDs, and the site's domain.
12. Run the first build, then open the published `utility-notices.json` and `events.json` in a browser. Check that the data is right and that no email addresses or edit history appear.
13. Create a deploy hook in the project's build settings and copy its address.

### D. The daily run and "Publish now"

14. Create a standalone Apps Script, owned by the administrator and not attached to either spreadsheet, with a daily timer that calls the deploy hook (to be written).
15. Add a "Publish now" menu item to both router scripts that calls the same hook (to be written).

### E. The app

16. Change the app to load its data from a configurable address and to read events from the new file (to be written).
17. Ask the CMS provider whether pages may fetch from the Cloudflare Pages domain, and have it allowed if not.
18. Publish the app on the CMS with the data address set to the Pages project.
19. Test end to end: submit a notice, press "Publish now", and confirm it appears on the site within about ten minutes. Cancel it on the district tab, publish again, and confirm it disappears.
20. Turn the dummy-notices default off.

### Order that avoids rework

Part A can start straight away, since it only needs the form. Parts B to D can be built and tested against the existing events sheet before the notices form has real data. Part E comes last, because it depends on the CMS answer in step 17.

## Not built yet

- Running the notices form builder and router in a real spreadsheet (the scripts are written, untested in Google).
- The Cloudflare Pages data project, its build script, the daily trigger and "Publish now".
- The credential for reading the sheets.
- The app's data-address setting, and reading events from the new file.
- Site support for the article link and "Also show in". "ಪೂರ್ತಿ ಓದಿ" only expands the text in place today.

Until then the site shows made-up notices from `data/utility-notices.dummy.json`, on by default, covering 12 to 26 October 2026.
