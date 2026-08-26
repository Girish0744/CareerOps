/**
 * Apply-by-email support for postings with no application link (e.g. LinkedIn
 * hiring posts that say "send your resume to X with subject Y").
 *
 * Parsing is deterministic on purpose: RQ numbers, closing dates, and the exact
 * subject line the recruiter asked for must be reproduced character-for-character.
 * Only the email BODY is model-written.
 */

import { BANNED_COVER_LETTER_PHRASES, findGraduationMention } from './document-content-core.mjs';

// Trailing punctuation that regularly abuts an address in prose ("at a@b.com.").
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const SUBJECT_LABELS = [
  'email subject line',
  'email subject',
  'subject line',
  'subject',
];

// Lines that signal "this is where you send it".
const SEND_HINTS = [
  'share', 'send', 'email', 'e-mail', 'apply', 'forward', 'submit',
  'interested candidates', 'resume at', 'reach out', 'contact',
];

// Addresses that are never the recruiter (support desks, no-reply, the candidate).
const NON_RECIPIENT_PATTERNS = [
  /^no-?reply@/i, /^do-?not-?reply@/i, /^postmaster@/i, /^abuse@/i,
  /^privacy@/i, /^unsubscribe@/i,
];

function stripLeadingDecoration(line) {
  // Drop leading emoji/pictographs, bullets, and separators that LinkedIn posts
  // put in front of labels ("📌 Email Subject:", "✅ ...", "- ...").
  return String(line ?? '')
    .replace(/^[\s​-‍﻿]+/, '')
    .replace(/^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}←-⇿☀-➿️⃣]|[-*•>·—–|]|\d+[.)])+\s*/gu, '')
    .trim();
}

function cleanEmail(raw) {
  return String(raw ?? '').trim().replace(/[.,;:)\]}>'"]+$/, '').toLowerCase();
}

