#!/usr/bin/env node

/**
 * gmail-sync.mjs — Read recruiter replies from Gmail and propose status updates.
 *
 * Reads INBOX over IMAP (readonly), matches each message to an application that
 * is waiting on a reply, classifies it, and either prints the proposal
 * (default) or writes it through update-status.mjs (--apply).
 *
 * It never deletes, moves, flags, or sends mail. The mailbox lock is readonly.
 *
 * Usage:
 *   node gmail-sync.mjs                dry run — print proposals, write nothing
 *   node gmail-sync.mjs --apply        apply high-confidence proposals
 *   node gmail-sync.mjs --dismiss      silence these messages, change no status
 *   node gmail-sync.mjs --resolve=f.json  act on specific messages (no mailbox read)
 *   node gmail-sync.mjs --days=30      override the lookback window
 *   node gmail-sync.mjs --no-ai        skip the Gemini pass for unclear mail
 *   node gmail-sync.mjs --json         machine-readable output (autopilot)
 *
 * Setup:
 *   1. Enable 2-Step Verification on the Google account
 *   2. Create an App Password: https://myaccount.google.com/apppasswords
 *   3. Add to .env:
 *        GMAIL_USER=you@gmail.com
 *        GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
 *   4. npm install
 *
 * ponytail: IMAP + app password instead of Gmail API OAuth — two env vars and no
 * Google Cloud project. Move to OAuth only if Google drops app passwords.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { setStatus } from './update-status.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const APPLICATIONS_PATH = join(ROOT, 'data', 'applications.json');
const STATE_PATH = join(ROOT, 'data', 'inbox-sync.json');

/**
 * Keys live in frontend/.env.local (that is where GEMINI_API_KEY already is),
 * so root scripts read both files. Root .env wins where both define a key.
 * Absolute paths — this must work regardless of the shell's cwd.
 */
export const ENV_FILES = [join(ROOT, '.env'), join(ROOT, 'frontend', '.env.local')];
try {
  const { config } = await import('dotenv');
  config({ path: ENV_FILES, quiet: true });
} catch { /* dotenv optional — fall back to real environment variables */ }

/** Only these statuses can receive a reply — everything else is pre-send or terminal. */
export const WATCHED_STATUSES = ['Applied', 'In Progress', 'Interview'];

/** Funnel order. Equal rank = terminal, never overwritten. */
const RANK = {
  'Saved': 0,
  'Resume Generated': 1,
  'Cover Letter Generated': 2,
  'Ready to Apply': 3,
  'Applied': 4,
  'In Progress': 5,
  'Interview': 6,
  'Offer': 7,
  'Rejected': 7,
  'Withdrawn': 7,
};
const TERMINAL = new Set(['Offer', 'Rejected', 'Withdrawn']);

/** Sender domains that belong to the ATS, not the employer — match on body instead. */
const ATS_DOMAINS = [
  'greenhouse.io', 'myworkday.com', 'myworkdayjobs.com', 'ashbyhq.com', 'lever.co',
  'icims.com', 'smartrecruiters.com', 'workable.com', 'bamboohr.com', 'jobvite.com',
  'taleo.net', 'successfactors.com', 'oraclecloud.com', 'teamtailor.com', 'breezy.hr',
  'dayforcehcm.com', 'ultipro.com', 'paylocity.com', 'recruitee.com', 'hire.lever.co',
];

const COMPANY_STOPWORDS = new Set([
  'the', 'inc', 'ltd', 'llc', 'corp', 'corporation', 'limited', 'company', 'group',
  'technologies', 'technology', 'solutions', 'systems', 'services', 'canada',
  'international', 'and', 'of', 'holdings', 'labs', 'software',
]);

// ── Classification ──────────────────────────────────────────────────────────
// Order matters: a rejection that follows an interview mentions "interview", so
// rejection patterns are tested first and win.

