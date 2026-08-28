/* ನಿತ್ಯ ಪಂಚಾಂಗ — plain JS, no dependencies.
   Data source: ocr-zones/<DD-MM-YYYY>/structured-ocr.json (per-date fetch,
   cached in state.data; 06-04 offline/file:// falls back to FALLBACK inline). */
(function () {
  "use strict";

  var FALLBACK_KEY = "06-04-2026";
  var DEFAULT_KEY = keyFor(new Date());

  /* ---------------- Inline fallback (same day as the JSON) ---------------- */
  var FALLBACK = {
    key: FALLBACK_KEY,
    calendar: {
      months: ["ಚೈತ್ರ", "ವೈಶಾಖ"],
      samvatsara: "ಪರಾಭವ",
      shakaYear: 1948,
      sunrise: "06:12",
      sunset: "18:31"
    },
    events: [
      "ಅನಸೂಯಾ ಜಯಂತಿ",
      "ಇಂಚಗೇರಿ ಗುರುಪುತ್ರೇಶ್ವರ ಮಹಾ ಜಯಂತಿ",
      "ಖಂಡೋಬಾ ಜಾತ್ರೆ — ಬೋರ-ಗಾಂವ್, ತಾ. ಚಿಕ್ಕೋಡಿ",
      "ಸುರಪೂರ ಜಾತ್ರೆ — ತಾ. ಹಿಗ್ಗಡಿಹಾಳ",
      "ಶ್ರೀ ಸದಾನಂದ ಕೃಷ್ಣಮಹಾ ಜಾತ್ರೆ"
    ],
    panchanga: {
      tithi:     { name: "ಚತುರ್ಥಿ", paksha: "ಕೃಷ್ಣ", ends: 14.11, nextDay: false },
      nakshatra: { name: "ಅನುರಾಧ", ends: 26.57, nextDay: true },
      yoga:      { name: "ಸಿದ್ಧಿ", ends: 14.44, nextDay: false },
      karana:    { name: "ಕೌಲವ", ends: 27.22, nextDay: true },
      ayana: "ಉತ್ತರಾಯಣ", ritu: "ವಸಂತ", solarRashi: "ಮೀನ", chandraRashi: "ವೃಶ್ಚಿಕ"
    },
    timings: [
      { name: "ರಾಹು ಕಾಲ",   from: "07:30", to: "09:00", tone: "bad" },
      { name: "ಅರ್ಥ ಪ್ರಹರ", from: "09:00", to: "10:30", tone: "mid" },
      { name: "ಯಮಗಂಡ",      from: "10:30", to: "12:00", tone: "bad" },
      { name: "ಗುಳಿಕ ಕಾಲ",   from: "13:30", to: "15:00", tone: "bad" },
      { name: "ಶುಭ ಸಮಯ",     from: "15:19", to: "17:07", tone: "good" }
    ],
    jathaka: [
      ["ಮೇಷ", "ಸಂತೋಷ"], ["ವೃಷಭ", "ಪ್ರತಿರೋಧ"], ["ಮಿಥುನ", "ಯಶಸ್ಸು"], ["ಕರ್ಕಾಟಕ", "ಪ್ರಗತಿ"],
      ["ಸಿಂಹ", "ಸ್ನೇಹ"], ["ಕನ್ಯಾ", "ನಿರಾಶೆ"], ["ತುಲಾ", "ಲಾಭ"], ["ವೃಶ್ಚಿಕ", "ಪ್ರೋತ್ಸಾಹ"],
      ["ಧನಸ್ಸು", "ಸಂತೋಷ"], ["ಮಕರ", "ಅನಾರೋಗ್ಯ"], ["ಕುಂಭ", "ಕೀರ್ತಿ"], ["ಮೀನ", "ಅಭಿವೃದ್ಧಿ"]
    ]
  };

  /* ---------------- Unavailable record (no fabricated data) ---------------- */
  function unavailableDay(key) {
    return {
      key: key, unavailable: true, events: [], timings: [], jathaka: [],
      calendar: { months: [], samvatsara: null, shakaYear: null, sunrise: null, sunset: null },
      panchanga: null
    };
  }

  /* ---------------- State & helpers ---------------- */
  var state = { key: DEFAULT_KEY, data: {}, pending: {}, monthLoads: {}, monthSeq: 0, tab: "today", big: false, kn: false, loading: false, seq: 0,
    pv: null, pvIndex: {}, pvRecords: [], pvError: false, pvPending: null, district: "" };

  var WEEKDAYS = ["ಭಾನುವಾರ", "ಸೋಮವಾರ", "ಮಂಗಳವಾರ", "ಬುಧವಾರ", "ಗುರುವಾರ", "ಶುಕ್ರವಾರ", "ಶನಿವಾರ"];
  var MONTHS = ["ಜನವರಿ", "ಫೆಬ್ರವರಿ", "ಮಾರ್ಚ್", "ಏಪ್ರಿಲ್", "ಮೇ", "ಜೂನ್", "ಜುಲೈ", "ಆಗಸ್ಟ್", "ಸೆಪ್ಟೆಂಬರ್", "ಅಕ್ಟೋಬರ್", "ನವೆಂಬರ್", "ಡಿಸೆಂಬರ್"];
  var KN_DIGITS = ["೦", "೧", "೨", "೩", "೪", "೫", "೬", "೭", "೮", "೯"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parseKey(k) { var p = k.split("-"); return new Date(+p[2], +p[1] - 1, +p[0]); }
  function keyFor(d) { return pad(d.getDate()) + "-" + pad(d.getMonth() + 1) + "-" + d.getFullYear(); }
  function kn(s) { return state.kn ? String(s).replace(/\d/g, function (d) { return KN_DIGITS[+d]; }) : String(s); }
  function dayData(key) { return state.data[key] || unavailableDay(key); }
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
  function indexPV(json) {
    var index = {}, records = [];
    var sheets = (json && json.sheets) || {};
    Object.keys(sheets).forEach(function (district) {
      (sheets[district] || []).forEach(function (rec) {
        var start = String(rec.date || "").trim();
        if (!start) return;
        var end = String(rec.date_end || rec.date || "").trim();
        var r = {
          sourceDistrict: district,
          dateStart: start,
          dateEnd: end,
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
    return { index: index, records: records };
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

  function pvRow(r) {
    var place = r.place ? ' <span class="ev-place">' + esc(r.place) + '</span>' : "";
    return '<li class="ev-row"><span class="ev-mark" aria-hidden="true"></span><span class="ev-text">' + esc(r.title) + place + '</span></li>';
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

  function districtOptionsHTML() {
    if (!state.pv) return '<option value="">ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ</option>';
    return '<option value="">ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ</option>' + Object.keys(state.pv.sheets).map(function (name) {
      return '<option value="' + esc(name) + '"' + (name === state.district ? " selected" : "") + '>' + esc(name) + '</option>';
    }).join("");
  }

  function eventGroupHTML(id, title, records, stateGroup) {
    return '<section class="ev-section' + (stateGroup ? " state" : "") + '" aria-labelledby="' + id + 'Title">' +
      '<h3 class="ev-section-title" id="' + id + 'Title">' + title + '</h3>' +
      '<div id="' + id + '" class="ev-container">' + pvListHTML(records) + '</div></section>';
  }

  /* Today's events card — PV events instead of OCR. District and state groups
     live inside the existing card body, not in separate page-level blocks. */
  function pvEventsHTML(key) {
    if (state.pvError) return PV_ERROR;
    if (!state.pv) return PV_LOADING;
    return '<div class="district-pick"><label for="districtSelect">ಜಿಲ್ಲೆ</label>' +
      '<select id="districtSelect" class="district-select" name="district">' + districtOptionsHTML() + '</select></div>' +
      eventGroupHTML("districtEvents", "ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು", districtEventsFor(key), false) +
      eventGroupHTML("stateEvents", "ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು", stateEventsFor(key), true);
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
  function goto(key) {
    state.key = key;
    renderMasthead();
    if (state.data[key]) { renderActive(); return; }
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
      .catch(function () { return (key === FALLBACK_KEY) ? FALLBACK : unavailableDay(key); })
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

  function monthId(year, month) { return year + "-" + month; }

  function preloadMonth(year, month) {
    var id = monthId(year, month);
    if (state.monthLoads[id]) return;
    state.monthLoads[id] = true;
    var seq = ++state.monthSeq;
    var days = new Date(year, month + 1, 0).getDate();
    var keys = [];
    for (var day = 1; day <= days; day++) {
      var key = keyFor(new Date(year, month, day));
      if (!state.data[key]) keys.push(key);
    }
    Promise.all(keys.map(fetchRecord)).then(function () {
      var current = parseKey(state.key);
      if (seq === state.monthSeq && state.tab === "month" && current.getFullYear() === year && current.getMonth() === month) {
        renderMonth();
      }
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
      var dt = parseKey(state.key);
      var heroTop = '<div class="hero-top">' +
        '<span class="hero-num">' + kn(dt.getDate()) + '</span>' +
        '<span class="hero-when">' +
          '<span class="hero-weekday">' + WEEKDAYS[dt.getDay()] + '</span>' +
          '<span class="hero-month">' + MONTHS[dt.getMonth()] + ' ' + kn(dt.getFullYear()) + '</span>' +
        '</span>' +
      '</div>';
      if (d.unavailable) {
        document.getElementById("todayContent").innerHTML =
          '<div class="hero">' + heroTop +
            '<p class="empty-note">ಈ ದಿನದ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ</p>' +
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

        var panga = '<div class="panga-grid">' +
          pc("ತಿಥಿ", pan.tithi.name, (pan.tithi.paksha ? pan.tithi.paksha + " ಪಕ್ಷ · " : "") + "ಮುಗಿಯುವುದು " + fmtEnd(pan.tithi.ends, pan.tithi.nextDay), true, ICONS.tithi) +
          pc("ನಕ್ಷತ್ರ", pan.nakshatra.name, "ಮುಗಿಯುವುದು " + fmtEnd(pan.nakshatra.ends, pan.nakshatra.nextDay), true, ICONS.nakshatra) +
          pc("ಯೋಗ", pan.yoga.name, "ಮುಗಿಯುವುದು " + fmtEnd(pan.yoga.ends, pan.yoga.nextDay), false, ICONS.yoga) +
          pc("ಕರಣ", pan.karana.name, "ಮುಗಿಯುವುದು " + fmtEnd(pan.karana.ends, pan.karana.nextDay), false, ICONS.karana) +
          '</div>' + pangaMetaHTML(pan);

        document.getElementById("todayContent").innerHTML =
          '<div class="hero">' + heroTop +
            '<p class="hero-meta">' + meta.join(" · ") + '</p>' +
          '</div>' + sun +
          panga +
          card("ಇಂದಿನ ಹಬ್ಬಗಳು / ವಿಶೇಷ ದಿನಗಳು", pvEventsHTML(state.key), "events", false, ICONS.diya) +
          card("ಸಮಯಗಳು — ಕಾಲ", timingsHTML(d), "timings") +
          card("ರಾಶಿ ಭವಿಷ್ಯ", jathakaHTML(d), "jathaka", true);

        bindToggle("toggle-events");
        bindToggle("toggle-timings");
        bindToggle("toggle-jathaka");
        bindEventCardUI();
      }
    }
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
    var open = collapsed ? "false" : "true";
    var bodyHidden = collapsed ? " hidden" : "";
    var head = icon
      ? '<span class="card-title">' + icon + " " + title + '</span>'
      : '<span class="card-title">' + title + '</span>';
    return '<section class="card">' +
      '<button class="card-toggle" id="toggle-' + id + '" type="button" aria-expanded="' + open + '" aria-controls="body-' + id + '">' +
        head + '<span class="chev" aria-hidden="true">▾</span>' +
      '</button>' +
      '<div class="card-body" id="body-' + id + '"' + bodyHidden + '>' + body + '</div></section>';
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

  /* ---------------- Render: Month ---------------- */
  function renderMonth() {
    var cur = parseKey(state.key);
    var y = cur.getFullYear(), m = cur.getMonth();
    preloadMonth(y, m);
    var days = new Date(y, m + 1, 0).getDate();
    var lead = new Date(y, m, 1).getDay(); /* 0 = ಭಾನುವಾರ */
    var title = MONTHS[m] + " " + kn(y);
    document.getElementById("monthTitle").textContent = title;
    document.getElementById("weekRow").innerHTML = WEEKDAYS.map(function (w) { return "<span>" + w.charAt(0) + "</span>"; }).join("");

    var html = "";
    for (var i = 0; i < lead; i++) html += '<span class="mday blank" aria-hidden="true"></span>';
    for (var day = 1; day <= days; day++) {
      var k = keyFor(new Date(y, m, day));
      var sel = k === state.key;
      var today = k === DEFAULT_KEY;
      var fest = visibleEventsFor(k).length > 0;
      html += '<button class="mday' + (sel ? " sel" : "") + (today ? " today" : "") + (fest ? " fest" : "") + '" data-day="' + k + '" type="button"' + (today ? ' aria-label="ಇಂದು, ' + kn(day) + '" title="ಇಂದು"' : "") + '>' + kn(day) + "</button>";
    }
    document.getElementById("monthGrid").innerHTML = html;
    document.querySelectorAll("#monthGrid .mday:not(.blank)").forEach(function (b) {
      b.addEventListener("click", function () { goto(b.dataset.day); setTab("today"); });
    });
    renderMonthAgenda();
  }

  /* Month agenda: each PV source record listed once, with its date or inclusive
     date range. Overlaps the displayed month. */
  function renderMonthAgenda() {
    var el = document.getElementById("monthAgenda");
    if (!el) return;
    if (state.pvError) { el.innerHTML = PV_ERROR; return; }
    if (!state.pv) { el.innerHTML = PV_LOADING; return; }
    var cur = parseKey(state.key);
    var y = cur.getFullYear(), m = cur.getMonth();
    var monthStart = y + "-" + pad(m + 1) + "-01";
    var monthEnd = y + "-" + pad(m + 1) + "-" + pad(daysInMonth(y, m + 1));
    var list = state.pvRecords.filter(function (r) {
      return visibleRecord(r) && r.dateEnd >= monthStart && r.dateStart <= monthEnd;
    }).sort(function (a, b) { return a.dateStart < b.dateStart ? -1 : a.dateStart > b.dateStart ? 1 : 0; });
    if (!list.length) { el.innerHTML = '<p class="empty-note">ಈ ತಿಂಗಳಲ್ಲಿ ಯಾವುದೇ ಘಟನೆ ಇಲ್ಲ.</p>'; return; }
    el.innerHTML = '<div class="ev-panel"><ul class="ev-list">' + list.map(function (r) {
      var when = r.dateStart === r.dateEnd ? isoToKey(r.dateStart) : isoToKey(r.dateStart) + " – " + isoToKey(r.dateEnd);
      var place = r.place ? ' <span class="ev-place">' + esc(r.place) + '</span>' : "";
      return '<li class="ev-row"><span class="ev-mark" aria-hidden="true"></span><span class="ev-text">' + esc(r.title) + place + ' <span class="ev-when">' + esc(when) + '</span></span></li>';
    }).join("") + "</ul></div>";
  }

  /* ---------------- Render: Rashi ---------------- */
  function renderRashi() {
    var d = dayData(state.key);
    var dt = parseKey(state.key);
    var sub = WEEKDAYS[dt.getDay()] + ", " + MONTHS[dt.getMonth()] + " " + kn(dt.getDate());
    document.getElementById("rashiSub").textContent = sub + " ರಾಶಿ ಭವಿಷ್ಯ";
    var el = document.getElementById("rashiGrid");
    if (state.loading) { el.innerHTML = LOADING_HTML; return; }
    if (d.unavailable) {
      el.innerHTML = '<p class="empty-note">ಈ ದಿನದ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ</p>';
      return;
    }
    if (!d.jathaka.length) {
      el.innerHTML = '<p class="empty-note">ಈ ದಿನದ ರಾಶಿ ಭವಿಷ್ಯ ಲಭ್ಯವಿಲ್ಲ.</p>';
      return;
    }
    el.innerHTML = d.jathaka.map(function (j) {
      return '<div class="rc"><span class="rc-name">' + esc(j[0]) + '</span><span class="rc-p">' + esc(j[1]) + "</span></div>";
    }).join("");
  }

  /* ---------------- Masthead ---------------- */
  function renderMasthead() {
    var dt = parseKey(state.key);
    var el = document.getElementById("mastheadDate");
    el.textContent = MONTHS[dt.getMonth()] + " " + kn(dt.getDate()) + ", " + kn(dt.getFullYear()) + " · " + WEEKDAYS[dt.getDay()];
    document.title = MONTHS[dt.getMonth()] + " " + kn(dt.getDate()) + " — ನಿತ್ಯ ಪಂಚಾಂಗ";
  }

  /* ---------------- Tab switching ---------------- */
  var VIEWS = { today: "viewToday", month: "viewMonth", rashi: "viewRashi", more: "viewMore" };

  function setTab(name) {
    state.tab = name;
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.id !== VIEWS[name]; });
    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.tab === name;
      t.classList.toggle("is-active", on);
      if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
    renderActive();
    document.querySelector(".main").scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function renderActive() {
    if (state.tab === "today") renderToday();
    else if (state.tab === "month") renderMonth();
    else if (state.tab === "rashi") renderRashi();
  }

  function renderAll() { renderMasthead(); renderActive(); }

  /* ---------------- Toggle helper ---------------- */
  function bindToggle(prefix) {
    var btn = document.getElementById(prefix);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      var body = document.getElementById(prefix.replace("toggle-", "body-"));
      if (body) body.hidden = open;
    });
  }

  /* ---------------- Init ---------------- */
  function loadDistrict() { try { return sessionStorage.getItem("pvDistrict") || ""; } catch (e) { return ""; } }
  function saveDistrict(d) { try { sessionStorage.setItem("pvDistrict", d); } catch (e) {} }

  function init() {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () {
        if (t.dataset.tab === "today") goto(DEFAULT_KEY);
        setTab(t.dataset.tab);
      });
    });
    document.getElementById("prevDay").addEventListener("click", function () { shiftDay(-1); });
    document.getElementById("nextDay").addEventListener("click", function () { shiftDay(1); });
    document.getElementById("prevMonth").addEventListener("click", function () { shiftMonth(-1); });
    document.getElementById("nextMonth").addEventListener("click", function () { shiftMonth(1); });
    document.getElementById("brand").addEventListener("click", function () { goto(DEFAULT_KEY); setTab("today"); });
    document.getElementById("fontBig").addEventListener("change", function (e) {
      state.big = e.target.checked;
      document.body.classList.toggle("big", state.big);
    });
    document.getElementById("knDigits").addEventListener("change", function (e) {
      state.kn = e.target.checked;
      renderAll();
    });
    state.district = loadDistrict();
    fetchPV().then(function () {
      if (state.pv && state.district && !state.pv.sheets[state.district]) {
        state.district = "";
        saveDistrict("");
      }
      renderAll();
    });
    goto(DEFAULT_KEY);
  }

  function shiftDay(n) {
    var d = parseKey(state.key);
    d.setDate(d.getDate() + n);
    goto(keyFor(d));
  }

  function shiftMonth(n) {
    var d = parseKey(state.key);
    var day = Math.min(d.getDate(), 28);
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    goto(keyFor(d));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
