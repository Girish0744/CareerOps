'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StatusBadge, { ALL_STATUSES } from '@/components/StatusBadge';
import ScoreBadge from '@/components/ScoreBadge';
import ChatPanel from '@/components/ChatPanel';
import type { ApplicationDetail } from '@/lib/filesystem';
import {
  ArrowLeft, ExternalLink, FileText, Mail, Briefcase,
  ChevronDown, Loader2, MapPin, Link2, BookOpen, Sparkles, Download, Code2, Eye,
  UserSearch, Send, Copy, AlertTriangle, CheckCircle2, Upload,
} from 'lucide-react';

type Tab = 'resume' | 'cover-letter' | 'job-description' | 'interview' | 'outreach' | 'apply' | 'notes';

interface ContactLead {
  id: string;
  name: string;
  title: string;
  company: string;
  linkedinUrl: string | null;
  email: string | null;
  sourceUrl: string | null;
  confidence: string;
  rationale: string;
  outreach?: {
    linkedinConnectionNote?: string;
    linkedinFollowUp?: string;
    coldEmailSubject?: string;
    coldEmailBody?: string;
  };
}

interface ApplyField {
  id: string;
  key?: string;
  label: string;
  value: string;
  fieldType: string;
  confidence: string;
  source: string;
  reviewed: boolean;
  needsReview: boolean;
}

interface ApplyAnswer {
  id: string;
  question: string;
  label?: string;
  answer: string;
  fieldType: string;
  confidence: string;
  source: string;
  reviewed: boolean;
  needsReview: boolean;
}

interface ApplySession {
  applicationId: string;
  applyUrl: string | null;
  status: string;
  finalSubmitPolicy: string;
  automationStage: string;
  automation?: {
    status: string;
    provider: string;
    stoppedReason: string;
    currentUrl: string;
    browserLeftOpen: boolean;
    fieldsFilled: Array<{ label: string; key?: string; source?: string }>;
    filesUploaded: Array<{ label: string; key?: string; path?: string }>;
    uncertainFields: Array<{ label: string; reason: string }>;
    applyPageResolution?: {
      attempted: boolean;
      clicked: boolean;
      label?: string;
      reason: string;
      fromUrl: string;
      toUrl: string;
    } | null;
  };
  documents: {
    resumePath: string | null;
    coverLetterPath: string | null;
    transcriptPath: string | null;
  };
  standardFields: ApplyField[];
  answers: ApplyAnswer[];
  uncertainFields: Array<ApplyField | ApplyAnswer>;
  notes?: string[];
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function inlineMarkdown(value: string) {
  return escapeHtml(value).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split('\n');
  const html: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) { html.push('</ul>'); inList = false; }
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
    } else {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  if (inList) html.push('</ul>');
  return html.join('\n');
}

