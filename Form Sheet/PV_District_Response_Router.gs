/**
 * PV Calendar Event Submission — district response router
 *
 * Expected sheets:
 *   1. Form Responses 1
 *   2. Edit Access
 *
 * Expected Edit Access headers:
 *   District | Office Email Address | Bureau Chief
 *
 * SPECIAL ACCESS VALUE
 * - Use ALL in the District column to give the email(s) on that row edit
 *   access to every district tab. ALL does not grant access to protected
 *   administrative tabs.
 *
 * INSTALLATION
 * 1. In the response spreadsheet, open Extensions > Apps Script.
 * 2. Replace the default code with this entire file and save.
 * 3. Select setupDistrictRouting from the function list and click Run.
 * 4. Approve the requested Sheets, Drive and trigger permissions.
 * 5. Reload the spreadsheet. A "District Routing" menu will appear.
 *
 * WHAT SETUP DOES
 * - Validates all 31 district names.
 * - Creates missing district tabs without deleting existing content.
 * - Copies existing responses to the correct district tabs.
 * - Adds mapped reporters and bureau chiefs as spreadsheet editors.
 * - Restricts each district tab to its mapped editors.
 * - Protects Form Responses 1, Edit Access, Routing Log and Unmapped.
 * - Installs form-submit and district-edit triggers.
 *
 * IMPORTANT
 * - District-tab edits do not update Form Responses 1.
 * - The hidden _Source Row column prevents duplicate backfills.
 * - Running setupDistrictRouting again is safe; it does not clear tabs.
 * - Only form-linked rows on district tabs are editable. Editors may change
 *   any copied form field and the Cancellation Status dropdown; `_Source Row`
 *   and the audit columns remain locked. Sheet owners can override protection.
 * - Edit Count counts edit actions per row, not individual changed cells.
 *   Google may withhold the editor's email; the audit then says Unavailable.
 */

const ROUTER_CONFIG = Object.freeze({
  masterSheet: 'Form Responses 1',
  accessSheet: 'Edit Access',
  logSheet: 'Routing Log',
  unmappedSheet: 'Unmapped',
  districtHeader: 'District',
  officeEmailHeader: 'Office Email Address',
  bureauChiefHeader: 'Bureau Chief',
  sourceRowHeader: '_Source Row',
  allDistrictsValue: 'ALL',
  protectionPrefix: 'PV District Router:',
  submitHandler: 'routeFormSubmission',
  editHandler: 'recordDistrictEdit',
  statusHeader: 'Cancellation Status',
  countHeader: 'Edit Count',
  editorHeader: 'Last Edited By',
  editedAtHeader: 'Last Edited At',
  historyHeader: 'Edit History',
  statusValues: Object.freeze(['Active', 'Cancelled']),
  editableProtectionPrefix: 'PV District Router: Editable:',
  formulaWaitMs: 1000,
});

const EXPECTED_DISTRICTS = Object.freeze([
  'Bagalkot',
  'Ballari',
  'Belagavi',
  'Bengaluru Rural',
  'Bengaluru South (formerly Ramanagara)',
  'Bengaluru Urban',
  'Bidar',
  'Chamarajanagar',
  'Chikkaballapur',
  'Chikkamagaluru',
  'Chitradurga',
  'Dakshina Kannada',
  'Davanagere',
  'Dharwad',
  'Gadag',
  'Hassan',
  'Haveri',
  'Kalaburagi',
  'Kodagu',
  'Kolar',
  'Koppal',
  'Mandya',
  'Mysuru',
  'Raichur',
  'Shivamogga',
  'Tumakuru',
  'Udupi',
  'Uttara Kannada',
  'Vijayapura',
  'Vijayanagara',
  'Yadgir',
]);

/** Adds the spreadsheet menu after the file is opened. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('District Routing')
    .addItem('Run complete setup', 'setupDistrictRouting')
    .addSeparator()
    .addItem('Backfill existing responses', 'backfillExistingResponses')
    .addItem('Sync district permissions', 'syncDistrictPermissions')
    .addItem('Grant spreadsheet editor access', 'grantSpreadsheetEditorAccess')
    .addItem('Install form-submit trigger', 'installFormSubmitTrigger')
    .addItem('Install edit-tracking trigger', 'installDistrictEditTrigger')
    .addSeparator()
    .addItem('Validate configuration', 'validateDistrictRouting')
    .addToUi();
}

/**
 * Runs the complete first-time setup. Safe to rerun.
 * This function adds file-level editors, so it must be run by the owner or an
 * account allowed to change the spreadsheet's sharing and protections.
 */
