/* Focused event-calendar test for app.js:
   - PV data is the only Day data source
   - Events mode works without Panchanga files; Panchanga loads its data lazily and never touches OCR
   - district and Karnataka-wide filtering stays correct
   - date ranges are inclusive
   - Week and Month retain the shared event index
   - PV failure is explicit
   Run (from the repo root): node tests/app.test.js */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function makeEl(id) {
  const el = {
    id: id || "", innerHTML: "", textContent: "", hidden: false,
    checked: false, value: "", dataset: {}, children: [], _handlers: {},
    addEventListener(type, cb) { (el._handlers[type] = el._handlers[type] || []).push(cb); },
    click(type) { ((type ? el._handlers[type] : el._handlers.click) || []).forEach((cb) => cb()); },
    appendChild(child) { el.children.push(child); }, querySelectorAll() { return []; },
    classList: { toggle() {} }, setAttribute() {}, removeAttribute() {},
  };
  return el;
}

const toolbarEls = [0, 1].map(() => ({ hidden: false, classList: { toggle(name, on) { this.owner.hidden = !!on; } } }));
toolbarEls.forEach((bar) => { bar.classList.owner = bar; });
const els = {}, tabEls = {}, viewIds = ["viewDay", "viewWeek", "viewMonth", "viewMore"];
const documentStub = {
  title: "", _init: null,
  addEventListener(type, cb) { if (type === "DOMContentLoaded") documentStub._init = cb; },
  getElementById(id) { return (els[id] = els[id] || makeEl(id)); },
  createElement(tag) { return { tagName: tag, value: "", textContent: "" }; },
  querySelectorAll(selector) {
    if (selector === ".tab") return ["day", "week", "month", "more"].map((name) => {
      const tab = tabEls[name] || (tabEls[name] = makeEl("tab-" + name));
      tab.dataset.tab = name;
      return tab;
    });
    if (selector === ".view") return viewIds.map((id) => documentStub.getElementById(id));
    if (selector === ".stream-toolbar") return toolbarEls;
    return [];
  },
  querySelector() { return { scrollTop: 0 }; },
};

const calls = [], pending = {};
function fetchStub(url) {
  calls.push(url);
  return new Promise((resolve) => { pending[url] = resolve; });
}
global.document = documentStub;
const scrollHandlers = [];
global.window = { scrollY: 0, scrollTo() {}, addEventListener(type, cb) { if (type === "scroll") scrollHandlers.push(cb); } };
global.fetch = fetchStub;

const sessionStore = {};
global.sessionStorage = {
  getItem(k) { return k in sessionStore ? sessionStore[k] : null; },
  setItem(k, v) { sessionStore[k] = String(v); },
  removeItem(k) { delete sessionStore[k]; },
};

const localStore = {};
global.localStorage = {
  getItem(k) { return k in localStore ? localStore[k] : null; },
  setItem(k, v) { localStore[k] = String(v); },
  removeItem(k) { delete localStore[k]; },
};

const APP_PATH = path.join(__dirname, "..", "app.js");
vm.runInThisContext(fs.readFileSync(APP_PATH, "utf8"), { filename: APP_PATH });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function resolveUrl(url, data) {
  const done = pending[url];
  if (!done) throw new Error("no pending fetch for " + url);
  delete pending[url];
  done({ ok: true, status: 200, json: () => Promise.resolve(data) });
}
function failUrl(url) {
  const done = pending[url];
  if (!done) throw new Error("no pending fetch for " + url);
  delete pending[url];
  done({ ok: false, status: 404, json: () => Promise.reject(new Error("404")) });
}
function count(url) { return calls.filter((c) => c === url).length; }
function sectionBody(html, id) {
  const start = html.indexOf('id="' + id + '"');
  if (start < 0) return "";
  const end = html.indexOf("</section>", start);
  return html.slice(start, end < 0 ? html.length : end);
}
function dayKey(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
}
function iso(key) { const p = key.split("-"); return p[2] + "-" + p[1] + "-" + p[0]; }
const INITIAL = dayKey(0), NEXT = dayKey(1), DAY2 = dayKey(2), DAY3 = dayKey(3), DAY8 = dayKey(8);

