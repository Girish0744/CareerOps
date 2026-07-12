'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ScoreBadge from '@/components/ScoreBadge';
import {
  Briefcase, ExternalLink, MapPin, Loader2, CheckCircle2,
  Sparkles, ArrowRight, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  CalendarClock, Filter, Upload, Eye,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvalResult {
  applicationId: string;
  company: string;
  jobTitle: string;
  location: string | null;
  score: number;
  fitLevel: string;
  recommendation: string;
  summary: string;
  matched: string[];
  gaps: string[];
  adjustedByGuardrails?: boolean;
  guardrails?: Array<{
    code: string;
    label: string;
    reason: string;
    cap: number;
  }>;
}

interface ScannedJob {
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

interface SourceSummaryItem {
  sourceType: string;
  sourceName: string;
  count: number;
}

type DocumentGenerationType = 'resume' | 'cover-letter';

type Stage =
  | { kind: 'idle' }
  | { kind: 'evaluating' }
  | { kind: 'evaluated'; result: EvalResult }
  | { kind: 'generating'; result: EvalResult; documentType: DocumentGenerationType; resumePdf?: boolean; coverLetterPdf?: boolean }
  | { kind: 'done'; result: EvalResult; resumePdf: boolean; coverLetterPdf: boolean; warnings?: string[]; coverage?: KeywordCoverageSummary | null }
  | { kind: 'error'; message: string };

interface KeywordCoverageSummary {
  covered: number;
  total: number;
  missing: string[];
}

function summarizeKeywordCoverage(report: unknown): KeywordCoverageSummary | null {
  const coverage = (report as { keywordCoverage?: Array<{ keyword: string; present: boolean }> } | null)?.keywordCoverage;
  if (!Array.isArray(coverage) || coverage.length === 0) return null;
  const missing = coverage.filter(entry => !entry.present).map(entry => entry.keyword);
  return { covered: coverage.length - missing.length, total: coverage.length, missing };
}

type ReviewFilter = 'new' | 'viewed' | 'evaluated' | 'docs' | 'applied' | 'archived' | 'all';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fitColor(score: number) {
  if (score >= 85) return 'emerald';
  if (score >= 70) return 'blue';
  if (score >= 50) return 'amber';
  return 'red';
}

function isUrl(s: string) {
  try { new URL(s); return true; } catch { return false; }
}

function formatShortDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function recencyText(job: ScannedJob) {
  if (job.postedAgeHours != null) {
    if (job.postedAgeHours < 1) return 'Posted <1h ago';
    if (job.postedAgeHours <= 24) return `Posted ${Math.round(job.postedAgeHours)}h ago`;
    if (job.postedAgeHours <= 48) return 'Posted yesterday';
    if (job.postedAgeHours <= 168) return `Posted ${Math.round(job.postedAgeHours / 24)}d ago`;
  }
  const posted = formatShortDate(job.postedAt);
  if (posted) return `Posted ${posted}`;
  const firstSeen = formatShortDate(job.firstSeenAt ?? job.scannedAt);
  if (firstSeen) {
    const date = new Date(job.firstSeenAt ?? job.scannedAt);
    const now = new Date();
    return date.toDateString() === now.toDateString() ? 'First seen today' : `First seen ${firstSeen}`;
  }
  return 'Date unknown';
}

function rolePriorityLabel(value?: ScannedJob['rolePriority']) {
  const labels: Record<NonNullable<ScannedJob['rolePriority']>, string> = {
    full_time_new_grad: 'Full-time new grad',
    full_time_entry: 'Full-time entry',
    full_time_general: 'Full-time',
    intern_coop: 'Intern/co-op',
    stretch: 'Stretch',
    skip: 'Needs review',
  };
  return value ? labels[value] : 'Unclassified';
}

function sourceTypeLabel(value?: string | null) {
  if (!value) return 'Unknown source';
  if (value === 'greenhouse' || value === 'ashby' || value === 'lever') return 'ATS';
  if (value === 'eluta') return 'Eluta';
  if (value === 'manual-import') return 'Manual import';
  return value;
}

function reviewStateLabel(job: ScannedJob) {
  if (job.appliedAt || job.reviewState === 'applied') return 'Applied';
  if (job.reviewState === 'archived') return job.applicationStatus ?? 'Archived';
  if (job.hasResume || job.hasCoverLetter || job.reviewState === 'docs') return 'Docs ready';
  if (job.evaluatedAt || job.reviewState === 'evaluated') return 'Evaluated';
  if (job.viewedAt || job.reviewState === 'viewed') return 'Viewed';
  return job.isNew ? 'New' : 'Not evaluated';
}

// ── Score Card ────────────────────────────────────────────────────────────────

function ScoreCard({
  result, stage, onGenerate, onReset,
}: {
  result: EvalResult;
  stage: Stage;
  onGenerate: (type: DocumentGenerationType) => void;
  onReset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const color = fitColor(result.score);

  const colorMap: Record<string, { bg: string; border: string; text: string; pill: string }> = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800',    pill: 'bg-blue-100 text-blue-700 border-blue-200' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   pill: 'bg-amber-100 text-amber-700 border-amber-200' },
    red:     { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     pill: 'bg-red-100 text-red-700 border-red-200' },
  };
  const c = colorMap[color];

  const generating = stage.kind === 'generating';
  const generatingType = stage.kind === 'generating' ? stage.documentType : null;
  const resumeGenerated = (stage.kind === 'done' || stage.kind === 'generating') ? !!stage.resumePdf : false;
  const coverLetterGenerated = (stage.kind === 'done' || stage.kind === 'generating') ? !!stage.coverLetterPdf : false;
  const done = stage.kind === 'done';

  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl overflow-hidden mb-10`}>
      {/* Header row */}
      <div className="px-6 pt-5 pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Evaluation result</p>
          <h2 className="text-lg font-bold text-slate-900 truncate">{result.company}</h2>
          <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5 flex-wrap">
            <span>{result.jobTitle}</span>
            {result.location && (
              <span className="flex items-center gap-1 text-slate-400">
                <MapPin className="w-3 h-3" />{result.location}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-700 mt-3 leading-relaxed">{result.summary}</p>
        </div>
        <div className="shrink-0">
          <ScoreBadge score={result.score} fitLevel={result.fitLevel} />
        </div>
      </div>

      {/* Details toggle */}
      <div className="px-6 pb-3">
        <button
          onClick={() => setShowDetails(v => !v)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
        >
          {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {showDetails ? 'Hide details' : 'Show matched skills & gaps'}
        </button>

        {showDetails && (
          <div className="mt-3 space-y-4">
            {result.adjustedByGuardrails && result.guardrails && result.guardrails.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Score guardrails</p>
                <ul className="space-y-1">
                  {result.guardrails.map(guardrail => (
                    <li key={guardrail.code} className="flex items-start gap-2 text-sm text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-semibold">{guardrail.label}</span>
                        <span className="text-amber-800"> — capped at {guardrail.cap}/100. {guardrail.reason}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Matched</p>
                <ul className="space-y-1">
                  {result.matched.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />{m}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Gaps</p>
                <ul className="space-y-1">
                  {result.gaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />{g}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className={`px-6 py-4 border-t ${c.border} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
        {done ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                {stage.resumePdf && stage.coverLetterPdf
                  ? 'Documents generated'
                  : stage.resumePdf
                    ? 'Resume generated'
                    : 'Cover letter generated'}
              </div>
              <Link
                href={`/applications/${result.applicationId}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors shadow-sm"
              >
                Open Application <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => onGenerate('resume')}
                disabled={generating}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4" />{resumeGenerated ? 'Regenerate Resume' : 'Generate Resume'}
              </button>
              <button
                onClick={() => onGenerate('cover-letter')}
                disabled={generating}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4" />{coverLetterGenerated ? 'Regenerate Cover Letter' : 'Generate Cover Letter'}
              </button>
            </div>
            {stage.kind === 'done' && stage.coverage && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${stage.coverage.missing.length === 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
                <span className="font-semibold">ATS keywords: {stage.coverage.covered}/{stage.coverage.total} covered.</span>
                {stage.coverage.missing.length > 0 && (
                  <span> Not covered (no truthful evidence): {stage.coverage.missing.join(', ')}</span>
                )}
              </div>
            )}
            {stage.kind === 'done' && stage.warnings && stage.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
                {stage.warnings.map((warning, index) => (
                  <div key={index}>{warning}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="text-sm text-slate-600">
              {result.score < 70
                ? <span className={`${c.text} font-medium`}>Score below 70 — you can still generate docs if you want this role.</span>
                : <span className="text-slate-600">Ready to generate a tailored resume or cover letter.</span>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={onReset}
                disabled={generating}
                className="text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Evaluate another job
              </button>
              <Link
                href={`/applications/${result.applicationId}`}
                className="text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors underline underline-offset-2"
              >
                View evaluation only
              </Link>
              <button
                onClick={() => onGenerate('resume')}
                disabled={generating}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {generatingType === 'resume'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating resume…</>
                  : <><Sparkles className="w-4 h-4" />{resumeGenerated ? 'Regenerate Resume' : 'Generate Resume'}</>}
              </button>
              <button
                onClick={() => onGenerate('cover-letter')}
                disabled={generating}
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-slate-300 bg-white text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {generatingType === 'cover-letter'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating cover letter…</>
                  : <><Sparkles className="w-4 h-4" />{coverLetterGenerated ? 'Regenerate Cover Letter' : 'Generate Cover Letter'}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobDiscoveryPage() {
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [scannedJobs, setScannedJobs] = useState<ScannedJob[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [fitFilter, setFitFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [recencyFilter, setRecencyFilter] = useState('24h');
  const [roleFilter, setRoleFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('new');
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [jobActionLoading, setJobActionLoading] = useState<string | null>(null);
  const [filterNowMs, setFilterNowMs] = useState(0);

  async function loadScannedJobs() {
    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load scan queue');
      setScannedJobs(Array.isArray(data) ? data as ScannedJob[] : []);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to load scan queue');
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilterNowMs(Date.now());
      void loadScannedJobs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleEvaluate() {
    const trimmed = input.trim();
    if (!trimmed) return;

    setStage({ kind: 'evaluating' });

    try {
      const body = isUrl(trimmed)
        ? { url: trimmed }
        : { text: trimmed };

      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Evaluation failed');

      setStage({ kind: 'evaluated', result: data as EvalResult });
      void loadScannedJobs();
    } catch (err) {
      setStage({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  async function handleEvaluateScanned(job: ScannedJob) {
    if (!job.jobUrl) {
      setScanError('This scanned job has no posting URL to evaluate.');
      return;
    }
    setInput(job.jobUrl);
    setStage({ kind: 'evaluating' });

    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: job.jobUrl,
          applyUrl: job.directApplyUrl ?? job.jobUrl,
          sourceUrl: job.jobUrl,
          scanContext: {
            company: job.company,
            jobTitle: job.jobTitle,
            location: job.location,
            description: job.description ?? null,
            score: job.score,
            fitLevel: job.fitLevel,
            recommendation: job.recommendation,
            summary: job.summary,
            matched: job.matched ?? [],
            gaps: job.gaps ?? [],
            sourceType: job.sourceType ?? null,
            sourceName: job.sourceName ?? job.source ?? null,
            postedAt: job.postedAt,
            directApplyUrl: job.directApplyUrl ?? null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Evaluation failed');
      setStage({ kind: 'evaluated', result: data as EvalResult });
      void loadScannedJobs();
    } catch (err) {
      setStage({ kind: 'error', message: err instanceof Error ? err.message : 'Evaluation failed' });
    }
  }

  async function handleRunScan() {
    setScanLoading(true);
    setScanError(null);
    setScanMessage(null);
    setFilterNowMs(Date.now());

    try {
      const res = await fetch('/api/scan/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Scan failed');
      setScannedJobs(Array.isArray(data.queue) ? data.queue as ScannedJob[] : []);
      setScanMessage(`Scan complete: ${data.added ?? 0} new job${data.added === 1 ? '' : 's'} scored.`);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanLoading(false);
    }
  }

  async function handleImportJobs() {
    const text = importText.trim();
    if (!text) return;

    setImportLoading(true);
    setScanError(null);
    setScanMessage(null);
    setFilterNowMs(Date.now());

    try {
      const res = await fetch('/api/scan/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setScannedJobs(Array.isArray(data.queue) ? data.queue as ScannedJob[] : []);
      setImportText('');
      setScanMessage(`Import complete: ${data.added ?? 0} new job${data.added === 1 ? '' : 's'} added from ${data.imported ?? 0} URL${data.imported === 1 ? '' : 's'}.`);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  async function handleMarkViewed(job: ScannedJob, silent = false) {
    if (job.applicationId || job.reviewState === 'viewed') return;
    if (!silent) {
      setJobActionLoading(`viewed:${job.id}`);
      setScanError(null);
      setScanMessage(null);
    }
    try {
      const res = await fetch('/api/scan/viewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id }),
      });
      const data = await res.json().catch(() => ({})) as { queue?: ScannedJob[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Viewed update failed');
      if (Array.isArray(data.queue)) setScannedJobs(data.queue);
      if (!silent) setScanMessage(`Marked viewed: ${job.company} — ${job.jobTitle}.`);
    } catch (err) {
      if (!silent) setScanError(err instanceof Error ? err.message : 'Viewed update failed');
    } finally {
      if (!silent) setJobActionLoading(null);
    }
  }

  async function handleGenerateDocsForJob(job: ScannedJob, type: DocumentGenerationType) {
    if (!job.applicationId) {
      setScanError('Evaluate this job first so an application folder exists.');
      return;
    }
    const label = type === 'resume' ? 'resume' : 'cover letter';
    setJobActionLoading(`docs:${type}:${job.id}`);
    setScanError(null);
    setScanMessage(null);
    try {
      const res = await fetch(`/api/generate-docs/${job.applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `${label} generation failed`);
      await loadScannedJobs();
      const coverage = summarizeKeywordCoverage(data.resumeReport);
      const coverageNote = coverage ? ` ATS keywords covered: ${coverage.covered}/${coverage.total}.` : '';
      const warning = Array.isArray(data.warnings) && data.warnings.length > 0
        ? ` Warning: ${data.warnings[0]}`
        : '';
      setScanMessage(`Generated ${label} for ${job.company} — ${job.jobTitle}.${coverageNote}${warning}`);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : `${label} generation failed`);
    } finally {
      setJobActionLoading(null);
    }
  }

  async function handleMarkApplied(job: ScannedJob) {
    if (!job.applicationId) {
      setScanError('Evaluate this job first so it can be marked applied.');
      return;
    }
    const confirmed = window.confirm(`Mark "${job.jobTitle}" at ${job.company} as applied? Use this only after you manually submit the application.`);
    if (!confirmed) return;
    setJobActionLoading(`applied:${job.id}`);
    setScanError(null);
    setScanMessage(null);
    try {
      const res = await fetch(`/api/applications/${job.applicationId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Applied' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Status update failed');
      await loadScannedJobs();
      setScanMessage(`Marked applied: ${job.company} — ${job.jobTitle}.`);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Status update failed');
    } finally {
      setJobActionLoading(null);
    }
  }

  const companies = useMemo(
    () => Array.from(new Set(scannedJobs.map(job => job.company).filter(Boolean))).sort(),
    [scannedJobs],
  );
  const sources = useMemo(
    () => Array.from(new Set(scannedJobs.map(job => job.sourceName ?? job.source ?? 'Unknown').filter(Boolean))).sort(),
    [scannedJobs],
  );
  const sourceTypes = useMemo(
    () => Array.from(new Set(scannedJobs.map(job => sourceTypeLabel(job.sourceType)).filter(Boolean))).sort(),
    [scannedJobs],
  );
  const sourceSummary = useMemo<SourceSummaryItem[]>(() => {
    const map = new Map<string, SourceSummaryItem>();
    for (const job of scannedJobs) {
      const sourceType = job.sourceType ?? 'unknown';
      const sourceName = job.sourceName ?? job.source ?? sourceTypeLabel(sourceType);
      const key = `${sourceType}:${sourceName}`;
      const existing = map.get(key) ?? { sourceType, sourceName, count: 0 };
      existing.count += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.sourceName.localeCompare(b.sourceName));
  }, [scannedJobs]);
  const reviewCounts = useMemo(() => ({
    new: scannedJobs.filter(job => !job.hasApplication && job.reviewState !== 'viewed').length,
    viewed: scannedJobs.filter(job => job.reviewState === 'viewed').length,
    evaluated: scannedJobs.filter(job => job.reviewState === 'evaluated').length,
    docs: scannedJobs.filter(job => job.reviewState === 'docs').length,
    applied: scannedJobs.filter(job => job.reviewState === 'applied').length,
    archived: scannedJobs.filter(job => job.reviewState === 'archived').length,
    all: scannedJobs.length,
  }), [scannedJobs]);
  const filteredScannedJobs = useMemo(() => {
    return scannedJobs.filter(job => {
      if (reviewFilter === 'new' && (job.hasApplication || job.reviewState === 'viewed')) return false;
      if (reviewFilter === 'viewed' && job.reviewState !== 'viewed') return false;
      if (reviewFilter === 'evaluated' && job.reviewState !== 'evaluated') return false;
      if (reviewFilter === 'docs' && job.reviewState !== 'docs') return false;
      if (reviewFilter === 'applied' && job.reviewState !== 'applied') return false;
      if (reviewFilter === 'archived' && job.reviewState !== 'archived') return false;
      if (fitFilter !== 'all' && job.fitLevel !== fitFilter) return false;
      if (sourceFilter !== 'all' && (job.sourceName ?? job.source ?? 'Unknown') !== sourceFilter && sourceTypeLabel(job.sourceType) !== sourceFilter) return false;
      if (companyFilter !== 'all' && job.company !== companyFilter) return false;
      if (roleFilter === 'full-time' && !['full_time_new_grad', 'full_time_entry', 'full_time_general'].includes(job.rolePriority ?? '')) return false;
      if (roleFilter === 'new-grad' && job.rolePriority !== 'full_time_new_grad') return false;
      if (roleFilter === 'entry-level' && job.rolePriority !== 'full_time_entry') return false;
      if (roleFilter === 'intern-coop' && job.rolePriority !== 'intern_coop') return false;
      const dateValue = job.postedAt ?? job.firstSeenAt ?? job.scannedAt;
      const time = dateValue ? Date.parse(dateValue) : NaN;
      if (recencyFilter === 'new' && !job.isNew) return false;
      if (recencyFilter === '24h' && (!Number.isFinite(time) || filterNowMs - time > 24 * 60 * 60 * 1000)) return false;
      if (recencyFilter === '72h' && (!Number.isFinite(time) || filterNowMs - time > 72 * 60 * 60 * 1000)) return false;
      if (recencyFilter === '7d' && (!Number.isFinite(time) || filterNowMs - time > 7 * 24 * 60 * 60 * 1000)) return false;
      return true;
    });
  }, [companyFilter, filterNowMs, fitFilter, recencyFilter, reviewFilter, roleFilter, scannedJobs, sourceFilter]);

  const lanes = useMemo(() => [
    { label: 'Strong Apply', jobs: filteredScannedJobs.filter(job => job.score >= 85) },
    { label: 'Apply', jobs: filteredScannedJobs.filter(job => job.score >= 70 && job.score < 85) },
    { label: 'Maybe', jobs: filteredScannedJobs.filter(job => job.score >= 50 && job.score < 70) },
    { label: 'Skip', jobs: filteredScannedJobs.filter(job => job.score < 50) },
  ].filter(lane => lane.jobs.length > 0), [filteredScannedJobs]);

  async function handleGenerate(type: DocumentGenerationType) {
    if (stage.kind !== 'evaluated' && stage.kind !== 'done') return;
    const { result } = stage;
    const existingResumePdf = stage.kind === 'done' ? stage.resumePdf : false;
    const existingCoverLetterPdf = stage.kind === 'done' ? stage.coverLetterPdf : false;
    setStage({
      kind: 'generating',
      result,
      documentType: type,
      resumePdf: existingResumePdf,
      coverLetterPdf: existingCoverLetterPdf,
    });

    try {
      const res = await fetch(`/api/generate-docs/${result.applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');

      setStage({
        kind: 'done',
        result,
        resumePdf: existingResumePdf || !!data.resumePdfGenerated,
        coverLetterPdf: existingCoverLetterPdf || !!data.coverLetterPdfGenerated,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        coverage: summarizeKeywordCoverage(data.resumeReport),
      });
      void loadScannedJobs();
    } catch (err) {
      setStage({ kind: 'error', message: err instanceof Error ? err.message : 'Generation failed' });
    }
  }

  function handleReset() {
    setStage({ kind: 'idle' });
    setInput('');
  }

  const busy = stage.kind === 'evaluating' || stage.kind === 'generating';
  const hasResult = stage.kind === 'evaluated' || stage.kind === 'generating' || stage.kind === 'done';

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">

      {/* Hero */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-600 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          AI-powered job matching
        </div>
        <h1 className="text-3xl font-bold text-slate-900 leading-tight">
          Find jobs that actually fit you.
        </h1>
        <p className="text-slate-500 mt-2 text-base max-w-xl">
          Paste a job description or URL. Get a fit score, then generate a tailored resume and cover letter — all without leaving this page.
        </p>
      </div>

      {/* Input card — hidden once we have a result */}
      {!hasResult && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-10">
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">Evaluate a Job</h2>
            </div>
            <p className="text-sm text-slate-500 ml-9">
              Paste the full job description or a direct job URL.
            </p>
          </div>
          <div className="px-6 py-5">
            <textarea
              className="w-full h-44 text-sm border border-slate-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent font-mono text-slate-800 placeholder:text-slate-400 transition-shadow"
              placeholder="Paste job description or job posting URL here…"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={busy}
            />
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-400 max-w-sm">
                Scores the job against your profile. If it fits, generate tailored documents with one more click.
              </p>
              <button
                onClick={handleEvaluate}
                disabled={!input.trim() || busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {stage.kind === 'evaluating'
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing…</>
                  : <>Evaluate <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {stage.kind === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-10 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Something went wrong</p>
            <p className="text-sm text-red-700 mt-0.5">{stage.message}</p>
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-red-600 hover:text-red-800 font-medium underline underline-offset-2 shrink-0"
          >
            Try again
          </button>
        </div>
      )}

      {/* Score card — shown after evaluation */}
      {hasResult && (
        <>
          <ScoreCard
            result={(stage as { kind: string; result: EvalResult }).result}
            stage={stage}
            onGenerate={handleGenerate}
            onReset={handleReset}
          />
          {/* Allow evaluating another job */}
          {(stage.kind === 'done') && (
            <div className="text-center mb-10">
              <button
                onClick={handleReset}
                className="text-sm text-slate-500 hover:text-slate-800 font-medium underline underline-offset-2 transition-colors"
              >
                Evaluate another job
              </button>
            </div>
          )}
        </>
      )}

      {/* Scanned jobs */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Scanned Jobs</h2>
            <p className="text-xs text-slate-400 mt-0.5">Jobs from portal scanning, scored against your profile</p>
          </div>
          <button
            onClick={handleRunScan}
            disabled={scanLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {scanLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Scanning…</>
              : <><Sparkles className="w-4 h-4 text-amber-500" />Refresh</>}
          </button>
        </div>

        {scanError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {scanError}
          </div>
        )}

        {scanMessage && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {scanMessage}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
            <Upload className="w-4 h-4 text-slate-500" />
            Import job alerts or saved URLs
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              disabled={importLoading}
              placeholder="Paste LinkedIn, Indeed, Glassdoor, Eluta, employer-page URLs, or job-alert lines here…"
              className="w-full h-20 text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-slate-800 placeholder:text-slate-400"
            />
            <button
              onClick={() => void handleImportJobs()}
              disabled={!importText.trim() || importLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {importLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Importing…</>
                : <><Upload className="w-4 h-4" />Import</>}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Imports saved listing signals only. Restricted platforms are not scraped or messaged automatically.
          </p>
        </div>

        {scannedJobs.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
              <Filter className="w-4 h-4 text-slate-500" />
              Scan filters
              <span className="text-xs font-medium text-slate-400 ml-auto">
                {filteredScannedJobs.length} of {scannedJobs.length} shown
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { key: 'new', label: 'New / not evaluated', count: reviewCounts.new },
                { key: 'viewed', label: 'Viewed', count: reviewCounts.viewed },
                { key: 'evaluated', label: 'Evaluated', count: reviewCounts.evaluated },
                { key: 'docs', label: 'Docs ready', count: reviewCounts.docs },
                { key: 'applied', label: 'Applied', count: reviewCounts.applied },
                { key: 'archived', label: 'Archived', count: reviewCounts.archived },
                { key: 'all', label: 'All', count: reviewCounts.all },
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => setReviewFilter(item.key as ReviewFilter)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    reviewFilter === item.key
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                  <span className={reviewFilter === item.key ? 'text-slate-300' : 'text-slate-400'}>{item.count}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <select value={fitFilter} onChange={e => setFitFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700">
                <option value="all">All scores</option>
                <option value="Strong Apply">Strong Apply</option>
                <option value="Apply">Apply</option>
                <option value="Maybe">Maybe</option>
                <option value="Skip">Skip</option>
              </select>
              <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700">
                <option value="all">All companies</option>
                {companies.map(company => <option key={company} value={company}>{company}</option>)}
              </select>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700">
                <option value="all">All sources</option>
                {sources.map(source => <option key={source} value={source}>{source}</option>)}
                {sourceTypes.map(source => <option key={`type-${source}`} value={source}>{source}</option>)}
              </select>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700">
                <option value="all">All role types</option>
                <option value="full-time">Full-time</option>
                <option value="new-grad">New grad</option>
                <option value="entry-level">Entry-level</option>
                <option value="intern-coop">Intern/co-op</option>
              </select>
              <select value={recencyFilter} onChange={e => setRecencyFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-700">
                <option value="24h">Last 24h first</option>
                <option value="72h">Last 72h</option>
                <option value="7d">Last 7 days</option>
                <option value="new">New since last scan</option>
                <option value="all">Any recency</option>
              </select>
            </div>
            {sourceSummary.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sourceSummary.map(source => (
                  <span key={`${source.sourceType}:${source.sourceName}`} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                    {source.sourceName}
                    <span className="text-slate-400">{source.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {scannedJobs.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-20 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-700 font-semibold text-base">No scanned jobs yet</p>
            <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto leading-relaxed">
              Refresh scan results to pull new jobs from configured portals and rank them before full evaluation.
            </p>
          </div>
        ) : filteredScannedJobs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl py-14 text-center">
            <p className="text-slate-700 font-semibold text-base">No jobs match those filters</p>
            <p className="text-slate-400 text-sm mt-2">Loosen the score, company, source, or recency filter.</p>
          </div>
        ) : (
          <div className="space-y-7">
            {lanes.map(lane => (
              <section key={lane.label}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800">{lane.label}</h3>
                  <span className="text-xs text-slate-400">{lane.jobs.length} job{lane.jobs.length === 1 ? '' : 's'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {lane.jobs.map(job => (
              <div key={job.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all duration-200 group">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                      <span className="text-sm font-bold text-slate-600">{job.company[0]}</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 truncate">{job.company}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 truncate">{job.jobTitle}</p>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">{job.summary}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />{recencyText(job)}
                      </span>
                      <span>{job.sourceName ?? job.source ?? 'Unknown source'}</span>
                      {job.isNew && <span className="text-emerald-600 font-semibold">New</span>}
                      {job.lastActivityAt && (
                        <span className="text-slate-500 font-medium">
                          Last activity {formatDateTime(job.lastActivityAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        job.reviewState === 'applied'
                          ? 'border-blue-100 bg-blue-50 text-blue-700'
                          : job.reviewState === 'docs'
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                            : job.reviewState === 'evaluated'
                              ? 'border-amber-100 bg-amber-50 text-amber-700'
                              : job.reviewState === 'viewed'
                                ? 'border-violet-100 bg-violet-50 text-violet-700'
                                : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}>
                        {reviewStateLabel(job)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {rolePriorityLabel(job.rolePriority)}
                      </span>
                      {job.employmentType && (
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          {job.employmentType}
                        </span>
                      )}
                      {job.freshnessBucket && job.freshnessBucket !== 'unknown' && (
                        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          {job.freshnessBucket}
                        </span>
                      )}
                    </div>
                    {job.location && (
                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{job.location}
                      </p>
                    )}
                    {job.scoringMode === 'local-fallback' && (
                      <p className="text-[11px] text-amber-600 mt-1.5 font-medium">Local fallback score</p>
                    )}
                  </div>
                  <ScoreBadge score={job.score} fitLevel={job.fitLevel} />
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-100">
                  {(job.directApplyUrl ?? job.jobUrl) && (
                    <a href={job.directApplyUrl ?? job.jobUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                      onClick={() => void handleMarkViewed(job, true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                      <ExternalLink className="w-3 h-3" /> Apply Link
                    </a>
                  )}
                  {!job.applicationId && job.reviewState !== 'viewed' && (
                    <button
                      onClick={() => void handleMarkViewed(job)}
                      disabled={busy || jobActionLoading === `viewed:${job.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-violet-200 rounded-lg text-violet-700 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {jobActionLoading === `viewed:${job.id}`
                        ? <><Loader2 className="w-3 h-3 animate-spin" />Saving</>
                        : <><Eye className="w-3 h-3" />Mark viewed</>}
                    </button>
                  )}
                  {job.applicationId && (
                    <Link
                      href={`/applications/${job.applicationId}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    >
                      Open
                    </Link>
                  )}
                  {job.applicationId && job.reviewState !== 'applied' && (
                    <>
                      <button
                        onClick={() => void handleGenerateDocsForJob(job, 'resume')}
                        disabled={busy || jobActionLoading === `docs:resume:${job.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {jobActionLoading === `docs:resume:${job.id}`
                          ? <><Loader2 className="w-3 h-3 animate-spin" />Generating</>
                          : <><Sparkles className="w-3 h-3" />{job.hasResume ? 'Regenerate resume' : 'Generate resume'}</>}
                      </button>
                      <button
                        onClick={() => void handleGenerateDocsForJob(job, 'cover-letter')}
                        disabled={busy || jobActionLoading === `docs:cover-letter:${job.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {jobActionLoading === `docs:cover-letter:${job.id}`
                          ? <><Loader2 className="w-3 h-3 animate-spin" />Generating</>
                          : <><Sparkles className="w-3 h-3" />{job.hasCoverLetter ? 'Regenerate cover letter' : 'Generate cover letter'}</>}
                      </button>
                    </>
                  )}
                  {job.applicationId && job.reviewState !== 'applied' && (
                    <button
                      onClick={() => void handleMarkApplied(job)}
                      disabled={busy || jobActionLoading === `applied:${job.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {jobActionLoading === `applied:${job.id}`
                        ? <><Loader2 className="w-3 h-3 animate-spin" />Saving</>
                        : <><CheckCircle2 className="w-3 h-3" />Mark applied</>}
                    </button>
                  )}
                  <button
                    onClick={() => void handleEvaluateScanned(job)}
                    disabled={!job.jobUrl || busy}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium ml-auto"
                  >
                    <Sparkles className="w-3 h-3" /> {job.applicationId ? 'Re-evaluate' : 'Evaluate'}
                  </button>
                </div>
              </div>
            ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
