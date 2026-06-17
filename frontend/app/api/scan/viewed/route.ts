import { NextResponse } from 'next/server';
import { markScoredJobViewed } from '@/lib/filesystem';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: 'Missing scan job id' }, { status: 400 });
  }

  const queue = markScoredJobViewed(body.id);
  if (!queue) {
    return NextResponse.json({ error: 'Scan job not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, queue });
}
