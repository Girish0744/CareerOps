const HOUR_MS = 60 * 60 * 1000;

export const ROLE_PRIORITY_ORDER = {
  full_time_new_grad: 0,
  full_time_entry: 1,
  full_time_general: 2,
  intern_coop: 3,
  stretch: 4,
  skip: 5,
};

export function parseRelativeTimestamp(label, now = new Date()) {
  if (!label || typeof label !== 'string') return null;
  const text = label.toLowerCase().trim();
  const value = Number(text.match(/\d+/)?.[0] ?? 0);
  const base = now.getTime();

  if (text.includes('minute')) return new Date(base - value * 60 * 1000).toISOString();
  if (text.includes('hour')) return new Date(base - value * HOUR_MS).toISOString();
  if (text === 'today') return new Date(base).toISOString();
  if (text === 'yesterday') return new Date(base - 24 * HOUR_MS).toISOString();
  if (text.includes('day')) return new Date(base - value * 24 * HOUR_MS).toISOString();
  if (text.includes('week')) return new Date(base - value * 7 * 24 * HOUR_MS).toISOString();
  return null;
}

export function postedAgeHours(postedAt, now = new Date()) {
  if (!postedAt) return null;
  const time = Date.parse(postedAt);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((now.getTime() - time) / HOUR_MS));
}

export function freshnessBucket(postedAt, firstSeenAt = null, now = new Date()) {
  const age = postedAgeHours(postedAt || firstSeenAt, now);
  if (age == null) return 'unknown';
  if (age <= 24) return '24h';
  if (age <= 72) return '72h';
  if (age <= 168) return '7d';
  return 'older';
}

export function classifyRolePriority(title, location = '') {
  const text = `${title || ''} ${location || ''}`.toLowerCase();
  if (/\b(senior|sr\.?|staff|principal|director|manager|lead|architect|vice president|avp)\b/.test(text)) return 'stretch';
  if (/\b(intern|internship|co-?op|co op)\b/.test(text)) return 'intern_coop';
  if (/\b(new grad|new graduate|graduate program|university graduate|early career|campus)\b/.test(text)) return 'full_time_new_grad';
  if (/\b(entry level|entry-level|junior|jr\.)\b/.test(text)) return 'full_time_entry';
  if (/\b(software developer|software engineer|software development engineer|full[ -]?stack|frontend|front end|backend|back end|application developer|web developer|java developer|python developer|\.net developer|ai application|applied ai|machine learning|data analyst|business analyst|systems analyst|system analyst|it analyst|qa analyst|quality assurance|software tester|test analyst|it help desk|help desk|it technician|technical support|support analyst|application support)\b/.test(text)
    || /\b(?:system|systems|architecture|technical|technology|it|application|software|web|data|business|process|operations|quality|qa|support|solution|solutions)[\w\s/.-]{0,50}analyst\b/.test(text)
    || /\banalyst[\w\s/.-]{0,50}(?:system|systems|architecture|technical|technology|it|application|software|web|data|business|process|operations|quality|qa|support|solution|solutions)\b/.test(text)
    || /\b(?:it|technical|application|desktop|service desk|help desk|systems?)[\w\s/.-]{0,50}(?:support|technician|specialist|associate)\b/.test(text)
    || /\b(?:support|technician|specialist|associate)[\w\s/.-]{0,50}(?:it|technical|application|desktop|service desk|help desk|systems?)\b/.test(text)) {
    return 'full_time_general';
  }
  return 'skip';
}

export function employmentTypeForRole(rolePriority) {
  if (rolePriority === 'intern_coop') return 'internship/co-op';
  if (rolePriority === 'full_time_new_grad' || rolePriority === 'full_time_entry' || rolePriority === 'full_time_general') return 'full-time';
  if (rolePriority === 'stretch') return 'full-time stretch';
  return 'needs review';
}

export function rolePriorityRank(rolePriority) {
  return ROLE_PRIORITY_ORDER[rolePriority] ?? ROLE_PRIORITY_ORDER.skip;
}
