/* Focused event-calendar test for app.js:
   - PV data is the only Day data source
   - Day works without OCR files
   - district and Karnataka-wide filtering stays correct
   - date ranges are inclusive
   - Week and Month retain the shared event index
   - PV failure is explicit
   Run: node app.test.js */
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
  assert(calls.every((url) => !url.startsWith("ocr-zones/")), "Day does not request OCR data");
  assert(els.todayContent.innerHTML.includes("ಘಟನೆ ದತ್ತಾಂಶ ಲೋಡ್ ಆಗುತ್ತಿದೆ"), "event loading state shown");
  resolveUrl("data/pv-calendar-data.json", mkPV());
  resolveUrl("epaper/cultural-event-candidates.json", mkCultural());
  await tick();
  await tick();
  assert(els.todayContent.innerHTML.includes("ಇಂದಿನ ಕಾರ್ಯಕ್ರಮಗಳು"), "Home today heading shown");
  assert(els.todayContent.innerHTML.includes('id="homeDistrictSelect"'), "Home district selector shown below the date");
  assert(els.todayContent.innerHTML.includes('id="homeReligious"'), "religious events grouped on Home");
  assert(els.todayContent.innerHTML.includes('id="homeCultural"'), "cultural events grouped on Home");
  assert(sectionBody(els.todayContent.innerHTML, "homeReligious").includes("PV-Karnataka-" + INITIAL), "Karnataka religious event shown with empty district");
  assert(sectionBody(els.todayContent.innerHTML, "homeCultural").includes("ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ"), "cultural events require a district");
  assert(els.todayContent.innerHTML.includes(">Bagalkot (3)</option>"), "Day district count is contextual");
  assert(els.todayContent.innerHTML.includes(">Ballari (1)</option>"), "district count excludes Karnataka-wide rows");
  assert(els.todayContent.innerHTML.includes("ಮುಂದಿನ 7 ದಿನಗಳ ಕಾರ್ಯಕ್ರಮಗಳು"), "seven-day upcoming section shown");
  assert(!els.todayContent.innerHTML.includes("panga-grid"), "Panchanga UI removed from Day");
  assert(!els.todayContent.innerHTML.includes("ಸಮಯಗಳು"), "timings UI removed from Day");
  assert(!els.todayContent.innerHTML.includes("ರಾಶಿ ಭವಿಷ್ಯ"), "horoscope UI removed from Day");

  console.log("2) district filtering and inclusive ranges");
  els.homeDistrictSelect.value = "Bagalkot";
  els.homeDistrictSelect.click("change");
  await tick();
  assert(sectionBody(els.todayContent.innerHTML, "homeReligious").includes("PV-Bagalkot-" + INITIAL), "selected district religious events shown");
  assert(sectionBody(els.todayContent.innerHTML, "homeCultural").includes("Cultural-Bagalkot-" + INITIAL), "selected district cultural events shown");
  assert(els.todayContent.innerHTML.includes(">Bengaluru Urban (1)</option>"), "Home district count includes cultural events");
  assert(els.todayContent.innerHTML.includes("PV-Range"), "range event shown on its start date");
  assert((sectionBody(els.todayContent.innerHTML, "homeReligious").match(/PV-Bagalkot-/g) || []).length === 1, "local event not duplicated in religious sections");
  assert(els.homeDistrictSelect.value === "Bagalkot", "district selection persists");

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
  assert(els.todayContent.innerHTML.includes("ಈ ದಿನ ಯಾವುದೇ ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ."), "empty date shows the event empty state");

  console.log("4) Week and Month use event data");
  tabEls.week.click();
  assert(els.weekTitle.textContent.includes("–"), "Week header shows a date range");
  assert((els.weekAgenda.innerHTML.match(/class="week-day"/g) || []).length === 35, "Week renders the initial stream");
  assert(els.weekAgenda.innerHTML.includes("week-day-date"), "Week rows show complete right-aligned dates");
  assert(!els.weekAgenda.innerHTML.includes("week-day-counts"), "Week rows omit festival counts");
  tabEls.month.click();
  assert(els.mastheadDate.textContent.includes("2026"), "Month masthead shows year");
  assert(els.monthScroller.innerHTML.includes("agenda-day"), "Month renders the dated agenda");
  assert(els.monthScroller.innerHTML.includes("date-count"), "Month shows event counts in cells");
  tabEls.day.click();
  assert(els.mastheadDate.textContent.includes(String(parseInt(DAY8.slice(0, 2), 10))), "Day preserves selected date");

  console.log("5) PV load failure is explicit");
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
