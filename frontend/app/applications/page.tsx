'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import StatusBadge, { ALL_STATUSES } from '@/components/StatusBadge';
import ScoreBadge from '@/components/ScoreBadge';
import DocIndicators from '@/components/DocIndicators';
import type { ApplicationEntry } from '@/lib/filesystem';
import { MapPin, Calendar, ExternalLink, Search, Briefcase, TrendingUp } from 'lucide-react';

export default function ApplicationsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<ApplicationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/applications')
      .then(r => r.json())
      .then((data: ApplicationEntry[]) => { setApps(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = apps
    .filter(a => filter === 'All' || a.status === filter)
    .filter(a =>
      !search ||
      a.company.toLowerCase().includes(search.toLowerCase()) ||
      a.jobTitle.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
        <Link href="/"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-700 transition-colors shadow-sm self-start sm:self-auto">
          <Briefcase className="w-4 h-4" /> Evaluate New Job
        </Link>
      </div>

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
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
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
                  <td className="px-5 py-4 text-slate-400 text-xs">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />{app.createdAt}
                    </span>
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
