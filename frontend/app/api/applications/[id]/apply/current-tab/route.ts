import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getApplication, updateApplicationFields } from '@/lib/filesystem';
import { apiErrorMessage } from '@/lib/errors';
import { isRestrictedApplyHost, isSafeApplyCta, looksLikeApplicationForm } from '@/lib/apply-automation-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROOT = path.resolve(process.cwd(), '..');

interface CurrentTabLink {
  label?: string;
  href?: string;
}

interface CurrentTabField {
  tag?: string;
  type?: string;
  label?: string;
  name?: string;
  id?: string;
  placeholder?: string;
}

interface CurrentTabRequest {
  url?: string;
  title?: string;
  applyLinks?: CurrentTabLink[];
  fields?: CurrentTabField[];
}

function applySessionPath(applicationFolder: string) {
  return path.join(ROOT, applicationFolder, 'apply-session.json');
}

function readApplySession(applicationFolder: string) {
  const p = applySessionPath(applicationFolder);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function absoluteUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function chooseSafeApplyUrl(body: CurrentTabRequest): { url: string | null; label: string | null; reason: string } {
  if (!body.url) return { url: null, label: null, reason: 'No current-tab URL was provided.' };
  if (isRestrictedApplyHost(body.url)) {
    return { url: null, label: null, reason: 'Restricted job-board page. Use an employer or ATS tab before capturing.' };
  }

  for (const link of body.applyLinks ?? []) {
    const href = link.href ? absoluteUrl(link.href, body.url) : null;
    if (!href || isRestrictedApplyHost(href)) continue;
    if (isSafeApplyCta(link.label ?? '', href)) {
      return { url: href, label: link.label ?? href, reason: 'Safe apply link found on the current tab.' };
    }
  }

  if (looksLikeApplicationForm(body.fields ?? [])) {
    return { url: body.url, label: body.title ?? body.url, reason: 'The current tab already looks like an application form.' };
  }

  return { url: null, label: null, reason: 'No safe apply link or application form was detected on the current tab.' };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const app = getApplication(id);
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    const body = await req.json().catch(() => ({})) as CurrentTabRequest;
    const selection = chooseSafeApplyUrl(body);
    const now = new Date().toISOString();
    const previous = readApplySession(app.applicationFolder);
    const notes = Array.isArray(previous.notes) ? previous.notes : [];

    const session = {
      ...previous,
      applicationId: app.id,
      company: app.company,
      jobTitle: app.jobTitle,
      applyUrl: selection.url ?? app.jobUrl,
      updatedAt: now,
      finalSubmitPolicy: 'stop_before_submit',
      automationStage: selection.url ? 'extension_apply_link_captured' : 'extension_needs_review',
      browserExtension: {
        capturedAt: now,
        currentUrl: body.url ?? null,
        title: body.title ?? null,
        selectedApplyUrl: selection.url,
        selectedLabel: selection.label,
        reason: selection.reason,
        detectedApplyLinks: (body.applyLinks ?? []).slice(0, 10),
        fieldCount: body.fields?.length ?? 0,
        formDetected: looksLikeApplicationForm(body.fields ?? []),
      },
      notes: [
        ...notes,
        selection.url
          ? 'Browser extension captured a reviewable apply URL from the current tab.'
          : `Browser extension could not capture an apply URL: ${selection.reason}`,
      ],
    };

    if (selection.url) {
      updateApplicationFields(app.id, { jobUrl: selection.url });
    }

    fs.writeFileSync(applySessionPath(app.applicationFolder), JSON.stringify(session, null, 2));
    return NextResponse.json({
      success: Boolean(selection.url),
      applyUrl: selection.url,
      reason: selection.reason,
      session,
    }, { status: selection.url ? 200 : 422 });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
