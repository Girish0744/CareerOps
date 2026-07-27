/**
 * Apply-by-email QA. Deterministic parsing + body checks, no Gemini calls.
 * Run: npm run email:qa
 */

import assert from 'node:assert/strict';
import {
  buildGreeting,
  buildSubject,
  fallbackEmailBody,
  findClosingDate,
  findEmails,
  findReferenceNumber,
  findRequestedSubject,
  parseApplyEmail,
  verifyApplyEmailBody,
} from './frontend/lib/apply-email.js';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

// Real post shape: emoji labels, stated subject, recruiter name after the address.
const LINKEDIN_POST = `🚨 Hiring Alert | Product Manager - Junior | Toronto, ON (Onsite) 🚨
Position: RQ11356 – Product Manager - Junior
📍 Location: Toronto, Ontario (Onsite)
🏢 Client: Ministry of Public and Business Service Delivery and Procurement
📅 Start Date: August 10, 2026
⏳ Duration: 177 Business Days (Extension Probable)
Must-Have Skills:
✅ 5+ years of experience in Product Management
✅ Experience in the Data & AI domain
📩 Interested candidates can directly share their updated resume at:
mishra.neha@smsoftconsulting.com Neha Mishra
📌 Email Subject: RQ11356 – Product Manager - Junior | Closing Date: July 28, 2026 (10:00 AM EST)
⚠️ Please mention the RQ Number and Closing Date in the email subject line for faster processing.`;

check('extracts the recruiter address', () => {
  const parsed = parseApplyEmail(LINKEDIN_POST);
  assert.equal(parsed.recipient, 'mishra.neha@smsoftconsulting.com');
  assert.equal(parsed.isEmailApplication, true);
});

check('keeps the stated subject verbatim, including en dash and closing date', () => {
  const parsed = parseApplyEmail(LINKEDIN_POST);
  assert.equal(
    parsed.requestedSubject,
    'RQ11356 – Product Manager - Junior | Closing Date: July 28, 2026 (10:00 AM EST)',
  );
  assert.equal(parsed.subjectSource, 'posting');
  // buildSubject must not rewrite a subject the recruiter dictated.
  assert.equal(buildSubject(parsed, { jobTitle: 'Anything Else' }), parsed.requestedSubject);
});

check('reads the RQ number, closing date, and recruiter name', () => {
  const parsed = parseApplyEmail(LINKEDIN_POST);
  assert.equal(parsed.referenceNumber, 'RQ11356');
  assert.equal(parsed.closingDate, 'July 28, 2026 (10:00 AM EST)');
  assert.equal(parsed.contactName, 'Neha Mishra');
  assert.equal(buildGreeting(parsed), 'Hi Neha,');
});

check('excludes the candidate own address from recipients', () => {
  const post = `Send your resume to hiring@acme.com\nApplicant: girishbhuteja07@gmail.com`;
  const parsed = parseApplyEmail(post, { excludeEmails: ['girishbhuteja07@gmail.com'] });
  assert.equal(parsed.recipient, 'hiring@acme.com');
  assert.ok(!parsed.ccRecipients.includes('girishbhuteja07@gmail.com'));
});

check('prefers the address on the send-your-resume line', () => {
  const post = `About us: press@bigco.com for media.\nInterested candidates can email their resume to careers@bigco.com`;
  assert.equal(parseApplyEmail(post).recipient, 'careers@bigco.com');
});

check('drops no-reply addresses', () => {
  assert.deepEqual(findEmails('write to no-reply@x.com or jobs@x.com'), ['jobs@x.com']);
});

check('strips trailing punctuation from an address in prose', () => {
  assert.deepEqual(findEmails('Send it to hr@acme.io.'), ['hr@acme.io']);
});

check('builds a conventional subject when the post states none', () => {
  const parsed = parseApplyEmail('Email your resume to jobs@acme.com for our Backend Developer role.');
  assert.equal(parsed.subjectSource, 'generated');
  assert.equal(
    buildSubject(parsed, { jobTitle: 'Backend Developer', applicantName: 'Girish Bhuteja' }),
    'Backend Developer - Girish Bhuteja',
  );
});

check('generated subject leads with the reference number when present', () => {
  const parsed = parseApplyEmail('Job ID: 55231. Send resume to jobs@acme.com');
  assert.equal(parsed.referenceNumber, '55231');
  assert.equal(buildSubject(parsed, { jobTitle: 'QA Analyst' }), '55231 - QA Analyst');
});

check('falls back to a neutral greeting with no recruiter name', () => {
  assert.equal(buildGreeting(parseApplyEmail('Send to jobs@acme.com')), 'Hello,');
});

