import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getApplication } from '@/lib/filesystem';
import { apiErrorMessage } from '@/lib/errors';
import { extractApplicantProfile, standardApplyFields } from '@/lib/apply-assistant';
import { isRestrictedApplyHost } from '@/lib/apply-automation-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');

function applySessionPath(applicationFolder: string) {
  return path.join(/*turbopackIgnore: true*/ ROOT, applicationFolder, 'apply-session.json');
}

function readRoot(rel: string): string {
  const p = path.join(/*turbopackIgnore: true*/ ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function readApplySession(applicationFolder: string) {
  const p = applySessionPath(applicationFolder);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function baseSession(app: NonNullable<ReturnType<typeof getApplication>>) {
  const profile = extractApplicantProfile(readRoot('config/profile.yml'));
  const now = new Date().toISOString();
  const standardFields = standardApplyFields(profile, app);
  return {
    applicationId: app.id,
    company: app.company,
    jobTitle: app.jobTitle,
    applyUrl: app.jobUrl,
    status: 'draft',
    generatedAt: now,
    updatedAt: now,
    finalSubmitPolicy: 'stop_before_submit',
    automationStage: 'visible_browser_ready',
    documents: {
      resumePath: app.resumePath,
      coverLetterPath: app.coverLetterPath,
      transcriptPath: profile.transcriptPath || null,
    },
    standardFields,
    answers: [],
    uncertainFields: standardFields.filter((field: { needsReview: boolean }) => field.needsReview),
    notes: [
      'Phase 17B opens a visible browser and fills high-confidence fields only.',
      'Never click final Submit/Apply automatically.',
    ],
  };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const app = getApplication(id);
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    const applyUrl = app.jobUrl;
    if (!applyUrl) {
      return NextResponse.json({ error: 'No apply/job URL is saved for this application.' }, { status: 400 });
    }
    if (isRestrictedApplyHost(applyUrl)) {
      return NextResponse.json({
        error: 'This is a restricted job-board URL. Open or save the employer/ATS apply link first.',
      }, { status: 400 });
    }
    if (!app.resumePath || !app.coverLetterPath) {
      return NextResponse.json({
        error: 'Generate the resume and cover letter before starting assisted fill.',
      }, { status: 409 });
    }

    const existing = readApplySession(app.applicationFolder);
    const session = {
      ...baseSession(app),
      ...(existing ?? {}),
      applyUrl,
      automationStage: 'visible_browser_running',
      updatedAt: new Date().toISOString(),
    };

    const { runVisibleApplyAutomation } = await import('@/lib/apply-automation');
    const automation = await runVisibleApplyAutomation({
      url: applyUrl,
      session,
      rootDir: ROOT,
    });

    const updatedSession = {
      ...session,
      status: automation.status === 'blocked' ? 'automation_blocked' : 'browser_open_review',
      automationStage: 'visible_browser_filling',
      automation,
      updatedAt: new Date().toISOString(),
      uncertainFields: [
        ...(Array.isArray(session.uncertainFields) ? session.uncertainFields : []),
        ...automation.uncertainFields,
      ],
      notes: [
        ...(Array.isArray(session.notes) ? session.notes : []),
        'Visible browser automation stops before final Submit/Apply. Review every field before submitting.',
      ],
    };

    fs.writeFileSync(applySessionPath(app.applicationFolder), JSON.stringify(updatedSession, null, 2));
    return NextResponse.json(updatedSession);
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
