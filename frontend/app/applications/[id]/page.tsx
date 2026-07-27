'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import StatusBadge, { ALL_STATUSES } from '@/components/StatusBadge';
import ScoreBadge from '@/components/ScoreBadge';
import ChatPanel from '@/components/ChatPanel';
import type { ApplicationDetail, DocumentVersion } from '@/lib/filesystem';
import {
  ArrowLeft, ExternalLink, FileText, Mail, Briefcase,
  ChevronDown, Loader2, MapPin, Link2, BookOpen, Sparkles, Download, Code2, Eye,
  UserSearch, Send, Copy, AlertTriangle, CheckCircle2, Upload, CalendarClock, RotateCcw,
} from 'lucide-react';

type Tab = 'resume' | 'cover-letter' | 'job-description' | 'interview' | 'outreach' | 'apply' | 'notes';
type DocumentGenerationType = 'resume' | 'cover-letter';
type DocumentGenerationNotice = { kind: 'success' | 'warning'; message: string } | null;

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

interface ApplyEmailDraft {
  isEmailApplication: boolean;
  recipient: string;
  ccRecipients: string[];
  subject: string;
  subjectSource: 'posting' | 'generated' | 'none';
  requestedSubject: string;
  referenceNumber: string;
  closingDate: string;
  contactName: string;
  body: string;
  issues: Array<{ code: string; severity: string; message: string }>;
  generatedAt: string | null;
  attachments: string[];
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

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function versionOptionLabel(version: DocumentVersion) {
  const created = formatDateTime(version.createdAt) ?? version.createdAt;
  return `${created} - ${version.label}`;
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
  const [sourceDraft, setSourceDraft] = useState('');
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceSavedAt, setSourceSavedAt] = useState<string | null>(null);
  const [documentGenerating, setDocumentGenerating] = useState<DocumentGenerationType | null>(null);
  const [documentGenerationError, setDocumentGenerationError] = useState<string | null>(null);
  const [documentGenerationNotice, setDocumentGenerationNotice] = useState<DocumentGenerationNotice>(null);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [versionRestoring, setVersionRestoring] = useState(false);
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
  const [resumeLocationDraft, setResumeLocationDraft] = useState('');
  const [resumeLocationSaving, setResumeLocationSaving] = useState(false);
  const [resumeLocationNotice, setResumeLocationNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [applyEmail, setApplyEmail] = useState<ApplyEmailDraft | null>(null);
  const [applyEmailLoading, setApplyEmailLoading] = useState(false);
  const [applyEmailError, setApplyEmailError] = useState<string | null>(null);
  const [jobDescriptionLoading, setJobDescriptionLoading] = useState(false);
  const [jobDescriptionError, setJobDescriptionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/applications/${id}`)
      .then(r => r.json())
      .then((data: ApplicationDetail) => { setApp(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, refreshTick]);

  useEffect(() => {
    const type = activeTab === 'resume'
      ? 'resume'
      : activeTab === 'cover-letter'
        ? 'cover-letter'
        : null;
    const versions = type ? (app?.documentVersions ?? []).filter(version => version.type === type) : [];
    setSelectedVersionId(versions[0]?.id ?? '');
  }, [activeTab, app?.documentVersions]);

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

  useEffect(() => {
    setResumeLocationDraft(app?.resumeLocation ?? '');
  }, [app?.resumeLocation]);

  useEffect(() => {
    fetch(`/api/applications/${id}/apply/email`)
      .then(r => r.json())
      .then((data: ApplyEmailDraft) => setApplyEmail(data.isEmailApplication ? data : null))
      .catch(() => setApplyEmail(null));
  }, [id, refreshTick]);

  useEffect(() => {
    if (!sourceMode) return;
    const content = activeTab === 'resume'
      ? app?.resumeMd
      : activeTab === 'cover-letter'
        ? app?.coverLetterMd
        : activeTab === 'job-description'
          ? app?.jobDescription
          : activeTab === 'interview'
            ? app?.interviewMd
            : activeTab === 'notes'
              ? app?.notesMd
              : '';
    setSourceDraft(content ?? '');
    setSourceError(null);
    setSourceSavedAt(null);
  }, [sourceMode, activeTab, app?.resumeMd, app?.coverLetterMd, app?.jobDescription, app?.interviewMd, app?.notesMd]);

  const editableSourceFilename = activeTab === 'resume'
    ? 'resume.md'
    : activeTab === 'cover-letter'
      ? 'cover-letter.md'
      : null;

  async function saveSourceEdit() {
    if (!editableSourceFilename) return;
    setSourceSaving(true);
    setSourceError(null);
    setSourceSavedAt(null);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: editableSourceFilename, content: sourceDraft }),
      });
      const data = await res.json().catch(() => ({})) as ApplicationDetail & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not save document edits.');
      setApp(data);
      setSourceSavedAt(new Date().toISOString());
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Could not save document edits.');
    } finally {
      setSourceSaving(false);
    }
  }

  async function changeStatus(newStatus: string) {
    if (!app) return;
    setStatusChanging(true);
    await fetch(`/api/applications/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await refreshApplication();
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

  async function refreshJobDescriptionSnapshot() {
    if (!app) return;
    setJobDescriptionLoading(true);
    setJobDescriptionError(null);
    try {
      const res = await fetch(`/api/applications/${id}/job-description`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Job description refresh failed.');
      await refreshApplication();
      setActiveTab('job-description');
      setSourceMode(false);
    } catch (err) {
      setJobDescriptionError(err instanceof Error ? err.message : 'Job description refresh failed.');
    } finally {
      setJobDescriptionLoading(false);
    }
  }

  async function refreshApplication() {
    const res = await fetch(`/api/applications/${id}`);
    if (!res.ok) return null;
    const data = await res.json() as ApplicationDetail;
    setApp(data);
    return data;
  }

  async function generateApplicationDocument(type: DocumentGenerationType) {
    const label = type === 'resume' ? 'resume' : 'cover letter';
    const action = type === 'resume'
      ? app?.resumeMd || app?.resumePath ? 'Regenerated' : 'Generated'
      : app?.coverLetterMd || app?.coverLetterPath ? 'Regenerated' : 'Generated';

    if (sourceDirty) {
      setDocumentGenerationError('Save or reset your source edits before regenerating a document.');
      return;
    }

    setDocumentGenerating(type);
    setDocumentGenerationError(null);
    setDocumentGenerationNotice(null);
    try {
      const res = await fetch(`/api/generate-docs/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({})) as {
        error?: string;
        warnings?: string[];
      };
      if (!res.ok) throw new Error(data.error ?? `Could not generate ${label}.`);

      const refreshed = await refreshApplication();
      setActiveTab(type);
      setSourceMode(false);
      setSourceDraft(type === 'resume' ? refreshed?.resumeMd ?? '' : refreshed?.coverLetterMd ?? '');
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      setDocumentGenerationNotice({
        kind: warnings.length > 0 ? 'warning' : 'success',
        message: warnings.length > 0 ? `${action} ${label}. ${warnings.join(' · ')}` : `${action} ${label}.`,
      });
    } catch (err) {
      setDocumentGenerationError(err instanceof Error ? err.message : `Could not generate ${label}.`);
    } finally {
      setDocumentGenerating(null);
    }
  }
  async function restoreSelectedDocumentVersion() {
    if (!selectedDocumentVersion) return;

    if (sourceDirty) {
      setDocumentGenerationError('Save or reset your source edits before restoring a previous version.');
      return;
    }

    setVersionRestoring(true);
    setDocumentGenerationError(null);
    setDocumentGenerationNotice(null);
    try {
      const res = await fetch(`/api/applications/${id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: selectedDocumentVersion.id }),
      });
      const data = await res.json().catch(() => ({})) as {
        application?: ApplicationDetail;
        restored?: DocumentVersion;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Could not restore document version.');

      const updated = data.application ?? await refreshApplication();
      if (updated) setApp(updated);
      const restoredType = data.restored?.type ?? selectedDocumentVersion.type;
      setActiveTab(restoredType);
      setSourceMode(false);
      setSourceDraft(restoredType === 'resume' ? updated?.resumeMd ?? '' : updated?.coverLetterMd ?? '');
      setDocumentGenerationNotice({
        kind: 'success',
        message: `Restored ${restoredType === 'resume' ? 'resume' : 'cover letter'} from ${formatDateTime(selectedDocumentVersion.createdAt) ?? selectedDocumentVersion.createdAt}.`,
      });
    } catch (err) {
      setDocumentGenerationError(err instanceof Error ? err.message : 'Could not restore document version.');
    } finally {
      setVersionRestoring(false);
    }
  }

  async function generateMissingDocsIfNeeded(current: ApplicationDetail) {
    if (current.resumePath && current.coverLetterPath) return current;
    setApplyDocsLoading(true);
    const missingTypes: Array<'resume' | 'cover-letter'> = [];
    if (!current.resumePath) missingTypes.push('resume');
    if (!current.coverLetterPath) missingTypes.push('cover-letter');

    try {
      for (const type of missingTypes) {
        const res = await fetch(`/api/generate-docs/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });
        const data = await res.json().catch(() => ({})) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? 'Document generation failed before apply prep.');
      }
      const refreshed = await refreshApplication();
      return refreshed ?? current;
    } finally {
      setApplyDocsLoading(false);
    }
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

  async function saveResumeLocation() {
    setResumeLocationSaving(true);
    setResumeLocationNotice(null);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeLocation: resumeLocationDraft }),
      });
      const data = await res.json().catch(() => ({})) as ApplicationDetail & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not save the header location.');
      setApp(data);
      setResumeLocationNotice({
        kind: 'success',
        message: data.resumeLocation
          ? `Header location set to "${data.resumeLocation}". Documents re-rendered.`
          : 'Header location reset to your profile default. Documents re-rendered.',
      });
    } catch (err) {
      setResumeLocationNotice({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not save the header location.',
      });
    } finally {
      setResumeLocationSaving(false);
    }
  }

  async function generateApplyEmail() {
    if (!app) return;
    setApplyEmailLoading(true);
    setApplyEmailError(null);
    try {
      // The email is the application here, so the resume must exist to attach.
      await generateMissingDocsIfNeeded(app);
      const res = await fetch(`/api/applications/${id}/apply/email`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as ApplyEmailDraft & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not draft the application email.');
      setApplyEmail(data);
      setActiveTab('apply');
    } catch (err) {
      setApplyEmailError(err instanceof Error ? err.message : 'Could not draft the application email.');
    } finally {
      setApplyEmailLoading(false);
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
    { key: 'outreach',        label: 'Outreach',        icon: <UserSearch className="w-3.5 h-3.5" />, available: true },
    { key: 'apply',           label: 'Apply',           icon: <Send className="w-3.5 h-3.5" />,       available: true },
    { key: 'notes',           label: 'Notes',           icon: <FileText className="w-3.5 h-3.5" />,  available: !!app.notesMd },
  ];

  const timelineItems = [
    app.evaluatedAt ? { label: 'Evaluated', value: app.evaluatedAt } : null,
    app.resumeGeneratedAt ? { label: 'Resume generated', value: app.resumeGeneratedAt } : null,
    app.coverLetterGeneratedAt ? { label: 'Cover letter generated', value: app.coverLetterGeneratedAt } : null,
    app.appliedAt ? { label: 'Applied', value: app.appliedAt } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

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

  const isEditableSource = activeTab === 'resume' || activeTab === 'cover-letter';
  const sourceDirty = isEditableSource && sourceDraft !== (activeContent() ?? '');
  const sourceSavedLabel = sourceSavedAt ? formatDateTime(sourceSavedAt) : null;
  const activeDocumentGenerationType: DocumentGenerationType | null = activeTab === 'resume'
    ? 'resume'
    : activeTab === 'cover-letter'
      ? 'cover-letter'
      : null;
  const documentGenerationBlocked = sourceDirty || sourceSaving;
  const activeDocumentVersions = activeDocumentGenerationType
    ? (app.documentVersions ?? []).filter(version => version.type === activeDocumentGenerationType)
    : [];
  const selectedDocumentVersion = activeDocumentVersions.find(version => version.id === selectedVersionId)
    ?? activeDocumentVersions[0]
    ?? null;

  const outreachPanel = (
    <div className="p-5 space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Public-source and user-provided contacts only. No automated LinkedIn scraping, no auto-messaging, and no hidden phone-number collection.
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_auto]">
          <input
            type="text"
            placeholder="Optional LinkedIn/profile URLs"
            value={contactLinkedinUrls}
            onChange={e => setContactLinkedinUrls(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <input
            type="text"
            placeholder="Optional public notes/source"
            value={contactPublicNotes}
            onChange={e => setContactPublicNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <button
            onClick={generateContacts}
            disabled={contactLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {contactLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
              : <><UserSearch className="w-4 h-4" />Generate Outreach</>}
          </button>
        </div>
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

  const applyDocuments = applySession?.documents ?? { resumePath: null, coverLetterPath: null, transcriptPath: null };

  const applyEmailPanel = applyEmail && (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
            <Mail className="w-4 h-4" /> Apply by email
          </p>
          <p className="mt-0.5 text-xs text-indigo-700">
            This posting has no application form. Send the email yourself, nothing is sent automatically.
          </p>
        </div>
        <button
          onClick={() => void generateApplyEmail()}
          disabled={applyEmailLoading || applyDocsLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applyEmailLoading || applyDocsLoading
            ? <><Loader2 className="w-4 h-4 animate-spin" />{applyDocsLoading ? 'Generating docs...' : 'Drafting...'}</>
            : <><Sparkles className="w-4 h-4" />{applyEmail.body ? 'Redraft email' : 'Draft email'}</>}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-indigo-100 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-slate-500">To</p>
              <p className="mt-1 break-all text-sm text-slate-800">{applyEmail.recipient}</p>
              {applyEmail.contactName && (
                <p className="mt-0.5 text-xs text-slate-400">{applyEmail.contactName}</p>
              )}
            </div>
            <button
              onClick={() => void copyText('apply-email-to', applyEmail.recipient)}
              className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
              title="Copy address"
            >
              {copiedId === 'apply-email-to' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-indigo-100 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-slate-500">Subject</p>
              <p className="mt-1 break-words text-sm font-medium text-slate-800">{applyEmail.subject}</p>
              <p className={`mt-1 text-xs ${applyEmail.subjectSource === 'posting' ? 'text-emerald-700' : 'text-amber-700'}`}>
                {applyEmail.subjectSource === 'posting'
                  ? 'Exact subject required by the posting, copied verbatim.'
                  : 'No subject specified in the posting, this is the conventional format.'}
              </p>
            </div>
            <button
              onClick={() => void copyText('apply-email-subject', applyEmail.subject)}
              className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
              title="Copy subject"
            >
              {copiedId === 'apply-email-subject' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {(applyEmail.referenceNumber || applyEmail.closingDate) && (
          <div className="flex flex-wrap gap-2">
            {applyEmail.referenceNumber && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                Ref {applyEmail.referenceNumber}
              </span>
            )}
            {applyEmail.closingDate && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                Closes {applyEmail.closingDate}
              </span>
            )}
          </div>
        )}

        {applyEmail.body ? (
          <div className="rounded-lg border border-indigo-100 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Body</p>
              <button
                onClick={() => void copyText('apply-email-body', applyEmail.body)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                {copiedId === 'apply-email-body' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{applyEmail.body}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-indigo-200 bg-white py-8 text-center text-sm text-slate-400">
            Click Draft email to write the message.
          </div>
        )}

        {applyEmail.issues.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {applyEmail.issues.map((issue, index) => (
              <div key={index}>{issue.severity === 'fix' ? 'Fix' : 'Check'}: {issue.message}</div>
            ))}
          </div>
        )}

        {applyEmail.body && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`mailto:${encodeURIComponent(applyEmail.recipient)}?subject=${encodeURIComponent(applyEmail.subject)}&body=${encodeURIComponent(applyEmail.body)}`}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700"
            >
              <Mail className="w-4 h-4" /> Open in mail client
            </a>
            <span className="text-xs text-slate-500">
              Attach the resume PDF{app.coverLetterPath ? ' and cover letter PDF' : ''} yourself before sending.
            </span>
          </div>
        )}

        {applyEmailError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {applyEmailError}
          </div>
        )}
      </div>
    </div>
  );

  const applyPanel = (
    <div className="p-5 space-y-5">
      {applyEmailPanel}
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
          <p className={`text-sm font-medium ${applyDocuments.transcriptPath ? 'text-emerald-700' : 'text-amber-700'}`}>
            {applyDocuments.transcriptPath ? 'Configured' : 'Needs private path if requested'}
          </p>
          {applyDocuments.transcriptPath && (
            <p className="text-xs text-slate-400 mt-1 break-all">{applyDocuments.transcriptPath}</p>
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
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {applyAutomationLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Opening browser...</>
              : <><Send className="w-4 h-4" />Start Assisted Fill</>}
          </button>
          <button
            onClick={() => void startApplySession(true)}
            disabled={applyLoading || applyDocsLoading || applyAutomationLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="w-full overflow-x-hidden px-3 py-3 pb-8 sm:px-4 lg:px-5">

      {/* Back */}
      <Link href="/applications"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
        <ArrowLeft className="w-4 h-4" /> Back to tracker
      </Link>

      {/* Header card */}
      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-base font-bold text-slate-600 shrink-0">
              {app.company[0]}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-900">{app.company}</h1>
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
          <div className="flex flex-wrap items-center gap-3 shrink-0">
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

        {timelineItems.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
            {timelineItems.map(item => (
              <span key={item.label} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                {item.label}: {formatDateTime(item.value)}
              </span>
            ))}
          </div>
        )}

        {/* Resume/cover-letter header location for this application only */}
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="resume-location" className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-slate-400" /> Document header location
            </label>
            <input
              id="resume-location"
              type="text"
              maxLength={60}
              value={resumeLocationDraft}
              onChange={e => { setResumeLocationDraft(e.target.value); setResumeLocationNotice(null); }}
              placeholder="Profile default — e.g. Toronto, ON · Open to relocation"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <button
              onClick={() => void saveResumeLocation()}
              disabled={resumeLocationSaving || resumeLocationDraft === (app.resumeLocation ?? '')}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {resumeLocationSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Shown on this application&apos;s resume and cover letter only. Application-form address fields still use your real address, so keep this truthful, state relocation rather than a city you do not live in.
          </p>
          {resumeLocationNotice && (
            <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${resumeLocationNotice.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {resumeLocationNotice.message}
            </div>
          )}
        </div>

        {/* Actions row: PDF downloads + Interview Guide */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {/* PDF downloads — only shown when PDFs exist */}
          {app.resumePath && (
            <a
              href={`/api/applications/${id}/pdf?type=resume`}
              download
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" /> Resume PDF
            </a>
          )}
          {app.coverLetterPath && (
            <a
              href={`/api/applications/${id}/pdf?type=cover-letter`}
              download
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" /> Cover Letter PDF
            </a>
          )}

          {!(app.resumeMd || app.resumePath) && (
            <button
              onClick={() => void generateApplicationDocument('resume')}
              disabled={!!documentGenerating || documentGenerationBlocked}
              title={documentGenerationBlocked ? 'Save or reset source edits before generating.' : undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {documentGenerating === 'resume'
                ? <><Loader2 className="w-4 h-4 animate-spin" />Generating resume...</>
                : <><Sparkles className="w-4 h-4" />Generate Resume</>}
            </button>
          )}
          {!(app.coverLetterMd || app.coverLetterPath) && (
            <button
              onClick={() => void generateApplicationDocument('cover-letter')}
              disabled={!!documentGenerating || documentGenerationBlocked}
              title={documentGenerationBlocked ? 'Save or reset source edits before generating.' : undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {documentGenerating === 'cover-letter'
                ? <><Loader2 className="w-4 h-4 animate-spin" />Generating cover...</>
                : <><Sparkles className="w-4 h-4" />Generate Cover Letter</>}
            </button>
          )}
          {/* Divider if both download buttons and interview button shown */}
          {(app.resumePath || app.coverLetterPath) && (
            <div className="w-px h-6 bg-slate-200 hidden sm:block" />
          )}

          {app.jobUrl && (
            <button
              onClick={() => void refreshJobDescriptionSnapshot()}
              disabled={jobDescriptionLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {jobDescriptionLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Fetching JD...</>
                : <><Briefcase className="w-4 h-4" />Fetch Full Job Description</>}
            </button>
          )}

          <button
            onClick={() => void startApplySession(true)}
            disabled={applyLoading || applyDocsLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="w-full sm:w-52 text-sm px-3 py-2 border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-800"
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

          <button
            onClick={() => setActiveTab('outreach')}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700"
          >
            <UserSearch className="w-4 h-4" />Outreach
          </button>
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
        {jobDescriptionError && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {jobDescriptionError}
          </div>
        )}
        {documentGenerationError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {documentGenerationError}
          </div>
        )}
        {documentGenerationNotice && (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${documentGenerationNotice.kind === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {documentGenerationNotice.message}
          </div>
        )}
        {app.generationReport?.resume && (
          <details className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <summary className="cursor-pointer font-semibold text-slate-900">
              Generation report — ATS keywords {app.generationReport.resume.keywordCoverage.filter(k => k.present).length}/{app.generationReport.resume.keywordCoverage.length} covered
              {app.generationReport.resume.archetype ? ` · ${app.generationReport.resume.archetype}` : ''}
              {app.generationReport.resume.pageCount ? ` · ${app.generationReport.resume.pageCount} pages` : ''}
              {app.generationReport.resume.pageFills?.page1 != null && app.generationReport.resume.pageFills?.page2 != null
                ? ` · fill ${Math.round(app.generationReport.resume.pageFills.page1 * 100)}% / ${Math.round(app.generationReport.resume.pageFills.page2 * 100)}%`
                : ''}
            </summary>
            <div className="mt-3 space-y-2">
              {app.generationReport.resume.projectRationale && (
                <p className="text-slate-600"><span className="font-medium text-slate-800">Project selection:</span> {app.generationReport.resume.projectRationale}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {app.generationReport.resume.keywordCoverage.map(entry => (
                  <span
                    key={entry.keyword}
                    title={entry.present ? `Found in: ${entry.locations.join(', ')}` : 'Not found in the resume (no truthful evidence or missed)'}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${entry.present ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200 line-through'}`}
                  >
                    {entry.keyword}
                  </span>
                ))}
              </div>
              {(app.generationReport.resume.trimsApplied?.length ?? 0) > 0 && (
                <p className="text-slate-600"><span className="font-medium text-slate-800">Auto-trimmed to fit 2 pages:</span> {app.generationReport.resume.trimsApplied!.join('; ')}</p>
              )}
              {(app.generationReport.resume.expansionsApplied?.length ?? 0) > 0 && (
                <p className="text-slate-600"><span className="font-medium text-slate-800">Auto-expanded to fill pages:</span> {app.generationReport.resume.expansionsApplied!.join('; ')}</p>
              )}
              {app.generationReport.resume.remainingIssues.length > 0 && (
                <ul className="list-disc pl-5 text-amber-800">
                  {app.generationReport.resume.remainingIssues.map((issue, index) => (
                    <li key={index}>{issue.message}</li>
                  ))}
                </ul>
              )}
              {app.generationReport.coverLetter && (
                <p className="text-slate-600">
                  <span className="font-medium text-slate-800">Cover letter:</span> {app.generationReport.coverLetter.wordCount ?? '?'} words
                  {app.generationReport.coverLetter.remainingIssues.length > 0
                    ? ` · ${app.generationReport.coverLetter.remainingIssues.map(issue => issue.message).join(' · ')}`
                    : ' · all checks passed'}
                </p>
              )}
            </div>
          </details>
        )}
      </div>

