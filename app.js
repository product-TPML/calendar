/* ಕನ್ನಡ ಸಾಂಸ್ಕೃತಿಕ ಕ್ಯಾಲೆಂಡರ್ — plain JS, no dependencies.
   Data source: data/pv-calendar-data.json (one normalized event index). */
(function () {
  "use strict";

  var DEFAULT_KEY = keyFor(new Date());
  var SESSION_VERSION = "5";

  /* ---------------- State & helpers ---------------- */
  var state = { key: DEFAULT_KEY, tab: "day", big: false, kn: false,
    pv: null, pvIndex: {}, pvRecords: [], pvError: false, pvPending: null, pvQA: [],
    cultural: null, culturalIndex: {}, culturalRecords: [], culturalError: false, culturalPending: null,
    ocrData: {}, ocrPending: {}, homeMode: "events", district: "",
    weekFirst: null, weekLast: null, weekHeader: null, monthFirst: null, monthLast: null, monthHeader: null };

  var WEEKDAYS = ["ಭಾನುವಾರ", "ಸೋಮವಾರ", "ಮಂಗಳವಾರ", "ಬುಧವಾರ", "ಗುರುವಾರ", "ಶುಕ್ರವಾರ", "ಶನಿವಾರ"];
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
  var CULTURAL_URL = "epaper/cultural-event-candidates.json";
  var PV_LOADING = '<p class="empty-note">ಘಟನೆ ದತ್ತಾಂಶ ಲೋಡ್ ಆಗುತ್ತಿದೆ…</p>';
  var PV_ERROR = '<p class="empty-note">ಘಟನೆ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ.</p>';
  var CULTURAL_LOADING = '<p class="empty-note">ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…</p>';
  var CULTURAL_ERROR = '<p class="empty-note">ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮಗಳ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ.</p>';
  var OCR_LOADING = '<p class="empty-note">ಪಂಚಾಂಗದ ವಿವರಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…</p>';

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
        return json;
      })
      .catch(function () { state.pvError = true; return null; })
      .then(function (json) { delete state.pvPending; return json; });
    return state.pvPending;
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

  function unavailableOCR(key) {
    return { key: key, unavailable: true, calendar: {}, panchanga: null, timings: [], jathaka: [] };
  }

  function cleanWord(value) { return String(value || "").replace(/[^\u0C80-\u0CFF\u200C\u200D\s]/g, "").trim(); }
  function numberValue(value) { var n = parseFloat(value); return isNaN(n) ? 0 : n; }

  function buildOCRTimings(raw) {
    if (!raw || typeof raw !== "object") return [];
    var defs = [
      { key: "rahuKala", name: "ರಾಹು ಕಾಲ", tone: "bad" },
      { key: "gulikaKala", name: "ಗುಳಿಕ ಕಾಲ", tone: "bad" },
      { key: "yamaganda", name: "ಯಮಗಂಡ", tone: "bad" },
      { key: "arthaPrahara", name: "ಅರ್ಥ ಪ್ರಹರ", tone: "mid" },
      { key: "shubhaSamaya", name: "ಶುಭ ಸಮಯ", tone: "good" }
    ], out = [];
    defs.forEach(function (def) {
      var value = String(raw[def.key] || ""), times = value.match(/(\d{1,2})[.:](\d{2})/g);
      if (!times || times.length < 2) return;
      out.push({ name: def.name, tone: def.tone, from: fixOCRTime(times[0], value), to: fixOCRTime(times[1], value) });
    });
    return out;
  }

  function fixOCRTime(value, raw) {
    var parts = value.split(/[.:]/u), hour = +parts[0];
    if (/ಮ/u.test(raw) && hour > 0 && hour < 9) hour += 12;
    return pad(hour) + ":" + parts[1];
  }

  function normalizeOCR(json, key) {
    var content = (json && json.content) || {}, calendar = content.calendar || {}, pan = content.panchanga || {}, timings = content.timings || {};
    var tithi = pan.tithi || {}, nakshatra = pan.nakshatra || {}, yoga = pan.yoga || {}, karana = pan.karana || {};
    return {
      key: key,
      calendar: {
        months: (calendar.months || []).filter(function (month) { return String(month).trim() && String(month).trim() !== "—"; }),
        samvatsara: String(calendar.samvatsara || "").trim(),
        shakaYear: numberValue(calendar.shakaYear),
        sunrise: String(calendar.sunrise || "").trim(),
        sunset: String(calendar.sunset || "").trim()
      },
      panchanga: {
        tithi: { name: cleanWord(tithi.name), paksha: cleanWord(pan.paksha), ends: numberValue(tithi.endsAt), nextDay: !!tithi.nextDay },
        nakshatra: { name: cleanWord(nakshatra.name), ends: numberValue(nakshatra.endsAt), nextDay: !!nakshatra.nextDay },
        yoga: { name: cleanWord(yoga.name), ends: numberValue(yoga.endsAt), nextDay: !!yoga.nextDay },
        karana: { name: cleanWord(karana.name), ends: numberValue(karana.endsAt), nextDay: !!karana.nextDay },
        ayana: cleanWord(pan.ayana), solarRashi: cleanWord(pan.solarRashi), chandraRashi: cleanWord(pan.chandraEntryRashi || pan.chandraRashi)
      },
      timings: buildOCRTimings(timings),
      jathaka: Array.isArray(content.jathaka) && content.jathaka.length === 12
        ? content.jathaka.map(function (item) { return [item.rashi, cleanWord(item.prediction)]; }) : []
    };
  }

  function fetchOCR(key) {
    if (Object.prototype.hasOwnProperty.call(state.ocrData, key)) return Promise.resolve(state.ocrData[key]);
    if (state.ocrPending[key]) return state.ocrPending[key];
    state.ocrPending[key] = fetch("ocr-zones/" + key + "/structured-ocr.json")
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (json) { return normalizeOCR(json, key); })
      .catch(function () { return unavailableOCR(key); })
      .then(function (record) {
        state.ocrData[key] = record;
        delete state.ocrPending[key];
        return record;
      });
    return state.ocrPending[key];
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
    mode = mode || "all";
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
      return '<option value="' + esc(name) + '"' + (name === state.district ? " selected" : "") + '>' + esc(name) + ' (' + option.count + ')</option>';
    }).join("");
  }

  function districtListboxHTML(mode) {
    var options = state.pv ? Object.keys(state.pv.sheets).map(function (name, order) {
      return { name: name, count: districtEventCount(name, mode), order: order };
    }).sort(function (a, b) {
      return b.count - a.count || a.order - b.order;
    }) : [];
    var placeholder = '<button type="button" class="district-option" role="option" data-district-value="" aria-selected="' + (!state.district) + '"><span class="district-option-name">ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ</span></button>';
    return placeholder + options.map(function (option) {
      return '<button type="button" class="district-option" role="option" data-district-value="' + esc(option.name) + '" aria-selected="' + (option.name === state.district) + '"><span class="district-option-name">' + esc(option.name) + '</span><span class="district-option-count" aria-label="' + option.count + ' ಕಾರ್ಯಕ್ರಮಗಳು">' + option.count + '</span></button>';
    }).join("");
  }

  function districtPickerHTML(id, mode) {
    var menuId = id + "Menu", triggerId = id + "Trigger";
    return '<div id="' + id + 'Picker" class="district-picker" data-district-picker="" data-select-id="' + id + '">' +
      '<button type="button" id="' + triggerId + '" class="district-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + menuId + '" aria-label="ಜಿಲ್ಲೆ ಆಯ್ಕೆ">' +
        '<span class="district-trigger-text">' + districtPickerLabel() + '</span><span class="district-trigger-chevron" aria-hidden="true">⌄</span>' +
      '</button>' +
      '<div id="' + menuId + '" class="district-menu" role="listbox" aria-label="ಜಿಲ್ಲೆ ಆಯ್ಕೆ" hidden>' + districtListboxHTML(mode) + '</div>' +
    '</div>';
  }

  function districtControlHTML(id, mode, name) {
    return '<select id="' + id + '" class="district-select district-native" name="' + name + '" hidden aria-hidden="true" tabindex="-1">' + districtOptionsHTML(mode) + '</select>' + districtPickerHTML(id, mode);
  }

  function districtPickerLabel() {
    if (!state.pv || !state.district || !state.pv.sheets[state.district]) return "ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ";
    return state.district;
  }

  function syncDistrictPicker(picker, id, mode) {
    if (!picker || !picker.querySelector) return;
    var trigger = picker.querySelector(".district-trigger"), menu = picker.querySelector(".district-menu");
    if (!trigger || !menu) return;
    trigger.querySelector(".district-trigger-text").textContent = districtPickerLabel();
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
  function homeListHTML(records, emptyText) {
    if (!records.length) return '<p class="empty-note">' + emptyText + '</p>';
    var limit = 3, hidden = records.slice(limit), out = '<div class="ev-panel"><ul class="ev-list">';
    out += records.slice(0, limit).map(function (r) { return pvRow(r, r.startTime || ""); }).join("") + '</ul>';
    if (hidden.length) {
      var id = "homex-" + (++pvSeq);
      out += '<ul class="ev-list" id="' + id + '" hidden>' + hidden.map(function (r) { return pvRow(r, r.startTime || ""); }).join("") + '</ul>' +
        '<div class="ev-more"><button class="chip-more" id="btn-' + id + '" type="button" aria-expanded="false">ಮತ್ತೆ +' + hidden.length + '</button></div>';
    }
    return out + '</div>';
  }

  function homeCategoryHTML(id, title, body, className) {
    return '<section class="home-category ' + (className || '') + '" aria-labelledby="' + id + '"><h3 class="home-category-title" id="' + id + '">' + title + '</h3>' + body + '</section>';
  }

  function homeEventsHTML(key, id) {
    var local = districtEventsFor(key), statewide = stateEventsFor(key), cultural = culturalEventsFor(key);
    var districtBody;
    if (!state.district) {
      districtBody = '<p class="empty-note">ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮಗಳನ್ನು ನೋಡಲು ಜಿಲ್ಲೆ ಆಯ್ಕೆ ಮಾಡಿ.</p>';
    } else if (state.culturalError) {
      districtBody = homeListHTML(local, "ಈ ದಿನ ಯಾವುದೇ ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.") + CULTURAL_ERROR;
    } else if (!state.cultural) {
      districtBody = homeListHTML(local, "ಈ ದಿನ ಯಾವುದೇ ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.") + CULTURAL_LOADING;
    } else {
      districtBody = homeListHTML(local.concat(cultural), "ಈ ದಿನ ಯಾವುದೇ ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.");
    }
    var body = '<div class="home-scope"><h4>ಜಿಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು</h4>' + districtBody + '</div>' +
      '<div class="home-scope statewide"><h4>ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮಗಳು</h4>' + homeListHTML(statewide, "ಈ ದಿನ ಯಾವುದೇ ಕರ್ನಾಟಕದ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.") + '</div>';
    return homeCategoryHTML(id, "ಕಾರ್ಯಕ್ರಮಗಳು", body, "homeEvents");
  }

  function panchangaEnd(value, nextDay) {
    if (!value) return "—";
    var number = +value, hour = Math.floor(number), minute = Math.round((number - hour) * 100);
    if (hour >= 24) { hour -= 24; nextDay = true; }
    return (nextDay ? '<span class="nd">ಮರುದಿನ ' : "") + pad(hour) + ":" + pad(minute) + (nextDay ? "</span>" : "");
  }

  function panchangaCard(label, name, sub, featured, icon) {
    return '<div class="panga-card' + (featured ? " featured" : "") + '"><span class="panga-head">' + icon + '<span class="panga-label">' + label + '</span></span><span class="panga-name">' + esc(name || "—") + '</span><span class="panga-sub">' + sub + '</span></div>';
  }

  function panchangaMetaHTML(pan) {
    var items = [["ಆಯನ", pan.ayana], ["ಸೂರ್ಯ ರಾಶಿ", pan.solarRashi], ["ಚಂದ್ರ ರಾಶಿ", pan.chandraRashi]].filter(function (item) { return item[1]; });
    return items.length ? '<div class="panga-meta">' + items.map(function (item) {
      return '<div class="pm-item"><span class="pm-label">' + item[0] + '</span><span class="pm-value">' + esc(item[1]) + '</span></div>';
    }).join("") + '</div>' : '';
  }

  function panchangaTimingsHTML(record) {
    if (!record.timings.length) return '<p class="empty-note">ಈ ದಿನದ ಕಾಲ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.</p>';
    var calendar = record.calendar;
    /* Keep OCR normalization as-is, but only use complete, real clock ranges
       for layout. In particular, do not turn an overnight-looking range into
       a next-day range here. */
    var ordered = record.timings.map(function (timing) {
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
      return '<li class="tl-row ' + source.tone + '"><span class="tone-dot timeline-node ' + source.tone + '" aria-hidden="true"></span><span class="tl-main timeline-card"><span class="tl-name">' + esc(source.name) + '</span><span class="t-time">' + kn(source.from) + ' – ' + kn(source.to) + '</span></span></li>';
    }).join("");
    var startLabel = clockLabel(start), endLabel = clockLabel(end);
    return '<div class="timeline" aria-label="ಕಾಲಗಳ ಸಮಯರೇಖೆ"><div class="tl-track" role="list" aria-label="ಕಾಲಗಳ ವ್ಯಾಪ್ತಿಗಳು">' + blocks + '</div><div class="tl-ends"><span class="tl-endpoint"><small>ಆರಂಭ</small><b class="t-time">' + kn(startLabel) + '</b></span><span class="tl-endpoint"><small>ಅಂತ್ಯ</small><b class="t-time">' + kn(endLabel) + '</b></span></div></div>' +
      '<ul class="timing-list timeline-mobile timeline-rail" aria-label="ಕಾಲಗಳ ವಿವರಗಳು">' + rows + '</ul><div class="timing-legend" aria-label="ಕಾಲಗಳ ಬಣ್ಣದ ಅರ್ಥ"><span><i class="tone-dot good" aria-hidden="true"></i> ಶುಭ</span><span><i class="tone-dot mid" aria-hidden="true"></i> ಮಧ್ಯಮ</span><span><i class="tone-dot bad" aria-hidden="true"></i> ಅಶುಭ</span></div>';
  }

  function panchangaJathakaHTML(record) {
    if (!record.jathaka.length) return '<p class="empty-note">ಈ ದಿನದ ರಾಶಿ ಭವಿಷ್ಯ ಲಭ್ಯವಿಲ್ಲ.</p>';
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
    if (state.ocrError) return '<p class="error-note">ಪಂಚಾಂಗದ ದತ್ತಾಂಶ ಲಭ್ಯವಿಲ್ಲ.</p>';
    if (!Object.prototype.hasOwnProperty.call(state.ocrData, key)) {
      fetchOCR(key).then(function () { if (state.key === key && state.homeMode === "panchanga") renderToday(); });
      return OCR_LOADING;
    }
    var record = state.ocrData[key];
    if (record.unavailable) return '<p class="empty-note">ಈ ದಿನದ ಪಂಚಾಂಗದ ವಿವರ ಲಭ್ಯವಿಲ್ಲ.</p>';
    var cal = record.calendar, pan = record.panchanga;
    var meta = [];
    if (cal.samvatsara) meta.push(esc(cal.samvatsara) + " ನಾಮ ಸಂವತ್ಸರ");
    if (cal.shakaYear) meta.push("ಶಕ " + kn(cal.shakaYear));
    if (cal.months.length) meta.push(esc(cal.months.join("–")));
    return '<div class="panchanga-view"><section class="date-context" aria-label="ದಿನದ ಕಾಲದ ಸಂದರ್ಭ"><p>' + (meta.join(" · ") || "ದಿನದ ವಿವರ") + '</p></section>' +
      '<div id="panchangaSection" class="panga-grid" tabindex="-1">' +
        panchangaCard("ತಿಥಿ", pan.tithi.name, (pan.tithi.paksha ? esc(pan.tithi.paksha) + " ಪಕ್ಷ · " : "") + "ಮುಗಿಯುವುದು " + panchangaEnd(pan.tithi.ends, pan.tithi.nextDay), true, ICONS.tithi) +
        panchangaCard("ನಕ್ಷತ್ರ", pan.nakshatra.name, "ಮುಗಿಯುವುದು " + panchangaEnd(pan.nakshatra.ends, pan.nakshatra.nextDay), true, ICONS.nakshatra) +
        panchangaCard("ಯೋಗ", pan.yoga.name, "ಮುಗಿಯುವುದು " + panchangaEnd(pan.yoga.ends, pan.yoga.nextDay), false, ICONS.yoga) +
        panchangaCard("ಕರಣ", pan.karana.name, "ಮುಗಿಯುವುದು " + panchangaEnd(pan.karana.ends, pan.karana.nextDay), false, ICONS.karana) +
      '</div>' + panchangaMetaHTML(pan) +
      '<div class="sun-row"><span class="sun-item sunrise-item"><span class="sun-ico" aria-hidden="true">' + ICONS.sunrise + '</span> ಸೂರ್ಯೋದಯ <b>' + kn(cal.sunrise || "—") + '</b></span><span class="sun-item sunset-item"><span class="sun-ico" aria-hidden="true">' + ICONS.sunset + '</span> ಸೂರ್ಯಾಸ್ತ <b>' + kn(cal.sunset || "—") + '</b></span></div>' +
      '<p class="src-note">ಕನ್ನಡ ಪಂಚಾಂಗದ ಆಧಾರದಲ್ಲಿ</p>' +
      card("ಸಮಯಗಳು — ಕಾಲ", panchangaTimingsHTML(record), "homeTimings", false) +
      card("ರಾಶಿ ಭವಿಷ್ಯ", panchangaJathakaHTML(record), "homeJathaka", false) +
      '</div>';
  }

  function homeTodayHTML(key) {
    if (state.pvError) return PV_ERROR;
    if (!state.pv) return PV_LOADING;
    return homeEventsHTML(key, "homeEvents");
  }

  function dateLabel(iso) {
    var d = parseKey(isoToKey(iso));
    return WEEKDAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + kn(d.getDate());
  }

  function upcomingHTML(fromKey) {
    if (state.pvError) return PV_ERROR;
    if (!state.pv) return PV_LOADING;
    var from = keyToIso(fromKey), days = [];
    for (var i = 1; i <= 7; i++) {
      var iso = addDaysIso(from, i), key = isoToKey(iso), local = districtEventsFor(key), statewide = stateEventsFor(key), cultural = culturalEventsFor(key);
      if (!local.length && !statewide.length && !cultural.length) continue;
      var content = '<section class="upcoming-day"><h3 class="upcoming-date">' + dateLabel(iso) + '</h3>';
      if (local.length || statewide.length || cultural.length) content += homeEventsHTML(key, "upcomingEvents" + i);
      days.push(content + '</section>');
    }
    return days.length ? '<div class="upcoming-list">' + days.join("") + '</div>' : '<p class="empty-note">ಮುಂದಿನ 7 ದಿನಗಳಲ್ಲಿ ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮಗಳಿಲ್ಲ.</p>';
  }

  function homeHeaderHTML(key) {
    var d = parseKey(key);
    return '<section class="home-header" aria-labelledby="homeDateTitle">' +
      '<div class="home-date"><span class="home-kicker">ಆಯ್ದ ದಿನ</span><div class="home-date-line"><strong id="homeDateTitle">' + kn(d.getDate()) + '</strong><span><b>' + MONTHS[d.getMonth()] + ' ' + kn(d.getFullYear()) + '</b><small>' + WEEKDAYS[d.getDay()] + '</small></span></div></div>' +
      '<div class="home-controls"><div class="home-switch" role="tablist" aria-label="ಮುಖಪುಟದ ವಿಷಯ"><button id="homeEventsMode" type="button" role="tab" aria-selected="' + (state.homeMode === "events") + '" class="' + (state.homeMode === "events" ? "is-active" : "") + '">ಕಾರ್ಯಕ್ರಮಗಳು</button><button id="homePanchangaMode" type="button" role="tab" aria-selected="' + (state.homeMode === "panchanga") + '" class="' + (state.homeMode === "panchanga" ? "is-active" : "") + '">ಪಂಚಾಂಗ</button></div><label class="home-district"><span id="homeDistrictLabel">ಜಿಲ್ಲೆ</span>' + districtControlHTML("homeDistrictSelect", "day", "homeDistrict") + '</label></div>' +
      '</section>';
  }

  function bindHomeModeUI() {
    [["homeEventsMode", "events"], ["homePanchangaMode", "panchanga"]].forEach(function (item) {
      var button = document.getElementById(item[0]);
      if (!button || button._homeModeBound) return;
      button._homeModeBound = true;
      button.addEventListener("click", function () {
        if (state.homeMode === item[1]) return;
        state.homeMode = item[1];
        renderToday();
      });
    });
  }

  function renderToday() {
    var title = state.key === DEFAULT_KEY ? "ಇಂದಿನ ಕಾರ್ಯಕ್ರಮಗಳು" : "ಈ ದಿನದ ಕಾರ್ಯಕ್ರಮಗಳು";
    var body = state.homeMode === "panchanga" ? panchangaHTML(state.key) : homeTodayHTML(state.key);
    document.getElementById("todayContent").innerHTML = homeHeaderHTML(state.key) +
      card(state.homeMode === "panchanga" ? "ಇಂದಿನ ಪಂಚಾಂಗ" : title, body, "homeToday", false, ICONS.diya) +
      (state.homeMode === "panchanga" ? "" : card("ಮುಂದಿನ 7 ದಿನಗಳ ಕಾರ್ಯಕ್ರಮಗಳು", upcomingHTML(state.key), "homeUpcoming", false));
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

  function weekAgendaHTML(key) {
    var d = parseKey(key), district = districtEventsFor(key).concat(culturalEventsFor(key)), statewide = stateEventsFor(key);
    var content = '<h3 class="week-day-title"><button type="button" class="week-day-link" data-day="' + key + '">' +
      '<span class="week-day-name">' + WEEKDAYS[d.getDay()] + '</span><span class="week-day-meta"><span class="week-day-date">' + kn(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + kn(d.getFullYear()) + '</span></span></button></h3>';
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
    renderDistrictPicker("weekDistrictSelect", "week");
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
      var local = districtEventsFor(k).length + culturalEventsFor(k).length, statewide = stateEventsFor(k).length;
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
    }).concat(state.culturalRecords.filter(function (r) {
      return r.sourceDistrict === state.district && r.dateEnd >= monthStart && r.dateStart <= monthEnd;
    })).sort(function (a, b) { return a.dateStart < b.dateStart ? -1 : a.dateStart > b.dateStart ? 1 : 0; });
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
        if (selectedMonth) scrollToStreamBlock(selectedMonth, "#viewMonth");
      }
      updateMonthHeader();
    }
    renderDistrictPicker("monthDistrictSelect", "month");
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
    document.title = MONTHS[dt.getMonth()] + " " + kn(dt.getDate()) + " — ಕನ್ನಡ ಸಾಂಸ್ಕೃತಿಕ ಕ್ಯಾಲೆಂಡರ್";
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
    var options = function () { return Array.prototype.slice.call(menu.querySelectorAll(".district-option")); };
    var setOpen = function (open, focusIndex) {
      trigger.setAttribute("aria-expanded", String(open));
      menu.hidden = !open;
      picker.classList.toggle("is-open", open);
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
      var option = e.target && e.target.closest ? e.target.closest(".district-option") : null;
      if (option) choose(option);
    });
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
    if (window.addEventListener) window.addEventListener("scroll", function () {
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
    fetchCultural().then(function () { renderAll(); });
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
