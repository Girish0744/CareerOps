import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { apiErrorMessage } from '@/lib/errors';

// Reading a few hundred messages over IMAP takes 30-90s on a busy mailbox.
export const maxDuration = 180;

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');

interface SyncEntry {
  appId: string;
  company: string;
  jobTitle: string;
  from: string;
  subject: string;
  date: string;
  class: string;
  confidence: string;
  source: string;
  current: string;
  next: string | null;
  reason?: string;
  error?: string;
}

interface SyncResult {
  waitingCount: number;
  scanned: number;
  updates: SyncEntry[];
  review: SyncEntry[];
  applied: boolean;
  dismissed?: boolean;
}

interface ResolveResult {
  applied: SyncEntry[];
  dismissed: SyncEntry[];
  skipped: Array<SyncEntry & { reason: string }>;
}

/** Only the fields the resolver needs; anything else the client sent is dropped. */
function sanitizeEntry(raw: unknown) {
  const e = (raw ?? {}) as Record<string, unknown>;
  if (typeof e.messageId !== 'string' || !e.messageId) return null;
  return {
    messageId: e.messageId,
    appId: typeof e.appId === 'string' ? e.appId : '',
    next: typeof e.next === 'string' ? e.next : null,
    current: typeof e.current === 'string' ? e.current : '',
    subject: typeof e.subject === 'string' ? e.subject : '',
    from: typeof e.from === 'string' ? e.from : '',
    date: typeof e.date === 'string' ? e.date : new Date().toISOString(),
    class: typeof e.class === 'string' ? e.class : 'resolved',
    company: typeof e.company === 'string' ? e.company : '',
  };
}

/**
 * gmail-sync.mjs is spawned rather than imported: imapflow/mailparser are Node
 * server deps that would need bundler exemptions, and the script already speaks
 * --json. Same approach as /api/scan/run.
 */
async function runSync<T>(args: string[], timeout = 170000): Promise<T> {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['gmail-sync.mjs', '--json', ...args],
    { cwd: ROOT, timeout, maxBuffer: 1024 * 1024 * 8 },
  );
  // Only stdout is parsed (stderr stays separate), so no output marker is
  // needed — but tolerate a leading banner from any dependency.
  const start = stdout.indexOf('{');
  if (start === -1) throw new Error('gmail-sync returned no JSON.');
  return JSON.parse(stdout.slice(start)) as T;
}

/**
 * Decisions travel to the script in a temp file: they are structured data, too
 * awkward for argv, and this path never opens the mailbox so it returns fast.
 */
async function resolveEntries(
  apply: ReturnType<typeof sanitizeEntry>[],
  dismiss: ReturnType<typeof sanitizeEntry>[],
): Promise<ResolveResult> {
  const file = path.join(os.tmpdir(), `career-ops-inbox-${crypto.randomUUID()}.json`);
  fs.writeFileSync(file, JSON.stringify({ apply, dismiss }));
  try {
    return await runSync<ResolveResult>([`--resolve=${file}`], 30000);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as {
    mode?: 'preview' | 'apply' | 'dismiss' | 'resolve';
    days?: number;
    apply?: unknown[];
    dismiss?: unknown[];
  };

  const mode = body.mode ?? 'preview';
  if (!['preview', 'apply', 'dismiss', 'resolve'].includes(mode)) {
    return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  }

  try {
    // Per-message decisions from the results panel. The script re-reads each
    // application from disk and re-checks the transition, so a stale panel
    // cannot force an illegal status change.
    if (mode === 'resolve') {
      const apply = (body.apply ?? []).map(sanitizeEntry).filter(Boolean);
      const dismiss = (body.dismiss ?? []).map(sanitizeEntry).filter(Boolean);
      if (apply.length === 0 && dismiss.length === 0) {
        return NextResponse.json({ error: 'No messages given to resolve.' }, { status: 400 });
      }
      return NextResponse.json({ mode, ...(await resolveEntries(apply, dismiss)) });
    }

    const args: string[] = [];
    if (mode === 'apply') args.push('--apply');
    if (mode === 'dismiss') args.push('--dismiss');
    if (body.days && Number.isFinite(body.days) && body.days > 0) {
      args.push(`--days=${Math.floor(body.days)}`);
    }
    return NextResponse.json({ mode, ...(await runSync<SyncResult>(args)) });
  } catch (err) {
    // A missing app password or a rejected login arrives here as a non-zero
    // exit; gmail-sync already writes a readable reason to stderr.
    const stderr = (err as { stderr?: string }).stderr?.trim();
    return NextResponse.json(
      { error: stderr || apiErrorMessage(err) },
      { status: 500 },
    );
  }
}
