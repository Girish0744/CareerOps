interface ExtractedJobDescription {
  text: string;
  source: 'structured' | 'html';
}

export class JobDescriptionExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobDescriptionExtractionError';
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '\n');
}

function isBoilerplateLine(line: string): boolean {
  const lower = line.toLowerCase();
  return [
    'equal opportunity employer',
    'eeo',
    'accommodation',
    'privacy policy',
    'applicant tracking system',
    'ats applicant tracking system',
    'hiring decisions',
    'if you are excited about this role',
    'do not meet all the qualifications',
    'all qualified applicants',
    'race, color, religion',
    'protected veteran',
    'reasonable accommodation',
    'background check',
    'terms of use',
    'cookie',
  ].some(pattern => lower.includes(pattern));
}

export function normalizeJobDescriptionText(raw: string): string {
  const text = htmlToText(raw);
  const seen = new Set<string>();
  const lines = text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(line => !isBoilerplateLine(line))
    .filter(line => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return lines.join('\n').slice(0, 16000).trim();
}

function blockedPageReason(text: string): string | null {
  const lower = text.toLowerCase();
  const signals = [
    'user verification',
    'verify you are human',
    'are you a human',
    'unusual requests',
    'recaptcha',
    'captcha',
    'javascript is required by the recaptcha',
    'you will be unable to access eluta',
    'complete the challenge',
  ];

  if (signals.some(signal => lower.includes(signal))) {
    return 'The URL returned a human-verification or captcha page instead of a job posting.';
  }

  return null;
}

export function assertUsableJobDescription(text: string): void {
  const reason = blockedPageReason(text);
  if (reason) throw new JobDescriptionExtractionError(reason);
}

function formatStructuredJob(fields: {
  company?: string;
  title?: string;
  location?: string;
  description?: string;
  url?: string;
}): string {
  return normalizeJobDescriptionText([
    fields.company ? `Company: ${fields.company}` : '',
    fields.title ? `Job Title: ${fields.title}` : '',
    fields.location ? `Location: ${fields.location}` : '',
    fields.url ? `URL: ${fields.url}` : '',
    '',
    fields.description ?? '',
  ].filter(Boolean).join('\n'));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; career-ops/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch structured job data: ${res.status}`);
  return res.json();
}

async function tryGreenhouse(url: URL): Promise<string | null> {
  if (!/greenhouse\.io$/.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const jobIndex = parts.findIndex(p => p === 'jobs');
  const board = jobIndex > 0 ? parts[jobIndex - 1] : parts[0];
  const jobId = jobIndex >= 0 ? parts[jobIndex + 1] : null;
  if (!board || !jobId) return null;

  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`);
  const jobs = (data as { jobs?: Array<Record<string, unknown>> }).jobs ?? [];
  const job = jobs.find(j => String(j.id ?? '') === jobId || String(j.absolute_url ?? '').includes(jobId));
  if (!job) return null;

  const location = (job.location as { name?: string } | undefined)?.name;
  return formatStructuredJob({
    company: board,
    title: String(job.title ?? ''),
    location,
    description: String(job.content ?? ''),
    url: String(job.absolute_url ?? url.href),
  });
}

async function tryAshby(url: URL): Promise<string | null> {
  if (url.hostname !== 'jobs.ashbyhq.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const board = parts[0];
  if (!board) return null;

  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`);
  const jobs = (data as { jobs?: Array<Record<string, unknown>> }).jobs ?? [];
  const job = jobs.find(j => String(j.jobUrl ?? '') === url.href || String(j.jobUrl ?? '').startsWith(url.href));
  if (!job) return null;

  return formatStructuredJob({
    company: board,
    title: String(job.title ?? ''),
    location: String(job.location ?? ''),
    description: String(job.descriptionHtml ?? job.descriptionPlain ?? job.description ?? ''),
    url: String(job.jobUrl ?? url.href),
  });
}

async function tryLever(url: URL): Promise<string | null> {
  if (url.hostname !== 'jobs.lever.co') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const company = parts[0];
  if (!company) return null;

  const data = await fetchJson(`https://api.lever.co/v0/postings/${company}?mode=json`);
  const jobs = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  const job = jobs.find(j => String(j.hostedUrl ?? '') === url.href || String(j.hostedUrl ?? '').startsWith(url.href));
  if (!job) return null;
  const lists = Array.isArray(job.lists)
    ? (job.lists as Array<{ text?: string; content?: string }>).map(l => `${l.text ?? ''}\n${l.content ?? ''}`).join('\n')
    : '';

  return formatStructuredJob({
    company,
    title: String(job.text ?? ''),
    location: String((job.categories as { location?: string } | undefined)?.location ?? ''),
    description: [job.descriptionPlain, lists].filter(Boolean).join('\n'),
    url: String(job.hostedUrl ?? url.href),
  });
}

export async function extractJobDescriptionFromUrl(rawUrl: string): Promise<ExtractedJobDescription> {
  const url = new URL(rawUrl);

  for (const extractor of [tryGreenhouse, tryAshby, tryLever]) {
    try {
      const structured = await extractor(url);
      if (structured && structured.length > 500) {
        return { text: structured, source: 'structured' };
      }
    } catch {
      // Fall through to plain HTML extraction.
    }
  }

  const res = await fetch(url.href, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; career-ops/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
  const html = await res.text();
  const text = normalizeJobDescriptionText(html);
  assertUsableJobDescription(text);
  return { text, source: 'html' };
}
