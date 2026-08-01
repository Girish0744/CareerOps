#!/usr/bin/env node

/**
 * autopilot.mjs — Career Autopilot morning batch.
 *
 * Promotes the best unprocessed jobs from data/scored-queue.json into complete
 * application packages (evaluation + tailored resume + cover letter) through
 * the career-ops frontend API, then composes a WhatsApp briefing and schedules
 * it via Postbox. Sequential and capped so free Gemini limits are respected.
 *
 * The autopilot ends at "docs ready". It NEVER applies, never clicks Submit,
 * never logs into portals — applying stays the human-reviewed flow.
 *
 * Usage:
 *   node autopilot.mjs               full run per config/autopilot.yml
 *   node autopilot.mjs --dry-run     show candidate selection only, no writes
 *   node autopilot.mjs --limit=1     override max packages this run
 *   node autopilot.mjs --no-briefing skip the Postbox message
 *   node autopilot.mjs --no-scan     skip the discovery refresh
 *   node autopilot.mjs --no-inbox    skip the Gmail status sync
 */

import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

// Also loads .env + frontend/.env.local (see ENV_FILES there) — the scheduled
// task runs with a bare environment, so the keys must come from the files.
import { syncInbox } from './gmail-sync.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = path.join(ROOT, 'data', 'scored-queue.json');
const APPLICATIONS_PATH = path.join(ROOT, 'data', 'applications.json');
const RUNS_DIR = path.join(ROOT, 'data', 'autopilot-runs');
const CONFIG_PATH = path.join(ROOT, 'config', 'autopilot.yml');
const REFERRALS_PATH = path.join(ROOT, 'config', 'referrals.yml');

const DEFAULTS = {
  enabled: true,
  quick_score_min: 80,
  full_score_min: 80,
  borderline_min: 75,
  max_packages_per_run: 4,
  delay_between_jobs_seconds: 45,
  refresh_scan: true,
  sync_inbox: true,
  frontend_url: 'http://localhost:3000',
  postbox: { url: '', phone: '' },
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_BRIEFING = args.includes('--no-briefing');
const NO_SCAN = args.includes('--no-scan');
const NO_INBOX = args.includes('--no-inbox');
const LIMIT_ARG = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? NaN);

function log(message) {
  console.log(`[autopilot] ${message}`);
}

function loadConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf-8')) ?? {};
    } catch (err) {
      log(`WARN could not parse config/autopilot.yml (${err.message}); using defaults`);
    }
  }
  return {
    ...DEFAULTS,
    ...fileConfig,
    postbox: { ...DEFAULTS.postbox, ...(fileConfig.postbox ?? {}) },
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

// ── Referrals (config/referrals.yml) — always first priority ────────────────

function loadReferrals() {
  if (!fs.existsSync(REFERRALS_PATH)) return { quickScoreMin: 70, companies: [] };
  try {
    const parsed = yaml.load(fs.readFileSync(REFERRALS_PATH, 'utf-8')) ?? {};
    return {
      quickScoreMin: Number(parsed.referral_quick_score_min) || 70,
      companies: (parsed.companies ?? []).map(entry => ({
        name: String(entry.name ?? ''),
        contacts: (entry.contacts ?? []).map(String),
        match: (entry.match ?? []).map(alias => String(alias).toLowerCase()),
      })).filter(entry => entry.name && entry.match.length > 0),
    };
  } catch (err) {
    log(`WARN could not parse config/referrals.yml (${err.message}); referral priority disabled`);
    return { quickScoreMin: 70, companies: [] };
  }
}

function referralFor(referrals, companyName) {
  const haystack = ` ${String(companyName ?? '').toLowerCase()} `;
  for (const company of referrals.companies) {
    for (const alias of company.match) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(haystack)) return company;
    }
  }
  return null;
}

async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function isFrontendUp(frontendUrl) {
  try {
    const res = await fetchJson(`${frontendUrl}/api/scan`, {}, 10000);
    return res.ok || res.status === 500; // any HTTP answer means the server is up
  } catch {
    return false;
  }
}

async function ensureFrontend(frontendUrl) {
  if (await isFrontendUp(frontendUrl)) {
    log('frontend already running');
    return null;
  }
  log('frontend not running — starting npm run dev');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: path.join(ROOT, 'frontend'),
    shell: true,
    detached: false,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await sleep(3000);
    if (await isFrontendUp(frontendUrl)) {
      log('frontend is up');
      return child;
    }
  }
  throw new Error('frontend did not become ready within 120s');
}

