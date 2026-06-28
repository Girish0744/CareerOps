const COMMON_NON_REFERENCE_VALUES = new Set([
  'apply',
  'benefits',
  'canada',
  'contract',
  'description',
  'full-time',
  'fulltime',
  'hybrid',
  'location',
  'ontario',
  'part-time',
  'permanent',
  'posting',
  'qualifications',
  'remote',
  'requirements',
  'responsibilities',
  'salary',
  'temporary',
]);

const LABELED_REFERENCE_PATTERNS = [
  /\b(?:job\s*(?:id|number|no\.?|#|code|ref(?:erence)?|requisition)|job\s*req(?:uisition)?|requisition\s*(?:id|number|no\.?|#)?|req(?:uisition)?\s*(?:id|number|no\.?|#)?|posting\s*(?:id|number|no\.?|#)|position\s*(?:id|number|no\.?|#)|opening\s*(?:id|number|no\.?|#)|vacancy\s*(?:id|number|no\.?|#)|competition\s*(?:id|number|no\.?|#)|reference\s*(?:id|number|no\.?|#)?|ref\s*(?:id|number|no\.?|#)?)\b\s*(?::|#|-|=|is)?\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,31})\b/i,
  /^(?:id|ref)\s*(?::|#|-|=)\s*([A-Za-z0-9][A-Za-z0-9._/-]{2,31})\b/i,
];

function cleanCandidate(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/^[#:\-\s]+/, '')
    .replace(/[\s,;.)\]}]+$/, '')
    .trim();
}

function isPlausibleJobReference(value: string): boolean {
  const candidate = cleanCandidate(value);
  if (candidate.length < 3 || candidate.length > 32) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*[A-Za-z0-9]$/.test(candidate)) return false;
  if (/https?:|www\.|@/.test(candidate)) return false;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(candidate)) return false;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(candidate)) return false;
  if (/^(?:19|20)\d{2}$/.test(candidate)) return false;

  const normalized = candidate.toLowerCase();
  if (COMMON_NON_REFERENCE_VALUES.has(normalized)) return false;

  const hasDigit = /\d/.test(candidate);
  const hasSeparator = /[._/-]/.test(candidate);
  const hasUppercase = /[A-Z]/.test(candidate);
  const isUppercaseAlpha = /^[A-Z]{3,12}$/.test(candidate);

  if (hasDigit) return true;
  if (hasSeparator && hasUppercase) return true;
  return isUppercaseAlpha;
}

export function extractJobReference(text: string | null | undefined): string | null {
  if (!text) return null;

  const lines = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0 && line.length <= 180);

  for (const line of lines) {
    for (const pattern of LABELED_REFERENCE_PATTERNS) {
      const match = pattern.exec(line);
      if (!match?.[1]) continue;
      const candidate = cleanCandidate(match[1]);
      if (isPlausibleJobReference(candidate)) return candidate;
    }
  }

  return null;
}

export function formatJobReferenceForSubject(text: string | null | undefined): string {
  const reference = extractJobReference(text);
  return formatJobReferenceValue(reference);
}

export function formatJobReferenceValue(value: string | null | undefined): string {
  if (!value) return '';
  const reference = cleanCandidate(value);
  return isPlausibleJobReference(reference) ? ` (Job ID: ${reference})` : '';
}