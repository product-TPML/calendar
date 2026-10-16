/**
 * PV Calendar Event Submission — paste-and-import
 *
 * Lets a bureau paste a day's printed event list (Kannada), have Gemini split
 * it into the form's fields, review the rows, and add them to a district tab.
 * Goes in the SAME Apps Script project as PV_District_Response_Router.gs; it
 * reuses that file's helpers.
 *
 * Why a queue: district tabs are owner-only, so a bureau user's script cannot
 * write to them. The dialog (run by the bureau user) appends reviewed rows to
 * the open "Import Queue" tab. A time trigger installed by the OWNER then moves
 * them onto the district tab through the router's own append and permission code.
 *
 * INSTALLATION (owner)
 * 1. Add this file to the Apps Script project, next to the router.
 * 2. Project Settings > Script Properties > add GEMINI_API_KEY.
 * 3. In the router's onOpen, the "Paste events from text" items are already
 *    listed; reload the spreadsheet.
 * 4. Run "Install import-queue trigger" from the District Routing menu.
 *
 * Imported rows get a _Source Row number from 1,000,000 up, so they cannot
 * collide with real Form Responses 1 rows. They behave like form rows: the
 * bureau can edit them and mark them Cancelled, and edits are audited.
 */

const IMPORT_CONFIG = Object.freeze({
  // Model name as listed in Google AI Studio. Change here if it is retired.
  model: 'gemini-3.8-flash',
  queueSheet: 'Import Queue',
  queueHeaders: Object.freeze([
    'District', 'Date', 'Time', 'Name', 'Description', 'Venue', 'Local place',
    'Submitted By', 'Queued At', 'Status',
  ]),
  firstSourceRow: 1000000,
  processHandler: 'processImportQueue',
  maxAttempts: 3,
});

/** Opens the paste dialog. */
function showPasteImportDialog() {
  const active = SpreadsheetApp.getActiveSheet().getName();
  const template = HtmlService.createTemplate(PASTE_DIALOG_HTML_);
  template.districts = EXPECTED_DISTRICTS;
  template.selected = EXPECTED_DISTRICTS.indexOf(active) !== -1 ? active : '';
  SpreadsheetApp.getUi().showModalDialog(
    template.evaluate().setWidth(980).setHeight(680),
    'Paste events from text'
  );
}

/**
 * Called by the dialog once per batch of pasted lines. Returns the events
 * Gemini found; the date comes from the caller, never from the model.
 */
function parseImportBatch(lines, dateIso) {
  if (!Array.isArray(lines) || !lines.length) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) throw new Error('Bad date: ' + dateIso);
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is not set in Script Properties.');

  const body = {
    contents: [{ parts: [{ text: importPrompt_(lines.join('\n')) }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 32000,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            description: { type: 'STRING' },
            venue: { type: 'STRING' },
            local_place: { type: 'STRING' },
            time: { type: 'STRING' },
          },
          required: ['name', 'description', 'venue', 'local_place', 'time'],
        },
      },
    },
  };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    IMPORT_CONFIG.model + ':generateContent';

  let lastError = '';
  for (let attempt = 1; attempt <= IMPORT_CONFIG.maxAttempts; attempt++) {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    if (code === 200) {
      const parsed = JSON.parse(response.getContentText());
      const text = parsed.candidates && parsed.candidates[0] &&
        parsed.candidates[0].content && parsed.candidates[0].content.parts &&
        parsed.candidates[0].content.parts.map((p) => p.text || '').join('');
      if (!text) throw new Error('Gemini returned no text (it may have blocked the request).');
      const events = JSON.parse(text);
      return events.map((e) => ({
        name: String(e.name || '').trim(),
        description: String(e.description || '').trim(),
        venue: String(e.venue || '').trim(),
        localPlace: String(e.local_place || '').trim(),
        time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(e.time || '').trim()) ? e.time.trim() : '',
      }));
    }
    lastError = 'HTTP ' + code + ': ' + response.getContentText().slice(0, 300);
    if (code !== 429 && code < 500) break;
    Utilities.sleep(4000 * attempt);
  }
  throw new Error('Gemini request failed. ' + lastError);
}

