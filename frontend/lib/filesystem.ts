/**
 * filesystem.ts — single place that reads/writes career-ops data files.
 * All paths resolve relative to the career-ops root (parent of frontend/).
 * To migrate to a database later: swap these functions only; UI stays unchanged.
 */

import fs from 'fs';
import path from 'path';

// Career-ops root is one level up from the frontend directory
const ROOT = path.resolve(process.cwd(), '..');

export const PATHS = {
  applicationsJson: path.join(ROOT, 'data', 'applications.json'),
  applicationsMd:   path.join(ROOT, 'data', 'applications.md'),
  profileYml:       path.join(ROOT, 'config', 'profile.yml'),
  cvMd:             path.join(ROOT, 'cv.md'),
  applicationsDir:  path.join(ROOT, 'applications'),
  reportsDir:       path.join(ROOT, 'reports'),
  scanHistory:      path.join(ROOT, 'data', 'scan-history.tsv'),
  scoredQueue:      path.join(ROOT, 'data', 'scored-queue.json'),
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
  appliedAt: string | null;
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
  jobUrl: string | null;
  score: number;
  fitLevel: string;
  recommendation: string;
  summary: string;
  postedAt: string | null;
  scannedAt: string;
}

// ── READ ──────────────────────────────────────────────────────────────────────

export function getAllApplications(): ApplicationEntry[] {
  if (!fs.existsSync(PATHS.applicationsJson)) return [];
  try {
    const raw = fs.readFileSync(PATHS.applicationsJson, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.applications) ? data.applications : [];
  } catch {
    return [];
  }
}

export function getApplication(id: string): ApplicationDetail | null {
  const apps = getAllApplications();
  const entry = apps.find(a => a.id === id);
  if (!entry) return null;

  const folderPath = path.join(ROOT, entry.applicationFolder);

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
    return JSON.parse(raw) as ScoredJob[];
  } catch {
    return [];
  }
}

// ── WRITE ─────────────────────────────────────────────────────────────────────

export function updateApplicationStatus(id: string, newStatus: string): boolean {
  const apps = getAllApplications();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return false;

  const today = new Date().toISOString().split('T')[0];
  apps[idx].status = newStatus;
  apps[idx].updatedAt = today;
  if (newStatus === 'Applied' && !apps[idx].appliedAt) {
    apps[idx].appliedAt = today;
  }

  fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));

  // Also update metadata.json inside the application folder
  const metaPath = path.join(ROOT, apps[idx].applicationFolder, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.status = newStatus;
      meta.updatedAt = today;
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
  apps[idx].updatedAt = new Date().toISOString().split('T')[0];
  fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));

  const metaPath = path.join(ROOT, apps[idx].applicationFolder, 'metadata.json');
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

  const folderPath = path.join(ROOT, app.applicationFolder);
  const prepPath = path.join(folderPath, 'interview.md');
  fs.writeFileSync(prepPath, content);

  const relativePath = `${app.applicationFolder}/interview.md`;
  updateInterviewPrepPath(id, relativePath);
  return relativePath;
}

export function saveDocumentEdit(id: string, filename: 'resume.md' | 'cover-letter.md', content: string): void {
  const app = getAllApplications().find(a => a.id === id);
  if (!app) throw new Error(`Application not found: ${id}`);

  const filePath = path.join(ROOT, app.applicationFolder, filename);
  fs.writeFileSync(filePath, content);

  // Append to edit-history.json
  const historyPath = path.join(ROOT, app.applicationFolder, 'edit-history.json');
  let history: unknown[] = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch { history = []; }
  }
  history.push({ timestamp: new Date().toISOString(), document: filename });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

export function getPdfAbsPath(relativePath: string): string {
  return path.join(ROOT, relativePath);
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
): void {
  const folderPath = path.join(ROOT, 'applications', id);

  const jobDescMd = `# Job Description: ${jobTitle} at ${company}\n\n**URL:** ${jobUrl ?? 'Pasted JD'}\n**Location:** ${location ?? 'TBD'}\n**Date saved:** ${today}\n\n---\n\n${jobDescriptionText}`;

  if (fs.existsSync(folderPath)) {
    fs.writeFileSync(path.join(folderPath, 'job-description.md'), jobDescMd);
  } else {
    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, 'job-description.md'), jobDescMd);
    fs.writeFileSync(path.join(folderPath, 'notes.md'), '');
    fs.writeFileSync(path.join(folderPath, 'score.json'), '{}');

    const meta = {
      id, company, jobTitle, location, jobUrl,
      status: 'Saved',
      createdAt: today, updatedAt: today,
      resumePath: null, coverLetterPath: null, interviewPrepPath: null,
      notesPath: `applications/${id}/notes.md`,
      reportPath: null,
      scorePath: `applications/${id}/score.json`,
    };
    fs.writeFileSync(path.join(folderPath, 'metadata.json'), JSON.stringify(meta, null, 2));
  }

  // Add to data/applications.json
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  const apps = getAllApplications();
  if (apps.some(a => a.id === id)) return; // already present
  apps.push({
    id, company, jobTitle, location, jobUrl,
    status: 'Saved',
    score: null, fitLevel: null,
    applicationFolder: `applications/${id}`,
    resumePath: null, coverLetterPath: null, interviewPrepPath: null,
    notesPath: `applications/${id}/notes.md`,
    reportPath: null,
    createdAt: today, updatedAt: today, appliedAt: null,
  });
  fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));
}

export function updateApplicationFields(
  id: string,
  updates: Partial<ApplicationEntry>,
  scoreData?: ScoreData,
): boolean {
  const apps = getAllApplications();
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return false;

  const today = new Date().toISOString().split('T')[0];
  Object.assign(apps[idx], updates, { updatedAt: today });
  fs.writeFileSync(PATHS.applicationsJson, JSON.stringify({ applications: apps }, null, 2));

  // Sync metadata.json
  const metaPath = path.join(ROOT, apps[idx].applicationFolder, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      Object.assign(meta, updates, { updatedAt: today });
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch { /* non-fatal */ }
  }

  // Write score.json if scoreData provided
  if (scoreData !== undefined) {
    const scorePath = path.join(ROOT, apps[idx].applicationFolder, 'score.json');
    fs.writeFileSync(scorePath, JSON.stringify(scoreData, null, 2));
  }

  return true;
}
