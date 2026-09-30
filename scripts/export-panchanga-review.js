#!/usr/bin/env node
// Exports the Panchanga tab data (only — no events) from every
// ocr-zones/<date>/structured-ocr.json record into a flat one-row-per-date
// CSV for review, with a data-source column per field group.
// Node 18+, built-ins only. Run: node scripts/export-panchanga-review.js
//
// The value cells mirror the app (app.js normalizeOCR / panchangaHTML /
// buildOCRTimings / fixOCRTime / clockMinutes / panchangaEnd) exactly.
// Source cells map the record's top-level mergeSources block to a human
// label: "pdf" -> "PV Calendar", "ocr" / "ocr-neighbor" -> "kannada calendar.in".

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OCR_DIR = path.join(ROOT, 'ocr-zones');
const OUT_DIR = path.join(ROOT, 'editorial');
const OUT_FILE = path.join(OUT_DIR, 'panchanga-review.csv');

// Canonical Kannada rashi names for the 12 jathaka columns (same list as scripts/export-editorial.js).
const RASHI_NAMES = ['ಮೇಷ', 'ವೃಷಭ', 'ಮಿಥುನ', 'ಕರ್ಕಾಟಕ', 'ಸಿಂಹ', 'ಕನ್ಯಾ', 'ತುಲಾ', 'ವೃಶ್ಚಿಕ', 'ಧನಸ್ಸು', 'ಮಕರ', 'ಕುಂಭ', 'ಮೀನ'];
const RASHI_CANONICAL = new Map(RASHI_NAMES.map((n) => [n, n]));

const TIMING_KEYS = ['rahuKala', 'gulikaKala', 'yamaganda', 'arthaPrahara', 'shubhaSamaya'];
const PANCHANGA_KEYS = ['tithi', 'nakshatra', 'yoga', 'karana'];

// Exact header order (jathaka_source precedes the 12 rashi columns).
const HEADERS = [
  'date',
  'months', 'months_source',
  'samvatsara', 'samvatsara_source',
  'shaka_year', 'shaka_year_source',
  'tithi_name', 'tithi_ends', 'tithi_source',
  'paksha', 'paksha_source',
  'nakshatra_name', 'nakshatra_ends', 'nakshatra_source',
  'yoga_name', 'yoga_ends', 'yoga_source',
  'karana_name', 'karana_ends', 'karana_source',
  'ayana', 'ayana_source',
  'solar_rashi', 'solar_rashi_source',
  'chandra_rashi', 'chandra_rashi_source',
  'sunrise', 'sunrise_source',
  'sunset', 'sunset_source',
  'rahu_kala', 'rahu_kala_source',
  'gulika_kala', 'gulika_kala_source',
  'yamaganda', 'yamaganda_source',
  'artha_prahara', 'artha_prahara_source',
  'shubha_samaya', 'shubha_samaya_source',
  'jathaka_source',
  ...RASHI_NAMES,
];

/* ---- app.js helper ports (verbatim behavior) ---------------------------- */
function pad(n) { return (n < 10 ? '0' : '') + n; }
// DD-MM-YYYY (internal key) -> YYYY-MM-DD. ISO is unambiguous in spreadsheets:
// DD-MM-YYYY gets auto-converted inconsistently by Google Sheets/Excel on import
// (days <= 12 parse as dates, day >= 13 stay text; month/day can even swap).
function isoFromKey(key) {
  const p = String(key || '').split('-');
  return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : '';
}
function numberValue(value) { const n = parseFloat(value); return isNaN(n) ? 0 : n; }
function cleanWord(value) { return String(value || '').replace(/[^\u0C80-\u0CFF\u200C\u200D\s]/g, '').trim(); }
function fixOCRTime(value, raw) {
  const parts = value.split(/[.:]/);
  let hour = +parts[0];
  if (/ಮ/u.test(raw) && hour > 0 && hour < 9) hour += 12;
  return pad(hour) + ':' + parts[1];
}
function clockMinutes(time) {
  const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = +match[1], minute = +match[2];
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}
function panchangaEnd(value, nextDay) {
  if (!value) return '—';
  const number = +value, hour = Math.floor(number), minute = Math.round((number - hour) * 100);
  let nd = nextDay;
  let h = hour;
  if (h >= 24) { h -= 24; nd = true; }
  return (nd ? 'ಮರುದಿನ ' : '') + pad(h) + ':' + pad(minute);
}
// App's buildOCRTimings per key: >=2 tokens required, then fixOCRTime on each,
// then drop when the range is not real (to < from via clockMinutes).
function buildTiming(raw) {
  const value = String(raw || '');
  const times = value.match(/(\d{1,2})[.:](\d{2})/g);
  if (!times || times.length < 2) return null;
  const from = fixOCRTime(times[0], value);
  const to = fixOCRTime(times[1], value);
  const cf = clockMinutes(from), ct = clockMinutes(to);
  if (cf == null || ct == null || ct < cf) return null;
  return from + ' – ' + to;
}

