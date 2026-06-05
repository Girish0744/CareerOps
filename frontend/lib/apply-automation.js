import fs from 'fs';
import path from 'path';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function attrsFromTag(tag) {
  const attrs = {};
  for (const match of String(tag).matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["']([^"']*)["']/g)) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

function stripTags(value) {
  return clean(String(value ?? '').replace(/<[^>]+>/g, ' '));
}

function labelText(field) {
  return clean([
    field.label,
    field.name,
    field.id,
    field.placeholder,
    field.ariaLabel,
    field.value,
  ].filter(Boolean).join(' '));
}

function applyCtaScore(label, href = '') {
  const text = lower(`${label} ${href}`);
  if (!text) return 0;
  if (/submit|send application|complete application|final|finish|withdraw|delete|save|share|refer|sign in|log in|login|create account/.test(text)) {
    return 0;
  }
  if (/^apply now$|^apply$|^start application$/.test(lower(label))) return 100;
  if (/\bapply now\b|\bapply for this job\b|\bapply to this job\b/.test(text)) return 90;
  if (/\bstart application\b|\bbegin application\b|\bcontinue to application\b/.test(text)) return 85;
  if (/\bapply\b/.test(text)) return 70;
  return 0;
}

export function isSafeApplyCta(label, href = '') {
  return applyCtaScore(label, href) > 0;
}

function tokens(value) {
  return lower(value)
    .split(/[^a-z0-9+#.]+/)
    .filter(token => token.length > 2);
}

function similarity(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(left.size, right.size);
}

const FIELD_ALIASES = {
  country: ['country', 'current country', 'residence country', 'which country do you stay', 'which country do you live', 'country of residence'],
  city: ['city', 'where are you located', 'current location', 'where do you live', 'where do you stay', 'where are you based', 'location'],
  province: ['province', 'state', 'region'],
  postal_code: ['postal code', 'postcode', 'zip code', 'zip'],
  address_line1: ['street', 'street address', 'mailing address', 'residential address', 'home address', 'address line 1'],
  work_authorization: ['authorized to work', 'eligible to work', 'legally work', 'work authorization', 'work eligibility'],
  sponsorship: ['sponsorship', 'visa sponsorship', 'require sponsorship', 'future sponsorship', 'work permit support'],
  availability: ['availability', 'start date', 'available to start', 'when can you start'],
};

function aliasKey(label) {
  const text = lower(label);
  let best = { key: '', score: 0 };
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const score = text.includes(alias) ? 1 : similarity(text, alias);
      if (score > best.score) best = { key, score };
    }
  }
  return best.score >= 0.34 ? best.key : '';
}

export function detectApplyProvider(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (host.includes('greenhouse.io')) return 'greenhouse';
  if (host.includes('lever.co')) return 'lever';
  if (host.includes('ashbyhq.com')) return 'ashby';
  return 'generic';
}

export function isRestrictedApplyHost(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ['linkedin.com', 'indeed.com', 'glassdoor.com']
    .some(domain => host === domain || host.endsWith(`.${domain}`));
}

function standardMap(session) {
  const map = new Map();
  for (const field of session?.standardFields ?? []) {
    if (field?.key) map.set(field.key, clean(field.value));
  }

  const legalName = map.get('legal_name') || '';
  const parts = legalName.split(/\s+/).filter(Boolean);
  if (!map.has('first_name')) map.set('first_name', parts[0] || '');
  if (!map.has('last_name')) map.set('last_name', parts.slice(1).join(' ') || '');

  return map;
}

function answerMatches(label, session) {
  const candidates = (session?.answers ?? [])
    .filter(answer => clean(answer.answer) && answer.fieldType !== 'file')
    .map(answer => ({
      answer,
      score: Math.max(
        similarity(label, answer.question),
        similarity(label, answer.label ?? ''),
      ),
    }))
    .sort((a, b) => b.score - a.score);

  if (candidates[0]?.score >= 0.22) return candidates[0].answer;
  const written = (session?.answers ?? []).filter(answer => answer.fieldType === 'written' && clean(answer.answer));
  if (written.length === 1 && /why|interest|experience|about|tell|describe|additional|cover/i.test(label)) {
    return written[0];
  }
  return null;
}

