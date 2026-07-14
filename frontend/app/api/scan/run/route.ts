import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { generateGeminiContent } from '@/lib/ai-config';
import { apiErrorMessage } from '@/lib/errors';
import { getScoredQueue, saveScoredQueue, type ScoredJob } from '@/lib/filesystem';

// Eluta requests are paced ~2-3s apart (anti-throttling), and the referral
// employer pages add ~18 URLs, so a full scan can take 3-4 minutes.
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');
const SCAN_JSON_MARKER = '__CAREER_OPS_SCAN_JSON__';
const HOUR_MS = 60 * 60 * 1000;

type RolePriority = NonNullable<ScoredJob['rolePriority']>;

const ROLE_PRIORITY_RANK: Record<RolePriority, number> = {
  full_time_new_grad: 0,
  full_time_entry: 1,
  full_time_general: 2,
  intern_coop: 3,
  stretch: 4,
  skip: 5,
};

interface ScanOffer {
  title: string;
  url: string;
  company: string;
  location?: string | null;
  description?: string | null;
  source?: string | null;
  sourceType?: string | null;
  sourceName?: string | null;
  sourceSearchUrl?: string | null;
  employerHost?: string | null;
  directApplyUrl?: string | null;
  postedAt?: string | null;
  postedAgeHours?: number | null;
  freshnessBucket?: ScoredJob['freshnessBucket'];
  rolePriority?: ScoredJob['rolePriority'];
  employmentType?: string | null;
  freshnessWindowHours?: number;
  recencyConfidence?: ScoredJob['recencyConfidence'];
}

interface ScanJson {
  date: string;
  summary: Record<string, number>;
  offers: ScanOffer[];
  errors: Array<{ company: string; error: string }>;
}

interface QuickScore {
  id: string;
  score: number;
  fitLevel: string;
  recommendation: string;
  summary: string;
  matched: string[];
  gaps: string[];
}