check('non-email postings are not treated as email applications', () => {
  const parsed = parseApplyEmail('Apply on our careers page at https://acme.com/jobs/123');
  assert.equal(parsed.isEmailApplication, false);
  assert.equal(parsed.recipient, '');
});

// ── Body verification ────────────────────────────────────────────────────────

const GOOD_BODY = `Hi Neha,

I would like to apply for the Product Manager - Junior role (RQ11356). My resume is attached.

Most of my product experience comes from building Zonalyze, a zoning analysis tool I took from an idea to a working product used by real users. I owned the roadmap, talked to the people using it, and decided what shipped each week. I am finishing my computer science degree at Conestoga in August 2026.

Happy to walk through any of it. You can reach me at girishbhuteja07@gmail.com or 519-555-0123.

Thank you for your time,
Girish Bhuteja`;

const CHECK_OPTIONS = {
  applicantName: 'Girish Bhuteja',
  email: 'girishbhuteja07@gmail.com',
  phone: '519-555-0123',
};

check('a clean human-sounding body passes', () => {
  const issues = verifyApplyEmailBody(GOOD_BODY, CHECK_OPTIONS);
  assert.deepEqual(issues.filter(i => i.severity === 'fix'), [], JSON.stringify(issues));
});

check('catches AI filler phrases', () => {
  const body = GOOD_BODY.replace('I would like to apply for', 'I hope this email finds you well. I am writing to apply for');
  const issues = verifyApplyEmailBody(body, CHECK_OPTIONS);
  assert.ok(issues.some(i => i.code === 'banned-phrase'), JSON.stringify(issues));
});

check('catches a leaked subject line in the body', () => {
  const issues = verifyApplyEmailBody(`Subject: RQ11356\n\n${GOOD_BODY}`, CHECK_OPTIONS);
  assert.ok(issues.some(i => i.code === 'subject-leak'), JSON.stringify(issues));
});

check('catches unfilled placeholders', () => {
  const issues = verifyApplyEmailBody(GOOD_BODY.replace('Girish Bhuteja', '[Your Name]'), CHECK_OPTIONS);
  assert.ok(issues.some(i => i.code === 'placeholder'), JSON.stringify(issues));
});

check('catches a missing sign-off', () => {
  const issues = verifyApplyEmailBody(GOOD_BODY.replace('\nGirish Bhuteja', ''), CHECK_OPTIONS);
  assert.ok(issues.some(i => i.code === 'missing-signoff'), JSON.stringify(issues));
});

check('catches a body that never mentions the attachment', () => {
  const issues = verifyApplyEmailBody(GOOD_BODY.replace(' My resume is attached.', ''), CHECK_OPTIONS);
  assert.ok(issues.some(i => i.code === 'no-attachment-mention'), JSON.stringify(issues));
});

check('catches an over-long body', () => {
  const issues = verifyApplyEmailBody(`${GOOD_BODY} ${'word '.repeat(200)}`, CHECK_OPTIONS);
  assert.ok(issues.some(i => i.code === 'word-count' && i.severity === 'fix'), JSON.stringify(issues));
});

check('catches em dashes', () => {
  const issues = verifyApplyEmailBody(GOOD_BODY.replace('attached.', 'attached — see below.'), CHECK_OPTIONS);
  assert.ok(issues.some(i => i.code === 'em-dash'), JSON.stringify(issues));
});

check('the deterministic fallback body is itself sendable', () => {
  const parsed = parseApplyEmail(LINKEDIN_POST);
  const body = fallbackEmailBody(parsed, {
    ...CHECK_OPTIONS,
    jobTitle: 'Product Manager - Junior',
    company: 'SM Soft Consulting',
  });
  const issues = verifyApplyEmailBody(body, CHECK_OPTIONS);
  assert.deepEqual(issues.filter(i => i.severity === 'fix'), [], JSON.stringify(issues));
  assert.ok(body.startsWith('Hi Neha,'));
});

check('standalone finders work on messy real-world lines', () => {
  assert.equal(findRequestedSubject('📌 Subject Line - Senior Dev | Ref 88'), 'Senior Dev | Ref 88');
  assert.equal(findRequestedSubject('Please mention the RQ number in the subject line'), '');
  assert.equal(findReferenceNumber('Position: RQ 11356 – PM'), 'RQ11356');
  assert.equal(findClosingDate('Deadline: August 1, 2026'), 'August 1, 2026');
});

console.log(`\n${passed} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.error('\n' + failures.join('\n'));
  process.exit(1);
}