function valueFromStandard(label, session) {
  const text = lower(label);
  const map = standardMap(session);
  const pick = (key, source = `standardFields.${key}`) => {
    const value = map.get(key) || '';
    return { key, value, source, confidence: value ? 'high' : 'needs_review' };
  };

  if (/\bfirst\b.*\bname\b|given name/.test(text)) return pick('first_name');
  if (/\blast\b.*\bname\b|family name|surname/.test(text)) return pick('last_name');
  if (/legal name|full name|your name|\bname\b/.test(text)) return pick('legal_name');
  if (/email/.test(text)) return pick('email');
  if (/phone|mobile|telephone/.test(text)) return pick('phone');
  if (/linkedin/.test(text)) return pick('linkedin');
  if (/portfolio|website|personal site/.test(text)) return pick('portfolio');
  if (/github/.test(text)) return pick('github');
  if (/address line 2|address 2|unit|apartment|apt|suite/.test(text)) return pick('address_line2');
  if (/street address|address line 1|address 1|home address|mailing address|residential address|\baddress\b/.test(text)) return pick('address_line1');
  if (/postal|postcode|zip/.test(text)) return pick('postal_code');
  if (/country|which country|country.*stay|country.*live|residence country/.test(text)) return pick('country');
  if (/\bcity\b|where are you located|current location|where do you live|where do you stay|where are you based/.test(text)) return pick('city');
  if (/province|state/.test(text)) return pick('province');
  if (/authorized|eligible|legally.*work|work.*canada/.test(text)) return pick('work_authorization');
  if (/sponsor|sponsorship|visa/.test(text)) return pick('sponsorship');
  if (/availability|available|start date/.test(text)) return pick('availability');
  const alias = aliasKey(label);
  if (alias) return pick(alias);
  return null;
}

function fileValue(label, session) {
  const text = lower(label);
  const docs = session?.documents ?? {};
  if (/cover/.test(text)) return { key: 'cover_letter_upload', value: docs.coverLetterPath || '', source: 'documents.coverLetterPath' };
  if (/transcript/.test(text)) return { key: 'transcript_upload', value: docs.transcriptPath || '', source: 'documents.transcriptPath' };
  if (/resume|cv/.test(text)) return { key: 'resume_upload', value: docs.resumePath || '', source: 'documents.resumePath' };
  return null;
}

export function resolveAutomationValue(field, session) {
  const label = labelText(field);
  const tag = lower(field.tag);
  const type = lower(field.type || (tag === 'textarea' ? 'textarea' : 'text'));

  if (/search|keyword|filter|job alert|newsletter|subscribe|notification|sort by|radius/.test(lower(label))) {
    return { action: 'review', label, reason: 'Non-application search/filter field ignored.' };
  }

  if (type === 'file') {
    const file = fileValue(label, session);
    if (!file?.value) {
      return { action: 'review', key: file?.key ?? 'file_upload', label, reason: 'No matching upload path is configured.' };
    }
    return { action: 'upload', label, confidence: 'high', ...file };
  }

  if (['checkbox', 'radio'].includes(type)) {
    if (/gender|race|ethnicity|disability|veteran|indigenous|aboriginal|lgbtq|pronoun|demographic|diversity|eeo|equal opportunity/i.test(label)) {
      return { action: 'review', label, reason: 'Voluntary demographic question left for human review.' };
    }
    if (/terms|privacy|consent|accurate|certify|acknowledge|background check|reference check/i.test(label)) {
      return { action: 'review', label, reason: 'Consent/certification checkbox left for human review.' };
    }
    const standard = valueFromStandard(label, session);
    if (!standard) return { action: 'review', label, reason: 'Checkbox/radio needs human review.' };
    const optionText = lower(`${field.value ?? ''} ${field.label ?? ''} ${field.name ?? ''} ${field.id ?? ''}`);
    const standardMeansYes = /yes|eligible|authorized|can work|legally work/i.test(standard.value);
    const standardMeansNo = /no|not require|do not require|without sponsorship/i.test(standard.value);
    if (standardMeansYes && /yes|true|authorized|eligible/.test(optionText)) {
      return { action: 'check', label, ...standard };
    }
    if (standardMeansNo && /\bno\b|false|not require|do not require|without sponsorship/.test(optionText)) {
      return { action: 'check', label, ...standard };
    }
    return { action: 'review', label, key: standard.key, reason: 'Checkbox/radio was not changed because intent is ambiguous.' };
  }

  const standard = valueFromStandard(label, session);
  if (standard?.value) return { action: 'fill', label, ...standard };
  if (standard) return { action: 'review', label, key: standard.key, reason: 'Profile value is missing.' };

  const answer = answerMatches(label, session);
  if (answer) {
    return {
      action: 'fill',
      key: answer.key ?? 'written_response',
      label,
      value: clean(answer.answer),
      source: `answers.${answer.id}`,
      confidence: answer.confidence ?? 'medium',
    };
  }

  return { action: 'review', label, reason: 'No high-confidence profile field or generated answer matched this field.' };
}

