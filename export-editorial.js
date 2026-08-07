#!/usr/bin/env node
// Exports all ocr-zones/<date>/structured-ocr.json records into a single
// flat CSV for editorial review/edit in Google Sheets.
// Node 18+, built-ins only. Run: node export-editorial.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OCR_DIR = path.join(ROOT, 'ocr-zones');
const OUT_DIR = path.join(ROOT, 'editorial');
const OUT_FILE = path.join(OUT_DIR, 'calendar-editorial.csv');

// Canonical Kannada rashi names for rows 1..12 (verified consistent across all records).
const RASHI_NAMES = ['ಮೇಷ', 'ವೃಷಭ', 'ಮಿಥುನ', 'ಕರ್ಕಾಟಕ', 'ಸಿಂಹ', 'ಕನ್ಯಾ', 'ತುಲಾ', 'ವೃಶ್ಚಿಕ', 'ಧನಸ್ಸು', 'ಮಕರ', 'ಕುಂಭ', 'ಮೀನ'];
// Map each rashi to its canonical spelling; unknown names are reported as data loss.
const RASHI_CANONICAL = new Map(RASHI_NAMES.map((n) => [n, n]));

const TIMING_KEYS = ['rahuKala', 'gulikaKala', 'yamaganda', 'arthaPrahara', 'shubhaSamaya'];
// Canonical abbreviated period prefixes (OCR variants -> canonical). Anything else -> UNKNOWN.
const PREFIX_CANONICAL = {
  ಬೆ: 'ಬೆ.', ಬಿ: 'ಬೆ.', ಬ: 'ಬೆ.', ಭ: 'ಬೆ.', ಚೆ: 'ಬೆ.', ಚ: 'ಬೆ.', // morning
  ಮ: 'ಮ.', ಪ: 'ಮ.',                                                   // afternoon
  ಸ: 'ಸ.', ಸಾ: 'ಸ.',                                                  // evening
  ರಾ: 'ರಾ.',                                                          // night
  ಜ: 'ಜ.',                                                            // distinct (retained)
};
// Printed time tokens: 1-2 digits, optional : or . separator, 1-2 digits.
const TIME_TOKEN = /\d{1,2}[:.,]?\d{1,2}/g;

// Stable column order. Do not rename — the reverse CSV->JSON converter keys off these.
const HEADERS = [
  'date',
  'source_image',
  'months',
  'samvatsara',
  'shakaYear',
  'rashi',
  'sunrise',
  'sunset',
  'quote',
  // events (max seen in data = 13)
  ...Array.from({ length: 13 }, (_, i) => `event_${String(i + 1).padStart(2, '0')}`),
  // panchanga: tithi/nakshatra/yoga/karana x name/end_time
  // end_time keeps the raw endsAt text; FULL DAY replaces fullDay=true; >=24 means next-day
  'tithi_name', 'tithi_end_time',
  'nakshatra_name', 'nakshatra_end_time',
  'yoga_name', 'yoga_end_time',
  'karana_name', 'karana_end_time',
  'ayana',
  'ritu',
  'solarYear',
  'paksha',
  'solarRashi',
  'chandraEntryRashi',
  // timings: 5 keys x (prefix, from, to, prefix_2, from_2, to_2) — up to two comma/semicolon-separated ranges
  ...TIMING_KEYS.flatMap((k) => [`${k}_prefix`, `${k}_from`, `${k}_to`, `${k}_prefix_2`, `${k}_from_2`, `${k}_to_2`]),
  // jathaka: one fixed column per canonical Kannada rashi name, value = prediction
  ...RASHI_NAMES,
];

// TRUE/FALSE for booleans; everything else stays raw text (blank ok).
function cell(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  return String(v);
}

