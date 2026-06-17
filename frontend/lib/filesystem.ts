/**
 * filesystem.ts — single place that reads/writes career-ops data files.
 * All paths resolve relative to the career-ops root (parent of frontend/).
 * To migrate to a database later: swap these functions only; UI stays unchanged.
 */

import fs from 'fs';
import path from 'path';
import { isValidStatus } from './status';

// Career-ops root is one level up from the frontend directory
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');

function rootPath(...segments: string[]): string {
  return path.join(/*turbopackIgnore: true*/ ROOT, ...segments);
}

export const PATHS = {
  applicationsJson: rootPath('data', 'applications.json'),
  applicationsMd:   rootPath('data', 'applications.md'),
  profileYml:       rootPath('config', 'profile.yml'),
  cvMd:             rootPath('cv.md'),
  applicationsDir:  rootPath('applications'),
  reportsDir:       rootPath('reports'),
  scanHistory:      rootPath('data', 'scan-history.tsv'),
  scoredQueue:      rootPath('data', 'scored-queue.json'),
};

export interface ApplicationEntry {
  id: string;
  company: string;
  jobTitle: string;
  location: string | null;
  jobUrl: string | null;
  status: string;
  score: number | null;
  fitLevel: string | null;
  applicationFolder: string;
  resumePath: string | null;
  coverLetterPath: string | null;
  interviewPrepPath: string | null;
  notesPath: string | null;
  reportPath: string | null;
  createdAt: string;
  updatedAt: string;
  evaluatedAt: string | null;
  resumeGeneratedAt: string | null;
  coverLetterGeneratedAt: string | null;
  lastDocumentGeneratedAt: string | null;
  appliedAt: string | null;
  lastActivityAt: string | null;
}

export interface ApplicationDetail extends ApplicationEntry {
  jobDescription: string | null;
  resumeMd: string | null;
  resumeHtml: string | null;
  coverLetterMd: string | null;
  coverLetterHtml: string | null;
  interviewMd: string | null;
  notesMd: string | null;
  scoreData: ScoreData | null;
  resumePdfPath: string | null;
  coverLetterPdfPath: string | null;
}

export interface ScoreData {
  overallScore: number | null;
  fitLevel: string | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  recommendation: string | null;
  notes: string | null;
  categories: Record<string, number | null>;
  originalScore?: number | null;
  sourceUrl?: string | null;
  applyUrl?: string | null;
  adjustedByGuardrails?: boolean;
  guardrails?: Array<{
    code: string;
    label: string;
    reason: string;
    cap: number;
    riskMinimum: number;
  }>;
}

export interface ScoredJob {
  id: string;
  company: string;
  jobTitle: string;
  location: string | null;
  description?: string | null;
  jobUrl: string | null;
  score: number;
  fitLevel: string;
  recommendation: string;
  summary: string;
  matched?: string[];
  gaps?: string[];
  source?: string | null;
  sourceType?: string | null;
  sourceName?: string | null;
  sourceSearchUrl?: string | null;
  employerHost?: string | null;
  directApplyUrl?: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
  recencyConfidence?: 'exact' | 'first_seen' | 'unknown';
  isNew?: boolean;
  scoringMode?: 'ai-quick-score' | 'local-fallback';
  postedAt: string | null;
  postedAgeHours?: number | null;
  freshnessBucket?: '24h' | '72h' | '7d' | 'older' | 'unknown';
  rolePriority?: 'full_time_new_grad' | 'full_time_entry' | 'full_time_general' | 'intern_coop' | 'stretch' | 'skip';
  employmentType?: string | null;
  freshnessWindowHours?: number;
  scannedAt: string;
  applicationId?: string | null;
  applicationStatus?: string | null;
  evaluatedAt?: string | null;
  resumeGeneratedAt?: string | null;
  coverLetterGeneratedAt?: string | null;
  lastDocumentGeneratedAt?: string | null;
  appliedAt?: string | null;
  lastActivityAt?: string | null;
  viewedAt?: string | null;
  hasApplication?: boolean;
  hasResume?: boolean;
  hasCoverLetter?: boolean;
  reviewState?: 'new' | 'viewed' | 'evaluated' | 'docs' | 'applied' | 'archived';
}