export function buildAutomationPlan(fields, session) {
  const items = fields.map(field => ({ field, resolution: resolveAutomationValue(field, session) }));
  return {
    totalFields: items.length,
    fillable: items.filter(item => ['fill', 'upload', 'check'].includes(item.resolution.action)).length,
    needsReview: items.filter(item => item.resolution.action === 'review').length,
    items,
  };
}

function applicationFieldConfidence(field) {
  const text = lower(labelText(field));
  const type = lower(field.type || (field.tag === 'textarea' ? 'textarea' : 'text'));
  let score = 0;

  if (/search|keyword|filter|job alert|newsletter|subscribe|notification|sort by|radius/.test(text)) score -= 4;
  if (type === 'file' && /resume|cv|cover|transcript/.test(text)) score += 5;
  if (/first name|last name|given name|family name|surname|legal name|full name/.test(text)) score += 3;
  if (/email|phone|mobile|linkedin|portfolio|github|website/.test(text)) score += 2;
  if (/address|postal|postcode|zip|country|province|state|city|where do you stay|where are you located|where are you based/.test(text)) score += 2;
  if (/authorized|eligible|legally.*work|work.*authorization|sponsor|sponsorship|visa/.test(text)) score += 3;
  if (/availability|available to start|start date|salary|compensation|expected pay/.test(text)) score += 2;
  if (/why|interest|experience|tell us|describe|additional information|cover letter|right to work/.test(text)) score += 3;
  if (field.tag === 'textarea' && !/search|filter/.test(text)) score += 1;

  return score;
}

export function looksLikeApplicationForm(fields) {
  const scores = fields.map(applicationFieldConfidence);
  const positive = scores.reduce((sum, score) => sum + Math.max(0, score), 0);
  const highSignalCount = scores.filter(score => score >= 3).length;
  const hasUpload = fields.some((field, index) => lower(field.type) === 'file' && scores[index] >= 3);

  if (hasUpload) return true;
  if (highSignalCount >= 2) return true;
  if (highSignalCount >= 1 && positive >= 5 && fields.length >= 2) return true;
  if (highSignalCount >= 1 && fields.length === 1 && positive >= 4) return true;
  return false;
}

