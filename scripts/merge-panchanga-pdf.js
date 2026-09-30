#!/usr/bin/env node
/* scripts/merge-panchanga-pdf.js
   Merges PDF-extracted panchanga fields (data/pdf-panchanga-data.json) into the
   per-date OCR records in ocr-zones/<DD-MM-YYYY>/structured-ocr.json.

   - PDF overrides OCR where it has data: tithi, nakshatra, rahu/gulika/yamaganda.
   - Everything else stays OCR. Empty OCR calendar samvatsara/shakaYear are filled
     from the PDF month header.
   - Dates with no OCR record get a synthetic "pdfOnly" record.
   - OCR source is preserved in structured-ocr.ocr-source.json before any overwrite,
     so re-running is idempotent.

   Usage:
     node scripts/merge-panchanga-pdf.js                # dry run (writes nothing)
     node scripts/merge-panchanga-pdf.js --apply        # performs the writes
     --pdf <path>    PDF data json (default data/pdf-panchanga-data.json)
     --ocr-root <dir>  OCR root (default ocr-zones)
     --report <path>   report path (default data/panchanga-merge-report.json)
*/
"use strict";
var fs = require("fs");
var path = require("path");

var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseArgs(argv) {
  var args = { apply: false, pdf: "data/pdf-panchanga-data.json", ocrRoot: "ocr-zones", report: "data/panchanga-merge-report.json" };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--pdf") args.pdf = argv[++i];
    else if (argv[i] === "--ocr-root") args.ocrRoot = argv[++i];
    else if (argv[i] === "--report") args.report = argv[++i];
  }
  return args;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { return null; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}
function isEmpty(v) { return v === undefined || v === null || String(v).trim() === ""; }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function weekdayOf(dateKey) {
  var p = dateKey.split("-");
  return WEEKDAYS[new Date(+p[2], +p[1] - 1, +p[0]).getDay()];
}
function monthKeyOf(dateKey) {
  var m = parseInt(dateKey.split("-")[1], 10);
  return String(m); // pdf months are keyed "1".."12"
}

/* ---- OCR source handling ------------------------------------------------ */
function ocrMainPath(root, dateKey) { return path.join(root, dateKey, "structured-ocr.json"); }
function ocrSourcePath(root, dateKey) { return path.join(root, dateKey, "structured-ocr.ocr-source.json"); }

/* Read the real OCR content for a date: prefer the preserved source, else the
   main file. A record carrying pdfOnly:true is not OCR content. */
function readOCR(root, dateKey) {
  var src = ocrSourcePath(root, dateKey);
  var main = ocrMainPath(root, dateKey);
  var file = fs.existsSync(src) ? src : (fs.existsSync(main) ? main : null);
  if (!file) return null;
  var rec = readJson(file);
  if (!rec || rec.pdfOnly === true) return null;
  return rec;
}

/* Before overwriting a date's structured-ocr.json, snapshot the current file
   once so the original OCR is never lost. */
function ensureOCRSource(root, dateKey) {
  var main = ocrMainPath(root, dateKey);
  var src = ocrSourcePath(root, dateKey);
  if (fs.existsSync(main) && !fs.existsSync(src)) {
    var cur = readJson(main);
    if (cur && cur.pdfOnly !== true) fs.copyFileSync(main, src);
  }
}

/* Nearest OCR record within the same month (previous date first, else next). */
function nearestOCRMonths(root, dateKey) {
  var p = dateKey.split("-"), d = +p[0], m = +p[1], y = +p[2];
  var dim = new Date(y, m, 0).getDate();
  var keys = [];
  for (var day = d - 1; day >= 1; day--) keys.push(pad(day) + "-" + p[1] + "-" + p[2]);
  for (var day2 = d + 1; day2 <= dim; day2++) keys.push(pad(day2) + "-" + p[1] + "-" + p[2]);
  for (var i = 0; i < keys.length; i++) {
    var rec = readOCR(root, keys[i]);
    if (rec && rec.content && rec.content.calendar && Array.isArray(rec.content.calendar.months)) {
      return JSON.parse(JSON.stringify(rec.content.calendar.months));
    }
  }
  return [];
}