function nowIso(): string {
  return new Date().toISOString();
}

function dateOnly(value: string): string {
  return value.split('T')[0];
}

function timestampValue(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestTimestamp(...values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestTime = 0;
  for (const value of values) {
    const time = timestampValue(value);
    if (time > latestTime) {
      latest = value ?? null;
      latestTime = time;
    }
  }
  return latest;
}

function normalizeApplicationEntry(entry: Partial<ApplicationEntry> & { id: string }): ApplicationEntry {
  const evaluatedAt = entry.evaluatedAt ?? null;
  const resumeGeneratedAt = entry.resumeGeneratedAt ?? null;
  const coverLetterGeneratedAt = entry.coverLetterGeneratedAt ?? null;
  const lastDocumentGeneratedAt = entry.lastDocumentGeneratedAt
    ?? latestTimestamp(resumeGeneratedAt, coverLetterGeneratedAt);
  const appliedAt = entry.appliedAt ?? null;
  const createdAt = entry.createdAt ?? dateOnly(nowIso());
  const updatedAt = entry.updatedAt ?? createdAt;
  const lastActivityAt = latestTimestamp(
    appliedAt,
    lastDocumentGeneratedAt,
    coverLetterGeneratedAt,
    resumeGeneratedAt,
    evaluatedAt,
    updatedAt,
    createdAt,
  );

  return {
    id: entry.id,
    company: entry.company ?? 'Unknown Company',
    jobTitle: entry.jobTitle ?? 'Unknown Role',
    location: entry.location ?? null,
    jobUrl: entry.jobUrl ?? null,
    status: entry.status ?? 'Saved',
    score: entry.score ?? null,
    fitLevel: entry.fitLevel ?? null,
    applicationFolder: entry.applicationFolder ?? `applications/${entry.id}`,
    resumePath: entry.resumePath ?? null,
    coverLetterPath: entry.coverLetterPath ?? null,
    interviewPrepPath: entry.interviewPrepPath ?? null,
    notesPath: entry.notesPath ?? null,
    reportPath: entry.reportPath ?? null,
    createdAt,
    updatedAt,
    evaluatedAt,
    resumeGeneratedAt,
    coverLetterGeneratedAt,
    lastDocumentGeneratedAt,
    appliedAt,
    lastActivityAt,
  };
}

function normalizeMatchText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function urlKey(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, '').toLowerCase() || null;
  }
}

function companyRoleKey(company: string | null | undefined, jobTitle: string | null | undefined): string {
  return `${normalizeMatchText(company)}|${normalizeMatchText(jobTitle)}`;
}

function reviewStateForApplication(app: ApplicationEntry | null): ScoredJob['reviewState'] {
  if (!app) return 'new';
  if (app.status === 'Applied' || app.appliedAt) return 'applied';
  if (['Rejected', 'Withdrawn', 'Discarded', 'SKIP'].includes(app.status)) return 'archived';
  if (app.resumePath || app.coverLetterPath || app.lastDocumentGeneratedAt) return 'docs';
  if (app.score != null || app.evaluatedAt || app.status === 'Evaluated') return 'evaluated';
  return 'evaluated';
}

function reviewStateForScoredJob(job: ScoredJob, app: ApplicationEntry | null): ScoredJob['reviewState'] {
  if (app) return reviewStateForApplication(app);
  return job.viewedAt ? 'viewed' : 'new';
}

// ── READ ──────────────────────────────────────────────────────────────────────

export function getAllApplications(): ApplicationEntry[] {
  if (!fs.existsSync(PATHS.applicationsJson)) return [];
  try {
    const raw = fs.readFileSync(PATHS.applicationsJson, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.applications)
      ? data.applications.map((entry: Partial<ApplicationEntry> & { id: string }) => normalizeApplicationEntry(entry))
      : [];
  } catch {
    return [];
  }
}