export function extractFixtureFieldsFromHtml(html) {
  const labels = new Map();
  for (const match of String(html).matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    const attrs = attrsFromTag(match[1]);
    if (attrs.for) labels.set(attrs.for, clean(match[2].replace(/<[^>]+>/g, ' ')));
  }

  const fieldsetQuestions = new Map();
  for (const match of String(html).matchAll(/<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/gi)) {
    const body = match[1];
    const legend = clean((body.match(/<legend\b[^>]*>([\s\S]*?)<\/legend>/i)?.[1] || '').replace(/<[^>]+>/g, ' '));
    if (!legend) continue;
    for (const inputMatch of body.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
      const attrs = attrsFromTag(inputMatch[2]);
      if (attrs.id) fieldsetQuestions.set(attrs.id, legend);
      if (attrs.name) fieldsetQuestions.set(attrs.name, legend);
    }
  }

  const fields = [];
  const tagPattern = /<(input|textarea|select)\b([^>]*)>/gi;
  let match;
  while ((match = tagPattern.exec(String(html)))) {
    const tag = match[1].toLowerCase();
    const attrs = attrsFromTag(match[2]);
    const type = attrs.type || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text');
    if (['hidden', 'submit', 'button', 'reset'].includes(type.toLowerCase())) continue;
    fields.push({
      tag,
      type,
      id: attrs.id || '',
      name: attrs.name || '',
      placeholder: attrs.placeholder || '',
      ariaLabel: attrs['aria-label'] || '',
      value: attrs.value || '',
      label: clean([
        fieldsetQuestions.get(attrs.id) || fieldsetQuestions.get(attrs.name) || '',
        labels.get(attrs.id) || attrs['aria-label'] || attrs.placeholder || attrs.name || attrs.id || '',
      ].filter(Boolean).join(' ')),
      domIndex: fields.length,
    });
  }
  return fields;
}

export function extractFixtureApplyCtasFromHtml(html) {
  const ctas = [];
  const pattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = pattern.exec(String(html)))) {
    const tag = match[1].toLowerCase();
    const attrs = attrsFromTag(match[2]);
    const label = stripTags(match[3]) || attrs['aria-label'] || attrs.title || attrs.href || '';
    const href = attrs.href || '';
    const score = applyCtaScore(label, href);
    if (score > 0) {
      ctas.push({ tag, label, href, score, domIndex: ctas.length });
    }
  }
  return ctas.sort((a, b) => b.score - a.score);
}

async function collectPageFields(page) {
  return page.locator('input, textarea, select').evaluateAll(elements => elements
    .map((el, domIndex) => {
      const input = el;
      const type = (input.getAttribute('type') || (el.tagName.toLowerCase() === 'textarea' ? 'textarea' : el.tagName.toLowerCase())).toLowerCase();
      const rect = el.getBoundingClientRect();
      const id = input.id || '';
      const labelFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const parentLabel = el.closest('label');
      const fieldset = el.closest('fieldset');
      const surrounding = el.closest('[class*="field"], [class*="question"], [data-qa], .application-question');
      return {
        tag: el.tagName.toLowerCase(),
        type,
        id,
        name: input.getAttribute('name') || '',
        placeholder: input.getAttribute('placeholder') || '',
        ariaLabel: input.getAttribute('aria-label') || '',
        value: input.getAttribute('value') || '',
        label: [
          fieldset?.querySelector('legend')?.textContent || '',
          labelFor?.textContent || '',
          parentLabel?.textContent || '',
          surrounding?.textContent || '',
        ].join(' ').replace(/\s+/g, ' ').trim(),
        disabled: input.disabled || input.getAttribute('aria-disabled') === 'true',
        visible: rect.width > 0 && rect.height > 0,
        domIndex,
      };
    })
    .filter(field => field.visible && !field.disabled && !['hidden', 'submit', 'button', 'reset'].includes(field.type)));
}