function mkPV() {
  const sheets = { Bagalkot: [], Ballari: [], "Bengaluru Urban": [] };
  [INITIAL, NEXT, DAY2, DAY3].forEach((key) => {
    sheets.Bagalkot.push({ date: iso(key), name_of_festival: "PV-Bagalkot-" + key, place: "ರಬಕವಿ", relevance: "Assumed district relevance" });
  });
  sheets.Bagalkot.push({ date: iso(INITIAL), date_end: iso(DAY2), name_of_festival: "PV-Range", place: "ಇಳಕಲ್", relevance: "Assumed district relevance" });
  sheets.Bagalkot.push({ date: iso(INITIAL), name_of_festival: "PV-Karnataka-" + INITIAL, place: "", relevance: "Relevant for Karnataka" });
  sheets.Ballari.push({ date: iso(INITIAL), name_of_festival: "PV-Ballari-" + INITIAL, place: "ಹೊಸಪೇಟೆ", relevance: "Relevant for District" });
  return { sheets };
}
function mkCultural() {
  return { records: [
    { date: iso(INITIAL), title: "Cultural-Bagalkot-" + INITIAL, location: "ರಬಕವಿ", startTime: "18:30", source: { edition: "Bagalkot", articleId: "culture-1", siteUrl: "https://example.test/culture-1" } },
    { date: iso(NEXT), title: "Cultural-Bagalkot-" + NEXT, location: "ಇಳಕಲ್", startTime: "19:00", source: { edition: "Bagalkot", articleId: "culture-2", siteUrl: "https://example.test/culture-2" } },
    { date: iso(INITIAL), title: "Cultural-Bengaluru-" + INITIAL, location: "ಬೆಂಗಳೂರು", startTime: "20:00", source: { edition: "Bengaluru Urban", articleId: "culture-3", siteUrl: "https://example.test/culture-3" } }
  ] };
}
function dayOfYear(key) {
  const p = key.split("-");
  return Math.round((Date.UTC(+p[2], +p[1] - 1, +p[0]) - Date.UTC(+p[2], 0, 1)) / 864e5);
}
function mkPanCore() {
  const days = {};
  days[DAY8] = {
    tithi: { name: "ತದಿಗೆ", ends: 8.52 }, nakshatra: { name: "ರೇವತಿ", ends: 27.24 },
    paksha: "ಕೃಷ್ಣ", ayana: "ದಕ್ಷಿಣಾಯನ", solarRashi: "ಸಿಂಹ", chandraRashi: "ಮೀನ",
    months: ["ಶ್ರಾವಣ", "ಭಾದ್ರಪದ"], samvatsara: "ಪರಾಭವ", shakaYear: 1948
  };
  return {
    defaultDistrict: "Bengaluru Urban",
    districts: { Bagalkot: "bagalkot", "Bengaluru Urban": "bengaluru-urban", Ballari: "ballari" },
    yogaNames: Array.from({ length: 27 }, (_, i) => "ಯೋಗ" + (i + 1)),
    karanaNames: Array.from({ length: 60 }, (_, i) => "ಕರಣ" + (i + 1)),
    days
  };
}
function mkPanDistrict() {
  const rows = Array.from({ length: 366 }, () => null);
  rows[dayOfYear(DAY8)] = ["06:08", "18:31", "09:00-10:30", "13:30-15:00", "10:30-12:00", "07:30-09:00",
    9, "23:38", 41, "14:04", 42, "02:56+1"];
  return { [DAY8.slice(-4)]: rows };
}

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.log("  FAIL - " + msg); }
}