export function getApplication(id: string): ApplicationDetail | null {
  const apps = getAllApplications();
  const entry = apps.find(a => a.id === id);
  if (!entry) return null;

  const folderPath = rootPath(entry.applicationFolder);

  const readFile = (filename: string): string | null => {
    const p = path.join(folderPath, filename);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
  };

  const readJson = (filename: string): unknown => {
    const p = path.join(folderPath, filename);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
  };

  return {
    ...entry,
    jobDescription:    readFile('job-description.md'),
    resumeMd:          readFile('resume.md'),
    resumeHtml:        readFile('resume.html'),
    coverLetterMd:     readFile('cover-letter.md'),
    coverLetterHtml:   readFile('cover-letter.html'),
    interviewMd:       readFile('interview.md'),
    notesMd:           readFile('notes.md'),
    scoreData:         readJson('score.json') as ScoreData | null,
    resumePdfPath:     entry.resumePath,
    coverLetterPdfPath: entry.coverLetterPath,
  };
}

export function getScoredQueue(): ScoredJob[] {
  if (!fs.existsSync(PATHS.scoredQueue)) return [];
  try {
    const raw = fs.readFileSync(PATHS.scoredQueue, 'utf-8');
    return enrichScoredJobsWithApplications(JSON.parse(raw) as ScoredJob[]);
  } catch {
    return [];
  }
}

// ── WRITE ─────────────────────────────────────────────────────────────────────

export function updateApplicationStatus(id: string, newStatus: string): boolean {
  if (!isValidStatus(newStatus)) return false;

  const apps = getAllApplications();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return false;

  const now = nowIso();
  apps[idx].status = newStatus;
  apps[idx].updatedAt = now;
  if (newStatus === 'Applied' && !apps[idx].appliedAt) {
    apps[idx].appliedAt = now;
  }
  apps[idx] = normalizeApplicationEntry(apps[idx]);

  fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));

  // Also update metadata.json inside the application folder
  const metaPath = rootPath(apps[idx].applicationFolder, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.status = newStatus;
      meta.updatedAt = now;
      if (newStatus === 'Applied' && !meta.appliedAt) meta.appliedAt = now;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch { /* non-fatal */ }
  }

  return true;
}

export function updateInterviewPrepPath(id: string, prepPath: string): boolean {
  const apps = getAllApplications();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return false;

  apps[idx].interviewPrepPath = prepPath;
  apps[idx].updatedAt = nowIso();
  apps[idx] = normalizeApplicationEntry(apps[idx]);
  fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));

  const metaPath = rootPath(apps[idx].applicationFolder, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.interviewPrepPath = prepPath;
      meta.updatedAt = apps[idx].updatedAt;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch { /* non-fatal */ }
  }

  return true;
}

export function saveInterviewPrep(id: string, content: string): string {
  const app = getAllApplications().find(a => a.id === id);
  if (!app) throw new Error(`Application not found: ${id}`);

  const folderPath = rootPath(app.applicationFolder);
  const prepPath = path.join(folderPath, 'interview.md');
  fs.writeFileSync(prepPath, content);

  const relativePath = `${app.applicationFolder}/interview.md`;
  updateInterviewPrepPath(id, relativePath);
  return relativePath;
}

export function saveDocumentEdit(id: string, filename: 'resume.md' | 'cover-letter.md', content: string): void {
  const app = getAllApplications().find(a => a.id === id);
  if (!app) throw new Error(`Application not found: ${id}`);

  const filePath = rootPath(app.applicationFolder, filename);
  fs.writeFileSync(filePath, content);

  // Append to edit-history.json
  const historyPath = rootPath(app.applicationFolder, 'edit-history.json');
  let history: unknown[] = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch { history = []; }
  }
  history.push({ timestamp: new Date().toISOString(), document: filename });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

