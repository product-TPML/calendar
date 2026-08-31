#!/usr/bin/env node

const fs = require('fs');

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'epaper/cultural-event-candidates.json';

if (!inputPath) {
  console.error('Usage: node epaper/extract-cultural-events.js <shelf.json> [output.json]');
  process.exit(1);
}

const shelf = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const articles = shelf.stores?.articles || [];
const timePattern = /(?:ಬೆಳಿಗ್ಗೆ|ಬೆಳಗ್ಗೆ|ಮಧ್ಯಾಹ್ನ|ಸಂಜೆ|ರಾತ್ರಿ)\s*\.?\s*(\d{1,2})(?:[.:](\d{1,2}))?/gu;
const organizerPattern = /(?:ಆಯೋಜನೆ(?:\s+(?:ಮತ್ತು|ಹಾಗೂ))?)\s*[:;–-]\s*(.*?)(?=,?\s*(?:ಸ್ಥಳ|ಬೆಳಿಗ್ಗೆ|ಬೆಳಗ್ಗೆ|ಮಧ್ಯಾಹ್ನ|ಸಂಜೆ|ರಾತ್ರಿ)|$)/u;
const locationPattern = /(?:ಆಯೋಜನೆ\s*(?:ಮತ್ತು|ಹಾಗೂ)\s*)?ಸ್ಥಳ\s*[:;–-]\s*(.*?)(?=,?\s*(?:ಬೆಳಿಗ್ಗೆ|ಬೆಳಗ್ಗೆ|ಮಧ್ಯಾಹ್ನ|ಸಂಜೆ|ರಾತ್ರಿ)|$)/u;
const organizationSuffix = /(?:ಸಂಘ|ಸಂಸ್ಥೆ|ಟ್ರಸ್ಟ್|ವಿಭಾಗ|ಕಾಲೇಜು|ವಿಶ್ವವಿದ್ಯಾಲಯ|ಮಠ|ದೇವಸ್ಥಾನ|ಅಕಾಡೆಮಿ|ಸಮಿತಿ|ಪರಿಷತ್|ಇಲಾಖೆ|ಆಡಳಿತ|ಮಂಡಳಿ|ಆಶ್ರಮ|ಶಾಲೆ|ಕ್ಲಬ್|ಫೌಂಡೇಷನ್|ಬಳಗ|ವಿದ್ಯಾಲಯ)\s*$/u;
const categoryRules = [
  ['theatre', /(?:^|[\s,.;:–-])(?:ನಾಟಕ|ರಂಗಭೂಮಿ|ರಂಗಚಟುವಟಿಕೆ)/u],
  ['music', /(?:^|[\s,.;:–-])(?:ಸಂಗೀತ|ಗಾಯನ|ಭಜನೆ|ಕಛೇರಿ|ದಾಸವಾಣಿ|ವಾದನ)/u],
  ['dance', /(?:^|[\s,.;:–-])(?:ನೃತ್ಯ|ಯಕ್ಷಗಾನ)/u],
  ['literature', /(?:^|[\s,.;:–-])(?:ಸಾಹಿತ್ಯ|ಕವನ|ಪುಸ್ತಕ|ವಚನ|ಕಥಾಕೀರ್ತನ|ಉಪನ್ಯಾಸ)/u],
  ['exhibition', /(?:^|[\s,.;:–-])(?:ಪ್ರದರ್ಶನ|ವಸ್ತುಪ್ರದರ್ಶನ|ಚಿತ್ರಕಲಾ)/u],
  ['festival', /(?:^|[\s,.;:–-])(?:ಮಹೋತ್ಸವ|ಉತ್ಸವ|ಜಯಂತಿ|ಆರಾಧನೆ)/u],
  ['workshop', /(?:^|[\s,.;:–-])(?:ಕಾರ್ಯಾಗಾರ|ಶಿಬಿರ)/u],
  ['lecture', /(?:^|[\s,.;:–-])(?:ಉಪನ್ಯಾಸ|ವಿಚಾರಸಂಕಿರಣ|ಗೋಷ್ಠಿ)/u]
];

function clean(value) {
  return String(value || '').replace(/[\u200b-\u200f\ufeff]/gu, '').replace(/\s+/gu, ' ').replace(/^[,.;:–-]+|[,.;:–-]+$/gu, '').trim();
}

function cityForEdition(edition) {
  return clean(edition).replace(/\s+ನಗರ$/u, '');
}

function normalizeTime(prefix, hour, minute) {
  let value = Number(hour);
  const minutes = String(minute || '00').padStart(2, '0');
  if ((prefix === 'ಮಧ್ಯಾಹ್ನ' || prefix === 'ಸಂಜೆ') && value < 12) value += 12;
  if (prefix === 'ರಾತ್ರಿ' && value < 12) value += 12;
  if (prefix === 'ರಾತ್ರಿ' && value === 24) value = 0;
  return `${String(value).padStart(2, '0')}:${minutes}`;
}