function setupDistrictRouting() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const context = getValidatedContext_(ss);

    ensureAdministrativeSheets_(context);
    ensureDistrictSheets_(context);

    const backfill = backfillExistingResponses_(context);
    const sharing = grantSpreadsheetEditorAccess_(context);
    syncDistrictPermissions_(context);
    installFormSubmitTrigger_(ss);
    installDistrictEditTrigger_(ss);

    appendLog_(ss, {
      action: 'SETUP',
      sourceRow: '',
      district: '',
      targetSheet: '',
      status: 'SUCCESS',
      details:
        `Created/verified ${context.accessMap.size} district tabs; ` +
        `backfilled ${backfill.added} responses; ` +
        `skipped ${backfill.skipped} existing responses; ` +
        `${context.globalEditors.size} all-district editors; ` +
        `added ${sharing.added} file editors; ` +
        `${sharing.failed} sharing failures.`,
    });

    ss.toast(
      `Setup complete: ${backfill.added} responses added, ${sharing.added} editors added.`,
      'District Routing',
      10
    );
  } finally {
    lock.releaseLock();
  }
}

/** Validates the two source sheets, required columns, district list and emails. */
function validateDistrictRouting() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const context = getValidatedContext_(ss);
  ss.toast(
    `Valid: ${context.accessMap.size} districts, ${context.globalEditors.size} ALL editors and ${context.allEditorEmails.size} unique editors.`,
    'District Routing',
    8
  );
}

/** Creates missing district tabs and preserves existing content. */
function ensureDistrictSheets_(context) {
  const { ss, master, accessMap, masterHeaders } = context;
  accessMap.forEach((_emails, district) => {
    let sheet = ss.getSheetByName(district);
    if (!sheet) {
      sheet = ss.insertSheet(district);
    }
    prepareDestinationSheet_(master, sheet, masterHeaders.length);
    prepareDistrictWorkflowSheet_(sheet, masterHeaders.length);
  });
}

/** Creates or prepares the log and fallback tabs. */
function ensureAdministrativeSheets_(context) {
  const { ss, master, masterHeaders } = context;

  let unmapped = ss.getSheetByName(ROUTER_CONFIG.unmappedSheet);
  if (!unmapped) unmapped = ss.insertSheet(ROUTER_CONFIG.unmappedSheet);
  prepareDestinationSheet_(master, unmapped, masterHeaders.length);

  let log = ss.getSheetByName(ROUTER_CONFIG.logSheet);
  if (!log) log = ss.insertSheet(ROUTER_CONFIG.logSheet);

  const logHeaders = [
    'Logged At',
    'Action',
    'Source Row',
    'District',
    'Target Sheet',
    'Status',
    'Details',
  ];

  if (log.getLastRow() === 0) {
    log.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
    log.setFrozenRows(1);
  }
}

/**
 * Spreadsheet form-submit trigger handler.
 * Do not run this function manually; install the trigger instead.
 */
function routeFormSubmission(e) {
  if (!e || !e.range) {
    throw new Error(
      'routeFormSubmission must be called by an installed spreadsheet form-submit trigger.'
    );
  }

  const ss = e.source;
  const sourceSheet = e.range.getSheet();
  const sourceRow = e.range.getRow();
  if (sourceSheet.getName() !== ROUTER_CONFIG.masterSheet) return;

  // Let response formulas calculate before contending for the routing lock.
  Utilities.sleep(ROUTER_CONFIG.formulaWaitMs);
  SpreadsheetApp.flush();

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(120000)) {
    throw new Error('Could not obtain the routing lock within 120 seconds; source row was not routed.');
  }

  try {
    const context = getValidatedContext_(ss);

    const rowData = readMasterRow_(context, sourceRow);
    const district = normalizeText_(
      rowData.values[context.masterHeaderMap[ROUTER_CONFIG.districtHeader]]
    );
    const mapped = context.accessMap.has(district);
    const targetName = mapped ? district : ROUTER_CONFIG.unmappedSheet;
    const target = ss.getSheetByName(targetName);
    if (!target) {
      throw new Error(`Missing destination sheet: ${targetName}. Run setupDistrictRouting first.`);
    }

    if (destinationContainsSourceRow_(target, context.masterHeaders.length + 1, sourceRow)) {
      appendLog_(ss, {
        action: 'FORM_SUBMIT',
        sourceRow,
        district,
        targetSheet: targetName,
        status: 'SKIPPED',
        details: 'Source row was already routed.',
      });
      return;
    }

    appendDestinationRows_(
      target,
      [{
        values: rowData.values,
        numberFormats: rowData.numberFormats,
        sourceRow,
      }],
      context.masterHeaders.length
    );
    if (mapped) syncOneDistrictPermissions_(context, district, false);

    appendLog_(ss, {
      action: 'FORM_SUBMIT',
      sourceRow,
      district,
      targetSheet: targetName,
      status: mapped ? 'SUCCESS' : 'UNMAPPED',
      details: mapped
        ? 'Response routed successfully.'
        : 'District was not found in Edit Access; response sent to Unmapped.',
    });
  } catch (error) {
    appendLog_(ss, {
      action: 'FORM_SUBMIT',
      sourceRow,
      district: '',
      targetSheet: '',
      status: 'ERROR',
      details: error && error.message ? error.message : String(error),
    });
    throw error;
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}

