import { NextResponse } from 'next/server';
import { updateApplicationStatus } from '@/lib/filesystem';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { status: string };
  const ok = updateApplicationStatus(id, body.status);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, status: body.status });
}