function DocumentPreview({ content }: { content: string }) {
  return (
    <article
      className="doc-preview"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
    />
  );
}

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
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [contacts, setContacts] = useState<ContactLead[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactLinkedinUrls, setContactLinkedinUrls] = useState('');
  const [contactPublicNotes, setContactPublicNotes] = useState('');
  const [applySession, setApplySession] = useState<ApplySession | null>(null);
  const [applyQuestions, setApplyQuestions] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyDocsLoading, setApplyDocsLoading] = useState(false);
  const [applyAutomationLoading, setApplyAutomationLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then(r => r.json())
      .then((data: ApplicationDetail) => { setApp(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, refreshTick]);

  useEffect(() => {
    fetch(`/api/applications/${id}/contacts`)
      .then(r => r.json())
      .then((data: { contacts?: ContactLead[] }) => setContacts(Array.isArray(data.contacts) ? data.contacts : []))
      .catch(() => setContacts([]));
  }, [id]);

  useEffect(() => {
    fetch(`/api/applications/${id}/apply`)
      .then(r => r.json())
      .then((data: ApplySession) => setApplySession(data))
      .catch(() => setApplySession(null));
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
    setInterviewError(null);
    setShowLinkedinPrompt(false);
    const res = await fetch('/api/interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: id, linkedinUrl: linkedinUrl || undefined }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) {
      setInterviewError(data.error ?? 'Interview guide generation failed.');
      setInterviewLoading(false);
      return;
    }
    setInterviewGenerated(true);
    setInterviewLoading(false);
    setLinkedinUrl('');
    setActiveTab('interview');
    setRefreshTick(t => t + 1);
  }

  async function generateContacts() {
    setContactLoading(true);
    setContactError(null);
    const linkedinUrls = contactLinkedinUrls
      .split(/\s+/)
      .map(url => url.trim())
      .filter(Boolean);
    const res = await fetch(`/api/applications/${id}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedinUrls, publicNotes: contactPublicNotes }),
    });
    const data = await res.json().catch(() => ({})) as { contacts?: ContactLead[]; error?: string };
    if (!res.ok) {
      setContactError(data.error ?? 'Outreach generation failed.');
      setContactLoading(false);
      return;
    }
    setContacts(Array.isArray(data.contacts) ? data.contacts : []);
    setContactLinkedinUrls('');
    setContactPublicNotes('');
    setContactLoading(false);
    setActiveTab('outreach');
  }

  async function refreshApplication() {
    const res = await fetch(`/api/applications/${id}`);
    if (!res.ok) return null;
    const data = await res.json() as ApplicationDetail;
    setApp(data);
    return data;
  }

  async function generateMissingDocsIfNeeded(current: ApplicationDetail) {
    if (current.resumePath && current.coverLetterPath) return current;
    setApplyDocsLoading(true);
    const res = await fetch(`/api/generate-docs/${id}`, { method: 'POST' });
    const data = await res.json().catch(() => ({})) as { error?: string };
    setApplyDocsLoading(false);
    if (!res.ok) throw new Error(data.error ?? 'Document generation failed before apply prep.');
    const refreshed = await refreshApplication();
    return refreshed ?? current;
  }

  async function startApplySession(openPosting = true) {
    if (!app) return;
    const applyWindow = openPosting && app.jobUrl ? window.open('about:blank', '_blank') : null;
    if (applyWindow) applyWindow.opener = null;
    setApplyLoading(true);
    setApplyError(null);
    try {
      const prepared = await generateMissingDocsIfNeeded(app);
      const res = await fetch(`/api/applications/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionsText: applyQuestions }),
      });
      const data = await res.json().catch(() => ({})) as ApplySession & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Apply session failed.');
      setApplySession(data);
      setActiveTab('apply');
      if (openPosting && prepared.jobUrl) {
        if (applyWindow) applyWindow.location.href = prepared.jobUrl;
        else window.open(prepared.jobUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if (applyWindow) applyWindow.close();
      setApplyError(err instanceof Error ? err.message : 'Apply session failed.');
    } finally {
      setApplyLoading(false);
      setApplyDocsLoading(false);
    }
  }

  async function startAssistedFill() {
    if (!app) return;
    setApplyAutomationLoading(true);
    setApplyError(null);
    try {
      await generateMissingDocsIfNeeded(app);
      const prepRes = await fetch(`/api/applications/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionsText: applyQuestions }),
      });
      const prepData = await prepRes.json().catch(() => ({})) as ApplySession & { error?: string };
      if (!prepRes.ok) throw new Error(prepData.error ?? 'Apply session failed.');
      setApplySession(prepData);

      const res = await fetch(`/api/applications/${id}/apply/automate`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as ApplySession & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Assisted fill failed.');
      setApplySession(data);
      setActiveTab('apply');
      await refreshApplication();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Assisted fill failed.');
    } finally {
      setApplyAutomationLoading(false);
      setApplyDocsLoading(false);
    }
  }

  async function copyText(idToCopy: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedId(idToCopy);
    window.setTimeout(() => setCopiedId(null), 1200);
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
    { key: 'outreach',        label: 'Outreach',        icon: <UserSearch className="w-3.5 h-3.5" />, available: contacts.length > 0 },
    { key: 'apply',           label: 'Apply',           icon: <Send className="w-3.5 h-3.5" />,       available: true },
    { key: 'notes',           label: 'Notes',           icon: <FileText className="w-3.5 h-3.5" />,  available: !!app.notesMd },
  ];

  const activeContent = () => {
    switch (activeTab) {
      case 'resume':          return app.resumeMd;
      case 'cover-letter':    return app.coverLetterMd;
      case 'job-description': return app.jobDescription;
      case 'interview':       return app.interviewMd;
      case 'outreach':        return null;
      case 'apply':           return null;
      case 'notes':           return app.notesMd;
    }
  };

  const outreachPanel = (
    <div className="p-5 space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Public-source and user-provided contacts only. No automated LinkedIn scraping, no auto-messaging, and no hidden phone-number collection.
      </div>
      {contacts.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          <UserSearch className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="font-semibold">No outreach contacts generated yet</p>
          <p className="text-xs mt-1">Use the Outreach button above to create contact leads and drafts.</p>
        </div>
      ) : contacts.map(contact => (
        <div key={contact.id} className="border border-slate-200 rounded-xl p-4 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900">{contact.name}</p>
              <p className="text-sm text-slate-500">{contact.title}</p>
              <p className="text-xs text-slate-400 mt-1">Confidence: {contact.confidence} · {contact.rationale}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              {contact.linkedinUrl && (
                <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50">LinkedIn</a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50">Email</a>
              )}
            </div>
          </div>
          {contact.outreach && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">LinkedIn note</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{contact.outreach.linkedinConnectionNote}</p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">LinkedIn follow-up</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{contact.outreach.linkedinFollowUp}</p>
              </div>
              <div className="lg:col-span-2 rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Cold email</p>
                <p className="text-sm font-semibold text-slate-800">{contact.outreach.coldEmailSubject}</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap mt-2">{contact.outreach.coldEmailBody}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const applyPanel = (
    <div className="p-5 space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Assisted fill opens a visible browser, fills only high-confidence fields, and always stops before final Submit/Apply.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Resume</p>
          <p className={`text-sm font-medium ${app.resumePath ? 'text-emerald-700' : 'text-amber-700'}`}>
            {app.resumePath ? 'Ready' : 'Will generate before apply'}
          </p>
          {app.resumePath && <p className="text-xs text-slate-400 mt-1 break-all">{app.resumePath}</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Cover letter</p>
          <p className={`text-sm font-medium ${app.coverLetterPath ? 'text-emerald-700' : 'text-amber-700'}`}>
            {app.coverLetterPath ? 'Ready' : 'Will generate before apply'}
          </p>
          {app.coverLetterPath && <p className="text-xs text-slate-400 mt-1 break-all">{app.coverLetterPath}</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Transcript</p>
          <p className={`text-sm font-medium ${applySession?.documents.transcriptPath ? 'text-emerald-700' : 'text-amber-700'}`}>
            {applySession?.documents.transcriptPath ? 'Configured' : 'Needs private path if requested'}
          </p>
          {applySession?.documents.transcriptPath && (
            <p className="text-xs text-slate-400 mt-1 break-all">{applySession.documents.transcriptPath}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Application questions</p>
            <p className="text-xs text-slate-400 mt-0.5">Paste written questions, checkbox labels, or field labels from the employer form.</p>
          </div>
          {app.jobUrl && (
            <a href={app.jobUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
              <ExternalLink className="w-3 h-3" /> Apply link
            </a>
          )}
        </div>
        <textarea
          value={applyQuestions}
          onChange={e => setApplyQuestions(e.target.value)}
          placeholder="Example: Why are you interested in this role?&#10;Are you legally authorized to work in Canada?&#10;Upload resume&#10;LinkedIn profile"
          className="w-full h-32 text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-800 placeholder:text-slate-400"
          disabled={applyLoading || applyDocsLoading}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void startAssistedFill()}
            disabled={applyLoading || applyDocsLoading || applyAutomationLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {applyAutomationLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Opening browser...</>
              : <><Send className="w-4 h-4" />Start Assisted Fill</>}
          </button>
          <button
            onClick={() => void startApplySession(true)}
            disabled={applyLoading || applyDocsLoading || applyAutomationLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {applyLoading || applyDocsLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" />{applyDocsLoading ? 'Generating docs...' : 'Preparing...'}</>
              : <><Send className="w-4 h-4" />Prepare & Open Apply Link</>}
          </button>
          <button
            onClick={() => void startApplySession(false)}
            disabled={applyLoading || applyDocsLoading || applyAutomationLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles className="w-4 h-4" />Generate Answers Only
          </button>
        </div>
        {applyError && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {applyError}
          </div>
        )}
      </div>

      {applySession && (
        <>
          {applySession.uncertainFields.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2 text-sm text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{applySession.uncertainFields.length} field{applySession.uncertainFields.length === 1 ? '' : 's'} need review before applying.</span>
              </div>
            </div>
          )}

          {applySession.automation && (
            <div className={`rounded-xl border px-4 py-3 ${
              applySession.automation.status === 'blocked'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}>
              <div className="flex items-start gap-2 text-sm">
                {applySession.automation.status === 'blocked'
                  ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
                <div>
                  <p className="font-semibold">
                    {applySession.automation.status === 'blocked' ? 'Assisted fill blocked' : 'Browser ready for review'}
                  </p>
                  <p className="mt-1">{applySession.automation.stoppedReason}</p>
                  <p className="mt-1 text-xs opacity-80">
                    Provider: {applySession.automation.provider} · Filled: {applySession.automation.fieldsFilled.length} · Uploads: {applySession.automation.filesUploaded.length} · Review: {applySession.automation.uncertainFields.length}
                  </p>
                  {applySession.automation.applyPageResolution && (
                    <p className="mt-1 text-xs opacity-80">
                      Apply-page resolver: {applySession.automation.applyPageResolution.clicked ? `clicked "${applySession.automation.applyPageResolution.label}"` : applySession.automation.applyPageResolution.reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-slate-900 mb-3">Known fields</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {applySession.standardFields.map(field => (
                <div key={field.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-500 uppercase">{field.label}</p>
                      <p className={`text-sm mt-1 break-words ${field.value ? 'text-slate-800' : 'text-amber-700'}`}>
                        {field.value || 'Needs review'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">{field.source}</p>
                    </div>
                    {field.value && (
                      <button
                        onClick={() => void copyText(field.id, field.value)}
                        className="shrink-0 p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                        title="Copy"
                      >
                        {copiedId === field.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900 mb-3">Generated answers</p>
            {applySession.answers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center text-slate-400">
                <Upload className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium">Paste questions above to generate reviewable answers.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {applySession.answers.map(answer => (
                  <div key={answer.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{answer.question}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {answer.fieldType} · confidence: {answer.confidence} · {answer.source}
                        </p>
                      </div>
                      {answer.answer && (
                        <button
                          onClick={() => void copyText(answer.id, answer.answer)}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          {copiedId === answer.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          Copy
                        </button>
                      )}
                    </div>
                    <p className={`mt-3 text-sm whitespace-pre-wrap ${answer.answer ? 'text-slate-700' : 'text-amber-700'}`}>
                      {answer.answer || 'Needs review'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

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

          <button
            onClick={() => void startApplySession(true)}
            disabled={applyLoading || applyDocsLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {applyLoading || applyDocsLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" />{applyDocsLoading ? 'Generating docs...' : 'Preparing apply...'}</>
              : <><Send className="w-4 h-4" />Apply</>}
          </button>

          <div className="w-px h-6 bg-slate-200 hidden sm:block" />

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

          <div className="w-px h-6 bg-slate-200 hidden sm:block" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <input
              type="text"
              placeholder="Optional LinkedIn/profile URLs"
              value={contactLinkedinUrls}
              onChange={e => setContactLinkedinUrls(e.target.value)}
              className="w-64 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-slate-800"
            />
            <input
              type="text"
              placeholder="Optional public notes/source"
              value={contactPublicNotes}
              onChange={e => setContactPublicNotes(e.target.value)}
              className="w-64 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-slate-800"
            />
            <button
              onClick={generateContacts}
              disabled={contactLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {contactLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Generating outreach...</>
                : <><UserSearch className="w-4 h-4" />Outreach</>}
            </button>
          </div>
        </div>
        {interviewError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {interviewError}
          </div>
        )}
        {contactError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {contactError}
          </div>
        )}
      </div>

      {/* Main layout: doc viewer + chat */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">

        {/* Left: document viewer */}
        <div className="flex flex-col">
          {/* Tabs */}
          <div className="flex items-end justify-between gap-3 bg-white border border-slate-200 rounded-t-xl px-2 pt-2">
            <div className="flex gap-0.5 overflow-x-auto">
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
            {(activeTab === 'resume' || activeTab === 'cover-letter' || activeTab === 'interview') && activeContent() && (
              <button
                onClick={() => setSourceMode(v => !v)}
                className="mb-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                {sourceMode ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
                {sourceMode ? 'Preview' : 'Source'}
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 bg-white border border-t-0 border-slate-200 rounded-b-xl overflow-hidden min-h-96">
            {activeTab === 'outreach' ? outreachPanel : activeTab === 'apply' ? applyPanel : activeContent() && sourceMode ? (
              <pre className="p-6 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-y-auto h-full max-h-[700px]">
                {activeContent()}
              </pre>
            ) : activeContent() ? (
              <div className="overflow-y-auto h-full max-h-[760px] bg-slate-50 p-5">
                <div className="mx-auto max-w-[850px] min-h-[900px] bg-white shadow-sm border border-slate-200 px-10 py-9">
                  <DocumentPreview content={activeContent() ?? ''} />
                </div>
              </div>
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