/** Backfills existing master rows. Safe to rerun because source rows are tracked. */
function backfillExistingResponses() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const context = getValidatedContext_(ss);
    ensureAdministrativeSheets_(context);
    ensureDistrictSheets_(context);
    const result = backfillExistingResponses_(context);
    syncDistrictPermissions_(context);

    appendLog_(ss, {
      action: 'BACKFILL',
      sourceRow: '',
      district: '',
      targetSheet: '',
      status: 'SUCCESS',
      details: `Added ${result.added}; skipped ${result.skipped}; unmapped ${result.unmapped}.`,
    });

    ss.toast(
      `Backfill complete: ${result.added} added, ${result.skipped} already present.`,
      'District Routing',
      8
    );
  } finally {
    lock.releaseLock();
  }
}

function backfillExistingResponses_(context) {
  const { master, masterHeaders, masterHeaderMap, accessMap, ss } = context;
  const lastRow = master.getLastRow();
  if (lastRow < 2) {
    normalizeDistrictDateTimeFormats_(context);
    return { added: 0, skipped: 0, unmapped: 0 };
  }

  SpreadsheetApp.flush();

  const rowCount = lastRow - 1;
  const columnCount = masterHeaders.length;
  const dataRange = master.getRange(2, 1, rowCount, columnCount);
  const values = dataRange.getValues();
  const numberFormats = dataRange.getNumberFormats();
  const districtIndex = masterHeaderMap[ROUTER_CONFIG.districtHeader];
  const sourceRowColumn = columnCount + 1;

  const destinationState = new Map();
  [...accessMap.keys(), ROUTER_CONFIG.unmappedSheet].forEach((name) => {
    const sheet = ss.getSheetByName(name);
    destinationState.set(name, {
      sheet,
      existing: getExistingSourceRows_(sheet, sourceRowColumn),
      editorialColumn: accessMap.has(name) ? editorialTextColumn_(sheet, columnCount) : undefined,
      pending: [],
    });
  });

  let added = 0;
  let skipped = 0;
  let unmapped = 0;

  values.forEach((row, index) => {
    const sourceRow = index + 2;
    const district = normalizeText_(row[districtIndex]);

    // Skip completely empty or structurally incomplete rows.
    if (!row.some((value) => value !== '' && value !== null) || !district) return;

    const mapped = accessMap.has(district);
    const destinationName = mapped ? district : ROUTER_CONFIG.unmappedSheet;
    const state = destinationState.get(destinationName);

    if (state.existing.has(String(sourceRow))) {
      skipped += 1;
      return;
    }

    state.pending.push({
      values: row,
      numberFormats: numberFormats[index],
      sourceRow,
    });
    state.existing.add(String(sourceRow));
    added += 1;
    if (!mapped) unmapped += 1;
  });

  destinationState.forEach((state) => {
    if (state.pending.length) {
      appendDestinationRows_(state.sheet, state.pending, columnCount);
    }
  });

  accessMap.forEach((_emails, district) => {
    const state = destinationState.get(district);
    if (state.editorialColumn === undefined || state.sheet.getLastRow() < 2) return;
    const sheet = state.sheet;
    const firstRow = 2;
    const rowCount = sheet.getLastRow() - 1;
    const rows = sheet.getRange(firstRow, 1, rowCount, columnCount).getValues();
    rows.forEach((row, index) => {
      if (row.some((value) => value !== '' && value !== null)) {
        const destinationRow = firstRow + index;
        setDistrictEditorialFormula_(
          sheet,
          destinationRow,
          state.editorialColumn,
          editorialTextFormula_(destinationRow)
        );
      }
    });
  });

  normalizeDistrictDateTimeFormats_(context);

  return { added, skipped, unmapped };
}

function normalizeDistrictDateTimeFormats_(context) {
  const { master, masterHeaders, accessMap, ss } = context;
  const columns = masterHeaders.reduce((matches, header, index) => {
    if (/^(date|time)\b/i.test(header)) {
      matches.push({ column: index + 1, format: master.getRange(2, index + 1).getNumberFormat() });
    }
    return matches;
  }, []);
  if (!columns.length) return;

  accessMap.forEach((_emails, district) => {
    const sheet = ss.getSheetByName(district);
    if (!sheet || sheet.getLastRow() < 2) return;
    columns.forEach(({ column, format }) => {
      sheet.getRange(2, column, sheet.getLastRow() - 1, 1).setNumberFormat(format);
    });
  });
}

