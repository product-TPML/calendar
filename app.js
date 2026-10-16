/* ಕನ್ನಡ ಸಾಂಸ್ಕೃತಿಕ ಕ್ಯಾಲೆಂಡರ್ — plain JS, no dependencies.
   Data source: data/pv-calendar-data.json (one normalized event index). */
(function () {
  "use strict";

  var DEFAULT_KEY = keyFor(new Date());
  var SESSION_VERSION = "5";

  /* ---------------- State & helpers ---------------- */
  var state = { key: DEFAULT_KEY, tab: "day", big: false, kn: false,
    pv: null, pvIndex: {}, pvRecords: [], pvError: false, pvPending: null, pvQA: [],
    calRecords: null, calMerged: false,
    cultural: null, culturalIndex: {}, culturalRecords: [], culturalError: false, culturalPending: null,
    panData: {}, panPending: {}, panCore: null, panCorePending: null, panDistricts: {}, homeMode: "events", district: "",
    notices: null, noticesError: false, noticesPending: null, noticesDummy: false, noticesShown: false, noticeCat: "",
    weekFirst: null, weekLast: null, weekHeader: null, monthFirst: null, monthLast: null, monthHeader: null };

  var WEEKDAYS = ["ಭಾನುವಾರ", "ಸೋಮವಾರ", "ಮಂಗಳವಾರ", "ಬುಧವಾರ", "ಗುರುವಾರ", "ಶುಕ್ರವಾರ", "ಶನಿವಾರ"];
  var WEEKDAYS_SHORT = ["ಭಾ", "ಸೋ", "ಮಂ", "ಬು", "ಗು", "ಶು", "ಶ"];
  var MONTHS = ["ಜನವರಿ", "ಫೆಬ್ರವರಿ", "ಮಾರ್ಚ್", "ಏಪ್ರಿಲ್", "ಮೇ", "ಜೂನ್", "ಜುಲೈ", "ಆಗಸ್ಟ್", "ಸೆಪ್ಟೆಂಬರ್", "ಅಕ್ಟೋಬರ್", "ನವೆಂಬರ್", "ಡಿಸೆಂಬರ್"];
  var KN_DIGITS = ["೦", "೧", "೨", "೩", "೪", "೫", "೬", "೭", "೮", "೯"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parseKey(k) { var p = k.split("-"); return new Date(+p[2], +p[1] - 1, +p[0]); }
  function keyFor(d) { return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear(); }
  function kn(s) { return state.kn ? String(s).replace(/\d/g, function (d) { return KN_DIGITS[+d]; }) : String(s); }
  function validKey(key) {
    if (!/^\d{2}-\d{2}-\d{4}$/.test(String(key || ""))) return false;
    var p = String(key).split("-"), d = +p[0], m = +p[1], y = +p[2];
    return y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) && keyFor(new Date(y, m - 1, d)) === key;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------- PV calendar data (district event sheets) ----------------
     Fetched once over HTTP and cached. On load failure we show an event-data
     error. Dates are handled as strings
     (ISO "YYYY-MM-DD" in the JSON, DD-MM-YYYY keys in the app) with explicit
     conversion; no Date/timezone parsing of ISO dates. ---------------- */
  var PV_URL = "data/pv-calendar-data.json";
  var CAL_EVENTS_URL = "data/calendar-events.json";
  var CULTURAL_URL = "epaper/cultural-event-candidates.json";
  var SKELETON = function (text) { return '<div class="skeleton" role="status" aria-live="polite"><span class="sr-only">' + text + '</span><i></i><i></i><i></i></div>'; };
  var PV_LOADING = SKELETON("ಘಟನೆ ದತ್ತಾಂಶ ಲೋಡ್ ಆಗುತ್ತಿದೆ…");
  var PV_ERROR = '<p class="empty-note">ಘಟನೆ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ.</p>';
  var CULTURAL_LOADING = '<p class="empty-note">ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…</p>';
  var CULTURAL_ERROR = '<p class="empty-note">ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮಗಳ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ.</p>';
  var PAN_LOADING = SKELETON("ಪಂಚಾಂಗದ ವಿವರಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…");

  function daysInMonth(y, m) { /* m 1-12, no Date/timezone involved */
    return [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  }
  function isoToKey(iso) { var p = iso.split("-"); return p[2] + "-" + p[1] + "-" + p[0]; }
  function keyToIso(key) { var p = key.split("-"); return p[2] + "-" + p[1] + "-" + p[0]; }
  function addDaysIso(iso, n) {
    var p = iso.split("-"), y = +p[0], m = +p[1], d = +p[2] + n;
    while (d > daysInMonth(y, m)) { d -= daysInMonth(y, m); m++; if (m > 12) { m = 1; y++; } }
    while (d < 1) { m--; if (m < 1) { m = 12; y--; } d += daysInMonth(y, m); }
    return y + "-" + pad(m) + "-" + pad(d);
  }

  /* Index every JSON record by the DD-MM-YYYY keys it is active on. date_end is
     inclusive: a record is active on every date from start through end. */
  function isValidIso(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    var p = iso.split("-"), y = +p[0], m = +p[1], d = +p[2];
    return y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
  }

  function isoDistance(start, end) {
    var count = 0, iso = start;
    while (iso !== end && count <= 366) { iso = addDaysIso(iso, 1); count++; }
    return iso === end ? count + 1 : Infinity;
  }

  function indexPV(json) {
    var index = {}, records = [], qa = [];
    var sheets = (json && json.sheets) || {};
    Object.keys(sheets).forEach(function (district) {
      (sheets[district] || []).forEach(function (rec) {
        var start = String(rec.date || "").trim();
        if (!isValidIso(start)) { qa.push({ district: district, record: rec, reason: "invalid start date" }); return; }
        var end = String(rec.date_end || rec.date || "").trim();
        if (!isValidIso(end) || end < start || isoDistance(start, end) > 366) {
          qa.push({ district: district, record: rec, reason: "invalid date range" });
          return;
        }
        var r = {
          sourceDistrict: district,
          dateStart: start,
          dateEnd: end,
          rawDate: rec.date,
          title: String(rec.name_of_festival || ""),
          place: String(rec.place || ""),
          scope: String(rec.relevance || ""),
          eventType: "religious"
        };
        records.push(r);
        var iso = start;
        while (true) {
          (index[isoToKey(iso)] = index[isoToKey(iso)] || []).push(r);
          if (iso === end) break;
          iso = addDaysIso(iso, 1);
        }
      });
    });
    return { index: index, records: records, qa: qa };
  }

  function fetchPV() {
    if (state.pvError) return Promise.resolve(null);
    if (state.pv) return Promise.resolve(state.pv);
    if (state.pvPending) return state.pvPending;
    state.pvPending = fetch(PV_URL)
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (json) {
        var idx = indexPV(json);
        state.pv = json;
        state.pvIndex = idx.index;
        state.pvRecords = idx.records;
        state.pvQA = idx.qa;
        state.calMerged = false;
        mergeCalendarEvents();
        return json;
      })
      .catch(function () { state.pvError = true; return null; })
      .then(function (json) { delete state.pvPending; return json; });
    return state.pvPending;
  }

  /* Day-level events from the PV calendar Word files (data/calendar-events.json).
     Shown as Karnataka-wide events, merged into the PV index so every view
     (Day, Week, Month, counts) picks them up. Failure to load is silent: the
     district event data stays usable without it. */
  function mergeCalendarEvents() {
    if (!state.pv || !state.calRecords || state.calMerged) return;
    state.calMerged = true;
    state.calRecords.forEach(function (r) {
      state.pvRecords.push(r);
      (state.pvIndex[isoToKey(r.dateStart)] = state.pvIndex[isoToKey(r.dateStart)] || []).push(r);
    });
  }

  function fetchCalendarEvents() {
    return fetch(CAL_EVENTS_URL)
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (json) {
        var events = (json && json.events) || {};
        state.calRecords = [];
        Object.keys(events).forEach(function (key) {
          if (!validKey(key)) return;
          var iso = keyToIso(key), items = [].concat(events[key] || []);
          items.forEach(function (title) {
            title = String(title || "").trim();
            if (!title) return;
            state.calRecords.push({ sourceDistrict: "", dateStart: iso, dateEnd: iso, rawDate: iso, title: title,
              place: "", scope: "Relevant for Karnataka", eventType: "religious", source: "calendar" });
          });
        });
        mergeCalendarEvents();
      })
      .catch(function () { state.calRecords = null; });
  }

  var CULTURAL_DISTRICTS = {
    "ಬೆಂಗಳೂರು ನಗರ": "Bengaluru Urban",
    "ಮೈಸೂರು ನಗರ": "Mysuru",
    "ಹುಬ್ಬಳ್ಳಿ-ಧಾರವಾಡ": "Dharwad",
    "ಕಲಬುರ್ಗಿ ನಗರ": "Kalaburagi",
    "ತುಮಕೂರು": "Tumakuru",
    "ಚಿತ್ರದುರ್ಗ": "Chitradurga",
    "ದಾವಣಗೆರೆ": "Davanagere",
    "ಕೊಪ್ಪಳ": "Koppal"
  };

  function indexCultural(json) {
    var index = {}, records = [];
    (json && json.records || []).forEach(function (rec) {
      var start = String(rec.date || "").trim(), source = rec.source || {};
      if (!isValidIso(start)) return;
      var sourceDistrict = CULTURAL_DISTRICTS[source.edition] || String(source.edition || "").trim();
      if (!sourceDistrict) return;
      var r = {
        sourceDistrict: sourceDistrict,
        dateStart: start,
        dateEnd: start,
        rawDate: start,
        title: String(rec.title || ""),
        place: String(rec.location || ""),
        scope: "Cultural district",
        eventType: "cultural",
        startTime: String(rec.startTime || ""),
        category: String(rec.category || ""),
        sourceArticleId: String(source.articleId || ""),
        sourceUrl: String(source.siteUrl || source.articleUrl || "")
      };
      records.push(r);
      (index[isoToKey(start)] = index[isoToKey(start)] || []).push(r);
    });
    return { index: index, records: records };
  }

  function fetchCultural() {
    if (state.culturalError) return Promise.resolve(null);
    if (state.cultural) return Promise.resolve(state.cultural);
    if (state.culturalPending) return state.culturalPending;
    state.culturalPending = fetch(CULTURAL_URL)
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (json) {
        var idx = indexCultural(json);
        state.cultural = json;
        state.culturalIndex = idx.index;
        state.culturalRecords = idx.records;
        return json;
      })
      .catch(function () { state.culturalError = true; return null; })
      .then(function (json) { delete state.culturalPending; return json; });
    return state.culturalPending;
  }

  /* ---------------- Panchanga data (no OCR) ----------------
     data/panchanga.json: one record per day, the same for every district.
     data/panchanga/<district>.json: that district's sunrise, sunset, kalas, yoga and karana.
     Anything missing is left empty and the tab says it is not available. */
  var PAN_URL = "data/panchanga.json", PAN_DISTRICT_DIR = "data/panchanga/";
  var NA = "ಲಭ್ಯವಿಲ್ಲ";
  var HOROSCOPE_URL = "https://www.prajavani.net/horoscope";

  function unavailablePan(key) {
    return { key: key, unavailable: true, calendar: {}, panchanga: null, timings: [], jathaka: [] };
  }

  /* "HH:MM" or "HH:MM+1" -> { ends: 26.10, nextDay: true }; anything else -> null */
  function timeField(text) {
    var m = String(text || "").match(/^(\d{1,2}):(\d{2})(?:\+(\d))?$/);
    if (!m) return null;
    var days = m[3] ? +m[3] : 0;
    return { ends: (+m[1] + days * 24) + (+m[2]) / 100, nextDay: days > 0 };
  }

  function namedEntry(entry) {
    if (!entry || !entry.name) return { name: "", ends: 0, nextDay: false, full: false };
    return { name: entry.name, ends: entry.ends ? +entry.ends : 0, nextDay: !!entry.ends && +entry.ends >= 24, full: !!entry.fullDay };
  }

  var KALA_DEFS = [
    { index: 2, name: "ರಾಹು ಕಾಲ", tone: "bad" },
    { index: 3, name: "ಗುಳಿಕ ಕಾಲ", tone: "bad" },
    { index: 4, name: "ಯಮಗಂಡ", tone: "bad" },
    { index: 5, name: "ಅರ್ಧ ಪ್ರಹರ", tone: "mid" }
  ];

  function buildPanchangaRecord(core, dist, key) {
    var day = core && core.days && core.days[key];
    if (!day) return unavailablePan(key);
    var p = key.split("-"), year = p[2];
    var dayOfYear = Math.round((Date.UTC(+p[2], +p[1] - 1, +p[0]) - Date.UTC(+p[2], 0, 1)) / 864e5);
    var row = dist && dist[year] && dist[year][dayOfYear];
    var yogaEnd = row ? timeField(row[7]) : null, karanaEnd = row ? timeField(row[9]) : null, nextEnd = row ? timeField(row[11]) : null;
    var karana2 = row && core.karanaNames[row[10] - 1] ? { name: core.karanaNames[row[10] - 1], ends: nextEnd ? nextEnd.ends : 0, nextDay: !!(nextEnd && nextEnd.nextDay) } : null;
    var timings = [];
    if (row) {
      KALA_DEFS.forEach(function (def) {
        var m = String(row[def.index] || "").match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
        if (m) timings.push({ name: def.name, tone: def.tone, from: m[1], to: m[2] });
      });
    }
    var tithi = namedEntry(day.tithi);
    tithi.paksha = day.paksha || "";
    return {
      key: key,
      calendar: {
        months: day.months || [], samvatsara: day.samvatsara || "", shakaYear: day.shakaYear || 0,
        sunrise: row ? row[0] : "", sunset: row ? row[1] : ""
      },
      panchanga: {
        tithi: tithi, nakshatra: namedEntry(day.nakshatra),
        yoga: row && core.yogaNames[row[6] - 1] ? { name: core.yogaNames[row[6] - 1], ends: yogaEnd ? yogaEnd.ends : 0, nextDay: !!(yogaEnd && yogaEnd.nextDay) } : { name: "", ends: 0, nextDay: false },
        karana: row && core.karanaNames[row[8] - 1] ? { name: core.karanaNames[row[8] - 1], ends: karanaEnd ? karanaEnd.ends : 0, nextDay: !!(karanaEnd && karanaEnd.nextDay), then: karana2 } : { name: "", ends: 0, nextDay: false },
        ayana: day.ayana || "", solarRashi: day.solarRashi || "", chandraRashi: day.chandraRashi || ""
      },
      timings: timings,
      jathaka: []
    };
  }

  function fetchJSON(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
  }

  function loadPanchangaCore() {
    if (state.panCore) return Promise.resolve(state.panCore);
    if (!state.panCorePending) {
      state.panCorePending = fetchJSON(PAN_URL).then(function (json) { state.panCore = json; return json; })
        .catch(function () { state.panCorePending = null; return null; });
    }
    return state.panCorePending;
  }

  function loadPanchangaDistrict(core) {
    var name = state.district && core.districts && core.districts[state.district] ? state.district : core.defaultDistrict;
    var slug = core.districts && core.districts[name];
    if (!slug) return Promise.resolve({ name: name, rows: null });
    if (state.panDistricts[slug]) return Promise.resolve(state.panDistricts[slug]);
    return fetchJSON(PAN_DISTRICT_DIR + slug + ".json").then(function (json) {
      return (state.panDistricts[slug] = { name: name, rows: json });
    }).catch(function () { return { name: name, rows: null }; });
  }

  function panchangaCacheKey(key) { return key + "|" + (state.district || ""); }

  function fetchPanchanga(key) {
    var ck = panchangaCacheKey(key);
    if (Object.prototype.hasOwnProperty.call(state.panData, ck)) return Promise.resolve(state.panData[ck]);
    if (state.panPending[ck]) return state.panPending[ck];
    state.panPending[ck] = loadPanchangaCore().then(function (core) {
      if (!core) return unavailablePan(key);
      return loadPanchangaDistrict(core).then(function (district) {
        var record = buildPanchangaRecord(core, district.rows, key);
        record.districtName = district.name;
        record.districtMissing = !district.rows;
        return record;
      });
    }).catch(function () { return unavailablePan(key); }).then(function (record) {
      state.panData[ck] = record;
      delete state.panPending[ck];
      return record;
    });
    return state.panPending[ck];
  }

  function pvEventsFor(key) { return (state.pvIndex[key] || []).slice(); }
  function districtEventsFor(key) {
    return pvEventsFor(key).filter(function (r) {
      return r.sourceDistrict === state.district && r.scope !== "Relevant for Karnataka";
    });
  }
  function stateEventsFor(key) {
    return pvEventsFor(key).filter(function (r) { return r.scope === "Relevant for Karnataka"; });
  }

  function culturalEventsFor(key) {
    if (!state.district) return [];
    return (state.culturalIndex[key] || []).filter(function (r) { return r.sourceDistrict === state.district; });
  }

  function visibleRecord(r) {
    return r.scope === "Relevant for Karnataka" ||
      (state.district && r.sourceDistrict === state.district && r.scope !== "Relevant for Karnataka");
  }

  var ICO_CAL_ADD = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="ico" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M12 12.8v4.4M9.8 15h4.4"/></svg>';

  /* Rows that open a day (Week) are one big button; elsewhere a row gets an add-to-calendar button. */
  function calButton(r) {
    return '<button type="button" class="ev-cal" aria-label="ಕ್ಯಾಲೆಂಡರ್‌ಗೆ ಸೇರಿಸಿ" title="ಕ್ಯಾಲೆಂಡರ್‌ಗೆ ಸೇರಿಸಿ" data-start="' + esc(r.dateStart) + '" data-end="' + esc(r.dateEnd) +
      '" data-title="' + esc(r.title) + '" data-place="' + esc(r.place) + '">' + ICO_CAL_ADD + '</button>';
  }

  function pvRow(r, when, dayKey) {
    var place = r.place ? ' <span class="ev-place">' + esc(r.place) + '</span>' : "";
    var scope = r.scope === "Relevant for Karnataka" ? "state" : "district";
    var open = dayKey ? '<button type="button" class="event-link" data-day="' + dayKey + '">' : "";
    var close = dayKey ? '</button>' : "";
    return '<li class="ev-row event-row scope-' + scope + '">' + open + '<span class="ev-mark" aria-hidden="true"></span><span class="ev-text">' + esc(r.title) + place + (when ? ' <span class="ev-when">' + esc(when) + '</span>' : "") + '</span>' + close + (dayKey ? "" : calButton(r)) + '</li>';
  }

  /* Add-to-calendar sheet: Google Calendar link or an .ics download (Apple, Outlook, others). */
  function closeCalSheet() {
    var sheet = document.getElementById("calSheet");
    if (sheet) sheet.hidden = true;
  }

  function openCalSheet(btn) {
    var tools = window.CalendarExport;
    if (!tools) return;
    var ev = { start: btn.dataset.start, end: btn.dataset.end, title: btn.dataset.title, place: btn.dataset.place };
    var sheet = document.getElementById("calSheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "calSheet";
      sheet.className = "cal-sheet";
      sheet.addEventListener("click", function (e) {
        var t = e.target;
        if (t === sheet || (t.closest && t.closest(".cal-close"))) closeCalSheet();
        else if (t.closest && t.closest(".cal-google")) setTimeout(closeCalSheet, 0);
        else if (t.closest && t.closest(".cal-ics")) {
          var cur = sheet._ev, blob = new Blob([tools.ics(cur)], { type: "text/calendar;charset=utf-8" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = tools.icsFilename(cur);
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          closeCalSheet();
        }
      });
      document.body.appendChild(sheet);
    }
    sheet._ev = ev;
    sheet.innerHTML = '<div class="cal-panel" role="dialog" aria-modal="true" aria-label="ಕ್ಯಾಲೆಂಡರ್‌ಗೆ ಸೇರಿಸಿ">' +
      '<p class="cal-title">' + esc(ev.title) + '</p>' +
      '<a class="cal-opt cal-google" href="' + esc(tools.googleUrl(ev)) + '" target="_blank" rel="noopener">ಗೂಗಲ್ ಕ್ಯಾಲೆಂಡರ್</a>' +
      '<button type="button" class="cal-opt cal-ics">ಇತರ ಕ್ಯಾಲೆಂಡರ್ (.ics ಫೈಲ್)</button>' +
      '<button type="button" class="cal-opt cal-close">ಮುಚ್ಚು</button></div>';
    sheet.hidden = false;
    var first = sheet.querySelector(".cal-google");
    if (first && first.focus) first.focus();
  }

  /* Compact/expand list for the new district/state containers (unique ids). */
  var pvSeq = 0;
  function pvListHTML(records) {
    if (!records.length) return '<p class="empty-note">ಈ ದಿನ ಯಾವುದೇ ವಿಶೇಷ ದಿನವಿಲ್ಲ.</p>';
    var limit = 3, hidden = records.slice(limit);
    var out = '<div class="ev-panel"><ul class="ev-list">' + records.slice(0, limit).map(function (r) { return pvRow(r); }).join("") + "</ul>";
    if (hidden.length) {
      var id = "pvx-" + (++pvSeq);
      out += '<ul class="ev-list" id="' + id + '" hidden>' + hidden.map(function (r) { return pvRow(r); }).join("") + "</ul>" +
        '<div class="ev-more"><button class="chip-more" id="btn-' + id + '" type="button" aria-expanded="false">ಮತ್ತೆ +' + hidden.length + '</button></div>';
    }
    return out + "</div>";
  }

  function bindExpand(container) {
    container.querySelectorAll(".chip-more").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var list = document.getElementById(btn.id.replace("btn-", ""));
        var open = list.hidden;
        list.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        btn.textContent = open ? "ಮುಚ್ಚು" : "ಮತ್ತೆ +" + list.querySelectorAll(".ev-row").length;
      });
    });
  }

  function rangeFor(mode) {
    var selected = parseKey(state.key), start = selected, end = selected;
    if (mode === "week") { start = weekStart(state.weekHeader || state.key); end = new Date(start); end.setDate(end.getDate() + 6); }
    if (mode === "month") {
      var month = state.monthHeader ? state.monthHeader.split("-") : [selected.getFullYear(), selected.getMonth()];
      start = new Date(+month[0], +month[1], 1); end = new Date(+month[0], +month[1] + 1, 0);
    }
    return { start: keyToIso(keyFor(start)), end: keyToIso(keyFor(end)) };
  }

  /* Display names only; the English key stays the value used for data lookups. */
  var DISTRICT_KN = {
    "Bagalkot": "ಬಾಗಲಕೋಟೆ", "Ballari": "ಬಳ್ಳಾರಿ", "Belagavi": "ಬೆಳಗಾವಿ",
    "Bengaluru Rural": "ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ", "Bengaluru South (Ramanagara)": "ಬೆಂಗಳೂರು ದಕ್ಷಿಣ (ರಾಮನಗರ)",
    "Bengaluru Urban": "ಬೆಂಗಳೂರು ನಗರ", "Bidar": "ಬೀದರ್", "Chamarajanagar": "ಚಾಮರಾಜನಗರ",
    "Chikkaballapur": "ಚಿಕ್ಕಬಳ್ಳಾಪುರ", "Chikkamagaluru": "ಚಿಕ್ಕಮಗಳೂರು", "Chitradurga": "ಚಿತ್ರದುರ್ಗ",
    "Dakshina Kannada": "ದಕ್ಷಿಣ ಕನ್ನಡ", "Davanagere": "ದಾವಣಗೆರೆ", "Dharwad": "ಧಾರವಾಡ",
    "Gadag": "ಗದಗ", "Hassan": "ಹಾಸನ", "Haveri": "ಹಾವೇರಿ", "Kalaburagi": "ಕಲಬುರಗಿ",
    "Kodagu": "ಕೊಡಗು", "Kolar": "ಕೋಲಾರ", "Mandya": "ಮಂಡ್ಯ", "Mysuru": "ಮೈಸೂರು",
    "Koppal": "ಕೊಪ್ಪಳ", "Raichur": "ರಾಯಚೂರು", "Shivamogga": "ಶಿವಮೊಗ್ಗ", "Tumakuru": "ತುಮಕೂರು",
    "Udupi": "ಉಡುಪಿ", "Uttara Kannada": "ಉತ್ತರ ಕನ್ನಡ", "Vijayapura": "ವಿಜಯಪುರ",
    "Vijayanagara": "ವಿಜಯನಗರ", "Yadgir": "ಯಾದಗಿರಿ"
  };
  function districtLabel(name) { return DISTRICT_KN[name] || name; }

  function districtEventCount(name, mode) {
    mode = mode || "all";
    if (mode === "notices") return currentNotices(name, keyToIso(state.key)).length;
    var range = rangeFor(mode);
    var count = state.pvRecords.filter(function (r) {
      return r.sourceDistrict === name && r.scope !== "Relevant for Karnataka" && (mode === "all" || (r.dateStart <= range.end && r.dateEnd >= range.start));
    }).length;
    if (!state.cultural) return count;
    return count + state.culturalRecords.filter(function (r) {
      return r.sourceDistrict === name && (mode === "all" || (r.dateStart <= range.end && r.dateEnd >= range.start));
    }).length;
  }

  function districtOptionsHTML(mode) {
    if (!state.pv) return '<option value="">ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ</option>';
    var options = Object.keys(state.pv.sheets).map(function (name, order) {
      return { name: name, count: districtEventCount(name, mode), order: order };
    }).sort(function (a, b) {
      return b.count - a.count || a.order - b.order;
    });
    return '<option value="">ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ</option>' + options.map(function (option) {
      var name = option.name;
      return '<option value="' + esc(name) + '"' + (name === state.district ? " selected" : "") + '>' + esc(districtLabel(name)) + (option.count ? ' (' + option.count + ')' : '') + '</option>';
    }).join("");
  }

  function districtListboxHTML(mode) {
    var options = state.pv ? Object.keys(state.pv.sheets).map(function (name, order) {
      return { name: name, count: districtEventCount(name, mode), order: order };
    }).sort(function (a, b) {
      return b.count - a.count || a.order - b.order;
    }) : [];
    /* "Clear" only makes sense once a district is chosen. */
    var clear = state.district ? '<button type="button" class="district-option district-clear" role="option" data-district-value="" aria-selected="false"><span class="district-option-name">ಜಿಲ್ಲೆ ತೆರವುಗೊಳಿಸಿ</span></button>' : "";
    return clear + options.map(function (option) {
      return '<button type="button" class="district-option" role="option" data-district-value="' + esc(option.name) + '" aria-selected="' + (option.name === state.district) + '"><span class="district-option-name">' + esc(districtLabel(option.name)) + '</span>' + (option.count ? '<span class="district-option-count" aria-label="' + option.count + ' ಕಾರ್ಯಕ್ರಮಗಳು">' + option.count + '</span>' : '') + '</button>';
    }).join("") + '<p class="district-empty" role="presentation" hidden>ಯಾವುದೇ ಜಿಲ್ಲೆ ಕಂಡುಬಂದಿಲ್ಲ</p>';
  }

  var ICON_PIN = '<svg class="district-pin" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
  var ICON_CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  function districtPickerHTML(id, mode) {
    var menuId = id + "Menu", triggerId = id + "Trigger";
    return '<div id="' + id + 'Picker" class="district-picker" data-district-picker="" data-select-id="' + id + '"' + (state.district && state.pv && state.pv.sheets[state.district] ? "" : ' data-empty="1"') + '>' +
      '<button type="button" id="' + triggerId + '" class="district-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + menuId + '" aria-label="ಜಿಲ್ಲೆ ಆಯ್ಕೆ">' +
        ICON_PIN + '<span class="district-trigger-text">' + districtPickerLabel() + '</span><span class="district-trigger-chevron" aria-hidden="true">' + ICON_CHEVRON + '</span>' +
      '</button>' +
      '<div class="district-panel">' +
        '<span class="district-sheet-title">ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ</span>' +
        '<input type="search" class="district-search" placeholder="ಜಿಲ್ಲೆ ಹುಡುಕಿ" aria-label="ಜಿಲ್ಲೆ ಹುಡುಕಿ" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<div id="' + menuId + '" class="district-menu" role="listbox" aria-label="ಜಿಲ್ಲೆ ಆಯ್ಕೆ" hidden>' + districtListboxHTML(mode) + '</div>' +
      '</div>' +
    '</div>';
  }

  function districtControlHTML(id, mode, name) {
    return '<select id="' + id + '" class="district-select district-native" name="' + name + '" hidden aria-hidden="true" tabindex="-1">' + districtOptionsHTML(mode) + '</select>' + districtPickerHTML(id, mode);
  }

  function districtPickerLabel() {
    if (!state.pv || !state.district || !state.pv.sheets[state.district]) return "ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ";
    return districtLabel(state.district);
  }

  function syncDistrictPicker(picker, id, mode) {
    if (!picker || !picker.querySelector) return;
    var trigger = picker.querySelector(".district-trigger"), menu = picker.querySelector(".district-menu");
    if (!trigger || !menu) return;
    trigger.querySelector(".district-trigger-text").textContent = districtPickerLabel();
    if (state.district && state.pv && state.pv.sheets[state.district]) picker.removeAttribute("data-empty");
    else picker.setAttribute("data-empty", "1");
    var search = picker.querySelector(".district-search");
    if (search) search.value = "";
    menu.innerHTML = districtListboxHTML(mode);
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    picker.classList.remove("is-open");
  }

  function renderDistrictPicker(id, mode) {
    var select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = districtOptionsHTML(mode);
    select.hidden = true;
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    if (!select.insertAdjacentHTML) return;
    var picker = document.getElementById(id + "Picker");
    if (!picker || !picker.dataset || picker.dataset.districtPicker == null) {
      select.insertAdjacentHTML("afterend", districtPickerHTML(id, mode));
      picker = document.getElementById(id + "Picker");
    } else {
      syncDistrictPicker(picker, id, mode);
    }
  }

  /* Week and Month keep one picker each, with no visible trigger. The district
     name in every period heading opens it, so the district stays in view
     wherever the stream is scrolled to. */
  function districtLinkHTML(pickerId) {
    return '<button type="button" class="district-link" data-picker="' + pickerId + '" aria-label="ಜಿಲ್ಲೆ ಬದಲಿಸಿ: ' + esc(districtPickerLabel()) + '">' + ICON_PIN + '<span>' + esc(districtPickerLabel()) + '</span></button>';
  }

  function openDistrictFromLink(e) {
    var link = e.target && e.target.closest ? e.target.closest(".district-link") : null;
    if (!link) return false;
    if (e.stopPropagation) e.stopPropagation();   /* or the document click handler closes the picker again */
    var trigger = document.getElementById(link.dataset.picker + "Trigger");
    if (trigger) trigger.click();
    return true;
  }

  function eventGroupHTML(id, title, records, stateGroup, headingExtra) {
    return '<section class="ev-section' + (stateGroup ? " state" : "") + '" aria-labelledby="' + id + 'Title">' +
      '<div class="ev-section-head"><h3 class="ev-section-title" id="' + id + 'Title" tabindex="-1">' + title + '</h3>' + (headingExtra || "") + '</div>' +
      '<div id="' + id + '" class="ev-container">' + pvListHTML(records) + '</div></section>';
  }

  /* Event card — district and state groups live inside one card. */
  function pvEventsHTML(key) {
    if (state.pvError) return PV_ERROR;
    if (!state.pv) return PV_LOADING;
    var local = districtEventsFor(key), statewide = stateEventsFor(key);
    var selector = '<span class="sr-only" id="districtSelectLabel">ಜಿಲ್ಲೆ ಆಯ್ಕೆ</span>' + districtControlHTML("districtSelect", "day", "district");
    return eventGroupHTML("districtEvents", "ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು (" + local.length + ")", local, false, selector) +
      eventGroupHTML("stateEvents", "ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು (" + statewide.length + ")", statewide, true);
  }

  function bindEventCardUI() {
    bindDistrictSelectors();
    ["body-homeToday", "body-homeUpcoming"].forEach(function (id) {
      var body = document.getElementById(id);
      if (body) bindExpand(body);
    });
  }

  /* ---------------- Inline SVG accent (no icon dependency). ---------------- */
  var ICO_ATTR = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="ico" stroke-linecap="round" stroke-linejoin="round"';
  var ICO_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8"';
  var ICO_SOLID = 'fill="currentColor" stroke="none"';
  var ICONS = {
    sunrise:
      '<svg ' + ICO_ATTR + ' ' + ICO_STROKE + '><path d="M4 17.5h16"/><path d="M8.5 17.5a3.5 3.5 0 0 1 7 0"/><path d="M12 5v2.2"/><path d="M6.6 7.6l1.6 1.6"/><path d="M17.4 7.6l-1.6 1.6"/></svg>',
    sunset:
      '<svg ' + ICO_ATTR + ' ' + ICO_STROKE + '><path d="M4 17.5h16"/><path d="M8.5 17.5a3.5 3.5 0 0 1 7 0"/><path d="M12 5v2.2"/><path d="M6.6 7.6l1.6 1.6"/><path d="M17.4 7.6l-1.6 1.6"/></svg>',
    tithi:
      '<svg ' + ICO_ATTR + ' ' + ICO_SOLID + '><path d="M15 4A8 8 0 1 0 23 12A6 6 0 0 1 15 4Z"/></svg>',
    nakshatra:
      '<svg ' + ICO_ATTR + ' ' + ICO_SOLID + '><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>',
    yoga:
      '<svg ' + ICO_ATTR + ' ' + ICO_SOLID + '><path d="M14.5 4.5A7.5 7.5 0 1 0 22 12.2 5.8 5.8 0 0 1 14.5 4.5z"/><circle cx="7.6" cy="9.5" r="2.4"/></svg>',
    karana:
      '<svg ' + ICO_ATTR + ' ' + ICO_SOLID + '><path d="M12 4a8 8 0 1 0 0 16z"/></svg>',
    diya:
      '<svg ' + ICO_ATTR + ' ' + ICO_STROKE + '><path fill="currentColor" stroke="none" d="M12 2.8c1.5 2 2.5 3.3 2.5 4.9a2.5 2.5 0 1 1-5 0c0-1.6 1-2.9 2.5-4.9z"/><path d="M6 12.5a3.2 3.2 0 0 0 3.2 3.2h5.6A3.2 3.2 0 0 0 18 12.5z"/></svg>'
  };

  /* ---------------- Date navigation ---------------- */
  function goto(key) {
    state.key = key;
    saveDate(key);
    renderMasthead();
    renderActive();
  }

  /* ---------------- Render: Today ---------------- */
  /* The card heading already says "events", so the section is labelled for
     assistive tech only and empty scopes are collapsed into one line. */
  function homeCategoryHTML(id, body, className) {
    return '<section class="home-category ' + (className || '') + '" id="' + id + '" aria-label="ಕಾರ್ಯಕ್ರಮಗಳು">' + body + '</section>';
  }

  function homeEventsHTML(key, id) {
    var local = districtEventsFor(key), statewide = stateEventsFor(key), cultural = culturalEventsFor(key);
    var district = state.district ? local.concat(cultural) : [];
    var notes = "";
    if (!state.district) notes += '<p class="empty-note">ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳನ್ನು ನೋಡಲು ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ.</p>';
    else if (state.culturalError) notes += CULTURAL_ERROR;
    else if (!state.cultural) notes += CULTURAL_LOADING;
    var body = weekScopesHTML("", district, statewide);
    if (!district.length && !statewide.length && state.district && !notes) {
      body = '<p class="empty-note">ಈ ದಿನ ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.</p>';
    }
    return homeCategoryHTML(id, body + notes, "homeEvents");
  }

  function panchangaEnd(value, nextDay) {
    if (!value) return "—";
    var number = +value, hour = Math.floor(number), minute = Math.round((number - hour) * 100);
    if (hour >= 24) { hour -= 24; nextDay = true; }
    return (nextDay ? '<span class="nd">ಮರುದಿನ ' : "") + pad(hour) + ":" + pad(minute) + (nextDay ? "</span>" : "");
  }

  function endsSub(entry) {
    if (!entry.name) return "";
    if (entry.full) return "ದಿನಪೂರ್ತಿ";
    if (!entry.ends) return "ಅಂತ್ಯ ಸಮಯ " + NA;
    return "ಮುಗಿಯುವುದು " + panchangaEnd(entry.ends, entry.nextDay);
  }

  /* A karana lasts about six hours, so a day has two or three: show the one at sunrise and the next. */
  function karanaSub(karana) {
    var sub = endsSub(karana);
    if (karana.then && karana.then.name) sub += " · ನಂತರ " + esc(karana.then.name) + " " + panchangaEnd(karana.then.ends, karana.then.nextDay);
    return sub;
  }

  function districtNoteHTML(record) {
    if (!record.districtName) return "";
    var note = record.districtMissing ? "ಜಿಲ್ಲೆಯ ಸಮಯ " + NA : "ಸೂರ್ಯೋದಯ-ಸೂರ್ಯಾಸ್ತ ಆಧಾರಿತ ಲೆಕ್ಕಾಚಾರ · " + esc(districtLabel(record.districtName));
    if (!state.district) note += " (ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿಲ್ಲ)";
    return '<p class="src-note">' + note + '</p>';
  }

  function panchangaCard(label, name, sub, featured, icon) {
    return '<div class="panga-card' + (featured ? " featured" : "") + '"><span class="panga-head">' + icon + '<span class="panga-label">' + label + '</span></span><span class="panga-name">' + esc(name || "—") + '</span><span class="panga-sub">' + sub + '</span></div>';
  }

  function panchangaMetaHTML(pan) {
    var items = [["ಆಯನ", pan.ayana || NA], ["ಸೂರ್ಯ ರಾಶಿ", pan.solarRashi || NA], ["ಚಂದ್ರ ರಾಶಿ", pan.chandraRashi || NA]];
    return items.length ? '<div class="panga-meta">' + items.map(function (item) {
      return '<div class="pm-item"><span class="pm-label">' + item[0] + '</span><span class="pm-value">' + esc(item[1]) + '</span></div>';
    }).join("") + '</div>' : '';
  }

  var TONE_WORD = { good: "ಶುಭ", mid: "ಮಧ್ಯಮ", bad: "ಅಶುಭ" };

  function durationLabel(minutes) {
    var h = Math.floor(minutes / 60), m = minutes % 60;
    return (h ? kn(h) + " ಗಂ" : "") + (h && m ? " " : "") + (m ? kn(m) + " ನಿ" : "");
  }

  function panchangaTimingsHTML(record) {
    if (!record.timings.length) return '<p class="empty-note">ಈ ದಿನದ ಕಾಲ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.</p>';
    var calendar = record.calendar;
    var sourceTimings = record.timings;
    if (!sourceTimings.length) return '<p class="empty-note">ಈ ದಿನದ ಕಾಲ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.</p>';
    /* Only use complete, real clock ranges
       for layout. In particular, do not turn an overnight-looking range into
       a next-day range here. */
    var ordered = sourceTimings.map(function (timing) {
      var from = clockMinutes(timing.from), to = clockMinutes(timing.to);
      return { source: timing, from: from, to: to };
    }).filter(function (timing) {
      return timing.from != null && timing.to != null && timing.to >= timing.from;
    }).sort(function (a, b) { return a.from - b.from; });
    var sunStart = clockMinutes(calendar.sunrise), sunEnd = clockMinutes(calendar.sunset);
    /* ponytail: sunrise/sunset are a fallback only; timing endpoints are the
       source of truth whenever at least one complete range is usable. */
    var start = ordered.length ? Math.min.apply(null, ordered.map(function (timing) { return timing.from; })) : sunStart;
    var end = ordered.length ? Math.max.apply(null, ordered.map(function (timing) { return timing.to; })) : sunEnd;
    if (start == null && end == null) return '<p class="empty-note">ಈ ದಿನದ ಕಾಲ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.</p>';
    if (start == null) start = end;
    if (end == null) end = start;
    var span = Math.max(end - start, 0);
    var blocks = ordered.map(function (timing) {
      var left = span ? (timing.from - start) / span * 100 : 0;
      var width = span ? (timing.to - timing.from) / span * 100 : 0;
      var source = timing.source;
      return '<div class="tl-block ' + source.tone + '" role="listitem" style="left:' + left.toFixed(1) + '%;width:' + Math.max(width, 4).toFixed(1) + '%" title="' + esc(source.name) + " " + source.from + "–" + source.to + '"><b>' + esc(source.name) + '</b>' + kn(source.from) + '–' + kn(source.to) + '</div>';
    }).join("");
    var rows = ordered.map(function (timing) {
      var source = timing.source;
      /* Mobile card: name and tone word (so colour is not the only cue), time and length,
         and a thin bar showing where it falls between the first start and the last end. */
      var barLeft = span ? (timing.from - start) / span * 100 : 0, barWidth = span ? (timing.to - timing.from) / span * 100 : 0;
      return '<li class="tl-row ' + source.tone + '"><span class="tone-dot timeline-node ' + source.tone + '" aria-hidden="true"></span><span class="tl-main timeline-card">' +
        '<span class="tl-head"><span class="tl-name">' + esc(source.name) + '</span><span class="tl-tone">' + TONE_WORD[source.tone] + '</span></span>' +
        '<span class="tl-when"><span class="t-time">' + kn(source.from) + ' – ' + kn(source.to) + '</span><span class="tl-dur">' + durationLabel(timing.to - timing.from) + '</span></span>' +
        '<span class="tl-bar" aria-hidden="true"><i style="left:' + barLeft.toFixed(1) + '%;width:' + Math.max(barWidth, 2).toFixed(1) + '%"></i></span></span></li>';
    }).join("");
    var startLabel = clockLabel(start), endLabel = clockLabel(end);
    return '<div class="timeline" aria-label="ಕಾಲಗಳ ಸಮಯರೇಖೆ"><div class="tl-track" role="list" aria-label="ಕಾಲಗಳ ವ್ಯಾಪ್ತಿಗಳು">' + blocks + '</div><div class="tl-ends"><span class="tl-endpoint"><small>ಆರಂಭ</small><b class="t-time">' + kn(startLabel) + '</b></span><span class="tl-endpoint"><small>ಅಂತ್ಯ</small><b class="t-time">' + kn(endLabel) + '</b></span></div></div>' +
      '<ul class="timing-list timeline-mobile timeline-rail" aria-label="ಕಾಲಗಳ ವಿವರಗಳು">' + rows + '</ul><div class="timing-legend" aria-label="ಕಾಲಗಳ ಬಣ್ಣದ ಅರ್ಥ"><span><i class="tone-dot good" aria-hidden="true"></i> ಶುಭ</span><span><i class="tone-dot mid" aria-hidden="true"></i> ಮಧ್ಯಮ</span><span><i class="tone-dot bad" aria-hidden="true"></i> ಅಶುಭ</span></div>';
  }

  function panchangaJathakaHTML(record) {
    if (!record.jathaka.length) return '<p class="empty-note">ಈ ದಿನದ ರಾಶಿ ಭವಿಷ್ಯ ಲಭ್ಯವಿಲ್ಲ.</p><a class="ext-link" href="' + HOROSCOPE_URL + '" target="_blank" rel="noopener noreferrer">ಪ್ರಜಾವಾಣಿಯಲ್ಲಿ ದೈನಂದಿನ ರಾಶಿ ಭವಿಷ್ಯ ನೋಡಿ ↗</a>';
    return '<div class="jathaka-list">' + record.jathaka.map(function (item) {
      return '<div class="jr"><span class="jr-name">' + esc(item[0]) + '</span><span class="jr-p">' + esc(item[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  function clockMinutes(time) {
    var match = String(time || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    var hour = +match[1], minute = +match[2];
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
  }

  function clockLabel(minutes) {
    return minutes == null ? "—" : pad(Math.floor(minutes / 60)) + ":" + pad(minutes % 60);
  }

  function panchangaHTML(key) {
    var inner = "";
    if (!Object.prototype.hasOwnProperty.call(state.panData, panchangaCacheKey(key))) {
      fetchPanchanga(key).then(function () { if (state.key === key && state.homeMode === "panchanga") renderToday(); });
      inner = PAN_LOADING;
    } else {
      var record = state.panData[panchangaCacheKey(key)];
      if (record.unavailable) {
        inner = '<p class="empty-note">ಈ ದಿನದ ಪಂಚಾಂಗದ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.</p>';
      } else {
        var cal = record.calendar, pan = record.panchanga;
        var meta = [];
        if (cal.samvatsara) meta.push(esc(cal.samvatsara) + " ನಾಮ ಸಂವತ್ಸರ");
        if (cal.shakaYear) meta.push("ಶಕ " + kn(cal.shakaYear));
        if (cal.months.length) meta.push(esc(cal.months.join("–")));
        var tithiSub = endsSub(pan.tithi);
        if (pan.tithi.paksha) tithiSub = esc(pan.tithi.paksha) + " ಪಕ್ಷ" + (tithiSub ? " · " + tithiSub : "");
        inner = '<section class="date-context" aria-label="ದಿನದ ಕಾಲದ ಸಂದರ್ಭ"><p>' + (meta.join(" · ") || "ದಿನದ ವಿವರ") + '</p></section>' +
          '<div id="panchangaSection" class="panga-grid" tabindex="-1">' +
            panchangaCard("ತಿಥಿ", pan.tithi.name || NA, tithiSub, true, ICONS.tithi) +
            panchangaCard("ನಕ್ಷತ್ರ", pan.nakshatra.name || NA, endsSub(pan.nakshatra), true, ICONS.nakshatra) +
            (panchangaCard("ಯೋಗ", pan.yoga.name || NA, endsSub(pan.yoga), false, ICONS.yoga) + panchangaCard("ಕರಣ", pan.karana.name || NA, karanaSub(pan.karana), false, ICONS.karana)) +
          '</div>' + panchangaMetaHTML(pan) +
          ('<div class="sun-row"><span class="sun-item sunrise-item"><span class="sun-ico" aria-hidden="true">' + ICONS.sunrise + '</span> ಸೂರ್ಯೋದಯ <b>' + (cal.sunrise ? kn(cal.sunrise) : NA) + '</b></span><span class="sun-item sunset-item"><span class="sun-ico" aria-hidden="true">' + ICONS.sunset + '</span> ಸೂರ್ಯಾಸ್ತ <b>' + (cal.sunset ? kn(cal.sunset) : NA) + '</b></span></div>') +
          '<p class="src-note">' + "ತಿಥಿ, ನಕ್ಷತ್ರ: ಕ್ಯಾಲೆಂಡರ್ ಆಧಾರದಲ್ಲಿ · ಉಳಿದವು: ಲೆಕ್ಕಾಚಾರದಿಂದ" + '</p>' +
          card("ಸಮಯಗಳು — ಕಾಲ", panchangaTimingsHTML(record) + '<p class="empty-note">ಶುಭ ಸಮಯ: ' + NA + '</p>' + districtNoteHTML(record), "homeTimings", false) +
          card("ರಾಶಿ ಭವಿಷ್ಯ", panchangaJathakaHTML(record), "homeJathaka", false);
      }
    }
    return '<div class="panchanga-view">' + inner + '</div>';
  }

  function homeTodayHTML(key) {
    if (state.pvError) return PV_ERROR;
    if (!state.pv) return PV_LOADING;
    return homeEventsHTML(key, "homeEvents");
  }

  function upcomingHTML(fromKey) {
    if (state.pvError) return PV_ERROR;
    if (!state.pv) return PV_LOADING;
    var from = keyToIso(fromKey), days = [];
    for (var i = 1; i <= 7; i++) {
      var iso = addDaysIso(from, i), key = isoToKey(iso), local = districtEventsFor(key), statewide = stateEventsFor(key), cultural = culturalEventsFor(key);
      if (!local.length && !statewide.length && !cultural.length) continue;
      var day = parseKey(key);
      var content = '<section class="upcoming-day"' + (day.getDay() === 0 ? ' data-sun="1"' : "") + '><h3 class="upcoming-date"><button type="button" class="week-day-link" data-day="' + key + '">' +
        '<span class="week-day-label"><span class="week-day-name">' + WEEKDAYS[day.getDay()] + '</span></span>' +
        '<span class="week-day-date"><b>' + kn(day.getDate()) + '</b><small>' + MONTHS[day.getMonth()] + '</small></span></button></h3>';
      if (local.length || statewide.length || cultural.length) content += homeEventsHTML(key, "upcomingEvents" + i);
      days.push(content + '</section>');
    }
    return days.length ? '<div class="upcoming-list">' + days.join("") + '</div>' : '<p class="empty-note">ಮುಂದಿನ 7 ದಿನಗಳಲ್ಲಿ ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮಗಳಿಲ್ಲ.</p>';
  }

  function stripLegendHTML() {
    return '<div class="scope-legend strip-legend" aria-label="ಕಾರ್ಯಕ್ರಮದ ವ್ಯಾಪ್ತಿ">' + legendItemsHTML() + '</div>';
  }

  /* Sunday-first week around the selected day, so any date this week is one tap away. */
  function dayStripHTML(key) {
    var sel = parseKey(key), start = new Date(sel), todayKey = keyFor(new Date()), out = '<nav class="day-strip" aria-label="ವಾರದ ದಿನಗಳು">';
    start.setDate(start.getDate() - start.getDay());
    for (var i = 0; i < 7; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var k = keyFor(d), local = state.pv ? districtEventsFor(k).length + culturalEventsFor(k).length : 0, wide = state.pv ? stateEventsFor(k).length : 0;
      out += '<button type="button" class="ds-day' + (k === key ? " sel" : "") + (k === todayKey ? " today" : "") + (d.getDay() === 0 ? " sun" : "") + '" data-day="' + k + '"' + (k === key ? ' aria-current="date"' : "") +
        ' aria-label="' + WEEKDAYS[d.getDay()] + " " + kn(d.getDate()) + " " + MONTHS[d.getMonth()] + '">' +
        '<span class="ds-wd">' + WEEKDAYS_SHORT[d.getDay()] + '</span><span class="ds-num">' + kn(d.getDate()) + '</span>' +
        '<span class="ds-dots" aria-hidden="true">' + (local ? markHTML("district") : "") + (wide ? markHTML("state") : "") + dayAlertHTML(k) + '</span></button>';
    }
    return out + '</nav>';
  }

  function homeNoticeCount(key) {
    return state.district ? noticesOn(state.district, keyToIso(key)).length : 0;
  }

  /* The notices option exists while the district has a notice on the day or in
     the days after it. Without one the day shows Events, even if notices were
     open on the previous day. */
  function homeNoticesAvailable(key) {
    var iso = keyToIso(key);
    return !!state.district && ((state.notices && state.notices[state.district]) || []).some(function (n) { return noticeCurrent(n, iso); });
  }

  function homeMode() {
    return state.homeMode === "notices" && !homeNoticesAvailable(state.key) ? "events" : state.homeMode;
  }

  var ICO_NOTICE = '<svg ' + ICO_ATTR + ' ' + ICO_STROKE + '><path d="M12 4.5 3.5 19.5h17z"/><path d="M12 10.5v4.2M12 17.2v.1"/></svg>';

  function homeHeaderHTML(key) {
    var d = parseKey(key), noticeCount = homeNoticeCount(key), current = homeMode();
    var mode = function (id, name, icon, label) {
      return '<button id="' + id + '" type="button" role="tab" aria-selected="' + (current === name) + '" class="' + (current === name ? "is-active" : "") + '">' + icon + '<span class="switch-label">' + label + '</span></button>';
    };
    return dayStripHTML(key) + stripLegendHTML() + '<section class="home-header" aria-labelledby="homeDateTitle">' +
      '<div class="home-date"' + (d.getDay() === 0 ? ' data-sun="1"' : "") + '><div class="home-day-line"><div class="home-day-label"><span class="home-day-name">' + WEEKDAYS[d.getDay()] + '</span>' + (key === keyFor(new Date()) ? '<span class="today-pill">ಇಂದು</span>' : "") + '</div><div class="home-day-date"><strong id="homeDateTitle">' + kn(d.getDate()) + '</strong><small>' + MONTHS[d.getMonth()] + ' ' + kn(d.getFullYear()) + '</small></div></div></div>' +
      '<label class="home-district"><span id="homeDistrictLabel">ಜಿಲ್ಲೆ</span>' + districtControlHTML("homeDistrictSelect", current === "notices" ? "notices" : "day", "homeDistrict") + '</label>' + '</section>' +
      '<div class="home-switch" role="tablist" aria-label="ಮುಖಪುಟದ ವಿಷಯ">' + mode("homeEventsMode", "events", ICONS.diya, "ಕಾರ್ಯಕ್ರಮ") +
        (homeNoticesAvailable(key) ? mode("homeNoticesMode", "notices", '<span class="switch-alert' + (noticeCount ? " is-live" : "") + '">' + ICO_NOTICE + '</span>',
          "ಸೂಚನೆ" + (noticeCount ? ' <span class="switch-count" aria-label="' + noticeCount + ' ಸೂಚನೆಗಳು">' + kn(noticeCount) + '</span>' : "")) : "") +
        mode("homePanchangaMode", "panchanga", ICONS.tithi, "ಪಂಚಾಂಗ") + '</div>';
  }

  function bindHomeModeUI() {
    document.querySelectorAll(".ds-day, .upcoming-day .week-day-link").forEach(function (button) {
      button.addEventListener("click", function () { goto(button.dataset.day); });
    });
    [["homeEventsMode", "events"], ["homeNoticesMode", "notices"], ["homePanchangaMode", "panchanga"]].forEach(function (item) {
      var button = document.getElementById(item[0]);
      if (!button || button._homeModeBound) return;
      button._homeModeBound = true;
      button.addEventListener("click", function () {
        if (homeMode() === item[1]) return;
        state.homeMode = item[1];
        renderToday();
      });
    });
  }

  function renderToday() {
    var title = state.key === DEFAULT_KEY ? "ಇಂದಿನ ಕಾರ್ಯಕ್ರಮಗಳು" : "ಈ ದಿನದ ಕಾರ್ಯಕ್ರಮಗಳು";
    var el = document.getElementById("todayContent"), current = homeMode(), content;
    if (current === "notices") content = noticesViewHTML();
    else if (current === "panchanga") content = card("ಇಂದಿನ ಪಂಚಾಂಗ", panchangaHTML(state.key), "homeToday", false, ICONS.diya);
    else content = card(title, homeTodayHTML(state.key), "homeToday", false, ICONS.diya) + card("ಮುಂದಿನ 7 ದಿನಗಳ ಕಾರ್ಯಕ್ರಮಗಳು", upcomingHTML(state.key), "homeUpcoming", false);
    el.innerHTML = homeHeaderHTML(state.key) + content;
    bindNotices(el);
    bindHomeModeUI();
    bindEventCardUI();
  }

  function card(title, body, id, collapsed, icon) {
    var head = icon
      ? '<span class="card-title">' + icon + " " + title + '</span>'
      : '<span class="card-title">' + title + '</span>';
    return '<section class="card">' +
      '<h2 class="card-heading" id="toggle-' + id + '" tabindex="-1">' + head + '</h2>' +
      '<div class="card-body" id="body-' + id + '">' + body + '</div></section>';
  }

  /* ---------------- Notices (power, water, public work, railway) ----------------
     District notices for the selected day and the days after it, shown as the
     middle option of the Home switch. The dummy file is used by default; the Settings
     switch turns it off. */
  var NOTICES_URL = "data/utility-notices.json", NOTICES_DUMMY_URL = "data/utility-notices.dummy.json";
  var NOTICE_DAYS = 14;
  var NOTICE_CATS = [
    { key: "Power Cut", cls: "power", label: "ವಿದ್ಯುತ್ ವ್ಯತ್ಯಯ", short: "ವಿದ್ಯುತ್",
      icon: '<svg ' + ICO_ATTR + ' ' + ICO_SOLID + '><path d="M13.5 2.5 5 13.5h5.5l-1 8L18.5 10H13z"/></svg>' },
    { key: "Water Supply", cls: "water", label: "ನೀರು ಪೂರೈಕೆ ವ್ಯತ್ಯಯ", short: "ನೀರು",
      icon: '<svg ' + ICO_ATTR + ' ' + ICO_SOLID + '><path d="M12 2.8c3.4 4.3 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.6-6.7 6-11z"/></svg>' },
    { key: "Public Work", cls: "work", label: "ಕಾಮಗಾರಿ", short: "ಕಾಮಗಾರಿ",
      icon: '<svg ' + ICO_ATTR + ' ' + ICO_STROKE + '><path d="M9.5 4h5l4 15.5h-13z"/><path d="M8.2 10h7.6M6.9 15h10.2M3.5 19.5h17"/></svg>' },
    { key: "Railway", cls: "rail", label: "ರೈಲು", short: "ರೈಲು",
      icon: '<svg ' + ICO_ATTR + ' ' + ICO_STROKE + '><rect x="6" y="3.5" width="12" height="13" rx="2"/><path d="M6 10.5h12M9.5 13.6h.01M14.5 13.6h.01M8.5 16.5l-2 4M15.5 16.5l2 4"/></svg>' }
  ];
  var NOTICE_TYPES = {
    "Road closure": "ರಸ್ತೆ ಸಂಚಾರ ನಿರ್ಬಂಧ", "Traffic diversion (marathon)": "ಸಂಚಾರ ಮಾರ್ಗ ಬದಲಾವಣೆ",
    "Train cancelled": "ರೈಲು ರದ್ದು", "Train partly cancelled": "ರೈಲು ಭಾಗಶಃ ರದ್ದು", "Train delayed": "ರೈಲು ವಿಳಂಬ",
    "Special train extended": "ವಿಶೇಷ ರೈಲು ವಿಸ್ತರಣೆ", "Temporary halt": "ತಾತ್ಕಾಲಿಕ ನಿಲುಗಡೆ"
  };

  function noticeCat(key) {
    for (var i = 0; i < NOTICE_CATS.length; i++) if (NOTICE_CATS[i].key === key) return NOTICE_CATS[i];
    return null;
  }

  /* Dummy notices are on until the Settings switch is turned off, while there is no real feed. */
  function loadDummyNotices() { try { return localStorage.getItem("pvDummyNotices") !== "0"; } catch (e) { return true; } }
  function saveDummyNotices(on) { try { localStorage.setItem("pvDummyNotices", on ? "1" : "0"); } catch (e) {} }
  /* Notices are hidden until the Settings switch turns them on. */
  function loadShowNotices() { try { return localStorage.getItem("pvShowNotices") === "1"; } catch (e) { return false; } }
  function saveShowNotices(on) { try { localStorage.setItem("pvShowNotices", on ? "1" : "0"); } catch (e) {} }
  function noticesUrl() { return state.noticesDummy ? NOTICES_DUMMY_URL : NOTICES_URL; }

  /* Keep only notices with usable dates. "dates" lists the active days when they
     are not every day from start to end. */
  function indexNotices(json) {
    var out = {}, districts = (json && json.districts) || {};
    Object.keys(districts).forEach(function (district) {
      out[district] = [];
      (districts[district] || []).forEach(function (rec) {
        var start = String(rec.start || "").trim(), end = String(rec.end || rec.start || "").trim();
        if (!isValidIso(start) || !isValidIso(end) || end < start) return;
        out[district].push({
          category: String(rec.category || ""), type: String(rec.type || ""), start: start, end: end,
          dates: [].concat(rec.dates || []).map(String).filter(isValidIso).sort(),
          time: String(rec.time || ""), text: String(rec.text || "").trim()
        });
      });
    });
    return out;
  }

  function fetchNotices() {
    if (!state.noticesShown) return Promise.resolve(null);
    if (state.notices || state.noticesError) return Promise.resolve(state.notices);
    if (state.noticesPending) return state.noticesPending;
    var url = noticesUrl();
    var pending = state.noticesPending = fetchJSON(url)
      .then(function (json) { return { data: indexNotices(json) }; })
      .catch(function () { return { data: null }; })
      .then(function (result) {
        if (state.noticesPending !== pending) return state.notices;   /* the dummy switch changed meanwhile */
        state.noticesPending = null;
        state.notices = result.data;
        state.noticesError = !result.data;
        return state.notices;
      });
    return pending;
  }

  function setShowNotices(on) {
    state.noticesShown = on;
    saveShowNotices(on);
    resetNotices();
  }

  function setDummyNotices(on) {
    state.noticesDummy = on;
    saveDummyNotices(on);
    resetNotices();
  }

  function resetNotices() {
    state.notices = null;
    state.noticesError = false;
    state.noticesPending = null;
  }

  function noticeActiveOn(n, iso) {
    return n.dates.length ? n.dates.indexOf(iso) !== -1 : n.start <= iso && iso <= n.end;
  }

  /* The first active day after iso, or "" when the notice does not start again. */
  function noticeNextAfter(n, iso) {
    if (!n.dates.length) return n.start > iso ? n.start : "";
    for (var i = 0; i < n.dates.length; i++) if (n.dates[i] > iso) return n.dates[i];
    return "";
  }

  /* A district's notices that are active on iso or start within the next NOTICE_DAYS. */
  function noticeCurrent(n, iso) {
    var next = noticeNextAfter(n, iso);
    return noticeActiveOn(n, iso) || (!!next && next <= addDaysIso(iso, NOTICE_DAYS));
  }

  function currentNotices(district, iso) {
    return ((state.notices && state.notices[district]) || []).filter(function (n) {
      return (!state.noticeCat || n.category === state.noticeCat) && noticeCurrent(n, iso);
    });
  }

  function noticesOn(district, iso) {
    return ((state.notices && state.notices[district]) || []).filter(function (n) { return noticeActiveOn(n, iso); });
  }

  /* Markers use the same icons as the Home tabs: the lamp for events (maroon for
     the district, green for Karnataka-wide) and the warning sign for notices. */
  var ICO_WARNING = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="ico"><path d="M12 3.5 2.5 20h19z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9.5v5M12 17.7v.1" fill="none" stroke="var(--mark-cut, #fff)" stroke-width="2.2" stroke-linecap="round"/></svg>';

  function markHTML(type, extra) {
    return '<i class="mark mark-' + type + '"' + (extra || "") + '>' + (type === "alert" ? ICO_WARNING : ICONS.diya) + '</i>';
  }

  /* Marker for a day that has a notice, in the Home strip, Week and Month. */
  function dayAlertHTML(key) {
    if (!state.district || !noticesOn(state.district, keyToIso(key)).length) return "";
    return markHTML("alert", ' title="ಸೂಚನೆ ಇದೆ"');
  }

  /* The notices entry joins the legend only once notices have loaded. */
  function legendItemsHTML() {
    return '<span>' + markHTML("district") + ' ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು</span><span>' + markHTML("state") + ' ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು</span>' +
      (state.notices ? '<span>' + markHTML("alert") + ' ಸೂಚನೆಗಳು</span>' : "");
  }

  function noticeOrder(a, b) {
    var cats = NOTICE_CATS.map(function (c) { return c.key; });
    return (cats.indexOf(a.category) - cats.indexOf(b.category)) || (a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
  }

  function isoDate(iso) { return parseKey(isoToKey(iso)); }

  function noticeWhen(n) {
    if (!n.dates.length) {
      return n.start === n.end ? MONTHS[isoDate(n.start).getMonth()] + " " + kn(isoDate(n.start).getDate()) : periodLabel(isoDate(n.start), isoDate(n.end), true);
    }
    var months = [], days = {};
    n.dates.forEach(function (iso) {
      var d = isoDate(iso), m = d.getMonth();
      if (!days[m]) { days[m] = []; months.push(m); }
      days[m].push(kn(d.getDate()));
    });
    return months.map(function (m) { return MONTHS[m] + " " + days[m].join(", "); }).join("; ");
  }

  function noticeTime(time) {
    var range = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(time);
    return range ? kn(range[1]) + " – " + kn(range[2]) : esc(time);
  }

  function noticeParasHTML(paras) {
    return paras.map(function (p) { return '<p>' + esc(p).replace(/\n/g, "<br>") + '</p>'; }).join("");
  }

  var noticeSeq = 0;
  function noticeHTML(n) {
    var cat = noticeCat(n.category), paras = n.text.split(/\n\n+/), rest = paras.slice(1);
    var type = NOTICE_TYPES[n.type] || n.type;
    var out = '<li class="notice cat-' + (cat ? cat.cls : "other") + '">' +
      '<div class="notice-head"><span class="notice-cat">' + (cat ? cat.icon : "") + esc(cat ? cat.label : n.category || "ಸೂಚನೆ") + '</span>' +
      (type ? '<span class="notice-type">' + esc(type) + '</span>' : "") + '</div>' +
      '<div class="notice-meta"><span class="notice-when">' + noticeWhen(n) + '</span>' + (n.time ? '<span class="notice-time">' + noticeTime(n.time) + '</span>' : "") + '</div>' +
      '<div class="notice-text">' + noticeParasHTML(paras.slice(0, 1)) + '</div>';
    if (rest.length) {
      var id = "ntx-" + (++noticeSeq);
      out += '<div class="notice-text" id="' + id + '" hidden>' + noticeParasHTML(rest) + '</div>' +
        '<button type="button" class="notice-more" aria-expanded="false" aria-controls="' + id + '">ಪೂರ್ತಿ ಓದಿ</button>';
    }
    return out + '</li>';
  }

  function noticeListHTML(list) {
    return '<ul class="notice-list">' + list.slice().sort(noticeOrder).map(noticeHTML).join("") + '</ul>';
  }

  function noticeChipsHTML() {
    var all = [{ key: "", short: "ಎಲ್ಲಾ" }].concat(NOTICE_CATS);
    return '<div class="notice-chips" role="group" aria-label="ಸೂಚನೆಯ ವಿಧ">' + all.map(function (cat) {
      var on = state.noticeCat === cat.key;
      return '<button type="button" class="notice-chip' + (on ? " is-active" : "") + (cat.cls ? " cat-" + cat.cls : "") + '" data-cat="' + esc(cat.key) + '" aria-pressed="' + on + '">' + (cat.icon || "") + cat.short + '</button>';
    }).join("") + '</div>';
  }

  function noticesBodyHTML() {
    if (!state.notices && !state.noticesError) return SKELETON("ಸೂಚನೆಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…");
    if (state.noticesError) return '<p class="empty-note notice-empty">ಸೂಚನೆಗಳ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ.</p>';
    if (!state.district) return '<p class="empty-note notice-empty">ಸೂಚನೆಗಳನ್ನು ನೋಡಲು ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ.</p>';
    var iso = keyToIso(state.key), list = currentNotices(state.district, iso), today = [], later = {}, laterDays = [];
    list.forEach(function (n) {
      if (noticeActiveOn(n, iso)) { today.push(n); return; }
      var next = noticeNextAfter(n, iso);
      if (!later[next]) { later[next] = []; laterDays.push(next); }
      later[next].push(n);
    });
    var todayTitle = (state.key === keyFor(new Date()) ? "ಇಂದಿನ ಸೂಚನೆಗಳು" : "ಈ ದಿನದ ಸೂಚನೆಗಳು") + " (" + kn(today.length) + ")";
    var upcoming = laterDays.sort().map(function (dayIso) {
      var key = isoToKey(dayIso), day = parseKey(key);
      return '<section class="upcoming-day"' + (day.getDay() === 0 ? ' data-sun="1"' : "") + '><h3 class="upcoming-date"><button type="button" class="week-day-link" data-day="' + key + '">' +
        '<span class="week-day-label"><span class="week-day-name">' + WEEKDAYS[day.getDay()] + '</span></span>' +
        '<span class="week-day-date"><b>' + kn(day.getDate()) + '</b><small>' + MONTHS[day.getMonth()] + '</small></span></button></h3>' +
        noticeListHTML(later[dayIso]) + '</section>';
    }).join("");
    return noticeChipsHTML() +
      card(todayTitle, today.length ? noticeListHTML(today) : '<p class="empty-note">ಈ ದಿನ ಯಾವುದೇ ಸೂಚನೆ ಇಲ್ಲ.</p>', "noticesToday", false) +
      card("ಮುಂದಿನ " + kn(NOTICE_DAYS) + " ದಿನಗಳ ಸೂಚನೆಗಳು", upcoming ? '<div class="upcoming-list">' + upcoming + '</div>' : '<p class="empty-note">ಮುಂದಿನ ' + kn(NOTICE_DAYS) + ' ದಿನಗಳಲ್ಲಿ ಯಾವುದೇ ಸೂಚನೆ ಇಲ್ಲ.</p>', "noticesUpcoming", false);
  }

  function bindNotices(el) {
    if (el._noticesBound) return;
    el._noticesBound = true;
    el.addEventListener("click", function (e) {
      var target = e.target && e.target.closest ? e.target : null;
      if (!target) return;
      var more = target.closest(".notice-more"), chip = target.closest(".notice-chip");
      if (more) {
        var rest = document.getElementById(more.getAttribute("aria-controls")), open = rest.hidden;
        rest.hidden = !open;
        more.setAttribute("aria-expanded", String(open));
        more.textContent = open ? "ಮುಚ್ಚು" : "ಪೂರ್ತಿ ಓದಿ";
      } else if (chip) {
        state.noticeCat = chip.dataset.cat || "";
        renderToday();
      }
    });
  }

  function noticesViewHTML() {
    var banner = state.noticesDummy ? '<p class="notice-dummy" role="note">ಮಾದರಿ ದತ್ತಾಂಶ — ಇವು ನಿಜವಾದ ಸೂಚನೆಗಳಲ್ಲ.</p>' : "";
    return '<div class="notices-view">' + banner + noticesBodyHTML() + '</div>';
  }

  /* ---------------- Render: Week ---------------- */
  function weekStart(key) {
    var d = parseKey(key);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }
  function weekStartKey(key) { return keyFor(weekStart(key)); }

  function shiftWeek(n) {
    var d = parseKey(state.key);
    d.setDate(d.getDate() + n * 7);
    state.weekFirst = state.weekLast = state.weekHeader = null;
    goto(keyFor(d));
  }

  /* District and Karnataka-wide event lists. Shared by Week rows and Home so both
     read identically. dayKey makes each event a link to that day (Week only). */
  function weekScopesHTML(dayKey, district, statewide) {
    var row = function (r) { return pvRow(r, r.startTime || "", dayKey); };
    return (district.length ? '<div class="week-scope district"><h4>ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು</h4><ul class="ev-list">' + district.map(row).join("") + '</ul></div>' : "") +
      (statewide.length ? '<div class="week-scope statewide"><h4>ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು</h4><ul class="ev-list">' + statewide.map(row).join("") + '</ul></div>' : "");
  }

  /* One row per day, like the printed calendar: heavy weekday name on the left,
     big date on the right, events underneath. */
  function weekAgendaHTML(key) {
    var d = parseKey(key), district = districtEventsFor(key).concat(culturalEventsFor(key)), statewide = stateEventsFor(key), today = key === keyFor(new Date());
    var head = '<h3 class="week-day-title"><button type="button" class="week-day-link" data-day="' + key + '">' +
      '<span class="week-day-label"><span class="week-day-name">' + WEEKDAYS[d.getDay()] + '</span>' + (today ? '<span class="today-pill">ಇಂದು</span>' : "") + dayAlertHTML(key) + '</span>' +
      '<span class="week-day-date"><b>' + kn(d.getDate()) + '</b><small>' + MONTHS[d.getMonth()] + '</small></span></button></h3>';
    var flags = (today ? ' data-today="1"' : "") + (d.getDay() === 0 ? ' data-sun="1"' : "");
    if (!district.length && !statewide.length) return '<section class="week-day" data-day="' + key + '" data-empty="1"' + flags + '>' + head + '<p class="empty-note">ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ</p></section>';
    return '<section class="week-day" data-day="' + key + '"' + flags + '>' + head +
      weekScopesHTML(key, district, statewide) + '</section>';
  }

  function weekBlockHTML(startKey) {
    var start = parseKey(startKey), end = new Date(start);
    end.setDate(end.getDate() + 6);
    /* Every day gets the same row; days without events just have no list under them. */
    return '<section class="week-block" data-start="' + startKey + '"><div class="stream-head"><h2 class="stream-period-title">' + periodLabel(start, end) + '</h2>' + districtLinkHTML("weekDistrictSelect") + '</div>' +
      Array.from({ length: 7 }, function (_, i) {
        var d = new Date(start); d.setDate(d.getDate() + i); return weekAgendaHTML(keyFor(d));
      }).join("") + '</section>';
  }

  function weekKeyShift(key, weeks) {
    var d = parseKey(key); d.setDate(d.getDate() + weeks * 7); return keyFor(d);
  }

  function streamTopOffset() {
    var masthead = document.querySelector(".masthead");
    return (masthead ? masthead.offsetHeight : 0) + 12;
  }

  function scrollToStreamBlock(block) {
    var top = block.getBoundingClientRect ? block.getBoundingClientRect().top : (block.offsetTop || 0);
    var y = top + (window.pageYOffset || window.scrollY || 0) - streamTopOffset();
    window.scrollTo(0, Math.max(0, y));
  }

  function bindWeekStream() {
    var el = document.getElementById("weekAgenda");
    if (!el || el._streamBound) return;
    el._streamBound = true;
    el.addEventListener("click", function (e) {
      if (openDistrictFromLink(e)) return;
      var target = e.target && e.target.closest ? e.target.closest("[data-day]") : null;
      if (target && target.dataset.day) openDay(target.dataset.day);
    });
  }

  function updateWeekHeader() {
    var blocks = document.querySelectorAll("#weekAgenda .week-block"), chosen = null, edge = streamTopOffset() + 1;
    blocks.forEach(function (block) {
      if (block.getBoundingClientRect().top <= edge) chosen = block;
    });
    if (!chosen && blocks.length) chosen = blocks[0];
    if (chosen) {
      state.weekHeader = chosen.dataset.start;
      renderDistrictPicker("weekDistrictSelect", "week");
      renderMasthead();
    }
  }

  function lazyWeekScroll() {
    if (state.tab !== "week" || !state.pv) return;
    var el = document.getElementById("weekAgenda"), bottom = window.scrollY + window.innerHeight;
    if (!el || !el.getBoundingClientRect) return;
    if (bottom > el.getBoundingClientRect().bottom - 500 && state.weekLast) {
      var next = weekKeyShift(state.weekLast, 1);
      state.weekLast = next;
      el.insertAdjacentHTML("beforeend", weekBlockHTML(next));
    }
    if (window.scrollY < el.getBoundingClientRect().top + 500 && state.weekFirst) {
      var previous = weekKeyShift(state.weekFirst, -1), oldHeight = el.offsetHeight;
      state.weekFirst = previous;
      el.insertAdjacentHTML("afterbegin", weekBlockHTML(previous));
      window.scrollBy(0, el.offsetHeight - oldHeight);
    }
    updateWeekHeader();
  }

  function renderWeek() {
    var start = weekStartKey(state.key);
    if (!state.weekFirst) {
      state.weekFirst = weekKeyShift(start, -2);
      state.weekLast = weekKeyShift(start, 2);
    }
    var selectedWeekStart = weekStart(state.key), selectedWeekEnd = new Date(selectedWeekStart);
    selectedWeekEnd.setDate(selectedWeekEnd.getDate() + 6);
    document.getElementById("weekTitle").textContent = periodLabel(selectedWeekStart, selectedWeekEnd);
    if (state.pvError) {
      document.getElementById("weekAgenda").innerHTML = PV_ERROR;
      renderDistrictPicker("weekDistrictSelect", "week");
      return;
    }
    if (!state.pv) {
      document.getElementById("weekAgenda").innerHTML = PV_LOADING;
      renderDistrictPicker("weekDistrictSelect", "week");
      return;
    }
    var pages = [], cursor = state.weekFirst;
    while (true) {
      pages.push(weekBlockHTML(cursor));
      if (cursor === state.weekLast) break;
      cursor = weekKeyShift(cursor, 1);
    }
    document.getElementById("weekAgenda").innerHTML = pages.join("");
    document.getElementById("weekLegend").innerHTML = legendItemsHTML();
    renderDistrictPicker("weekDistrictSelect", "week");
    bindWeekStream();
    if (!state.weekHeader) {
      var selectedBlock = document.querySelector('#weekAgenda .week-block[data-start="' + start + '"]');
      if (selectedBlock) scrollToStreamBlock(selectedBlock);
    }
    updateWeekHeader();
    bindDistrictSelectors();
  }

  /* ---------------- Render: Month ---------------- */
  function monthKey(y, m) { return y + "-" + m; }
  function monthKeyShift(key, n) {
    var p = key.split("-"), d = new Date(+p[0], +p[1] + n, 1);
    return monthKey(d.getFullYear(), d.getMonth());
  }

  function monthCalendarHTML(y, m) {
    var days = new Date(y, m + 1, 0).getDate(), lead = new Date(y, m, 1).getDay(), html = "";
    for (var i = 0; i < lead; i++) html += '<span class="mday blank" aria-hidden="true"></span>';
    for (var day = 1; day <= days; day++) {
      var k = keyFor(new Date(y, m, day)), sel = k === state.key, today = k === keyFor(new Date());
      var local = districtEventsFor(k).length + culturalEventsFor(k).length, statewide = stateEventsFor(k).length;
      var alert = dayAlertHTML(k);
      var parts = (local ? ["ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು " + local] : []).concat(statewide ? ["ಕರ್ನಾಟಕ ಕಾರ್ಯಕ್ರಮಗಳು " + statewide] : [], alert ? ["ಸೂಚನೆ ಇದೆ"] : []);
      var aria = parts.length ? ' aria-label="' + kn(day) + ': ' + parts.join(", ") + '"' : '';
      html += '<button class="mday' + (sel ? " sel" : "") + (today ? " today" : "") + '" data-day="' + k + '" type="button"' + (today ? ' title="ಇಂದು"' : "") + aria + '>' + kn(day) +
        (local || statewide || alert ? '<span class="mday-dots" aria-hidden="true">' + (local ? markHTML("district") : '') + (statewide ? markHTML("state") : '') + alert + '</span>' : '') + '</button>';
    }
    /* Fill the last week, so the grid closes as a full rectangle. */
    for (var rest = (lead + days) % 7; rest && rest < 7; rest++) html += '<span class="mday blank" aria-hidden="true"></span>';
    return '<div class="month-cal"><div class="week-row">' + WEEKDAYS.map(function (w, i) { return '<span title="' + w + '">' + WEEKDAYS_SHORT[i] + "</span>"; }).join("") + '</div><div class="month-grid">' + html + '</div></div>';
  }

  /* Month agenda: each PV source record listed once, with its date or inclusive
     date range. Overlaps the displayed month. */
  function monthAgendaRecords(y, m) {
    var monthStart = y + "-" + pad(m + 1) + "-01";
    var monthEnd = y + "-" + pad(m + 1) + "-" + pad(daysInMonth(y, m + 1));
    return state.pvRecords.filter(function (r) {
      return visibleRecord(r) && r.dateEnd >= monthStart && r.dateStart <= monthEnd;
    }).concat(state.culturalRecords.filter(function (r) {
      return r.sourceDistrict === state.district && r.dateEnd >= monthStart && r.dateStart <= monthEnd;
    })).sort(function (a, b) { return a.dateStart < b.dateStart ? -1 : a.dateStart > b.dateStart ? 1 : 0; });
  }

  function monthAgendaHTML(y, m) {
    if (state.pvError) return PV_ERROR;
    if (!state.pv) return PV_LOADING;
    var monthStart = y + "-" + pad(m + 1) + "-01";
    var list = monthAgendaRecords(y, m);
    if (!list.length) return '<p class="empty-note">ಈ ತಿಂಗಳಲ್ಲಿ ಯಾವುದೇ ಘಟನೆ ಇಲ್ಲ.</p>';
    var groups = {};
    list.forEach(function (r) {
      var displayDate = r.dateStart < monthStart ? monthStart : r.dateStart;
      (groups[displayDate] = groups[displayDate] || []).push(r);
    });
    return '<div class="ev-panel month-agenda-list">' + Object.keys(groups).sort().map(function (date) {
      var local = groups[date].filter(function (r) { return r.scope !== "Relevant for Karnataka"; });
      var statewide = groups[date].filter(function (r) { return r.scope === "Relevant for Karnataka"; });
      var rows = function (records) { return records.map(function (r) {
        /* The date heading already says the day; only a multi-day event needs its range. */
        var when = r.dateStart === r.dateEnd ? "" : isoToKey(r.dateStart) + " – " + isoToKey(r.dateEnd);
        return pvRow(r, when);
      }).join(""); };
      /* Same day heading as the Week view: weekday on the left, big date on the right. */
      var dayKey = isoToKey(date), d = parseKey(dayKey), isToday = dayKey === keyFor(new Date());
      var head = '<h3 class="week-day-title"><button type="button" class="week-day-link" data-day="' + dayKey + '">' +
        '<span class="week-day-label"><span class="week-day-name">' + WEEKDAYS[d.getDay()] + '</span>' + (isToday ? '<span class="today-pill">ಇಂದು</span>' : "") + dayAlertHTML(dayKey) + '</span>' +
        '<span class="week-day-date"><b>' + kn(d.getDate()) + '</b><small>' + MONTHS[d.getMonth()] + '</small></span></button></h3>';
      return '<section class="agenda-day week-day"' + (isToday ? ' data-today="1"' : "") + (d.getDay() === 0 ? ' data-sun="1"' : "") + '>' + head +
        (local.length ? '<div class="agenda-scope"><h4>ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು</h4><ul class="ev-list">' + rows(local) + '</ul></div>' : '') +
        (statewide.length ? '<div class="agenda-scope statewide"><h4>ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು</h4><ul class="ev-list">' + rows(statewide) + '</ul></div>' : '') + '</section>';
    }).join("") + "</div>";
  }

  function monthBlockHTML(key) {
    var p = key.split("-"), y = +p[0], m = +p[1];
    return '<section class="month-block" data-month="' + key + '"><div class="stream-head"><h2 class="stream-period-title">' + MONTHS[m] + " " + kn(y) + '</h2>' + districtLinkHTML("monthDistrictSelect") + '</div>' +
      monthCalendarHTML(y, m) + '<div class="scope-legend month-legend" aria-label="ಕಾರ್ಯಕ್ರಮದ ವ್ಯಾಪ್ತಿ">' + legendItemsHTML() + '</div>' +
      '<details class="month-agenda"><summary class="ev-section-title" id="monthAgenda-' + key + '"><span>ತಿಂಗಳ ವೇಳಾಪಟ್ಟಿ</span>' + (state.pv && !state.pvError ? '<span class="agenda-count">' + kn(monthAgendaRecords(y, m).length) + '</span>' : "") + '</summary>' + monthAgendaHTML(y, m) + '</details></section>';
  }

  function bindMonthStream() {
    var el = document.getElementById("monthScroller");
    if (!el || el._streamBound) return;
    el._streamBound = true;
    el.addEventListener("click", function (e) {
      if (openDistrictFromLink(e)) return;
      var target = e.target && e.target.closest ? e.target.closest("[data-day]") : null;
      if (target && target.dataset.day) openDay(target.dataset.day);
    });
  }

  function updateMonthHeader() {
    var blocks = document.querySelectorAll("#monthScroller .month-block"), chosen = null, edge = streamTopOffset() + 1;
    blocks.forEach(function (block) { if (block.getBoundingClientRect().top <= edge) chosen = block; });
    if (!chosen && blocks.length) chosen = blocks[0];
    if (chosen) {
      state.monthHeader = chosen.dataset.month;
      renderDistrictPicker("monthDistrictSelect", "month");
      renderMasthead();
    }
  }

  function lazyMonthScroll() {
    if (state.tab !== "month" || !state.pv) return;
    var el = document.getElementById("monthScroller"), rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!rect) return;
    if (window.scrollY + window.innerHeight > rect.bottom - 500 && state.monthLast) {
      var next = monthKeyShift(state.monthLast, 1); state.monthLast = next; el.insertAdjacentHTML("beforeend", monthBlockHTML(next));
    }
    if (window.scrollY < rect.top + 500 && state.monthFirst) {
      var previous = monthKeyShift(state.monthFirst, -1), oldHeight = el.offsetHeight;
      state.monthFirst = previous; el.insertAdjacentHTML("afterbegin", monthBlockHTML(previous));
      window.scrollBy(0, el.offsetHeight - oldHeight);
    }
    updateMonthHeader();
  }

  function renderMonth() {
    var cur = parseKey(state.key), center = state.monthHeader || monthKey(cur.getFullYear(), cur.getMonth());
    if (!state.monthFirst) {
      state.monthFirst = monthKeyShift(center, -2);
      state.monthLast = monthKeyShift(center, 2);
    }
    var pages = [], cursor = state.monthFirst;
    if (state.pvError) {
      document.getElementById("monthScroller").innerHTML = PV_ERROR;
    } else if (!state.pv) {
      document.getElementById("monthScroller").innerHTML = PV_LOADING;
    } else {
      while (true) {
        pages.push(monthBlockHTML(cursor));
        if (cursor === state.monthLast) break;
        cursor = monthKeyShift(cursor, 1);
      }
      document.getElementById("monthScroller").innerHTML = pages.join("");
      bindMonthStream();
      if (!state.monthHeader) {
        var selectedMonth = document.querySelector('#monthScroller .month-block[data-month="' + center + '"]');
        if (selectedMonth) scrollToStreamBlock(selectedMonth);
      }
      updateMonthHeader();
    }
    renderDistrictPicker("monthDistrictSelect", "month");
    bindDistrictSelectors();
  }

  /* ---------------- Masthead ---------------- */
  function periodLabel(start, end, noYear) {
    var sameYear = start.getFullYear() === end.getFullYear();
    if (sameYear && start.getMonth() === end.getMonth()) {
      return MONTHS[start.getMonth()] + " " + kn(start.getDate()) + " – " + kn(end.getDate()) + (noYear ? "" : ", " + kn(end.getFullYear()));
    }
    var left = MONTHS[start.getMonth()] + " " + kn(start.getDate());
    var right = MONTHS[end.getMonth()] + " " + kn(end.getDate());
    if (!sameYear) left += ", " + kn(start.getFullYear());
    return left + " – " + right + (noYear && sameYear ? "" : ", " + kn(end.getFullYear()));
  }

  function renderMasthead() {
    var dt = parseKey(state.key);
    var el = document.getElementById("mastheadDate");
    var label = WEEKDAYS[dt.getDay()] + ", " + MONTHS[dt.getMonth()] + " " + kn(dt.getDate());
    if (state.tab === "week") {
      var start = parseKey(state.weekHeader || weekStartKey(state.key)), end = new Date(start);
      end.setDate(end.getDate() + 6);
      label = periodLabel(start, end, true);
    } else if (state.tab === "month") {
      var month = state.monthHeader ? state.monthHeader.split("-") : [dt.getFullYear(), dt.getMonth()];
      label = MONTHS[+month[1]] + " " + kn(+month[0]);
    }
    el.textContent = label;
    el.setAttribute("aria-label", label + " — ದಿನಾಂಕ ಆಯ್ಕೆ ಮಾಡಿ");
    var prev = document.getElementById("prevDay"), next = document.getElementById("nextDay");
    var unit = state.tab === "week" ? "ವಾರ" : state.tab === "month" ? "ತಿಂಗಳು" : "ದಿನ";
    prev.setAttribute("aria-label", "ಹಿಂದಿನ " + unit);
    next.setAttribute("aria-label", "ಮುಂದಿನ " + unit);
    if (document.documentElement) {
      document.documentElement.style.setProperty("--masthead-h", document.querySelector(".masthead").offsetHeight + "px");
    }
    document.title = MONTHS[dt.getMonth()] + " " + kn(dt.getDate()) + " — ಕನ್ನಡ ಸಾಂಸ್ಕೃತಿಕ ಕ್ಯಾಲೆಂಡರ್";
  }

  /* ---------------- Date picker (tap the date in the header) ---------------- */
  /* The data covers 2026 and 2027, so the picker is limited to those years. */
  var PICKER_MIN = "2026-01-01", PICKER_MAX = "2027-12-31";

  function isoOfKey(key) { var p = key.split("-"); return p[2] + "-" + p[1] + "-" + p[0]; }

  function openDatePicker() {
    var input = document.getElementById("datePicker");
    var iso = isoOfKey(state.key);
    input.value = iso < PICKER_MIN ? PICKER_MIN : iso > PICKER_MAX ? PICKER_MAX : iso;
    try {
      if (input.showPicker) input.showPicker(); else { input.focus(); input.click(); }
    } catch (e) { input.focus(); input.click(); }
  }

  function pickDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!m || value < PICKER_MIN || value > PICKER_MAX) return;
    var key = m[3] + "-" + m[2] + "-" + m[1];
    if (!validKey(key)) return;
    state.weekFirst = state.weekLast = state.weekHeader = null;
    state.monthFirst = state.monthLast = state.monthHeader = null;
    goto(key);
  }

  /* ---------------- Tab switching ---------------- */
  var VIEWS = { day: "viewDay", week: "viewWeek", month: "viewMonth", more: "viewMore" };

  function setTab(name) {
    var previous = state.tab;
    state.tab = name;
    if (name === "week" && previous !== "week") state.weekFirst = state.weekLast = state.weekHeader = null;
    if (name === "month" && previous !== "month") state.monthFirst = state.monthLast = state.monthHeader = null;
    renderMasthead();
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.id !== VIEWS[name]; });
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    renderActive();
    if (name === "day" || name === "more") {
      document.querySelector(".main").scrollTop = 0;
      window.scrollTo(0, 0);
    }
  }

  function renderActive() {
    if (state.tab === "day") renderToday();
    else if (state.tab === "week") renderWeek();
    else if (state.tab === "month") renderMonth();
    else if (state.tab === "more") renderSettings();
  }

  function renderAll() { renderMasthead(); renderActive(); }

  /* ---------------- Init ---------------- */
  /* District is remembered across visits (localStorage); date and panchanga
     mode stay per-session. */
  function loadDistrict() { try { return localStorage.getItem("pvDistrict") || ""; } catch (e) { return ""; } }
  function saveDistrict(d) { try { localStorage.setItem("pvDistrict", d); } catch (e) {} }
  function loadDate() { try { var key = sessionStorage.getItem("pvDate"); return validKey(key) ? key : DEFAULT_KEY; } catch (e) { return DEFAULT_KEY; } }
  function saveDate(key) { try { sessionStorage.setItem("pvDate", key); } catch (e) {} }
  function prepareSession() {
    try {
      if (sessionStorage.getItem("pvSessionVersion") !== SESSION_VERSION) {
        sessionStorage.removeItem("pvDate");
        sessionStorage.removeItem("pvDistrict");
        sessionStorage.removeItem("pvPanchangaPvOnly");   /* setting removed; clear old stored values */
        sessionStorage.setItem("pvSessionVersion", SESSION_VERSION);
      }
    } catch (e) {}
  }

  var districtGlobalBound = false;
  function closeDistrictPicker(picker, restoreFocus) {
    if (!picker || !picker.querySelector) return;
    var trigger = picker.querySelector(".district-trigger"), menu = picker.querySelector(".district-menu");
    if (!trigger || !menu) return;
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    picker.classList.remove("is-open");
    if (restoreFocus && trigger.focus) trigger.focus();
  }

  function bindDistrictPicker(select, picker) {
    if (!picker || !picker.querySelector || picker._districtBound) return;
    var trigger = picker.querySelector(".district-trigger"), menu = picker.querySelector(".district-menu");
    if (!trigger || !menu) return;
    picker._districtBound = true;
    var search = picker.querySelector(".district-search");
    var options = function () { return Array.prototype.slice.call(menu.querySelectorAll(".district-option:not([hidden])")); };
    /* Type to narrow the list (matches the Kannada label or the English name). */
    var applyFilter = function () {
      var q = (search ? search.value : "").trim().toLowerCase(), any = false;
      Array.prototype.forEach.call(menu.querySelectorAll(".district-option"), function (o) {
        var value = o.dataset.districtValue || "", label = (o.querySelector(".district-option-name") || o).textContent;
        var show = !q || (!!value && (value + " " + label).toLowerCase().indexOf(q) !== -1);
        o.hidden = !show;
        if (show && value) any = true;
      });
      var empty = menu.querySelector(".district-empty");
      if (empty) empty.hidden = !q || any;
    };
    var setOpen = function (open, focusIndex) {
      trigger.setAttribute("aria-expanded", String(open));
      menu.hidden = !open;
      picker.classList.toggle("is-open", open);
      if (open && search && search.value) { search.value = ""; applyFilter(); }
      if (open && focusIndex != null) {
        var items = options();
        if (items[focusIndex] && items[focusIndex].focus) items[focusIndex].focus();
      }
    };
    var selectedIndex = function () {
      var items = options(), index = items.findIndex(function (option) { return option.dataset.districtValue === select.value; });
      return index < 0 ? 0 : index;
    };
    var moveTo = function (index) {
      var items = options();
      if (!items.length) return;
      items[Math.max(0, Math.min(index, items.length - 1))].focus();
    };
    var choose = function (option) {
      var value = option.dataset.districtValue || "";
      select.value = value;
      if (state.district === value) {
        closeDistrictPicker(picker, true);
        return;
      }
      state.district = value;
      saveDistrict(value);
      renderAll();
      var nextTrigger = document.getElementById(select.id + "Trigger");
      if (nextTrigger && nextTrigger.focus) nextTrigger.focus();
    };
    trigger.addEventListener("click", function () {
      var open = trigger.getAttribute("aria-expanded") === "true";
      setOpen(!open, open ? null : selectedIndex());
    });
    trigger.addEventListener("keydown", function (e) {
      var key = e.key, open = trigger.getAttribute("aria-expanded") === "true";
      if (key === "Enter" || key === " ") { e.preventDefault(); if (!open) setOpen(true, selectedIndex()); }
      else if (key === "ArrowDown") { e.preventDefault(); setOpen(true, open ? selectedIndex() + 1 : selectedIndex()); }
      else if (key === "ArrowUp") { e.preventDefault(); setOpen(true, open ? selectedIndex() - 1 : selectedIndex()); }
      else if (key === "Escape" && open) { e.preventDefault(); closeDistrictPicker(picker, false); }
      else if (key === "Home" && open) { e.preventDefault(); moveTo(0); }
      else if (key === "End" && open) { e.preventDefault(); moveTo(options().length - 1); }
    });
    picker.addEventListener("click", function (e) {
      if (e.target === picker) { closeDistrictPicker(picker, true); return; } /* phone backdrop */
      var option = e.target && e.target.closest ? e.target.closest(".district-option") : null;
      if (option) choose(option);
    });
    if (search) {
      search.addEventListener("input", applyFilter);
      search.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); moveTo(0); }
        else if (e.key === "Enter") {
          e.preventDefault();
          var first = options().filter(function (o) { return o.dataset.districtValue; })[0];
          if (first) choose(first);
        } else if (e.key === "Escape") { e.preventDefault(); closeDistrictPicker(picker, true); }
      });
    }
    menu.addEventListener("keydown", function (e) {
      var current = e.target && e.target.closest ? e.target.closest(".district-option") : null;
      if (!current) return;
      var items = options(), index = items.indexOf(current);
      if (e.key === "ArrowDown") { e.preventDefault(); moveTo(index + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveTo(index - 1); }
      else if (e.key === "Home") { e.preventDefault(); moveTo(0); }
      else if (e.key === "End") { e.preventDefault(); moveTo(items.length - 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(current); }
      else if (e.key === "Escape") { e.preventDefault(); closeDistrictPicker(picker, true); }
    });
  }

  function bindDistrictSelectors() {
    if (!districtGlobalBound) {
      districtGlobalBound = true;
      document.addEventListener("click", function (e) {
        document.querySelectorAll(".district-picker.is-open").forEach(function (picker) {
          if (!picker.contains(e.target)) closeDistrictPicker(picker, false);
        });
      });
    }
    ["homeDistrictSelect", "districtSelect", "weekDistrictSelect", "monthDistrictSelect", "settingsDistrictSelect"].forEach(function (id) {
      var select = document.getElementById(id);
      if (!select) return;
      if (!select._pvBound) {
        select._pvBound = true;
        select.addEventListener("change", function () {
          state.district = select.value || "";
          saveDistrict(state.district);
          renderAll();
        });
      }
      var picker = document.getElementById(id + "Picker");
      if (picker && picker.dataset && picker.dataset.districtPicker != null) bindDistrictPicker(select, picker);
    });
  }

  function renderSettings() {
    renderDistrictPicker("settingsDistrictSelect", "all");
    bindDistrictSelectors();
  }

  function openDay(key) {
    setTab("day");
    goto(key);
  }

  function bindSwipe(id, action) {
    var el = document.getElementById(id);
    if (!el || el._swipeBound) return;
    el._swipeBound = true;
    el.addEventListener("touchstart", function (e) {
      var target = e.target;
      if (target && target.closest && target.closest("button, a, select, input, textarea")) return;
      el._swipeX = e.changedTouches[0].clientX;
      el._swipeY = e.changedTouches[0].clientY;
    }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (el._swipeX == null) return;
      var dx = e.changedTouches[0].clientX - el._swipeX;
      var dy = e.changedTouches[0].clientY - el._swipeY;
      el._swipeX = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
      action(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function init() {
    prepareSession();
    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        setTab(t.dataset.tab);
      });
    });
    document.getElementById("prevDay").addEventListener("click", function () { shiftPeriod(-1); });
    document.getElementById("nextDay").addEventListener("click", function () { shiftPeriod(1); });
    document.getElementById("mastheadDate").addEventListener("click", openDatePicker);
    document.getElementById("datePicker").addEventListener("change", function () { pickDate(document.getElementById("datePicker").value); });
    document.getElementById("todayBtn").addEventListener("click", function () { openDay(keyFor(new Date())); });
    document.getElementById("fontBig").addEventListener("change", function (e) {
      state.big = e.target.checked;
      if (document.body) document.body.classList.toggle("big", state.big);
    });
    document.getElementById("knDigits").addEventListener("change", function (e) {
      state.kn = e.target.checked;
      renderAll();
    });
    var dummyRow = document.getElementById("dummyNoticesRow");
    function syncNoticeSettings() { if (dummyRow) dummyRow.hidden = !state.noticesShown; }
    state.noticesShown = loadShowNotices();
    syncNoticeSettings();
    document.getElementById("showNotices").checked = state.noticesShown;
    document.getElementById("showNotices").addEventListener("change", function () {
      setShowNotices(document.getElementById("showNotices").checked);
      syncNoticeSettings();
      fetchNotices().then(function () { renderAll(); });
      renderAll();
    });
    state.noticesDummy = loadDummyNotices();
    document.getElementById("dummyNotices").checked = state.noticesDummy;
    document.getElementById("dummyNotices").addEventListener("change", function () {
      setDummyNotices(document.getElementById("dummyNotices").checked);
      fetchNotices().then(function () { renderAll(); });
    });
    state.key = loadDate();
    state.district = loadDistrict();
    bindDistrictSelectors();
    bindSwipe("mastheadDateBlock", function (n) { shiftPeriod(n); });
    bindSwipe("viewDay", function (n) { if (state.tab === "day") shiftDay(n); });
    bindSwipe("weekHead", function (n) { shiftWeek(n); });
    bindSwipe("monthHead", function (n) { shiftMonth(n); });
    if (window.addEventListener) window.addEventListener("scroll", function () {
      lazyWeekScroll();
      lazyMonthScroll();
    }, { passive: true });
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".ev-cal");
      if (btn) openCalSheet(btn);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCalSheet(); });
    fetchPV().then(function () {
      if (state.pv && state.district && !state.pv.sheets[state.district]) {
        state.district = "";
        saveDistrict("");
      }
      renderAll();
    });
    fetchCultural().then(function () { renderAll(); });
    fetchCalendarEvents().then(function () { renderAll(); });
    fetchNotices().then(function () { renderAll(); });
    goto(state.key);
  }

  function shiftDay(n) {
    var d = parseKey(state.key);
    d.setDate(d.getDate() + n);
    goto(keyFor(d));
  }

  function shiftPeriod(n) {
    if (state.tab === "week") shiftWeek(n);
    else if (state.tab === "month") shiftMonth(n);
    else shiftDay(n);
  }

  function shiftMonth(n) {
    var d = parseKey(state.key);
    var day = Math.min(d.getDate(), 28);
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    state.monthFirst = state.monthLast = state.monthHeader = null;
    goto(keyFor(d));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