export function saveJobDescriptionSnapshot(id: string, jobDescriptionText: string): void {
  const apps = getAllApplications();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) throw new Error(`Application not found: ${id}`);

  const app = apps[idx];
  const now = nowIso();
  const today = dateOnly(now);
  const filePath = rootPath(app.applicationFolder, 'job-description.md');
  const content = `# Job Description: ${app.jobTitle} at ${app.company}\n\n**URL:** ${app.jobUrl ?? 'Pasted JD'}\n**Location:** ${app.location ?? 'TBD'}\n**Date saved:** ${today}\n\n---\n\n${jobDescriptionText}`;
  fs.writeFileSync(filePath, content);

  apps[idx].updatedAt = now;
  apps[idx] = normalizeApplicationEntry(apps[idx]);
  fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));

  const metaPath = rootPath(app.applicationFolder, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.updatedAt = now;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch { /* non-fatal */ }
  }
}

export function getPdfAbsPath(relativePath: string): string {
  return rootPath(relativePath);
}

export function saveScoredQueue(queue: ScoredJob[]): void {
  fs.mkdirSync(path.dirname(PATHS.scoredQueue), { recursive: true });
  fs.writeFileSync(PATHS.scoredQueue, JSON.stringify(enrichScoredJobsWithApplications(queue), null, 2));
}

export function markScoredJobViewed(id: string): ScoredJob[] | null {
  if (!fs.existsSync(PATHS.scoredQueue)) return null;
  let queue: ScoredJob[];
  try {
    queue = JSON.parse(fs.readFileSync(PATHS.scoredQueue, 'utf-8')) as ScoredJob[];
  } catch {
    return null;
  }

  const idx = queue.findIndex(job => job.id === id);
  if (idx === -1) return null;

  const now = nowIso();
  queue[idx] = {
    ...queue[idx],
    viewedAt: queue[idx].viewedAt ?? now,
    lastActivityAt: queue[idx].lastActivityAt ?? now,
    reviewState: queue[idx].reviewState === 'new' || !queue[idx].reviewState ? 'viewed' : queue[idx].reviewState,
    isNew: false,
  };
  saveScoredQueue(queue);
  return getScoredQueue();
}

export function enrichScoredJobsWithApplications(queue: ScoredJob[]): ScoredJob[] {
  const apps = getAllApplications();
  const byUrl = new Map<string, ApplicationEntry>();
  const byCompanyRole = new Map<string, ApplicationEntry>();

  for (const app of apps) {
    const appUrlKey = urlKey(app.jobUrl);
    if (appUrlKey) byUrl.set(appUrlKey, app);
    byCompanyRole.set(companyRoleKey(app.company, app.jobTitle), app);
  }

  return queue.map(job => {
    const app = urlKey(job.directApplyUrl)
      ? byUrl.get(urlKey(job.directApplyUrl)!)
      : null;
    const matchedApp = app
      ?? (urlKey(job.jobUrl) ? byUrl.get(urlKey(job.jobUrl)!) : null)
      ?? byCompanyRole.get(companyRoleKey(job.company, job.jobTitle))
      ?? null;

    return {
      ...job,
      applicationId: matchedApp?.id ?? null,
      applicationStatus: matchedApp?.status ?? null,
      evaluatedAt: matchedApp?.evaluatedAt ?? null,
      resumeGeneratedAt: matchedApp?.resumeGeneratedAt ?? null,
      coverLetterGeneratedAt: matchedApp?.coverLetterGeneratedAt ?? null,
      lastDocumentGeneratedAt: matchedApp?.lastDocumentGeneratedAt ?? null,
      appliedAt: matchedApp?.appliedAt ?? null,
      lastActivityAt: matchedApp?.lastActivityAt ?? job.lastActivityAt ?? job.viewedAt ?? null,
      viewedAt: job.viewedAt ?? null,
      hasApplication: !!matchedApp,
      hasResume: !!matchedApp?.resumePath,
      hasCoverLetter: !!matchedApp?.coverLetterPath,
      reviewState: reviewStateForScoredJob(job, matchedApp),
      isNew: matchedApp || job.viewedAt ? false : job.isNew,
    };
  });
}

// ── CREATE / UPDATE ───────────────────────────────────────────────────────────