function importPrompt_(text) {
  return [
    'You turn lines from a Kannada newspaper "events today" column into rows for an event calendar sheet.',
    'Each event is normally one line shaped like: TITLE: details, ಆಯೋಜನೆ: ORGANISER, ಸ್ಥಳ: VENUE, TIME.',
    '',
    'Return a JSON array with one object per event, in the order given. Rules:',
    '- Copy Kannada and English text exactly as written. Never translate, summarise or correct spelling.',
    '- EVERY line that contains a colon is an event and must produce exactly one object, even if it is long or has no time or venue. Never merge, skip or deduplicate lines; the number of objects must equal the number of lines with a colon.',
    '- Ignore lines that are not events: section headings (for example ನವರಾತ್ರಿ ವಿಶೇಷ, ಇತರ ಕಾರ್ಯಕ್ರಮ), separators, and instructions to send listings by e-mail.',
    '- name: the title before the first colon. If the line has no colon, use the whole line.',
    '- description: everything between the title and the venue/time that describes the event (performers, guests, chairperson, topic), plus the organiser as "ಆಯೋಜನೆ: ..." at the end. Leave out the venue and the time. Empty string if there is nothing.',
    '- venue: the place text after "ಸ್ಥಳ:". When the label is "ಆಯೋಜನೆ ಹಾಗೂ ಸ್ಥಳ:" (organiser and venue together), the text after it is the venue, and do NOT repeat it in description. "ಆಯೋಜನೆ ಹಾಗೂ ತಂಡ" is a typo for the same label. Keep the venue name and address together.',
    '- local_place: only the locality or neighbourhood that is the last part of the venue (for example ವಿಜಯನಗರ, ಮಲ್ಲೇಶ್ವರ, ಜಯನಗರ 4ನೇ ಟಿ ಬ್ಲಾಕ್). Empty string if unsure.',
    '- time: the start time in 24-hour HH:MM, or an empty string when none is given. ಬೆಳಿಗ್ಗೆ = morning, ಮಧ್ಯಾಹ್ನ = afternoon, ಸಂಜೆ = evening, ರಾತ್ರಿ = night. "ಸಂಜೆ 6.30" = 18:30, "ಬೆಳಿಗ್ಗೆ 10.30" = 10:30, "ಮಧ್ಯಾಹ್ನ 3" = 15:00, "ಮಧ್ಯಾಹ್ನ 1" = 13:00, "ಸಂಜೆ 5.15" = 17:15. For a range such as "ಬೆಳಿಗ್ಗೆ 11ರಿಂದ ಸಂಜೆ 6" use the start (11:00) and append "ಸಂಜೆ 6ರವರೆಗೆ" to the description.',
    '- Times in the middle of a line (for example "ಬೆಳಿಗ್ಗೆ 6ಕ್ಕೆ ಪಂಚಾಮೃತ ಅಭಿಷೇಕ") belong to the description. The event time is the one at the end of the line.',
    '- Never invent anything that is not in the text.',
    '',
    'TEXT:',
    text,
  ].join('\n');
}

