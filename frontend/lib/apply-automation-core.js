function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
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

export function aliasKey(label) {
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