export function createApplication(
  id: string,
  company: string,
  jobTitle: string,
  location: string | null,
  jobUrl: string | null,
  jobDescriptionText: string,
  today: string,
): string {
  const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const apps = getAllApplications();
  const existing = apps.find(app =>
    normalizeKey(app.company) === normalizeKey(company) &&
    normalizeKey(app.jobTitle) === normalizeKey(jobTitle)
  );
  const actualId = existing?.id ?? id;
  const applicationFolder = existing?.applicationFolder ?? `applications/${actualId}`;
  const folderPath = rootPath(applicationFolder);
  const now = nowIso();

  const jobDescMd = `# Job Description: ${jobTitle} at ${company}\n\n**URL:** ${jobUrl ?? 'Pasted JD'}\n**Location:** ${location ?? 'TBD'}\n**Date saved:** ${today}\n\n---\n\n${jobDescriptionText}`;

  if (fs.existsSync(folderPath)) {
    fs.writeFileSync(path.join(folderPath, 'job-description.md'), jobDescMd);
    const metaPath = path.join(folderPath, 'metadata.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        Object.assign(meta, {
          company,
          jobTitle,
          location,
          jobUrl,
          updatedAt: now,
        });
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      } catch { /* non-fatal */ }
    }
  } else {
    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, 'job-description.md'), jobDescMd);
    fs.writeFileSync(path.join(folderPath, 'notes.md'), '');
    fs.writeFileSync(path.join(folderPath, 'score.json'), '{}');

    const meta = {
      id: actualId, company, jobTitle, location, jobUrl,
      status: 'Saved',
      createdAt: now, updatedAt: now,
      evaluatedAt: null,
      resumeGeneratedAt: null,
      coverLetterGeneratedAt: null,
      lastDocumentGeneratedAt: null,
      appliedAt: null,
      resumePath: null, coverLetterPath: null, interviewPrepPath: null,
      notesPath: `${applicationFolder}/notes.md`,
      reportPath: null,
      scorePath: `${applicationFolder}/score.json`,
    };
    fs.writeFileSync(path.join(folderPath, 'metadata.json'), JSON.stringify(meta, null, 2));
  }

  // Add to data/applications.json
  fs.mkdirSync(rootPath('data'), { recursive: true });
  if (existing) {
    const idx = apps.findIndex(app => app.id === existing.id);
    apps[idx] = {
      ...apps[idx],
      company,
      jobTitle,
      location,
      jobUrl,
      updatedAt: now,
    };
    apps[idx] = normalizeApplicationEntry(apps[idx]);
    fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));
    return actualId;
  }
  if (apps.some(a => a.id === actualId)) return actualId; // already present
  apps.push({
    id: actualId, company, jobTitle, location, jobUrl,
    status: 'Saved',
    score: null, fitLevel: null,
    applicationFolder,
    resumePath: null, coverLetterPath: null, interviewPrepPath: null,
    notesPath: `${applicationFolder}/notes.md`,
    reportPath: null,
    createdAt: now,
    updatedAt: now,
    evaluatedAt: null,
    resumeGeneratedAt: null,
    coverLetterGeneratedAt: null,
    lastDocumentGeneratedAt: null,
    appliedAt: null,
    lastActivityAt: now,
  });
  fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));
  return actualId;
}

export function updateApplicationFields(
  id: string,
  updates: Partial<ApplicationEntry>,
  scoreData?: ScoreData,
): boolean {
  const apps = getAllApplications();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return false;

  const now = nowIso();
  const normalizedUpdates = { ...updates };
  if (normalizedUpdates.status === 'Applied' && !normalizedUpdates.appliedAt && !apps[idx].appliedAt) {
    normalizedUpdates.appliedAt = now;
  }
  Object.assign(apps[idx], normalizedUpdates, { updatedAt: now });
  apps[idx] = normalizeApplicationEntry(apps[idx]);
  fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));

  // Sync metadata.json
  const metaPath = rootPath(apps[idx].applicationFolder, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      Object.assign(meta, normalizedUpdates, { updatedAt: now });
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch { /* non-fatal */ }
  }

  // Write score.json if scoreData provided
  if (scoreData !== undefined) {
    const scorePath = rootPath(apps[idx].applicationFolder, 'score.json');
    fs.writeFileSync(scorePath, JSON.stringify(scoreData, null, 2));
  }

  return true;
}
