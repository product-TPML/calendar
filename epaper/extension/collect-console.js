/*
 * Prajavani ePaper one-date collector.
 *
 * Run in the logged-in epaper.prajavani.net page console:
 *   await collectPrajavaniEpaper('2026-08-31')
 *
 * It returns JSON-safe data only. Session tokens are used in memory and never
 * included in the returned result or persisted by this script.
 */
(() => {
  const API = 'https://api-epaper-prod.deccanherald.com';
  const SSO = 'https://sso.tpml.in';
  const PUBLISHER = 'PV';
  const ACCESS_TOKEN_KEY = 'epaperOwnAccessToken';
  const ACCESS_TYPE_TOKEN_KEY = 'jwt_token';
  const REQUEST_TIMEOUT_MS = 30000;
  const LOG_PREFIX = '[Prajavani collector]';

  const log = (event, details = {}) => console.info(LOG_PREFIX, event, details);
  const trace = (event, details = {}) => console.debug(LOG_PREFIX, event, details);
  const warn = (event, details = {}) => console.warn(LOG_PREFIX, event, details);

  function errorDetails(error) {
    return {
      name: error?.name || typeof error,
      message: error?.message || String(error),
      code: error?.code,
    };
  }

  function safeUrl(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return '[invalid URL]';
    }
  }

  function compactDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('date must use YYYY-MM-DD');
    }
    const value = date.replaceAll('-', '');
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error(`invalid date: ${date}`);
    }
    return value;
  }

  function expired(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp ? payload.exp * 1000 <= Date.now() : true;
    } catch {
      return true;
    }
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) throw new DOMException('Collection stopped', 'AbortError');
  }

  async function fetchWithTimeout(url, options, signal, consume = (response) => response) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason || new DOMException('Collection stopped', 'AbortError'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, 'TimeoutError')), REQUEST_TIMEOUT_MS);
    const startedAt = performance.now();
    trace('request:start', { url: safeUrl(url) });
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const result = await consume(response);
      trace('request:complete', { url: safeUrl(url), status: response.status, durationMs: Math.round(performance.now() - startedAt) });
      return result;
    } catch (error) {
      warn('request:error', { url: safeUrl(url), ...errorDetails(error), durationMs: Math.round(performance.now() - startedAt) });
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  async function authHeaders(signal) {
    throwIfAborted(signal);
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    let accessTypeToken = localStorage.getItem(ACCESS_TYPE_TOKEN_KEY);
    let fetchedAccessTypeToken = false;

    if (accessTypeToken && expired(accessTypeToken)) accessTypeToken = null;
    if (!accessTypeToken && accessToken && !expired(accessToken)) {
      const result = await fetchWithTimeout(`${SSO}/auth/accesstype-pv-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: '{}',
        signal,
      }, signal, async (response) => ({ response, body: response.ok ? await response.json() : null }));
      const response = result.response;
      if (response.ok) {
        accessTypeToken = result.body?.token || null;
        fetchedAccessTypeToken = Boolean(accessTypeToken);
      }
    }

    const headers = { Accept: 'application/json' };
    if (accessToken && !expired(accessToken)) headers.Authorization = `Bearer ${accessToken}`;
    if (accessTypeToken) headers['x-accesstype-jwt'] = accessTypeToken;
    headers['x-is-paid'] = String(sessionStorage.getItem('user_paid_status') === 'paid');

    const result = {
      headers,
      sessionDetected: Boolean(headers.Authorization),
      accessTypeDetected: Boolean(accessTypeToken),
      paid: headers['x-is-paid'] === 'true',
      fetchedAccessTypeToken,
    };
    log('auth:ready', {
      sessionDetected: result.sessionDetected,
      accessTypeDetected: result.accessTypeDetected,
      paid: result.paid,
      fetchedAccessTypeToken,
    });
    return result;
  }

  async function requestJson(url, headers, signal) {
    return fetchWithTimeout(url, { headers, credentials: 'include' }, signal, async (response) => {
      let body = null;
      trace('json:parse-start', { url: safeUrl(url) });
      try {
        body = await response.json();
        trace('json:parse-complete', { url: safeUrl(url) });
      } catch (error) {
        if (['AbortError', 'TimeoutError'].includes(error.name)) throw error;
        warn('json:parse-failed', { url: safeUrl(url), status: response.status });
      }
      return { response, body };
    });
  }

  function parseArticle(html, articleUrl, includeRawHtml) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const text = (selector) => document.querySelector(selector)?.textContent.trim() || '';
    const bodyText = [...document.querySelectorAll('.bodytext p')]
      .map((paragraph) => paragraph.textContent.trim())
      .filter(Boolean)
      .join('\n');
    const imageUrls = [...document.querySelectorAll('.pictures img')]
      .map((image) => image.getAttribute('src'))
      .filter(Boolean)
      .map((src) => new URL(src, articleUrl).href);

    const result = {
      title: text('h1'),
      kicker: text('h3'),
      bodyText,
      imageUrls,
      extraction: bodyText || text('h1') ? 'text' : imageUrls.length ? 'image-only' : 'empty',
    };
    if (includeRawHtml) result.rawHtml = html;
    return result;
  }

  async function mapLimit(items, limit, worker, signal) {
    const results = [];
    let next = 0;
    async function consume() {
      while (next < items.length) {
        throwIfAborted(signal);
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
    return results;
  }

  async function collectIssue(edition, date, compact, auth, fetchArticles, includeRawHtml, signal) {
    const url = `${API}/epaper/data?date=${compact}&edition=${edition.edition_number}&publisher=${PUBLISHER}`;
    const startedAt = performance.now();
    log('edition:start', { date, edition: edition.edition_number, name: edition.edition_name });
    let response;
    let body;
    try {
      ({ response, body } = await requestJson(url, auth.headers, signal));
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      warn('edition:manifest-error', { date, edition: edition.edition_number, error: error.message, durationMs: Math.round(performance.now() - startedAt) });
      return {
        editionNumber: String(edition.edition_number),
        name: edition.edition_name,
        shortCode: edition.edition_short_code,
        status: 'failed',
        issueUrl: url,
        error: error.message,
      };
    }
    const result = {
      editionNumber: String(edition.edition_number),
      name: edition.edition_name,
      shortCode: edition.edition_short_code,
      status: response.status,
      issueUrl: url,
    };
    if (!response.ok) {
      result.error = body?.message || `HTTP ${response.status}`;
      warn('edition:manifest-failed', { date, edition: edition.edition_number, status: response.status, error: result.error });
      return result;
    }

    const issue = body?.data;
    if (!issue?.sections) {
      result.status = 'malformed';
      result.error = 'manifest has no sections';
      warn('edition:manifest-malformed', { date, edition: edition.edition_number, error: result.error });
      return result;
    }

    const pages = issue.sections.flatMap((section) => section.pages || []);
    const articles = pages.flatMap((page) => (page.articles || []).map((article) => ({
      ...article,
      pageId: String(page.id),
      pageNo: page.pageNo,
      absPageNo: page.absPageNo,
      displayName: page.displayName,
      sectionName: page.sectionName,
    })));
    result.pageRecords = pages.map((page) => ({
      id: String(page.id),
      name: page.name,
      sectionName: page.sectionName,
      pageNo: page.pageNo,
      displayName: page.displayName,
      absPageNo: page.absPageNo,
      width: page.width,
      height: page.height,
      imageUrl: page.imgFile ? new URL(page.imgFile, body.data_url_suffix).href : '',
      thumbnailUrl: page.imgThumbFile ? new URL(page.imgThumbFile, body.data_url_suffix).href : '',
      pdfUrl: page.pdfFile ? new URL(page.pdfFile, body.data_url_suffix).href : '',
      articleCount: page.articles?.length || 0,
    }));
    const htmlBase = body.html_url_suffix;
    if (!htmlBase) {
      result.status = 'malformed';
      result.error = 'manifest has no html_url_suffix';
      warn('edition:manifest-malformed', { date, edition: edition.edition_number, error: result.error });
      return result;
    }
    if (!fetchArticles) {
      result.status = 'ok';
      result.date = String(issue.pubDate);
      result.pages = pages.length;
      result.pagesWithArticles = pages.filter((page) => page.articles?.length).length;
      result.pagesWithoutArticles = pages.filter((page) => !page.articles?.length).length;
      result.structuredArticles = articles.length;
      result.articleFetch = 'skipped';
      log('edition:complete', { date, edition: edition.edition_number, status: result.status, articles: result.structuredArticles, durationMs: Math.round(performance.now() - startedAt) });
      return result;
    }

    log('articles:start', { date, edition: edition.edition_number, count: articles.length });
    const articleResults = await mapLimit(articles, 4, async (article) => {
      const articleUrl = new URL(article.htmlFile, htmlBase).href;
      trace('article:start', { date, edition: edition.edition_number, article: article.id, page: article.pageNo });
      try {
        const credentials = new URL(articleUrl).origin === location.origin ? 'include' : 'omit';
        const fetched = await fetchWithTimeout(articleUrl, { credentials }, signal, async (response) => ({
          response,
          html: response.ok ? await response.text() : null,
        }));
        const articleResponse = fetched.response;
        if (!articleResponse.ok) {
          warn('article:http-failed', { date, edition: edition.edition_number, article: article.id, status: articleResponse.status });
          return { id: String(article.id), pageNo: article.pageNo, status: articleResponse.status };
        }
        const result = {
          id: String(article.id),
          pageId: article.pageId,
          contentElementId: article.contentElementId,
          sectionName: article.sectionName,
          displayName: article.displayName,
          pageNo: article.pageNo,
          absPageNo: article.absPageNo,
          placement: {
            top: article.top,
            left: article.left,
            width: article.width,
            height: article.height,
          },
          articleHtmlUrl: articleUrl,
          siteUrl: `https://epaper.prajavani.net/article/${article.id}?date=${date}&edition_No=${edition.edition_number}&pageNumber=${article.absPageNo || article.pageNo}`,
          status: articleResponse.status,
          ...parseArticle(fetched.html, articleUrl, includeRawHtml),
        };
        trace('article:complete', { date, edition: edition.edition_number, article: article.id, status: result.status, extraction: result.extraction });
        return result;
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        warn('article:failed', { date, edition: edition.edition_number, article: article.id, ...errorDetails(error) });
        return { id: String(article.id), pageNo: article.pageNo, status: 'failed', error: errorDetails(error).message };
      }
    }, signal);

    result.status = 'ok';
    result.date = String(issue.pubDate);
    result.pages = pages.length;
    result.pagesWithArticles = pages.filter((page) => page.articles?.length).length;
    result.pagesWithoutArticles = pages.filter((page) => !page.articles?.length).length;
    result.structuredArticles = articles.length;
    result.articleResults = articleResults;
    result.textArticles = articleResults.filter((article) => article.extraction === 'text').length;
    result.imageOnlyArticles = articleResults.filter((article) => article.extraction === 'image-only').length;
    result.emptyArticles = articleResults.filter((article) => article.extraction === 'empty').length;
    result.failedArticles = articleResults.filter((article) => article.status !== 200).length;
    log('edition:complete', {
      date,
      edition: edition.edition_number,
      status: result.status,
      articles: articles.length,
      fetched: articleResults.length - result.failedArticles,
      failed: result.failedArticles,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return result;
  }

  window.collectPrajavaniEpaper = async (
    date = new Date().toISOString().slice(0, 10),
    { fetchArticles = true, editionNumbers = null, includeRawHtml = false, onEdition = null, signal = null } = {},
  ) => {
    const startedAt = performance.now();
    log('date:start', { date, editionNumbers, fetchArticles });
    const compact = compactDate(date);
    const auth = await authHeaders(signal);
    const editionsResponse = await requestJson(`${API}/epaper/editions?publisher=${PUBLISHER}`, auth.headers, signal);
    if (!editionsResponse.response.ok) {
      throw new Error(`edition list failed: HTTP ${editionsResponse.response.status}`);
    }

    const editions = editionsResponse.body?.flatMap((group) => group.editions || []) || [];
    const selectedEditions = editionNumbers
      ? editions.filter((edition) => editionNumbers.map(String).includes(String(edition.edition_number)))
      : editions;
    log('date:editions-ready', { date, available: editions.length, selected: selectedEditions.length });
    const results = await mapLimit(selectedEditions, 3, async (edition) => {
      const result = await collectIssue(edition, date, compact, auth, fetchArticles, includeRawHtml, signal);
      if (onEdition) await onEdition(result);
      return result;
    }, signal);
    const report = {
      date,
      publisher: PUBLISHER,
      collectedAt: new Date().toISOString(),
      auth: {
        sessionDetected: auth.sessionDetected,
        accessTypeDetected: auth.accessTypeDetected,
        paid: auth.paid,
        fetchedAccessTypeToken: auth.fetchedAccessTypeToken,
        tokenValuesReturned: false,
      },
      editions: results,
      summary: {
        total: results.length,
        accessible: results.filter((result) => result.status === 'ok').length,
        forbidden: results.filter((result) => result.status === 403).length,
        otherFailures: results.filter((result) => !['ok', 403].includes(result.status)).length,
        structuredArticles: results.reduce((sum, result) => sum + (result.structuredArticles || 0), 0),
        textArticles: results.reduce((sum, result) => sum + (result.textArticles || 0), 0),
        imageOnlyArticles: results.reduce((sum, result) => sum + (result.imageOnlyArticles || 0), 0),
      },
    };
    log('date:complete', { date, total: report.summary.total, accessible: report.summary.accessible, durationMs: Math.round(performance.now() - startedAt) });
    return report;
  };

  console.info('Loaded. Run: await collectPrajavaniEpaper("2026-08-31")');
})();
