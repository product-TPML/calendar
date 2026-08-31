const EPAPER_API = 'https://api-epaper-prod.deccanherald.com';

async function getEditions() {
  const response = await fetch(`${EPAPER_API}/epaper/editions?publisher=PV`);
  if (!response.ok) throw new Error(`edition list failed: HTTP ${response.status}`);
  return (await response.json()).flatMap((group) => group.editions || []);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_EDITIONS_PAGE') {
    getEditions().then((editions) => sendResponse({ editions })).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === 'START_COLLECT') {
    collectPrajavaniEpaper(message.date, {
      editionNumbers: message.editionNumbers,
      fetchArticles: true,
      includeRawHtml: true,
      onEdition: (edition) => chrome.runtime.sendMessage({
        type: 'EDITION_RESULT',
        jobId: message.jobId,
        date: message.date,
        edition,
      }),
    }).then((report) => chrome.runtime.sendMessage({
      type: 'COLLECT_DONE',
      jobId: message.jobId,
      date: message.date,
      summary: report.summary,
    })).catch((error) => chrome.runtime.sendMessage({
      type: 'COLLECT_DONE',
      jobId: message.jobId,
      date: message.date,
      error: error.message,
    }));
    sendResponse({ accepted: true });
    return true;
  }
});
