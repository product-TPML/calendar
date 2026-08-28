/* Focused stub test for app.js date navigation, unavailable-data behavior and
   the PV calendar event integration:
   - initial 06-04 loads its JSON
   - next day requests/loads 07-04 JSON without refresh
   - back to 06-04 uses cache (no second request)
   - rapid navigation cannot render a stale (older) response
   - a failed fetch caches an explicit unavailable record (no fabrication,
     no ಅಂದಾಜು badge, no borrowed FALLBACK content)
   - partial timings keep only rows that parse; never substitute FALLBACK
   - PV calendar fetched once; today card uses PV events (not OCR)
   - date_end inclusive endpoints (active start..end, not after)
   - district + Karnataka filtering, no duplicate state/local rendering
   - empty district shows state-only events
   - PV load failure shows an event-data error (no OCR fallback, no crash)
   Run: node app.test.js */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---------------- Stub DOM ---------------- */
function makeEl(id) {
  const el = {
    id: id || "",
    innerHTML: "",
    textContent: "",
    hidden: false,
    checked: false,
    value: "",
    dataset: {},
    children: [],
    _handlers: {},
    addEventListener(type, cb) { (el._handlers[type] = el._handlers[type] || []).push(cb); },
    click(type) { ((type ? el._handlers[type] : el._handlers.click) || []).forEach(function (cb) { cb(); }); },
    appendChild(child) { el.children.push(child); },
    querySelectorAll() { return []; },
    classList: { toggle() {} },
    setAttribute() {},
    removeAttribute() {},
  };
  return el;
}

const els = {};
const tabEls = {};
const viewIds = ["viewDay", "viewWeek", "viewMonth", "viewMore"];
const documentStub = {
  title: "",
  _init: null,
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
    return [];
  },
  querySelector() { return { scrollTop: 0 }; },
};

/* ---------------- Stub fetch with manual resolution ---------------- */
const calls = [];
const pending = {}; // url -> resolve
function fetchStub(url) {
  calls.push(url);
  return new Promise(function (resolve) { pending[url] = resolve; });
}

global.document = documentStub;
global.window = { scrollTo() {} };
global.fetch = fetchStub;

const sessionStore = {};
global.sessionStorage = {
  getItem(k) { return k in sessionStore ? sessionStore[k] : null; },
  setItem(k, v) { sessionStore[k] = String(v); },
  removeItem(k) { delete sessionStore[k]; },
};

const APP_PATH = path.join(__dirname, "app.js");
vm.runInThisContext(fs.readFileSync(APP_PATH, "utf8"), { filename: APP_PATH });

/* ---------------- Test helpers ---------------- */
const tick = () => new Promise((r) => setTimeout(r, 0));

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
function countIn(html, sub) { return html.split(sub).length - 1; }
function sectionBody(html, id) {
  const start = html.indexOf('id="' + id + '"');
  if (start < 0) return "";
  const end = html.indexOf("</section>", start);
  return html.slice(start, end < 0 ? html.length : end);
}
const URL = (k) => "ocr-zones/" + k + "/structured-ocr.json";
const PV_URL = "data/pv-calendar-data.json";
function dayKey(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
}
function dayNumber(key) { return String(parseInt(key.slice(0, 2), 10)); }
function iso(key) { const p = key.split("-"); return p[2] + "-" + p[1] + "-" + p[0]; }
const INITIAL = dayKey(0), NEXT = dayKey(1), DAY2 = dayKey(2), DAY3 = dayKey(3), DAY4 = dayKey(4), DAY5 = dayKey(5), DAY6 = dayKey(6), DAY7 = dayKey(7), DAY8 = dayKey(8);

