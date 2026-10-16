/**
 * PV Calendar Utility Notices — form builder
 *
 * Creates the notices Google Form and links it to this spreadsheet. Paste this
 * file next to PV_Notices_Response_Router.gs in the same Apps Script project
 * (Extensions > Apps Script in the NEW notices spreadsheet), then run
 * createNoticesForm once.
 *
 * AFTER IT RUNS
 * 1. Set the spreadsheet's locale to India (File > Settings) so dates read
 *    day-first.
 * 2. Copy the Edit Access tab across from the events spreadsheet.
 * 3. Run setupDistrictRouting (menu: District Routing > Run complete setup).
 * 4. Submit one test notice and check it lands on the right district tab.
 *
 * The question titles start with the English word. The router finds columns by
 * that prefix and formats any column starting with "Date" or "Time".
 * See docs/events-and-notices-data-flow.md.
 */

const NOTICE_CATEGORIES = Object.freeze(['Power Cut', 'Water Supply', 'Public Work', 'Railway']);

const NOTICE_TYPES = Object.freeze([
  'Road closure',
  'Train cancelled',
  'Train partly cancelled',
  'Train delayed',
  'Special train extended',
  'Temporary halt',
]);

// The same 31 names as the events form. EXPECTED_DISTRICTS lives in the router
// file; both files share one project, so it is available here.
const NOTICE_MAX_CHARS = 2500;

function createNoticesForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(ROUTER_CONFIG.masterSheet)) {
    throw new Error(
      `${ROUTER_CONFIG.masterSheet} already exists. Run this on a fresh spreadsheet, or rename that tab first.`
    );
  }

  const form = FormApp.create('PV Calendar Utility Notice  ಉಪಯುಕ್ತ ಸೂಚನೆ');
  form.setDescription(
    'One notice per submission: power cut, water supply, public work or railway. ' +
    'Write the notice in Kannada. One notice only; do not paste other stories.'
  );
  form.setCollectEmail(true);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Notice received. ಸೂಚನೆ ಸ್ವೀಕರಿಸಲಾಗಿದೆ.');

  form.addListItem()
    .setTitle('District  ಜಿಲ್ಲೆ')
    .setChoiceValues(EXPECTED_DISTRICTS.slice())
    .setRequired(true);

  form.addListItem()
    .setTitle('Category  ವರ್ಗ')
    .setChoiceValues(NOTICE_CATEGORIES.slice())
    .setRequired(true);

  form.addListItem()
    .setTitle('Type  ಪ್ರಕಾರ')
    .setHelpText('Optional. Mostly for railway and road notices.')
    .setChoiceValues(NOTICE_TYPES.slice())
    .setRequired(false);

  form.addDateItem()
    .setTitle('Date from  ಆರಂಭ ದಿನಾಂಕ')
    .setRequired(true);

  form.addDateItem()
    .setTitle('Date to  ಕೊನೆಯ ದಿನಾಂಕ')
    .setHelpText('Leave blank for a single day.')
    .setRequired(false);

  const specificDates = form.addTextItem()
    .setTitle('Specific dates  ನಿರ್ದಿಷ್ಟ ದಿನಾಂಕಗಳು')
    .setHelpText(
      'Only if the notice applies on scattered days, not every day from start to end. ' +
      'Type as 12-10-2026, 14-10-2026'
    )
    .setRequired(false);
  specificDates.setValidation(
    FormApp.createTextValidation()
      .setHelpText('Use DD-MM-YYYY separated by commas, e.g. 12-10-2026, 14-10-2026')
      .requireTextMatchesPattern(
        '^\\s*\\d{1,2}-\\d{1,2}-\\d{4}(\\s*,\\s*\\d{1,2}-\\d{1,2}-\\d{4})*\\s*$'
      )
      .build()
  );

  form.addTimeItem().setTitle('Time from  ಆರಂಭ ಸಮಯ').setRequired(false);
  form.addTimeItem().setTitle('Time to  ಕೊನೆಯ ಸಮಯ').setRequired(false);

  form.addParagraphTextItem()
    .setTitle('Notice text  ಸೂಚನೆ')
    .setHelpText('The notice only, in Kannada. One notice per submission.')
    .setRequired(true)
    .setValidation(
      FormApp.createParagraphTextValidation()
        .setHelpText(`Keep it under ${NOTICE_MAX_CHARS} characters.`)
        .requireTextLengthLessThanOrEqualTo(NOTICE_MAX_CHARS)
        .build()
    );

  form.addParagraphTextItem()
    .setTitle('Areas affected  ಬಾಧಿತ ಪ್ರದೇಶಗಳು')
    .setHelpText('Optional. Shown behind "ಪೂರ್ತಿ ಓದಿ".')
    .setRequired(false);

  form.addCheckboxItem()
    .setTitle('Also show in  ಇವುಗಳಲ್ಲಿಯೂ ತೋರಿಸಿ')
    .setHelpText('Only for notices that span districts, mainly railway.')
    .setChoiceValues(EXPECTED_DISTRICTS.slice())
    .setRequired(false);

  form.addTextItem()
    .setTitle('Article link  ಲೇಖನ ಲಿಂಕ್')
    .setHelpText('Optional. Link to the full story.')
    .setRequired(false)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Enter a full web address starting with https://')
        .requireTextIsUrl()
        .build()
    );

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();

  const message =
    `Form created.\nEdit: ${form.getEditUrl()}\nShare: ${form.getPublishedUrl()}\n\n` +
    'Next: set the spreadsheet locale to India, copy in the Edit Access tab, ' +
    'then run District Routing > Run complete setup.';
  console.log(message);
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (_error) {
    // Not run from the spreadsheet UI; the log has the links.
  }
}
