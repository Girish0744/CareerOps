'use client';

import { useState } from 'react';
import Link from 'next/link';
import ScoreBadge from '@/components/ScoreBadge';
import {
  Briefcase, ExternalLink, MapPin, Loader2, CheckCircle2,
  Sparkles, ArrowRight, AlertTriangle, XCircle, ChevronDown, ChevronUp,
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

type Stage =
  | { kind: 'idle' }
  | { kind: 'evaluating' }
  | { kind: 'evaluated'; result: EvalResult }
  | { kind: 'generating'; result: EvalResult }
  | { kind: 'done'; result: EvalResult; resumePdf: boolean; coverLetterPdf: boolean }
  | { kind: 'error'; message: string };

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

// ── Score Card ────────────────────────────────────────────────────────────────

function ScoreCard({
  result, stage, onGenerate, onReset,
}: {
  result: EvalResult;
  stage: Stage;
  onGenerate: () => void;
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
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Documents generated
            </div>
            <Link
              href={`/applications/${result.applicationId}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors shadow-sm"
            >
              Open Application <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <>
            <div className="text-sm text-slate-600">
              {result.score < 70
                ? <span className={`${c.text} font-medium`}>Score below 70 — you can still generate docs if you want this role.</span>
                : <span className="text-slate-600">Ready to generate a tailored resume and cover letter.</span>}
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
                onClick={onGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                  : <><Sparkles className="w-4 h-4" />Generate Resume &amp; Cover Letter</>}
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

  const scannedJobs: Array<{
    id: string; company: string; jobTitle: string;
    location: string | null; jobUrl: string | null;
    score: number; fitLevel: string;
  }> = [];

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
    } catch (err) {
      setStage({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  async function handleGenerate() {
    if (stage.kind !== 'evaluated') return;
    const { result } = stage;
    setStage({ kind: 'generating', result });

    try {
      const res = await fetch(`/api/generate-docs/${result.applicationId}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generation failed');

      setStage({
        kind: 'done',
        result,
        resumePdf: data.resumePdfGenerated,
        coverLetterPdf: data.coverLetterPdfGenerated,
      });
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
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full font-medium">
            Coming in Phase 13
          </span>
        </div>

        {scannedJobs.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl py-20 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-slate-700 font-semibold text-base">No scanned jobs yet</p>
            <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto leading-relaxed">
              Once portal scanning is connected, jobs will appear here pre-scored — one click to generate documents for the ones you want.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {scannedJobs.map(job => (
              <div key={job.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all duration-200 group">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                      <span className="text-sm font-bold text-slate-600">{job.company[0]}</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 truncate">{job.company}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 truncate">{job.jobTitle}</p>
                    {job.location && (
                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{job.location}
                      </p>
                    )}
                  </div>
                  <ScoreBadge score={job.score} fitLevel={job.fitLevel} />
                </div>
                <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
                  {job.jobUrl && (
                    <a href={job.jobUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                      <ExternalLink className="w-3 h-3" /> View Posting
                    </a>
                  )}
                  <button className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium ml-auto">
                    <Sparkles className="w-3 h-3" /> Generate Application
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
