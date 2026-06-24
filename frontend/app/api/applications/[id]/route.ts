import { NextResponse } from 'next/server';
import { getApplication, saveDocumentEdit } from '@/lib/filesystem';
import { refreshDocumentPdfIfStale } from '@/lib/document-renderer';

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
  };

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