import { NextResponse } from 'next/server';
import { getApplication } from '@/lib/filesystem';
import { refreshDocumentPdfIfStale } from '@/lib/document-renderer';
import { pdfFilename, resolvePdfPath } from '@/lib/pdf-filename';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');
export const maxDuration = 120;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // 'resume' | 'cover-letter'

  if (type !== 'resume' && type !== 'cover-letter') {
    return NextResponse.json({ error: 'type must be resume or cover-letter' }, { status: 400 });
  }

  const app = getApplication(id);
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const folderPath = path.join(/*turbopackIgnore: true*/ ROOT, app.applicationFolder);

  try {
    await refreshDocumentPdfIfStale(id, type);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF refresh failed';
    if (!fs.existsSync(resolvePdfPath(folderPath, type))) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.warn(`[pdf-download] Serving existing ${type} PDF after refresh failed for ${id}: ${message}`);
  }

  // Resolve after the refresh: it renames any legacy file to the named one.
  const pdfPath = resolvePdfPath(folderPath, type);
  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json({ error: 'PDF not found — generate documents first' }, { status: 404 });
  }

  const buffer = fs.readFileSync(pdfPath);
  const downloadName = pdfFilename(type);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
