/**
 * Gmail sync QA. Deterministic matching + classification, no IMAP, no Gemini.
 * Run: npm run gmail:qa
 */

import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canTransition,
  classifyEmail,
  companyTokens,
  isNoise,
  matchApplication,
  resolveMessages,
  syncInbox,
} from './gmail-sync.mjs';

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

const APPS = [
  { id: 'shopify-backend-developer-2026-07-02', company: 'Shopify', jobTitle: 'Backend Developer', status: 'Applied' },
  { id: 'the-home-depot-intern-ai-engineer-2026-08-01', company: 'The Home Depot', jobTitle: 'Intern, AI Engineer', status: 'Applied' },
  { id: 'd2l-software-developer-2026-06-11', company: 'D2L', jobTitle: 'Software Developer', status: 'Interview' },
  { id: 'telus-data-analyst-2026-05-20', company: 'TELUS', jobTitle: 'Data Analyst', status: 'Rejected' },
];

// ── Classification ──────────────────────────────────────────────────────────

check('euphemistic rejection is caught', () => {
  const r = classifyEmail({
    subject: 'Your application to Shopify',
    body: 'After careful review we have decided to move forward with other candidates '
      + 'whose experience more closely aligns with the needs of the role. We will keep '
      + 'your resume on file.',
  });
  assert.equal(r.class, 'rejected');
  assert.equal(r.status, 'Rejected');
  assert.equal(r.confidence, 'high');
});

check('rejection after an interview still reads as rejection, not interview', () => {
  const r = classifyEmail({
    subject: 'Following up on your interview',
    body: 'Thank you for taking the time to interview with our team last week. '
      + 'Unfortunately we will not be moving forward with your application.',
  });
  assert.equal(r.status, 'Rejected');
});

check('scheduling request maps to Interview', () => {
  const r = classifyEmail({
    subject: 'Next steps — Backend Developer',
    body: 'We would love to chat. Could you share your availability for a 30 minute '
      + 'call this week? Here is my Calendly: https://calendly.com/x',
  });
  assert.equal(r.status, 'Interview');
  assert.equal(r.confidence, 'high');
});

check('take-home maps to In Progress, not Interview', () => {
  const r = classifyEmail({
    subject: 'Technical assessment for your application',
    body: 'Please complete the take-home assignment linked below within 5 days.',
  });
  assert.equal(r.class, 'assessment');
  assert.equal(r.status, 'In Progress');
});

check('offer is caught', () => {
  const r = classifyEmail({
    subject: 'Offer of employment',
    body: 'We are pleased to offer you the position of Backend Developer.',
  });
  assert.equal(r.status, 'Offer');
});

check('auto-acknowledgement changes nothing', () => {
  const r = classifyEmail({
    subject: 'We received your application',
    body: 'Thank you for applying to Shopify. This is an automated message; '
      + 'do not reply to this email.',
  });
  assert.equal(r.class, 'ack');
  assert.equal(r.status, null);
});

check('ack wearing interview words is low confidence, not an auto-update', () => {
  const r = classifyEmail({
    subject: 'Thanks for applying',
    body: 'Thank you for your application. If your background is a match we will '
      + 'reach out about next steps.',
  });
  assert.equal(r.confidence, 'low');
});

check('unrelated mail is unknown', () => {
  const r = classifyEmail({ subject: 'Your invoice is ready', body: 'Payment due Friday.' });
  assert.equal(r.class, 'unknown');
  assert.equal(r.status, null);
});

// ── Matching ────────────────────────────────────────────────────────────────

check('employer domain matches the application', () => {
  const hit = matchApplication({
    from: 'talent@shopify.com',
    subject: 'Your application',
    body: 'Thanks for your interest in the Backend Developer role.',
  }, APPS);
  assert.equal(hit.application.id, 'shopify-backend-developer-2026-07-02');
});