/** Called by the dialog with the rows the user reviewed. Appends them to the queue. */
function queueImportRows(district, rows) {
  if (EXPECTED_DISTRICTS.indexOf(district) === -1) throw new Error('Choose a district.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('No rows to add.');
  rows.forEach((row, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error('Row ' + (i + 1) + ': date is missing.');
    if (!String(row.name || '').trim()) throw new Error('Row ' + (i + 1) + ': name is missing.');
    if (row.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)) {
      throw new Error('Row ' + (i + 1) + ': time must look like 18:30.');
    }
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(60000)) throw new Error('The sheet is busy. Try again in a minute.');
  try {
    const sheet = ensureQueueSheet_(ss);
    const email = Session.getActiveUser().getEmail() || 'Unavailable';
    const now = new Date();
    const values = rows.map((r) => [
      district, r.date, r.time || '', r.name.trim(), String(r.description || '').trim(),
      String(r.venue || '').trim(), String(r.localPlace || '').trim(), email, now, '',
    ]);
    const start = sheet.getLastRow() + 1;
    sheet.getRange(start, 1, values.length, values[0].length).setValues(values);
    SpreadsheetApp.flush();
    return values.length;
  } finally {
    lock.releaseLock();
  }
}

function ensureQueueSheet_(ss) {
  let sheet = ss.getSheetByName(IMPORT_CONFIG.queueSheet);
  if (sheet) return sheet;
  sheet = ss.insertSheet(IMPORT_CONFIG.queueSheet);
  const headers = IMPORT_CONFIG.queueHeaders;
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.getRange(2, 2, sheet.getMaxRows() - 1, 2).setNumberFormat('@'); // keep date/time as typed
  sheet.getRange(2, 9, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Moves queued rows onto district tabs. Runs from the owner's time trigger,
 * because only the owner can write to the protected district tabs.
 */
function processImportQueue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const queue = ss.getSheetByName(IMPORT_CONFIG.queueSheet);
  if (!queue || queue.getLastRow() < 2) return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(120000)) return; // try again on the next run
  try {
    const rows = queue.getRange(2, 1, queue.getLastRow() - 1, IMPORT_CONFIG.queueHeaders.length)
      .getValues();
    const pending = rows
      .map((row, i) => ({ row, line: i + 2 }))
      .filter((item) => String(item.row[9]).trim() === '');
    if (!pending.length) return;

    const context = getValidatedContext_(ss);
    const fieldCount = context.masterHeaders.length;
    const find = (re) => context.masterHeaders.findIndex((h) => re.test(h));
    const col = {
      timestamp: find(/^timestamp\b/i), email: find(/^email\b/i), district: find(/^district\b/i),
      date: find(/^date\b/i), time: find(/^time\b/i), name: find(/^name\b/i),
      description: find(/^description\b/i), venue: find(/^event venue\b/i),
      localPlace: find(/^local place\b/i),
    };
    const missing = Object.keys(col).filter((k) => col[k] === -1 && k !== 'timestamp' && k !== 'email');
    if (missing.length) {
      throw new Error('Form Responses 1 headers not found for: ' + missing.join(', '));
    }

    const byDistrict = new Map();
    pending.forEach((item) => {
      const district = String(item.row[0]).trim();
      if (!byDistrict.has(district)) byDistrict.set(district, []);
      byDistrict.get(district).push(item);
    });

    byDistrict.forEach((items, district) => {
      const target = ss.getSheetByName(district);
      if (!context.accessMap.has(district) || !target) {
        items.forEach((item) => queue.getRange(item.line, 10).setValue('Error: unknown district'));
        return;
      }
      const sources = Array.from(getExistingSourceRows_(target, fieldCount + 1))
        .map(Number).filter((n) => n >= IMPORT_CONFIG.firstSourceRow);
      let nextSource = Math.max(IMPORT_CONFIG.firstSourceRow - 1, ...sources) + 1;

      const output = [];
      const done = [];
      items.forEach((item) => {
        const [, date, time, name, description, venue, localPlace, email] = item.row;
        const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date).trim());
        if (!d || !String(name).trim()) {
          queue.getRange(item.line, 10).setValue('Error: missing date or name');
          return;
        }
        const values = new Array(fieldCount).fill('');
        if (col.timestamp !== -1) values[col.timestamp] = new Date();
        if (col.email !== -1) values[col.email] = email;
        values[col.district] = district;
        values[col.date] = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]));
        const t = /^(\d{2}):(\d{2})$/.exec(String(time).trim());
        values[col.time] = t ? (Number(t[1]) * 60 + Number(t[2])) / 1440 : '';
        values[col.name] = String(name).trim();
        values[col.description] = String(description).trim();
        values[col.venue] = String(venue).trim();
        values[col.localPlace] = String(localPlace).trim();
        output.push({
          values,
          numberFormats: new Array(fieldCount).fill('General'),
          sourceRow: nextSource++,
        });
        done.push(item.line);
      });
      if (!output.length) return;

      const startRow = Math.max(target.getLastRow() + 1, 2);
      appendDestinationRows_(target, output, fieldCount);
      applyDistrictDateTimeFormats_(context, target, startRow, output.length);
      syncOneDistrictPermissions_(context, district, false);

      const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      done.forEach((line) => queue.getRange(line, 10).setValue('Added ' + stamp));
      appendLog_(ss, {
        action: 'PASTE_IMPORT',
        sourceRow: '',
        district,
        targetSheet: district,
        status: 'SUCCESS',
        details: output.length + ' row(s) imported from the Import Queue.',
      });
    });
  } finally {
    lock.releaseLock();
  }
}