async function collectApplyCtas(page) {
  const ctas = await page.locator('a, button, [role="button"]').evaluateAll(elements => elements
    .map((el, domIndex) => {
      const rect = el.getBoundingClientRect();
      const text = [
        el.textContent || '',
        el.getAttribute('aria-label') || '',
        el.getAttribute('title') || '',
        el.getAttribute('href') || '',
      ].join(' ').replace(/\s+/g, ' ').trim();
      const href = el.getAttribute('href') || '';
      const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
      return {
        tag: el.tagName.toLowerCase(),
        label: text,
        href,
        score: 0,
        domIndex,
        disabled,
        visible: rect.width > 0 && rect.height > 0,
      };
    })
    .filter(cta => cta.visible && !cta.disabled));

  return ctas
    .map(cta => ({ ...cta, score: applyCtaScore(cta.label, cta.href) }))
    .filter(cta => cta.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function blockingReason(page) {
  const text = lower(await page.locator('body').innerText({ timeout: 3000 }).catch(() => ''));
  if (/captcha|recaptcha|verify you are human/.test(text)) return 'Captcha or human-verification page detected.';
  if (/sign in|log in|login|create account|one-time code|verification code/.test(text)) return 'Login or account wall detected.';
  return '';
}

async function resolveApplyFormPage(page, maxHops = 3) {
  const fromUrl = page.url();
  const hops = [];
  let activePage = page;

  for (let hop = 0; hop <= maxHops; hop += 1) {
    const fields = await collectPageFields(activePage);
    const applicationFormFound = looksLikeApplicationForm(fields);
    if (applicationFormFound) {
      return {
        page: activePage,
        fields,
        applyPageResolution: {
          attempted: hops.length > 0,
          clicked: hops.length > 0,
          hops,
          label: hops[0]?.label,
          reason: hops.length > 0
            ? `Clicked ${hops.length} safe Apply control${hops.length === 1 ? '' : 's'} before filling.`
            : 'Form fields were already visible on the saved URL.',
          fromUrl,
          toUrl: activePage.url(),
          ignoredFieldCount: 0,
        },
      };
    }

    const blocked = await blockingReason(activePage);
    if (blocked) {
      return {
        page: activePage,
        fields: [],
        applyPageResolution: {
          attempted: true,
          clicked: hops.length > 0,
          hops,
          label: hops[0]?.label,
          reason: blocked,
          fromUrl,
          toUrl: activePage.url(),
          ignoredFieldCount: fields.length,
        },
      };
    }

    if (hop === maxHops) {
      return {
        page: activePage,
        fields: [],
        applyPageResolution: {
          attempted: true,
          clicked: hops.length > 0,
          hops,
          label: hops[0]?.label,
          reason: `No application form was found after ${maxHops} safe Apply hop${maxHops === 1 ? '' : 's'}.`,
          fromUrl,
          toUrl: activePage.url(),
          ignoredFieldCount: fields.length,
        },
      };
    }

    const ctas = await collectApplyCtas(activePage);
    if (ctas.length === 0) {
      return {
        page: activePage,
        fields: [],
        applyPageResolution: {
          attempted: true,
          clicked: hops.length > 0,
          hops,
          label: hops[0]?.label,
          reason: fields.length > 0
            ? `Found ${fields.length} non-application field${fields.length === 1 ? '' : 's'} and no safe Apply button before the form.`
            : 'No safe Apply button or link was detected before an application form.',
          fromUrl,
          toUrl: activePage.url(),
          ignoredFieldCount: fields.length,
        },
      };
    }

    const beforeUrl = activePage.url();
    const clickables = activePage.locator('a, button, [role="button"]');
    const target = ctas[0];
    const popupPromise = activePage.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
    const navigationPromise = activePage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => null);
    await clickables.nth(target.domIndex).click();
    const popup = await popupPromise;
    if (popup) {
      activePage = popup;
      await activePage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined);
    } else {
      await navigationPromise;
    }
    await activePage.waitForTimeout(1200);
    hops.push({ label: target.label, fromUrl: beforeUrl, toUrl: activePage.url() });
  }

  return {
    page: activePage,
    fields: [],
    applyPageResolution: {
      attempted: true,
      clicked: hops.length > 0,
      hops,
      label: hops[0]?.label,
      reason: 'No fillable form fields were found.',
      fromUrl,
      toUrl: activePage.url(),
    },
  };
}

function absoluteUploadPath(rootDir, relativePath) {
  if (!relativePath) return '';
  return path.isAbsolute(relativePath) ? relativePath : path.join(rootDir, relativePath);
}