// RFC 4180: quote when field contains comma, quote, CR or LF; double the quotes.
function csvField(v) {
  const s = cell(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Split a raw timing value into up to two ranges (comma/semicolon separated).
// Each range: { prefix, from, to } with printed time tokens preserved as text.
function parseTiming(raw, date, key) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return [{}, {}];
  const frags = String(raw).split(/(?<=\d)\s*[,;]\s*/).map((s) => s.trim()).filter(Boolean);
  return [0, 1].map((i) => {
    const frag = frags[i];
    if (!frag) return {};
    const body = frag.replace(/^[\s_.\-)(]+/, ''); // strip leading OCR junk
    const pm = body.match(/^[^\d\s]+/);            // leading non-digit token = prefix
    const prefix = pm ? pm[0].replace(/[.,;:]+$/, '') : '';
    const tokens = (body.match(TIME_TOKEN) || []).map((t) => t.replace(/[:.,]+$/, '')); // drop trailing junk
    const canon = PREFIX_CANONICAL[prefix];
    if (!canon) warn([`${date}|${key}|"${prefix}"`]);
    return { prefix: canon || 'UNKNOWN', from: tokens[0] || '', to: tokens[1] || '' };
  });
}

function rowFrom(rec) {
  const c = rec.content || {};
  const cal = c.calendar || {};
  const pan = c.panchanga || {};
  const tim = c.timings || {};
  const events = Array.isArray(c.events) ? c.events : [];
  const jathaka = Array.isArray(c.jathaka) ? c.jathaka : [];

  const months = Array.isArray(cal.months) ? cal.months.join('|') : cal.months;

  // end_time: keep printed endsAt as text; FULL DAY when fullDay is true (endsAt blank);
  // blank when neither is available.
  function endTime(p) {
    if (p.endsAt !== undefined && p.endsAt !== null && String(p.endsAt).trim() !== '') return p.endsAt;
    if (p.fullDay === true) return 'FULL DAY';
    return '';
  }

  const panRow = {};
  for (const k of ['tithi', 'nakshatra', 'yoga', 'karana']) {
    const p = pan[k] || {};
    panRow[`${k}_name`] = p.name;
    panRow[`${k}_end_time`] = endTime(p);
  }

  const values = {
    date: (rec.source && rec.source.date) || (c.header && c.header.date),
    source_image: rec.source && rec.source.image,
    months,
    samvatsara: cal.samvatsara,
    shakaYear: cal.shakaYear,
    rashi: cal.rashi,
    sunrise: cal.sunrise,
    sunset: cal.sunset,
    quote: c.header && c.header.quote,
  };

  events.forEach((ev, i) => { if (i < 13) values[`event_${String(i + 1).padStart(2, '0')}`] = ev; });
  Object.assign(values, panRow);
  values.ayana = pan.ayana;
  values.ritu = pan.ritu;
  values.solarYear = pan.solarYear;
  values.paksha = pan.paksha;
  values.solarRashi = pan.solarRashi;
  values.chandraEntryRashi = pan.chandraEntryRashi;
  for (const k of TIMING_KEYS) {
    const [r1, r2] = parseTiming(tim[k], values.date, k);
    values[`${k}_prefix`] = r1.prefix;
    values[`${k}_from`] = r1.from;
    values[`${k}_to`] = r1.to;
    values[`${k}_prefix_2`] = r2.prefix;
    values[`${k}_from_2`] = r2.from;
    values[`${k}_to_2`] = r2.to;
  }
  // jathaka: prediction under the canonical rashi column; unknown rashi names are reported (not silently dropped).
  const jathakaWarnings = [];
  jathaka.forEach((j) => {
    const canon = RASHI_CANONICAL.get(j.rashi);
    if (!canon) { jathakaWarnings.push(j.rashi); return; }
    values[canon] = j.prediction;
  });
  jathakaWarnings.length && warn(new Set(jathakaWarnings));

  return HEADERS.map((h) => csvField(values[h]));
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : (e.name === 'structured-ocr.json' ? [full] : []);
  });
}

const files = walk(OCR_DIR).sort();
const warnings = new Set();
const timingWarnings = [];
function warn(items) { items.forEach((w) => (w.includes('|') ? timingWarnings.push(w) : warnings.add(w))); }

const rows = [HEADERS.join(','), ...files.map((f) => rowFrom(JSON.parse(fs.readFileSync(f, 'utf8'))).join(','))];

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, '\ufeff' + rows.join('\r\n') + '\r\n', 'utf8'); // BOM + CRLF for Excel/Sheets friendliness

if (warnings.size) {
  console.error(`WARNING: ${warnings.size} non-canonical jathaka rashi name(s) left blank: ${[...warnings].join(', ')}`);
}
const unknownTiming = [...timingWarnings];
if (unknownTiming.length) {
  console.error(`WARNING: ${unknownTiming.length} unknown timing prefix(es) -> UNKNOWN (fix against source image): ${unknownTiming.join('; ')}`);
}
console.log(`Exported ${files.length} day(s) -> ${OUT_FILE}`);