const PATTERNS = {
  rejected: [
    /\bunfortunately\b/i,
    /not (be )?(moving|move) forward/i,
    /(mov(e|ing)|proceed(ing)?) forward with (other|another|different|candidates)/i,
    /other candidates?\b/i,
    /decided not to (proceed|move|continue|pursue)/i,
    /will not be (progressing|proceeding|moving|considering)/i,
    /no longer under consideration/i,
    /not (been )?(selected|shortlisted|successful)/i,
    /regret to inform/i,
    /(position|role) has been filled/i,
    /keep your (resume|cv|application|profile) on file/i,
    /pursue other (candidates|applicants)/i,
    /closely align(s|ed)? with/i,
  ],
  offer: [
    /pleased to (offer|extend)/i,
    /offer of employment/i,
    /offer letter/i,
    /formal offer/i,
    /(would like|happy) to offer you/i,
  ],
  interview: [
    /\binterview\b/i,
    /schedule (a|an|your|some|time)/i,
    /your availability/i,
    /available (times|slots|windows)/i,
    /phone screen/i,
    /\bnext steps?\b/i,
    /book a time/i,
    /(calendly\.com|calendar\.app|savvycal|hubspot\.com\/meetings)/i,
    /meet with (the|our|us)/i,
    /(speak|chat|connect) with (the|our) (team|hiring|recruit)/i,
  ],
  assessment: [
    /(technical|online|coding) (assessment|challenge|test)/i,
    /take[- ]home (assignment|test|project)/i,
    /codility|hackerrank|codesignal|karat\b/i,
  ],
  ack: [
    /thank you for (applying|your application|your interest|submitting)/i,
    /we (have )?received your application/i,
    /application (has been )?received/i,
    /this is an automated/i,
    /do not reply to this (e-?mail|message)/i,
    /confirm(ing|s)? (that )?(we|your application)/i,
  ],
};

/** Class → the status to move to. `null` means "no status change". */
const CLASS_STATUS = {
  rejected: 'Rejected',
  offer: 'Offer',
  interview: 'Interview',
  assessment: 'In Progress',
  ack: null,
  unknown: null,
};

const NOISE_SUBJECT = /\bjob alert|jobs (for|picked for) you|new jobs?\b|recommended for you|weekly digest|jobs you may be interested/i;
const NOISE_FROM = /(jobalerts|jobs-listings|jobs-noreply|newsletter|digest)@/i;

/** A reply about an application never comes from a personal mailbox. */
const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.ca',
  'yahoo.com', 'yahoo.ca', 'icloud.com', 'me.com', 'live.com', 'live.ca',
  'aol.com', 'msn.com', 'proton.me', 'protonmail.com',
]);

/** Words that make an otherwise unclassifiable email plausibly about a job. */
const APPLICATION_WORDS = /\b(applicat|candidat|resum|\bcv\b|recruit|hiring|position|vacanc|role|interview|opportunit|offer|talent acquisition|req(uisition)?\s*#?\d)/i;

function hits(text, patterns) {
  return patterns.some(re => re.test(text));
}

/**
 * Classify a recruiter email from its subject + body.
 * Returns confidence 'low' whenever the signals conflict — low-confidence
 * results are never auto-applied, they go to the review list.
 */
export function classifyEmail({ subject = '', body = '' }) {
  const text = `${subject}\n${body}`;

  if (hits(text, PATTERNS.rejected)) {
    return { class: 'rejected', status: 'Rejected', confidence: 'high' };
  }
  if (hits(text, PATTERNS.offer)) {
    return { class: 'offer', status: 'Offer', confidence: 'high' };
  }

  const isInterview = hits(text, PATTERNS.interview);
  const isAssessment = hits(text, PATTERNS.assessment);
  const isAck = hits(text, PATTERNS.ack);

  if (isAssessment && !isAck) {
    return { class: 'assessment', status: 'In Progress', confidence: 'high' };
  }
  if (isInterview) {
    // "Thanks for applying — we'll reach out about next steps" is an auto-ack
    // wearing interview words. Conflicting signals go to a human.
    return { class: 'interview', status: 'Interview', confidence: isAck ? 'low' : 'high' };
  }
  if (isAck || isAssessment) {
    return { class: 'ack', status: null, confidence: 'high' };
  }
  return { class: 'unknown', status: null, confidence: 'low' };
}

// ── Matching ────────────────────────────────────────────────────────────────

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function companyTokens(name) {
  const tokens = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !COMPANY_STOPWORDS.has(t));
  if (tokens.length > 0) return tokens;
  // Short names ("TD", "SAP") survive as a single token.
  const bare = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return bare ? [bare] : [];
}

