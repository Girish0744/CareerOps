import { NextResponse } from 'next/server';
import { getApplication, getDocumentVersions, restoreDocumentVersion } from '@/lib/filesystem';
import { refreshDocumentPdfIfStale } from '@/lib/document-renderer';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = getApplication(id);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ versions: getDocumentVersions(id) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { versionId?: unknown };

  if (typeof body.versionId !== 'string' || !body.versionId.trim()) {
    return NextResponse.json({ error: 'versionId is required' }, { status: 400 });
  }

  try {
    const restored = restoreDocumentVersion(id, body.versionId.trim());
    await refreshDocumentPdfIfStale(id, restored.type);
    const updated = getApplication(id);
    return NextResponse.json({ application: updated, restored });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not restore document version.' },
      { status: 400 },
    );
  }
}
