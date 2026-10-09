/* Add-to-calendar helpers: a Google Calendar link and an .ics (iCalendar) file.
   Pure functions, no network. Events are all-day; `end` is inclusive.
   Dates are ISO strings (YYYY-MM-DD). */
(function (root) {
  "use strict";

  var SOURCE_NOTE = "ಪ್ರಜಾವಾಣಿ ಕನ್ನಡ ಸಾಂಸ್ಕೃತಿಕ ಕ್ಯಾಲೆಂಡರ್";

  function compact(iso) { return iso.replace(/-/g, ""); }
  function nextDay(iso) {
    var p = iso.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 1));
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
  }
  function span(ev) { return { start: ev.start, end: ev.end && ev.end >= ev.start ? ev.end : ev.start }; }

  function googleUrl(ev) {
    var s = span(ev);
    var q = ["action=TEMPLATE",
      "text=" + encodeURIComponent(ev.title),
      "dates=" + compact(s.start) + "/" + compact(nextDay(s.end)),
      "details=" + encodeURIComponent(SOURCE_NOTE)];
    if (ev.place) q.push("location=" + encodeURIComponent(ev.place));
    return "https://calendar.google.com/calendar/render?" + q.join("&");
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  /* RFC 5545 folding: lines of at most 75 octets, never splitting a UTF-8 character. */
  function fold(line) {
    var out = [], cur = "", bytes = 0, limit = 75;
    Array.from(line).forEach(function (ch) {
      var n = unescape(encodeURIComponent(ch)).length;
      if (bytes + n > limit) { out.push(cur); cur = " "; bytes = 1; limit = 75; }
      cur += ch; bytes += n;
    });
    out.push(cur);
    return out.join("\r\n");
  }

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function stamp(now) {
    var d = now || new Date();
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  }

  function ics(ev, now) {
    var s = span(ev);
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Prajavani Kannada Calendar//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + hash(s.start + "|" + ev.title) + "-" + compact(s.start) + "@pv-calendar",
      "DTSTAMP:" + stamp(now),
      "DTSTART;VALUE=DATE:" + compact(s.start),
      "DTEND;VALUE=DATE:" + compact(nextDay(s.end)),
      "SUMMARY:" + icsEscape(ev.title)];
    if (ev.place) lines.push("LOCATION:" + icsEscape(ev.place));
    lines.push("DESCRIPTION:" + icsEscape(SOURCE_NOTE), "TRANSP:TRANSPARENT", "END:VEVENT", "END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  var api = { googleUrl: googleUrl, ics: ics, icsFilename: function (ev) { return "event-" + span(ev).start + ".ics"; } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CalendarExport = api;
})(typeof window !== "undefined" ? window : this);
