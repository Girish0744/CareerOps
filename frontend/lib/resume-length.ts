/**
 * resume-length.ts — suggests one page or two for a given posting.
 *
 * Deterministic on purpose: no model call, so the suggestion is instant, free
 * and identical for the same JD every time. It is only a DEFAULT — Girish picks
 * the length at generation time — so every signal that fires is returned as a
 * plain-English reason rather than the choice arriving unexplained.
 */

import { KNOWN_TECH_VOCABULARY } from './document-content-core.mjs';

export type ResumeLength = 'one-page' | 'two-page';

export interface ResumeLengthSuggestion {
  length: ResumeLength;
  reasons: string[];
}

/** Roles where one page is the convention regardless of how much evidence exists. */
const EARLY_CAREER_TITLE = /\b(intern|internship|co-?op|new\s?grad(uate)?|graduate\s+(program|analyst|developer|engineer)|junior|entry[- ]level|campus|apprentice|trainee)\b/i;

/** Seniority that genuinely justifies the extra page. */
const SENIOR_TITLE = /\b(senior|sr\.?|staff|principal|lead|architect|manager|head\s+of|director|specialist|expert|II?I|IV)\b/i;

/** Roles judged on service and communication rather than depth of stack. */
const SERVICE_ROLE = /\b(support|service\s?desk|help\s?desk|customer|client\s+facing|operations|coordinator|administrator|desktop|technician)\b/i;

const CAMPUS_PROGRAM = /\b(campus recruiting|university recruiting|new grad program|graduate program|rotational program|early talent|student program)\b/i;

/** Largest "N years" figure the posting asks for, or null when it names none. */
function maxYearsRequired(text: string): number | null {
  const matches = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?year/gi)]
    .map(match => Number(match[1]))
    .filter(years => Number.isFinite(years) && years > 0 && years <= 20);
  return matches.length ? Math.max(...matches) : null;
}

function countNamedTechnologies(text: string): number {
  const lower = text.toLowerCase();
  const found = KNOWN_TECH_VOCABULARY.filter((tool: string) => {
    const term = tool.toLowerCase();
    // Word-ish boundary so "C" or "R" style names do not match inside words,
    // while "Next.js" and "C++" still match literally.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // '.' is deliberately NOT in the boundary class: a sentence-final
    // "Node.js." would otherwise fail to match.
    return new RegExp(`(^|[^a-z0-9+#])${escaped}([^a-z0-9+#]|$)`, 'i').test(lower);
  });
  return found.length;
}

export function suggestResumeLength(
  jobDescription: string | null | undefined,
  jobTitle: string | null | undefined = '',
): ResumeLengthSuggestion {
  const jd = String(jobDescription ?? '');
  const title = String(jobTitle ?? '');
  const haystack = `${title}\n${jd}`;

  // Signals are WEIGHTED, not counted. An explicit years-of-experience bar says
  // far more about expected resume length than how many tools got listed, and
  // an intern posting is a one-page resume no matter what else it mentions.
  const onePage: Array<{ reason: string; weight: number }> = [];
  const twoPage: Array<{ reason: string; weight: number }> = [];

  if (EARLY_CAREER_TITLE.test(title)) onePage.push({ reason: 'early-career role title', weight: 3 });
  else if (EARLY_CAREER_TITLE.test(jd)) onePage.push({ reason: 'posting describes an early-career role', weight: 2 });

  if (CAMPUS_PROGRAM.test(haystack)) onePage.push({ reason: 'campus or new-grad program', weight: 2 });

  const years = maxYearsRequired(jd);
  if (years !== null) {
    if (years <= 2) onePage.push({ reason: `asks for ${years} year${years === 1 ? '' : 's'} of experience`, weight: 2 });
    else if (years >= 3) twoPage.push({ reason: `asks for ${years}+ years of experience`, weight: 2 });
  }

  const techCount = countNamedTechnologies(jd);
  if (techCount >= 12) twoPage.push({ reason: `${techCount} distinct technologies named`, weight: 1 });
  else if (techCount === 0) onePage.push({ reason: 'no specific technologies named', weight: 1 });
  else if (techCount <= 4) onePage.push({ reason: `only ${techCount} technolog${techCount === 1 ? 'y' : 'ies'} named`, weight: 1 });

  // A service role with no real stack is judged on communication, not breadth.
  if (SERVICE_ROLE.test(title) && techCount <= 6) {
    onePage.push({ reason: 'client-facing or support role rather than a build role', weight: 2 });
  }

  // Seniority only counts when it is not an early-career title ("Graduate
  // Analyst II" should not read as senior).
  if (SENIOR_TITLE.test(title) && !EARLY_CAREER_TITLE.test(title)) {
    twoPage.push({ reason: 'senior or specialist job title', weight: 2 });
  }

  const score = (signals: Array<{ weight: number }>) => signals.reduce((sum, s) => sum + s.weight, 0);
  const length: ResumeLength = score(twoPage) > score(onePage) ? 'two-page' : 'one-page';
  const reasons = (length === 'two-page' ? twoPage : onePage).map(signal => signal.reason);

  return {
    length,
    // Never return an unexplained default.
    reasons: reasons.length
      ? reasons
      : ['no strong signal either way, defaulting to one page for a new-grad search'],
  };
}

/** "1 page suggested — early-career role title, asks for 2 years of experience" */
export function describeResumeLengthSuggestion(suggestion: ResumeLengthSuggestion): string {
  const label = suggestion.length === 'one-page' ? '1 page' : '2 pages';
  return `${label} suggested — ${suggestion.reasons.join(', ')}`;
}
