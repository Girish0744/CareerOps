import { NextResponse } from 'next/server';
import { getApplication, saveDocumentEdit, updateApplicationFields } from '@/lib/filesystem';
import { refreshDocumentPdfIfStale } from '@/lib/document-renderer';

// Header line only, so a short single line. Keeps a stray paragraph out of the
// PDF letterhead and bounds what a bad value can do to the layout.
const MAX_RESUME_LOCATION = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = getApplication(id);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(app);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = getApplication(id);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    filename?: string;
    content?: unknown;
    resumeLocation?: unknown;
  };

  // Header-location update: re-render both documents so the letterhead matches.
  if (body.resumeLocation !== undefined) {
    if (body.resumeLocation !== null && typeof body.resumeLocation !== 'string') {
      return NextResponse.json({ error: 'resumeLocation must be a string or null' }, { status: 400 });
    }
    const trimmed = typeof body.resumeLocation === 'string' ? body.resumeLocation.trim() : '';
    if (trimmed.length > MAX_RESUME_LOCATION) {
      return NextResponse.json(
        { error: `resumeLocation must be ${MAX_RESUME_LOCATION} characters or fewer` },
        { status: 400 },
      );
    }
    if (/[\r\n]/.test(trimmed)) {
      return NextResponse.json({ error: 'resumeLocation must be a single line' }, { status: 400 });
    }

    updateApplicationFields(id, { resumeLocation: trimmed || null });
    // Only re-render documents that already exist.
    if (app.resumeMd) await refreshDocumentPdfIfStale(id, 'resume');
    if (app.coverLetterMd) await refreshDocumentPdfIfStale(id, 'cover-letter');

    return NextResponse.json(getApplication(id));
  }

  if (body.filename !== 'resume.md' && body.filename !== 'cover-letter.md') {
    return NextResponse.json({ error: 'filename must be resume.md or cover-letter.md' }, { status: 400 });
  }

  if (typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
  }

  saveDocumentEdit(id, body.filename, body.content);
  await refreshDocumentPdfIfStale(id, body.filename === 'resume.md' ? 'resume' : 'cover-letter');

  const updated = getApplication(id);
  return NextResponse.json(updated);
}