/** Synchronizes protections using Office Email Address + Bureau Chief. */
function syncDistrictPermissions() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const context = getValidatedContext_(ss);
    ensureAdministrativeSheets_(context);
    ensureDistrictSheets_(context);
    syncDistrictPermissions_(context);

    appendLog_(ss, {
      action: 'SYNC_PERMISSIONS',
      sourceRow: '',
      district: '',
      targetSheet: '',
      status: 'SUCCESS',
      details: `Updated protections for ${context.accessMap.size} district tabs.`,
    });

    ss.toast('District permissions updated.', 'District Routing', 8);
  } finally {
    lock.releaseLock();
  }
}

function syncDistrictPermissions_(context) {
  const { ss, accessMap } = context;

  accessMap.forEach((_emails, district) => {
    syncOneDistrictPermissions_(context, district);
  });

  [
    ROUTER_CONFIG.masterSheet,
    ROUTER_CONFIG.accessSheet,
    ROUTER_CONFIG.logSheet,
    ROUTER_CONFIG.unmappedSheet,
  ].forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      applySheetProtection_(
        sheet,
        [],
        `${ROUTER_CONFIG.protectionPrefix} Admin — ${name}`
      );
    }
  });
}

/** Only linked rows get exceptions to the owner-only sheet protection. */
function syncOneDistrictPermissions_(context, district, initializeRows = true) {
  const sheet = context.ss.getSheetByName(district);
  const fieldCount = context.masterHeaders.length;
  const sourceColumn = fieldCount + 1;
  const statusColumn = fieldCount + 2;
  if (initializeRows && sheet.getLastRow() > 1) {
    initializeWorkflowRows_(sheet, 2, sheet.getLastRow() - 1, fieldCount);
  }
  const description = `${ROUTER_CONFIG.protectionPrefix} ${district}`;
  const protection = applySheetProtection_(sheet, [], description);
  const linkedRows = sheet.getLastRow() < 2 ? [] :
    sheet.getRange(2, sourceColumn, sheet.getLastRow() - 1, 1).getValues()
      .map((entry, index) => entry[0] !== '' &&
        Number.isInteger(Number(entry[0])) && Number(entry[0]) >= 2 ? index + 2 : null)
      .filter((row) => row !== null);
  const blocks = consecutiveBlocks_(linkedRows);
  const allowed = getDistrictEditors_(context, district);
  const needed = new Map();
  const exceptions = [];
  blocks.forEach(([firstRow, lastRow]) => {
    [[1, fieldCount], [statusColumn, 1]].forEach(([column, width]) => {
      const range = sheet.getRange(firstRow, column, lastRow - firstRow + 1, width);
      const key = `${ROUTER_CONFIG.editableProtectionPrefix} ${district}:${firstRow}:${lastRow}:${column}`;
      needed.set(key, range);
      exceptions.push(range);
    });
  });

  // A sheet-level exception alone would be open to every file editor. Each
  // exception also has its own range protection for this district's editors.
  const old = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter((item) => item.getDescription().startsWith(ROUTER_CONFIG.editableProtectionPrefix));
  const existing = new Map(old.map((item) => [item.getDescription(), item]));
  needed.forEach((range, key) => {
    const item = existing.get(key) || range.protect().setDescription(key);
    applyProtectionEditors_(item, allowed);
  });
  protection.setUnprotectedRanges(exceptions);
  old.forEach((item) => {
    if (!needed.has(item.getDescription())) item.remove();
  });
}

function consecutiveBlocks_(rows) {
  const blocks = [];
  rows.forEach((row) => {
    const last = blocks[blocks.length - 1];
    if (last && row === last[1] + 1) last[1] = row;
    else blocks.push([row, row]);
  });
  return blocks;
}

/** Adds all mapped emails as file-level editors. Does not remove existing editors. */
function grantSpreadsheetEditorAccess() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const context = getValidatedContext_(ss);
  const result = grantSpreadsheetEditorAccess_(context);

  appendLog_(ss, {
    action: 'GRANT_FILE_ACCESS',
    sourceRow: '',
    district: '',
    targetSheet: '',
    status: result.failed ? 'PARTIAL' : 'SUCCESS',
    details: `Added ${result.added}; already editors ${result.existing}; failed ${result.failed}.`,
  });

  ss.toast(
    `File access: ${result.added} added, ${result.existing} already present, ${result.failed} failed.`,
    'District Routing',
    10
  );
}

