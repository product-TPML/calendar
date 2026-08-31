const DB_NAME = 'prajavani-epaper';
const DB_VERSION = 1;
const STORES = ['editions', 'issues', 'pages', 'articles', 'jobs'];
const activeRuns = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('editions', { keyPath: 'editionNumber' });
      db.createObjectStore('issues', { keyPath: 'key' });
      db.createObjectStore('pages', { keyPath: 'key' });
      db.createObjectStore('articles', { keyPath: 'key' });
      db.createObjectStore('jobs', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(store, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function putMany(store, values) {
  if (!values.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    values.forEach((value) => transaction.objectStore(store).put(value));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function all(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES, 'readwrite');
    STORES.forEach((store) => transaction.objectStore(store).clear());
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function shelfSnapshot() {
  const values = await Promise.all(STORES.map((store) => all(store)));
  return {
    format: 'prajavani-epaper-shelf',
    version: 1,
    exportedAt: new Date().toISOString(),
    stores: Object.fromEntries(STORES.map((store, index) => [store, values[index]])),
  };
}

function validSnapshot(snapshot) {
  return snapshot?.format === 'prajavani-epaper-shelf'
    && snapshot.version === 1
    && snapshot.stores
    && STORES.every((store) => Array.isArray(snapshot.stores[store]));
}

async function importShelf(snapshot) {
  if (!validSnapshot(snapshot)) throw new Error('Invalid Prajavani shelf snapshot.');
  await clearAll();
  for (const store of STORES) await putMany(store, snapshot.stores[store]);
  return Object.fromEntries(STORES.map((store) => [store, snapshot.stores[store].length]));
}

function issueKey(date, editionNumber) {
  return `PV:${date}:${editionNumber}`;
}

async function saveEdition(jobId, date, edition, startDate, endDate) {
  const number = String(edition.editionNumber);
  const key = issueKey(date, number);
  await put('issues', {
    key,
    jobId,
    publisher: 'PV',
    date,
    editionNumber: number,
    editionName: edition.name,
    shortCode: edition.shortCode,
    status: edition.status,
    error: edition.error || '',
    pages: edition.pages || 0,
    structuredArticles: edition.structuredArticles || 0,
    fetchedAt: new Date().toISOString(),
  });
  await putMany('pages', (edition.pageRecords || []).map((page) => ({
    ...page,
    key: `${key}:${page.id}`,
    issueKey: key,
  })));
  const articleRecords = (edition.articleResults || [])
    .filter((article) => article.status === 200)
    .map((article) => ({
      ...article,
      key: `${key}:${article.id}`,
      issueKey: key,
      editionNumber: number,
      editionName: edition.name,
      date,
    }));
  await putMany('articles', articleRecords);
  const run = activeRuns.get(jobId);
  await put('jobs', {
    id: jobId,
    tabId: run?.tabId,
    startDate,
    endDate,
    status: run?.cancelRequested ? 'cancelled' : 'running',
    updatedAt: new Date().toISOString(),
    lastDate: date,
    lastEdition: number,
  });
  const articleCount = (await all('articles')).length;
  if (!run?.cancelRequested) chrome.runtime.sendMessage({
      type: 'EPAPER_PROGRESS',
      jobId,
      date,
      edition: {
        number,
        name: edition.name,
        status: edition.status,
        structuredArticles: edition.structuredArticles || 0,
        textArticles: edition.textArticles || 0,
        imageOnlyArticles: edition.imageOnlyArticles || 0,
      },
      articleCount,
    }).catch(() => {});
  return { articleCount };
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0];
}

async function startCrawl(message) {
  const jobId = crypto.randomUUID();
  activeRuns.set(jobId, {
    tabId: message.tabId,
    startDate: message.startDate,
    endDate: message.endDate,
    cancelRequested: false,
  });
  await put('jobs', { id: jobId, tabId: message.tabId, startDate: message.startDate, endDate: message.endDate, status: 'starting', updatedAt: new Date().toISOString() });
  chrome.tabs.sendMessage(message.tabId, {
    type: 'START_COLLECT',
    jobId,
    startDate: message.startDate,
    endDate: message.endDate,
    editionNumbers: message.editionNumbers,
  }).catch(async (error) => {
    const run = activeRuns.get(jobId);
    const cancelled = run?.cancelRequested;
    activeRuns.delete(jobId);
    await put('jobs', { id: jobId, tabId: message.tabId, startDate: message.startDate, endDate: message.endDate, status: cancelled ? 'cancelled' : 'failed', error: error.message, updatedAt: new Date().toISOString() });
    chrome.runtime.sendMessage({ type: 'EPAPER_DONE', jobId, cancelled, error: error.message }).catch(() => {});
  });
  return { accepted: true, jobId };
}

async function cancelRun(jobId, reason, remove) {
  const run = activeRuns.get(jobId);
  if (!run || run.cancelRequested) return;
  run.cancelRequested = true;
  if (!remove) chrome.tabs.sendMessage(run.tabId, { type: 'STOP_COLLECT' }).catch(() => {});
  await put('jobs', {
    id: jobId,
    tabId: run.tabId,
    startDate: run.startDate,
    endDate: run.endDate,
    status: 'cancelled',
    error: reason,
    updatedAt: new Date().toISOString(),
  });
  chrome.runtime.sendMessage({ type: 'EPAPER_DONE', jobId, cancelled: true, error: reason }).catch(() => {});
  if (remove) activeRuns.delete(jobId);
}

async function cancelRunsForTab(tabId, reason, remove) {
  await Promise.all([...activeRuns.entries()]
    .filter(([, run]) => run.tabId === tabId)
    .map(([jobId]) => cancelRun(jobId, reason, remove)));
}

async function cancelRunsExceptTab(tabId, reason) {
  await Promise.all([...activeRuns.entries()]
    .filter(([, run]) => run.tabId !== tabId)
    .map(([jobId]) => cancelRun(jobId, reason, false)));
}

async function handle(message) {
  if (message.type === 'GET_STATS') {
    const [issues, articles, jobs] = await Promise.all([all('issues'), all('articles'), all('jobs')]);
    const candidates = jobs.filter((job) => ['starting', 'running'].includes(job.status) && !activeRuns.has(job.id));
    const activeAfterRestart = await Promise.all(candidates.map(async (job) => {
      if (!job.tabId) return false;
      try {
        const status = await chrome.tabs.sendMessage(job.tabId, { type: 'GET_COLLECT_STATUS' });
        return status?.active === true;
      } catch {
        return false;
      }
    }));
    const staleJobs = candidates.filter((_, index) => !activeAfterRestart[index]);
    await Promise.all(staleJobs.map((job) => put('jobs', {
      ...job,
      status: 'cancelled',
      error: 'Collection stopped after the extension worker restarted.',
      updatedAt: new Date().toISOString(),
    })));
    const staleIds = new Set(staleJobs.map((job) => job.id));
    return {
      issues,
      articleCount: articles.length,
      jobs: jobs.map((job) => staleIds.has(job.id)
        ? { ...job, status: 'cancelled', error: 'Collection stopped after the extension worker restarted.' }
        : job),
    };
  }
  if (message.type === 'GET_ARTICLES') return all('articles');
  if (message.type === 'EXPORT_SHELF') return shelfSnapshot();
  if (message.type === 'IMPORT_SHELF') return { ok: true, counts: await importShelf(message.snapshot) };
  if (message.type === 'CLEAR_DATA') {
    await clearAll();
    return { ok: true };
  }
  if (message.type === 'STOP_CRAWL') {
    if (!activeRuns.has(message.jobId)) {
      const job = (await all('jobs')).find((candidate) => candidate.id === message.jobId);
      if (!job || !['starting', 'running'].includes(job.status) || !job.tabId) return { error: 'No active collection.' };
      activeRuns.set(message.jobId, {
        tabId: job.tabId,
        startDate: job.startDate,
        endDate: job.endDate,
        cancelRequested: false,
      });
    }
    await cancelRun(message.jobId, 'Collection stopped by user.', false);
    return { ok: true };
  }
  if (message.type === 'START_CRAWL') return startCrawl(message);
  if (message.type === 'GET_EDITIONS') {
    const tab = await activeTab();
    if (!tab?.id || !tab.url?.startsWith('https://epaper.prajavani.net/')) {
      return { error: 'Open the logged-in Prajavani ePaper tab first.' };
    }
    return chrome.tabs.sendMessage(tab.id, { type: 'GET_EDITIONS_PAGE' });
  }
  if (message.type === 'SEARCH') {
    const query = message.query.trim().toLocaleLowerCase();
    const from = message.from || '';
    const to = message.to || '';
    const articles = await all('articles');
    const inRange = (article) => (!from || article.date >= from) && (!to || article.date <= to);
    if (!query) return articles.filter(inRange).slice(0, 100).map(searchResult);
    return articles.filter((article) => inRange(article) && searchable(article).includes(query)).slice(0, 100).map(searchResult);
  }
  return { error: `Unknown message: ${message.type}` };
}

function searchable(article) {
  return [article.title, article.kicker, article.bodyText, article.editionName, article.date, article.displayName]
    .filter(Boolean).join('\n').toLocaleLowerCase();
}

function searchResult(article) {
  return {
    key: article.key,
    id: article.id,
    title: article.title || '(Image-only article)',
    kicker: article.kicker || '',
    bodyText: article.bodyText || '',
    date: article.date,
    editionName: article.editionName,
    displayName: article.displayName,
    pageNo: article.pageNo,
    extraction: article.extraction,
    articleHtmlUrl: article.articleHtmlUrl,
    siteUrl: article.siteUrl,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EDITION_RESULT' && sender.tab?.id) {
    saveEdition(message.jobId, message.date, message.edition, message.startDate, message.endDate)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === 'COLLECT_DONE' && sender.tab?.id) {
    const run = activeRuns.get(message.jobId);
    const cancelled = message.cancelled || run?.cancelRequested;
    activeRuns.delete(message.jobId);
    put('jobs', { id: message.jobId, tabId: sender.tab.id, startDate: message.startDate, endDate: message.endDate, status: cancelled ? 'cancelled' : message.error ? 'failed' : 'complete', error: message.error || '', summary: message.summary, updatedAt: new Date().toISOString() })
      .then(() => chrome.runtime.sendMessage({ type: 'EPAPER_DONE', ...message, cancelled }).catch(() => {}))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  handle(message).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  return true;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  cancelRunsExceptTab(tabId, 'Collection stopped because you switched tabs.').catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  cancelRunsForTab(tabId, 'Collection stopped because the ePaper tab was closed.', true).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !changeInfo.url.startsWith('https://epaper.prajavani.net/')) {
    cancelRunsForTab(tabId, 'Collection stopped because the ePaper tab navigated away.', true).catch(() => {});
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