/* ---- CSV plumbing (same as scripts/export-editorial.js) -------------------------- */
function cell(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}
function csvField(v) {
  const s = cell(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* ---- source mapping ------------------------------------------------------ */
function sourceLabel(mergeValue) {
  if (mergeValue === 'pdf') return 'PV Calendar';
  if (mergeValue === 'ocr' || mergeValue === 'ocr-neighbor') return 'kannada calendar.in';
  return '';
}
// calendar field source: granular key if present, else the plain "calendar" key.
function calendarSource(ms, field) {
  return ms['calendar.' + field] !== undefined ? ms['calendar.' + field] : ms.calendar;
}

/* ---- row ----------------------------------------------------------------- */
function rowFrom(rec) {
  const c = rec.content || {};
  const cal = c.calendar || {};
  const pan = c.panchanga || {};
  const tim = c.timings || {};
  const ms = rec.mergeSources || {};

  const monthsList = (Array.isArray(cal.months) ? cal.months : []).filter((m) => String(m).trim() && String(m).trim() !== '—');
  const months = monthsList.join('–');

  const samvatsara = String(cal.samvatsara || '').trim();
  const shakaYear = cal.shakaYear !== undefined && cal.shakaYear !== null && String(cal.shakaYear).trim() !== ''
    ? String(numberValue(cal.shakaYear)) : '';

  const panEntries = {};
  for (const k of PANCHANGA_KEYS) {
    const p = pan[k] || {};
    const name = cleanWord(p.name);
    const ends = p.endsAt !== undefined && p.endsAt !== null && String(p.endsAt).trim() !== ''
      ? panchangaEnd(numberValue(p.endsAt), !!p.nextDay) : '—';
    const hasData = !!(name || (p.endsAt !== undefined && p.endsAt !== null && String(p.endsAt).trim() !== '') || p.fullDay === true);
    panEntries[k] = { name, ends, hasData };
  }

  const chandraRashi = cleanWord(pan.chandraEntryRashi || pan.chandraRashi);

  const timings = {};
  for (const k of TIMING_KEYS) timings[k] = buildTiming(tim[k]);

  const jathaka = Array.isArray(c.jathaka) ? c.jathaka : [];
  const jathakaValues = {};
  let anyJathaka = false;
  jathaka.forEach((j) => {
    const canon = RASHI_CANONICAL.get(j && j.rashi);
    if (!canon) return;
    const prediction = cleanWord(j.prediction);
    jathakaValues[canon] = prediction;
    if (prediction) anyJathaka = true;
  });

  // value + source per column
  const v = {
    date: isoFromKey((rec.source && rec.source.date) || (c.header && c.header.date)),
    months, months_source: months ? sourceLabel(calendarSource(ms, 'months')) : '',
    samvatsara, samvatsara_source: samvatsara ? sourceLabel(calendarSource(ms, 'samvatsara')) : '',
    shaka_year: shakaYear, shaka_year_source: shakaYear ? sourceLabel(calendarSource(ms, 'shakaYear')) : '',
    tithi_name: panEntries.tithi.name || '—',
    tithi_ends: panEntries.tithi.ends,
    tithi_source: panEntries.tithi.hasData ? sourceLabel(ms.tithi) : '',
    paksha: cleanWord(pan.paksha), paksha_source: cleanWord(pan.paksha) ? sourceLabel(ms.calendar) : '',
    nakshatra_name: panEntries.nakshatra.name || '—',
    nakshatra_ends: panEntries.nakshatra.ends,
    nakshatra_source: panEntries.nakshatra.hasData ? sourceLabel(ms.nakshatra) : '',
    yoga_name: panEntries.yoga.name || '—',
    yoga_ends: panEntries.yoga.ends,
    yoga_source: panEntries.yoga.hasData ? sourceLabel(ms.calendar) : '',
    karana_name: panEntries.karana.name || '—',
    karana_ends: panEntries.karana.ends,
    karana_source: panEntries.karana.hasData ? sourceLabel(ms.calendar) : '',
    ayana: cleanWord(pan.ayana), ayana_source: cleanWord(pan.ayana) ? sourceLabel(ms.calendar) : '',
    solar_rashi: cleanWord(pan.solarRashi), solar_rashi_source: cleanWord(pan.solarRashi) ? sourceLabel(ms.calendar) : '',
    chandra_rashi: chandraRashi, chandra_rashi_source: chandraRashi ? sourceLabel(ms.calendar) : '',
    sunrise: String(cal.sunrise || '').trim() || '—', sunrise_source: String(cal.sunrise || '').trim() ? sourceLabel(ms.calendar) : '',
    sunset: String(cal.sunset || '').trim() || '—', sunset_source: String(cal.sunset || '').trim() ? sourceLabel(ms.calendar) : '',
    rahu_kala: timings.rahuKala, rahu_kala_source: timings.rahuKala ? sourceLabel(ms['timings.rahuKala']) : '',
    gulika_kala: timings.gulikaKala, gulika_kala_source: timings.gulikaKala ? sourceLabel(ms['timings.gulikaKala']) : '',
    yamaganda: timings.yamaganda, yamaganda_source: timings.yamaganda ? sourceLabel(ms['timings.yamaganda']) : '',
    artha_prahara: timings.arthaPrahara, artha_prahara_source: timings.arthaPrahara ? sourceLabel(ms['timings.arthaPrahara']) : '',
    shubha_samaya: timings.shubhaSamaya, shubha_samaya_source: timings.shubhaSamaya ? sourceLabel(ms['timings.shubhaSamaya']) : '',
    jathaka_source: anyJathaka ? 'kannada calendar.in' : '',
  };
  for (const r of RASHI_NAMES) v[r] = jathakaValues[r] || '';

  return HEADERS.map((h) => csvField(v[h]));
}

/* ---- enumerate all 365 dates of 2026, chronological ---------------------- */
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dates = [];
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= DAYS[m - 1]; d++) dates.push(pad(d) + '-' + pad(m) + '-2026');
}

const sourceColumns = HEADERS.filter((h) => h.endsWith('_source'));
const tallies = Object.fromEntries(sourceColumns.map((h) => [h, {}]));
const blanks = Object.fromEntries(sourceColumns.map((h) => [h, 0]));

const rows = dates.map((dateKey) => {
  const file = path.join(OCR_DIR, dateKey, 'structured-ocr.json');
  const rec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const row = rowFrom(rec);
  // collect source tallies for this row
  HEADERS.forEach((h, i) => {
    if (sourceColumns.includes(h)) {
      const val = row[i];
      if (val) tallies[h][val] = (tallies[h][val] || 0) + 1;
      else blanks[h]++;
    }
  });
  return row.join(',');
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, '\ufeff' + [HEADERS.join(','), ...rows].join('\r\n') + '\r\n', 'utf8'); // BOM + CRLF

/* ---- console summary ----------------------------------------------------- */
console.log(`Exported ${dates.length} day(s) x ${HEADERS.length} columns -> ${OUT_FILE}`);
sourceColumns.forEach((h) => {
  const parts = Object.entries(tallies[h]).map(([k, n]) => `${n}x "${k}"`).join(', ');
  console.log(`  ${h}: ${parts || '(none)'} | blank: ${blanks[h]}`);
});