function stopFrontend(child) {
  if (!child?.pid) return;
  log('stopping the frontend this run started');
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {});
  } else {
    child.kill('SIGTERM');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Prefer GET /api/scan: it returns the queue enriched live against
 * applications.json (URL + company/role matching), so cards evaluated in
 * earlier runs carry hasApplication/applicationId even before the queue file
 * itself is re-saved. Falls back to the raw file when the frontend is down
 * (e.g. --dry-run), where the extra company::jobTitle dedupe below helps.
 */
async function loadQueue(frontendUrl) {
  try {
    const res = await fetchJson(`${frontendUrl}/api/scan`, {}, 20000);
    if (res.ok && Array.isArray(res.body)) return res.body;
  } catch { /* frontend down — use the file */ }
  return readJson(QUEUE_PATH, []);
}

function selectCandidates(config, limit, queue, referrals) {
  const applications = readJson(APPLICATIONS_PATH, { applications: [] }).applications ?? [];
  const existingKeys = new Set(applications.map(app =>
    `${(app.company ?? '').toLowerCase().trim()}::${(app.jobTitle ?? '').toLowerCase().trim()}`));

  return queue
    .map(card => ({ ...card, referral: referralFor(referrals, card.company) }))
    .filter(card => card.reviewState === 'new'
      && !card.hasApplication
      && !card.applicationId
      && typeof card.score === 'number'
      // Referral companies always qualify at their own (lower) threshold —
      // a posting where Girish knows someone is worth an evaluation.
      && card.score >= (card.referral ? referrals.quickScoreMin : config.quick_score_min)
      && card.jobUrl
      && !existingKeys.has(`${(card.company ?? '').toLowerCase().trim()}::${(card.jobTitle ?? '').toLowerCase().trim()}`))
    // Referral companies first (that's the point), then by score/freshness.
    .sort((a, b) => (Number(Boolean(b.referral)) - Number(Boolean(a.referral)))
      || (b.score - a.score)
      || (Date.parse(b.postedAt ?? 0) || 0) - (Date.parse(a.postedAt ?? 0) || 0))
    .slice(0, limit);
}

async function evaluateCard(frontendUrl, card) {
  // Same payload shape the Job Discovery UI sends for a scan card.
  return fetchJson(`${frontendUrl}/api/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: card.jobUrl,
      applyUrl: card.directApplyUrl ?? card.jobUrl,
      sourceUrl: card.jobUrl,
      scanContext: {
        company: card.company,
        jobTitle: card.jobTitle,
        location: card.location,
        description: card.description ?? null,
        score: card.score,
        fitLevel: card.fitLevel,
        recommendation: card.recommendation,
        summary: card.summary,
        matched: card.matched ?? [],
        gaps: card.gaps ?? [],
        sourceType: card.sourceType ?? null,
        sourceName: card.sourceName ?? card.source ?? null,
        postedAt: card.postedAt,
        directApplyUrl: card.directApplyUrl ?? null,
      },
    }),
  }, 180000);
}

async function generateDocs(frontendUrl, applicationId) {
  return fetchJson(`${frontendUrl}/api/generate-docs/${applicationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Pinned to two-page on purpose. The API would otherwise apply the JD-based
    // length suggestion, which would silently change unattended overnight output
    // to one-pagers. Change this to 'one-page', or drop the field to follow the
    // suggestion, once the one-page format has been used enough to trust it.
    body: JSON.stringify({ type: 'both', length: 'two-page' }),
  }, 240000);
}

function composeBriefing(summary) {
  const date = new Date().toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  const lines = [`Career Autopilot — ${date}`];

  // Replies go first — a scheduling request is worth more than any new posting.
  const inbox = summary.inbox;
  if (inbox?.updates?.length > 0) {
    lines.push(`📬 ${inbox.updates.length} repl${inbox.updates.length === 1 ? 'y' : 'ies'}:`);
    for (const u of inbox.updates) {
      const nudge = u.next === 'Interview' ? '  ⚡ reply today'
        : u.next === 'Offer' ? '  🎉'
        : '';
      lines.push(`   ${u.company} — ${u.jobTitle} → ${u.next}${nudge}`);
    }
  }
  if (inbox?.review?.length > 0) {
    lines.push(`❓ ${inbox.review.length} email(s) need review: `
      + inbox.review.map(r => `${r.company} "${r.subject}"`).join('; '));
  }

  const referralPackages = summary.packages.filter(p => p.referralContacts?.length);
  const otherPackages = summary.packages.filter(p => !p.referralContacts?.length);
  let n = 0;

  if (referralPackages.length > 0) {
    lines.push(`🤝 Referral-company packages — submit, then message your contact:`);
    for (const p of referralPackages) {
      lines.push(`${++n}. ${p.company} — ${p.jobTitle} — ${p.score}/100 → ask ${p.referralContacts.join(', ')}`);
    }
  }
  if (otherPackages.length > 0) {
    lines.push(`✅ Ready to submit:`);
    for (const p of otherPackages) {
      lines.push(`${++n}. ${p.company} — ${p.jobTitle} — ${p.score}/100`);
    }
  }
  if (summary.packages.length === 0) {
    lines.push('✅ No new submit-ready packages this run.');
  }

  if (summary.borderline.length > 0) {
    lines.push(`🤔 Borderline (${summary.config.borderline_min}-${summary.config.full_score_min - 1}), evaluate manually: `
      + summary.borderline.map(b => `${b.company} ${b.jobTitle} (${b.score})${b.referralContacts?.length ? ` [referral: ${b.referralContacts.join(', ')}]` : ''}`).join('; '));
  }
  if (summary.failures.length > 0) {
    lines.push(`⚠️ ${summary.failures.length} job(s) failed: ${summary.failures.map(f => f.company ?? f.id).join(', ')}`);
  }
  lines.push(`📥 ${summary.queueNewCount} new job(s) in the queue. Open localhost:3000 to review and submit.`);

  return lines.join('\n').slice(0, 4000);
}

async function sendBriefing(config, text) {
  if (!config.postbox?.url || !config.postbox?.phone) {
    log('Postbox not configured (config/autopilot.yml postbox.url/phone) — briefing saved to file only');
    return { sent: false, reason: 'postbox-not-configured' };
  }
  try {
    const res = await fetchJson(`${config.postbox.url.replace(/\/$/, '')}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: config.postbox.phone,
        contactName: 'Career Autopilot',
        body: text,
        sendAt: Date.now() + 2 * 60 * 1000, // Postbox requires >=1 min in the future
      }),
    }, 20000);
    if (!res.ok) return { sent: false, reason: `postbox ${res.status}: ${JSON.stringify(res.body)}` };
    return { sent: true, messageId: res.body?.id ?? null };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

async function main() {
  const config = loadConfig();
  const referrals = loadReferrals();
  if (!config.enabled) {
    log('disabled in config/autopilot.yml — exiting');
    return;
  }
  const limit = Number.isFinite(LIMIT_ARG) && LIMIT_ARG > 0
    ? Math.min(LIMIT_ARG, config.max_packages_per_run)
    : config.max_packages_per_run;

  const startedAt = new Date().toISOString();
  const summary = {
    startedAt,
    finishedAt: null,
    dryRun: DRY_RUN,
    config: {
      quick_score_min: config.quick_score_min,
      full_score_min: config.full_score_min,
      borderline_min: config.borderline_min,
      limit,
    },
    scanRefreshed: false,
    inbox: null,
    candidates: [],
    packages: [],
    borderline: [],
    skipped: [],
    failures: [],
    queueNewCount: 0,
    briefing: null,
    briefingDelivery: null,
  };

  // Quick scores are optimistic — the full A-G evaluation demotes many cards.
  // So the cap applies to PACKAGES PRODUCED; we may evaluate up to 3x the cap
  // in candidates to get there (each evaluation is a single cheap Gemini call).
  const evaluationBudget = limit * 3;

  if (DRY_RUN) {
    const candidates = selectCandidates(config, evaluationBudget, await loadQueue(config.frontend_url), referrals);
    summary.candidates = candidates.map(c => ({ id: c.id, company: c.company, jobTitle: c.jobTitle, score: c.score, postedAt: c.postedAt, referral: c.referral?.contacts ?? null }));
    log(`DRY RUN — candidate pool (${candidates.length}, stops after ${limit} package(s)):`);
    for (const c of candidates) log(`  ${c.score}/100  ${c.company} — ${c.jobTitle}${c.referral ? ` 🤝 ${c.referral.contacts.join(', ')}` : ''}`);
    console.log(JSON.stringify(summary.candidates, null, 2));
    return;
  }

  let startedChild = null;
  try {
    // Recruiter replies first — they are the most time-sensitive thing in the
    // briefing, and they must not depend on the frontend booting. Fail-soft:
    // a mailbox problem never blocks the package run.
    if (config.sync_inbox && !NO_INBOX) {
      log('syncing inbox for recruiter replies...');
      try {
        summary.inbox = await syncInbox({ apply: true });
        log(`inbox: ${summary.inbox.updates.length} status update(s), ${summary.inbox.review.length} to review`);
      } catch (err) {
        log(`WARN inbox sync failed (${err.message}) — continuing`);
        summary.inbox = { error: err.message, updates: [], review: [] };
      }
    }

    startedChild = await ensureFrontend(config.frontend_url);

    if (config.refresh_scan && !NO_SCAN) {
      log('refreshing discovery (POST /api/scan/run)...');
      try {
        const res = await fetchJson(`${config.frontend_url}/api/scan/run`, { method: 'POST' }, 300000);
        summary.scanRefreshed = res.ok;
        if (!res.ok) log(`WARN scan refresh failed (${res.status}) — continuing with the existing queue`);
      } catch (err) {
        log(`WARN scan refresh failed (${err.message}) — continuing with the existing queue`);
      }
    }

    const candidates = selectCandidates(config, evaluationBudget, await loadQueue(config.frontend_url), referrals);
    summary.candidates = candidates.map(c => ({ id: c.id, company: c.company, jobTitle: c.jobTitle, score: c.score, referral: c.referral?.contacts ?? null }));
    log(`candidate pool: ${candidates.length} (${candidates.filter(c => c.referral).length} referral-company, package cap ${limit}, evaluation budget ${evaluationBudget})`);

    for (const [index, card] of candidates.entries()) {
      if (summary.packages.length >= limit) {
        log(`package cap (${limit}) reached — stopping`);
        break;
      }
      const label = `${card.company} — ${card.jobTitle}${card.referral ? ` 🤝 (${card.referral.contacts.join(', ')})` : ''}`;
      try {
        log(`(${index + 1}/${candidates.length}) evaluating: ${label}`);
        const evalRes = await evaluateCard(config.frontend_url, card);
        if (!evalRes.ok) {
          summary.failures.push({ id: card.id, company: card.company, jobTitle: card.jobTitle, stage: 'evaluate', error: evalRes.body?.error ?? `HTTP ${evalRes.status}` });
          log(`  evaluate FAILED: ${evalRes.body?.error ?? evalRes.status}`);
          continue;
        }
        const { applicationId, score } = evalRes.body;
        log(`  full score ${score}/100 (${evalRes.body.fitLevel})`);

        if (score >= config.full_score_min) {
          log(`  generating documents for ${applicationId}...`);
          const docsRes = await generateDocs(config.frontend_url, applicationId);
          if (!docsRes.ok) {
            summary.failures.push({ id: card.id, company: card.company, jobTitle: card.jobTitle, applicationId, stage: 'generate-docs', error: docsRes.body?.error ?? `HTTP ${docsRes.status}` });
            log(`  docs FAILED: ${docsRes.body?.error ?? docsRes.status}`);
          } else {
            const report = docsRes.body.resumeReport ?? {};
            summary.packages.push({
              id: card.id,
              applicationId,
              company: card.company,
              jobTitle: card.jobTitle,
              score,
              referralContacts: card.referral?.contacts ?? null,
              pageCount: report.pageCount ?? null,
              pageFills: report.pageFills ?? null,
              expansionsApplied: report.expansionsApplied ?? [],
              warnings: docsRes.body.warnings ?? [],
            });
            log(`  package ready (pages: ${report.pageCount ?? '?'}, fills: ${JSON.stringify(report.pageFills ?? {})})`);
          }
        } else if (score >= config.borderline_min) {
          summary.borderline.push({ id: card.id, applicationId, company: card.company, jobTitle: card.jobTitle, score, referralContacts: card.referral?.contacts ?? null });
          log('  borderline — listed in briefing, no docs');
        } else {
          summary.skipped.push({ id: card.id, applicationId, company: card.company, jobTitle: card.jobTitle, score, reason: 'below-borderline' });
          log('  below borderline — skipped');
        }
      } catch (err) {
        summary.failures.push({ id: card.id, company: card.company, jobTitle: card.jobTitle, stage: 'unknown', error: err.message });
        log(`  FAILED: ${err.message}`);
      }
      if (index < candidates.length - 1 && summary.packages.length < limit) {
        log(`sleeping ${config.delay_between_jobs_seconds}s (rate-limit spacing)...`);
        await sleep(config.delay_between_jobs_seconds * 1000);
      }
    }

    summary.queueNewCount = (await loadQueue(config.frontend_url)).filter(card => card.reviewState === 'new').length;
    summary.briefing = composeBriefing(summary);
    summary.briefingDelivery = (NO_BRIEFING)
      ? { sent: false, reason: 'skipped (--no-briefing)' }
      : await sendBriefing(config, summary.briefing);
    log(`briefing: ${summary.briefingDelivery.sent ? 'queued via Postbox' : `not sent (${summary.briefingDelivery.reason})`}`);
  } finally {
    summary.finishedAt = new Date().toISOString();
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    const stamp = summary.finishedAt.replace(/[:T]/g, '-').slice(0, 16);
    const runPath = path.join(RUNS_DIR, `${stamp}.json`);
    fs.writeFileSync(runPath, JSON.stringify(summary, null, 2));
    log(`run summary saved: ${path.relative(ROOT, runPath)}`);
    stopFrontend(startedChild);
  }

  log(`done — ${summary.packages.length} package(s), ${summary.borderline.length} borderline, ${summary.failures.length} failure(s)`);
  console.log(summary.briefing);
}

main().catch(err => {
  console.error(`[autopilot] FATAL: ${err.message}`);
  process.exit(1);
});
