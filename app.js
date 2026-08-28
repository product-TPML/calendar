/* ಕನ್ನಡ ಪಂಚಾಂಗ — plain JS, no dependencies.
   Data source: ocr-zones/<DD-MM-YYYY>/structured-ocr.json (per-date fetch,
   cached in state.data). */
(function () {
  "use strict";

  var DEFAULT_KEY = keyFor(new Date());
  var SESSION_VERSION = "5";

  /* ---------------- Unavailable record (no fabricated data) ---------------- */
  function unavailableDay(key) {
    return {
      key: key, unavailable: true, events: [], timings: [], jathaka: [],
      calendar: { months: [], samvatsara: null, shakaYear: null, sunrise: null, sunset: null },
      panchanga: null
    };
  }

  /* ---------------- State & helpers ---------------- */
  var state = { key: DEFAULT_KEY, data: {}, pending: {}, tab: "day", big: false, kn: false, loading: false, seq: 0,
    pv: null, pvIndex: {}, pvRecords: [], pvError: false, pvPending: null, pvQA: [], district: "",
    weekFirst: null, weekLast: null, weekHeader: null, monthFirst: null, monthLast: null, monthHeader: null };

  var WEEKDAYS = ["ಭಾನುವಾರ", "ಸೋಮವಾರ", "ಮಂಗಳವಾರ", "ಬುಧವಾರ", "ಗುರುವಾರ", "ಶುಕ್ರವಾರ", "ಶನಿವಾರ"];
  var MONTHS = ["ಜನವರಿ", "ಫೆಬ್ರವರಿ", "ಮಾರ್ಚ್", "ಏಪ್ರಿಲ್", "ಮೇ", "ಜೂನ್", "ಜುಲೈ", "ಆಗಸ್ಟ್", "ಸೆಪ್ಟೆಂಬರ್", "ಅಕ್ಟೋಬರ್", "ನವೆಂಬರ್", "ಡಿಸೆಂಬರ್"];
  var KN_DIGITS = ["೦", "೧", "೨", "೩", "೪", "೫", "೬", "೭", "೮", "೯"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parseKey(k) { var p = k.split("-"); return new Date(+p[2], +p[1] - 1, +p[0]); }
  function keyFor(d) { return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear(); }
  function kn(s) { return state.kn ? String(s).replace(/\d/g, function (d) { return KN_DIGITS[+d]; }) : String(s); }
  function dayData(key) { return state.data[key] || unavailableDay(key); }
  function validKey(key) {
    if (!/^\d{2}-\d{2}-\d{4}$/.test(String(key || ""))) return false;
    var p = String(key).split("-"), d = +p[0], m = +p[1], y = +p[2];
    return y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) && keyFor(new Date(y, m - 1, d)) === key;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------- PV calendar data (district festival sheets) ----------------
     Fetched once over HTTP and cached. Kept separate from the per-date OCR
     fetches (panchanga/timings/rashi). On load failure we show an event-data
     error — no OCR fallback for PV events. Dates are handled as strings
     (ISO "YYYY-MM-DD" in the JSON, DD-MM-YYYY keys in the app) with explicit
     conversion; no Date/timezone parsing of ISO dates. ---------------- */
  var PV_URL = "data/pv-calendar-data.json";
  var PV_LOADING = '<p class="empty-note">ಘಟನೆ ದತ್ತಾಂಶ ಲೋಡ್ ಆಗುತ್ತಿದೆ…</p>';
  var PV_ERROR = '<p class="empty-note">ಘಟನೆ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ.</p>';

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
          scope: String(rec.relevance || "")
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
        return json;
      })
      .catch(function () { state.pvError = true; return null; })
      .then(function (json) { delete state.pvPending; return json; });
    return state.pvPending;
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

  function visibleEventsFor(key) {
    return districtEventsFor(key).concat(stateEventsFor(key));
  }

  function visibleRecord(r) {
    return r.scope === "Relevant for Karnataka" ||
      (state.district && r.sourceDistrict === state.district && r.scope !== "Relevant for Karnataka");
  }

  function pvRow(r, when, dayKey) {
    var place = r.place ? ' <span class="ev-place">' + esc(r.place) + '</span>' : "";
    var scope = r.scope === "Relevant for Karnataka" ? "state" : "district";
    var open = dayKey ? '<button type="button" class="event-link" data-day="' + dayKey + '">' : "";
    var close = dayKey ? '</button>' : "";
    return '<li class="ev-row event-row scope-' + scope + '">' + open + '<span class="ev-mark" aria-hidden="true"></span><span class="ev-text">' + esc(r.title) + place + (when ? ' <span class="ev-when">' + esc(when) + '</span>' : "") + '</span>' + close + '</li>';
  }

  /* Compact/expand list for the new district/state containers (unique ids). */
  var pvSeq = 0;
  function pvListHTML(records) {
    if (!records.length) return '<p class="empty-note">ಈ ದಿನ ಯಾವುದೇ ವಿಶೇಷ ದಿನವಿಲ್ಲ.</p>';
    var limit = 3, hidden = records.slice(limit);
    var out = '<div class="ev-panel"><ul class="ev-list">' + records.slice(0, limit).map(pvRow).join("") + "</ul>";
    if (hidden.length) {
      var id = "pvx-" + (++pvSeq);
      out += '<ul class="ev-list" id="' + id + '" hidden>' + hidden.map(pvRow).join("") + "</ul>" +
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

  function districtEventCount(name, mode) {
    var range = rangeFor(mode || "all");
    if (mode === "all") return state.pvRecords.filter(function (r) { return r.sourceDistrict === name && r.scope !== "Relevant for Karnataka"; }).length;
    return state.pvRecords.filter(function (r) {
      return r.sourceDistrict === name && r.scope !== "Relevant for Karnataka" && r.dateStart <= range.end && r.dateEnd >= range.start;
    }).length;
  }

  function districtOptionsHTML(mode) {
    if (!state.pv) return '<option value="">ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ</option>';
    return '<option value="">ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ</option>' + Object.keys(state.pv.sheets).map(function (name) {
      var count = districtEventCount(name, mode);
      return '<option value="' + esc(name) + '"' + (name === state.district ? " selected" : "") + '>' + esc(name) + ' (' + count + ')</option>';
    }).join("");
  }

  function eventGroupHTML(id, title, records, stateGroup, headingExtra) {
    return '<section class="ev-section' + (stateGroup ? " state" : "") + '" aria-labelledby="' + id + 'Title">' +
      '<div class="ev-section-head"><h3 class="ev-section-title" id="' + id + 'Title" tabindex="-1">' + title + '</h3>' + (headingExtra || "") + '</div>' +
      '<div id="' + id + '" class="ev-container">' + pvListHTML(records) + '</div></section>';
  }

  /* Today's events card — PV events instead of OCR. District and state groups
     live inside the existing card body, not in separate page-level blocks. */
  function pvEventsHTML(key) {
    if (state.pvError) return PV_ERROR;
    if (!state.pv) return PV_LOADING;
    var local = districtEventsFor(key), statewide = stateEventsFor(key);
    var selector = '<label class="sr-only" for="districtSelect">ಜಿಲ್ಲೆ ಆಯ್ಕೆ</label><select id="districtSelect" class="district-select" name="district">' + districtOptionsHTML("day") + '</select>';
    return eventGroupHTML("districtEvents", "ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು (" + local.length + ")", local, false, selector) +
      eventGroupHTML("stateEvents", "ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು (" + statewide.length + ")", statewide, true);
  }

  function bindEventCardUI() {
    var sel = document.getElementById("districtSelect");
    if (sel && !sel._pvBound) {
      sel._pvBound = true;
      sel.addEventListener("change", function () {
        state.district = sel.value || "";
        saveDistrict(state.district);
        renderAll();
      });
    }
    ["districtEvents", "stateEvents"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) bindExpand(el);
    });
  }

  /* ---------------- Inline SVG accents (no icon deps, no external assets).
       aria-hidden + focusable=false: Kannada labels stay the accessible source.
       Colors come from currentColor via the .ico CSS. ---------------- */
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

  function fmtEnd(t, next) {
    var h = Math.floor(t), m = Math.round((t - h) * 100);
    if (h >= 24) { h -= 24; next = true; }
    return (next ? '<span class="nd">ಮರುದಿನ ' : "") + pad(h) + ":" + pad(m) + (next ? "</span>" : "");
  }

  function toMin(t) { var p = t.split(":"); return +p[0] * 60 + +p[1]; }

  /* ---------------- Load & normalize the JSON ---------------- */
  var LOADING_HTML = '<p class="empty-note">ದತ್ತಾಂಶ ಲೋಡ್ ಆಗುತ್ತಿದೆ…</p>';

  /* Navigate to a date: update key, show loading immediately, then fetch &
     cache the record unless it is already cached. */
  function goto(key, loadDay) {
    state.key = key;
    saveDate(key);
    renderMasthead();
    if (loadDay === undefined) loadDay = state.tab === "day";
    if (!loadDay) { state.loading = false; renderActive(); return; }
    if (state.data[key]) { state.loading = false; renderActive(); return; }
    state.loading = true;
    renderActive();
    fetchDate(key);
  }

  /* Per-date fetch. seq guards renders: only the most recent navigation may
     render, so a slow response can never overwrite a newer selected date. */
  function fetchRecord(key) {
    if (state.data[key]) return Promise.resolve(state.data[key]);
    if (state.pending[key]) return state.pending[key];
    state.pending[key] = fetch("ocr-zones/" + key + "/structured-ocr.json")
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (json) { return normalize(json, key); })
      .catch(function () { return unavailableDay(key); })
      .then(function (record) {
        state.data[key] = record;
        delete state.pending[key];
        return record;
      });
    return state.pending[key];
  }

  function fetchDate(key) {
    var seq = ++state.seq;
    fetchRecord(key).then(function () {
      if (seq === state.seq) { state.loading = false; renderAll(); }
    });
  }

  function normalize(json, key) {
    var c = (json && json.content) || {};
    var cal = c.calendar || {}, pan = c.panchanga || {}, tim = c.timings || {};
    var tithi = pan.tithi || {}, nak = pan.nakshatra || {}, yog = pan.yoga || {}, kar = pan.karana || {};
    var jathaka = (Array.isArray(c.jathaka) && c.jathaka.length === 12)
      ? c.jathaka.map(function (j) { return [j.rashi, cleanWord(j.prediction)]; })
      : [];
    return {
      key: key,
      calendar: {
        months: (cal.months || []).filter(function (m) { return String(m).trim() && String(m).trim() !== "—"; }),
        samvatsara: String(cal.samvatsara || "").trim() || null,
        shakaYear: num(cal.shakaYear) || null,
        sunrise: String(cal.sunrise || "").trim() || null,
        sunset: String(cal.sunset || "").trim() || null
      },
      events: (c.events || []).filter(String).slice(0, 12),
      panchanga: {
        tithi:     { name: cleanWord(tithi.name),     paksha: cleanWord(pan.paksha),         ends: num(tithi.endsAt), nextDay: !!tithi.nextDay },
        nakshatra: { name: cleanWord(nak.name),       ends: num(nak.endsAt), nextDay: !!nak.nextDay },
        yoga:      { name: cleanWord(yog.name),       ends: num(yog.endsAt), nextDay: !!yog.nextDay },
        karana:    { name: cleanWord(kar.name),       ends: num(kar.endsAt), nextDay: !!kar.nextDay },
        ayana: cleanWord(pan.ayana) || "",
        ritu: cleanWord(pan.ritu) || "",
        solarRashi: cleanWord(pan.solarRashi) || "",
        chandraRashi: cleanWord(pan.chandraEntryRashi || pan.chandraRashi) || ""
      },
      timings: buildTimings(tim),
      jathaka: jathaka
    };
  }

  /* OCR safety: keep Kannada letters, spaces and combining marks only. */
  function cleanWord(s) { return String(s || "").replace(/[^\u0C80-\u0CFF\u200C\u200D\s]/g, "").trim(); }

  function num(t) { var n = parseFloat(t); return isNaN(n) ? 0 : n; }

  function buildTimings(raw) {
    if (!raw || typeof raw !== "object") return [];
    var defs = [
      { key: "rahuKala", name: "ರಾಹು ಕಾಲ", tone: "bad" },
      { key: "gulikaKala", name: "ಗುಳಿಕ ಕಾಲ", tone: "bad" },
      { key: "yamaganda", name: "ಯಮಗಂಡ", tone: "bad" },
      { key: "arthaPrahara", name: "ಅರ್ಥ ಪ್ರಹರ", tone: "mid" },
      { key: "shubhaSamaya", name: "ಶುಭ ಸಮಯ", tone: "good" }
    ];
    var out = [];
    defs.forEach(function (x) {
      var s = String(raw[x.key] || ""), t = s.match(/(\d{1,2})[.:](\d{2})/g);
      if (!t || t.length < 2) return;
      out.push({ name: x.name, tone: x.tone, from: fix24(t[0], s), to: fix24(t[1], s) });
    });
    /* OCR times are noisy (e.g. "ಮ.01130"); keep only rows that parse cleanly. */
    return out;
  }

  /* "ಮ." (ಮಧ್ಯಾಹ್ನ) with an early hour means PM. */
  function fix24(t, raw) {
    var p = t.split(".").length > 1 ? t.split(".") : t.split(":"), h = +p[0];
    if (/ಮ/i.test(raw) && h > 0 && h < 9) h += 12;
    return pad(h) + ":" + p[1];
  }

  /* ---------------- Render: Today ---------------- */
  function renderToday() {
    if (state.loading) {
      document.getElementById("todayContent").innerHTML = LOADING_HTML;
    } else {
      var d = dayData(state.key);
      if (d.unavailable) {
        document.getElementById("todayContent").innerHTML =
          dateContextHTML({}) + '<div class="unavailable-day" role="status">' +
            '<strong>ಈ ದಿನದ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ</strong><p>ಈ ದಿನದ ಪೂರಕ ಪಂಚಾಂಗ ವಿವರ ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ.</p>' +
          '</div>';
      } else {
        var cal = d.calendar, pan = d.panchanga;
        var sun = '<div class="sun-row">' +
          '<span class="sun-item sunrise-item"><span class="sun-ico" aria-hidden="true">' + ICONS.sunrise + '</span> ಸೂರ್ಯೋದಯ <b>' + kn(cal.sunrise || "—") + '</b></span>' +
          '<span class="sun-item sunset-item"><span class="sun-ico" aria-hidden="true">' + ICONS.sunset + '</span> ಸೂರ್ಯಾಸ್ತ <b>' + kn(cal.sunset || "—") + '</b></span></div>' +
          '<p class="src-note">ಕನ್ನಡ ಪಂಚಾಂಗದ ಆಧಾರದಲ್ಲಿ</p>';
        var meta = [];
        if (cal.samvatsara) meta.push(esc(cal.samvatsara) + " ನಾಮ ಸಂವತ್ಸರ");
        if (cal.shakaYear != null) meta.push("ಶಕ " + kn(cal.shakaYear));
        if (cal.months.length) meta.push(esc(cal.months.join("–")));

        var panga = '<div id="panchangaSection" class="panga-grid" tabindex="-1">' +
          pc("ತಿಥಿ", pan.tithi.name, (pan.tithi.paksha ? pan.tithi.paksha + " ಪಕ್ಷ · " : "") + "ಮುಗಿಯುವುದು " + fmtEnd(pan.tithi.ends, pan.tithi.nextDay), true, ICONS.tithi) +
          pc("ನಕ್ಷತ್ರ", pan.nakshatra.name, "ಮುಗಿಯುವುದು " + fmtEnd(pan.nakshatra.ends, pan.nakshatra.nextDay), true, ICONS.nakshatra) +
          pc("ಯೋಗ", pan.yoga.name, "ಮುಗಿಯುವುದು " + fmtEnd(pan.yoga.ends, pan.yoga.nextDay), false, ICONS.yoga) +
          pc("ಕರಣ", pan.karana.name, "ಮುಗಿಯುವುದು " + fmtEnd(pan.karana.ends, pan.karana.nextDay), false, ICONS.karana) +
          '</div>' + pangaMetaHTML(pan);

        document.getElementById("todayContent").innerHTML =
          dateContextHTML(cal, meta) +
          card("ಇಂದಿನ ಹಬ್ಬಗಳು / ವಿಶೇಷ ದಿನಗಳು", pvEventsHTML(state.key), "events", false, ICONS.diya) +
          panga + sun +
          card("ಸಮಯಗಳು — ಕಾಲ", timingsHTML(d), "timings") +
          card("ರಾಶಿ ಭವಿಷ್ಯ", jathakaHTML(d), "jathaka", true);

        bindEventCardUI();
      }
    }
  }

  function dateContextHTML(cal, meta) {
    var items = meta || [];
    if (!items.length && cal) {
      if (cal.samvatsara) items.push(esc(cal.samvatsara) + " ನಾಮ ಸಂವತ್ಸರ");
      if (cal.shakaYear != null) items.push("ಶಕ " + kn(cal.shakaYear));
      if (cal.months && cal.months.length) items.push(esc(cal.months.join("–")));
    }
    return '<section class="date-context" aria-label="ದಿನದ ಕಾಲದ ಸಂದರ್ಭ"><p>' + (items.join(" · ") || "ದಿನದ ವಿವರ") + '</p></section>';
  }

  /* Three labeled panchanga metadata items. Empty values are omitted entirely —
     no placeholders are invented, so a missing ಚಂದ್ರ ರಾಶಿ simply shows two items. */
  function pangaMetaHTML(pan) {
    var items = [
      ["ಆಯನ", pan.ayana],
      ["ಸೂರ್ಯ ರಾಶಿ", pan.solarRashi],
      ["ಚಂದ್ರ ರಾಶಿ", pan.chandraRashi]
    ].filter(function (x) { return x[1]; });
    if (!items.length) return "";
    return '<div class="panga-meta">' + items.map(function (x) {
      return '<div class="pm-item">' +
        '<span class="pm-label">' + esc(x[0]) + '</span>' +
        '<span class="pm-value">' + esc(x[1]) + '</span></div>';
    }).join("") + '</div>';
  }

  function pc(label, name, sub, featured, icon) {
    return '<div class="panga-card' + (featured ? " featured" : "") + '">' +
      '<span class="panga-head">' + icon + '<span class="panga-label">' + label + '</span></span>' +
      '<span class="panga-name">' + esc(name) + '</span>' +
      '<span class="panga-sub">' + sub + '</span></div>';
  }

  function card(title, body, id, collapsed, icon) {
    var head = icon
      ? '<span class="card-title">' + icon + " " + title + '</span>'
      : '<span class="card-title">' + title + '</span>';
    return '<section class="card">' +
      '<h2 class="card-heading" id="toggle-' + id + '" tabindex="-1">' + head + '</h2>' +
      '<div class="card-body" id="body-' + id + '">' + body + '</div></section>';
  }

  function timingsHTML(d) {
    if (!d.timings.length) return '<p class="empty-note">ಈ ದಿನದ ಕಾಲ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.</p>';
    var c = d.calendar;
    var span = toMin(c.sunset) - toMin(c.sunrise) || 1;
    var ordered = d.timings.slice().sort(function (a, b) { return toMin(a.from) - toMin(b.from); });
    var blocks = ordered.map(function (t) {
      var l = (toMin(t.from) - toMin(c.sunrise)) / span * 100;
      var w = (toMin(t.to) - toMin(t.from)) / span * 100;
      return '<div class="tl-block ' + t.tone + '" style="left:' + l.toFixed(1) + '%;width:' + Math.max(w, 4).toFixed(1) + '%" title="' + esc(t.name) + " " + t.from + "–" + t.to + '">' +
        "<b>" + esc(t.name) + "</b>" + kn(t.from) + "–" + kn(t.to) + "</div>";
    }).join("");
    /* Vertical schedule rows: sunrise endpoint, one row per kala (time on its
       own line below the name), sunset endpoint. Text carries the meaning;
       the dot is a color+position reinforcement, never color alone. */
    var endRow = function (icon, label, time) {
      return '<li class="tl-end-row">' + icon +
        '<span class="tl-end-name">' + label + '</span>' +
        '<span class="t-time">' + kn(time || "—") + '</span></li>';
    };
    var rows = endRow(ICONS.sunrise, "ಸೂರ್ಯೋದಯ", c.sunrise) +
      ordered.map(function (t) {
        return '<li class="tl-row"><span class="tone-dot ' + t.tone + '" aria-hidden="true"></span>' +
          '<span class="tl-main"><span class="tl-name">' + esc(t.name) + '</span>' +
          '<span class="t-time">' + kn(t.from) + " – " + kn(t.to) + '</span></span></li>';
      }).join("") +
      endRow(ICONS.sunset, "ಸೂರ್ಯಾಸ್ತ", c.sunset);
    return '<div class="timeline">' +
        '<div class="tl-track">' + blocks + '</div>' +
        '<div class="tl-ends"><span>' + ICONS.sunrise + " " + kn(c.sunrise || "—") + '</span><span>' + kn(c.sunset || "—") + " " + ICONS.sunset + '</span></div>' +
      '</div><ul class="timing-list">' + rows + '</ul>' +
      '<div class="timing-legend" aria-label="ಕಾಲಗಳ ಬಣ್ಣದ ಅರ್ಥ">' +
        '<span><i class="tone-dot good" aria-hidden="true"></i> ಶುಭ</span>' +
        '<span><i class="tone-dot mid" aria-hidden="true"></i> ಮಧ್ಯಮ</span>' +
        '<span><i class="tone-dot bad" aria-hidden="true"></i> ಅಶುಭ</span>' +
      '</div>';
  }

  function jathakaHTML(d) {
    if (!d.jathaka.length) return '<p class="empty-note">ಈ ದಿನದ ರಾಶಿ ಭವಿಷ್ಯ ಲಭ್ಯವಿಲ್ಲ.</p>';
    return '<div class="jathaka-list">' + d.jathaka.map(function (j) {
      return '<div class="jr"><span class="jr-name">' + esc(j[0]) + '</span><span class="jr-p">' + esc(j[1]) + "</span></div>";
    }).join("") + "</div>";
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
    goto(keyFor(d), false);
  }

  function weekAgendaHTML(key) {
    var d = parseKey(key), district = districtEventsFor(key), statewide = stateEventsFor(key);
    var counts = district.length || statewide.length ? '<span class="week-day-counts">' + (district.length ? '<span class="count-district">ಜಿಲ್ಲೆ ' + district.length + '</span>' : '') + (statewide.length ? '<span class="count-state">ಕರ್ನಾಟಕ ' + statewide.length + '</span>' : '') + '</span>' : '';
    var content = '<h3 class="week-day-title"><button type="button" class="week-day-link" data-day="' + key + '">' +
      WEEKDAYS[d.getDay()] + ' <span>' + kn(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + kn(d.getFullYear()) + '</span>' + counts + '</button></h3>';
    if (!district.length && !statewide.length) return '<section class="week-day" data-day="' + key + '">' + content + '<p class="empty-note">ಈ ದಿನ ಯಾವುದೇ ವಿಶೇಷ ದಿನವಿಲ್ಲ.</p></section>';
    return '<section class="week-day" data-day="' + key + '">' + content +
      '<div class="week-scope district"><h4>ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು</h4><ul class="ev-list">' + (district.length ? district.map(function (r) { return pvRow(r, "", key); }).join("") : '<li class="empty-note">ಈ ದಿನ ಯಾವುದೇ ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.</li>') + '</ul></div>' +
      '<div class="week-scope statewide"><h4>ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು</h4><ul class="ev-list">' + (statewide.length ? statewide.map(function (r) { return pvRow(r, "", key); }).join("") : '<li class="empty-note">ಈ ದಿನ ಯಾವುದೇ ಕರ್ನಾಟಕ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.</li>') + '</ul></div>' +
      '</section>';
  }

  function weekBlockHTML(startKey) {
    var start = parseKey(startKey), end = new Date(start);
    end.setDate(end.getDate() + 6);
    return '<section class="week-block" data-start="' + startKey + '"><h2 class="stream-period-title">' + periodLabel(start, end) + '</h2>' +
      Array.from({ length: 7 }, function (_, i) {
        var d = new Date(start); d.setDate(d.getDate() + i); return weekAgendaHTML(keyFor(d));
      }).join("") + '</section>';
  }

  function weekKeyShift(key, weeks) {
    var d = parseKey(key); d.setDate(d.getDate() + weeks * 7); return keyFor(d);
  }

  function streamTopOffset(viewId) {
    var masthead = document.querySelector(".masthead");
    var toolbar = document.querySelector(viewId + " .stream-toolbar");
    return (masthead ? masthead.offsetHeight : 0) + (toolbar ? toolbar.offsetHeight : 0) + 12;
  }

  function scrollToStreamBlock(block, viewId) {
    var top = block.getBoundingClientRect ? block.getBoundingClientRect().top : (block.offsetTop || 0);
    var y = top + (window.pageYOffset || window.scrollY || 0) - streamTopOffset(viewId);
    window.scrollTo(0, Math.max(0, y));
  }

  function bindWeekStream() {
    var el = document.getElementById("weekAgenda");
    if (!el || el._streamBound) return;
    el._streamBound = true;
    el.addEventListener("click", function (e) {
      var target = e.target && e.target.closest ? e.target.closest("[data-day]") : null;
      if (target && target.dataset.day) openDay(target.dataset.day);
    });
  }

  function updateWeekHeader() {
    var blocks = document.querySelectorAll("#weekAgenda .week-block"), chosen = null, edge = streamTopOffset("#viewWeek") + 1;
    blocks.forEach(function (block) {
      if (block.getBoundingClientRect().top <= edge) chosen = block;
    });
    if (!chosen && blocks.length) chosen = blocks[0];
    if (chosen) {
      state.weekHeader = chosen.dataset.start;
      document.getElementById("weekDistrictSelect").innerHTML = districtOptionsHTML("week");
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
      document.getElementById("weekDistrictSelect").innerHTML = districtOptionsHTML("week");
      return;
    }
    if (!state.pv) {
      document.getElementById("weekAgenda").innerHTML = PV_LOADING;
      document.getElementById("weekDistrictSelect").innerHTML = districtOptionsHTML("week");
      return;
    }
    var pages = [], cursor = state.weekFirst;
    while (true) {
      pages.push(weekBlockHTML(cursor));
      if (cursor === state.weekLast) break;
      cursor = weekKeyShift(cursor, 1);
    }
    document.getElementById("weekAgenda").innerHTML = pages.join("");
    document.getElementById("weekDistrictSelect").innerHTML = districtOptionsHTML("week");
    bindWeekStream();
    if (!state.weekHeader) {
      var selectedBlock = document.querySelector('#weekAgenda .week-block[data-start="' + start + '"]');
      if (selectedBlock) scrollToStreamBlock(selectedBlock, "#viewWeek");
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
      var local = districtEventsFor(k).length, statewide = stateEventsFor(k).length;
      var aria = local || statewide ? ' aria-label="' + kn(day) + ': ' + (local ? "ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು " + local : "") + (local && statewide ? ", " : "") + (statewide ? "ಕರ್ನಾಟಕ ಕಾರ್ಯಕ್ರಮಗಳು " + statewide : "") + '"' : '';
      html += '<button class="mday' + (sel ? " sel" : "") + (today ? " today" : "") + '" data-day="' + k + '" type="button"' + (today ? ' title="ಇಂದು"' : "") + aria + '>' + kn(day) +
        (local || statewide ? '<span class="mday-dots" aria-hidden="true">' + (local ? '<i class="scope-dot district"></i><b class="date-count district">' + local + '</b>' : '') + (statewide ? '<i class="scope-dot state"></i><b class="date-count state">' + statewide + '</b>' : '') + '</span>' : '') + '</button>';
    }
    return '<div class="week-row">' + WEEKDAYS.map(function (w) { return "<span>" + w.charAt(0) + "</span>"; }).join("") + '</div><div class="month-grid">' + html + '</div>';
  }

  /* Month agenda: each PV source record listed once, with its date or inclusive
     date range. Overlaps the displayed month. */
  function monthAgendaHTML(y, m) {
    if (state.pvError) return PV_ERROR;
    if (!state.pv) return PV_LOADING;
    var monthStart = y + "-" + pad(m + 1) + "-01";
    var monthEnd = y + "-" + pad(m + 1) + "-" + pad(daysInMonth(y, m + 1));
    var list = state.pvRecords.filter(function (r) {
      return visibleRecord(r) && r.dateEnd >= monthStart && r.dateStart <= monthEnd;
    }).sort(function (a, b) { return a.dateStart < b.dateStart ? -1 : a.dateStart > b.dateStart ? 1 : 0; });
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
        var when = r.dateStart === r.dateEnd ? isoToKey(r.dateStart) : isoToKey(r.dateStart) + " – " + isoToKey(r.dateEnd);
        return pvRow(r, when);
      }).join(""); };
      return '<section class="agenda-day"><h3><button type="button" class="agenda-day-link" data-day="' + isoToKey(date) + '">' + isoToKey(date) + '</button></h3>' +
        (local.length ? '<div class="agenda-scope"><h4>ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು</h4><ul class="ev-list">' + rows(local) + '</ul></div>' : '') +
        (statewide.length ? '<div class="agenda-scope statewide"><h4>ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು</h4><ul class="ev-list">' + rows(statewide) + '</ul></div>' : '') + '</section>';
    }).join("") + "</div>";
  }

  function monthBlockHTML(key) {
    var p = key.split("-"), y = +p[0], m = +p[1];
    return '<section class="month-block" data-month="' + key + '"><h2 class="stream-period-title">' + MONTHS[m] + " " + kn(y) + '</h2>' +
      monthCalendarHTML(y, m) + '<div class="scope-legend month-legend" aria-label="ಕಾರ್ಯಕ್ರಮದ ವ್ಯಾಪ್ತಿ"><span><i class="scope-dot district"></i> ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು</span><span><i class="scope-dot state"></i> ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು</span></div>' +
      '<section class="month-agenda" aria-labelledby="monthAgenda-' + key + '"><h3 class="ev-section-title" id="monthAgenda-' + key + '">ತಿಂಗಳ ವೇಳಾಪಟ್ಟಿ</h3>' + monthAgendaHTML(y, m) + '</section></section>';
  }

  function bindMonthStream() {
    var el = document.getElementById("monthScroller");
    if (!el || el._streamBound) return;
    el._streamBound = true;
    el.addEventListener("click", function (e) {
      var target = e.target && e.target.closest ? e.target.closest("[data-day]") : null;
      if (target && target.dataset.day) openDay(target.dataset.day);
    });
  }

  function updateMonthHeader() {
    var blocks = document.querySelectorAll("#monthScroller .month-block"), chosen = null, edge = streamTopOffset("#viewMonth") + 1;
    blocks.forEach(function (block) { if (block.getBoundingClientRect().top <= edge) chosen = block; });
    if (!chosen && blocks.length) chosen = blocks[0];
    if (chosen) {
      state.monthHeader = chosen.dataset.month;
      document.getElementById("monthDistrictSelect").innerHTML = districtOptionsHTML("month");
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
        if (selectedMonth) scrollToStreamBlock(selectedMonth, "#viewMonth");
      }
      updateMonthHeader();
    }
    document.getElementById("monthDistrictSelect").innerHTML = districtOptionsHTML("month");
    bindDistrictSelectors();
  }

  /* ---------------- Masthead ---------------- */
  function periodLabel(start, end) {
    var sameYear = start.getFullYear() === end.getFullYear();
    var left = MONTHS[start.getMonth()] + " " + kn(start.getDate());
    var right = MONTHS[end.getMonth()] + " " + kn(end.getDate());
    if (!sameYear) left += ", " + kn(start.getFullYear());
    return left + " – " + right + ", " + kn(end.getFullYear());
  }

  function renderMasthead() {
    var dt = parseKey(state.key);
    var el = document.getElementById("mastheadDate");
    var label = MONTHS[dt.getMonth()] + " " + kn(dt.getDate()) + ", " + kn(dt.getFullYear()) + " · " + WEEKDAYS[dt.getDay()];
    if (state.tab === "week") {
      var start = parseKey(state.weekHeader || weekStartKey(state.key)), end = new Date(start);
      end.setDate(end.getDate() + 6);
      label = periodLabel(start, end);
    } else if (state.tab === "month") {
      var month = state.monthHeader ? state.monthHeader.split("-") : [dt.getFullYear(), dt.getMonth()];
      label = MONTHS[+month[1]] + " " + kn(+month[0]);
    }
    el.textContent = label;
    var prev = document.getElementById("prevDay"), next = document.getElementById("nextDay");
    var unit = state.tab === "week" ? "ವಾರ" : state.tab === "month" ? "ತಿಂಗಳು" : "ದಿನ";
    prev.setAttribute("aria-label", "ಹಿಂದಿನ " + unit);
    next.setAttribute("aria-label", "ಮುಂದಿನ " + unit);
    if (document.documentElement) document.documentElement.style.setProperty("--masthead-h", document.querySelector(".masthead").offsetHeight + "px");
    document.title = MONTHS[dt.getMonth()] + " " + kn(dt.getDate()) + " — ಕನ್ನಡ ಪಂಚಾಂಗ";
  }

  /* ---------------- Tab switching ---------------- */
  var VIEWS = { day: "viewDay", week: "viewWeek", month: "viewMonth", more: "viewMore" };

  function setTab(name) {
    var previous = state.tab;
    state.tab = name;
    if (name === "week" && previous !== "week") state.weekFirst = state.weekLast = state.weekHeader = null;
    if (name === "month" && previous !== "month") state.monthFirst = state.monthLast = state.monthHeader = null;
    if (name !== "day") state.loading = false;
    renderMasthead();
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.id !== VIEWS[name]; });
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    renderActive();
    if (name === "day" && !state.data[state.key] && !state.pending[state.key]) fetchDate(state.key);
    updateSectionFab();
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
  function loadDistrict() { try { return sessionStorage.getItem("pvDistrict") || ""; } catch (e) { return ""; } }
  function saveDistrict(d) { try { sessionStorage.setItem("pvDistrict", d); } catch (e) {} }
  function loadDate() { try { var key = sessionStorage.getItem("pvDate"); return validKey(key) ? key : DEFAULT_KEY; } catch (e) { return DEFAULT_KEY; } }
  function saveDate(key) { try { sessionStorage.setItem("pvDate", key); } catch (e) {} }
  function prepareSession() {
    try {
      if (sessionStorage.getItem("pvSessionVersion") !== SESSION_VERSION) {
        sessionStorage.removeItem("pvDate");
        sessionStorage.removeItem("pvDistrict");
        sessionStorage.setItem("pvSessionVersion", SESSION_VERSION);
      }
    } catch (e) {}
  }

  function bindDistrictSelectors() {
    ["districtSelect", "weekDistrictSelect", "monthDistrictSelect", "settingsDistrictSelect"].forEach(function (id) {
      var select = document.getElementById(id);
      if (!select || select._pvBound) return;
      select._pvBound = true;
      select.addEventListener("change", function () {
        state.district = select.value || "";
        saveDistrict(state.district);
        renderAll();
      });
    });
  }

  function renderSettings() {
    document.getElementById("settingsDistrictSelect").innerHTML = districtOptionsHTML("all");
    bindDistrictSelectors();
  }

  function openDay(key) {
    setTab("day");
    goto(key, true);
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
      if (el._swipeX == null || state.loading) return;
      var dx = e.changedTouches[0].clientX - el._swipeX;
      var dy = e.changedTouches[0].clientY - el._swipeY;
      el._swipeX = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
      action(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function bindSectionJump() {
    var fab = document.getElementById("sectionFab"), menu = document.getElementById("sectionMenu");
    if (!fab || fab._pvBound) return;
    fab._pvBound = true;
    function jumpTo(target) {
      var masthead = document.querySelector(".masthead");
      var offset = masthead ? masthead.offsetHeight + 12 : 12;
      var top = target.getBoundingClientRect().top + (window.pageYOffset || window.scrollY || 0) - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      target.focus({ preventScroll: true });
    }
    fab.addEventListener("click", function () {
      menu.hidden = !menu.hidden;
      fab.setAttribute("aria-expanded", String(!menu.hidden));
    });
    menu.querySelectorAll("button").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = document.getElementById(button.dataset.target);
        menu.hidden = true;
        fab.setAttribute("aria-expanded", "false");
        if (target && target.getBoundingClientRect && target.focus) jumpTo(target);
      });
    });
  }

  function updateSectionFab() {
    var fab = document.getElementById("sectionFab");
    if (!fab || !fab.classList) return;
    var visible = state.tab === "day";
    fab.classList.toggle("is-visible", visible);
    if (!visible) {
      var menu = document.getElementById("sectionMenu");
      if (menu) menu.hidden = true;
    }
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
    document.getElementById("todayBtn").addEventListener("click", function () { openDay(keyFor(new Date())); });
    document.getElementById("fontBig").addEventListener("change", function (e) {
      state.big = e.target.checked;
      if (document.body) document.body.classList.toggle("big", state.big);
    });
    document.getElementById("knDigits").addEventListener("change", function (e) {
      state.kn = e.target.checked;
      renderAll();
    });
    state.key = loadDate();
    state.district = loadDistrict();
    bindDistrictSelectors();
    bindSwipe("mastheadDateBlock", function (n) { shiftPeriod(n); });
    bindSwipe("viewDay", function (n) { if (state.tab === "day") shiftDay(n); });
    bindSwipe("weekHead", function (n) { shiftWeek(n); });
    bindSwipe("monthHead", function (n) { shiftMonth(n); });
    bindSectionJump();
    updateSectionFab();
    if (window.addEventListener) window.addEventListener("scroll", function () {
      updateSectionFab();
      lazyWeekScroll();
      lazyMonthScroll();
    }, { passive: true });
    fetchPV().then(function () {
      if (state.pv && state.district && !state.pv.sheets[state.district]) {
        state.district = "";
        saveDistrict("");
      }
      renderAll();
    });
    goto(state.key, true);
  }

  function shiftDay(n) {
    var d = parseKey(state.key);
    d.setDate(d.getDate() + n);
    goto(keyFor(d), true);
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
    goto(keyFor(d), state.tab === "day");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
