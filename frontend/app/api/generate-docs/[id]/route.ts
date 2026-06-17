import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getApplication, updateApplicationFields } from '@/lib/filesystem';
import { apiErrorMessage } from '@/lib/errors';
import { generateGeminiContent } from '@/lib/ai-config';
import { extractApplicantProfile } from '@/lib/apply-assistant';

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
  await execFileAsync(process.execPath, [script, htmlPath, pdfPath, `--format=${format}`], {
    cwd: ROOT,
    timeout: 60000,
  });
}

function displayFromUrl(value: string, fallback: string): string {
  if (!value) return fallback;
  return value
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function contactPlaceholders(profileYml: string) {
  const profile = extractApplicantProfile(profileYml);
  const phone = profile.phone ? `${profile.phone},` : '';
  return {
    name: profile.fullName || profile.legalName || 'Candidate',
    location: [profile.city, profile.province].filter(Boolean).join(', ') || profile.country || '',
    email: profile.email || '',
    phoneSpan: phone,
    linkedinUrl: displayFromUrl(profile.linkedin || '', ''),
    linkedinDisplay: profile.linkedin ? 'LinkedIn' : '',
    portfolioUrl: profile.portfolioUrl || '',
    portfolioDisplay: displayFromUrl(profile.portfolioUrl || '', 'Portfolio'),
    githubUrl: displayFromUrl(profile.github || '', ''),
    githubDisplay: profile.github ? 'GitHub' : '',
  };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
  const { id } = await params;

  const app = getApplication(id);
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const cv         = readRoot('cv.md');
  const profile    = readRoot('config/profile.yml');
  const profileMd  = readRoot('modes/_profile.md');
  const cvTemplate = readRoot('templates/cv-template.html');
  const clTemplate = readRoot('templates/cover-letter-template.html');
  const contact = contactPlaceholders(profile);

  const generatedAt = new Date().toISOString();
  const today = generatedAt.split('T')[0];
  const folderPath = path.join(/*turbopackIgnore: true*/ ROOT, app.applicationFolder);

  // ── 1. RESUME ──────────────────────────────────────────────────────────────

  const resumeSystem = `You generate ATS-optimized tailored resumes. Given a candidate's CV, profile, and a job description, produce:
1. A tailored markdown resume (resume.md — the editable source)
2. The complete filled HTML using the provided template (for PDF generation)

TAILORING RULES:
- Rewrite the Professional Summary to match JD keywords + candidate narrative bridge
- Select top 3-4 most relevant projects for this role
- Reorder experience bullets by JD relevance (most relevant first)
- NEVER invent metrics or experience — only facts from the CV
- Inject JD keywords naturally into existing content
- Keep ALL sections from the template

FONT PATHS: The HTML is saved at applications/${id}/resume.html.
Replace all font src URLs in the template with ../../fonts/{filename} (not ./fonts/).
Example: src: url('../../fonts/space-grotesk-latin.woff2') format('woff2');

TEMPLATE (fill every {{PLACEHOLDER}}):
${cvTemplate}

PLACEHOLDER VALUES from profile:
- {{LANG}} → en
- {{PAGE_WIDTH}} → 8.5in
- {{NAME}} → ${contact.name}
- {{LOCATION}} → ${contact.location}
- {{EMAIL}} → ${contact.email}
- {{PHONE_SPAN}} → ${contact.phoneSpan}
- {{LINKEDIN_URL}} → ${contact.linkedinUrl}
- {{LINKEDIN_DISPLAY}} → ${contact.linkedinDisplay}
- {{PORTFOLIO_URL}} → ${contact.portfolioUrl}
- {{PORTFOLIO_DISPLAY}} → ${contact.portfolioDisplay}
- {{GITHUB_URL}} → ${contact.githubUrl}
- {{GITHUB_DISPLAY}} → ${contact.githubDisplay}
- {{SUMMARY_TEXT}} → [YOU GENERATE: tailored 2-3 line summary]
- {{SKILLS}} → [YOU GENERATE: tailored <table class="skills-table"> HTML]
- {{EDUCATION}} → [YOU GENERATE: education <div class="entry"> HTML]
- {{EXPERIENCE}} → [YOU GENERATE: tailored experience <div class="entry"> HTML]
- {{PROJECTS}} → [YOU GENERATE: selected top projects <div class="project"> HTML]
- {{EXTRACURRICULAR}} → [YOU GENERATE: top 3-4 extracurricular <div class="entry"> HTML]

CANDIDATE CV:
${cv}

CANDIDATE PROFILE:
${profile}

NARRATIVE:
${profileMd}

Respond in EXACTLY this format (no other text):
===MARKDOWN===
# ${contact.name}

[Full tailored resume in clean markdown with standard headings]
===END_MARKDOWN===
===HTML===
<!DOCTYPE html>
[Complete filled HTML starting with <!DOCTYPE html>]
===END_HTML===`;

  const { result: resumeResult } = await generateGeminiContent(ai, 'generateDocs', {
    contents: `Tailor this resume for the following job:\n\nCOMPANY: ${app.company}\nROLE: ${app.jobTitle}\nSCORE: ${app.score}/100 (${app.fitLevel})\nMATCHED: ${app.scoreData?.matchedKeywords?.slice(0,8).join(', ') ?? ''}\nGAPS: ${app.scoreData?.missingKeywords?.slice(0,5).join(', ') ?? ''}\n\nJOB DESCRIPTION:\n${app.jobDescription ?? ''}`,
    config: {
      systemInstruction: resumeSystem,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const resumeRaw = resumeResult.text ?? '';
  console.log('[generate-docs] resume raw (first 300):', resumeRaw.slice(0, 300));

  function extractBlock(text: string, tag: string): string {
    // Try custom delimiters: ===TAG===...===END_TAG===
    const delim = text.match(new RegExp(`===${tag}===\\s*([\\s\\S]*?)\\s*===${tag === 'HTML' ? 'END_HTML' : 'END_MARKDOWN'}===`));
    if (delim) return delim[1].trim();
    // Try markdown code block (```html or ```markdown or ```)
    const lang = tag === 'HTML' ? '(?:html)?' : '(?:markdown|md)?';
    const code = text.match(new RegExp('```' + lang + '\\s*([\\s\\S]*?)\\s*```'));
    if (code) return code[1].trim();
    return '';
  }

  function extractAllHtml(text: string): string {
    // Try custom delimiter
    const delim = text.match(/===HTML===\s*([\s\S]*?)\s*===END_HTML===/);
    if (delim) return delim[1].trim();
    // Try any html code block
    const code = text.match(/```html\s*([\s\S]*?)\s*```/);
    if (code) return code[1].trim();
    // Try finding <!DOCTYPE html> ... </html>
    const doctype = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
    if (doctype) return doctype[1].trim();
    return '';
  }

  const resumeMd   = extractBlock(resumeRaw, 'MARKDOWN') || cv;
  const resumeHtml = extractAllHtml(resumeRaw);

  fs.writeFileSync(path.join(folderPath, 'resume.md'),   resumeMd);

  let resumePdfGenerated = false;
  if (resumeHtml) {
    const htmlPath = path.join(folderPath, 'resume.html');
    const pdfPath  = path.join(folderPath, 'resume.pdf');
    fs.writeFileSync(htmlPath, resumeHtml);
    try {
      await generatePdf(htmlPath, pdfPath);
      resumePdfGenerated = fs.existsSync(pdfPath);
    } catch (e) {
      console.error('Resume PDF failed:', e);
    }
  }

  // ── 2. COVER LETTER ────────────────────────────────────────────────────────

  const dateFormatted = new Date().toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const clSystem = `You generate professional, tailored cover letters.

RULES:
- Max 4 short paragraphs. 250-350 words total.
- Human, direct, confident. Not sycophantic or generic.
- Do NOT start paragraph 1 with "I".
- Never use: "I am passionate about", "I would love the opportunity", "I believe I would be a great fit", "I am writing to apply"
- Reference something specific from the company/JD
- Only use facts from the CV — never invent experience or metrics

FONT PATHS: The HTML is saved at applications/${id}/cover-letter.html.
Replace all font src URLs in the template with ../../fonts/{filename}.

TEMPLATE (fill every {{PLACEHOLDER}}):
${clTemplate}

PLACEHOLDER VALUES:
- {{LANG}} → en
- {{PAGE_WIDTH}} → 8.5in
- {{NAME}} → ${contact.name}
- {{LOCATION}} → ${contact.location}
- {{EMAIL}} → ${contact.email}
- {{PHONE_SPAN}} → ${contact.phoneSpan}
- {{LINKEDIN_URL}} → ${contact.linkedinUrl}
- {{LINKEDIN_DISPLAY}} → ${contact.linkedinDisplay}
- {{PORTFOLIO_URL}} → ${contact.portfolioUrl}
- {{PORTFOLIO_DISPLAY}} → ${contact.portfolioDisplay}
- {{GITHUB_URL}} → ${contact.githubUrl}
- {{GITHUB_DISPLAY}} → ${contact.githubDisplay}
- {{DATE}} → ${dateFormatted}
- {{HIRING_MANAGER}} → Hiring Manager
- {{RECIPIENT_TITLE_LINE}} → (empty — leave blank)
- {{COMPANY}} → [company from JD]
- {{COMPANY_ADDRESS}} → (empty — leave blank)
- {{JOB_TITLE}} → [exact job title from JD]
- {{JOB_REF}} → (empty — unless ref# in JD)
- {{SALUTATION}} → Hiring Manager
- {{BODY}} → [3-4 paragraphs in <p>...</p> tags]

CANDIDATE CV:
${cv}

CANDIDATE PROFILE:
${profile}

NARRATIVE:
${profileMd}

Respond in EXACTLY this format (no other text):
===MARKDOWN===
[Cover letter text without HTML — clean prose]
===END_MARKDOWN===
===HTML===
<!DOCTYPE html>
[Complete filled HTML starting with <!DOCTYPE html>]
===END_HTML===`;

  const { result: clResult } = await generateGeminiContent(ai, 'generateDocs', {
    contents: `Write a cover letter for:\n\nCOMPANY: ${app.company}\nROLE: ${app.jobTitle}\n\nJOB DESCRIPTION:\n${app.jobDescription ?? ''}`,
    config: {
      systemInstruction: clSystem,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const clRaw = clResult.text ?? '';
  console.log('[generate-docs] cover letter raw (first 300):', clRaw.slice(0, 300));

  const clMdBody  = extractBlock(clRaw, 'MARKDOWN') || clRaw;
  const clHtml    = extractAllHtml(clRaw);
  const clMdFull  = `# Cover Letter: ${app.jobTitle} at ${app.company}\n\n**Date:** ${today}\n**Application:** applications/${id}/\n\n---\n\n${clMdBody}`;

  fs.writeFileSync(path.join(folderPath, 'cover-letter.md'), clMdFull);

  let clPdfGenerated = false;
  if (clHtml) {
    const clHtmlPath = path.join(folderPath, 'cover-letter.html');
    const clPdfPath  = path.join(folderPath, 'cover-letter.pdf');
    fs.writeFileSync(clHtmlPath, clHtml);
    try {
      await generatePdf(clHtmlPath, clPdfPath);
      clPdfGenerated = fs.existsSync(clPdfPath);
    } catch (e) {
      console.error('Cover letter PDF failed:', e);
    }
  }

  // ── 3. UPDATE DATA STORES ──────────────────────────────────────────────────

  const resumeRelPath = `${app.applicationFolder}/resume.pdf`;
  const clRelPath     = `${app.applicationFolder}/cover-letter.pdf`;

  const updates: Parameters<typeof updateApplicationFields>[1] = {};
  if (resumePdfGenerated) {
    updates.resumePath = resumeRelPath;
    updates.resumeGeneratedAt = generatedAt;
  }
  if (clPdfGenerated) {
    updates.coverLetterPath = clRelPath;
    updates.coverLetterGeneratedAt = generatedAt;
  }
  if (resumePdfGenerated || clPdfGenerated) {
    updates.lastDocumentGeneratedAt = generatedAt;
  }
  if (resumePdfGenerated && clPdfGenerated) {
    updates.status = 'Cover Letter Generated';
  } else if (resumePdfGenerated) {
    updates.status = 'Resume Generated';
  }

  if (Object.keys(updates).length > 0) {
    updateApplicationFields(id, updates);
  }

  if (!resumePdfGenerated || !clPdfGenerated) {
    throw new Error(
      `Document source was generated, but PDF generation was incomplete. Resume PDF: ${resumePdfGenerated ? 'ok' : 'failed'}; cover letter PDF: ${clPdfGenerated ? 'ok' : 'failed'}.`,
    );
  }

  return NextResponse.json({
    success: true,
    applicationId: id,
    resumePath: resumeRelPath,
    coverLetterPath: clRelPath,
    resumePdfGenerated,
    coverLetterPdfGenerated: clPdfGenerated,
  });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
