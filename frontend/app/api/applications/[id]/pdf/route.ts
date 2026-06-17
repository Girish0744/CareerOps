import { NextResponse } from 'next/server';
import { getApplication } from '@/lib/filesystem';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');

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

  const filename = type === 'resume' ? 'resume.pdf' : 'cover-letter.pdf';
  const pdfPath = path.join(/*turbopackIgnore: true*/ ROOT, app.applicationFolder, filename);

  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json({ error: 'PDF not found — generate documents first' }, { status: 404 });
  }

  const buffer = fs.readFileSync(pdfPath);
  const company = app.company.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const role    = app.jobTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const label   = type === 'resume' ? 'resume' : 'cover-letter';
  const downloadName = `${company}-${role}-${label}.pdf`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