function domainOf(address) {
  return String(address ?? '').toLowerCase().split('@')[1] ?? '';
}

function isAtsDomain(domain) {
  return ATS_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Compare against domain LABELS, not the raw string: "td" is a label in
 * "td.com" but only a substring in "united.com" and "email-td.com".
 */
function domainMatches(domain, tokens) {
  if (!domain || tokens.length === 0) return false;
  const labels = domain.split('.');
  const slug = tokens.join('');
  if (!slug) return false;
  // Whole-label equality only. Substring matching let "wealth" (Aviso Wealth)
  // match "wealthsimple", and "td" match "email-td"; every legitimate sender
  // domain has the company as a complete label — td.com, homedepot.com,
  // email.scotiabank.com, amazon.ca.
  return labels.includes(slug) || tokens.some(t => labels.includes(t));
}

export function isNoise(email) {
  return Boolean(email.bulk)
    || NOISE_SUBJECT.test(email.subject ?? '')
    || NOISE_FROM.test(email.from ?? '');
}

export function looksApplicationRelated(email) {
  return APPLICATION_WORDS.test(`${email.subject ?? ''}\n${email.body ?? ''}`);
}

/**
 * Match an email to one waiting application.
 *
 * The sender domain is the load-bearing signal: a reply about an application
 * arrives from the employer or from their ATS. Body text alone is not evidence
 * — a personal inbox mentions company names constantly (events, newsletters,
 * friends), and matching on that produced a flood of false positives.
 *
 * Returns { application, score } or null. Ties resolve to null.
 */
export function matchApplication(email, applications) {
  if (isNoise(email)) return null;

  const domain = domainOf(email.from);
  if (!domain || FREEMAIL_DOMAINS.has(domain)) return null;

  const fromAts = isAtsDomain(domain);
  const haystack = `${email.subject ?? ''}\n${email.body ?? ''}`.toLowerCase();

  const scored = applications.map(app => {
    const tokens = companyTokens(app.company);
    const name = String(app.company ?? '').toLowerCase().trim();

    const domainHit = !fromAts && domainMatches(domain, tokens);
    // Word-boundary only, and never for names so short they hide inside
    // ordinary words ("EY" in "money", "TD" in "limited").
    const nameHit = name.length >= 4
      && new RegExp(`\\b${escapeRe(name)}\\b`).test(haystack);
    const tokenHits = tokens
      .filter(t => t.length >= 4 && new RegExp(`\\b${escapeRe(t)}\\b`).test(haystack))
      .length;

    // An ATS sender names the vendor, not the employer, so the company has to
    // come from the message itself. Everyone else must match on domain.
    const qualifies = domainHit || (fromAts && (nameHit || tokenHits >= 2));
    if (!qualifies) return { application: app, score: 0 };

    let score = domainHit ? 3 : 2;
    if (nameHit) score += 1;

    // Role words only separate two openings at the same company.
    const titleTokens = String(app.jobTitle ?? '')
      .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(t => t.length >= 4);
    if (titleTokens.some(t => haystack.includes(t))) score += 1;

    return { application: app, score };
  }).filter(entry => entry.score >= 2)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0];
}

/** Only forward moves, and terminal statuses are never overwritten. */
export function canTransition(current, next) {
  if (!next) return false;
  if (TERMINAL.has(current)) return false;
  if (!(current in RANK) || !(next in RANK)) return false;
  return RANK[next] > RANK[current];
}

