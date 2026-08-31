const EPAPER_API = 'https://api-epaper-prod.deccanherald.com';
const DATE_CONCURRENCY = 2;
let activeController = null;

async function getEditions() {
  const response = await fetch(`${EPAPER_API}/epaper/editions?publisher=PV`);
  if (!response.ok) throw new Error(`edition list failed: HTTP ${response.status}`);
  return (await response.json()).flatMap((group) => group.editions || []);
}

function datesBetween(startDate, endDate) {
  const dates = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!startDate || !endDate || Number.isNaN(current.valueOf()) || Number.isNaN(end.valueOf()) || current > end) {
    throw new Error('Choose a valid start and end date.');
  }
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function addSummary(total, current) {
  ['accessible', 'forbidden', 'otherFailures', 'structuredArticles', 'textArticles', 'imageOnlyArticles'].forEach((key) => {
    total[key] += current[key] || 0;
  });
}

async function mapLimit(items, limit, worker, signal) {
  const results = [];
  let next = 0;
  async function consume() {
    while (next < items.length) {
      if (signal?.aborted) throw new DOMException('Collection stopped', 'AbortError');
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_COLLECT_STATUS') {
    sendResponse({ active: Boolean(activeController) });
    return false;
  }

  if (message.type === 'GET_EDITIONS_PAGE') {
    getEditions().then((editions) => sendResponse({ editions })).catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === 'START_COLLECT') {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    (async () => {
      const dates = datesBetween(message.startDate, message.endDate);
      const summary = {
        total: 0,
        accessible: 0,
        forbidden: 0,
        otherFailures: 0,
        structuredArticles: 0,
        textArticles: 0,
        imageOnlyArticles: 0,
      };
      const reports = await mapLimit(dates, DATE_CONCURRENCY, (date) => collectPrajavaniEpaper(date, {
          editionNumbers: message.editionNumbers,
          fetchArticles: true,
          includeRawHtml: true,
          signal: controller.signal,
          onEdition: async (edition) => {
            const result = await chrome.runtime.sendMessage({
              type: 'EDITION_RESULT',
              jobId: message.jobId,
              date,
              startDate: message.startDate,
              endDate: message.endDate,
              edition,
            });
            if (result?.error) throw new Error(result.error);
          },
        }), controller.signal);
      for (const report of reports) {
        summary.total += report.summary.total;
        addSummary(summary, report.summary);
      }
      await chrome.runtime.sendMessage({
        type: 'COLLECT_DONE',
        jobId: message.jobId,
        startDate: message.startDate,
        endDate: message.endDate,
        summary,
      });
    })().catch((error) => chrome.runtime.sendMessage({
      type: 'COLLECT_DONE',
      jobId: message.jobId,
      startDate: message.startDate,
      endDate: message.endDate,
      cancelled: error.name === 'AbortError',
      error: error.name === 'AbortError' ? 'Collection stopped because the ePaper tab was left.' : error.message,
    })).finally(() => {
      if (activeController?.signal === controller.signal) activeController = null;
    });
    sendResponse({ accepted: true });
    return true;
  }

  if (message.type === 'STOP_COLLECT') {
    activeController?.abort();
    sendResponse({ accepted: true });
    return false;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) activeController?.abort();
});