function grantSpreadsheetEditorAccess_(context) {
  const { ss, allEditorEmails } = context;
  const file = DriveApp.getFileById(ss.getId());
  const currentEmails = new Set(
    file
      .getEditors()
      .map((user) => normalizeEmail_(user.getEmail()))
      .filter(Boolean)
  );

  let added = 0;
  let existing = 0;
  let failed = 0;

  [...allEditorEmails].sort().forEach((email) => {
    if (currentEmails.has(email)) {
      existing += 1;
      return;
    }

    try {
      file.addEditor(email);
      currentEmails.add(email);
      added += 1;
    } catch (error) {
      failed += 1;
      appendLog_(ss, {
        action: 'GRANT_FILE_ACCESS',
        sourceRow: '',
        district: '',
        targetSheet: '',
        status: 'ERROR',
        details: `${email}: ${error && error.message ? error.message : String(error)}`,
      });
    }
  });

  return { added, existing, failed };
}

/** Installs exactly one spreadsheet form-submit trigger for this project/user. */
function installFormSubmitTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  installFormSubmitTrigger_(ss);
  appendLog_(ss, {
    action: 'INSTALL_TRIGGER',
    sourceRow: '',
    district: '',
    targetSheet: '',
    status: 'SUCCESS',
    details: 'Spreadsheet form-submit trigger installed.',
  });
  ss.toast('Form-submit trigger installed.', 'District Routing', 8);
}

function installFormSubmitTrigger_(ss) {
  ScriptApp.getProjectTriggers()
    .filter(
      (trigger) =>
        trigger.getHandlerFunction() === ROUTER_CONFIG.submitHandler &&
        trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT
    )
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger(ROUTER_CONFIG.submitHandler)
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
}

/** Installs one audit trigger for the account running setup. */
function installDistrictEditTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  installDistrictEditTrigger_(ss);
  ss.toast('District edit tracking installed.', 'District Routing', 8);
}

function installDistrictEditTrigger_(ss) {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === ROUTER_CONFIG.editHandler &&
      trigger.getEventType() === ScriptApp.EventType.ON_EDIT)
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger(ROUTER_CONFIG.editHandler).forSpreadsheet(ss).onEdit().create();
}

/** Counts one human edit action per form-linked row touched on a district tab. */
function recordDistrictEdit(e) {
  if (!e || !e.range) throw new Error('Install the edit trigger; do not run this manually.');
  const sheet = e.range.getSheet();
  if (EXPECTED_DISTRICTS.indexOf(sheet.getName()) === -1 || e.range.getLastRow() < 2) return;

  const master = e.source.getSheetByName(ROUTER_CONFIG.masterSheet);
  const masterColumnCount = master.getLastColumn();
  const statusColumn = masterColumnCount + 2;
  const sourceColumn = masterColumnCount + 1;
  const firstColumn = e.range.getColumn();
  const lastColumn = e.range.getLastColumn();
  if (firstColumn > masterColumnCount &&
      (firstColumn > statusColumn || lastColumn < statusColumn)) return;
  if (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 &&
      e.oldValue !== undefined && e.value !== undefined &&
      String(e.oldValue) === String(e.value)) return;

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const firstRow = Math.max(2, e.range.getRow());
    const rowCount = e.range.getLastRow() - firstRow + 1;
    const sourceRows = sheet.getRange(firstRow, sourceColumn, rowCount, 1).getValues();
    const audit = sheet.getRange(firstRow, statusColumn + 1, rowCount, 4).getValues();
    const email = normalizeEmail_(e.user && e.user.getEmail && e.user.getEmail()) ||
      normalizeEmail_(Session.getActiveUser().getEmail()) || 'Unavailable';
    const now = new Date();
    const columns = [];
    if (firstColumn <= masterColumnCount) columns.push('Form fields');
    if (firstColumn <= statusColumn && lastColumn >= statusColumn) {
      columns.push(ROUTER_CONFIG.statusHeader);
    }
    const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    sourceRows.forEach((sourceRow, index) => {
      if (!Number.isInteger(Number(sourceRow[0])) || Number(sourceRow[0]) < 2 ||
          sourceRow[0] === '') return;
      const row = firstRow + index;
      const previous = audit[index];
      const count = (Number(previous[0]) || 0) + 1;
      const entry = `${stamp} | ${email} | ${columns.join(', ')}`;
      const history = [normalizeText_(previous[3]), entry].filter(Boolean).join('\n');
      sheet.getRange(row, statusColumn + 1, 1, 4).setValues([[
        count,
        email,
        now,
        history.length > 45000 ? history.slice(-45000) : history,
      ]]);
    });
  } finally {
    lock.releaseLock();
  }
}