function mkJson(key) {
  const j = Array.from({ length: 12 }, (_, i) => ({ rashi: "ಮೇಷ", prediction: "P" + i }));
  return {
    source: { date: key },
    content: {
      calendar: { months: ["ಚೈತ್ರ"], samvatsara: "S-" + key, shakaYear: 1948, sunrise: "06:12", sunset: "18:31" },
      events: ["event-" + key],
      panchanga: {
        tithi: { name: "ಚತುರ್ಥಿ", endsAt: "10.5", nextDay: false },
        nakshatra: { name: "ಅನುರಾಧ", endsAt: "11.5", nextDay: false },
        yoga: { name: "ಸಿದ್ಧಿ", endsAt: "12.5", nextDay: false },
        karana: { name: "ಕೌಲವ", endsAt: "13.5", nextDay: false },
        ayana: "ಉತ್ತರಾಯಣ", solarRashi: "ಮೀನ", chandraRashi: "ವೃಶ್ಚಿಕ",
      },
      timings: {
        rahuKala: "07:30-09:00", gulikaKala: "10:30-12:00", yamaganda: "13:30-15:00",
        arthaPrahara: "09:00-10:30", shubhaSamaya: "15:19-17:07",
      },
      jathaka: j,
    },
  };
}

/* Only 2 clean timing rows; the rest missing or malformed. */
function mkPartialTimings(key) {
  const j = mkJson(key);
  j.content.timings = { rahuKala: "07:30-09:00", yamaganda: "no-time", shubhaSamaya: "15:19-17:07" };
  return j;
}

/* Nothing useful in the payload: normalize must not borrow FALLBACK. */
function mkMinimal(key) {
  return { source: { date: key }, content: { calendar: {}, panchanga: {}, timings: {}, events: [] } };
}

/* PV calendar: Bagalkot + Ballari sheets. One Bagalkot record per test date,
   an inclusive range (INITIAL..DAY2), a Karnataka-wide record on INITIAL, and a
   Ballari district record on INITIAL. DAY8 intentionally has no PV record. */
function mkPV() {
  const sheets = { "Bagalkot": [], "Ballari": [] };
  [INITIAL, NEXT, DAY2, DAY3, DAY4, DAY5, DAY6, DAY7].forEach((k) => {
    sheets["Bagalkot"].push({ date: iso(k), name_of_festival: "PV-Bagalkot-" + k, place: "ರಬಕವಿ", relevance: "Assumed district relevance" });
  });
  sheets["Bagalkot"].push({ date: iso(INITIAL), date_end: iso(DAY2), name_of_festival: "PV-Range", place: "ಇಳಕಲ್", relevance: "Assumed district relevance" });
  sheets["Bagalkot"].push({ date: iso(INITIAL), name_of_festival: "PV-Karnataka-" + INITIAL, place: "", relevance: "Relevant for Karnataka" });
  sheets["Ballari"].push({ date: iso(INITIAL), name_of_festival: "PV-Ballari-" + INITIAL, place: "ಹೊಸಪೇಟೆ", relevance: "Relevant for District" });
  return { sheets };
}

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.log("  FAIL - " + msg); }
}