export function findEmails(text) {
  const matches = String(text ?? '').match(EMAIL_PATTERN) ?? [];
  const seen = new Set();
  const out = [];
  for (const match of matches) {
    const email = cleanEmail(match);
    if (!email || seen.has(email)) continue;
    if (NON_RECIPIENT_PATTERNS.some(pattern => pattern.test(email))) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * Pull the subject the poster explicitly asked for. Returns the text verbatim
 * (dashes, casing, RQ number, closing date all preserved) or '' when absent.
 */
export function findRequestedSubject(text) {
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = stripLeadingDecoration(raw);
    const lower = line.toLowerCase();
    for (const label of SUBJECT_LABELS) {
      if (!lower.startsWith(label)) continue;
      const rest = line.slice(label.length).replace(/^\s*[:\-–—]\s*/, '').trim();
      // "Subject: X" only counts when there is an X; a bare "Subject line" that
      // introduces the next sentence is not a subject.
      if (rest.length >= 3) return rest.replace(/^["'“”]|["'“”]$/g, '').trim();
    }
  }
  return '';
}

/** Requisition/reference ids: RQ11356, REQ-4821, Job ID 55231. */
export function findReferenceNumber(text) {
  const patterns = [
    /\b(RQ\s?-?\s?\d{3,})\b/i,
    /\b(REQ\s?-?\s?\d{3,})\b/i,
    /\b(?:job|requisition|posting|position)\s*(?:id|number|no\.?|#)\s*[:\-]?\s*([A-Z0-9-]{3,})\b/i,
  ];
  for (const pattern of patterns) {
    const match = String(text ?? '').match(pattern);
    if (match) return match[1].replace(/\s+/g, '').toUpperCase();
  }
  return '';
}

/** Closing/deadline date as written, e.g. "July 28, 2026 (10:00 AM EST)". */
export function findClosingDate(text) {
  const match = String(text ?? '').match(
    /(?:closing date|close date|deadline|apply by|closes on|last date)\s*[:\-–—]?\s*([^\n|]{4,60})/i,
  );
  if (!match) return '';
  return match[1].replace(/[\s.,;]+$/, '').trim();
}

/**
 * Recruiter name written next to the address ("neha@x.com Neha Mishra") or on
 * the surrounding lines. Returns '' rather than guessing badly.
 */
export function findContactName(text, email) {
  if (!email) return '';
  const lines = String(text ?? '').split(/\r?\n/);
  const namePattern = /\b([A-Z][a-z'’-]{1,20}(?:\s+[A-Z][a-z'’-]{1,20}){1,2})\b/;

  const index = lines.findIndex(line => line.toLowerCase().includes(email));
  if (index === -1) return '';

  // Text after the address on the same line is the most reliable signal.
  const sameLine = lines[index].slice(lines[index].toLowerCase().indexOf(email) + email.length);
  const after = sameLine.match(namePattern);
  if (after) return after[1].trim();

  const next = lines[index + 1] ? stripLeadingDecoration(lines[index + 1]).match(namePattern) : null;
  if (next) return next[1].trim();

  return '';
}

function pickRecipient(text, emails) {
  if (emails.length <= 1) return emails[0] ?? '';
  const lines = String(text ?? '').split(/\r?\n/);
  // Prefer an address on a line that actually tells you to send something.
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!SEND_HINTS.some(hint => lower.includes(hint))) continue;
    const onLine = emails.find(email => lower.includes(email));
    if (onLine) return onLine;
  }
  return emails[0];
}

/**
 * Parse an apply-by-email posting. `excludeEmails` keeps the candidate's own
 * address (which appears in the JD snapshot header and in resumes) out of the
 * recipient list.
 */
export function parseApplyEmail(jobDescription, options = {}) {
  const text = String(jobDescription ?? '');
  const exclude = new Set((options.excludeEmails ?? []).filter(Boolean).map(e => cleanEmail(e)));
  const emails = findEmails(text).filter(email => !exclude.has(email));
  const recipient = pickRecipient(text, emails);
  const requestedSubject = findRequestedSubject(text);

  return {
    isEmailApplication: !!recipient,
    recipient,
    ccRecipients: emails.filter(email => email !== recipient),
    requestedSubject,
    subjectSource: requestedSubject ? 'posting' : recipient ? 'generated' : 'none',
    referenceNumber: findReferenceNumber(text),
    closingDate: findClosingDate(text),
    contactName: findContactName(text, recipient),
  };
}

/**
 * The subject actually used. A subject stated in the post always wins verbatim,
 * because recruiters filter on it. Otherwise build the conventional fallback.
 */
export function buildSubject(parsed, app = {}) {
  if (parsed.requestedSubject) return parsed.requestedSubject;
  const parts = [];
  if (parsed.referenceNumber) parts.push(parsed.referenceNumber);
  if (app.jobTitle) parts.push(app.jobTitle);
  const head = parts.join(' - ') || 'Application';
  return app.applicantName ? `${head} - ${app.applicantName}` : head;
}

export function buildGreeting(parsed) {
  const name = String(parsed.contactName ?? '').trim();
  if (!name) return 'Hello,';
  // "Neha Mishra" -> "Hi Neha," keeps it warm without being over-familiar.
  return `Hi ${name.split(/\s+/)[0]},`;
}

const BANNED_EMAIL_PHRASES = [
  ...BANNED_COVER_LETTER_PHRASES,
  'i hope this email finds you well',
  'i hope this finds you well',
  'i came across your post',
  'per your posting',
  'as per the requirement',
  'kindly find attached',
  'please find attached my resume for your kind perusal',
  'do the needful',
  'i am confident that i would be',
  'wealth of experience',
  'aforementioned',
  'esteemed organization',
  'i would be grateful for the opportunity',
];

function findPhrase(text, phrases) {
  const lower = String(text ?? '').toLowerCase();
  return phrases.find(phrase => lower.includes(phrase.toLowerCase())) ?? null;
}

/**
 * Checks on the model-written body. Same spirit as buildCoverLetterChecks:
 * catch AI-sounding filler, fabricated attachments, and missing sign-off.
 * Returns [{ code, severity, message }].
 */
export function verifyApplyEmailBody(body, options = {}) {
  const issues = [];
  const push = (code, severity, message) => issues.push({ code, severity, message });
  const text = String(body ?? '').trim();

  if (!text) {
    push('empty', 'fix', 'email body is empty');
    return issues;
  }

  const gradMention = findGraduationMention(text);
  if (gradMention) {
    push('graduation-mention', 'fix',
      `email says "${gradMention}" — drop it; sell capability, not schooling`);
  }

  const wordCount = text.split(/\s+/).length;
  if (wordCount < 60 || wordCount > 220) {
    push('word-count', 'fix', `body is ${wordCount} words; target 90-160`);
  } else if (wordCount < 90 || wordCount > 180) {
    push('word-count', 'warn', `body is ${wordCount} words; target 90-160`);
  }

  const banned = findPhrase(text, BANNED_EMAIL_PHRASES);
  if (banned) push('banned-phrase', 'fix', `body contains AI-sounding phrase "${banned}"; rewrite that sentence`);

  if (text.includes('—')) push('em-dash', 'warn', 'body contains em dashes; use commas or parentheses');

  if (/\b(subject|re)\s*:/i.test(text.split('\n')[0] ?? '')) {
    push('subject-leak', 'fix', 'body must not restate the subject line; it is sent separately');
  }

  if (/\[|\]|\{\{|xxx\b|your name|insert /i.test(text)) {
    push('placeholder', 'fix', 'body contains an unfilled placeholder');
  }

  const applicantName = String(options.applicantName ?? '').trim();
  if (applicantName && !text.includes(applicantName.split(/\s+/)[0])) {
    push('missing-signoff', 'fix', `body must be signed off as ${applicantName}`);
  }

  const email = String(options.email ?? '').trim();
  const phone = String(options.phone ?? '').trim();
  if ((email || phone) && !(text.includes(email) || (phone && text.includes(phone)))) {
    push('missing-contact', 'warn', 'sign-off should include an email or phone number');
  }

  if (options.mentionsAttachment !== false && !/\b(attach|attached|attaching|enclosed)\b/i.test(text)) {
    push('no-attachment-mention', 'warn', 'body should mention the attached resume');
  }

  return issues;
}

/** Deterministic body used when the model call fails. Plain, honest, sendable. */
export function fallbackEmailBody(parsed, app = {}) {
  const name = app.applicantName || 'Girish Bhuteja';
  const role = app.jobTitle || 'the role';
  const company = app.company ? ` at ${app.company}` : '';
  const ref = parsed.referenceNumber ? ` (${parsed.referenceNumber})` : '';
  const contactBits = [app.email, app.phone].filter(Boolean).join(' or ');

  return [
    `${buildGreeting(parsed)}`,
    '',
    `I would like to be considered for the ${role}${ref} position${company}. My resume is attached.`,
    '',
    'I hold a Bachelor of Computer Science from Conestoga College, and I have spent the last two years building and shipping real software projects alongside the degree. I would welcome the chance to talk through how that lines up with what you are looking for.',
    '',
    `Happy to share anything else that would help${contactBits ? `, and you can reach me at ${contactBits}` : ''}.`,
    '',
    'Thank you for your time,',
    name,
  ].join('\n');
}
