'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import StatusBadge, { ALL_STATUSES } from '@/components/StatusBadge';
import ScoreBadge from '@/components/ScoreBadge';
import DocIndicators from '@/components/DocIndicators';
import type { ApplicationEntry } from '@/lib/filesystem';
import { MapPin, Calendar, ExternalLink, Search, Briefcase, TrendingUp, Mail, X, Check } from 'lucide-react';

interface SyncEntry {
  messageId: string;
  appId: string;
  company: string;
  jobTitle: string;
  from: string;
  subject: string;
  date: string;
  class: string;
  current: string;
  next: string | null;
  reason?: string;
}

interface SyncResult {
  mode: 'preview' | 'apply' | 'dismiss';
  waitingCount: number;
  scanned: number;
  updates: SyncEntry[];
  review: SyncEntry[];
}

function timeValue(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Email timestamps carry the weekday: "did this arrive Friday?" is the question. */
function formatEmailDate(value?: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function activityLines(app: ApplicationEntry) {
  const lines: string[] = [];
  if (app.evaluatedAt) lines.push(`Evaluated ${formatDateTime(app.evaluatedAt)}`);
  if (app.lastDocumentGeneratedAt) lines.push(`Docs ${formatDateTime(app.lastDocumentGeneratedAt)}`);
  if (app.appliedAt) lines.push(`Applied ${formatDateTime(app.appliedAt)}`);
  return lines;
}

export default function ApplicationsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<ApplicationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [syncBusy, setSyncBusy] = useState<null | 'preview' | 'apply' | 'dismiss' | 'resolve'>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/applications')
      .then(r => r.json())
      .then((data: ApplicationEntry[]) => { setApps(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  /** Apply or ignore specific messages without re-reading the mailbox. */
  async function resolveEntries(apply: SyncEntry[], dismiss: SyncEntry[]) {
    const ids = new Set([...apply, ...dismiss].map(e => e.messageId));
    setSyncBusy('resolve');
    setSyncError(null);
    try {
      const res = await fetch('/api/inbox/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'resolve', apply, dismiss }),
      });
      const data = await res.json() as { skipped?: Array<{ reason: string; company: string }>; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not save that decision');
      if (data.skipped?.length) {
        setSyncError(data.skipped.map(s => `${s.company}: ${s.reason}`).join('\n'));
      }
      // Drop the handled rows; close the panel once nothing is left.
      setSync(prev => {
        if (!prev) return prev;
        const updates = prev.updates.filter(u => !ids.has(u.messageId));
        const review = prev.review.filter(r => !ids.has(r.messageId));
        return updates.length === 0 && review.length === 0 ? null : { ...prev, updates, review };
      });
      if (apply.length > 0) setApps(await (await fetch('/api/applications')).json());
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusy(null);
    }
  }

  async function runSync(mode: 'preview' | 'apply' | 'dismiss') {
    setSyncBusy(mode);
    setSyncError(null);
    try {
      const res = await fetch('/api/inbox/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, days: 45 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Inbox sync failed');
      if (mode === 'preview') {
        setSync(data as SyncResult);
      } else {
        // Applying rewrote statuses; dismissing only silenced the messages.
        setSync(null);
        if (mode === 'apply') {
          setApps(await (await fetch('/api/applications')).json());
        }
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusy(null);
    }
  }

  const filtered = apps
    .filter(a => filter === 'All' || a.status === filter)
    .filter(a =>
      !search ||
      a.company.toLowerCase().includes(search.toLowerCase()) ||
      a.jobTitle.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => timeValue(b.lastActivityAt ?? b.updatedAt ?? b.createdAt) - timeValue(a.lastActivityAt ?? a.updatedAt ?? a.createdAt));

  const stats = {
    total: apps.length,
    interview: apps.filter(a => a.status === 'Interview').length,
    applied: apps.filter(a => a.status === 'Applied').length,
    offer: apps.filter(a => a.status === 'Offer').length,
    avgScore: apps.filter(a => a.score).length
      ? Math.round(apps.filter(a => a.score).reduce((s, a) => s + (a.score ?? 0), 0) / apps.filter(a => a.score).length)
      : null,
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading applications...</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Application Tracker</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {apps.length} application{apps.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => runSync('preview')}
            disabled={syncBusy !== null}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed">
            <Mail className={`w-4 h-4 ${syncBusy === 'preview' ? 'animate-pulse' : ''}`} />
            {syncBusy === 'preview' ? 'Reading inbox...' : 'Check inbox'}
          </button>
          <Link href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors shadow-sm">
            <Briefcase className="w-4 h-4" /> Evaluate New Job
          </Link>
        </div>
      </div>

      {syncError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-800">Inbox sync failed</p>
          <pre className="mt-1 text-xs text-red-700 whitespace-pre-wrap font-mono">{syncError}</pre>
        </div>
      )}

      {/* Inbox sync results — nothing is written until a button here is clicked. */}
      {sync && (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Inbox check</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {sync.scanned} new message{sync.scanned !== 1 ? 's' : ''} across {sync.waitingCount} application
                {sync.waitingCount !== 1 ? 's' : ''} awaiting a reply
              </p>
            </div>
            <button onClick={() => setSync(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {sync.updates.length === 0 && sync.review.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-500">No recruiter replies matched. Nothing to change.</p>
          )}

          {sync.updates.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                Proposed status changes
              </p>
              <div className="space-y-3">
                {sync.updates.map(u => (
                  <div key={u.messageId} className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-900">{u.company}</span>
                          <span className="text-sm text-slate-500">{u.jobTitle}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <StatusBadge status={u.current} />
                          <span className="text-slate-400 text-xs">&rarr;</span>
                          {u.next && <StatusBadge status={u.next} />}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => resolveEntries([u], [])}
                          disabled={syncBusy !== null}
                          title="Apply this status change"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40">
                          <Check className="w-3.5 h-3.5" /> Apply
                        </button>
                        <button
                          onClick={() => resolveEntries([], [u])}
                          disabled={syncBusy !== null}
                          title="Ignore this email — no status change"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40">
                          <X className="w-3.5 h-3.5" /> Ignore
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 truncate">
                      &ldquo;{u.subject}&rdquo; &middot; {u.from}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatEmailDate(u.date)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sync.review.length > 0 && (
            <div className="px-5 py-4 border-t border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                Needs your eyes ({sync.review.length}) — no change proposed
              </p>
              <div className="space-y-2.5">
                {sync.review.map(r => (
                  <div key={r.messageId} className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-xs text-slate-600">
                      <span className="font-medium text-slate-800">{r.company}</span>
                      {r.reason && <span className="text-slate-400"> · {r.reason}</span>}
                      <p className="text-slate-500 truncate">&ldquo;{r.subject}&rdquo; · {r.from}</p>
                      <p className="text-slate-400">{formatEmailDate(r.date)}</p>
                    </div>
                    <button
                      onClick={() => resolveEntries([], [r])}
                      disabled={syncBusy !== null}
                      title="Ignore this email"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40 shrink-0">
                      <X className="w-3.5 h-3.5" /> Ignore
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(sync.updates.length > 0 || sync.review.length > 0) && (
            <div className="flex items-center gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => runSync('apply')}
                disabled={syncBusy !== null || sync.updates.length === 0}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {syncBusy === 'apply' ? 'Applying...' : `Apply all ${sync.updates.length}`}
              </button>
              <button
                onClick={() => resolveEntries([], [...sync.updates, ...sync.review])}
                disabled={syncBusy !== null}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-40">
                {syncBusy === 'resolve' ? 'Saving...' : 'Ignore all'}
              </button>
              <p className="text-xs text-slate-500 ml-auto">Nothing is saved until you choose.</p>
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      {apps.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total', value: stats.total, color: 'bg-slate-100 text-slate-700' },
            { label: 'Applied', value: stats.applied, color: 'bg-blue-50 text-blue-700' },
            { label: 'Interview', value: stats.interview, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Avg Score', value: stats.avgScore ? `${stats.avgScore}/100` : '—', color: 'bg-amber-50 text-amber-700' },
          ].map(stat => (
            <div key={stat.label} className={`${stat.color} rounded-xl px-4 py-3`}>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs font-medium opacity-70 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow"
            placeholder="Search company or role..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="All">All statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-20 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-slate-700 font-semibold">No applications yet</p>
          <p className="text-slate-400 text-sm mt-2">
            Head to{' '}
            <Link href="/" className="text-slate-900 font-medium underline underline-offset-2">Job Discovery</Link>
            {' '}to evaluate your first job.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Company & Role</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Score</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Docs</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Latest Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(app => (
                <tr key={app.id}
                  className="hover:bg-slate-50 transition-colors group cursor-pointer"
                  onClick={() => router.push(`/applications/${app.id}`)}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors text-sm">
                      {app.company}
                    </div>
                    <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{app.jobTitle}</span>
                      {app.location && (
                        <span className="flex items-center gap-0.5 text-slate-400">
                          <MapPin className="w-3 h-3" />{app.location}
                        </span>
                      )}
                      {app.jobUrl && (
                        <a href={app.jobUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700"
                          onClick={e => e.stopPropagation()}>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <ScoreBadge score={app.score} fitLevel={app.fitLevel} />
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="px-5 py-4">
                    <DocIndicators
                      resume={!!app.resumePath}
                      coverLetter={!!app.coverLetterPath}
                      interviewPrep={!!app.interviewPrepPath}
                      report={!!app.reportPath}
                    />
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-xs min-w-44">
                    <span className="flex items-center gap-1 text-slate-500 font-medium">
                      <Calendar className="w-3 h-3" />{formatDateTime(app.lastActivityAt ?? app.updatedAt ?? app.createdAt)}
                    </span>
                    {activityLines(app).length > 0 && (
                      <div className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                        {activityLines(app).map(line => <div key={line}>{line}</div>)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
