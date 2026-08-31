const DB_NAME = 'prajavani-epaper';
const DB_VERSION = 1;
const STORES = ['editions', 'issues', 'pages', 'articles', 'jobs'];

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

function issueKey(date, editionNumber) {
  return `PV:${date}:${editionNumber}`;
}

async function saveEdition(jobId, date, edition) {
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
  await putMany('articles', (edition.articleResults || [])
    .filter((article) => article.status === 200)
    .map((article) => ({
      ...article,
      key: `${key}:${article.id}`,
      issueKey: key,
      editionNumber: number,
      editionName: edition.name,
      date,
    })));
  await put('jobs', {
    id: jobId,
    date,
    status: 'running',
    updatedAt: new Date().toISOString(),
    lastEdition: number,
  });
  chrome.runtime.sendMessage({
    type: 'EPAPER_PROGRESS',
    jobId,
    edition: {
      number,
      name: edition.name,
      status: edition.status,
      structuredArticles: edition.structuredArticles || 0,
      textArticles: edition.textArticles || 0,
      imageOnlyArticles: edition.imageOnlyArticles || 0,
    },
  }).catch(() => {});
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0];
}

async function startCrawl(message) {
  const jobId = crypto.randomUUID();
  await put('jobs', { id: jobId, date: message.date, status: 'starting', updatedAt: new Date().toISOString() });
  chrome.tabs.sendMessage(message.tabId, {
    type: 'START_COLLECT',
    jobId,
    date: message.date,
    editionNumbers: message.editionNumbers,
  }).catch(async (error) => {
    await put('jobs', { id: jobId, date: message.date, status: 'failed', error: error.message, updatedAt: new Date().toISOString() });
    chrome.runtime.sendMessage({ type: 'EPAPER_DONE', jobId, error: error.message }).catch(() => {});
  });
  return { accepted: true, jobId };
}

async function handle(message) {
  if (message.type === 'GET_STATS') {
    const [issues, articles, jobs] = await Promise.all([all('issues'), all('articles'), all('jobs')]);
    return { issues, articleCount: articles.length, jobs };
  }
  if (message.type === 'GET_ARTICLES') return all('articles');
  if (message.type === 'CLEAR_DATA') {
    await clearAll();
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
    const articles = await all('articles');
    if (!query) return articles.slice(0, 100).map(searchResult);
    return articles.filter((article) => searchable(article).includes(query)).slice(0, 100).map(searchResult);
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
    saveEdition(message.jobId, message.date, message.edition)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === 'COLLECT_DONE' && sender.tab?.id) {
    put('jobs', { id: message.jobId, date: message.date, status: message.error ? 'failed' : 'complete', error: message.error || '', summary: message.summary, updatedAt: new Date().toISOString() })
      .then(() => chrome.runtime.sendMessage({ type: 'EPAPER_DONE', ...message }).catch(() => {}))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  handle(message).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  return true;
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