/* ---- time helpers (mirror app.js fixOCRTime) ----------------------------- */
function extractTimes(raw) {
  if (!raw || typeof raw !== "string") return null;
  var times = raw.match(/(\d{1,2})[.:](\d{2})/g);
  if (!times || times.length < 2) return null;
  return times;
}
function fixOCRTime(value, raw) {
  var parts = value.split(/[.:]/), hour = +parts[0];
  if (/ಮ/u.test(raw) && hour > 0 && hour < 9) hour += 12;
  return pad(hour) + ":" + parts[1];
}
function normalizeTiming(raw) {
  var times = extractTimes(raw);
  if (!times) return null;
  return fixOCRTime(times[0], raw) + "-" + fixOCRTime(times[1], raw);
}
function endsAtMinutes(value) {
  if (isEmpty(value)) return null;
  var m = String(value).match(/(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  var h = +m[1], min = +m[2];
  if (h >= 24) h -= 24; // next-day encoding (e.g. 25.47)
  return h * 60 + min;
}

/* ---- merge --------------------------------------------------------------- */
function buildMergeSources(info) {
  var ms = { pdfOnly: info.pdfOnly };
  if (info.pdfOnly) {
    ms.tithi = "pdf";
    ms.nakshatra = "pdf";
    ms["timings.rahuKala"] = "pdf";
    ms["timings.gulikaKala"] = "pdf";
    ms["timings.yamaganda"] = "pdf";
    ms["calendar.samvatsara"] = "pdf";
    ms["calendar.shakaYear"] = "pdf";
    ms["calendar.months"] = info.monthsSource || "none";
    return ms;
  }
  if (info.tithi) ms.tithi = "pdf"; else ms.tithi = "ocr";
  if (info.nakshatra) ms.nakshatra = "pdf"; else ms.nakshatra = "ocr";
  ["rahuKala", "gulikaKala", "yamaganda"].forEach(function (k) {
    ms["timings." + k] = info.timings && info.timings[k] ? "pdf" : "ocr";
  });
  ms["timings.arthaPrahara"] = "ocr";
  ms["timings.shubhaSamaya"] = "ocr";
  ms.calendar = info.calendarSource; // "ocr" | "pdf" | "ocr+pdf"
  return ms;
}

/* Merge PDF fields into an existing OCR record. Returns {record, info}. */
function mergeOCR(ocrRec, pdf, dateKey, report) {
  var record = JSON.parse(JSON.stringify(ocrRec));
  var content = record.content = record.content || {};
  var pan = content.panchanga = content.panchanga || {};
  var cal = content.calendar = content.calendar || {};
  var tim = content.timings = content.timings || {};

  var pdfDate = (pdf.dates && pdf.dates[dateKey]) || {};
  var pdfMonth = (pdf.months && pdf.months[monthKeyOf(dateKey)]) || {};
  var pdfTimes = (pdf.weekdayTimings && pdf.weekdayTimings[weekdayOf(dateKey)]) || {};

  var info = { pdfOnly: false, tithi: false, nakshatra: false, timings: {}, calendarSource: "ocr" };

  // tithi / nakshatra: PDF overrides when present (fullDay from PDF if given)
  if (pdfDate.tithi && !isEmpty(pdfDate.tithi.name)) {
    pan.tithi = { name: pdfDate.tithi.name, endsAt: pdfDate.tithi.endsAt != null ? pdfDate.tithi.endsAt : null, nextDay: !!pdfDate.tithi.nextDay, fullDay: pdfDate.tithi.fullDay != null ? !!pdfDate.tithi.fullDay : false };
    info.tithi = true;
  }
  if (pdfDate.nakshatra && !isEmpty(pdfDate.nakshatra.name)) {
    pan.nakshatra = { name: pdfDate.nakshatra.name, endsAt: pdfDate.nakshatra.endsAt != null ? pdfDate.nakshatra.endsAt : null, nextDay: !!pdfDate.nakshatra.nextDay, fullDay: pdfDate.nakshatra.fullDay != null ? !!pdfDate.nakshatra.fullDay : false };
    info.nakshatra = true;
  }

  // timings: PDF weekday values override OCR
  ["rahuKala", "gulikaKala", "yamaganda"].forEach(function (k) {
    if (!isEmpty(pdfTimes[k])) {
      tim[k] = pdfTimes[k];
      info.timings[k] = true;
    }
  });

  // calendar: keep OCR; fill samvatsara/shakaYear when OCR is empty
  var calSource = "ocr";
  if (isEmpty(cal.samvatsara) && !isEmpty(pdfMonth.samvatsara)) { cal.samvatsara = pdfMonth.samvatsara; calSource = "pdf"; }
  if (isEmpty(cal.shakaYear) && pdfMonth.shakaYear != null) { cal.shakaYear = pdfMonth.shakaYear; calSource = calSource === "pdf" ? "pdf" : "ocr+pdf"; }
  info.calendarSource = calSource;

  record.mergeSources = buildMergeSources(info);
  return { record: record, info: info };
}

/* Build a synthetic record for a date that has no OCR at all. */
function buildPdfOnly(pdf, dateKey, ocrRoot) {
  var pdfDate = (pdf.dates && pdf.dates[dateKey]) || {};
  var pdfMonth = (pdf.months && pdf.months[monthKeyOf(dateKey)]) || {};
  var pdfTimes = (pdf.weekdayTimings && pdf.weekdayTimings[weekdayOf(dateKey)]) || {};
  var months = nearestOCRMonths(ocrRoot, dateKey);

  function panEntry(src) {
    src = src || {};
    return { name: src.name != null ? src.name : null, endsAt: src.endsAt != null ? src.endsAt : null, nextDay: !!src.nextDay, fullDay: src.fullDay != null ? !!src.fullDay : false };
  }

  var record = {
    pdfOnly: true,
    source: { date: dateKey, image: null, dimensions: null },
    content: {
      header: { date: dateKey, quote: null },
      calendar: {
        months: months,
        samvatsara: pdfMonth.samvatsara != null ? pdfMonth.samvatsara : null,
        shakaYear: pdfMonth.shakaYear != null ? pdfMonth.shakaYear : null,
        sunrise: null,
        sunset: null,
        rashi: null
      },
      events: [],
      panchanga: {
        tithi: panEntry(pdfDate.tithi),
        nakshatra: panEntry(pdfDate.nakshatra),
        paksha: null, yoga: null, karana: null,
        ayana: null, ritu: null, solarYear: null,
        solarRashi: null, chandraEntryRashi: null
      },
      timings: {
        rahuKala: pdfTimes.rahuKala != null ? pdfTimes.rahuKala : null,
        gulikaKala: pdfTimes.gulikaKala != null ? pdfTimes.gulikaKala : null,
        yamaganda: pdfTimes.yamaganda != null ? pdfTimes.yamaganda : null,
        arthaPrahara: null,
        shubhaSamaya: null
      },
      jathaka: []
    }
  };
  record.mergeSources = buildMergeSources({
    pdfOnly: true,
    monthsSource: months.length ? "ocr-neighbor" : "none"
  });
  return record;
}

/* ---- report helpers ------------------------------------------------------ */
function percentile(sorted, p) {
  if (!sorted.length) return null;
  var idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function deltaStats(values) {
  if (!values.length) return { count: 0 };
  var s = values.slice().sort(function (a, b) { return a - b; });
  return { count: s.length, p10: percentile(s, 10), p50: percentile(s, 50), p90: percentile(s, 90), max: s[s.length - 1] };
}
function timingComparisonFor(rawOcr, rawPdf) {
  var ocr = normalizeTiming(rawOcr);
  var pdf = normalizeTiming(rawPdf);
  return { ocr: ocr, pdf: pdf, match: !!(ocr && pdf && ocr === pdf) };
}

/* -------------------------------------------------------------------------- */
function main() {
  var args = parseArgs(process.argv.slice(2));
  var pdf = readJson(args.pdf);
  if (!pdf) {
    console.error("merge-panchanga-pdf: PDF data not found at " + args.pdf);
    process.exit(1);
  }

  var report = {
    generatedAt: new Date().toISOString(),
    counts: {
      datesProcessed: 0,
      ocrDatesMerged: 0,
      pdfOnlyDatesCreated: 0,
      pdfOverridesApplied: 0,
      fieldOverrides: { tithi: 0, nakshatra: 0, rahuKala: 0, gulikaKala: 0, yamaganda: 0, calendarFill: 0 },
      datesWithDisagreements: 0,
      datesWherePdfHadNoData: 0
    },
    disagreements: {},
    timingComparisons: {},
    endsAtDeltas: { tithi: [], nakshatra: [] },
    pdfNoDataDates: []
  };

  var root = args.ocrRoot;
  var ocrDates = [];
  if (fs.existsSync(root)) {
    ocrDates = fs.readdirSync(root).filter(function (n) {
      return /^\d{2}-\d{2}-\d{4}$/.test(n) && fs.statSync(path.join(root, n)).isDirectory();
    });
  }
  var pdfDates = Object.keys(pdf.dates || {});
  var allDates = Array.from(new Set(ocrDates.concat(pdfDates))).sort();
  report.counts.datesProcessed = allDates.length;

  var weekdayTimingCounts = {}; // weekday -> field -> {value -> count}
  var outputs = [];

  allDates.forEach(function (dateKey) {
    var ocrRec = readOCR(root, dateKey);
    var hasPdf = (pdf.dates || {}).hasOwnProperty(dateKey);
    var record, info;

    if (ocrRec) {
      report.counts.ocrDatesMerged++;
      var res = mergeOCR(ocrRec, pdf, dateKey, report);
      record = res.record;
      info = res.info;

      if (info.tithi) report.counts.fieldOverrides.tithi++;
      if (info.nakshatra) report.counts.fieldOverrides.nakshatra++;
      ["rahuKala", "gulikaKala", "yamaganda"].forEach(function (k) {
        if (info.timings[k]) report.counts.fieldOverrides[k]++;
      });
      if (info.calendarSource !== "ocr") report.counts.fieldOverrides.calendarFill++;

      if (!hasPdf) {
        report.counts.datesWherePdfHadNoData++;
        report.pdfNoDataDates.push(dateKey);
      }

      // disagreements (only when both sides have data)
      if (hasPdf) {
        var pdfDate = (pdf.dates && pdf.dates[dateKey]) || {};
        var pdfMonth = (pdf.months && pdf.months[monthKeyOf(dateKey)]) || {};
        var dis = {};
        var ocrT = ocrRec.content && ocrRec.content.panchanga && ocrRec.content.panchanga.tithi;
        var ocrN = ocrRec.content && ocrRec.content.panchanga && ocrRec.content.panchanga.nakshatra;
        var ocrCal = ocrRec.content && ocrRec.content.calendar;
        if (ocrT && ocrT.name && pdfDate.tithi && pdfDate.tithi.name && String(ocrT.name).trim() !== String(pdfDate.tithi.name).trim()) {
          dis.tithi = { ocr: ocrT.name, pdf: pdfDate.tithi.name };
        }
        if (ocrN && ocrN.name && pdfDate.nakshatra && pdfDate.nakshatra.name && String(ocrN.name).trim() !== String(pdfDate.nakshatra.name).trim()) {
          dis.nakshatra = { ocr: ocrN.name, pdf: pdfDate.nakshatra.name };
        }
        if (ocrCal && ocrCal.samvatsara && pdfMonth.samvatsara && String(ocrCal.samvatsara).trim() !== String(pdfMonth.samvatsara).trim()) {
          dis.samvatsara = { ocr: ocrCal.samvatsara, pdf: pdfMonth.samvatsara };
        }
        if (ocrCal && ocrCal.shakaYear != null && pdfMonth.shakaYear != null && Number(ocrCal.shakaYear) !== Number(pdfMonth.shakaYear)) {
          dis.shakaYear = { ocr: ocrCal.shakaYear, pdf: pdfMonth.shakaYear };
        }
        if (Object.keys(dis).length) {
          report.disagreements[dateKey] = dis;
          report.counts.datesWithDisagreements++;
        }

        // endsAt deltas
        ["tithi", "nakshatra"].forEach(function (k) {
          var o = ocrRec.content && ocrRec.content.panchanga && ocrRec.content.panchanga[k] && endsAtMinutes(ocrRec.content.panchanga[k].endsAt);
          var p = pdfDate[k] && endsAtMinutes(pdfDate[k].endsAt);
          if (o != null && p != null) {
            var d = Math.abs(p - o);
            if (d > 720) d = 1440 - d; // midnight wrap
            report.endsAtDeltas[k].push(d);
          }
        });

        // timing comparisons per weekday (OCR original vs PDF)
        var wd = weekdayOf(dateKey);
        var ocrTim = (ocrRec.content && ocrRec.content.timings) || {};
        var pdfWt = (pdf.weekdayTimings && pdf.weekdayTimings[wd]) || {};
        weekdayTimingCounts[wd] = weekdayTimingCounts[wd] || { rahuKala: {}, gulikaKala: {}, yamaganda: {} };
        ["rahuKala", "gulikaKala", "yamaganda"].forEach(function (k) {
          var norm = normalizeTiming(ocrTim[k]);
          if (norm) {
            var c = weekdayTimingCounts[wd][k];
            c[norm] = (c[norm] || 0) + 1;
            if (!report.timingComparisons[wd]) report.timingComparisons[wd] = {};
            if (!report.timingComparisons[wd][k]) report.timingComparisons[wd][k] = timingComparisonFor(norm, pdfWt[k]);
          }
        });
      }

      // pdf-override applied at date level?
      if (info.tithi || info.nakshatra || Object.keys(info.timings).length || info.calendarSource !== "ocr") {
        report.counts.pdfOverridesApplied++;
      }
      outputs.push({ dateKey: dateKey, record: record, pdfOnly: false });

    } else if (hasPdf) {
      report.counts.pdfOnlyDatesCreated++;
      record = buildPdfOnly(pdf, dateKey, root);
      outputs.push({ dateKey: dateKey, record: record, pdfOnly: true });
    }
  });

  // finalize timing comparisons: pick most common OCR value per weekday
  Object.keys(report.timingComparisons).forEach(function (wd) {
    ["rahuKala", "gulikaKala", "yamaganda"].forEach(function (k) {
      if (!report.timingComparisons[wd][k]) return;
      var counts = weekdayTimingCounts[wd][k] || {};
      var best = null, bestN = 0;
      Object.keys(counts).forEach(function (v) {
        if (counts[v] > bestN) { best = v; bestN = counts[v]; }
      });
      if (best) {
        report.timingComparisons[wd][k].ocr = best;
        report.timingComparisons[wd][k].match = best === report.timingComparisons[wd][k].pdf;
      }
    });
  });
  report.endsAtDeltas = { tithi: deltaStats(report.endsAtDeltas.tithi), nakshatra: deltaStats(report.endsAtDeltas.nakshatra) };

  // ---- dry run / apply
  var c = report.counts;
  console.log("merge-panchanga-pdf: " + (args.apply ? "APPLY" : "DRY RUN (no writes)"));
  console.log("  PDF data     : " + args.pdf);
  console.log("  OCR root     : " + args.ocrRoot);
  console.log("  dates        : " + c.datesProcessed + " processed, " + c.ocrDatesMerged + " OCR merged, " + c.pdfOnlyDatesCreated + " pdf-only created");
  console.log("  overrides    : " + c.pdfOverridesApplied + " dates with PDF fields applied (" + JSON.stringify(c.fieldOverrides) + ")");
  console.log("  disagreements: " + c.datesWithDisagreements + " dates");
  Object.keys(report.disagreements).forEach(function (d) {
    console.log("    " + d + " " + JSON.stringify(report.disagreements[d]));
  });
  console.log("  pdf no data  : " + c.datesWherePdfHadNoData + " dates" + (c.datesWherePdfHadNoData ? " [" + report.pdfNoDataDates.join(", ") + "]" : ""));

  if (!args.apply) return;

  outputs.forEach(function (o) {
    var dir = path.join(root, o.dateKey);
    fs.mkdirSync(dir, { recursive: true });
    if (!o.pdfOnly) ensureOCRSource(root, o.dateKey);
    fs.writeFileSync(ocrMainPath(root, o.dateKey), JSON.stringify(o.record, null, 2), "utf8");
  });
  writeJson(args.report, report);
  console.log("  wrote " + outputs.length + " records; report -> " + args.report);
}

main();