// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { parseRelativeTimestamp } from '../scan-utils.mjs';

const DEFAULT_SEARCH_URLS = [
  'https://www.eluta.ca/Software-Developer-jobs',
  'https://www.eluta.ca/Software-Engineer-jobs',
  'https://www.eluta.ca/Full-Stack-Developer-jobs',
  'https://www.eluta.ca/Web-Developer-jobs',
  'https://www.eluta.ca/Java-Developer-jobs',
  'https://www.eluta.ca/Python-Developer-jobs',
  'https://www.eluta.ca/Entry-Level-Software-Developer-jobs',
];

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteElutaUrl(value) {
  if (!value) return '';
  try {
    return new URL(value, 'https://www.eluta.ca/').toString();
  } catch {
    return '';
  }
}

function extractEmployerHost(block) {
  const cache = block.match(/cache\?u=\d+:([^'")\s]+)/);
  return cache ? decodeHtml(cache[1]) : '';
}

function extractDirectApplyUrl(block) {
  const cache = block.match(/cache\?u=\d+:([^'")\s]+)/);
  if (!cache) return '';
  const value = decodeHtml(cache[1]);
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(value)) return `https://${value}`;
  return '';
}

function blockToText(block) {
  return decodeHtml(block)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|span)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(line => !/^save|^apply|^share$/i.test(line))
    .join('\n')
    .slice(0, 6000);
}

function parseElutaJobs(html, sourceUrl, now = new Date()) {
  const jobs = [];
  const blocks = html.match(/<div[^>]+class="[^"]*organic-job[^"]*"[\s\S]*?(?=<div[^>]+class="[^"]*organic-job|\s*<\/div>\s*<\/div>\s*<\/div>|$)/gi) || [];

  for (const block of blocks) {
    const titleMatch = block.match(/<a[^>]+class="[^"]*lk-job-title[^"]*"[^>]*title="([^"]+)"[^>]*>/i)
      || block.match(/<a[^>]+class="[^"]*lk-job-title[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const urlMatch = block.match(/data-url="([^"]+)"/i);
    const employerMatch = block.match(/class="[^"]*lk-employer[^"]*"[^>]*title="See all jobs at ([^"]+)"/i)
      || block.match(/<a[^>]+class="[^"]*lk-employer[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const locationMatch = block.match(/<span class="location">\s*<span>([\s\S]*?)<\/span>/i);
    const lastSeenMatch = block.match(/class="[^"]*lastseen[^"]*"[\s\S]*?>([^<]+)<\/a>/i);

    const title = decodeHtml(titleMatch?.[1] || '');
    const url = absoluteElutaUrl(urlMatch?.[1] || '');
    if (!title || !url) continue;

    const relativeTime = decodeHtml(lastSeenMatch?.[1] || '');
    const postedAt = parseRelativeTimestamp(relativeTime, now);
    const employerHost = extractEmployerHost(block);
    const directApplyUrl = extractDirectApplyUrl(block);
    const description = blockToText(block);

    jobs.push({
      title,
      url,
      company: decodeHtml(employerMatch?.[1] || 'Eluta result'),
      location: decodeHtml(locationMatch?.[1] || 'Canada'),
      description,
      postedAt,
      directApplyUrl: directApplyUrl || url,
      sourceType: 'eluta',
      sourceName: 'Eluta',
      recencyConfidence: postedAt ? 'exact' : 'unknown',
      employerHost,
      sourceSearchUrl: sourceUrl,
    });
  }

  return jobs;
}

/** @type {Provider} */
export default {
  id: 'eluta',

  detect(entry) {
    if (entry.provider === 'eluta') return { url: entry.careers_url || 'https://www.eluta.ca' };
    return null;
  },

  async fetch(entry, ctx) {
    const urls = Array.isArray(entry.search_urls) && entry.search_urls.length > 0
      ? entry.search_urls
      : DEFAULT_SEARCH_URLS;
    const seen = new Set();
    const jobs = [];
    const now = new Date();

    for (const url of urls) {
      const html = await ctx.fetchText(url);
      for (const job of parseElutaJobs(html, url, now)) {
        const key = job.url.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push(job);
      }
    }

    return jobs;
  },
};

export { parseElutaJobs };