function getValidatedContext_(ss) {
  const master = ss.getSheetByName(ROUTER_CONFIG.masterSheet);
  const access = ss.getSheetByName(ROUTER_CONFIG.accessSheet);

  if (!master) {
    throw new Error(`Missing sheet: ${ROUTER_CONFIG.masterSheet}`);
  }
  if (!access) {
    throw new Error(`Missing sheet: ${ROUTER_CONFIG.accessSheet}`);
  }
  if (master.getLastColumn() < 1) {
    throw new Error(`${ROUTER_CONFIG.masterSheet} has no headers.`);
  }

  const masterHeaders = master
    .getRange(1, 1, 1, master.getLastColumn())
    .getDisplayValues()[0]
    .map(normalizeText_);
  const masterHeaderMap = headerMap_(masterHeaders);

  requireHeaders_(ROUTER_CONFIG.masterSheet, masterHeaderMap, [
    ROUTER_CONFIG.districtHeader,
  ]);

  const accessResult = readAccessMap_(access);
  validateDistrictSet_(accessResult.accessMap);

  return {
    ss,
    master,
    access,
    masterHeaders,
    masterHeaderMap,
    accessMap: accessResult.accessMap,
    globalEditors: accessResult.globalEditors,
    allEditorEmails: accessResult.allEditorEmails,
  };
}

function readAccessMap_(accessSheet) {
  const values = accessSheet.getDataRange().getDisplayValues();
  if (!values.length) throw new Error(`${ROUTER_CONFIG.accessSheet} is empty.`);

  const headers = values[0].map(normalizeText_);
  const map = headerMap_(headers);
  requireHeaders_(ROUTER_CONFIG.accessSheet, map, [
    ROUTER_CONFIG.districtHeader,
    ROUTER_CONFIG.officeEmailHeader,
    ROUTER_CONFIG.bureauChiefHeader,
  ]);

  const accessMap = new Map();
  const globalEditors = new Set();
  const allEditorEmails = new Set();
  const invalidEmails = [];

  values.slice(1).forEach((row, zeroBasedIndex) => {
    const sheetRow = zeroBasedIndex + 2;
    const district = normalizeText_(row[map[ROUTER_CONFIG.districtHeader]]);

    // Group-heading rows in Edit Access have no District and are ignored.
    if (!district) return;

    const isAllDistricts =
      district.toUpperCase() === ROUTER_CONFIG.allDistrictsValue;

    if (!isAllDistricts && !accessMap.has(district)) {
      accessMap.set(district, new Set());
    }

    [
      row[map[ROUTER_CONFIG.officeEmailHeader]],
      row[map[ROUTER_CONFIG.bureauChiefHeader]],
    ].forEach((rawEmail) => {
      const email = normalizeEmail_(rawEmail);
      if (!email) return;
      if (!isValidEmail_(email)) {
        invalidEmails.push(`row ${sheetRow}: ${rawEmail}`);
        return;
      }
      if (isAllDistricts) {
        globalEditors.add(email);
      } else {
        accessMap.get(district).add(email);
      }
      allEditorEmails.add(email);
    });
  });

  if (invalidEmails.length) {
    throw new Error(`Invalid emails in Edit Access: ${invalidEmails.join('; ')}`);
  }

  const districtsWithoutEditors = [...accessMap.entries()]
    .filter(([, emails]) => emails.size === 0)
    .map(([district]) => district);
  if (districtsWithoutEditors.length) {
    throw new Error(
      `Districts without editors: ${districtsWithoutEditors.join(', ')}`
    );
  }

  return { accessMap, globalEditors, allEditorEmails };
}

function getDistrictEditors_(context, district) {
  const districtEditors = context.accessMap.get(district) || new Set();
  return [...new Set([...districtEditors, ...context.globalEditors])];
}

function validateDistrictSet_(accessMap) {
  const expected = new Set(EXPECTED_DISTRICTS);
  const actual = new Set(accessMap.keys());
  const missing = EXPECTED_DISTRICTS.filter((district) => !actual.has(district));
  const extra = [...actual].filter((district) => !expected.has(district));

  if (missing.length || extra.length) {
    const details = [];
    if (missing.length) details.push(`missing: ${missing.join(', ')}`);
    if (extra.length) details.push(`unexpected: ${extra.join(', ')}`);
    throw new Error(`Edit Access district validation failed — ${details.join('; ')}`);
  }
}

function prepareDestinationSheet_(master, destination, masterColumnCount) {
  const sourceRowColumn = masterColumnCount + 1;

  if (destination.getMaxColumns() < sourceRowColumn) {
    destination.insertColumnsAfter(
      destination.getMaxColumns(),
      sourceRowColumn - destination.getMaxColumns()
    );
  }

  const destinationHeader = destination
    .getRange(1, 1, 1, sourceRowColumn)
    .getDisplayValues()[0];

  if (!destinationHeader.slice(0, masterColumnCount).some(Boolean)) {
    master
      .getRange(1, 1, 1, masterColumnCount)
      .copyTo(destination.getRange(1, 1, 1, masterColumnCount));
  }

  destination
    .getRange(1, sourceRowColumn)
    .setValue(ROUTER_CONFIG.sourceRowHeader);
  destination.setFrozenRows(1);

  try {
    destination.hideColumns(sourceRowColumn);
  } catch (_error) {
    // Already hidden or temporarily unavailable; routing is unaffected.
  }
}