check('ATS sender is matched through the body, not the domain', () => {
  const hit = matchApplication({
    from: 'no-reply@greenhouse.io',
    subject: 'Update on your application',
    body: 'The Home Depot has reviewed your application for Intern, AI Engineer.',
  }, APPS);
  assert.equal(hit.application.id, 'the-home-depot-intern-ai-engineer-2026-08-01');
});

check('short company names still match', () => {
  const hit = matchApplication({
    from: 'careers@d2l.com',
    subject: 'D2L — Software Developer',
    body: 'Following up about the Software Developer position.',
  }, APPS);
  assert.equal(hit.application.id, 'd2l-software-developer-2026-06-11');
});

check('unrelated mail matches nothing', () => {
  assert.equal(matchApplication({
    from: 'billing@stripe.com',
    subject: 'Your receipt',
    body: 'Thanks for your payment.',
  }, APPS), null);
});

check('job alerts are treated as noise', () => {
  assert.equal(isNoise({ from: 'jobalerts-noreply@linkedin.com', subject: '10 new jobs for you' }), true);
  assert.equal(matchApplication({
    from: 'jobalerts-noreply@linkedin.com',
    subject: 'Shopify and 9 other new jobs for you',
    body: 'Backend Developer at Shopify',
  }, APPS), null);
});

check('two roles at one company disambiguate on the job title', () => {
  const apps = [
    { id: 'a', company: 'Shopify', jobTitle: 'Backend Developer', status: 'Applied' },
    { id: 'b', company: 'Shopify', jobTitle: 'Data Analyst', status: 'Applied' },
  ];
  const hit = matchApplication({
    from: 'talent@shopify.com',
    subject: 'Shopify — Data Analyst',
    body: 'About your Data Analyst application.',
  }, apps);
  assert.equal(hit.application.id, 'b');
});

check('an unresolvable tie returns null instead of guessing', () => {
  const apps = [
    { id: 'a', company: 'Shopify', jobTitle: 'Backend Developer', status: 'Applied' },
    { id: 'b', company: 'Shopify', jobTitle: 'Frontend Developer', status: 'Applied' },
  ];
  assert.equal(matchApplication({
    from: 'talent@shopify.com',
    subject: 'Your application',
    body: 'An update on your application.',
  }, apps), null);
});

// Regression: every one of these was a false positive in the first live run.

const SHORT_NAME_APPS = [
  { id: 'ey-banking-staff', company: 'EY', jobTitle: 'Banking Technology - Staff Consultant - Toronto', status: 'Applied' },
  { id: 'td-insights-analyst', company: 'TD', jobTitle: 'Business Insights Analyst II', status: 'Applied' },
];

check('a two-letter company does not match inside ordinary words', () => {
  // "they/survey/money" all contain "ey"; "Toronto" is in the job title.
  assert.equal(matchApplication({
    from: 'meetup-group-bxsixnyc-announce@email.meetup.com',
    subject: 'Toronto - Digital Success Entrepreneurs: Learn How AI Is Helping People',
    body: 'They say the survey shows money can be made. Join us today in Toronto!',
  }, SHORT_NAME_APPS), null);
});

check('a personal Gmail sender never matches an application', () => {
  assert.equal(matchApplication({
    from: 'jim.vanhemmen@gmail.com',
    subject: 'Re: Invitation: Coffee: Jim X Dhruv X Girish',
    body: 'Unfortunately I cannot make it. Talk soon about EY and your job search.',
  }, SHORT_NAME_APPS), null);
});

check('an unrelated vendor domain never matches', () => {
  assert.equal(matchApplication({
    from: 'no-reply@kaggle.com',
    subject: '[Wrap Up + Next Steps] 5-Day AI Agents Intensive',
    body: 'Thanks for joining. Here are the next steps for the course.',
  }, SHORT_NAME_APPS), null);
});