function extractTimings(text) {
  const timings = [];
  for (const match of text.matchAll(timePattern)) {
    const prefix = match[0].match(/^(ಬೆಳಿಗ್ಗೆ|ಬೆಳಗ್ಗೆ|ಮಧ್ಯಾಹ್ನ|ಸಂಜೆ|ರಾತ್ರಿ)/u)?.[1] || '';
    timings.push({ raw: clean(match[0]), value: normalizeTime(prefix, match[1], match[2]) });
  }
  return timings;
}

function firstSentenceEnd(text) {
  const initialPattern = /^(?:[^\s.]{1,3}\.)+[^\s.]{1,3}$/u;
  for (const match of text.matchAll(/[.。](?=\s|$)/gu)) {
    const token = text.slice(0, match.index).split(/\s+/u).pop() || '';
    if (initialPattern.test(token) || /^(?:ಡಾ|ಪ್ರೊ|ಶ್ರೀ)$/u.test(token)) continue;
    return match.index;
  }
  return -1;
}

function extractTitle(entry) {
  const withoutLocation = entry.replace(locationPattern, '').trim();
  const firstTime = withoutLocation.search(/(?:ಬೆಳಿಗ್ಗೆ|ಬೆಳಗ್ಗೆ|ಮಧ್ಯಾಹ್ನ|ಸಂಜೆ|ರಾತ್ರಿ)/u);
  const lead = clean(firstTime >= 0 ? withoutLocation.slice(0, firstTime) : withoutLocation);
  if (!lead) return '';

  const firstColon = lead.search(/[:;]/u);
  if (firstColon < 0) return clean(lead.split(/\s*[.。]\s*/u)[0]);

  const left = clean(lead.slice(0, firstColon));
  const right = clean(lead.slice(firstColon + 1));
  const dash = left.search(/[–-]/u);
  if (dash > 0) return clean(left.slice(dash + 1));

  const looksLikeOrganizer = organizationSuffix.test(left);
  if (looksLikeOrganizer && right) {
    const firstSentence = firstSentenceEnd(right);
    return clean(firstSentence >= 0 ? right.slice(0, firstSentence) : right.split(/,\s*(?=[^,]+:)/u)[0]);
  }
  return left;
}

function extractOrganizer(entry) {
  const match = entry.match(organizerPattern);
  if (match) return clean(match[1]);

  const firstColon = entry.search(/[:;]/u);
  if (firstColon < 0) return null;
  const left = clean(entry.slice(0, firstColon));
  const dash = left.search(/[–-]/u);
  if (dash > 0 && organizationSuffix.test(left.slice(0, dash))) return clean(left.slice(0, dash));
  return organizationSuffix.test(left) ? left : null;
}

function extractLocation(entry) {
  const match = entry.match(locationPattern);
  return match ? clean(match[1]) : null;
}

function categoryFor(text) {
  return categoryRules.find(([, pattern]) => pattern.test(text))?.[0] || 'other';
}

function isHeading(line) {
  return !/[,:;–-]/u.test(line) && !/(ಬೆಳಿಗ್ಗೆ|ಬೆಳಗ್ಗೆ|ಮಧ್ಯಾಹ್ನ|ಸಂಜೆ|ರಾತ್ರಿ|ಸ್ಥಳ)/u.test(line);
}

const sourceArticles = articles.filter(article => article.title === 'ನಗರದಲ್ಲಿ ಇಂದು');
const records = [];

for (const article of sourceArticles) {
  const entries = String(article.bodyText || '')
    .split(/\r?\n/u)
    .map(clean)
    .filter(line => line && !isHeading(line));

  entries.forEach((entry, index) => {
    const timings = extractTimings(entry);
    const title = extractTitle(entry);
    const location = extractLocation(entry);
    const organizer = extractOrganizer(entry);
    const confidence = Math.round((0.25 + (title ? 0.25 : 0) + (location ? 0.25 : 0) + (timings.length ? 0.2 : 0) + (organizer ? 0.05 : 0)) * 100) / 100;

    records.push({
      id: `${article.id}:${index + 1}`,
      date: article.date,
      title,
      organizer,
      location,
      city: cityForEdition(article.editionName),
      category: categoryFor(entry),
      startTime: timings[0]?.value || null,
      endTime: null,
      timings,
      confidence,
      needsReview: timings.length > 1 || !title || !location,
      source: {
        articleId: article.id,
        edition: article.editionName,
        page: article.pageNo,
        articleUrl: article.articleHtmlUrl,
        siteUrl: article.siteUrl
      },
      rawText: entry
    });
  });
}

const output = {
  schemaVersion: 'cultural-event-candidates.v1',
  source: {
    exportedAt: shelf.exportedAt || null,
    articleCount: sourceArticles.length,
    entryCount: records.length,
    title: 'ನಗರದಲ್ಲಿ ಇಂದು'
  },
  records
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${records.length} event candidates from ${sourceArticles.length} articles to ${outputPath}`);