/** Creates district-only workflow columns without modifying old manual rows. */
function prepareDistrictWorkflowSheet_(sheet, masterColumnCount) {
  const first = masterColumnCount + 2;
  const headers = [
    ROUTER_CONFIG.statusHeader,
    ROUTER_CONFIG.countHeader,
    ROUTER_CONFIG.editorHeader,
    ROUTER_CONFIG.editedAtHeader,
    ROUTER_CONFIG.historyHeader,
  ];
  const last = first + headers.length - 1;
  if (sheet.getMaxColumns() < last) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), last - sheet.getMaxColumns());
  }
  const current = sheet.getRange(1, first, 1, headers.length).getDisplayValues()[0];
  if (current.every((value, index) => value === headers[index])) return;
  if (current.some(Boolean)) {
    throw new Error(`${sheet.getName()}: workflow columns already have different headers.`);
  }
  if (sheet.getLastRow() > 1 && sheet.getRange(2, first, sheet.getLastRow() - 1, headers.length)
    .getValues().some((row) => row.some((value) => value !== '' && value !== null))) {
    throw new Error(`${sheet.getName()}: N:R contains data; move it before installing workflow columns.`);
  }
  sheet.getRange(1, first, 1, headers.length).setValues([headers]);
  sheet.getRange(1, first, 1, headers.length).setFontWeight('bold');
  if (sheet.getLastRow() > 1) {
    initializeWorkflowRows_(sheet, 2, sheet.getLastRow() - 1, masterColumnCount);
  }
}

function initializeWorkflowRows_(sheet, firstRow, rowCount, masterColumnCount) {
  if (!rowCount) return;
  const sourceColumn = masterColumnCount + 1;
  const statusColumn = masterColumnCount + 2;
  const sources = sheet.getRange(firstRow, sourceColumn, rowCount, 1).getValues();
  const statuses = sheet.getRange(firstRow, statusColumn, rowCount, 2).getValues();
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ROUTER_CONFIG.statusValues, true)
    .setAllowInvalid(false)
    .build();
  sources.forEach((source, index) => {
    if (source[0] === '' || !Number.isInteger(Number(source[0])) || Number(source[0]) < 2) return;
    const row = firstRow + index;
    sheet.getRange(row, statusColumn).setDataValidation(rule);
    if (statuses[index][0] === '') sheet.getRange(row, statusColumn).setValue('Active');
    if (statuses[index][1] === '') sheet.getRange(row, statusColumn + 1).setValue(0);
  });
  sheet.getRange(firstRow, statusColumn + 3, rowCount, 1)
    .setNumberFormat('yyyy-mm-dd hh:mm:ss');
}

function readMasterRow_(context, sourceRow) {
  const range = context.master.getRange(
    sourceRow,
    1,
    1,
    context.masterHeaders.length
  );
  return {
    values: range.getValues()[0],
    numberFormats: range.getNumberFormats()[0],
  };
}

function appendDestinationRows_(sheet, rows, masterColumnCount) {
  if (!rows.length) return;

  const startRow = Math.max(sheet.getLastRow() + 1, 2);
  const outputValues = rows.map((row) => [...row.values, row.sourceRow]);
  sheet
    .getRange(startRow, 1, outputValues.length, masterColumnCount + 1)
    .setValues(outputValues);

  const outputFormats = rows.map((row) => row.numberFormats);
  sheet
    .getRange(startRow, 1, outputFormats.length, masterColumnCount)
    .setNumberFormats(outputFormats);
  if (EXPECTED_DISTRICTS.indexOf(sheet.getName()) !== -1) {
    const editorialColumn = editorialTextColumn_(sheet, masterColumnCount);
    if (editorialColumn !== undefined) {
      rows.forEach((row, index) => {
        setDistrictEditorialFormula_(
          sheet,
          startRow + index,
          editorialColumn,
          editorialTextFormula_(startRow + index)
        );
      });
    }
    initializeWorkflowRows_(sheet, startRow, rows.length, masterColumnCount);
  }
}

function editorialTextColumn_(sheet, masterColumnCount) {
  const headers = sheet.getRange(1, 1, 1, masterColumnCount).getDisplayValues()[0]
    .map(normalizeText_);
  const index = headerMap_(headers)['Editorial Text'];
  return index === undefined ? undefined : index + 1;
}