check('bulk mail is rejected even from the employer domain', () => {
  const promo = {
    from: 'scotiabank@email.scotiabank.com',
    subject: 'Girish, your more than $20 in Scene+ points expire soon',
    body: 'Redeem your points before they expire.',
    bulk: true,
  };
  const apps = [{ id: 's', company: 'Scotiabank', jobTitle: 'Developer, AI Engineering', status: 'Applied' }];
  assert.equal(isNoise(promo), true);
  assert.equal(matchApplication(promo, apps), null);
  // The same domain without the bulk headers is a real reply.
  assert.notEqual(matchApplication({ ...promo, bulk: false, subject: 'Your application' }, apps), null);
});

check('a company word inside a longer brand does not match', () => {
  // "Aviso Wealth" must not match wealthsimple.com.
  assert.equal(matchApplication({
    from: 'notifications@m.wealthsimple.com',
    subject: 'Trade prediction markets in our new app',
    body: 'Your portfolio update is ready.',
  }, [{ id: 'aw', company: 'Aviso Wealth', jobTitle: 'AI Engineer - Gen AI', status: 'Applied' }]), null);
});

check('subdomains of the real employer still match', () => {
  for (const from of ['careers@homedepot.com', 'talent@jobs.homedepot.com']) {
    const hit = matchApplication({
      from, subject: 'Your application', body: 'An update on your candidacy.',
    }, [{ id: 'hd', company: 'The Home Depot', jobTitle: 'Intern, AI Engineer', status: 'Applied' }]);
    assert.notEqual(hit, null, from);
  }
});

check('a marketing lookalike domain does not pass as the employer', () => {
  assert.equal(matchApplication({
    from: 'email@e.email-td.com',
    subject: 'Last call on your TD Direct Investing offer',
    body: 'This offer ends soon.',
  }, SHORT_NAME_APPS), null);
});

check('the real recruiter reply still matches', () => {
  const apps = [{ id: 'm', company: 'Manulife', jobTitle: 'Associate Full Stack Software Engineer', status: 'Applied' }];
  const hit = matchApplication({
    from: 'craig_leonard@manulife.com',
    subject: 'RE: [EXTERNAL] Thanks for being open to chat',
    body: 'Great speaking with you. Are you free for an interview next week?',
  }, apps);
  assert.equal(hit.application.id, 'm');
});

check('company tokens drop legal suffixes but keep the name', () => {
  assert.deepEqual(companyTokens('The Home Depot Inc.'), ['home', 'depot']);
  assert.deepEqual(companyTokens('TD'), ['td']);
});

// ── Transition guard ────────────────────────────────────────────────────────

check('forward moves are allowed', () => {
  assert.equal(canTransition('Applied', 'Interview'), true);
  assert.equal(canTransition('Applied', 'Rejected'), true);
  assert.equal(canTransition('Interview', 'Offer'), true);
});

check('Interview is never downgraded to In Progress', () => {
  assert.equal(canTransition('Interview', 'In Progress'), false);
});

check('terminal statuses are never overwritten', () => {
  assert.equal(canTransition('Rejected', 'Interview'), false);
  assert.equal(canTransition('Offer', 'Rejected'), false);
  assert.equal(canTransition('Withdrawn', 'Interview'), false);
});

check('a null status (ack) is never a transition', () => {
  assert.equal(canTransition('Applied', null), false);
});

check('a rejection for an already-rejected application is not re-applied', () => {
  const telus = APPS.find(a => a.company === 'TELUS');
  const cls = classifyEmail({ subject: 'Update', body: 'Unfortunately we are not moving forward.' });
  assert.equal(canTransition(telus.status, cls.status), false);
});

// ── End to end (no IMAP, no Gemini, no writes) ──────────────────────────────

