import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getScoredQueue, saveScoredQueue, type ScoredJob } from '@/lib/filesystem';
import { apiErrorMessage } from '@/lib/errors';

type RolePriority = NonNullable<ScoredJob['rolePriority']>;

const HOUR_MS = 60 * 60 * 1000;
const ROLE_PRIORITY_RANK: Record<RolePriority, number> = {
  full_time_new_grad: 0,
  full_time_entry: 1,
  full_time_general: 2,
  intern_coop: 3,
  stretch: 4,
  skip: 5,
};

interface ImportRequest {
  text?: string;
}

function idFor(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function keyForJob(job: Pick<ScoredJob, 'jobUrl' | 'company' | 'jobTitle' | 'location'>): string {
  return (job.jobUrl || `${job.company}|${job.jobTitle}|${job.location ?? ''}`).toLowerCase();
}

function normalizeCompanyFromHost(hostname: string) {
  return hostname
    .replace(/^www\./, '')
    .split('.')[0]
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function classifyRolePriority(title: string, location?: string | null): RolePriority {
  const text = `${title} ${location ?? ''}`.toLowerCase();
  if (/\b(senior|sr\.?|staff|principal|director|manager|lead|architect|vice president|avp)\b/.test(text)) return 'stretch';
  if (/\b(intern|internship|co-?op|co op)\b/.test(text)) return 'intern_coop';
  if (/\b(new grad|new graduate|graduate program|university graduate|early career|campus)\b/.test(text)) return 'full_time_new_grad';
  if (/\b(entry level|entry-level|junior|jr\.)\b/.test(text)) return 'full_time_entry';
  if (/\b(software developer|software engineer|software development engineer|full[ -]?stack|frontend|front end|backend|back end|application developer|web developer|java developer|python developer|\.net developer|ai application|applied ai)\b/.test(text)) return 'full_time_general';
  return 'skip';
}

function employmentTypeForRole(rolePriority: RolePriority): string {
  if (rolePriority === 'intern_coop') return 'intern/co-op';
  if (rolePriority === 'stretch') return 'stretch full-time';
  if (rolePriority === 'skip') return 'non-target';
  return 'full-time';
}

function fitLevelForScore(score: number) {
  if (score >= 85) return 'Strong Apply';
  if (score >= 70) return 'Apply';
  if (score >= 50) return 'Maybe';
  return 'Skip';
}

function quickImportScore(rolePriority: RolePriority, text: string) {
  let score = 50;
  if (rolePriority === 'full_time_new_grad') score += 24;
  if (rolePriority === 'full_time_entry') score += 20;
  if (rolePriority === 'full_time_general') score += 14;
  if (rolePriority === 'intern_coop') score += 4;
  if (rolePriority === 'stretch') score = Math.min(score, 62);
  if (rolePriority === 'skip') score = Math.min(score, 49);
  if (/ontario|toronto|waterloo|kitchener|cambridge|canada|remote canada/i.test(text)) score += 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function roleRank(job: ScoredJob) {
  return ROLE_PRIORITY_RANK[job.rolePriority ?? 'skip'] ?? ROLE_PRIORITY_RANK.skip;
}

function recencyRank(job: ScoredJob) {
  const value = job.postedAt || job.firstSeenAt || job.scannedAt;
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}

function freshnessRank(job: ScoredJob) {
  const ranks: Record<string, number> = { '24h': 0, '72h': 1, '7d': 2, older: 3, unknown: 4 };
  return ranks[job.freshnessBucket ?? 'unknown'] ?? ranks.unknown;
}

function sourceRank(job: ScoredJob) {
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

function firstSeenFreshness(firstSeenAt: string): ScoredJob['freshnessBucket'] {
  const age = Math.max(0, (Date.now() - Date.parse(firstSeenAt)) / HOUR_MS);
  if (age <= 24) return '24h';
  if (age <= 72) return '72h';
  if (age <= 168) return '7d';
  return 'older';
}

function parseImportText(text: string): ScoredJob[] {
  const now = new Date().toISOString();
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const jobs: ScoredJob[] = [];
  const seen = new Set<string>();

  for (const line of lines.length > 0 ? lines : [text]) {
    const urls = line.match(/https?:\/\/[^\s<>)"']+/gi) ?? [];
    for (const rawUrl of urls) {
      const jobUrl = rawUrl.replace(/[.,;]+$/, '');
      if (seen.has(jobUrl)) continue;
      seen.add(jobUrl);

      let hostname = 'manual-import';
      try {
        hostname = new URL(jobUrl).hostname;
      } catch {
        // Keep fallback host.
      }

      const textWithoutUrl = line.replace(rawUrl, '').replace(/\s+/g, ' ').trim();
      const parts = textWithoutUrl.split(/\s[-|–]\s/).map(part => part.trim()).filter(Boolean);
      const company = parts.length >= 2 ? parts[0] : normalizeCompanyFromHost(hostname);
      const jobTitle = parts.length >= 2 ? parts.slice(1).join(' - ') : (textWithoutUrl || `Imported job from ${hostname}`);
      const rolePriority = classifyRolePriority(jobTitle);
      const score = quickImportScore(rolePriority, line);
      const fitLevel = fitLevelForScore(score);

      jobs.push({
        id: idFor(`${jobUrl}|${company}|${jobTitle}`),
        company,
        jobTitle,
        location: null,
        jobUrl,
        directApplyUrl: jobUrl,
        score,
        fitLevel,
        recommendation: fitLevel,
        summary: 'Imported from pasted job-board URL or alert text. Run full evaluation before deciding.',
        matched: ['Manual/imported source preserved for review'],
        gaps: ['Full job description not fetched during import'],
        source: 'manual-import',
        sourceType: 'manual-import',
        sourceName: hostname.includes('linkedin') ? 'LinkedIn import'
          : hostname.includes('indeed') ? 'Indeed import'
            : hostname.includes('glassdoor') ? 'Glassdoor import'
              : hostname.includes('eluta') ? 'Eluta import'
                : 'Manual import',
        sourceSearchUrl: null,
        employerHost: null,
        firstSeenAt: now,
        lastSeenAt: now,
        recencyConfidence: 'first_seen',
        isNew: true,
        scoringMode: 'local-fallback',
        postedAt: null,
        postedAgeHours: null,
        freshnessBucket: firstSeenFreshness(now),
        rolePriority,
        employmentType: employmentTypeForRole(rolePriority),
        freshnessWindowHours: 24,
        scannedAt: now,
      });
    }
  }

  return jobs;
}

function mergeQueue(existing: ScoredJob[], incoming: ScoredJob[]) {
  const map = new Map<string, ScoredJob>();
  for (const job of existing) map.set(keyForJob(job), job);
  for (const job of incoming) {
    const key = keyForJob(job);
    const previous = map.get(key);
    map.set(key, {
      ...previous,
      ...job,
      firstSeenAt: previous?.firstSeenAt ?? job.firstSeenAt ?? job.scannedAt,
      lastSeenAt: job.scannedAt,
      isNew: !previous,
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as ImportRequest;
    const imported = parseImportText(body.text ?? '');
    if (imported.length === 0) {
      return NextResponse.json({ error: 'Paste at least one job URL or job-alert line.' }, { status: 400 });
    }

    const existing = getScoredQueue();
    const existingKeys = new Set(existing.map(keyForJob));
    const queue = mergeQueue(existing, imported);
    saveScoredQueue(queue);

    return NextResponse.json({
      queue,
      imported: imported.length,
      added: imported.filter(job => !existingKeys.has(keyForJob(job))).length,
      sourceSummary: sourceSummary(queue),
    });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