// ── State ───────────────────────────────────────────────────────────────────

const MAX_SEEN = 500; // ponytail: fixed-size tail. Move to SQLite if this ever matters.

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return fallback; }
}

function loadState(path) {
  return readJson(path, { lastRunAt: null, seen: [] });
}

function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  state.seen = state.seen.slice(-MAX_SEEN);
  writeFileSync(path, JSON.stringify(state, null, 2));
}

// ── Mail ────────────────────────────────────────────────────────────────────

/**
 * Fetch INBOX messages since `since`. Returns { messageId, date, from, fromName,
 * subject, body } — body truncated, never persisted.
 */
async function fetchRecentMail(since) {
  const user = process.env.GMAIL_USER?.trim();
  // Google shows app passwords as "xxxx xxxx xxxx xxxx"; the spaces are display
  // only and IMAP auth fails if they are sent.
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  if (!user || !pass) {
    throw new Error(
      'GMAIL_USER / GMAIL_APP_PASSWORD not set.\n'
      + '  1. Enable 2-Step Verification on the Google account\n'
      + '  2. Create an app password: https://myaccount.google.com/apppasswords\n'
      + `  3. Add both values to either of:\n${ENV_FILES.map(f => `       ${f}`).join('\n')}`,
    );
  }

  let ImapFlow; let simpleParser;
  try {
    ({ ImapFlow } = await import('imapflow'));
    ({ simpleParser } = await import('mailparser'));
  } catch {
    throw new Error('imapflow / mailparser not installed. Run: npm install');
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass }, logger: false,
    // Unattended runs must fail fast rather than hang until the task scheduler
    // kills them. Blocked outbound 993 shows up here as a socket timeout.
    greetingTimeout: 20000, socketTimeout: 120000, connectionTimeout: 20000,
  });
  // imapflow raises socket failures as an 'error' EVENT. Unhandled, that takes
  // the whole process down — including an autopilot run that wraps this call in
  // try/catch, since an emitter error is not a promise rejection.
  client.on('error', () => { /* surfaced by the awaited call below */ });

  const messages = [];
  try {
    await client.connect();
  } catch (err) {
    if (!err.authenticationFailed) throw err;
    // Gmail reports every credential problem as a bare "Command failed".
    // A wrong length is by far the most common cause, so say so.
    throw new Error(
      `Gmail rejected the credentials for ${user}.\n`
      + `  GMAIL_APP_PASSWORD is ${pass.length} characters; a Google app password is 16.\n`
      + '  Re-copy it from https://myaccount.google.com/apppasswords\n'
      + '  If the length is right, check that IMAP is enabled: Gmail → Settings → Forwarding and POP/IMAP',
    );
  }
  // readOnly — this script must never mark, move, or delete mail.
  const lock = await client.getMailboxLock('INBOX', { readOnly: true });
  try {
    for await (const msg of client.fetch({ since }, { source: true, envelope: true })) {
      const parsed = await simpleParser(msg.source);
      const bodyText = parsed.text
        ?? String(parsed.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      // Marketing and list mail announce themselves in the headers. A human
      // recruiter replying to you does not — this is the strongest available
      // signal for separating a real reply from a blast.
      const header = (name) => parsed.headers?.get(name);
      const bulk = Boolean(
        header('list-unsubscribe') || header('list-id') || header('list-post')
        || /bulk|list|junk/i.test(String(header('precedence') ?? ''))
        || /auto-generated|auto-replied/i.test(String(header('auto-submitted') ?? '')),
      );
      messages.push({
        messageId: parsed.messageId ?? `uid-${msg.uid}`,
        date: (parsed.date ?? new Date()).toISOString(),
        from: parsed.from?.value?.[0]?.address ?? '',
        fromName: parsed.from?.value?.[0]?.name ?? '',
        subject: parsed.subject ?? '',
        body: String(bodyText ?? '').slice(0, 1500),
        bulk,
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return messages;
}

// ── Optional AI pass for unclear mail ───────────────────────────────────────

/**
 * Classify the emails the regex pass could not, in ONE call. Fail-soft: any
 * error leaves them unclassified, which sends them to the review list.
 */
async function classifyWithAI(items) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || items.length === 0) return new Map();

  const prompt = `You classify recruiter emails for a job applicant's tracker.
For each email return exactly one class:
  "rejected"   — the application was declined
  "interview"  — they want to schedule a call, screen, or interview
  "assessment" — a test, coding challenge, or take-home was sent
  "offer"      — a job offer is being extended
  "ack"        — automated acknowledgement, no decision
  "unknown"    — anything else, or genuinely unclear
Return JSON: {"results":[{"id":"<id>","class":"<class>"}]}

${items.map(it => `--- id: ${it.messageId}
Subject: ${it.subject}
${it.body.slice(0, 600)}`).join('\n')}`;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const baseConfig = { temperature: 0, responseMimeType: 'application/json' };
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const ask = async (generationConfig) => {
      const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
      return (await model.generateContent(prompt)).response.text();
    };

    // thinkingBudget 0 per the project rule; retry without it if this SDK
    // version rejects the field.
    let text;
    try {
      text = await ask({ ...baseConfig, thinkingConfig: { thinkingBudget: 0 } });
    } catch {
      text = await ask(baseConfig);
    }

    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return new Map((parsed.results ?? []).map(r => [r.id, r.class]));
  } catch {
    return new Map();
  }
}

// ── Sync ────────────────────────────────────────────────────────────────────

/**
 * @param apply       write status changes (default: propose only)
 * @param days        lookback override in days
 * @param useAi       let Gemini classify what the patterns could not
 * @param fetchMail   injectable mail source (tests)
 * @param applications injectable application list (tests)
 */
export async function syncInbox({
  apply = false, dismiss = false, days = null, useAi = true,
  fetchMail = fetchRecentMail, applications = null, statePath = STATE_PATH,
} = {}) {
  applications ??= readJson(APPLICATIONS_PATH, { applications: [] }).applications ?? [];
  const waiting = applications.filter(app => WATCHED_STATUSES.includes(app.status));

  const result = {
    waitingCount: waiting.length,
    scanned: 0,
    updates: [],
    review: [],
    applied: false,
  };
  if (waiting.length === 0) return result;

  // Look back to the oldest application still waiting, minus a day of slack.
  const appliedDates = waiting
    .map(app => Date.parse(app.appliedAt ?? app.updatedAt ?? app.createdAt))
    .filter(Number.isFinite);
  const since = days
    ? new Date(Date.now() - days * 864e5)
    : new Date(Math.min(...appliedDates, Date.now()) - 864e5);

  const state = loadState(statePath);
  const seenIds = new Set(state.seen.map(s => s.messageId));
  const messages = (await fetchMail(since)).filter(m => !seenIds.has(m.messageId));
  result.scanned = messages.length;

  const matched = [];
  for (const email of messages) {
    const hit = matchApplication(email, waiting);
    if (!hit) {
      state.seen.push({ messageId: email.messageId, date: email.date, appId: null, class: 'no-match' });
      continue;
    }
    matched.push({ email, application: hit.application, ...classifyEmail(email) });
  }

  if (useAi) {
    const unclear = matched.filter(m => m.class === 'unknown' || m.confidence === 'low');
    const aiClasses = await classifyWithAI(unclear.map(m => m.email));
    for (const item of unclear) {
      const aiClass = aiClasses.get(item.email.messageId);
      if (!aiClass || !(aiClass in CLASS_STATUS)) continue;
      item.class = aiClass;
      item.status = CLASS_STATUS[aiClass];
      item.source = 'ai';
      // The AI pass resolves the class but not the risk — a human still confirms.
      item.confidence = 'low';
    }
  }

  // One proposal per application. A thread produces several messages ("thanks
  // for chatting" then "we went another way") and only the newest is the
  // current state — otherwise the same application gets contradictory updates.
  const newestPerApplication = [...matched]
    .sort((a, b) => Date.parse(b.email.date) - Date.parse(a.email.date))
    .filter((item, _i, all) =>
      item === all.find(other => other.application.id === item.application.id));

  // Older messages in the same thread are still "handled" — record them so the
  // next run does not re-read them.
  for (const item of matched) {
    if (newestPerApplication.includes(item)) continue;
    state.seen.push({
      messageId: item.email.messageId, date: item.email.date,
      appId: item.application.id, class: 'superseded',
    });
  }

  for (const item of newestPerApplication) {
    const { email, application } = item;

    // Nothing classifiable and nothing job-shaped in the text — a receipt or an
    // event invite that merely came from the right domain. Not worth surfacing.
    if (!item.status && !looksApplicationRelated(email)) {
      state.seen.push({ messageId: email.messageId, date: email.date, appId: application.id, class: 'off-topic' });
      continue;
    }
    const record = {
      messageId: email.messageId,
      date: email.date,
      from: email.from,
      subject: email.subject,
      appId: application.id,
      class: item.class,
    };

    const allowed = canTransition(application.status, item.status);
    const entry = {
      // messageId lets a caller act on this one email later without re-reading
      // the mailbox (see resolveMessages).
      messageId: email.messageId,
      appId: application.id,
      company: application.company,
      jobTitle: application.jobTitle,
      from: email.from,
      subject: email.subject,
      date: email.date,
      class: item.class,
      confidence: item.confidence,
      source: item.source ?? 'pattern',
      current: application.status,
      next: item.status,
    };

    if (allowed && item.confidence === 'high') {
      result.updates.push(entry);
      if (apply) {
        try {
          setStatus(application.id, item.status);
          application.status = item.status; // later mail in this run sees the new state
          record.applied = true;
        } catch (err) {
          entry.error = err.message;
          record.applied = false;
        }
      }
    } else if (item.status && allowed) {
      entry.reason = 'low confidence';
      result.review.push(entry);
    } else if (item.class !== 'ack') {
      entry.reason = TERMINAL.has(application.status)
        ? `already ${application.status}`
        : (item.status ? 'not a forward move' : 'no clear decision');
      result.review.push(entry);
    }

    state.seen.push(record);
  }

  // --dismiss records the same messages as handled without touching any status:
  // the way to silence a correctly-matched email you do not want to act on.
  // Only these message ids are silenced — a later reply is a new id.
  if (apply || dismiss) {
    state.lastRunAt = new Date().toISOString();
    saveState(statePath, state);
    result.applied = apply;
    result.dismissed = dismiss;
  }
  return result;
}

/**
 * Act on individual messages a previous preview surfaced — no mailbox read.
 *
 * Entries come from `syncInbox` output and may have made a round trip through
 * a browser, so nothing in them is trusted: the application is re-read from
 * disk, and the requested status must still be a legal forward transition from
 * whatever the status is *now*. A stale or tampered entry is skipped, not applied.
 *
 * @param apply    entries whose status change should be written
 * @param dismiss  entries to silence without changing anything
 */
export function resolveMessages({
  apply = [], dismiss = [], statePath = STATE_PATH, applications = null,
} = {}) {
  const list = applications
    ?? readJson(APPLICATIONS_PATH, { applications: [] }).applications
    ?? [];
  const byId = new Map(list.map(app => [app.id, app]));
  const state = loadState(statePath);
  const result = { applied: [], dismissed: [], skipped: [] };

  const record = (entry, cls) => state.seen.push({
    messageId: entry.messageId,
    date: entry.date ?? new Date().toISOString(),
    from: entry.from ?? '',
    subject: entry.subject ?? '',
    appId: entry.appId ?? null,
    class: cls,
  });

  for (const entry of apply) {
    const application = byId.get(entry.appId);
    if (!application) {
      result.skipped.push({ ...entry, reason: 'unknown application' });
      continue;
    }
    if (!canTransition(application.status, entry.next)) {
      result.skipped.push({
        ...entry,
        reason: `${application.status} → ${entry.next ?? 'none'} is not allowed`,
      });
      continue;
    }
    try {
      setStatus(application.id, entry.next);
      application.status = entry.next;
      record(entry, entry.class ?? 'resolved');
      result.applied.push({ ...entry, current: entry.current, next: entry.next });
    } catch (err) {
      result.skipped.push({ ...entry, reason: err.message });
    }
  }

  for (const entry of dismiss) {
    record(entry, 'dismissed');
    result.dismissed.push(entry);
  }

  if (result.applied.length > 0 || result.dismissed.length > 0) {
    state.lastRunAt = new Date().toISOString();
    saveState(statePath, state);
  }
  return result;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function printReport(result, apply, dismiss = false) {
  const line = (s) => console.log(`[gmail-sync] ${s}`);
  line(`${result.waitingCount} application(s) waiting on a reply · ${result.scanned} new message(s)`);

  if (result.updates.length === 0 && result.review.length === 0) {
    line('no recruiter replies matched');
    return;
  }

  if (result.updates.length > 0) {
    console.log(`\n${apply ? 'Applied' : 'Proposed'} status changes:`);
    for (const u of result.updates) {
      console.log(`  ${u.company} — ${u.jobTitle}`);
      console.log(`    ${u.current} → ${u.next}   (${u.class}, ${u.source})`);
      console.log(`    "${u.subject}"  from ${u.from}`);
      if (u.error) console.log(`    NOT APPLIED: ${u.error}`);
    }
  }

  if (result.review.length > 0) {
    console.log('\nNeeds review:');
    for (const r of result.review) {
      console.log(`  ${r.company} — ${r.jobTitle}  [${r.reason}]`);
      console.log(`    "${r.subject}"  from ${r.from}`);
      if (r.next) console.log(`    would be: ${r.current} → ${r.next}`);
    }
  }

  if (dismiss) {
    console.log('\nMarked as handled. No status was changed; these will not appear again.');
  } else if (!apply) {
    console.log('\nNothing was written.'
      + '\n  --apply    save the proposed status changes'
      + '\n  --dismiss  silence these messages without changing any status');
  }
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const argv = process.argv.slice(2);
  const daysArg = Number(argv.find(a => a.startsWith('--days='))?.split('=')[1] ?? NaN);

  // --resolve=<file>: act on specific messages a previous preview returned.
  // The decisions arrive in a file because they are structured data, and this
  // path never touches IMAP, so it returns immediately.
  const resolvePath = argv.find(a => a.startsWith('--resolve='))?.split('=').slice(1).join('=');
  if (resolvePath) {
    try {
      const payload = readJson(resolvePath, null);
      if (!payload) throw new Error(`Could not read decisions file: ${resolvePath}`);
      const out = resolveMessages({ apply: payload.apply ?? [], dismiss: payload.dismiss ?? [] });
      if (argv.includes('--json')) {
        console.log(JSON.stringify(out, null, 2));
      } else {
        console.log(`[gmail-sync] applied ${out.applied.length}, dismissed ${out.dismissed.length}, skipped ${out.skipped.length}`);
        for (const s of out.skipped) console.log(`  skipped ${s.company ?? s.appId}: ${s.reason}`);
      }
    } catch (err) {
      console.error(`[gmail-sync] ${err.message}`);
      process.exit(1);
    }
  } else {
  try {
    const result = await syncInbox({
      apply: argv.includes('--apply'),
      dismiss: argv.includes('--dismiss'),
      days: Number.isFinite(daysArg) && daysArg > 0 ? daysArg : null,
      useAi: !argv.includes('--no-ai'),
    });
    if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else printReport(result, argv.includes('--apply'), argv.includes('--dismiss'));
  } catch (err) {
    console.error(`[gmail-sync] ${err.message}`);
    process.exit(1);
  }
  }
}