/* ---------------- Scenarios ---------------- */
(async function run() {
  console.log("1) initial current-date load (PV fetched once, empty district)");
  documentStub._init(); // DOMContentLoaded
  assert(count(URL(INITIAL)) === 1, "current-date JSON requested once");
  assert(count(PV_URL) === 1, "PV calendar fetched once");
  assert(els.todayContent.innerHTML.includes("ಲೋಡ್"), "loading state shown immediately");
  resolveUrl(PV_URL, mkPV());
  await tick();
  resolveUrl(URL(INITIAL), mkJson(INITIAL));
  await tick();
  assert(countIn(els.todayContent.innerHTML, "<option") === 3, "district select populated from sheet names");
  assert(els.todayContent.innerHTML.includes(">Bagalkot (2)</option>"), "district option shows date-local event count");
  assert(els.todayContent.innerHTML.includes(">Ballari (1)</option>"), "district count excludes Karnataka-wide events");
  assert(els.todayContent.innerHTML.includes('id="districtEvents"'), "district events grouped inside existing card");
  assert(els.todayContent.innerHTML.includes('id="stateEvents"'), "state events grouped inside existing card");
  assert(!sectionBody(els.todayContent.innerHTML, "districtEvents").includes("PV-Bagalkot-"), "empty district -> no district events");
  assert(sectionBody(els.todayContent.innerHTML, "stateEvents").includes("PV-Karnataka-" + INITIAL), "state events show Karnataka");
  assert(els.todayContent.innerHTML.includes("S-" + INITIAL), "current-date data rendered");
  assert(els.todayContent.innerHTML.includes("PV-Karnataka-" + INITIAL), "today card shows PV events (not OCR)");
  assert(!els.todayContent.innerHTML.includes("event-" + INITIAL), "OCR events not used in today card");
  assert(!els.todayContent.innerHTML.includes("hero-quote"), "quote is not rendered");
  assert(els.todayContent.innerHTML.includes("ಕನ್ನಡ ಪಂಚಾಂಗದ ಆಧಾರದಲ್ಲಿ"), "source note shown near times");
  assert((els.todayContent.innerHTML.match(/panga-card featured/g) || []).length === 2, "tithi + nakshatra are the featured cards");
  assert((els.todayContent.innerHTML.match(/<svg[^>]*aria-hidden="true"/g) || []).length === 11, "11 svg icons, all aria-hidden");
  assert((els.todayContent.innerHTML.match(/<svg[^>]*focusable="false"/g) || []).length === 11, "11 svg icons, all non-focusable");
  var initialTimingOrder = ["ರಾಹು ಕಾಲ", "ಅರ್ಥ ಪ್ರಹರ", "ಗುಳಿಕ ಕಾಲ", "ಯಮಗಂಡ", "ಶುಭ ಸಮಯ"].map(function (label) { return els.todayContent.innerHTML.indexOf(label); });
  assert(initialTimingOrder.every(function (pos, i) { return i === 0 || pos > initialTimingOrder[i - 1]; }), "timeline and list use chronological order");
  assert(els.mastheadDate.textContent.includes(dayNumber(INITIAL)), "masthead uses English digits");

  console.log("2) district + Karnataka filtering, no duplicate rendering");
  els.districtSelect.value = "Bagalkot";
  els.districtSelect.click("change");
  await tick();
  assert(els.todayContent.innerHTML.includes("PV-Bagalkot-" + INITIAL), "district events show selected district");
  assert(els.todayContent.innerHTML.includes("PV-Karnataka-" + INITIAL), "state events still show Karnataka");
  assert(els.todayContent.innerHTML.includes("PV-Range"), "inclusive range active on start date");
  assert(!sectionBody(els.todayContent.innerHTML, "districtEvents").includes("PV-Karnataka-"), "Karnataka record NOT duplicated into district");
  assert(!sectionBody(els.todayContent.innerHTML, "stateEvents").includes("PV-Bagalkot-"), "district record NOT in state events");
  assert(els.districtSelect.value === "Bagalkot", "district persisted in select");

  console.log("3) next day fetches & loads its JSON (range active mid-way)");
  els.nextDay.click();
  assert(count(URL(NEXT)) === 1, "next-day JSON requested");
  assert(els.todayContent.innerHTML.includes("ಲೋಡ್"), "loading shown while fetching next day");
  assert(els.mastheadDate.textContent.includes(dayNumber(NEXT)), "masthead updated with English digits");
  resolveUrl(URL(NEXT), mkJson(NEXT));
  await tick();
  assert(els.todayContent.innerHTML.includes("S-" + NEXT), "next-day data rendered");
  assert(els.todayContent.innerHTML.includes("PV-Bagalkot-" + NEXT), "next-day PV events rendered");
  assert(els.todayContent.innerHTML.includes("PV-Range"), "inclusive range active on middle day");

  console.log("4) back to current date uses cache (no second request)");
  els.prevDay.click();
  assert(count(URL(INITIAL)) === 1, "current date NOT re-requested");
  assert(els.todayContent.innerHTML.includes("S-" + INITIAL), "current date rendered synchronously from cache (no loading)");

  console.log("5) rapid navigation: stale response cannot render; range endpoints");
  els.nextDay.click(); // -> next day (cached, no fetch)
  els.nextDay.click(); // -> day 2 (keep pending)
  assert(count(URL(DAY2)) === 1, "day 2 requested");
  els.nextDay.click(); // -> day 3 (keep pending)
  assert(count(URL(DAY3)) === 1, "day 3 requested");
  assert(els.todayContent.innerHTML.includes("ಲೋಡ್"), "still loading for day 3");
  resolveUrl(URL(DAY2), mkJson(DAY2)); // stale response arrives first
  await tick();
  assert(els.todayContent.innerHTML.includes("ಲೋಡ್"), "stale day 2 did NOT overwrite (still loading)");
  assert(!els.todayContent.innerHTML.includes("S-" + DAY2), "day 2 data NOT rendered while day 3 selected");
  resolveUrl(URL(DAY3), mkJson(DAY3));
  await tick();
  assert(els.todayContent.innerHTML.includes("S-" + DAY3), "day 3 data rendered (latest wins)");
  assert(!els.todayContent.innerHTML.includes("S-" + DAY2), "day 2 still not rendered over day 3");
  assert(!els.todayContent.innerHTML.includes("PV-Range"), "inclusive range NOT active after end date (day 3)");
  els.prevDay.click(); // back to day 2 -> cached
  assert(count(URL(DAY2)) === 1, "day 2 served from cache, no re-fetch");
  assert(els.todayContent.innerHTML.includes("S-" + DAY2), "day 2 rendered from cache");
  assert(els.todayContent.innerHTML.includes("PV-Range"), "inclusive range active on end date (day 2)");

  console.log("6) failed fetch caches an explicit unavailable record");
  els.nextDay.click(); // -> day 3 cached already
  els.nextDay.click(); // -> day 4 pending
  failUrl(URL(DAY4));
  await tick();
  assert(els.todayContent.innerHTML.includes("ಈ ದಿನದ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ"), "day 4 shows unavailable message");
  assert(!els.todayContent.innerHTML.includes("ಅಂದಾಜು"), "no misleading ಅಂದಾಜು badge");
  assert(!els.todayContent.innerHTML.includes("panga-grid"), "no fabricated panchanga cards");
  assert(!els.todayContent.innerHTML.includes("ರಾಹು ಕಾಲ"), "no fabricated timings");
  assert(!els.todayContent.innerHTML.includes("ಅನಸೂಯಾ"), "no FALLBACK events borrowed");
  els.prevDay.click(); // day 3 (cached)
  assert(count(URL(DAY4)) === 1, "day 4 NOT re-fetched");
  els.nextDay.click(); // back to day 4
  assert(els.todayContent.innerHTML.includes("ಈ ದಿನದ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ"), "day 4 unavailable served from cache");

  console.log("7) partial timings: only parsed rows, no FALLBACK substitution");
  els.nextDay.click(); // -> day 5 pending
  resolveUrl(URL(DAY5), mkPartialTimings(DAY5));
  await tick();
  assert(countIn(els.todayContent.innerHTML, 'class="tl-block') === 2, "only the 2 clean rows are rendered");
  assert(countIn(els.todayContent.innerHTML, 'class="tl-row') === 2, "only the 2 clean rows listed");
  assert(els.todayContent.innerHTML.includes("ರಾಹು ಕಾಲ"), "rahu kala rendered");
  assert(els.todayContent.innerHTML.includes("ಶುಭ ಸಮಯ"), "shubha samaya rendered");
  assert(!els.todayContent.innerHTML.includes("ಯಮಗಂಡ"), "malformed yamaganda row absent");
  assert(!els.todayContent.innerHTML.includes("ಗುಳಿಕ ಕಾಲ"), "missing gulika row absent");
  assert(!els.todayContent.innerHTML.includes("ಅರ್ಥ ಪ್ರಹರ"), "missing artha prahara row absent");

  console.log("8) entirely empty timing block shows the unavailable message");
  els.nextDay.click(); // -> day 6 pending
  resolveUrl(URL(DAY6), { source: { date: DAY6 }, content: { timings: {}, events: [], calendar: {}, panchanga: {} } });
  await tick();
  assert(els.todayContent.innerHTML.includes("ಈ ದಿನದ ಕಾಲ ವಿವರ ಲಭ್ಯವಿಲ್ಲ"), "timing unavailable message shown");
  assert(countIn(els.todayContent.innerHTML, "ರಾಹು ಕಾಲ") === 0, "FALLBACK timings NOT substituted");

  console.log("9) missing fields never borrow FALLBACK content");
  els.nextDay.click(); // -> day 7 pending
  resolveUrl(URL(DAY7), mkMinimal(DAY7));
  await tick();
  assert(!els.todayContent.innerHTML.includes("hero-quote"), "quote remains absent");
  assert(!els.todayContent.innerHTML.includes("ಪರಾಭವ"), "no FALLBACK samvatsara");
  assert(!els.todayContent.innerHTML.includes("1948"), "no FALLBACK shakaYear");
  assert(!els.todayContent.innerHTML.includes("ಅನಸೂಯಾ"), "no FALLBACK events");
  assert(!els.todayContent.innerHTML.includes("ಸಿಂಹ"), "no FALLBACK jathaka row");
  assert(els.todayContent.innerHTML.includes("ಈ ದಿನದ ಕಾಲ ವಿವರ ಲಭ್ಯವಿಲ್ಲ."), "empty timings message shown");
  assert(els.todayContent.innerHTML.includes("ಈ ದಿನದ ರಾಶಿ ಭವಿಷ್ಯ ಲಭ್ಯವಿಲ್ಲ."), "empty jathaka message shown");

  console.log("10) empty PV events show the empty message");
  els.nextDay.click(); // -> day 8 (no PV record)
  resolveUrl(URL(DAY8), mkJson(DAY8));
  await tick();
  assert(els.todayContent.innerHTML.includes("ಈ ದಿನ ಯಾವುದೇ ವಿಶೇಷ ದಿನವಿಲ್ಲ."), "empty PV events message shown");

  console.log("11) Day/Week/Month navigation and session date behavior");
  tabEls.week.click();
  assert(els.weekTitle.textContent.includes("–"), "week header shows start and end dates");
  assert((els.weekAgenda.innerHTML.match(/class="week-day"/g) || []).length === 35, "week renders five lazy-loadable vertical weeks");
  assert(els.weekAgenda.innerHTML.includes("ಆಗಸ್ಟ್"), "week day blocks include the month");
  assert(els.weekAgenda.innerHTML.includes("week-day-counts"), "week rows show contextual event counts");
  assert(!els.weekAgenda.innerHTML.includes("event-scope"), "week rows avoid repetitive scope tags");
  tabEls.month.click();
  assert(els.mastheadDate.textContent.includes("2026"), "month header uses month and year context");
  assert(els.monthScroller.innerHTML.includes("agenda-day"), "month agenda groups events by date");
  assert(els.monthScroller.innerHTML.includes("date-count"), "month dates show contextual event counts");
  tabEls.day.click();
  assert(els.mastheadDate.textContent.includes(dayNumber(DAY8)), "Day tab preserves selected date");
  assert(els.todayContent.innerHTML.includes("ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು ("), "Day headings show contextual event counts");
  assert(sessionStore.pvDate === DAY8, "selected date is stored in the session");

  console.log("12) PV load failure shows event-data error (no OCR fallback, no crash)");
  for (const k in els) delete els[k];
  calls.length = 0;
  for (const k in pending) delete pending[k];
  delete sessionStore.pvDate;
  vm.runInThisContext(fs.readFileSync(APP_PATH, "utf8"), { filename: APP_PATH });
  documentStub._init();
  assert(count(PV_URL) === 1, "PV requested on fresh boot");
  failUrl(PV_URL);
  resolveUrl(URL(INITIAL), mkJson(INITIAL));
  await tick();
  assert(els.todayContent.innerHTML.includes("ಘಟನೆ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ"), "today card shows event-data error");
  assert(!els.todayContent.innerHTML.includes("PV-Bagalkot-"), "district events do not render after error");
  assert(!els.todayContent.innerHTML.includes("PV-Karnataka-"), "state events do not render after error");
  assert(!els.todayContent.innerHTML.includes("event-" + INITIAL), "no OCR events substituted on PV failure");

  console.log("\n" + pass + " passed, " + fail + " failed");
  if (fail) process.exit(1);
})();
