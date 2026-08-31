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

  async function authHeaders(signal) {
    throwIfAborted(signal);
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    let accessTypeToken = localStorage.getItem(ACCESS_TYPE_TOKEN_KEY);
    let fetchedAccessTypeToken = false;

    if (accessTypeToken && expired(accessTypeToken)) accessTypeToken = null;
    if (!accessTypeToken && accessToken && !expired(accessToken)) {
      const response = await fetch(`${SSO}/auth/accesstype-pv-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: '{}',
        signal,
      });
      if (response.ok) {
        accessTypeToken = (await response.json()).token || null;
        fetchedAccessTypeToken = Boolean(accessTypeToken);
      }
    }

    const headers = { Accept: 'application/json' };
    if (accessToken && !expired(accessToken)) headers.Authorization = `Bearer ${accessToken}`;
    if (accessTypeToken) headers['x-accesstype-jwt'] = accessTypeToken;
    headers['x-is-paid'] = String(sessionStorage.getItem('user_paid_status') === 'paid');

    return {
      headers,
      sessionDetected: Boolean(headers.Authorization),
      accessTypeDetected: Boolean(accessTypeToken),
      paid: headers['x-is-paid'] === 'true',
      fetchedAccessTypeToken,
    };
  }

  async function requestJson(url, headers, signal) {
    const response = await fetch(url, { headers, credentials: 'include', signal });
    let body = null;
    try {
      body = await response.json();
    } catch {
      // Keep the status useful even when an upstream response is not JSON.
    }
    return { response, body };
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
    const { response, body } = await requestJson(url, auth.headers, signal);
    const result = {
      editionNumber: String(edition.edition_number),
      name: edition.edition_name,
      shortCode: edition.edition_short_code,
      status: response.status,
      issueUrl: url,
    };
    if (!response.ok) {
      result.error = body?.message || `HTTP ${response.status}`;
      return result;
    }

    const issue = body?.data;
    if (!issue?.sections) {
      result.status = 'malformed';
      result.error = 'manifest has no sections';
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
      return result;
    }

    const articleResults = await mapLimit(articles, 4, async (article) => {
      const articleUrl = new URL(article.htmlFile, htmlBase).href;
      try {
        const articleResponse = await fetch(articleUrl, { credentials: 'omit', signal });
        if (!articleResponse.ok) {
          return { id: String(article.id), pageNo: article.pageNo, status: articleResponse.status };
        }
        return {
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
          ...parseArticle(await articleResponse.text(), articleUrl, includeRawHtml),
        };
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        return { id: String(article.id), pageNo: article.pageNo, status: 'failed', error: error.message };
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
    return result;
  }

  window.collectPrajavaniEpaper = async (
    date = new Date().toISOString().slice(0, 10),
    { fetchArticles = true, editionNumbers = null, includeRawHtml = false, onEdition = null, signal = null } = {},
  ) => {
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
    const results = await mapLimit(selectedEditions, 3, async (edition) => {
      const result = await collectIssue(edition, date, compact, auth, fetchArticles, includeRawHtml, signal);
      if (onEdition) await onEdition(result);
      return result;
    }, signal);
    return {
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
  };

  console.info('Loaded. Run: await collectPrajavaniEpaper("2026-08-31")');
})();
