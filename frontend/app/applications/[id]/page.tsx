'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StatusBadge, { ALL_STATUSES } from '@/components/StatusBadge';
import ScoreBadge from '@/components/ScoreBadge';
import ChatPanel from '@/components/ChatPanel';
import type { ApplicationDetail } from '@/lib/filesystem';
import {
  ArrowLeft, ExternalLink, FileText, Mail, Briefcase,
  ChevronDown, Loader2, MapPin, Link2, BookOpen, Sparkles, Download,
} from 'lucide-react';

type Tab = 'resume' | 'cover-letter' | 'job-description' | 'interview' | 'notes';

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('resume');
  const [statusChanging, setStatusChanging] = useState(false);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [showLinkedinPrompt, setShowLinkedinPrompt] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [interviewGenerated, setInterviewGenerated] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then(r => r.json())
      .then((data: ApplicationDetail) => { setApp(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, refreshTick]);

  async function changeStatus(newStatus: string) {
    if (!app) return;
    setStatusChanging(true);
    await fetch(`/api/applications/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setApp(prev => prev ? { ...prev, status: newStatus } : prev);
    setStatusChanging(false);
  }

  async function generateInterview() {
    setInterviewLoading(true);
    setShowLinkedinPrompt(false);
    await fetch('/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: id, linkedinUrl: linkedinUrl || undefined }),
    });
    setInterviewGenerated(true);
    setInterviewLoading(false);
    setLinkedinUrl('');
    setActiveTab('interview');
    setRefreshTick(t => t + 1);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
        <p className="text-slate-500 text-sm">Loading application...</p>
      </div>
    </div>
  );

  if (!app) return (
    <div className="max-w-3xl mx-auto px-6 py-16 text-center">
      <p className="text-slate-500">Application not found.</p>
      <Link href="/applications" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
        Back to tracker
      </Link>
    </div>
  );

  const tabs: { key: Tab; label: string; icon: React.ReactNode; available: boolean }[] = [
    { key: 'resume',          label: 'Resume',          icon: <FileText className="w-3.5 h-3.5" />,  available: !!app.resumeMd },
    { key: 'cover-letter',    label: 'Cover Letter',    icon: <Mail className="w-3.5 h-3.5" />,       available: !!app.coverLetterMd },
    { key: 'job-description', label: 'Job Description', icon: <Briefcase className="w-3.5 h-3.5" />, available: !!app.jobDescription },
    { key: 'interview',       label: 'Interview Prep',  icon: <BookOpen className="w-3.5 h-3.5" />,  available: !!app.interviewMd || interviewGenerated },
    { key: 'notes',           label: 'Notes',           icon: <FileText className="w-3.5 h-3.5" />,  available: !!app.notesMd },
  ];

  const activeContent = () => {
    switch (activeTab) {
      case 'resume':          return app.resumeMd;
      case 'cover-letter':    return app.coverLetterMd;
      case 'job-description': return app.jobDescription;
      case 'interview':       return app.interviewMd;
      case 'notes':           return app.notesMd;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">

      {/* Back */}
      <Link href="/applications"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors font-medium">
        <ArrowLeft className="w-4 h-4" /> Back to tracker
      </Link>

      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-lg font-bold text-slate-600 shrink-0">
              {app.company[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{app.company}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-slate-500">
                <span>{app.jobTitle}</span>
                {app.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />{app.location}
                  </span>
                )}
                {app.jobUrl && (
                  <a href={app.jobUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-500 hover:text-blue-700 font-medium">
                    <ExternalLink className="w-3.5 h-3.5" /> View Posting
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Score + Status */}
          <div className="flex items-center gap-4 shrink-0">
            <ScoreBadge score={app.score} fitLevel={app.fitLevel} />
            <div className="flex items-center gap-2">
              <StatusBadge status={app.status} />
              <div className="relative">
                <select
                  className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
                  value={app.status}
                  onChange={e => changeStatus(e.target.value)}
                  disabled={statusChanging}
                >
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
              </div>
              {statusChanging && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            </div>
          </div>
        </div>

        {/* Actions row: PDF downloads + Interview Guide */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-3">
          {/* PDF downloads — only shown when PDFs exist */}
          {app.resumePath && (
            <a
              href={`/api/applications/${id}/pdf?type=resume`}
              download
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" /> Resume PDF
            </a>
          )}
          {app.coverLetterPath && (
            <a
              href={`/api/applications/${id}/pdf?type=cover-letter`}
              download
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" /> Cover Letter PDF
            </a>
          )}

          {/* Divider if both download buttons and interview button shown */}
          {(app.resumePath || app.coverLetterPath) && (
            <div className="w-px h-6 bg-slate-200 hidden sm:block" />
          )}

          {!showLinkedinPrompt ? (
            <button
              onClick={() => setShowLinkedinPrompt(true)}
              disabled={interviewLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {interviewLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Generating guide...</>
                : <><Sparkles className="w-4 h-4" />Generate Interview Guide</>}
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <Link2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900">Do you have the interviewer&apos;s LinkedIn?</p>
                <p className="text-xs text-emerald-700 mt-0.5">Optional — skip to generate a standard guide, or paste their URL for personalised questions.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <input
                  type="url"
                  placeholder="linkedin.com/in/..."
                  value={linkedinUrl}
                  onChange={e => setLinkedinUrl(e.target.value)}
                  className="w-52 text-sm px-3 py-2 border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-800"
                />
                <button onClick={generateInterview}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                  Generate
                </button>
                <button onClick={() => setShowLinkedinPrompt(false)}
                  className="px-4 py-2 border border-emerald-300 text-emerald-700 text-sm rounded-lg hover:bg-emerald-100 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main layout: doc viewer + chat */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">

        {/* Left: document viewer */}
        <div className="flex flex-col">
          {/* Tabs */}
          <div className="flex gap-0.5 bg-white border border-slate-200 rounded-t-xl px-2 pt-2">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-px
                  ${activeTab === tab.key
                    ? 'bg-slate-50 border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                  ${!tab.available ? 'opacity-40' : ''}`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 bg-white border border-t-0 border-slate-200 rounded-b-xl overflow-hidden min-h-96">
            {activeContent() ? (
              <pre className="p-6 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-y-auto h-full max-h-[700px]">
                {activeContent()}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-20">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                  <FileText className="w-6 h-6 opacity-40" />
                </div>
                <p className="font-semibold text-slate-500">Not generated yet</p>
                <p className="text-xs mt-1 text-slate-400">
                  {activeTab === 'interview'
                    ? 'Click "Generate Interview Guide" above.'
                    : 'Run the pipeline from Job Discovery.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: chat */}
        <div className="h-[640px] lg:h-auto">
          <ChatPanel
            applicationId={id}
            onDocumentUpdated={(filename) => {
              setRefreshTick(t => t + 1);
              if (filename === 'resume.md') setActiveTab('resume');
              if (filename === 'cover-letter.md') setActiveTab('cover-letter');
            }}
          />
        </div>
      </div>
    </div>
  );
}