export function validateUploadPath(rootDir, applicationId, relativePath, key = '') {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return { ok: false, reason: 'No upload path is configured.' };
  if (key === 'transcript_upload') {
    const abs = absoluteUploadPath(rootDir, normalized);
    return fs.existsSync(abs) ? { ok: true, path: abs } : { ok: false, reason: `Transcript file not found: ${relativePath}` };
  }

  if (key === 'resume_upload' || key === 'cover_letter_upload') {
    const expectedPrefix = `applications/${applicationId}/`;
    if (!applicationId || !normalized.startsWith(expectedPrefix)) {
      return {
        ok: false,
        reason: `${key === 'resume_upload' ? 'Resume' : 'Cover letter'} must come from ${expectedPrefix}, not ${relativePath}.`,
      };
    }
  }

  const abs = absoluteUploadPath(rootDir, normalized);
  return fs.existsSync(abs) ? { ok: true, path: abs } : { ok: false, reason: `Upload file not found: ${relativePath}` };
}

async function selectOption(locator, value) {
  try {
    await locator.selectOption({ label: value });
    return true;
  } catch {
    const options = await locator.locator('option').evaluateAll(nodes => nodes.map(option => ({
      label: option.textContent?.trim() || '',
      value: option.getAttribute('value') || '',
    })));
    const match = options.find(option =>
      option.label.toLowerCase() === value.toLowerCase() ||
      option.value.toLowerCase() === value.toLowerCase() ||
      option.label.toLowerCase().includes(value.toLowerCase()));
    if (!match) return false;
    await locator.selectOption(match.value || { label: match.label });
    return true;
  }
}

export async function runVisibleApplyAutomation({ url, session, rootDir, launchOptions = {} }) {
  if (isRestrictedApplyHost(url)) {
    return {
      status: 'blocked',
      provider: detectApplyProvider(url),
      stoppedReason: 'Restricted job-board host. Open the employer/ATS apply link instead.',
      fieldsFilled: [],
      filesUploaded: [],
      uncertainFields: [],
      currentUrl: url,
      browserLeftOpen: false,
    };
  }

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 80,
    ...launchOptions,
  });
  const page = await browser.newPage();
  const provider = detectApplyProvider(url);
  const result = {
    status: 'browser_open_review',
    provider,
    stoppedReason: 'Filled the current page where confidence was high. Review the page and submit manually.',
    fieldsFilled: [],
    filesUploaded: [],
    uncertainFields: [],
    applyPageResolution: null,
    currentUrl: url,
    browserLeftOpen: true,
  };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    const resolved = await resolveApplyFormPage(page);
    const activePage = resolved.page;
    const fields = resolved.fields;
    result.applyPageResolution = resolved.applyPageResolution;
    if (resolved.applyPageResolution.clicked) {
      result.provider = detectApplyProvider(activePage.url());
    }
    const allControls = activePage.locator('input, textarea, select');

    for (const field of fields) {
      const resolution = resolveAutomationValue(field, session);
      const locator = allControls.nth(field.domIndex);

      try {
        if (resolution.action === 'fill') {
          if (field.tag === 'select') {
            const selected = await selectOption(locator, resolution.value);
            if (!selected) throw new Error('No matching select option.');
          } else {
            await locator.fill(resolution.value);
          }
          result.fieldsFilled.push({ label: resolution.label, key: resolution.key, source: resolution.source });
        } else if (resolution.action === 'upload') {
          const validation = validateUploadPath(rootDir, session?.applicationId, resolution.value, resolution.key);
          if (!validation.ok) throw new Error(validation.reason);
          await locator.setInputFiles(validation.path);
          result.filesUploaded.push({ label: resolution.label, key: resolution.key, path: resolution.value });
        } else if (resolution.action === 'check') {
          await locator.check();
          result.fieldsFilled.push({ label: resolution.label, key: resolution.key, source: resolution.source });
        } else {
          result.uncertainFields.push({ label: resolution.label, reason: resolution.reason });
        }
      } catch (err) {
        result.uncertainFields.push({
          label: resolution.label || labelText(field),
          reason: err instanceof Error ? err.message : 'Field could not be automated.',
        });
      }
    }

    result.currentUrl = activePage.url();
    if (fields.length === 0) {
      result.stoppedReason = result.applyPageResolution?.reason || 'No fillable form fields were found.';
    }
    return result;
  } catch (err) {
    result.status = 'blocked';
    result.stoppedReason = err instanceof Error ? err.message : 'Visible browser automation failed.';
    result.currentUrl = page.url();
    return result;
  }
}