function setDistrictEditorialFormula_(sheet, row, column, formula) {
  if (row) sheet.getRange(row, column).setFormula(formula);
}

function editorialTextFormula_(row) {
  return `=LET(t,IF(E${row}="","",IFERROR(MOD(E${row},1),TIMEVALUE(E${row}))),venue,TEXTJOIN(", ",TRUE,H${row},K${row}),daypart,IF(t="","",IFS(HOUR(t)<12,"ಬೆಳಿಗ್ಗೆ",HOUR(t)<16,"ಮಧ್ಯಾಹ್ನ",HOUR(t)<20,"ಸಂಜೆ",TRUE,"ರಾತ್ರಿ")),time12,IF(t="","",(MOD(HOUR(t)-1,12)+1)&"."&TEXT(MINUTE(t),"00")),TEXTJOIN(CHAR(10),TRUE,F${row},G${row},IF(venue<>"","ಸ್ಥಳ: "&venue&".",""),IF(t<>"","ಸಮಯ: "&daypart&" "&time12&".","")))`;
}

function getExistingSourceRows_(sheet, sourceRowColumn) {
  if (!sheet || sheet.getLastRow() < 2) return new Set();
  return new Set(
    sheet
      .getRange(2, sourceRowColumn, sheet.getLastRow() - 1, 1)
      .getValues()
      .flat()
      .filter((value) => value !== '' && value !== null)
      .map(String)
  );
}

function destinationContainsSourceRow_(sheet, sourceRowColumn, sourceRow) {
  return getExistingSourceRows_(sheet, sourceRowColumn).has(String(sourceRow));
}

function applySheetProtection_(sheet, allowedEmails, description) {
  if (!sheet) throw new Error(`Cannot protect a missing sheet: ${description}`);

  const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  const protection = protections.find((item) => item.getDescription() === description) ||
    (protections.length ? protections[0] : sheet.protect());
  protection.setDescription(description);
  protection.setWarningOnly(false);

  applyProtectionEditors_(protection, allowedEmails);
  return protection;
}

function applyProtectionEditors_(protection, allowedEmails) {
  protection.setWarningOnly(false);

  const effectiveUser = Session.getEffectiveUser();
  const effectiveEmail = normalizeEmail_(effectiveUser.getEmail());
  protection.addEditor(effectiveUser);

  if (protection.canDomainEdit()) {
    protection.setDomainEdit(false);
  }

  const allowed = new Set(allowedEmails.map(normalizeEmail_).filter(Boolean));
  if (effectiveEmail) allowed.add(effectiveEmail);

  protection.getEditors().forEach((user) => {
    const email = normalizeEmail_(user.getEmail());
    if (email && !allowed.has(email)) {
      try {
        protection.removeEditor(user);
      } catch (error) {
        appendLog_(protection.getRange().getSheet().getParent(), {
          action: 'SYNC_PERMISSIONS',
          sourceRow: '',
          district: protection.getRange().getSheet().getName(),
          targetSheet: protection.getRange().getSheet().getName(),
          status: 'WARNING',
          details: `Could not remove ${email} from protection: ${
            error && error.message ? error.message : String(error)
          }`,
        });
        throw new Error(`Could not enforce protection for ${email}: ${error.message}`);
      }
    }
  });

  if (allowedEmails.length) {
    protection.addEditors([...new Set(allowedEmails.map(normalizeEmail_))]);
  }
}

function appendLog_(ss, entry) {
  try {
    let sheet = ss.getSheetByName(ROUTER_CONFIG.logSheet);
    if (!sheet) {
      sheet = ss.insertSheet(ROUTER_CONFIG.logSheet);
      sheet
        .getRange(1, 1, 1, 7)
        .setValues([[
          'Logged At',
          'Action',
          'Source Row',
          'District',
          'Target Sheet',
          'Status',
          'Details',
        ]]);
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date(),
      entry.action || '',
      entry.sourceRow || '',
      entry.district || '',
      entry.targetSheet || '',
      entry.status || '',
      entry.details || '',
    ]);
  } catch (logError) {
    console.error('Unable to write Routing Log', logError);
  }
}

function headerMap_(headers) {
  return headers.reduce((map, header, index) => {
    if (header && map[header] === undefined) map[header] = index;
    return map;
  }, {});
}

function requireHeaders_(sheetName, headerMap, requiredHeaders) {
  const missing = requiredHeaders.filter(
    (header) => headerMap[header] === undefined
  );
  if (missing.length) {
    throw new Error(`${sheetName} is missing headers: ${missing.join(', ')}`);
  }
}

function normalizeText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeEmail_(value) {
  return normalizeText_(value).toLowerCase();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