(async function run() {
  console.log("1) PV event-first Day load");
  documentStub._init();
  assert(count("data/pv-calendar-data.json") === 1, "PV calendar fetched once");
  assert(count("epaper/cultural-event-candidates.json") === 1, "cultural event data fetched once");
  assert(count("data/calendar-events.json") === 1, "calendar events fetched once");
  assert(calls.every((url) => !url.startsWith("ocr-zones/")), "Day does not request OCR data");
  assert(els.todayContent.innerHTML.includes("ಘಟನೆ ದತ್ತಾಂಶ ಲೋಡ್ ಆಗುತ್ತಿದೆ"), "event loading state shown");
  resolveUrl("data/pv-calendar-data.json", mkPV());
  resolveUrl("epaper/cultural-event-candidates.json", mkCultural());
  resolveUrl("data/calendar-events.json", { events: { [INITIAL]: ["Cal-Day-" + INITIAL, "Cal-Second-" + INITIAL], [NEXT]: "  ", "31-09-2026": "Cal-Invalid" } });
  await tick();
  await tick();
  assert(els.todayContent.innerHTML.includes("ಇಂದಿನ ಕಾರ್ಯಕ್ರಮಗಳು"), "Home today heading shown");
  assert(els.todayContent.innerHTML.includes('id="homeDistrictSelect"'), "Home district selector shown below the date");
  assert(sectionBody(els.todayContent.innerHTML, "homeEvents").includes('id="homeEvents"') && sectionBody(els.todayContent.innerHTML, "homeEvents").includes('aria-label="ಕಾರ್ಯಕ್ರಮಗಳು"'), "all Home events use one semantic section");
  assert(!els.todayContent.innerHTML.includes('id="homeReligious"') && !els.todayContent.innerHTML.includes('id="homeCultural"'), "Home has no separate event-type sections");
  assert(els.todayContent.innerHTML.includes('role="combobox"') && els.todayContent.innerHTML.includes('role="listbox"'), "district picker exposes combobox/listbox semantics");
  assert(els.todayContent.innerHTML.includes('class="district-option-count"'), "district menu includes separated count badges");
  assert(sectionBody(els.todayContent.innerHTML, "homeEvents").includes("PV-Karnataka-" + INITIAL), "Karnataka event shown with empty district");
  assert(sectionBody(els.todayContent.innerHTML, "homeEvents").includes("ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ") && !sectionBody(els.todayContent.innerHTML, "homeEvents").includes("ಧಾರ್ಮಿಕ ಕಾರ್ಯಕ್ರಮಗಳು") && !sectionBody(els.todayContent.innerHTML, "homeEvents").includes("ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮಗಳು"), "no-district empty state is preserved without event-type headings");
  assert(sectionBody(els.todayContent.innerHTML, "homeEvents").includes("Cal-Day-" + INITIAL), "calendar event shown as Karnataka-wide with empty district");
  assert(sectionBody(els.todayContent.innerHTML, "homeEvents").includes("Cal-Second-" + INITIAL), "calendar day with several events shows each as its own row");
  assert(els.todayContent.innerHTML.includes(">ಬಾಗಲಕೋಟೆ (3)</option>"), "Day district count is contextual, in Kannada");
  assert(els.todayContent.innerHTML.includes(">ಬಳ್ಳಾರಿ (1)</option>"), "district count excludes Karnataka-wide rows");
  assert(els.todayContent.innerHTML.includes("ಮುಂದಿನ 7 ದಿನಗಳ ಕಾರ್ಯಕ್ರಮಗಳು"), "seven-day upcoming section shown");
  assert(els.todayContent.innerHTML.includes('id="homeEventsMode"'), "Events mode is the default Home mode");
  assert(!els.todayContent.innerHTML.includes("panga-grid"), "Events mode does not render Panchanga UI");
  assert(!els.todayContent.innerHTML.includes("ಪಂಚಾಂಗದ ವಿವರಗಳು"), "Events mode does not load Panchanga");

  console.log("2) district filtering and inclusive ranges");
  els.homeDistrictSelect.value = "Bagalkot";
  els.homeDistrictSelect.click("change");
  await tick();
  assert(sectionBody(els.todayContent.innerHTML, "homeEvents").includes("PV-Bagalkot-" + INITIAL), "selected district PV event shown in merged section");
  assert(sectionBody(els.todayContent.innerHTML, "homeEvents").includes("Cultural-Bagalkot-" + INITIAL), "selected district cultural event shown in merged section");
  assert(sectionBody(els.todayContent.innerHTML, "homeEvents").includes("ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು") && sectionBody(els.todayContent.innerHTML, "homeEvents").includes("ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು"), "merged section retains scope subheadings");
  assert(!sectionBody(els.todayContent.innerHTML, "homeEvents").includes("ಧಾರ್ಮಿಕ ಕಾರ್ಯಕ್ರಮಗಳು") && !sectionBody(els.todayContent.innerHTML, "homeEvents").includes("ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮಗಳು"), "selected Home has no separate event-type headings");
  assert(els.todayContent.innerHTML.includes(">ಬೆಂಗಳೂರು ನಗರ (1)</option>"), "Home district count includes cultural events");
  assert(els.todayContent.innerHTML.includes("PV-Range"), "range event shown on its start date");
  assert((sectionBody(els.todayContent.innerHTML, "homeEvents").match(/PV-Bagalkot-/g) || []).length === 1, "local event is not duplicated in merged sections");
  assert(sectionBody(els.todayContent.innerHTML, "upcomingEvents1").includes("PV-Bagalkot-" + NEXT) && sectionBody(els.todayContent.innerHTML, "upcomingEvents1").includes("Cultural-Bagalkot-" + NEXT), "upcoming PV and cultural events share one section");
  assert(!sectionBody(els.todayContent.innerHTML, "upcomingEvents1").includes("ધાર್ಮಿಕ ಕಾರ್ಯಕ್ರಮಗಳು") && !sectionBody(els.todayContent.innerHTML, "upcomingEvents1").includes("ಸಾಂસ્કૃતિક ಕಾರ್ಯಕ್ರಮಗಳು"), "upcoming has no separate event-type headings");
  assert(els.homeDistrictSelect.value === "Bagalkot", "district selection persists");
  assert(localStore.pvDistrict === "Bagalkot" && !("pvDistrict" in sessionStore), "district is remembered across visits (localStorage), not per session");
  assert((els.todayContent.innerHTML.match(/class="ds-day/g) || []).length === 7, "Home shows a seven-day strip");
  assert(els.todayContent.innerHTML.includes('class="scope-legend strip-legend"') && els.todayContent.innerHTML.includes('scope-dot state'), "Home explains the strip dots with a legend");
  assert(els.todayContent.innerHTML.includes("ds-day sel today") || els.todayContent.innerHTML.includes("ds-day today sel") || els.todayContent.innerHTML.includes('class="ds-day sel'), "strip marks the selected day");
  assert(!els.todayContent.innerHTML.includes("ಈ ದಿನ ಯಾವುದೇ ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.") && !els.todayContent.innerHTML.includes("ಈ ದಿನ ಯಾವುದೇ ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ."), "Home no longer repeats per-scope empty notes");

  console.log("3) date navigation uses PV without OCR");
  els.nextDay.click();
  assert(count("ocr-zones/" + NEXT + "/structured-ocr.json") === 0, "next date does not request OCR");
  assert(els.todayContent.innerHTML.includes("PV-Bagalkot-" + NEXT), "next date events render immediately");
  assert(els.todayContent.innerHTML.includes("Cultural-Bagalkot-" + NEXT), "next date cultural events render immediately");
  els.nextDay.click();
  assert(els.todayContent.innerHTML.includes("PV-Range"), "range event shown on its end date");
  els.nextDay.click();
  assert(!els.todayContent.innerHTML.includes("PV-Range"), "range event stops after its end date");
  els.nextDay.click();
  els.nextDay.click();
  els.nextDay.click();
  els.nextDay.click();
  els.nextDay.click();
  assert(els.todayContent.innerHTML.includes("ಈ ದಿನ ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ."), "empty date shows one collapsed empty state");

  console.log("4) Panchanga mode loads its own data lazily, never OCR");
  const coreUrl = "data/panchanga.json", distUrl = "data/panchanga/bagalkot.json";
  assert(count(coreUrl) === 0, "Panchanga data is not requested before the tab is opened");
  els.homePanchangaMode.click();
  assert(count(coreUrl) === 1, "Panchanga requests the day data once");
  assert(els.todayContent.innerHTML.includes("ಪಂಚಾಂಗದ ವಿವರಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ"), "Panchanga loading state shown");
  resolveUrl(coreUrl, mkPanCore());
  await tick();
  await tick();
  assert(count(distUrl) === 1, "Panchanga requests the selected district's file");
  resolveUrl(distUrl, mkPanDistrict());
  await tick();
  await tick();
  assert(calls.every((url) => !url.startsWith("ocr-zones/")), "Panchanga never requests OCR data");
  assert(els.todayContent.innerHTML.includes("panga-grid"), "Panchanga cards render after the data loads");
  assert(els.todayContent.innerHTML.includes("ತದಿಗೆ") && els.todayContent.innerHTML.includes("ರೇವತಿ"), "tithi and nakshatra names render");
  assert(!els.todayContent.innerHTML.includes('id="panchangaPvOnly"') && !els.todayContent.innerHTML.includes("panga-toggle"), "there is no PV-only toggle");
  assert((els.todayContent.innerHTML.match(/class="panga-head"/g) || []).length === 4, "all four Panchanga cards render");
  assert(els.todayContent.innerHTML.includes("ಯೋಗ9") && els.todayContent.innerHTML.includes("ಕರಣ41"), "yoga and karana names come from the district file");
  assert(els.todayContent.innerHTML.includes("ನಂತರ ಕರಣ42"), "the next karana is shown too");
  assert(els.todayContent.innerHTML.includes("sun-row") && els.todayContent.innerHTML.includes("panga-meta"), "sun row and meta render");
  assert(els.todayContent.innerHTML.includes("06:08") && els.todayContent.innerHTML.includes("18:31"), "sunrise and sunset come from the district file");
  assert(els.todayContent.innerHTML.includes("ತಿಥಿ, ನಕ್ಷತ್ರ: ಕ್ಯಾಲೆಂಡರ್ ಆಧಾರದಲ್ಲಿ"), "source note says what is from the calendar and what is calculated");
  assert(els.todayContent.innerHTML.includes("class=\"timeline\""), "desktop timing timeline renders");
  assert(els.todayContent.innerHTML.includes("timeline-mobile timeline-rail") && els.todayContent.innerHTML.includes("timeline-node") && els.todayContent.innerHTML.includes("timeline-card"), "mobile timing markup includes a rail, nodes, and event cards");
  assert(els.todayContent.innerHTML.includes("timing-legend"), "timing color legend renders");
  var timings = sectionBody(els.todayContent.innerHTML, "body-homeTimings");
  assert((timings.match(/<li class="tl-row/g) || []).length === 4, "timings list has rahu, gulika, yamaganda and artha prahara");
  assert(timings.includes("ರಾಹು ಕಾಲ") && timings.includes("ಗುಳಿಕ ಕಾಲ") && timings.includes("ಯಮಗಂಡ") && timings.includes("ಅರ್ಥ ಪ್ರಹರ"), "all four timings are named");
  assert(timings.includes("ಬಾಗಲಕೋಟೆ"), "timings say which district they are for");
  assert((timings.match(/class="tl-tone">ಅಶುಭ</g) || []).length === 3 && (timings.match(/class="tl-tone">ಮಧ್ಯಮ</g) || []).length === 1, "each timing card names its tone in words, not just colour");
  assert(timings.includes('class="tl-dur">1 ಗಂ 30 ನಿ</span>'), "each timing card shows how long it lasts");
  assert((timings.match(/class="tl-bar"/g) || []).length === 4 && timings.includes("left:0.0%;width:20.0%"), "each timing card has a bar showing where it falls in the day");
  assert(els.todayContent.innerHTML.includes('class="tl-ends"><span class="tl-endpoint"><small>ಆರಂಭ</small><b class="t-time">07:30'), "timeline starts at the first timing");
  assert(els.todayContent.innerHTML.includes('<span class="tl-endpoint"><small>ಅಂತ್ಯ</small><b class="t-time">15:00'), "timeline ends at the last timing");
  assert(!els.todayContent.innerHTML.includes('class="jr"') && els.todayContent.innerHTML.includes("ಈ ದಿನದ ರಾಶಿ ಭವಿಷ್ಯ ಲಭ್ಯವಿಲ್ಲ."), "horoscope is reported as not available");
  assert(els.todayContent.innerHTML.includes("ಶುಭ ಸಮಯ: ಲಭ್ಯವಿಲ್ಲ"), "Shubha Samaya is reported as not available");
  assert(els.todayContent.innerHTML.includes('href="https://www.prajavani.net/horoscope"') && els.todayContent.innerHTML.includes('rel="noopener noreferrer"'), "horoscope card links to the Prajavani horoscope page");
  els.nextDay.click();
  await tick();
  await tick();
  assert(els.todayContent.innerHTML.includes("ಈ ದಿನದ ಪಂಚಾಂಗದ ವಿವರ ಲಭ್ಯವಿಲ್ಲ."), "a day with no Panchanga record says so");
  assert(count(coreUrl) === 1 && count(distUrl) === 1, "the data files are fetched once, not per day");

  els.homeEventsMode.click();
  assert(els.todayContent.innerHTML.includes("homeEvents"), "Events mode switches back");

  console.log("6) Week and Month use event data");
  tabEls.week.click();
  assert(els.weekTitle.textContent.includes("–"), "Week header shows a date range");
  assert((els.weekAgenda.innerHTML.match(/class="week-block"/g) || []).length === 5, "Week renders the initial stream of five weeks");
  assert(els.weekAgenda.innerHTML.includes("week-day-date"), "Week rows show complete right-aligned dates");
  assert(!els.weekAgenda.innerHTML.includes("week-day-counts"), "Week rows omit festival counts");
  assert(els.weekAgenda.innerHTML.includes("Cultural-Bagalkot-" + INITIAL), "Week includes cultural events");
  tabEls.month.click();
  assert(els.mastheadDate.textContent.includes("2026"), "Month masthead shows year");
  assert(els.monthScroller.innerHTML.includes("agenda-day"), "Month renders the dated agenda");
  assert(els.monthScroller.innerHTML.includes('ev-when">' + INITIAL + " – " + DAY2), "a multi-day event keeps its date range in the month list");
  assert(/<section class="agenda-day week-day"[^>]*><h3 class="week-day-title"><button[^>]*data-day="[^"]+"><span class="week-day-label"><span class="week-day-name">[^<]+<\/span>.*?<span class="week-day-date"><b>\d+<\/b><small>/.test(els.monthScroller.innerHTML), "month list dates use the Week view's weekday-and-big-date heading");
  assert(!els.monthScroller.innerHTML.includes('ev-when">' + INITIAL + "<"), "a one-day event does not repeat the date its heading already shows");
  assert(els.monthScroller.innerHTML.includes('<details class="month-agenda">') && !els.monthScroller.innerHTML.includes('<details class="month-agenda" open'), "the month's event list is a collapsed, expandable section");
  assert(/<summary class="ev-section-title" id="monthAgenda-[^"]+"><span>ತಿಂಗಳ ವೇಳಾಪಟ್ಟಿ<\/span><span class="agenda-count">\d+<\/span><\/summary>/.test(els.monthScroller.innerHTML), "the heading shows how many events the list holds");
  assert(els.monthScroller.innerHTML.includes("date-count"), "Month shows event counts in cells");
  assert(els.monthScroller.innerHTML.includes("Cultural-Bagalkot-" + INITIAL), "Month agenda includes cultural events");
  assert(els.monthScroller.innerHTML.includes('date-count district">3</b>'), "Month date count includes cultural events");
  assert(els.monthDistrictSelect.innerHTML.includes(">ಬಾಗಲಕೋಟೆ (7)</option>"), "Month district count includes cultural events");
  assert(els.monthScroller.innerHTML.includes(">ಶು</span>") && els.monthScroller.innerHTML.includes(">ಶ</span>"), "Month weekday chips tell Friday (ಶು) and Saturday (ಶ) apart");
  const tapped = INITIAL;
  els.monthScroller._handlers.click[0]({ target: { closest: () => ({ dataset: { day: tapped } }) } });
  assert(els.viewDay.hidden === false && els.viewMonth.hidden === true, "tapping a Month day redirects to Home");
  assert(sessionStore.pvDate === tapped && els.mastheadDate.textContent.includes(String(parseInt(tapped.slice(0, 2), 10))), "Home opens with the tapped day selected");
  tabEls.week.click();
  assert((els.weekAgenda.innerHTML.match(/class="week-day-title"/g) || []).length === 35, "Week gives every day the same row, empty or not");
  assert(els.weekAgenda.innerHTML.includes('data-empty="1"') && !els.weekAgenda.innerHTML.includes("gap-day"), "Days without events keep the same row (no merged chips)");
  assert(els.weekAgenda.innerHTML.includes("<b>" + parseInt(INITIAL.slice(0, 2), 10) + "</b>") && els.weekAgenda.innerHTML.includes("data-today=\"1\""), "Week shows a big date number and marks today");
  assert(!els.weekAgenda.innerHTML.includes("ಈ ದಿನ ಯಾವುದೇ ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.") && !els.weekAgenda.innerHTML.includes("ಈ ದಿನ ಯಾವುದೇ ವಿಶೇಷ ದಿನವಿಲ್ಲ."), "Week no longer repeats empty-scope notes");
  tabEls.day.click();
  assert(els.mastheadDate.textContent.includes(String(parseInt(INITIAL.slice(0, 2), 10))), "Day follows the date chosen in Month");

  console.log("6b) Tapping the header date opens a date picker");
  let pickerOpened = 0;
  document.getElementById("datePicker").showPicker = () => { pickerOpened++; };
  els.mastheadDate.click();
  assert(pickerOpened === 1, "tapping the header date opens the picker");
  assert(els.datePicker.value === iso(INITIAL) || els.datePicker.value === "2026-01-01" || els.datePicker.value === "2027-12-31", "picker opens on the selected date, inside the supported range");
  els.datePicker.value = "2027-03-05";
  els.datePicker.click("change");
  assert(sessionStore.pvDate === "05-03-2027" && els.mastheadDate.textContent.includes("5"), "picking a date on Home jumps to it");
  els.datePicker.value = "2030-01-01";
  els.datePicker.click("change");
  assert(sessionStore.pvDate === "05-03-2027", "a date outside 2026-2027 is ignored");
  els.datePicker.value = "";
  els.datePicker.click("change");
  assert(sessionStore.pvDate === "05-03-2027", "clearing the picker changes nothing");
  tabEls.week.click();
  els.datePicker.value = "2026-11-18";
  els.datePicker.click("change");
  assert(sessionStore.pvDate === "18-11-2026" && els.mastheadDate.textContent.includes("–"), "in Week, picking a date shows the week containing it");
  tabEls.month.click();
  els.datePicker.value = "2027-07-04";
  els.datePicker.click("change");
  assert(sessionStore.pvDate === "04-07-2027" && els.mastheadDate.textContent.includes("2027"), "in Month, picking a date shows that month");
  tabEls.day.click();

  console.log("6c) The district bar hides when scrolling down and returns when scrolling up");
  tabEls.week.click();
  const scrollTo = (y) => { global.window.scrollY = y; scrollHandlers.forEach((cb) => cb()); };
  assert(toolbarEls.every((bar) => !bar.hidden), "district bar is visible at the top");
  scrollTo(120);
  assert(toolbarEls.every((bar) => bar.hidden), "scrolling down hides the district bar");
  scrollTo(124);
  assert(toolbarEls.every((bar) => bar.hidden), "small movements keep it hidden");
  scrollTo(90);
  assert(toolbarEls.every((bar) => !bar.hidden), "scrolling up shows the district bar again");
  scrollTo(400);
  assert(toolbarEls.every((bar) => bar.hidden), "scrolling down again hides it");
  scrollTo(0);
  assert(toolbarEls.every((bar) => !bar.hidden), "back at the top it is visible");
  scrollTo(300);
  tabEls.month.click();
  assert(toolbarEls.every((bar) => !bar.hidden), "switching tabs shows it");
  global.window.scrollY = 0;
  tabEls.day.click();

  console.log("7) PV load failure is explicit");
  for (const key in els) delete els[key];
  for (const key in tabEls) delete tabEls[key];
  calls.length = 0;
  for (const key in pending) delete pending[key];
  delete sessionStore.pvDate;
  vm.runInThisContext(fs.readFileSync(APP_PATH, "utf8"), { filename: APP_PATH });
  documentStub._init();
  assert(count("data/pv-calendar-data.json") === 1, "fresh boot requests PV data");
  failUrl("data/pv-calendar-data.json");
  await tick();
  assert(els.todayContent.innerHTML.includes("ಘಟನೆ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ"), "PV failure shows event-data error");
  assert(calls.every((url) => !url.startsWith("ocr-zones/")), "PV failure does not fall back to OCR");

  console.log("\n" + pass + " passed, " + fail + " failed");
  if (fail) process.exit(1);
})();