function readRoot(rel: string): string {
  const p = path.join(/*turbopackIgnore: true*/ ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function idForOffer(offer: ScanOffer): string {
  const key = `${offer.url || ''}|${offer.company}|${offer.title}|${offer.location ?? ''}`;
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

function fitLevelForScore(score: number): string {
  if (score >= 85) return 'Strong Apply';
  if (score >= 70) return 'Apply';
  if (score >= 50) return 'Maybe';
  return 'Skip';
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function postedAgeHours(value?: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const hours = Math.max(0, (Date.now() - time) / HOUR_MS);
  return Math.round(hours * 10) / 10;
}

function freshnessBucket(postedAt?: string | null, firstSeenAt?: string | null): ScoredJob['freshnessBucket'] {
  const age = postedAgeHours(postedAt ?? firstSeenAt);
  if (age == null) return 'unknown';
  if (age <= 24) return '24h';
  if (age <= 72) return '72h';
  if (age <= 168) return '7d';
  return 'older';
}

function classifyRolePriority(title: string, location?: string | null): RolePriority {
  const text = `${title} ${location ?? ''}`.toLowerCase();
  if (/\b(senior|sr\.?|staff|principal|director|manager|lead|architect|vice president|avp)\b/.test(text)) return 'stretch';
  if (/\b(intern|internship|co-?op|co op)\b/.test(text)) return 'intern_coop';
  if (/\b(new grad|new graduate|graduate program|university graduate|early career|campus)\b/.test(text)) return 'full_time_new_grad';
  if (/\b(entry level|entry-level|junior|jr\.)\b/.test(text)) return 'full_time_entry';
  if (/\b(software developer|software engineer|software development engineer|full[ -]?stack|frontend|front end|backend|back end|application developer|web developer|java developer|python developer|\.net developer|ai application|applied ai|machine learning|data analyst|business analyst|systems analyst|system analyst|it analyst|qa analyst|quality assurance|software tester|test analyst|it help desk|help desk|it technician|technical support|support analyst|application support)\b/.test(text)
    || /\b(?:system|systems|architecture|technical|technology|it|application|software|web|data|business|process|operations|quality|qa|support|solution|solutions)[\w\s/.-]{0,50}analyst\b/.test(text)
    || /\banalyst[\w\s/.-]{0,50}(?:system|systems|architecture|technical|technology|it|application|software|web|data|business|process|operations|quality|qa|support|solution|solutions)\b/.test(text)
    || /\b(?:it|technical|application|desktop|service desk|help desk|systems?)[\w\s/.-]{0,50}(?:support|technician|specialist|associate)\b/.test(text)
    || /\b(?:support|technician|specialist|associate)[\w\s/.-]{0,50}(?:it|technical|application|desktop|service desk|help desk|systems?)\b/.test(text)) return 'full_time_general';
  return 'skip';
}

function employmentTypeForRole(rolePriority: RolePriority): string {
  if (rolePriority === 'intern_coop') return 'intern/co-op';
  if (rolePriority === 'stretch') return 'stretch full-time';
  if (rolePriority === 'skip') return 'needs review';
  return 'full-time';
}

function keyForJob(job: Pick<ScoredJob, 'jobUrl' | 'company' | 'jobTitle' | 'location'>): string {
  return (job.jobUrl || `${job.company}|${job.jobTitle}|${job.location ?? ''}`).toLowerCase();
}

function parseJsonBlock(output: string): ScanJson {
  const idx = output.lastIndexOf(SCAN_JSON_MARKER);
  if (idx === -1) {
    throw new Error('Scanner did not return JSON output.');
  }
  return JSON.parse(output.slice(idx + SCAN_JSON_MARKER.length).trim()) as ScanJson;
}

function extractJsonArray(text: string): QuickScore[] {
  const code = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (code) return JSON.parse(code[1]) as QuickScore[];
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1)) as QuickScore[];
  throw new Error('Quick-score response did not contain a JSON array.');
}

function applyQuickCaps(offer: ScanOffer, score: number): number {
  const title = offer.title.toLowerCase();
  const location = (offer.location ?? '').toLowerCase();
  const rolePriority = offer.rolePriority ?? classifyRolePriority(offer.title, offer.location);
  let capped = score;

  if (/\b(senior|sr\.?|staff|principal|architect|lead|manager|vice president|avp)\b/.test(title)) {
    capped = Math.min(capped, 64);
  }
  if (rolePriority === 'intern_coop') {
    capped = Math.min(capped, 79);
  }
  if (/\b(us only|united states only|remote us|remote u\.s\.)\b/.test(location)) {
    capped = Math.min(capped, 49);
  }

  return clampScore(capped);
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean).slice(0, 5);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return fallback;
}

function localQuickScore(offer: ScanOffer): QuickScore {
  const title = offer.title.toLowerCase();
  const location = (offer.location ?? '').toLowerCase();
  const rolePriority = offer.rolePriority ?? classifyRolePriority(offer.title, offer.location);
  const matched: string[] = [];
  const gaps: string[] = [];
  let score = 45;

  const positive = [
    ['software', 8],
    ['developer', 8],
    ['full stack', 12],
    ['frontend', 8],
    ['backend', 8],
    ['react', 8],
    ['next', 8],
    ['node', 8],
    ['typescript', 8],
    ['c#', 6],
    ['java', 5],
    ['python', 5],
    ['data analyst', 10],
    ['business analyst', 8],
    ['systems analyst', 8],
    ['system analyst', 8],
    ['architecture analyst', 8],
    ['technical analyst', 8],
    ['application analyst', 8],
    ['qa analyst', 8],
    ['quality assurance', 8],
    ['software tester', 8],
    ['test analyst', 8],
    ['help desk', 6],
    ['it technician', 6],
    ['technical support', 6],
    ['support analyst', 6],
    ['sql', 5],
    ['power bi', 5],
    ['ai', 8],
    ['machine learning', 8],
    ['new grad', 8],
    ['intern', 2],
    ['co-op', 2],
  ] as const;

  for (const [term, points] of positive) {
    if (title.includes(term)) {
      score += points;
      matched.push(`Title includes ${term}`);
    }
  }

  if (/ontario|toronto|waterloo|kitchener|cambridge|canada|remote canada/.test(location)) {
    score += 10;
    matched.push('Canada/Ontario location fit');
  } else if (location) {
    gaps.push(`Location needs review: ${offer.location}`);
  }

  if (/\b(senior|sr\.?|staff|principal|architect|lead|manager|vice president|avp)\b/.test(title)) {
    gaps.push('Senior/lead title may be above current target level');
  }

  if (rolePriority === 'full_time_new_grad') {
    score += 14;
    matched.push('Full-time new-grad priority role');
  } else if (rolePriority === 'full_time_entry') {
    score += 12;
    matched.push('Full-time entry-level priority role');
  } else if (rolePriority === 'full_time_general') {
    score += 6;
    matched.push('Full-time software role');
  } else if (rolePriority === 'intern_coop') {
    matched.push('Intern/co-op opportunity is acceptable for industry entry');
  } else if (rolePriority === 'stretch') {
    gaps.push('Stretch/senior role is deprioritized for current new-grad search');
  } else if (rolePriority === 'skip') {
    gaps.push('Title is unclassified from metadata; run full evaluation if the work looks relevant');
  }

  score = applyQuickCaps(offer, score);
  return {
    id: idForOffer(offer),
    score,
    fitLevel: fitLevelForScore(score),
    recommendation: fitLevelForScore(score),
    summary: 'Preliminary scan score based on title and location. Run full evaluation before deciding.',
    matched: matched.slice(0, 5),
    gaps: gaps.slice(0, 5),
  };
}

async function runScanner(): Promise<ScanJson> {
  const { stdout, stderr } = await execFileAsync(process.execPath, ['scan.mjs', '--dry-run', '--json'], {
    cwd: ROOT,
    timeout: 270000, // paced Eluta requests + referral employer pages
    maxBuffer: 1024 * 1024 * 4,
  });
  const output = `${stdout}\n${stderr}`;
  return parseJsonBlock(output);
}

async function quickScoreOffers(offers: ScanOffer[]): Promise<Array<QuickScore & { scoringMode: ScoredJob['scoringMode'] }>> {
  if (offers.length === 0) return [];

  const cv = readRoot('cv.md');
  const profile = readRoot('config/profile.yml');
  const profileMd = readRoot('modes/_profile.md');
  const items = offers.map(offer => ({
    id: idForOffer(offer),
    company: offer.company,
    jobTitle: offer.title,
    location: offer.location ?? null,
    archivedDescription: offer.description ?? null,
    source: offer.source ?? null,
    sourceType: offer.sourceType ?? null,
    postedAt: offer.postedAt ?? null,
    rolePriority: offer.rolePriority ?? classifyRolePriority(offer.title, offer.location),
    employmentType: offer.employmentType ?? employmentTypeForRole(offer.rolePriority ?? classifyRolePriority(offer.title, offer.location)),
  }));

  const prompt = `You are quick-scoring scanned job cards for Girish Bhuteja before full evaluation.

Use ONLY the scanned metadata below. This is preliminary: do not pretend you have the full JD.
Return a JSON array only. Each item must include:
id, score, fitLevel, recommendation, summary, matched, gaps.

Scoring guidance:
- 85+ Strong Apply, 70-84 Apply, 50-69 Maybe, <50 Skip.
- This is candidate-first discovery. Do not require exact target-title matches. Score by whether the posting's actual work maps to Girish's resume evidence across software, web, data/analytics, QA/testing, systems, technical support, edtech, AI/ML, automation, databases, cloud, or user-facing technical operations.
- Prefer Canada/Ontario/Remote Canada and early-career roles, but let adjacent role titles remain visible with honest Maybe/Skip scores.
- Intern/co-op roles are acceptable and should remain visible when they match the resume.
- Recent postings should be attractive, but never override poor fit or seniority mismatch.
- Cap senior/staff/principal/architect/lead/manager titles below 65.
- Be conservative when metadata is thin.

CANDIDATE CV:
${cv}

PROFILE:
${profile}

PROFILE NOTES:
${profileMd}

SCANNED JOBS:
${JSON.stringify(items, null, 2)}`;

  try {
    const { result } = await generateGeminiContent(ai, 'evaluate', {
      contents: prompt,
      config: {
        maxOutputTokens: 8192,
        temperature: 0,
        topP: 0.1,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const parsed = extractJsonArray(result.text ?? '');
    const byId = new Map(parsed.map(item => [item.id, item]));
    return offers.map(offer => {
      const fallback = localQuickScore(offer);
      const item = byId.get(idForOffer(offer)) ?? fallback;
      const score = applyQuickCaps(offer, item.score);
      const fitLevel = fitLevelForScore(score);
      return {
        ...fallback,
        ...item,
        score,
        fitLevel,
        recommendation: item.recommendation || fitLevel,
        matched: toStringArray(item.matched, fallback.matched),
        gaps: toStringArray(item.gaps, fallback.gaps),
        scoringMode: 'ai-quick-score' as const,
      };
    });
  } catch (err) {
    console.warn('[scan/run] AI quick-score failed; using local fallback:', err);
    return offers.map(offer => ({ ...localQuickScore(offer), scoringMode: 'local-fallback' as const }));
  }
}

function recencyRank(job: ScoredJob): number {
  const value = job.postedAt || job.firstSeenAt || job.scannedAt;
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function freshnessRank(job: ScoredJob): number {
  const ranks: Record<string, number> = { '24h': 0, '72h': 1, '7d': 2, older: 3, unknown: 4 };
  return ranks[job.freshnessBucket ?? 'unknown'] ?? ranks.unknown;
}

function roleRank(job: ScoredJob): number {
  return ROLE_PRIORITY_RANK[job.rolePriority ?? 'skip'] ?? ROLE_PRIORITY_RANK.skip;
}

function sourceRank(job: ScoredJob): number {
  if (job.sourceType === 'greenhouse' || job.sourceType === 'ashby' || job.sourceType === 'lever') return 0;
  if (job.employerHost && job.sourceType !== 'eluta') return 0;
  if (job.sourceType === 'eluta') return 1;
  if (job.sourceType === 'manual-import') return 2;
  return 3;
}

function sourceSummary(queue: ScoredJob[]) {
  const map = new Map<string, { sourceType: string; sourceName: string; count: number }>();
  for (const job of queue) {
    const sourceType = job.sourceType ?? 'unknown';
    const sourceName = job.sourceName ?? job.source ?? sourceType;
    const key = `${sourceType}:${sourceName}`;
    const existing = map.get(key) ?? { sourceType, sourceName, count: 0 };
    existing.count += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.sourceName.localeCompare(b.sourceName));
}

function mergeQueue(existing: ScoredJob[], incoming: ScoredJob[]): ScoredJob[] {
  const map = new Map<string, ScoredJob>();
  for (const job of existing) map.set(keyForJob(job), job);
  for (const job of incoming) {
    const key = keyForJob(job);
    const previous = map.get(key);
    map.set(key, {
      ...previous,
      ...job,
      firstSeenAt: previous?.firstSeenAt ?? job.firstSeenAt ?? job.scannedAt,
      lastSeenAt: job.lastSeenAt ?? job.scannedAt,
      recencyConfidence: job.recencyConfidence ?? previous?.recencyConfidence ?? 'unknown',
    });
  }
  return Array.from(map.values())
    .sort((a, b) => (
      freshnessRank(a) - freshnessRank(b)
      || roleRank(a) - roleRank(b)
      || sourceRank(a) - sourceRank(b)
      || b.score - a.score
      || recencyRank(b) - recencyRank(a)
      || a.company.localeCompare(b.company)
    ))
    .slice(0, 300);
}

export async function POST() {
  try {
    const scan = await runScanner();
    const scored = await quickScoreOffers(scan.offers);
    const scannedAt = new Date().toISOString();

    const existingQueue = getScoredQueue();
    const existingKeys = new Set(existingQueue.map(keyForJob));
    const incoming: ScoredJob[] = scan.offers.map((offer, index) => {
      const quick = scored[index] ?? localQuickScore(offer);
      const rolePriority = offer.rolePriority ?? classifyRolePriority(offer.title, offer.location);
      const firstSeenAt = scannedAt;
      const ageHours = offer.postedAgeHours ?? postedAgeHours(offer.postedAt);
      const key = keyForJob({
        jobUrl: offer.url,
        company: offer.company,
        jobTitle: offer.title,
        location: offer.location ?? null,
      });
      const isNew = !existingKeys.has(key);
      return {
        id: idForOffer(offer),
        company: offer.company,
        jobTitle: offer.title,
        location: offer.location ?? null,
        description: offer.description ?? null,
        jobUrl: offer.url,
        directApplyUrl: offer.directApplyUrl ?? offer.url,
        score: quick.score,
        fitLevel: quick.fitLevel,
        recommendation: quick.recommendation,
        summary: quick.summary,
        matched: quick.matched,
        gaps: quick.gaps,
        source: offer.source ?? null,
        sourceType: offer.sourceType ?? offer.source?.replace(/-api$/, '') ?? null,
        sourceName: offer.sourceName ?? offer.source ?? null,
        sourceSearchUrl: offer.sourceSearchUrl ?? null,
        employerHost: offer.employerHost ?? null,
        scoringMode: quick.scoringMode,
        postedAt: offer.postedAt ?? null,
        postedAgeHours: ageHours,
        freshnessBucket: offer.freshnessBucket ?? freshnessBucket(offer.postedAt, firstSeenAt),
        rolePriority,
        employmentType: offer.employmentType ?? employmentTypeForRole(rolePriority),
        freshnessWindowHours: offer.freshnessWindowHours ?? 24,
        firstSeenAt,
        lastSeenAt: scannedAt,
        recencyConfidence: offer.recencyConfidence ?? (offer.postedAt ? 'exact' : 'first_seen'),
        scannedAt,
        isNew,
      };
    }) as Array<ScoredJob & { isNew: boolean }>;

    const queue = mergeQueue(existingQueue, incoming);
    saveScoredQueue(queue);

    return NextResponse.json({
      queue,
      added: incoming.filter(job => job.isNew).length,
      total: queue.length,
      scanSummary: scan.summary,
      sourceSummary: sourceSummary(queue),
      scannerErrors: scan.errors,
    });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