const MAILBOX = [
  {
    messageId: '<1@shopify.com>', date: '2026-07-30T10:00:00Z', from: 'talent@shopify.com',
    subject: 'Next steps — Backend Developer',
    body: 'Could you share your availability for a call this week?',
  },
  {
    messageId: '<2@greenhouse.io>', date: '2026-07-30T11:00:00Z', from: 'no-reply@greenhouse.io',
    subject: 'The Home Depot — Intern, AI Engineer',
    body: 'Thank you for applying. We have received your application.',
  },
  {
    messageId: '<3@telus.com>', date: '2026-07-30T12:00:00Z', from: 'careers@telus.com',
    subject: 'TELUS Data Analyst update',
    body: 'Unfortunately we are not moving forward with your application.',
  },
  {
    messageId: '<4@stripe.com>', date: '2026-07-30T13:00:00Z', from: 'billing@stripe.com',
    subject: 'Your receipt', body: 'Thanks for your payment.',
  },
];

const run = await syncInbox({
  apply: false,
  useAi: false,
  applications: APPS,
  fetchMail: async () => MAILBOX,
});

check('only waiting applications are considered', () => {
  // Shopify + Home Depot + D2L are waiting; the rejected TELUS row is not.
  assert.equal(run.waitingCount, 3);
});

check('a scheduling email becomes a proposed Interview update', () => {
  assert.equal(run.updates.length, 1);
  assert.equal(run.updates[0].company, 'Shopify');
  assert.equal(run.updates[0].current, 'Applied');
  assert.equal(run.updates[0].next, 'Interview');
});

check('an auto-ack produces neither an update nor a review item', () => {
  assert.equal(run.updates.some(u => u.company === 'The Home Depot'), false);
  assert.equal(run.review.some(r => r.company === 'The Home Depot'), false);
});

check('mail for an already-rejected application is ignored', () => {
  assert.equal(run.updates.some(u => u.company === 'TELUS'), false);
  assert.equal(run.review.some(r => r.company === 'TELUS'), false);
});

check('a dry run writes nothing', () => {
  assert.equal(run.applied, false);
});

// Regression: one thread produced both "→ Interview" and "→ Rejected" for the
// same application in the first live run.
const THREAD = [
  {
    messageId: '<t1@manulife.com>', date: '2026-07-20T09:00:00Z', from: 'craig_leonard@manulife.com',
    subject: 'RE: Thanks for being open to chat',
    body: 'Are you free for an interview next week? Share your availability.',
  },
  {
    messageId: '<t2@manulife.com>', date: '2026-07-27T09:00:00Z', from: 'craig_leonard@manulife.com',
    subject: 'RE: Thanks for being open to chat',
    body: 'Unfortunately we are moving forward with other candidates.',
  },
];

const threadRun = await syncInbox({
  apply: false, useAi: false,
  applications: [{ id: 'm', company: 'Manulife', jobTitle: 'Associate Full Stack Software Engineer', status: 'Applied' }],
  fetchMail: async () => THREAD,
});

check('a thread yields one proposal, from the newest message', () => {
  assert.equal(threadRun.updates.length, 1);
  assert.equal(threadRun.updates[0].next, 'Rejected');
});

const offTopicRun = await syncInbox({
  apply: false, useAi: false,
  applications: [{ id: 'a', company: 'Amazon', jobTitle: 'Software Development Engineer', status: 'Applied' }],
  fetchMail: async () => [{
    messageId: '<o1@amazon.ca>', date: '2026-07-22T09:00:00Z', from: 'auto-confirm@amazon.ca',
    subject: 'Ordered: "Cozy Blanket Gift Basket"', body: 'Your order has shipped.',
  }],
});

check('on-domain mail that is not about a job is dropped, not surfaced', () => {
  assert.equal(offTopicRun.updates.length, 0);
  assert.equal(offTopicRun.review.length, 0);
});

// --dismiss must silence a message without ever touching an application.
const TMP_STATE = join(tmpdir(), `gmail-sync-qa-${process.pid}.json`);
const DISMISS_APPS = [{ id: 'm', company: 'Manulife', jobTitle: 'Associate Full Stack Software Engineer', status: 'Applied' }];

const dismissRun = await syncInbox({
  dismiss: true, useAi: false, statePath: TMP_STATE,
  applications: DISMISS_APPS,
  fetchMail: async () => [THREAD[1]],
});