/** Installs the one-minute trigger. Run once, as the spreadsheet owner. */
function installImportQueueTrigger() {
  const exists = ScriptApp.getProjectTriggers()
    .some((t) => t.getHandlerFunction() === IMPORT_CONFIG.processHandler);
  if (!exists) {
    ScriptApp.newTrigger(IMPORT_CONFIG.processHandler).timeBased().everyMinutes(1).create();
  }
  ensureQueueSheet_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert(exists
    ? 'The import-queue trigger was already installed.'
    : 'Installed. Queued rows are added to district tabs within a minute.');
}

const PASTE_DIALOG_HTML_ = `<!DOCTYPE html>
<html><head><base target="_top"><meta charset="utf-8">
<style>
  body{font:14px/1.4 Arial,sans-serif;margin:12px;color:#222}
  label{font-weight:bold}
  select,textarea,input{font:inherit}
  textarea#src{width:100%;height:230px;box-sizing:border-box}
  button{font:inherit;padding:6px 14px;margin:8px 8px 0 0;cursor:pointer}
  #msg{margin:8px 0;min-height:20px}
  .err{color:#b00020}.ok{color:#0a6b2d}
  table{border-collapse:collapse;width:100%;margin-top:8px}
  th,td{border:1px solid #ccc;padding:3px;vertical-align:top}
  th{position:sticky;top:0;z-index:1;background:#f1f3f4;box-shadow:0 1px 0 #ccc}
  td input[type=text],td textarea{width:100%;box-sizing:border-box}
  td textarea{height:64px}
  tr.bad td{background:#fff3f3}
  #review{max-height:340px;overflow:auto;display:none}
</style></head><body>
<label>District</label>
<select id="district"><option value="">Choose…</option>
<? for (const d of districts) { ?><option<?= d === selected ? ' selected' : '' ?>><?= d ?></option><? } ?>
</select>
<p style="margin:8px 0 4px"><label>Pasted text</label> (include the date lines such as 16–10–2026)</p>
<textarea id="src"></textarea>
<button id="parse" onclick="parseText()">Read with Gemini</button>
<span id="msg"></span>
<div id="review"><table><thead><tr>
<th>Add</th><th>Date</th><th>Time</th><th>Name</th><th>Description</th><th>Venue</th><th>Local place</th>
</tr></thead><tbody id="rows"></tbody></table></div>
<button id="add" onclick="addRows()" style="display:none">Add checked rows</button>
<button onclick="google.script.host.close()">Close</button>
<script>
const msg = document.getElementById('msg');
function say(t, cls){ msg.textContent = t; msg.className = cls || ''; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function splitText(text){
  const dateRe = /^\\s*(\\d{1,2})\\s*[–—\\-\\/.]\\s*(\\d{1,2})\\s*[–—\\-\\/.]\\s*(\\d{4})\\s*$/;
  const stopRe = /^\\s*(\\*|_{3,}|-{3,})|ಇ\\s*[–-]\\s*ಮೇಲ್/;
  const blocks = []; let cur = null, skipping = false;
  text.split(/\\r?\\n/).forEach(function(line){
    const m = dateRe.exec(line);
    if (m) {
      const dd = +m[1], mm = +m[2], yy = +m[3];
      cur = { date: yy + '-' + String(mm).padStart(2,'0') + '-' + String(dd).padStart(2,'0'), lines: [] };
      blocks.push(cur); skipping = false; return;
    }
    if (!cur || skipping) return;
    if (stopRe.test(line)) { skipping = true; return; }
    if (line.trim()) cur.lines.push(line.trim());
  });
  return blocks;
}

async function parseText(){
  const text = document.getElementById('src').value;
  const blocks = splitText(text).filter(function(b){ return b.lines.length; });
  if (!blocks.length) { say('No date line found. Each day must start with a line like 16–10–2026.', 'err'); return; }
  document.getElementById('parse').disabled = true;
  document.getElementById('rows').innerHTML = '';
  document.getElementById('review').style.display = 'none';
  document.getElementById('add').style.display = 'none';
  const jobs = [];
  blocks.forEach(function(b){
    for (let i = 0; i < b.lines.length; i += 10) jobs.push({ date: b.date, lines: b.lines.slice(i, i + 10) });
  });
  let all = [], failed = 0, errors = [], warns = [];
  for (let i = 0; i < jobs.length; i++) {
    say('Reading part ' + (i + 1) + ' of ' + jobs.length + '…');
    try {
      const events = await new Promise(function(ok, no){
        google.script.run.withSuccessHandler(ok).withFailureHandler(no).parseImportBatch(jobs[i].lines, jobs[i].date);
      });
      events.forEach(function(e){ e.date = jobs[i].date; all.push(e); });
      const expected = jobs[i].lines.filter(function(l){ return l.indexOf(':') !== -1; }).length;
      if (events.length < expected) warns.push('Part ' + (i + 1) + ' (' + jobs[i].date + '): expected ' + expected + ' events, got ' + events.length + ' – paste its lines again.');
    } catch (err) {
      failed++; errors.push('Part ' + (i + 1) + ': ' + (err && err.message || err)); say(errors[errors.length - 1], 'err');
    }
  }
  document.getElementById('parse').disabled = false;
  render(all);
  if (warns.length) { say(all.length + ' events found, but ' + warns.join(' '), 'err'); }
  else if (all.length) say(all.length + ' events found' + (failed ? ', ' + failed + ' part(s) failed (' + errors[0] + ') – paste those lines again.' : '. Check each row, then add.'), failed ? 'err' : 'ok');
  else say('No events found.' + (errors.length ? ' ' + errors[0] : ''), 'err');
}

function render(events){
  const tb = document.getElementById('rows');
  tb.innerHTML = events.map(function(e){
    return '<tr><td><input type="checkbox" class="on" checked></td>' +
      '<td><input type="date" class="date" value="' + esc(e.date) + '"></td>' +
      '<td><input type="time" class="time" value="' + esc(e.time) + '"></td>' +
      '<td><input type="text" class="name" value="' + esc(e.name) + '"></td>' +
      '<td><textarea class="description">' + esc(e.description) + '</textarea></td>' +
      '<td><textarea class="venue">' + esc(e.venue) + '</textarea></td>' +
      '<td><input type="text" class="localPlace" value="' + esc(e.localPlace) + '"></td></tr>';
  }).join('');
  document.getElementById('review').style.display = events.length ? 'block' : 'none';
  document.getElementById('add').style.display = events.length ? 'inline-block' : 'none';
}

function addRows(){
  const district = document.getElementById('district').value;
  if (!district) { say('Choose the district first.', 'err'); return; }
  const rows = [];
  document.querySelectorAll('#rows tr').forEach(function(tr){
    if (!tr.querySelector('.on').checked) return;
    const g = function(c){ return tr.querySelector('.' + c).value; };
    rows.push({ date: g('date'), time: g('time'), name: g('name'), description: g('description'), venue: g('venue'), localPlace: g('localPlace') });
  });
  if (!rows.length) { say('No rows are checked.', 'err'); return; }
  document.getElementById('add').disabled = true;
  say('Adding…');
  google.script.run.withSuccessHandler(function(n){
    say(n + ' rows queued. They appear on the ' + district + ' tab within a minute.', 'ok');
    document.getElementById('review').style.display = 'none';
    document.getElementById('rows').innerHTML = '';
    document.getElementById('add').style.display = 'none';
    document.getElementById('add').disabled = false;
  }).withFailureHandler(function(err){
    document.getElementById('add').disabled = false;
    say(err && err.message || String(err), 'err');
  }).queueImportRows(district, rows);
}
</script></body></html>`;
