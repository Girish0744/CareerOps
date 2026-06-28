import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getApplication, saveJobDescriptionSnapshot, snapshotDocumentVersion, updateApplicationFields } from '@/lib/filesystem';
import { apiErrorMessage } from '@/lib/errors';
import { generateGeminiContent } from '@/lib/ai-config';
import { refreshDocumentPdfIfStale } from '@/lib/document-renderer';
import { formatCoverLetterDate } from '@/lib/date-format';
import { formatJobReferenceForSubject } from '@/lib/job-reference';
import { extractApplicantProfile } from '@/lib/apply-assistant';
import {
  assertUsableJobDescription,
  extractJobDescriptionFromUrl,
} from '@/lib/job-description';

export const maxDuration = 120;

const execFileAsync = promisify(execFile);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');

function readRoot(rel: string): string {
  const p = path.join(/*turbopackIgnore: true*/ ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

async function generatePdf(htmlPath: string, pdfPath: string, format = 'letter') {
  const script = path.join(/*turbopackIgnore: true*/ ROOT, 'generate-pdf.mjs');
  const { stdout, stderr } = await execFileAsync(process.execPath, [script, htmlPath, pdfPath, `--format=${format}`], {
    cwd: ROOT,
    timeout: 60000,
  });
  const output = `${stdout}\n${stderr}`;
  const pageCount = Number(output.match(/Pages:\s*(\d+)/i)?.[1] ?? NaN);
  return {
    pageCount: Number.isFinite(pageCount) ? pageCount : null,
    output,
  };
}

function displayFromUrl(value: string, fallback: string): string {
  if (!value) return fallback;
  return value
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function contactPlaceholders(profileYml: string) {
  const profile = extractApplicantProfile(profileYml);
  return {
    name: profile.fullName || profile.legalName || 'Candidate',
    location: [profile.city, profile.province].filter(Boolean).join(', ') || profile.country || '',
    email: profile.email || '',
    phone: profile.phone || '',
    linkedinUrl: displayFromUrl(profile.linkedin || '', ''),
    linkedinDisplay: profile.linkedin ? displayFromUrl(profile.linkedin, '') : '',
    portfolioUrl: profile.portfolioUrl || '',
    portfolioDisplay: displayFromUrl(profile.portfolioUrl || '', 'Portfolio'),
    githubUrl: displayFromUrl(profile.github || '', ''),
    githubDisplay: profile.github ? displayFromUrl(profile.github, '') : '',
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtml(value: string): string {
  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function markdownLinkFromAnchor(attrs: string, labelHtml: string): string {
  const quotedHref = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
  const unquotedHref = attrs.match(/\bhref\s*=\s*([^\s>]+)/i)?.[1];
  const href = decodeBasicHtmlEntities(quotedHref ?? unquotedHref ?? '');
  const label = stripHtml(labelHtml) || href;
  if (!href) return label;
  return `[${label}](${href})`;
}

function sanitizeCoverLetterLanguage(value: string): string {
  return value
    .replace(/\bI am eager to contribute to\b/gi, 'I can contribute to')
    .replace(/\bam eager to contribute to\b/gi, 'can contribute to')
    .replace(/\blook forward to the possibility of contributing to\b/gi, 'can contribute to')
    .replace(/\bwould love the opportunity to\b/gi, 'can')
    .replace(/\bleveraging\b/gi, 'using')
    .replace(/\butilizing\b/gi, 'using')
    .replace(/\butilize\b/gi, 'use')
    .replace(/\brobust\b/gi, 'reliable')
    .replace(/\bcomprehensive\b/gi, 'broad')
    .replace(/\bextensive experience\b/gi, 'hands-on experience')
    .replace(/\btechnical rigors\b/gi, 'technical standards');
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function uniqueUrls(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const matches = String(value).match(/https?:\/\/[^\s<>)"']+/gi) ?? [];
    for (const raw of matches) {
      const url = raw.replace(/[.,;]+$/, '');
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  return urls;
}

function jobDescriptionBody(text: string | null | undefined): string {
  if (!text) return '';
  const separatorIndex = text.indexOf('\n---\n');
  return (separatorIndex >= 0 ? text.slice(separatorIndex + 5) : text).trim();
}

function isFallbackOnlyJobDescription(text: string | null | undefined): boolean {
  if (!text) return true;
  const normalized = text.toLowerCase();
  return normalized.includes('archived job listing snapshot from scan source')
    || normalized.includes('limited job metadata from scan card')
    || normalized.includes('preliminary scan score')
    || normalized.includes('scan summary');
}

function isPastedJobDescription(app: NonNullable<ReturnType<typeof getApplication>>): boolean {
  return app.scoreData?.extractionMode === 'pasted-text'
    || /^\*\*URL:\*\*\s*Pasted JD\b/im.test(app.jobDescription ?? '');
}

function isWeakJobDescription(text: string | null | undefined): boolean {
  const body = jobDescriptionBody(text);
  if (!body) return true;
  if (isFallbackOnlyJobDescription(body)) return true;

  const hasRealSections = /\b(responsibilities|requirements|qualifications|what you'?ll do|what you bring|about the role|what you'll need|required skills|preferred skills|key accountabilities|duties)\b/i.test(body);
  const hasRoleSignals = /\b(role|job|position|team|candidate|experience|skills|work|develop|support|analy(?:s|z)e|manage|build|collaborate)\b/i.test(body);
  return body.length < 500 || (body.length < 1200 && !hasRealSections && !hasRoleSignals);
}

function normalizeGeneratedPunctuation(value: string): string {
  return value
    .replace(/\u2014/g, ',')
    .replace(/\u2013/g, '-')
    .replace(/\u2212/g, '-')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

async function bestAvailableJobDescription(
  id: string,
  app: NonNullable<ReturnType<typeof getApplication>>,
  warnings: string[],
): Promise<string> {
  const savedJobDescription = app.jobDescription ?? '';
  const savedBody = jobDescriptionBody(savedJobDescription);
  if (isPastedJobDescription(app) && savedBody && !isFallbackOnlyJobDescription(savedBody)) {
    return savedJobDescription;
  }
  if (!isWeakJobDescription(savedJobDescription)) return savedJobDescription;

  const urls = uniqueUrls([
    app.scoreData?.sourceUrl,
    app.jobUrl,
    app.scoreData?.applyUrl,
    app.jobDescription,
  ]);

  const failures: string[] = [];
  for (const url of urls) {
    try {
      const extracted = await extractJobDescriptionFromUrl(url);
      assertUsableJobDescription(extracted.text);
      if (isWeakJobDescription(extracted.text)) {
        failures.push(`${url}: extracted text was too thin for confident tailoring`);
        continue;
      }
      saveJobDescriptionSnapshot(id, extracted.text);
      warnings.push(`Job description refreshed from ${url} before document generation.`);
      return extracted.text;
    } catch (err) {
      failures.push(`${url}: ${apiErrorMessage(err)}`);
    }
  }

  warnings.push(
    `Generated from limited saved job context because the full posting could not be fetched. Tailoring confidence is low.${failures.length ? ` Attempts: ${failures.join(' | ')}` : ''}`,
  );
  return savedJobDescription;
}

function collectResumeQualityWarnings(html: string, markdown: string) {
  const warnings: string[] = [];
  const htmlLower = html.toLowerCase();
  const visibleHtml = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const plainText = stripHtml(`${visibleHtml}\n${markdown}`);

  if (!html.trimStart().toLowerCase().startsWith('<!doctype html>')) {
    warnings.push('resume HTML should start with <!DOCTYPE html>');
  }
  if (/\{\{[A-Z0-9_]+\}\}/i.test(html) || /\[(?:template filled|insert|placeholder|content here)[^\]]*\]/i.test(html)) {
    warnings.push('resume HTML contains an unfilled placeholder or bracketed template note');
  }
  if (!/class=["'][^"']*\bpage-two\b/i.test(html)) {
    warnings.push('resume HTML should keep the page-two wrapper so Projects starts on page 2');
  }

  const requiredSections = [
    'Profile',
    'Highlights of Qualifications',
    'Technical Skills Summary',
    'Professional Experience',
    'Projects',
    'Education',
    'Extracurricular Activities',
    'Awards and Recognition',
  ];
  let previousIndex = -1;
  for (const section of requiredSections) {
    const match = new RegExp(`<div\\s+class=["'][^"']*\\bsection-title\\b[^"']*["'][^>]*>\\s*${escapeRegExp(section)}\\s*<`, 'i').exec(html);
    if (!match) {
      warnings.push(`missing required section: ${section}`);
      continue;
    }
    if (match.index < previousIndex) {
      warnings.push(`section is out of order: ${section}`);
    }
    previousIndex = match.index;
  }
  if (!/Certifications\s*&amp;\s*Memberships|Certifications\s*&\s*Memberships/i.test(html)) {
    warnings.push('missing Certifications & Memberships line');
  }

  const projectsSection = html.match(/<div\s+class=["']page-two["'][^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const projectBlocks = [...projectsSection.matchAll(/<div\s+class=["']project["'][^>]*>([\s\S]*?)(?=<div\s+class=["']project["']|<div\s+class=["'][^"']*\bsection-title\b|<\/div>\s*<\/body>|$)/gi)]
    .map(match => match[1]);
  if (projectBlocks.length < 3) {
    warnings.push('resume should include at least 3 selected projects');
  }
  projectBlocks.forEach((block, index) => {
    const bullets = countMatches(block, /<li\b/gi);
    if (bullets < 3) {
      warnings.push(`project ${index + 1} should include at least 3 bullets when using the HTML template`);
    }
  });

  // Check total project bullet count and overflow risk
  const totalProjectBullets = projectBlocks.reduce((sum, block) => sum + countMatches(block, /<li\b/gi), 0);
  if (totalProjectBullets < 9) {
    warnings.push(`only ${totalProjectBullets} project bullets found — minimum is 9 (3 projects × 3 bullets each)`);
  }
  if (totalProjectBullets > 11) {
    const extraSection = html.match(/Extracurricular Activities[\s\S]*?(?=Awards and Recognition|$)/i)?.[0] ?? '';
    const extraEntries = countMatches(extraSection, /<div\s+class=["']entry["']/gi);
    if (extraEntries >= 3) {
      warnings.push(`${totalProjectBullets} project bullets + ${extraEntries} extracurricular entries will likely overflow to 3 pages`);
    }
  }

  const summary = html.match(/<div\s+class=["']summary["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
  const summaryText = stripHtml(summary);
  const sentenceCount = summaryText ? countMatches(summaryText, /[.!?](?:\s|$)/g) : 0;
  const summaryWords = summaryText ? summaryText.split(/\s+/).length : 0;
  if (!summaryText) {
    warnings.push('profile summary is missing');
  }
  if (sentenceCount > 4 || summaryWords > 95) {
    warnings.push('profile summary should stay concise: max 4 sentences and roughly 4 resume lines');
  }
  if (sentenceCount !== 4 && summaryText) {
    warnings.push(`profile has ${sentenceCount} sentences — should be exactly 4`);
  }

  // Check for candidate name in profile
  const summaryLower = summaryText.toLowerCase();
  if (summaryLower.includes('girish') || summaryLower.includes('bhuteja')) {
    warnings.push('profile contains the candidate\'s name — profile should use impersonal resume voice');
  }

  // Check for third-person pronouns in profile
  const thirdPerson = summaryText.match(/\b(?:he|his|him|she|her)\b/i);
  if (thirdPerson) {
    warnings.push(`profile contains third-person pronoun: "${thirdPerson[0]}" — use impersonal resume voice`);
  }

  // Check for education-first profile opening
  if (/^(?:computer science|cs honours|bachelor|b\.?sc?\.?|honours candidate|graduating)/i.test(summaryText.trim())) {
    warnings.push('profile opens with education/credentials — should lead with value/capabilities');
  }

  const firstPerson = plainText.match(/\b(?:I|me|my|mine|we|our|ours|us)\b/);
  if (firstPerson) {
    warnings.push(`resume contains first-person wording: "${firstPerson[0]}"`);
  }
  const filler = plainText.match(/\b(?:passionate about|excited to|team player|detail-oriented|results-driven|innovative solutions|fast-paced environment|cutting-edge|leveraging|utilized)\b/i);
  if (filler) {
    warnings.push(`resume contains AI/generic filler: "${filler[0]}"`);
  }

  // Check for banned power verbs
  const powerVerb = plainText.match(/\b(?:Spearheaded|Championed|Orchestrated|Revolutionized|Pioneered)\b/);
  if (powerVerb) {
    warnings.push(`resume uses overstated power verb: "${powerVerb[0]}" — use honest verbs like led, built, managed`);
  }

  // Check for banned profile phrases
  if (summaryText) {
    const bannedProfile = summaryText.match(/\b(?:proven track record|adept at|expertise in|deep technical experience)\b/i);
    if (bannedProfile) {
      warnings.push(`profile contains banned phrase: "${bannedProfile[0]}"`);
    }
  }

  // Check for em dashes
  if (plainText.includes('\u2014')) {
    warnings.push('resume contains em dashes (\u2014) — use commas or semicolons instead');
  }

  if (htmlLower.includes('<table') && !/<table\b[^>]*class=["'][^"']*\bskills-table\b/i.test(html)) {
    warnings.push('tables should only be used for the ATS-friendly skills table');
  }

  return warnings;
}

function canonicalizeResumeHtml(html: string, template: string): string {
  const templateStyle = template.match(/<style>[\s\S]*?<\/style>/i)?.[0];
  if (!templateStyle) return html;
  if (/<style>[\s\S]*?<\/style>/i.test(html)) {
    return html.replace(/<style>[\s\S]*?<\/style>/i, templateStyle);
  }
  return html.replace(/<\/head>/i, `${templateStyle}\n</head>`);
}

function markdownFromResumeHtml(html: string): string {
  let markdown = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<div\s+class=["']header-name["'][^>]*>([\s\S]*?)<\/div>/gi, '\n# $1\n')
    .replace(/<div\s+class=["']section-title["'][^>]*>([\s\S]*?)<\/div>/gi, '\n## $1\n')
    .replace(/<div\s+class=["']summary["'][^>]*>([\s\S]*?)<\/div>/gi, '\n$1\n')
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|ul)>/gi, '\n')
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs: string, label: string) => markdownLinkFromAnchor(attrs, label))
    .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!markdown.startsWith('# ')) {
    markdown = `# Resume\n\n${markdown}`;
  }
  return markdown;
}

function isPlaceholderMarkdown(markdown: string): boolean {
  const trimmed = markdown.trim();
  const hasCoreSections = /(?:^|\n)(?:##|\*\*)\s*Profile/i.test(trimmed)
    && /(?:^|\n)(?:##|\*\*)\s*Professional Experience/i.test(trimmed)
    && /(?:^|\n)(?:##|\*\*)\s*Projects/i.test(trimmed)
    && /(?:^|\n)(?:##|\*\*)\s*Education/i.test(trimmed);
  return trimmed.length < 400
    || !hasCoreSections
    || /\[(?:resume|tailored resume|full tailored resume|content)[^\]]*\]/i.test(trimmed);
}

function extractBlock(text: string, tag: string): string {
  const delim = text.match(new RegExp(`===${tag}===\\s*([\\s\\S]*?)\\s*===${tag === 'HTML' ? 'END_HTML' : 'END_MARKDOWN'}===`));
  if (delim) return delim[1].trim();
  const lang = tag === 'HTML' ? '(?:html)?' : '(?:markdown|md)?';
  const code = text.match(new RegExp('```' + lang + '\\s*([\\s\\S]*?)\\s*```'));
  if (code) return code[1].trim();
  return '';
}

function extractAllHtml(text: string): string {
  const delim = text.match(/===HTML===\s*([\s\S]*?)\s*===END_HTML===/);
  if (delim) return delim[1].trim();
  const code = text.match(/```html\s*([\s\S]*?)\s*```/);
  if (code) return code[1].trim();
  const doctype = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (doctype) return doctype[1].trim();
  return '';
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
  const { id } = await params;

  const app = getApplication(id);
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { type?: string; documentType?: string };
  const requestedType = body.type ?? body.documentType ?? 'both';
  if (requestedType !== 'resume' && requestedType !== 'cover-letter' && requestedType !== 'both') {
    return NextResponse.json({ error: 'type must be resume, cover-letter, or both' }, { status: 400 });
  }
  const shouldGenerateResume = requestedType === 'resume' || requestedType === 'both';
  const shouldGenerateCoverLetter = requestedType === 'cover-letter' || requestedType === 'both';

  const cv         = readRoot('cv.md');
  const profile    = readRoot('config/profile.yml');
  const profileMd  = readRoot('modes/_profile.md');
  const cvTemplate = readRoot('templates/cv-template.html');
  const clTemplate = readRoot('templates/cover-letter-template.html');
  const contact = contactPlaceholders(profile);

  const generatedAt = new Date().toISOString();
  const today = generatedAt.split('T')[0];
  const folderPath = path.join(/*turbopackIgnore: true*/ ROOT, app.applicationFolder);
  const warnings: string[] = [];
  const jobDescriptionText = await bestAvailableJobDescription(id, app, warnings);
  const jobRefForSubject = formatJobReferenceForSubject(jobDescriptionText);

  // ── 1. RESUME ──────────────────────────────────────────────────────────────

  let resumePdfGenerated = fs.existsSync(path.join(folderPath, 'resume.pdf'));
  let resumeGenerationError: string | null = null;

  if (shouldGenerateResume) {
  const resumeSystem = `You are an expert ATS resume writer. Produce the strongest possible tailored 2-page resume for this candidate. The resume must clear ATS first, then read naturally for HR, and give a technical manager confidence that the evidence is real.

Use this workflow in order:
1. Read the job description carefully.
2. Extract important keywords, skills, tools, responsibilities, required outcomes, and role-specific language from the job description.
3. Go back to the master resume facts below and select only the most relevant real content.
4. Generate a two-page resume with the existing HTML template.

Every fact comes from the master resume/profile sources below. Never fabricate experience, metrics, tools, titles, dates, education, awards, or certifications.

MASTER CV:
${cv}

CANDIDATE PROFILE:
${profile}

NARRATIVE:
${profileMd}

MASTER RESUME SOURCE:
- config/profile.yml points to the master DOCX source when available.
- cv.md is the synced markdown source used by this app at generation time.

===== VOICE AND TONE (read this before writing anything) =====
This resume should sound like a sharp CS student who has actually built things wrote it, not like a career services AI filled in a template. Test every bullet by reading it out loud. If it sounds like something you'd read on a resume-writing blog or an AI prompt output, rewrite it.

Markers of human writing:
- Specific over general: "classified 9,500+ Kepler candidates" not "processed large datasets"
- Tool names appear because they were used, not because the JD lists them
- Bullets describe WHAT WAS BUILT and WHAT IT DOES, not abstract capabilities
- Short, punchy structure; a bullet should land in one breath
- Natural sentence rhythm; not every bullet starts with a past-tense power verb followed by three prepositional phrases

Markers of AI writing (reject on sight):
- Three or more adjectives stacked before a noun
- "Spearheaded", "Championed", "Orchestrated", "Revolutionized" for student/co-op work
- Vague results: "improving efficiency", "enhancing performance", "driving impact"
- Mirroring JD phrases word-for-word without integrating them naturally into the bullet's own logic
- Every bullet following the same syntactic pattern (verb + object + "using" + tool list + result clause)
- Phrases like "cutting-edge", "innovative solutions", "fast-paced environment", "comprehensive", "robust", "rigorous"
- Passive ownership verbs: "Possesses", "Utilizes", "Demonstrates"

Tone target: honest, direct, student-appropriate. This candidate is graduating August 2026. The resume should reflect real hands-on project and co-op experience, not imply 10 years of professional seniority.

===== REQUIRED STRUCTURE AND PAGE PLAN =====
The resume must keep the same section structure as the master resume, in this exact order:
1. Profile
2. Highlights of Qualifications
3. Technical Skills Summary
4. Professional Experience
5. Projects
6. Education
7. Extracurricular Activities
8. Awards and Recognition
9. Certifications & Memberships

Page 1 must contain Profile, Highlights of Qualifications, Technical Skills Summary, and Professional Experience.
Page 2 must start with Projects, then Education, Extracurricular Activities, Awards and Recognition, and Certifications & Memberships.
The template contains a <div class="page-two"> wrapper before Projects. Keep that wrapper exactly so Projects starts on page 2.
Professional Experience must stay compact enough to finish on page 1: use the 2 strongest OER bullets by default and 2 Olive Branch bullets. Add a 3rd OER bullet only if it is short and page 1 still fits.
The second page should look full. Use space intelligently: include 3 projects by default; add a 4th project only if the second page would otherwise look sparse. If space is tight, keep the best 3 projects and expand them with stronger relevant bullets instead of dropping below 3 projects.
Each selected project should have at least 3 bullets when possible: Stack first, then 2+ evidence/impact bullets.

PAGE 1 FILLING STRATEGY:
Page 1 must also be completely full. With 4-sentence profile, 5 highlights, 5 skill rows, and 4 experience bullets (2 OER + 2 Olive Branch), page 1 is usually tight. But if there is visible whitespace at the bottom of page 1, apply these fixes IN ORDER:
1. FIRST: Write longer, more detailed experience bullets. Each experience bullet should be 20-30 words (roughly 1.5-2 printed lines). If your bullets are short single-line statements, expand them with JD-relevant technical detail from the master resume.
2. SECOND: Add a 3rd OER bullet if the master resume has a relevant one for this JD. Keep it to 1-1.5 lines.
3. LAST RESORT: Slightly expand highlights bullets with additional coursework or tool mentions. Do not exceed 5 highlights.

PAGE 2 CONTENT BUDGET (CRITICAL — follow these exact counts):

You cannot render the page, so you MUST follow this bullet budget exactly. These counts have been calibrated to produce a full 2-page resume without overflow.

STANDARD PAGE 2 BUDGET (use this by default):
- 3 projects × (1 stack bullet + 2 content bullets) = 9 project bullets
- Education: 1 entry, 2 bullets
- 2 extracurricular entries × 1 bullet each = 2 bullets
- 2 award entries × 1 bullet each = 2 bullets
- 1 certifications line
- TOTAL: 15 items on page 2

BULLET LENGTH TARGET: Each content bullet should be 20-30 words (roughly 1.5-2 printed lines). This is where you fill the page — through LONGER, RICHER bullets, not through MORE bullets. A 25-word bullet with technical detail and JD keywords is worth more than two 10-word bullets.

IF PAGE 2 LOOKS SPARSE with the standard budget (all bullets are short, under 15 words each):
Apply ONE of these adjustments (not all of them — pick the single best option):
- OPTION A (preferred): Expand ONE project from 2 to 3 content bullets. Pick the project most relevant to the JD. This brings the total to 10 project bullets.
- OPTION B: Add the 3rd extracurricular entry. This brings extracurriculars to 3 entries.
- OPTION C: Write all content bullets at the longer end (25-30 words each) with more technical detail.
Do NOT apply all three options simultaneously — that causes page overflow.

HARD LIMIT: Never exceed 11 project bullets + 3 extracurricular entries on page 2. That combination ALWAYS overflows to page 3. If you have 12 project bullets AND 3 extracurricular entries, you WILL overflow. Drop one or the other.

SAFE COMBINATIONS THAT FIT ON PAGE 2:
- 9 project bullets + 2 extracurricular entries (standard — always fits)
- 10 project bullets + 2 extracurricular entries (fits if bullets are 20-25 words)
- 9 project bullets + 3 extracurricular entries (fits if bullets are 20-25 words)
- 12 project bullets + 2 extracurricular entries (TIGHT — only if bullets are under 20 words each)

COMBINATIONS THAT OVERFLOW TO PAGE 3 (never use):
- 12 project bullets + 3 extracurricular entries (this is what causes 3-page overflow)
- Any combination with 4+ projects

PROJECT URLS (use exactly these in HTML links, and use markdown links in the MARKDOWN block):
- Zonalyze: GitHub https://github.com/Girish0744/Zonalyze
- ETHOS: GitHub https://github.com/Girish0744/ETHOS-MLPROJECT | Live https://eth0s.online
- AegisGrid: GitHub https://github.com/Girish0744/AegisGrid | Live https://aegis-grid.vercel.app
- MediTwin: GitHub https://github.com/Girish0744/MediTwin
- DineEase: GitHub https://github.com/Girish0744/DineEase
- MediNet+: GitHub https://github.com/Girish0744/MediNet
- Student Dropout Risk Analysis: GitHub https://github.com/Girish0744/Student-Dropout-Risk-Analysis
- TelemetryDownloader: GitHub https://github.com/Girish0744/TelemetryDownloader

===== STEP 1: DETECT ROLE ARCHETYPE =====
Read the JD and classify into exactly one:
- SWE_FULLSTACK: React, TypeScript, Node.js, REST APIs, databases, front-end/back-end primary
- AI_ML: model training, ML pipelines, data science, Python ML context, scikit-learn, TensorFlow primary
- DA_BA: SQL, data analysis, dashboards, BI, reporting, business intelligence, Excel, Power BI primary
- DATA_ENGINEER: data pipelines, ETL, infrastructure, data quality, transformation, automation primary
- BACKEND_JAVA_SYSTEMS: Java, Golang/Go, back-end services, modular services, service integration, banking platforms, API/service development primary
- SYSTEMS_CPP: embedded, networking, C/C++, TCP, binary protocols, hardware primary
- CSHARP_DOTNET: C#, .NET, Windows Forms, enterprise desktop, SQL Server primary
- HELPDESK_IT: troubleshooting, ticketing, user support, IT operations, help desk primary
- GENERAL: mixed or none of the above clearly dominant

Also note the COMPANY DOMAIN. If the company is not a pure tech company (e.g., mining, banking, healthcare, insurance), the profile must acknowledge the industry context where possible.

===== STEP 2: SELECT PROJECTS FROM MASTER RESUME =====
Select at least 3 projects from the master resume. Use exactly 3 by default. Add a 4th only if page 2 needs more density and the project is strongly relevant to the JD.
SWE_FULLSTACK  → Zonalyze, AegisGrid, MediTwin
AI_ML          → Zonalyze, ETHOS, AegisGrid
DA_BA          → Zonalyze, Student Dropout Risk Analysis, ETHOS
DATA_ENGINEER  → Zonalyze, ETHOS, Student Dropout Risk Analysis
BACKEND_JAVA_SYSTEMS → MediNet+, TelemetryDownloader, Zonalyze
SYSTEMS_CPP    → TelemetryDownloader, MediNet+, Zonalyze
CSHARP_DOTNET  → MediNet+, DineEase, Zonalyze
HELPDESK_IT    → Zonalyze, ETHOS, MediTwin
GENERAL        → Zonalyze, ETHOS, AegisGrid

If adding a 4th project, choose the next strongest project from the master resume based on the JD:
- Web/full-stack: MediTwin or DineEase
- AI/ML: MediTwin or Student Dropout Risk Analysis
- Data/analytics: AegisGrid or MediTwin
- C#/.NET: DineEase
- Backend Java/Go: DineEase or AegisGrid
- Systems/C++: AegisGrid or ETHOS
- IT/help desk/support: OER-related evidence belongs in Experience, not Projects; use MediTwin or Student Dropout if a 4th is needed

For each project:
- Name bold + " | " separator + full URL as link text (e.g. github.com/Girish0744/Zonalyze, NOT "GitHub")
- Live site URL added if available
- Date range in full (e.g. "Jan 2026 – Present")
- Stack as first bullet (front-load JD-relevant tech)
- MANDATORY: 3 content bullets after the Stack bullet (metric-bearing first). This means each project has EXACTLY 4 bullets total: 1 stack + 3 content. The master resume has 3-4 content bullets per project — use 3 of them, reconstructed for the JD.
- NEVER output a project with only 1 content bullet. That is a failure. Minimum is 2 content bullets; target is 3.
- Each content bullet should be 15-30 words long. If a bullet is under 12 words, it is too short — add technical detail from the master resume.
- Do not merge two separate facts into one mega-bullet. If the master resume has "classified 9,500+ candidates with 94.9% accuracy" and "implemented MLflow experiment tracking to log 9 metrics per run", those are TWO bullets, not one.
- Do not pick projects just because they are impressive; pick the projects that best match the job. For a Data Analytics role, choose analytics/data projects over unrelated web-only projects.

PROJECT BULLET COUNT VERIFICATION (check this before outputting):
Count your project bullets. Default target:
- Project 1: 1 stack + 2 content = 3 bullets
- Project 2: 1 stack + 2 content = 3 bullets
- Project 3: 1 stack + 2 content = 3 bullets
- TOTAL: 9 project bullets (standard)

You may expand ONE project to 3 content bullets (total = 10) if page 2 needs more density and you have only 2 extracurricular entries. NEVER go to 12 project bullets unless you have only 2 extracurricular entries AND all bullets are under 20 words.
If your total is under 9, you have NOT followed the instructions. Go back and add content bullets from the master resume.

===== STEP 3: PROFILE PARAGRAPH (exactly 4 sentences, zero first-person or third-person) =====
PROFILE RULES (not rigid templates — write naturally each time):
- Sentence 1: LEAD WITH VALUE, NOT CREDENTIALS. Start with a role-relevant identity and the candidate's strongest JD-relevant capabilities plus 3-4 tools. The first line a recruiter reads must answer "what can this person do for us?" — not "what school do they go to?"
- Sentence 2: Mirror the JD's TOP responsibility in the candidate's own words. What does this job actually DO day to day? Say the candidate can do that.
- Sentence 3: One concrete project fact or capability that connects to the JD's domain or the company's industry. Not generic "strong project background in X" — name a specific capability from a real project.
- Sentence 4: FIXED — "Available for full-time roles starting August 2026."
- EXACTLY 4 sentences. Count them before outputting. If you have 3 or 5, fix it.

CRITICAL PROFILE PROHIBITIONS:
- NEVER start the profile with education, degree name, GPA, college name, or graduation date. These already appear in Highlights bullet 1 AND in the Education section. Repeating them in sentence 1 wastes the most valuable line of the resume and makes it look like the candidate has nothing else to lead with.
- NEVER use the candidate's name in the profile paragraph. No "Girish Bhuteja is..." or "Girish has..."
- NEVER use third-person pronouns (he, his, him). The profile is written in impersonal resume voice, not a bio.
- NEVER use first-person pronouns (I, my, me, we, our).
- The profile reads like a resume summary, not a biography. Every sentence is a noun phrase or impersonal statement.

CORRECT vs WRONG profile openings:
- CORRECT: "Data-focused developer with applied experience in data analysis, stakeholder engagement, and translating complex datasets into actionable business insights."
- CORRECT: "Developer with co-op and project experience building workflow automation and data reporting tools using Python, SQL, and Power Automate."
- CORRECT: "Software developer experienced in building end-to-end ML pipelines and deploying full-stack applications using Python, React, and AWS."
- WRONG: "Computer Science Honours candidate (3.74 GPA) graduating August 2026 with experience in..." (leads with credential already stated in Highlights and Education — wastes profile space)
- WRONG: "CS Honours student at Conestoga College with deployed projects in..." (leads with school name — recruiter doesn't care about school first, they care about capabilities)
- WRONG: "Recent graduate with a strong academic background in..." (leads with graduation status — says nothing about value)
- WRONG: "Girish Bhuteja is a data analyst with..."
- WRONG: "He builds and manages data-driven tools..."

NO-REPEAT RULE: The profile must NOT repeat facts that already appear word-for-word in Highlights or Education. The degree, GPA, graduation date, coursework, co-op conversion, and award are all stated elsewhere. The profile's job is to SELL CAPABILITIES using JD language — it should contain information and framing that appears NOWHERE else on the resume.

If the company is NOT a pure tech company (mining, insurance, banking, healthcare, retail, etc.), sentence 1 or 2 should reference the industry context naturally. Example for a mining company: "...with project experience in geospatial data analysis and infrastructure monitoring systems" rather than generic web dev language. BUT only claim experience the candidate actually has. If the candidate has no retail analytics experience, do NOT say "applied experience in retail analytics." Instead, frame real experience in ways that connect to the industry: "applied experience in data analysis, workflow automation, and stakeholder engagement" is honest and relevant to retail analytics without claiming direct retail experience.

CRITICAL ANTI-FABRICATION RULE FOR PROFILE:
Every claim in the profile must trace back to a specific fact in the master resume. If you cannot point to which project, role, or skill proves the claim, delete it. Common fabrications to watch for:
- "experience in retail analytics" — only valid if the master resume shows retail analytics work (Home Depot freight role does NOT count)
- "building dashboards" — only valid if a project or role actually built a dashboard (having Power BI in skills is NOT enough)
- "proven track record of X" — too strong for a student; say "applied experience in X" or "project experience in X"
- "expertise in X" — too strong for a graduating student; use "applied experience in X" or "project experience in X"

Profile anti-patterns — NEVER use:
- The candidate's name ("Girish Bhuteja is...", "Girish has...")
- Third-person pronouns ("he", "his", "him")
- Education/degree/GPA/school as the opening of sentence 1
- "Possesses", "Utilizes" — always active voice
- "proven track record" — say "applied experience" or "project experience"
- "deep technical experience" — say "hands-on experience" or "applied experience"
- "rigorous", "robust" — drop the adjective or replace with evidence
- "leveraging" or "utilized" — say "using"
- "Adept at" — too formal; rephrase with active construction
- "comprehensive", "cutting-edge", "innovative solutions", "fast-paced environment"
- em dashes — use commas or semicolons
- any first-person pronoun (I, my, me, we, our)
- Starting every profile with the identical "X developer with hands-on experience designing and deploying" pattern

===== STEP 4: HIGHLIGHTS OF QUALIFICATIONS — always exactly 5 bullets =====
1. (always): "Bachelor of Computer Science (Honours) candidate at Conestoga College with a 3.74 GPA, graduating August 2026; coursework includes [pick 4–5 most relevant from: Software Engineering, OOP, Data Structures and Algorithms, Database Systems, Computer Networks, OS and Security, Cloud Computing, Big Data, AI and Machine Learning, Advanced Topics in AI/ML]"
2. (always): "Completed 2 co-op work terms at Conestoga College; converted from part-time to co-op based on performance and retained through departmental restructuring"
3. (customize per archetype — pick the version that best matches the JD's required tools):
   DA_BA:          "Deployed 8+ full-stack and ML projects using Python, SQL, PostgreSQL, AWS (Athena/S3/EC2), Docker, and Power BI; all publicly available on GitHub"
   AI_ML/GENERAL:  "Deployed 8+ full-stack and ML projects using Python, scikit-learn, MLflow, AWS EC2, Docker, and React; all publicly available on GitHub"
   SWE_FULLSTACK:  "Deployed 8+ full-stack and ML projects using React, TypeScript, FastAPI, Python, PostgreSQL, AWS EC2, Docker, and Vercel; all publicly available on GitHub"
   DATA_ENGINEER:  "Deployed 8+ full-stack and ML projects using Python, SQL, PostgreSQL, AWS (Athena/S3/EC2), Docker, and FastAPI; all publicly available on GitHub"
   BACKEND_JAVA_SYSTEMS: "Built backend and networked systems using C#, C++, SQL Server, TCP/IP, REST API patterns, Docker, and Git; Java SE certified and all major projects publicly available on GitHub"
   SYSTEMS_CPP:    "Deployed 8+ projects using C++, C#, Python, SQL Server, AWS EC2, Docker, and React; all publicly available on GitHub"
   CSHARP_DOTNET:  "Deployed 8+ projects using C#, SQL Server, Python, FastAPI, React, AWS EC2, Docker, and MSTest; all publicly available on GitHub"
   HELPDESK_IT:    "Deployed 8+ full-stack and ML projects using Python, SQL, React, FastAPI, Docker, and AWS; all publicly available on GitHub"
   Rule: always include 6–8 tools; prioritise tools that appear in the JD
4. (customize per archetype):
   DA_BA:          "Analyzed 4,400+ student records across two real-world datasets applying IQR-based outlier detection and multi-variable correlation analysis to generate institutional recommendations"
   AI_ML/GENERAL:  "Built ML pipelines with scikit-learn, MLflow, and Random Forest, achieving 94.9% classification accuracy on real NASA Kepler telescope data"
   SWE_FULLSTACK:  "Built real-time WebSocket systems, containerised deployments with Docker Compose, and LLM-powered chat interfaces across multiple full-stack projects"
   DATA_ENGINEER:  "Analyzed 4,400+ student records across two real-world datasets applying IQR-based outlier detection and multi-variable correlation analysis to generate institutional recommendations"
   BACKEND_JAVA_SYSTEMS: "Implemented SQL Server data access layers, TCP client-server communication, defensive protocol handling, and 85+ MSTest methods across backend and networked systems"
   SYSTEMS_CPP:    "Implemented a 7-type binary packet protocol and 5-state server lifecycle state machine with Stop-and-Wait ACK, achieving 32 passing tests and a byte-exact 1 MB file transfer"
   CSHARP_DOTNET:  "Wrote 85+ MSTest methods across unit, integration, and system tiers covering patient workflows, billing calculations, and server connectivity for complex multi-role systems"
   HELPDESK_IT:    "Deployed 8+ accessible web platforms and interactive learning objects using HTML, CSS, WordPress, and Power Automate, supporting 1,000+ students across Business and Health Sciences"
5. (always): "Narhari Sharma Memorial Award recipient (April 2026); IT Club President coordinating workshops, hackathons, and mentorship programs for 100+ students"

NOTE on leadership: leadership is mentioned in bullet 5 — do NOT repeat it in the profile or extracurriculars bullets.

===== STEP 5: EXPERIENCE BULLETS — RECONSTRUCT, DON'T SYNONYM-SWAP =====
Do NOT copy master resume bullets verbatim. Do NOT just swap synonyms. RECONSTRUCT each bullet from scratch to speak the JD's language while preserving the candidate's facts.

REWORDING MEANS RECONSTRUCTION:
1. Read the JD bullet/requirement you are targeting
2. Identify the FACT from the master resume that proves the candidate can do it
3. Write a NEW bullet from scratch that presents that fact using the JD's framing and vocabulary
4. The bullet should read as if someone who does this job daily wrote it about their own work
5. Test: if you removed the JD, would this bullet still sound natural on its own? If yes, keep it. If it reads like a JD echo with names swapped in, rewrite it.

RECONSTRUCTION EXAMPLES:
- Master CV: "Developed and maintained accessible HTML and CSS templates for Pressbooks..."
- BAD reword: "Maintained accessible HTML and CSS templates for Pressbooks and other platforms" (synonym swap, same structure)
- GOOD reword for DA/BA JD: "Maintained structured content templates and document management workflows in SharePoint and Pressbooks, supporting cross-departmental data organisation for 1,000+ users"
- GOOD reword for SWE JD: "Built accessible HTML/CSS templates across Pressbooks and H5P Studio, tested against WCAG standards, serving 1,000+ students in three academic programs"

- Master CV: "Automated repetitive workflows using Power Automate and maintained GitHub repositories"
- BAD reword: "Automated workflows using Power Automate and maintained code repositories" (barely changed)
- GOOD reword for Data Engineer JD: "Built Power Automate pipelines to replace manual reporting tasks, cutting recurring documentation effort; maintained version-controlled repositories for all project assets"
- GOOD reword for IT/Help Desk JD: "Automated repetitive admin workflows using Power Automate and managed GitHub repositories to track open-source contributions and issue resolution across platforms"

SYNTACTIC VARIETY RULE: Do not start every bullet with the same sentence structure. Mix it up:
- "Built X using Y, reducing Z" (standard)
- "Using X, designed a system that does Y across Z" (inverted)
- "X system covering Y workflows, serving Z users" (noun-led, for stack bullets)
- Vary the position of tool names, metrics, and outcomes within the sentence

OER role — 2 bullets by default, 3 only if the extra bullet is short and page 1 still fits. Select and reconstruct by archetype:
  SWE_FULLSTACK: emphasise HTML/CSS/templates, GitHub repos, WCAG accessibility testing
  AI_ML:         emphasise Power Automate automation, data-backed engagement metric (20%), open-source contributions
  DA_BA:         emphasise Power Automate automation, data management/SharePoint, engagement/metrics tracking
  DATA_ENGINEER: emphasise automation workflows, data tracking systems, platform reliability
  BACKEND_JAVA_SYSTEMS: emphasise automation workflows, GitHub repositories, backend issue diagnosis, and API integration without claiming Java/Go professional experience
  SYSTEMS_CPP/CSHARP_DOTNET: emphasise automation, open-source contribution/feedback to communities, templates
  HELPDESK_IT:   emphasise WCAG testing, SharePoint management, workflow automation, supporting 1,000+ users
  GENERAL:       HTML/CSS templates → automation → engagement metric

Always include the italic context note for OER:
"Part-time and co-op role; converted to co-op based on performance; retained after departmental restructuring"

Olive Branch — keep both bullets, front-load the JD-relevant one. RECONSTRUCT to echo JD language:
  DA_BA/DATA_ENGINEER: "Optimised backend architecture by integrating 5+ third-party APIs, improving data synchronisation efficiency and reducing user-facing response time"
  BACKEND_JAVA_SYSTEMS: "Integrated 5+ third-party APIs and optimized backend architecture, improving data synchronization efficiency and reducing user-facing response time"
  SWE_FULLSTACK:       "Built React components for mentorship matching workflows and implemented Node.js API routes; integrated 5+ third-party APIs and optimised backend architecture"
  HELPDESK_IT:         "Diagnosed and resolved frontend and backend issues across browsers and devices, strengthening cross-platform performance and compatibility"

Home Depot — DROP (not relevant to tech roles)

===== STEP 6: SKILLS TABLE — USE EXACT ROW CONTENT PER ARCHETYPE =====
Always 5 rows. Category names use "&" not "and". Reorder rows (after Languages) so the most JD-relevant category comes first. Technical skills must be customized to the JD, but only include skills present in the master resume/profile sources.

Languages (always first):
  DA_BA / DATA_ENGINEER:    Python, SQL, JavaScript, TypeScript, C, C++, C#, HTML, CSS
  AI_ML:                    Python, SQL, JavaScript, TypeScript, C, C++, C#, HTML, CSS
  SWE_FULLSTACK / GENERAL:  Python, JavaScript, TypeScript, C, C++, C#, SQL, HTML, CSS
  BACKEND_JAVA_SYSTEMS:     Java (Java SE), C#, C++, Python, SQL, JavaScript, TypeScript, C, HTML, CSS
  SYSTEMS_CPP:              C, C++, Python, JavaScript, TypeScript, C#, SQL, HTML, CSS
  CSHARP_DOTNET:            C#, Python, JavaScript, TypeScript, C, C++, SQL, HTML, CSS
  HELPDESK_IT:              Python, JavaScript, TypeScript, C, C++, C#, SQL, HTML, CSS

Frameworks & Libraries:
  DA_BA / DATA_ENGINEER:  Pandas, NumPy, scikit-learn, FastAPI, Flask, React, Node.js, Streamlit
  AI_ML:                  scikit-learn, TensorFlow, Keras, Pandas, NumPy, FastAPI, Flask, React, Streamlit
  SWE_FULLSTACK / GENERAL: React, Next.js, FastAPI, Flask, Node.js, Streamlit, WordPress, REST APIs, WebSocket
  BACKEND_JAVA_SYSTEMS:   REST APIs, WebSocket, Node.js, FastAPI, Flask, React, Next.js, Streamlit
  SYSTEMS_CPP:            FastAPI, Flask, React, Node.js, Streamlit, REST APIs
  CSHARP_DOTNET:          React, Next.js, FastAPI, Flask, Node.js, Streamlit, REST APIs, WebSocket
  HELPDESK_IT:            React, FastAPI, Flask, Node.js, WordPress, REST APIs, Streamlit

AI/ML & Data:
  DA_BA:          MLflow, Random Forest, GridSearchCV, Power BI, Power Automate, DBSCAN, Clustering
  DATA_ENGINEER:  MLflow, Random Forest, GridSearchCV, Pandas, NumPy, DBSCAN, Clustering
  AI_ML:          TensorFlow, Keras, scikit-learn, MLflow, Random Forest, MLP, CNN, RNN, Transformers, Autoencoders, GANs, DBSCAN, Clustering, GridSearchCV
  SWE_FULLSTACK / GENERAL: scikit-learn, MLflow, Random Forest, DBSCAN, Clustering
  BACKEND_JAVA_SYSTEMS: scikit-learn, MLflow, Random Forest, DBSCAN
  SYSTEMS_CPP:    scikit-learn, MLflow, Random Forest, DBSCAN
  CSHARP_DOTNET:  scikit-learn, MLflow, Random Forest, DBSCAN
  HELPDESK_IT:    scikit-learn, MLflow, Power BI, Power Automate, Random Forest

Databases (same for all): PostgreSQL, SQL Server, MongoDB, MySQL, SQLite

Tools & Infrastructure:
  DA_BA:          AWS, Azure, Docker, Git, GitHub, CI/CD, Postman, SharePoint, Power BI, Excel
  DATA_ENGINEER:  AWS, Azure, Docker, Git, GitHub, CI/CD, Postman, Power Automate
  AI_ML:          AWS, Azure, Docker, Vercel, Git, GitHub, CI/CD, Postman
  SWE_FULLSTACK / GENERAL: AWS, Azure, Docker, Vercel, Git, GitHub, CI/CD, Postman, Selenium
  BACKEND_JAVA_SYSTEMS: Docker, Git, GitHub, CI/CD, Postman, AWS, Azure, Vercel, Selenium
  SYSTEMS_CPP:    AWS, Azure, Docker, Git, GitHub, CI/CD, Postman, Vercel
  CSHARP_DOTNET:  AWS, Azure, Docker, Vercel, Git, GitHub, CI/CD, Postman, Selenium
  HELPDESK_IT:    AWS, Azure, Docker, Git, GitHub, CI/CD, Postman, SharePoint, Power Automate, Selenium

Post-selection check: scan the JD keyword list. If any required tool is missing from the skills rows AND the candidate genuinely has it, add it to the appropriate row:
- Excel → Tools & Infrastructure (real skill, used at OER; add for any DA/BA/data role that lists it)
- Azure → Tools & Infrastructure (always valid, in master resume)
- SharePoint → Tools & Infrastructure (used at OER for document management)
- Power Automate → AI/ML & Data or Tools & Infrastructure
- Java → Languages only as "Java (Java SE)" because the master resume supports Java certification, not professional Java employment
- Go/Golang → NEVER add as a skill unless the master resume is updated with real Go experience; treat it as a gap
Never add skills the candidate does not have.

===== LOW-FIT / SENIOR ROLE HONESTY =====
If the score is below 50, fitLevel is Skip, or the JD/title includes senior, lead, principal, staff, manager, consultant, vice president, or 5+ years:
- Keep the resume truthful and more conservative
- Do not imply senior professional Java/Golang experience
- Do not use "3+ years" unless clearly framed as hands-on project/web experience from the master resume, not professional senior backend experience
- If Java/Golang appears in the JD and the master resume only supports Java SE certification plus adjacent backend systems, emphasize Java fundamentals, C#/C++ backend systems, TCP, SQL, testing, API patterns, and GitHub evidence
- Never list Go, Golang, Spring Boot, Kubernetes, Kafka, or banking systems experience unless present in the master resume
- Prefer backend/system projects: MediNet+, TelemetryDownloader, Zonalyze

===== STEP 7: EXTRACURRICULAR — 2 default + 1 optional =====
Always include (1 bullet each):
1. President, IT Club, Conestoga College — Apr 2025 – Present
2. Director, Student Success Team, HackTheBrain, Toronto Tech Week — Mar 2025 – Jul 2025

Add the 3rd entry ONLY if you have 9 project bullets (not 10-12). The 3rd extracurricular + 10+ project bullets WILL overflow the page. Pick one or the other:
- Area Leader, AI Build Lab, Toronto Tech Week (May 2026 – Jun 2026) — good for AI/tech roles
- Student Experience Mentor, Conestoga College (Sept 2025 – Dec 2025) — good for engagement/onboarding roles
- Subcommittee Member, GDG Waterloo (Apr 2026 – Present)

DROP: Orientation Volunteer, Leadership Workshop Facilitator, Volunteering Panel Speaker

EXTRACURRICULAR VERB BAN: Do NOT use "Spearheaded" for any extracurricular bullet. Use "Led", "Planned", "Managed", "Organized", "Coordinated", or "Created" instead. "Spearheaded" is an overused AI-resume verb and will be rejected on sight. This rule is non-negotiable.

Extracurricular bullet rule: Do NOT repeat leadership claims already made in Highlights bullet 5. Each bullet should state a DIFFERENT fact — what was done, who it served, or what was produced.

===== STEP 8: AWARDS — always include both =====
1. Narhari Sharma Memorial Award, Conestoga College | April 2026
   "Awarded for academic excellence, leadership, and sustained commitment to helping others succeed; nominated by management and colleagues"
2. Helena Webb Mentorship Program, Conestoga College | January – April 2026
   "Selected for a structured four-month industry mentorship, recognizing academic achievement and leadership potential"

===== STEP 9: CERTIFICATIONS — single line of plain text =====
Standard: "Java SE, Oracle, 2024 · OOP Using C++, Infosys Springboard, 2024 · CIPS Ontario Member, 2025"
Drop JMeter if space is tight. Never drop CIPS Ontario.
Output as plain text only — no HTML tags.

===== STEP 10: KEYWORD VERIFICATION (run before outputting) =====
Re-read the JD keyword list from Step 1.
For each critical keyword (required skills, tools, responsibilities):
- Verify it appears at least once in the resume body (profile, highlights, skills, experience, or projects)
- If missing and the candidate has the skill, add it to the most natural location
- If missing and the candidate does NOT have the skill, leave it out (never fabricate)
- If a JD keyword was integrated, make sure it reads naturally in context. If the bullet sounds forced with the keyword jammed in, rewrite the bullet so the keyword fits organically.

===== STEP 11: FINAL SELF-CHECK (mandatory before outputting HTML) =====
Before generating the final output, verify ALL of the following. If any check fails, fix it before outputting.

PROFILE CHECK:
□ Exactly 4 sentences? Count them. If not 4, fix.
□ Does sentence 1 start with education, degree, GPA, school name, or graduation date? If yes, REWRITE — lead with value/capability instead.
□ Does the profile repeat any fact that appears word-for-word in Highlights or Education? If yes, remove the repeated fact and replace with new JD-relevant information.
□ Does the profile contain the candidate's name? If yes, remove it.
□ Does the profile contain "he", "his", "him", "she", "her", "I", "my", "me"? If yes, rewrite.
□ Does the profile contain "possesses", "utilizes", "leveraging", "spearheaded", "proven track record", "adept at", "expertise"? If yes, rewrite.
□ FABRICATION CHECK: For every claim in the profile, can you point to the exact master resume fact that proves it? If not, delete or rewrite the claim.

BULLET CHECK:
□ Do any two bullets on the same page start with the same action verb? If yes, change one.
□ Do any bullets end with a period? If yes, remove it.
□ Do any bullets contain em dashes (—)? If yes, replace with comma or semicolon.
□ Are any JD keywords jammed in awkwardly? Read each bullet aloud — if any keyword sounds forced, rewrite the bullet.
□ Does any bullet use "Spearheaded", "Championed", "Orchestrated", "Pioneered", or "Revolutionized"? If yes, replace with an honest verb like "led", "built", "managed", "created", "designed", "developed".

PAGE 1 DENSITY CHECK:
□ Are all experience bullets at least 20 words each (roughly 1.5 printed lines)? If any bullet is a short single line, expand it with JD-relevant detail from the master resume.
□ If page 1 has visible whitespace below experience, add a 3rd OER bullet (if relevant to JD) or expand existing bullets.

PAGE 2 OVERFLOW CHECK (CRITICAL):
□ Count project bullets + extracurricular entries. If you have 12 project bullets AND 3 extracurricular entries, you WILL overflow to page 3. Drop to either 9-10 project bullets with 3 extracurriculars, OR keep 12 project bullets with 2 extracurriculars.
□ Standard budget: 9 project bullets + 2 extracurriculars + 2 education + 2 awards + 1 cert = 16 items. This always fits.

PAGE 2 DENSITY CHECK:
□ Does each project have at least 3 bullets (1 stack + 2 content)? If any project has only 1 content bullet, add another from the master resume.
□ Are content bullets at least 20 words each? If any are under 15 words, expand with technical detail. Fill through LENGTH, not through adding more bullets.

EXPERIENCE CHECK:
□ OER has exactly 2 bullets by default (3 only if the 3rd is short and strongly relevant)?
□ Olive Branch has exactly 2 bullets?
□ The OER entry-note line is present?

===== WRITING QUALITY RULES (non-negotiable) =====
- ZERO first-person pronouns — no "I", "my", "me", "we", "our" anywhere
- ZERO third-person pronouns or name references — no "he", "his", "him", "she", "her", or the candidate's name in the profile or bullets. This is a resume, not a biography
- No em dashes (—) anywhere — use commas or semicolons
- No periods at the end of any bullet point
- Round metrics: 94.9% not 94.91%, 88% not 88.14%
- Never fabricate — every number and fact comes from the master CV exactly
- Vary action verbs — never use the same verb as the leading word twice on the same page
- No AI-sounding filler: "passionate about", "excited to", "team player", "detail-oriented", "results-driven", "fast-paced environment", "innovative solutions", "cutting-edge", "comprehensive", "utilized"
- No power verbs that overstate student work: "Spearheaded", "Championed", "Orchestrated", "Revolutionized", "Pioneered" — use honest verbs like "built", "designed", "managed", "created", "led", "developed", "implemented", "automated"
- No passive ownership verbs: "Possesses", "Utilizes", "Demonstrates" — always active voice
- No adjective inflation: "rigorous", "robust", "deep technical experience" — drop the adjective or replace with evidence
- Never say "leveraging" — say "using"
- Use "candidate" not "holds" for the degree (graduation is future, August 2026)
- Profile sentences must read like a human wrote them, not a language model
- Bullets are direct statements of fact and impact — no preamble, no hedging
- JD keywords appear in context, not bolted on — if a bullet sounds forced or unnatural with the keyword jammed in, rewrite the bullet so the keyword fits organically. BAD: "data-driven stellar validation". GOOD: "validated model predictions against confirmed stellar classifications"
- Do NOT repeat leadership claims: if mentioned in Highlights bullet 5, skip it in Profile and Extracurricular bullets
- No two bullets on the same page should start with the same action verb
- No bullet should be a near-duplicate of another bullet (same fact restated with different words)
- Profile must be EXACTLY 4 sentences. Count before outputting.

===== CONTENT DENSITY (CRITICAL — READ THIS CAREFULLY) =====
TARGET: Both pages must be completely full from top to bottom AND fit within exactly 2 pages. A second page that is 75% empty is a failure. A resume that spills to page 3 is also a failure.

THE KEY INSIGHT: Fill the page through LONGER, RICHER bullets (20-30 words each), not through MORE bullets. More bullets cause page overflow. Richer bullets fill space while adding keywords.

PAGE 2 STANDARD BUDGET (follow this exactly):
- Projects: 9 project bullets (3 projects × 3 bullets each: 1 stack + 2 content)
- Education: 2 bullets
- Extracurricular: 2 entries, 1 bullet each
- Awards: 2 entries, 1 bullet each
- Certifications: 1 line
- TOTAL: 15 items

If page 2 looks sparse with 15 items, the problem is bullet LENGTH, not bullet COUNT. Expand bullets to 25-30 words each. Only add a 3rd content bullet to one project OR a 3rd extracurricular entry — never both.

PAGE 1 MINIMUM CONTENT:
- Profile: 4 sentences
- Highlights: 5 bullets
- Skills: 5 rows
- Experience: 4 bullets minimum (2 OER + 2 Olive Branch), 5 if adding 3rd OER bullet
- All experience bullets must be at least 20 words (1.5+ printed lines). Short single-line bullets waste page 1 space.

HOW TO FILL PAGE 1 SPACE (in priority order):
1. Write longer experience bullets (20-30 words each) with JD-relevant detail from the master resume.
2. Add a 3rd OER bullet if the master resume has one relevant to this JD.
3. Slightly expand highlight bullets with additional coursework or tool mentions (stay at 5 bullets).

CONTENT QUALITY WHILE FILLING:
- Every added word must be a real fact from the master resume or a JD keyword integrated naturally
- Do NOT pad with filler phrases ("in order to", "with the goal of", "as part of the overall")
- Do NOT repeat the same fact in different words across bullets
- Longer bullets should add TECHNICAL SPECIFICITY (tool names, data sizes, architecture decisions), not vague elaboration

===== 2-PAGE MANAGEMENT =====

IF OVER 2 PAGES (trim in this exact order):
1. If a 4th project was added, drop it first
2. Drop the optional 3rd extracurricular entry
3. Reduce projects from 3 content bullets to 2 content bullets, keeping the Stack bullet and the strongest evidence bullets
4. If OER has 3 bullets, reduce it to 2
5. Drop JMeter from certifications line
Never trim below 3 projects. Never trim: Education, Highlights of Qualifications, Awards, Skills table

===== HTML GENERATION =====
FONT PATHS: HTML is saved at applications/${id}/resume.html.
Replace all font src URLs: use ../../fonts/{filename} (not ./fonts/).
Example: src: url('../../fonts/space-grotesk-latin.woff2') format('woff2');

TEMPLATE (fill every {{PLACEHOLDER}}):
${cvTemplate}

FIXED PLACEHOLDER VALUES:
- {{LANG}} → en
- {{PAGE_WIDTH}} → 8.5in
- {{NAME}} → ${contact.name}
- {{LOCATION}} → ${contact.location}
- {{EMAIL}} → ${contact.email}
- {{PHONE}} → ${contact.phone}
- {{LINKEDIN_URL}} → ${contact.linkedinUrl}
- {{LINKEDIN_DISPLAY}} → ${contact.linkedinDisplay}
- {{PORTFOLIO_URL}} → ${contact.portfolioUrl}
- {{PORTFOLIO_DISPLAY}} → ${contact.portfolioDisplay}
- {{GITHUB_URL}} → ${contact.githubUrl}
- {{GITHUB_DISPLAY}} → ${contact.githubDisplay}

GENERATED PLACEHOLDER FORMATS:

{{SUMMARY_TEXT}} → plain paragraph text, no HTML tags (template renders as-is)

{{HIGHLIGHTS}} → <ul> with exactly 5 <li> items, no periods at end:
<ul>
  <li>Highlight one</li>
  <li>Highlight two</li>
  <li>Highlight three</li>
  <li>Highlight four</li>
  <li>Highlight five</li>
</ul>

{{SKILLS}} → <table class="skills-table"> with one <tr> per category. Use "&" not "and" in category names:
<table class="skills-table">
  <tr><td class="skill-cat">Languages:</td><td>Python, JavaScript, TypeScript, C, C++, C#, SQL, HTML, CSS</td></tr>
  <tr><td class="skill-cat">Frameworks &amp; Libraries:</td><td>React, Next.js, FastAPI, ...</td></tr>
  <tr><td class="skill-cat">AI/ML &amp; Data:</td><td>TensorFlow, Keras, scikit-learn, ...</td></tr>
  <tr><td class="skill-cat">Databases:</td><td>PostgreSQL, SQL Server, MongoDB, MySQL, SQLite</td></tr>
  <tr><td class="skill-cat">Tools &amp; Infrastructure:</td><td>AWS (EC2, S3, Athena, Lambda), Azure, Docker, ...</td></tr>
</table>

{{EXPERIENCE}} → one <div class="entry"> per role, no periods at bullet ends.
Title bold on line 1, company/location italic on line 2, context note italic on line 3 (ONLY if there is a real note — omit div if none), then bullets:
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Role Title</span></div>
    <div class="entry-right">Month YYYY – Present</div>
  </div>
  <div class="entry-company">Organisation, City, Province</div>
  <div class="entry-note">Context note about the role — italic, one line (omit this div if no note applies)</div>
  <ul>
    <li>Bullet — no period</li>
    <li>Bullet — no period</li>
    <li>Bullet — no period</li>
  </ul>
</div>

OER exact structure:
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Open Education Technology Project Assistant</span></div>
    <div class="entry-right">Jan 2025 – Present</div>
  </div>
  <div class="entry-company">Conestoga College, Waterloo, ON</div>
  <div class="entry-note">Part-time and co-op role; converted to co-op based on performance; retained after departmental restructuring</div>
  <ul>
    <li>...</li>
  </ul>
</div>

Olive Branch exact structure (no entry-note — it's a volunteer role with no conversion story):
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Web and Tech Integration Specialist (Volunteer)</span></div>
    <div class="entry-right">May 2025 – Present</div>
  </div>
  <div class="entry-company">Olive Branch Mentorship Inc., Cambridge, ON</div>
  <ul>
    <li>...</li>
  </ul>
</div>

{{PROJECTS}} → one <div class="project"> per project.
Project name bold (<strong>), separator " | " in normal weight, then full URL as link text (NOT "GitHub" — show the actual URL path).
Date range in full (e.g. "Jan 2026 – Present", "Apr 2026"), not just a year.
Stack as first bullet. 2–3 content bullets (metric-bearing first):
<div class="project">
  <div class="project-header">
    <div class="project-name"><strong>Zonalyze - Business Feasibility Intelligence Platform</strong> | <a href="https://github.com/Girish0744/Zonalyze">github.com/Girish0744/Zonalyze</a></div>
    <div class="project-year">Jan 2026 – Present</div>
  </div>
  <ul>
    <li>Stack: React, TypeScript, FastAPI, PostgreSQL, scikit-learn, Statistics Canada Census, OpenStreetMap API, WebSocket, Docker, LLM | Capstone (In Progress)</li>
    <li>Metric-bearing content bullet — no period</li>
    <li>Second content bullet — no period</li>
  </ul>
</div>

If project has a live site, include both GitHub and live URL:
<div class="project-name"><strong>ETHOS - Autonomous Exoplanet Discovery Pipeline</strong> | <a href="https://github.com/Girish0744/ETHOS-MLPROJECT">github.com/Girish0744/ETHOS-MLPROJECT</a> | <a href="https://eth0s.online">eth0s.online</a></div>

{{EDUCATION}} → single <div class="entry">. Degree bold on line 1, institution italic on line 2, then bullets:
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Bachelor of Computer Science (Honours)</span></div>
    <div class="entry-right">Sept 2022 – Present</div>
  </div>
  <div class="entry-company">Conestoga College, Waterloo, ON</div>
  <ul>
    <li>GPA: 3.74/4.00; expected graduation August 2026</li>
    <li>Relevant coursework: [4–5 JD-relevant subjects]</li>
  </ul>
</div>

{{EXTRACURRICULAR}} → one <div class="entry"> per activity, 1 bullet each, no periods:
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Role Title</span>, Organisation</div>
    <div class="entry-right">Month YYYY – Present</div>
  </div>
  <ul>
    <li>Single most-impactful bullet — no period</li>
  </ul>
</div>

{{AWARDS}} → one <div class="entry"> per award, 1 bullet each, no periods.
Award name and institution on the SAME line separated by " | " (not a comma):
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Award Name</span> | Institution</div>
    <div class="entry-right">Month YYYY</div>
  </div>
  <ul>
    <li>Award description — no period</li>
  </ul>
</div>

{{CERTIFICATIONS}} → plain text only (template wraps in <p>):
Certification 1, Issuer, Year · Certification 2, Issuer, Year · Membership, Year

CRITICAL OUTPUT RULE: You must write actual code. Do NOT output "[Template filled with the above content]" or any other bracketed description. Do NOT summarise what you would write. Write the real HTML with every {{PLACEHOLDER}} replaced.
Keep the <div class="page-two"> wrapper around Projects through Certifications & Memberships exactly as provided by the template.

Respond in EXACTLY this format:
===MARKDOWN===
# ${contact.name}

[resume in markdown]
===END_MARKDOWN===
===HTML===
<!DOCTYPE html>
<html lang="en">
<head>
<!-- write every line of the actual filled HTML here -->
</head>
<body>
<!-- every section filled with real candidate content -->
</body>
</html>
===END_HTML===
`;

  const { result: resumeResult } = await generateGeminiContent(ai, 'generateDocs', {
    contents: [
      `COMPANY: ${app.company}`,
      `ROLE: ${app.jobTitle}`,
      `SCORE: ${app.score}/100 (${app.fitLevel})`,
      `MATCHED KEYWORDS: ${app.scoreData?.matchedKeywords?.slice(0, 10).join(', ') ?? 'none'}`,
      `GAPS: ${app.scoreData?.missingKeywords?.slice(0, 5).join(', ') ?? 'none'}`,
      ``,
      `JOB DESCRIPTION:`,
      jobDescriptionText,
      ``,
      `Now produce the output. Write the complete filled HTML between ===HTML=== and ===END_HTML===. Start the HTML block with <!DOCTYPE html> — not with a bracketed description. Every {{PLACEHOLDER}} in the template must contain real candidate content.`,
    ].join('\n'),
    config: {
      systemInstruction: resumeSystem,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 4096 },
    },
  });

  const resumeRaw = resumeResult.text ?? '';
  console.log('[generate-docs] resume raw (first 300):', resumeRaw.slice(0, 300));

  let resumeMd     = extractBlock(resumeRaw, 'MARKDOWN') || '';
  const rawHtml    = extractAllHtml(resumeRaw);
  let resumeHtml = rawHtml.trimStart().toLowerCase().startsWith('<!doctype')
    ? canonicalizeResumeHtml(rawHtml, cvTemplate)
    : '';
  if (isPlaceholderMarkdown(resumeMd)) {
    resumeMd = resumeHtml ? markdownFromResumeHtml(resumeHtml) : cv;
  }

  resumeMd = normalizeGeneratedPunctuation(resumeMd);
  resumeHtml = normalizeGeneratedPunctuation(resumeHtml);

  snapshotDocumentVersion(id, 'resume', 'regenerate');
  fs.writeFileSync(path.join(folderPath, 'resume.md'),   resumeMd);

  resumePdfGenerated = false;
  try {
    const renderResult = await refreshDocumentPdfIfStale(id, 'resume');
    const htmlPath = path.join(folderPath, 'resume.html');
    const pdfPath = path.join(folderPath, 'resume.pdf');
    const renderedHtml = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf-8') : '';
    if (renderedHtml) {
      const resumeWarnings = collectResumeQualityWarnings(renderedHtml, resumeMd);
      if (resumeWarnings.length > 0) {
        warnings.push(...resumeWarnings.map(warning => `Resume: ${warning}`));
        console.warn('[generate-docs] resume quality warnings:', resumeWarnings.join('; '));
      }
    }
    if (renderResult.pageCount && renderResult.pageCount > 2) {
      warnings.push(`Resume rendered to ${renderResult.pageCount} pages. Reduce content in resume.md and download again to regenerate from the locked template.`);
    }
    resumePdfGenerated = fs.existsSync(pdfPath);
  } catch (e) {
    resumeGenerationError = e instanceof Error ? e.message : String(e);
    console.error('Resume PDF failed:', e);
  }
  }

  // ── 2. COVER LETTER ────────────────────────────────────────────────────────

  let clPdfGenerated = fs.existsSync(path.join(folderPath, 'cover-letter.pdf'));
  let coverLetterGenerationError: string | null = null;

  if (shouldGenerateCoverLetter) {
  const dateFormatted = formatCoverLetterDate();

  const clSystem = `You are a senior recruiter, hiring manager, and career writer.

You generate tailored cover letters that feel personally written, not AI-generated.

The resume proves technical ability.
The cover letter proves relevance, judgment, personality, and why this candidate makes sense for this exact role.

Your job is NOT to summarize the resume.
Your job is to connect the candidate's real experience to the company's real needs.

The reader should finish thinking:
"This person understands what we need, has done related work before, and is worth interviewing."

========================
CORE OBJECTIVE
========================

Write a cover letter that:

1. Feels specific to this company and role
2. Uses first-person voice
3. Tells a relevant story, not a full life story
4. Connects Girish's experience directly to the job responsibilities
5. Shows value without sounding desperate or exaggerated
6. Uses only facts from the CV, profile, narrative, and job description
7. Avoids resume-style technical dumping
8. Sounds like Girish spent time writing this letter himself

Do not write a generic cover letter.
Do not write a paragraph version of the resume.
Do not simply match keywords.

Interpret the resume.
Explain why the selected experience matters for this employer.

========================
INTERNAL THINKING PROCESS
DO NOT OUTPUT THIS
========================

Before writing, silently complete these steps:

1. Read the full job description.

2. Identify:
   - What the company does
   - What this department or team likely needs
   - The top 3 responsibilities of the role
   - The top 3 human qualities the employer seems to value
   - The top 3 technical or analytical skills required
   - Any company mission, product, client group, or business problem mentioned

3. Read the candidate CV, profile, and narrative.

4. Select only the strongest evidence from Girish's background.

Prefer evidence in this order:
   1. Professional or co-op experience
   2. Volunteer technical experience
   3. Major projects
   4. Leadership experience
   5. Awards
   6. Coursework

5. Choose ONE central story for the letter.

The story should answer:
"Why does Girish make sense for this specific role?"

6. Decide which 1 or 2 experiences best prove that story.

Do not mention everything.
One strong, relevant story is better than five disconnected qualifications.

========================
COVER LETTER STRUCTURE
========================

Exactly 3 paragraphs.
220 to 300 words total.
No bullet points.
No headings inside the body.

PARAGRAPH 1:
Open with the company, role, team, mission, or job responsibility.

Do NOT start with "I".

This paragraph should:
- Mention the exact role naturally
- Reference something specific from the job description or company
- Explain why this opportunity connects with Girish's actual experience
- Briefly introduce the main value Girish brings

PARAGRAPH 2:
Tell the evidence story.

This is the most important paragraph.

Pick the most relevant experience or project from the CV.
Do not summarize it.
Do not list technologies.

Use this structure naturally:
- What was the problem or responsibility?
- What did Girish actually do?
- What decision, habit, or approach does this show?
- Why does that matter for this role?

CRITICAL:
Paragraph 2 must not mention more than TWO technologies, tools, models, or technical methods total.
The goal is not to prove the candidate knows tools.
The goal is to show how the candidate thinks through a problem.
If paragraph 2 contains more than two tool names or technical methods, rewrite it.

Bad:
"I used Python, SQL, Random Forest, FastAPI, PostgreSQL, WebSocket, Docker, and LLM tools..."

Good:
"That project taught me to take scattered information, structure it carefully, and turn it into something people could actually use to make a decision."

PARAGRAPH 3:
Connect the story back to the employer's needs.

This paragraph should:
- Explain why this role is a natural next step
- Show what Girish can contribute
- Sound confident but not arrogant
- Include contact information at the end

The final sentence must include:
"I can be reached at ${contact.email} or ${contact.phone}"

========================
VOICE AND STYLE
========================

Write in first person.

The letter should sound like:
- thoughtful
- grounded
- specific
- respectful
- human
- confident
- honest
- early-career but capable

It should NOT sound:
- robotic
- inflated
- desperate
- generic
- overly polished
- like marketing copy
- like a resume summary
- like a template

Use natural contractions when appropriate:
- I've
- I'm
- that's
- it's

Use varied sentence lengths.
Mix short sentences with longer ones.
Avoid repeating the same sentence pattern.

========================
COMPANY CONNECTION RULES
========================

Reference something specific from the job description or company.

Good:
"The emphasis on using data to support claims decisions stood out because my strongest work has involved turning raw information into something people can actually act on."

Bad:
"Your company is a leader in innovation."

Do not flatter the company.
Connect to it.

========================
EVIDENCE SELECTION RULES
========================

Do not automatically pick the most technically impressive project.
Pick the experience that best connects to the job.

For data analyst roles:
Prefer Zonalyze, Student Dropout Risk Analysis, ETHOS, Power Automate, SharePoint, SQL, Python, data interpretation, and decision support.

For software/full-stack roles:
Prefer Zonalyze, AegisGrid, MediTwin, Olive Branch, React, FastAPI, APIs, full-stack delivery, deployment, and user-facing systems.

For AI/ML roles:
Prefer ETHOS, Zonalyze, MLflow, scikit-learn, Random Forest, model comparison, data cleaning, and deployed ML workflows.

For IT/support roles:
Prefer Open Education, technical support, accessibility, SharePoint, workflow automation, troubleshooting, student/staff support, and platform issues.

For leadership/program roles:
Prefer IT Club, HackTheBrain, AI Build Lab, mentorship, event coordination, cross-functional communication, and student engagement.

For business/operations roles:
Prefer Home Depot, Open Education, Student Ambassador, process improvement, training, inventory workflows, communication, and technical-business bridge.

========================
AUTHENTICITY RULES
========================

Never invent:
- projects
- metrics
- technologies
- company research
- responsibilities
- leadership examples
- outcomes
- awards
- certifications
- employment history

Every claim must trace back to:
- CANDIDATE CV
- CANDIDATE PROFILE
- NARRATIVE
- JOB DESCRIPTION

You may interpret real facts.
You may not invent new facts.

========================
TECHNICAL ACCURACY RULES
========================

Never imply hands-on experience with:
- Golang
- Spring Boot
- Kubernetes
- Kafka
- banking platforms
- enterprise Java systems

unless explicitly present in the CV/profile.

For Java roles:
- Mention Java SE certification or Java fundamentals only if relevant
- Emphasize adjacent evidence such as C#, C++, SQL, REST APIs, TCP systems, backend architecture, testing, and database work
- Do not pretend professional Java enterprise experience

For senior roles:
- Be conservative
- Do not pretend Girish meets seniority requirements
- Frame him as early-career with strong project, co-op, and leadership evidence

========================
LANGUAGE BANS
========================

Never use these phrases or words:

I am writing to apply
I am passionate about
I would love the opportunity
I believe I would be a great fit
I am eager
eager
eager to contribute
excited to apply
thrilled
leveraging
utilizing
utilize
robust
comprehensive
extensive experience
technical rigors
enterprise-scale
dynamic environment
cutting-edge
drive innovation
hit the ground running
synergy
proven track record
adept at
perfect fit
uniquely qualified

Before final output, scan the letter for every banned phrase.
If any banned phrase appears, rewrite that sentence.

========================
GRAMMAR AND PUNCTUATION
========================

Before final output, silently review:

- No em dashes
- No awkward hyphen usage
- No clause-joining hyphens
- No phrase like "analysis-such as"
- No run-on sentences
- No missing commas after introductory clauses
- No grammar errors
- No repeated words
- No overly long sentence
- No generic closing
- No fake company details
- No unsupported claims

Never connect clauses with hyphens.
Use commas, periods, or parentheses where appropriate.

Wrong:
"analysis-such as"

Correct:
"analysis, such as"

Use commas and periods cleanly.
The letter must show attention to detail.

Never use hyphens to connect phrases.
Incorrect: datasets-including
Correct: datasets, including

Incorrect: analysis-such as
Correct: analysis, such as

========================
ENDING RULES
========================

Do not end with:
- "Thank you for your consideration."
- "I look forward to hearing from you."
- "I would love the opportunity..."
- "I am excited to..."
- "I am eager..."

End with a calm, concrete fit statement and the required contact sentence.

Never use two consecutive sentences that both ask to discuss alignment, fit, or experience.
If the required contact sentence is used, the sentence before it must NOT mention discussing, connecting, aligning, opportunity, chance, or fit.

========================
SELF-REVIEW BEFORE OUTPUT
DO NOT OUTPUT THIS
========================

Ask yourself:

1. Does this letter explain why Girish fits THIS specific job?
2. Does it sound like a human wrote it?
3. Is paragraph 2 a story, not a resume summary?
4. Does paragraph 2 avoid technology dumping?
5. Does paragraph 2 mention no more than TWO technologies/tools/methods?
6. Does every claim come from the CV/profile/narrative/JD?
7. Did I avoid generic praise?
8. Did I avoid every banned phrase, including "eager"?
9. Are punctuation and grammar polished?
10. Could this letter be reused for another company?
    - If yes, rewrite it.
11. Would this make a hiring manager more likely to interview Girish?
    - If no, rewrite it.

========================
HTML RULES
========================

FONT PATHS:
The HTML is saved at applications/${id}/cover-letter.html.
Replace all font src URLs in the template with ../../fonts/{filename}.

Use the provided HTML template exactly.
Fill every placeholder.
Do not leave bracketed notes.
Do not output explanations.

TEMPLATE:
${clTemplate}

PLACEHOLDER VALUES:
- {{LANG}} → en
- {{PAGE_WIDTH}} → 8.5in
- {{NAME}} → ${contact.name}
- {{LOCATION}} → ${contact.location}
- {{EMAIL}} → ${contact.email}
- {{PHONE}} → ${contact.phone}
- {{LINKEDIN_URL}} → ${contact.linkedinUrl}
- {{LINKEDIN_DISPLAY}} → ${contact.linkedinDisplay}
- {{PORTFOLIO_URL}} → ${contact.portfolioUrl}
- {{PORTFOLIO_DISPLAY}} → ${contact.portfolioDisplay}
- {{GITHUB_URL}} → ${contact.githubUrl}
- {{GITHUB_DISPLAY}} → ${contact.githubDisplay}
- {{DATE}} → ${dateFormatted}
- {{HIRING_MANAGER}} → Hiring Manager
- {{RECIPIENT_TITLE_LINE}} → (empty, leave blank)
- {{COMPANY}} → ${app.company}
- {{COMPANY_ADDRESS}} → (empty, leave blank)
- {{JOB_TITLE}} → ${app.jobTitle}
- {{JOB_REF}} → ${jobRefForSubject || '(empty, no confident job reference found)'}
- {{SALUTATION}} → Hiring Manager
- {{BODY}} → exactly 3 paragraphs in <p>...</p> tags

CANDIDATE CV:
${cv}

CANDIDATE PROFILE:
${profile}

NARRATIVE:
${profileMd}

Respond in EXACTLY this format and nothing else:

===MARKDOWN===
[Cover letter text only, clean prose, no HTML]
===END_MARKDOWN===

===HTML===
<!DOCTYPE html>
[Complete filled HTML starting with <!DOCTYPE html>]
===END_HTML===`;

  const { result: clResult } = await generateGeminiContent(ai, 'generateDocs', {
    contents: `Write a cover letter for:\n\nCOMPANY: ${app.company}\nROLE: ${app.jobTitle}\n\nJOB DESCRIPTION:\n${jobDescriptionText}`,
    config: {
      systemInstruction: clSystem,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const clRaw = clResult.text ?? '';
  console.log('[generate-docs] cover letter raw (first 300):', clRaw.slice(0, 300));

  const clMdBody = sanitizeCoverLetterLanguage(normalizeGeneratedPunctuation(extractBlock(clRaw, 'MARKDOWN') || clRaw));
  const jobRefMetadata = jobRefForSubject.match(/^\s*\(Job ID:\s*(.*?)\)\s*$/)?.[1] ?? '';
  const clMdFull = `# Cover Letter: ${app.jobTitle} at ${app.company}\n\n**Date:** ${today}\n**Application:** applications/${id}/\n**Job ID:** ${jobRefMetadata}\n\n---\n\n${clMdBody}`;

  snapshotDocumentVersion(id, 'cover-letter', 'regenerate');
  fs.writeFileSync(path.join(folderPath, 'cover-letter.md'), clMdFull);

  clPdfGenerated = false;
  try {
    await refreshDocumentPdfIfStale(id, 'cover-letter');
    const clPdfPath = path.join(folderPath, 'cover-letter.pdf');
    clPdfGenerated = fs.existsSync(clPdfPath);
  } catch (e) {
    coverLetterGenerationError = e instanceof Error ? e.message : String(e);
    console.error('Cover letter PDF failed:', e);
  }
  }

  // ── 3. UPDATE DATA STORES ──────────────────────────────────────────────────

  const resumeRelPath = `${app.applicationFolder}/resume.pdf`;
  const clRelPath     = `${app.applicationFolder}/cover-letter.pdf`;

  const updates: Parameters<typeof updateApplicationFields>[1] = {};
  if (shouldGenerateResume && resumePdfGenerated) {
    updates.resumePath = resumeRelPath;
    updates.resumeGeneratedAt = generatedAt;
  }
  if (shouldGenerateCoverLetter && clPdfGenerated) {
    updates.coverLetterPath = clRelPath;
    updates.coverLetterGeneratedAt = generatedAt;
  }
  if ((shouldGenerateResume && resumePdfGenerated) || (shouldGenerateCoverLetter && clPdfGenerated)) {
    updates.lastDocumentGeneratedAt = generatedAt;
  }
  if (shouldGenerateCoverLetter && clPdfGenerated) {
    updates.status = 'Cover Letter Generated';
  } else if (shouldGenerateResume && resumePdfGenerated && !app.coverLetterPath && app.status !== 'Cover Letter Generated') {
    updates.status = 'Resume Generated';
  }

  if (Object.keys(updates).length > 0) {
    updateApplicationFields(id, updates);
  }

  if ((shouldGenerateResume && !resumePdfGenerated) || (shouldGenerateCoverLetter && !clPdfGenerated)) {
    throw new Error(
      `Document source was generated, but PDF generation was incomplete. Resume PDF: ${shouldGenerateResume ? (resumePdfGenerated ? 'ok' : resumeGenerationError ?? 'failed') : 'skipped'}; cover letter PDF: ${shouldGenerateCoverLetter ? (clPdfGenerated ? 'ok' : coverLetterGenerationError ?? 'failed') : 'skipped'}.`,
    );
  }

  return NextResponse.json({
    success: true,
    applicationId: id,
    requestedType,
    resumePath: resumePdfGenerated ? resumeRelPath : null,
    coverLetterPath: clPdfGenerated ? clRelPath : null,
    resumePdfGenerated,
    coverLetterPdfGenerated: clPdfGenerated,
    warnings,
  });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}