const afterDismiss = await syncInbox({
  dismiss: false, useAi: false, statePath: TMP_STATE,
  applications: DISMISS_APPS,
  fetchMail: async () => [THREAD[1]],
});

check('--dismiss records the message but changes no status', () => {
  assert.equal(dismissRun.dismissed, true);
  assert.equal(dismissRun.applied, false);
  assert.equal(DISMISS_APPS[0].status, 'Applied');
});

check('a dismissed message does not come back on the next run', () => {
  assert.equal(afterDismiss.scanned, 0);
  assert.equal(afterDismiss.updates.length, 0);
});

rmSync(TMP_STATE, { force: true });

// ── Per-message resolve ─────────────────────────────────────────────────────
// resolveMessages never writes to real applications here: the entries point at
// ids that do not exist on disk, so every guard fires before setStatus runs.

const RESOLVE_STATE = join(tmpdir(), `gmail-sync-resolve-${process.pid}.json`);

check('an entry for an unknown application is skipped, not applied', () => {
  const out = resolveMessages({
    statePath: RESOLVE_STATE,
    applications: [{ id: 'known', company: 'Shopify', jobTitle: 'Backend Developer', status: 'Applied' }],
    apply: [{ messageId: '<x@a>', appId: 'does-not-exist', next: 'Interview' }],
  });
  assert.equal(out.applied.length, 0);
  assert.equal(out.skipped.length, 1);
  assert.match(out.skipped[0].reason, /unknown application/);
});

check('a status the transition guard rejects is skipped', () => {
  const out = resolveMessages({
    statePath: RESOLVE_STATE,
    applications: [{ id: 'k', company: 'Shopify', jobTitle: 'Backend Developer', status: 'Rejected' }],
    apply: [{ messageId: '<y@a>', appId: 'k', next: 'Interview' }],
  });
  assert.equal(out.applied.length, 0);
  assert.match(out.skipped[0].reason, /not allowed/);
});

check('a bogus status from the client is refused', () => {
  const out = resolveMessages({
    statePath: RESOLVE_STATE,
    applications: [{ id: 'k', company: 'Shopify', jobTitle: 'Backend Developer', status: 'Applied' }],
    apply: [{ messageId: '<z@a>', appId: 'k', next: 'Hired Immediately' }],
  });
  assert.equal(out.applied.length, 0);
  assert.equal(out.skipped.length, 1);
});

check('dismissing one message records only that message', () => {
  rmSync(RESOLVE_STATE, { force: true });
  const out = resolveMessages({
    statePath: RESOLVE_STATE,
    applications: [{ id: 'k', company: 'TD', jobTitle: 'Business Insights Analyst II', status: 'Applied' }],
    dismiss: [{ messageId: '<keep@td.com>', appId: 'k', subject: 'Job Opportunity', date: '2026-07-28T10:00:00Z' }],
  });
  assert.equal(out.dismissed.length, 1);
  assert.equal(out.applied.length, 0);
  const saved = JSON.parse(readFileSync(RESOLVE_STATE, 'utf-8'));
  assert.equal(saved.seen.length, 1);
  assert.equal(saved.seen[0].messageId, '<keep@td.com>');
  assert.equal(saved.seen[0].class, 'dismissed');
});

check('a dismissed message stays dismissed on the next sync', async () => {
  const after = await syncInbox({
    useAi: false, statePath: RESOLVE_STATE,
    applications: [{ id: 'k', company: 'TD', jobTitle: 'Business Insights Analyst II', status: 'Applied' }],
    fetchMail: async () => [{
      messageId: '<keep@td.com>', date: '2026-07-28T10:00:00Z', from: 'Nazeem@td.com',
      subject: 'Job Opportunity', body: 'We have an opening you may like.',
    }],
  });
  assert.equal(after.scanned, 0);
});

rmSync(RESOLVE_STATE, { force: true });

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