      {/* Main layout: doc viewer + chat */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">

        {/* Left: document viewer */}
        <div className="flex min-w-0 flex-col">
          {/* Tabs */}
          <div className="flex min-w-0 items-end justify-between gap-2 bg-white border border-slate-200 rounded-t-xl px-2 pt-2">
            <div className="flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            {(activeTab === 'resume' || activeTab === 'cover-letter' || activeTab === 'job-description' || activeTab === 'interview') && activeContent() && (
              <div className="mb-2 flex min-w-0 shrink-0 items-center gap-2">
                {activeDocumentGenerationType && (
                  <button
                    onClick={() => void generateApplicationDocument(activeDocumentGenerationType)}
                    disabled={!!documentGenerating || documentGenerationBlocked}
                    title={documentGenerationBlocked ? 'Save or reset source edits before regenerating.' : undefined}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {documentGenerating === activeDocumentGenerationType
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Sparkles className="w-3.5 h-3.5" />}
                    {activeDocumentGenerationType === 'resume'
                      ? app.resumeMd || app.resumePath ? 'Regenerate' : 'Generate'
                      : app.coverLetterMd || app.coverLetterPath ? 'Regenerate' : 'Generate'}
                  </button>
                )}
                {activeDocumentGenerationType && activeDocumentVersions.length > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
                    <label className="sr-only" htmlFor="document-version-select">Document version</label>
                    <select
                      id="document-version-select"
                      value={selectedDocumentVersion?.id ?? ''}
                      onChange={e => setSelectedVersionId(e.target.value)}
                      className="max-w-52 bg-transparent text-xs font-medium text-slate-600 outline-none"
                    >
                      {activeDocumentVersions.map(version => (
                        <option key={version.id} value={version.id}>{versionOptionLabel(version)}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => void restoreSelectedDocumentVersion()}
                      disabled={!selectedDocumentVersion || versionRestoring || documentGenerationBlocked}
                      title={documentGenerationBlocked ? 'Save or reset source edits before restoring.' : undefined}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {versionRestoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Restore
                    </button>
                  </div>
                )}
                {sourceMode && isEditableSource && (
                  <>
                    <button
                      onClick={() => { setSourceDraft(activeContent() ?? ''); setSourceError(null); setSourceSavedAt(null); }}
                      disabled={!sourceDirty || sourceSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => void saveSourceEdit()}
                      disabled={!sourceDirty || sourceSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sourceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Save
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSourceMode(v => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  {sourceMode ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
                  {sourceMode ? 'Preview' : 'Source'}
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="min-h-[70vh] overflow-hidden rounded-b-xl border border-t-0 border-slate-200 bg-white">
            {activeTab === 'outreach' ? <div className="bg-slate-50">{outreachPanel}</div> : activeTab === 'apply' ? <div className="bg-slate-50">{applyPanel}</div> : activeContent() && sourceMode ? (
              isEditableSource ? (
                <div className="flex min-h-[70vh] flex-col bg-slate-950">
                  <textarea
                    value={sourceDraft}
                    onChange={e => { setSourceDraft(e.target.value); setSourceError(null); setSourceSavedAt(null); }}
                    spellCheck={false}
                    className="min-h-[calc(70vh-2.5rem)] flex-1 resize-none bg-slate-950 p-6 font-mono text-xs leading-relaxed text-slate-100 outline-none"
                  />
                  <div className="flex min-h-10 items-center justify-between gap-3 border-t border-slate-800 bg-slate-900 px-4 py-2 text-xs">
                    <span className={sourceError ? 'text-red-300' : sourceDirty ? 'text-amber-200' : sourceSavedLabel ? 'text-emerald-300' : 'text-slate-400'}>
                      {sourceError ?? (sourceDirty ? 'Unsaved changes' : sourceSavedLabel ? `Saved ${sourceSavedLabel}` : 'Markdown source is saved')}
                    </span>
                    <span className="text-slate-500">Download regenerates the PDF from this Markdown</span>
                  </div>
                </div>
              ) : (
                <pre className="overflow-x-auto p-6 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {activeContent()}
                </pre>
              )
            ) : activeContent() ? (
              <div className="bg-slate-50 p-4 sm:p-5">
                <div className="mx-auto min-h-[70vh] w-full max-w-[850px] border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8 lg:px-10 lg:py-9">
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
        <div className="h-[60vh] min-h-[420px] lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">
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
