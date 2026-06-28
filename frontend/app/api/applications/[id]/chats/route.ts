import { NextResponse } from 'next/server';
import { createChatSession, getApplication, getChatSession, getChatSessions } from '@/lib/filesystem';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = getApplication(id);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');
  const sessions = getChatSessions(id);

  if (sessionId) {
    const session = getChatSession(id, sessionId);
    if (!session) return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    return NextResponse.json({ session, sessions });
  }

  return NextResponse.json({ sessions });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const app = getApplication(id);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { title?: unknown };
  const session = createChatSession(id, typeof body.title === 'string' ? body.title : undefined);
  return NextResponse.json({ session, sessions: getChatSessions(id) });
}
