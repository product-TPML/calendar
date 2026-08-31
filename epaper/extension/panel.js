const state = { editions: [], selected: new Set(), totalSelected: 0, completed: 0 };

const $ = (id) => document.getElementById(id);
const send = (message) => chrome.runtime.sendMessage(message);

function showError(message) {
  const element = $('error');
  element.textContent = message || '';
  element.hidden = !message;
}

function renderEditions() {
  const container = $('editions');
  container.replaceChildren();
  if (!state.editions.length) {
    container.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'No editions loaded.' }));
    return;
  }
  state.editions.forEach((edition) => {
    const label = document.createElement('label');
    label.className = 'edition-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = edition.edition_number;
    checkbox.checked = state.selected.has(String(edition.edition_number));
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(checkbox.value);
      else state.selected.delete(checkbox.value);
      updateCollectButton();
    });
    const name = document.createElement('span');
    name.textContent = edition.edition_name;
    label.append(checkbox, name);
    container.append(label);
  });
  updateCollectButton();
}

function updateCollectButton() {
  $('collect').disabled = !state.selected.size;
  $('collect').textContent = state.selected.size
    ? `Extract ${state.selected.size} edition${state.selected.size === 1 ? '' : 's'}`
    : 'Select an edition';
}

function selectEditions(predicate) {
  state.selected = new Set(state.editions.filter(predicate).map((edition) => String(edition.edition_number)));
  renderEditions();
}

function renderProgress(edition) {
  if ($('progress-list').querySelector('.muted')) $('progress-list').replaceChildren();
  const row = document.createElement('div');
  row.className = `progress-row${edition.status !== 'ok' ? ' failed' : ''}`;
  const name = document.createElement('span');
  name.textContent = edition.name;
  const status = document.createElement('span');
  status.textContent = edition.status === 'ok' ? `${edition.textArticles + edition.imageOnlyArticles} articles` : edition.status;
  row.append(name, status);
  $('progress-list').prepend(row);
  state.completed += 1;
  $('progress-count').textContent = `${state.completed}/${state.totalSelected}`;
  $('progress-bar').style.width = `${Math.round((state.completed / state.totalSelected) * 100)}%`;
}

function renderResults(results) {
  const container = $('results');
  container.replaceChildren();
  if (!results.length) {
    container.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'No matching articles.' }));
    return;
  }
  results.forEach((article) => {
    const item = document.createElement('article');
    item.className = 'result';
    const heading = document.createElement('h3');
    if (article.siteUrl) {
      const link = document.createElement('a');
      link.href = article.siteUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = article.title;
      heading.append(link);
    } else heading.textContent = article.title;
    const meta = document.createElement('div');
    meta.className = 'result-meta';
    meta.textContent = [article.date, article.editionName, article.displayName, article.extraction].filter(Boolean).join(' · ');
    const preview = document.createElement('div');
    preview.className = 'result-preview';
    preview.textContent = article.bodyText || article.kicker || 'No searchable text';
    item.append(heading, meta, preview);
    container.append(item);
  });
}

async function loadEditions() {
  const response = await send({ type: 'GET_EDITIONS' });
  if (response?.error) throw new Error(response.error);
  state.editions = response?.editions || [];
  state.selected = new Set(state.editions.map((edition) => String(edition.edition_number)));
  $('edition-count').textContent = `${state.editions.length} editions`;
  renderEditions();
  $('auth-status').textContent = 'Session ready';
}

async function loadStats() {
  const stats = await send({ type: 'GET_STATS' });
  $('article-count').textContent = `${stats?.articleCount || 0} articles`;
}

async function search() {
  const results = await send({ type: 'SEARCH', query: $('search').value });
  renderResults(Array.isArray(results) ? results : []);
}

async function startCollection() {
  showError('');
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url?.startsWith('https://epaper.prajavani.net/')) {
    showError('Open the logged-in Prajavani ePaper tab before collecting.');
    return;
  }
  state.totalSelected = state.selected.size;
  state.completed = 0;
  $('progress-title').textContent = `Collecting ${$('date').value}`;
  $('progress-count').textContent = `0/${state.totalSelected}`;
  $('progress-bar').style.width = '0%';
  $('progress-list').replaceChildren();
  const response = await send({
    type: 'START_CRAWL',
    tabId: tab.id,
    date: $('date').value,
    editionNumbers: [...state.selected],
  });
  if (response?.error) showError(response.error);
  else $('collection-note').textContent = `Job ${response.jobId} started. Keep the ePaper tab open.`;
}

$('date').value = new Date().toISOString().slice(0, 10);
$('select-all').addEventListener('click', () => selectEditions(() => true));
$('select-bengaluru').addEventListener('click', () => selectEditions((edition) => edition.edition_number === 4));
$('select-none').addEventListener('click', () => selectEditions(() => false));
$('collect').addEventListener('click', () => startCollection().catch((error) => showError(error.message)));
$('search').addEventListener('input', () => search().catch((error) => showError(error.message)));
$('clear').addEventListener('click', async () => {
  if (!confirm('Delete all locally collected ePaper articles?')) return;
  await send({ type: 'CLEAR_DATA' });
  renderResults([]);
  await loadStats();
});
$('export').addEventListener('click', async () => {
  const articles = await send({ type: 'GET_ARTICLES' });
  const blob = new Blob([JSON.stringify(articles, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `prajavani-epaper-${$('date').value || 'export'}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'EPAPER_PROGRESS') renderProgress(message.edition);
  if (message.type === 'EPAPER_DONE') {
    $('progress-title').textContent = message.error ? 'Collection failed' : 'Collection complete';
    if (message.error) showError(message.error);
    loadStats().catch((error) => showError(error.message));
    search().catch((error) => showError(error.message));
  }
});

Promise.all([loadEditions(), loadStats()]).catch((error) => {
  $('auth-status').textContent = 'Open ePaper tab';
  showError(error.message);
});
