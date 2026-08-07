/* Focused stub test for app.js date navigation:
   - initial 06-04 loads its JSON
   - next day requests/loads 07-04 JSON without refresh
   - back to 06-04 uses cache (no second request)
   - rapid navigation cannot render a stale (older) response
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
    dataset: {},
    _handlers: {},
    addEventListener(type, cb) { (el._handlers[type] = el._handlers[type] || []).push(cb); },
    click(type) { ((type ? el._handlers[type] : el._handlers.click) || []).forEach(function (cb) { cb(); }); },
    classList: { toggle() {} },
    setAttribute() {},
    removeAttribute() {},
  };
  return el;
}

const els = {};
const documentStub = {
  title: "",
  _init: null,
  addEventListener(type, cb) { if (type === "DOMContentLoaded") documentStub._init = cb; },
  getElementById(id) { return (els[id] = els[id] || makeEl(id)); },
  querySelectorAll() { return []; },
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
const URL = (k) => "ocr-zones/" + k + "/structured-ocr.json";
function dayKey(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
}
function dayNumber(key) { return String(parseInt(key.slice(0, 2), 10)); }
const INITIAL = dayKey(0), NEXT = dayKey(1), DAY2 = dayKey(2), DAY3 = dayKey(3), DAY4 = dayKey(4);

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

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.log("  FAIL - " + msg); }
}

/* ---------------- Scenarios ---------------- */
(async function run() {
  console.log("1) initial current-date load");
  documentStub._init(); // DOMContentLoaded
  assert(count(URL(INITIAL)) === 1, "current-date JSON requested once");
  assert(els.todayContent.innerHTML.includes("ಲೋಡ್"), "loading state shown immediately");
  resolveUrl(URL(INITIAL), mkJson(INITIAL));
  await tick();
  assert(els.todayContent.innerHTML.includes("S-" + INITIAL), "current-date data rendered");
  assert(els.todayContent.innerHTML.includes("event-" + INITIAL), "current-date events rendered");
  assert(els.mastheadDate.textContent.includes(dayNumber(INITIAL)), "masthead uses English digits");

  console.log("2) next day fetches & loads its JSON");
  els.nextDay.click();
  assert(count(URL(NEXT)) === 1, "next-day JSON requested");
  assert(els.todayContent.innerHTML.includes("ಲೋಡ್"), "loading shown while fetching 07-04");
  assert(els.mastheadDate.textContent.includes(dayNumber(NEXT)), "masthead updated with English digits");
  resolveUrl(URL(NEXT), mkJson(NEXT));
  await tick();
  assert(els.todayContent.innerHTML.includes("S-" + NEXT), "next-day data rendered");
  assert(els.todayContent.innerHTML.includes("event-" + NEXT), "next-day events rendered");

  console.log("3) back to current date uses cache (no second request)");
  els.prevDay.click();
  assert(count(URL(INITIAL)) === 1, "current date NOT re-requested");
  assert(els.todayContent.innerHTML.includes("S-" + INITIAL), "current date rendered synchronously from cache (no loading)");

  console.log("4) rapid navigation: stale response cannot render");
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
  els.prevDay.click(); // back to day 2 -> cached
  assert(count(URL(DAY2)) === 1, "day 2 served from cache, no re-fetch");
  assert(els.todayContent.innerHTML.includes("S-" + DAY2), "day 2 rendered from cache");

  console.log("5) unavailable JSON falls back to approx for that date");
  els.nextDay.click(); // -> day 3 cached already
  els.nextDay.click(); // -> day 4 pending
  failUrl(URL(DAY4));
  await tick();
  assert(els.todayContent.innerHTML.includes("ಅಂದಾಜು"), "day 4 shows ಅಂದಾಜು approx fallback");

  console.log("\n" + pass + " passed, " + fail + " failed");
  if (fail) process.exit(1);
})();
