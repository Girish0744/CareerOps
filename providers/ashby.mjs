// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Ashby provider — hits the public posting-api endpoint.
// Auto-detects from careers_url pattern `https://jobs.ashbyhq.com/<slug>`.

function resolveApiUrl(entry) {
  const url = entry.careers_url || '';
  const match = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (!match) return null;
  return `https://api.ashbyhq.com/posting-api/job-board/${match[1]}?includeCompensation=true`;
}

/** @type {Provider} */
export default {
  id: 'ashby',

  detect(entry) {
    const apiUrl = resolveApiUrl(entry);
    return apiUrl ? { url: apiUrl } : null;
  },

  async fetch(entry, ctx) {
    const apiUrl = resolveApiUrl(entry);
    if (!apiUrl) throw new Error(`ashby: cannot derive API URL for ${entry.name}`);
    const json = await ctx.fetchJson(apiUrl);
    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs.map(j => {
      const secondaryLocations = Array.isArray(j.secondaryLocations)
        ? j.secondaryLocations.map(loc => loc?.location).filter(Boolean)
        : [];
      const locations = [j.location, ...secondaryLocations].filter(Boolean);
      return {
        title: j.title || '',
        url: j.jobUrl || '',
        company: entry.name,
        location: [...new Set(locations)].join(' / '),
        postedAt: j.publishedAt || null,
        directApplyUrl: j.applyUrl || j.jobUrl || '',
        sourceType: 'ashby',
        sourceName: 'Ashby',
        recencyConfidence: j.publishedAt ? 'exact' : 'unknown',
      };
    });
  },
};
