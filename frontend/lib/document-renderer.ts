import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { extractApplicantProfile } from './apply-assistant';
import { getApplication, updateApplicationFields } from './filesystem';
import { formatCoverLetterDate } from './date-format';
import { formatJobReferenceForSubject, formatJobReferenceValue } from './job-reference';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');

type DocumentType = 'resume' | 'cover-letter';
type BlockClass = 'entry' | 'project';

interface RenderResult {
  refreshed: boolean;
  htmlPath: string;
  pdfPath: string;
  pageCount: number | null;
}

const SECTION_ALIASES: Record<string, string> = {
  'profile': 'Profile',
  'summary': 'Profile',
  'professional summary': 'Profile',
  'highlights': 'Highlights of Qualifications',
  'qualifications': 'Highlights of Qualifications',
  'highlights of qualifications': 'Highlights of Qualifications',
  'technical skills': 'Technical Skills Summary',
  'skills': 'Technical Skills Summary',
  'technical summary': 'Technical Skills Summary',
  'technical skills summary': 'Technical Skills Summary',
  'professional experience': 'Professional Experience',
  'work experience': 'Professional Experience',
  'experience': 'Professional Experience',
  'projects': 'Projects',
  'project experience': 'Projects',
  'education': 'Education',
  'extracurricular activities': 'Extracurricular Activities',
  'leadership and activities': 'Extracurricular Activities',
  'activities': 'Extracurricular Activities',
  'awards': 'Awards and Recognition',
  'awards recognition': 'Awards and Recognition',
  'awards and recognition': 'Awards and Recognition',
  'certifications': 'Certifications & Memberships',
  'memberships': 'Certifications & Memberships',
  'certifications memberships': 'Certifications & Memberships',
  'certifications and memberships': 'Certifications & Memberships',
};
function readRoot(rel: string): string {
  const filePath = path.join(/*turbopackIgnore: true*/ ROOT, rel);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s*[:|].*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function displayFromUrl(value: string, fallback = ''): string {
  if (!value) return fallback;
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function stripMarkdownDecoration(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .trim();
}

function normalizeHref(value: string): string {
  const trimmed = value.trim();
  if (/^(?:mailto:|tel:|https?:\/\/)/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^www\./i, 'www.')}`;
}

function linkHtml(label: string, href: string): string {
  return `<a href="${escapeHtml(normalizeHref(href))}">${escapeHtml(label)}</a>`;
}

function autolinkBareUrls(value: string): string {
  return value.replace(
    /(^|[\s(|])((?:https?:\/\/|www\.)[^\s<>()]+|(?:github\.com|linkedin\.com|girishbhuteja\.com|[a-z0-9-]+\.vercel\.app|eth0s\.online)\/[^\s<>()]+|(?:github\.com|linkedin\.com|girishbhuteja\.com|eth0s\.online|[a-z0-9-]+\.vercel\.app)\b)([.,;:!?)]?)/gi,
    (_match, prefix: string, rawUrl: string, trailing: string) => `${prefix}${linkHtml(rawUrl, rawUrl)}${trailing}`,
  );
}

function inlineMarkdown(value: string): string {
  const links: string[] = [];
  const withLinkTokens = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const token = `@@LINK_${links.length}@@`;
    links.push(linkHtml(label, href));
    return token;
  });

  let text = autolinkBareUrls(escapeHtml(withLinkTokens));

  text = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>');

  links.forEach((link, index) => {
    text = text.replace(`@@LINK_${index}@@`, link);
  });

  return text;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  const openList = (type: 'ul' | 'ol') => {
    if (listType === type) return;
    closeList();
    listType = type;
    html.push(`<${type}>`);
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      closeList();
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      html.push(`<p><strong>${inlineMarkdown(heading[2].trim())}</strong></p>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      openList('ul');
      html.push(`<li>${inlineMarkdown(bullet[1].trim())}</li>`);
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      openList('ol');
      html.push(`<li>${inlineMarkdown(numbered[1].trim())}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  closeList();
  return html.join('\n');
}

function contactPlaceholders(profileYml: string) {
  const profile = extractApplicantProfile(profileYml);
  return {
    name: profile.fullName || profile.legalName || 'Candidate',
    location: [profile.city, profile.province].filter(Boolean).join(', ') || profile.country || '',
    email: profile.email || '',
    phone: profile.phone || '',
    linkedinUrl: displayFromUrl(profile.linkedin || ''),
    linkedinDisplay: profile.linkedin ? displayFromUrl(profile.linkedin) : '',
    portfolioUrl: profile.portfolioUrl || '',
    portfolioDisplay: displayFromUrl(profile.portfolioUrl || '', 'Portfolio'),
    githubUrl: displayFromUrl(profile.github || ''),
    githubDisplay: profile.github ? displayFromUrl(profile.github) : '',
  };
}

function replaceAll(value: string, replacements: Record<string, string>): string {
  let output = value;
  for (const [key, replacement] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, replacement);
  }
  return output;
}

function sectionFromLine(raw: string): { name: string; inlineContent: string } | null {
  let line = raw.trim();
  if (!line || /^-{3,}$/.test(line)) return null;
  line = line.replace(/^#{1,6}\s+/, '').replace(/^\*\*(.*?)\*\*$/, '$1').trim();
  const inline = line.match(/^(.+?):\s*(.+)$/);
  const candidate = inline ? inline[1].trim() : line;
  const canonical = SECTION_ALIASES[normalizeHeading(candidate)];
  if (!canonical) return null;
  return { name: canonical, inlineContent: inline?.[2]?.trim() ?? '' };
}

function splitResumeSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current = '__intro__';
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join('\n').trim();
    if (content) sections.set(normalizeHeading(current), content);
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const parsed = sectionFromLine(raw);
    if (parsed) {
      flush();
      current = parsed.name;
      buffer = parsed.inlineContent ? [parsed.inlineContent] : [];
      continue;
    }
    buffer.push(raw);
  }
  flush();

  return sections;
}

function section(sections: Map<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = sections.get(normalizeHeading(name));
    if (value) return value;
  }
  return '';
}

function stripGeneratedIntro(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .filter(line => !/^#\s+(?:Tailored\s+)?Resume/i.test(line.trim()))
    .filter(line => !/^\*\*(Generated|Application|JD keywords injected):\*\*/i.test(line.trim()))
    .join('\n')
    .trim();
}

function profileText(markdown: string, sections: Map<string, string>): string {
  const explicit = section(sections, 'Profile', 'Professional Summary', 'Summary');
  if (explicit) return summaryText(explicit);

  const intro = section(sections, '__intro__');
  if (!intro) return '';
  const cleaned = intro
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^#/.test(line))
    .filter(line => !/^-{3,}$/.test(line))
    .filter(line => !/@/.test(line))
    .filter(line => !/\b(linkedin|github|portfolio|girishbhuteja\.com)\b/i.test(line));
  return summaryText(cleaned.join('\n'));
}

function summaryText(markdown: string): string {
  return inlineMarkdown(
    markdown
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !/^-{3,}$/.test(line))
      .filter(line => !line.startsWith('- ') && !line.startsWith('* '))
      .join(' ')
      .replace(/\*\*/g, '')
      .trim(),
  );
}

function skillsTable(markdown: string): string {
  const rows = markdown
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^[-*]\s+/, ''))
    .filter(Boolean)
    .filter(line => !/^-{3,}$/.test(line))
    .map(line => {
      const cleaned = line.replace(/\*\*/g, '');
      const parts = cleaned.match(/^([^:]{2,70}):\s*(.+)$/);
      if (!parts) return `<p class="skills-line">${inlineMarkdown(line)}</p>`;
      return `<tr><td class="skill-cat">${inlineMarkdown(parts[1])}:</td><td>${inlineMarkdown(parts[2])}</td></tr>`;
    });

  if (!rows.length) return '';
  if (rows.every(row => row.startsWith('<tr>'))) {
    return `<table class="skills-table">\n${rows.join('\n')}\n</table>`;
  }
  return rows.join('\n');
}

function isDateLine(value: string): boolean {
  return /(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\b|\d{4}|present|current)/i.test(value)
    && !/^[-*]\s+/.test(value)
    && value.length <= 60;
}

function splitEntries(markdown: string): string[] {
  const entries: string[] = [];
  let buffer: string[] = [];
  let hasBullet = false;

  const flush = () => {
    const content = buffer.join('\n').trim();
    if (content) entries.push(content);
    buffer = [];
    hasBullet = false;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^-{3,}$/.test(line)) continue;

    const isBullet = /^[-*]\s+/.test(line);
    const boldStarter = /^\*\*.+\*\*/.test(line) && !isBullet;
    const plainStarterAfterBullets = hasBullet && !isBullet && !isDateLine(line);

    if (buffer.length && (boldStarter || plainStarterAfterBullets)) {
      flush();
    }

    buffer.push(raw);
    if (isBullet) hasBullet = true;
  }
  flush();

  return entries;
}

function parseEntryLines(chunk: string) {
  const lines = chunk
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^-{3,}$/.test(line));
  const bullets = lines
    .filter(line => /^[-*]\s+/.test(line))
    .map(line => line.replace(/^[-*]\s+/, '').trim());
  const headers = lines.filter(line => !/^[-*]\s+/.test(line));
  return { headers, bullets };
}

function renderBulletList(bullets: string[]): string {
  if (!bullets.length) return '';
  return `<ul>\n${bullets.map(bullet => `    <li>${inlineMarkdown(bullet)}</li>`).join('\n')}\n  </ul>`;
}

function renderProject(chunk: string): string {
  const { headers, bullets } = parseEntryLines(chunk);
  const name = headers[0] ?? '';
  const date = headers.find((line, index) => index > 0 && isDateLine(line)) ?? '';
  const title = inlineMarkdown(name);
  return `<div class="project">
  <div class="project-header">
    <div class="project-name">${title}</div>
    <div class="project-year">${inlineMarkdown(date)}</div>
  </div>
  ${renderBulletList(bullets)}
</div>`;
}

function renderEntry(chunk: string): string {
  const { headers, bullets } = parseEntryLines(chunk);
  const title = headers[0] ?? '';
  const dateIndex = headers.findIndex((line, index) => index > 0 && isDateLine(line));
  const date = dateIndex >= 0 ? headers[dateIndex] : '';
  const company = headers.find((line, index) => index > 0 && index !== dateIndex) ?? '';
  const note = headers.find((line, index) => index > 0 && index !== dateIndex && line !== company) ?? '';

  return `<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">${inlineMarkdown(stripMarkdownDecoration(title))}</span></div>
    <div class="entry-right">${inlineMarkdown(date)}</div>
  </div>
  ${company ? `<div class="entry-company">${inlineMarkdown(company)}</div>` : ''}
  ${note ? `<div class="entry-note">${inlineMarkdown(note)}</div>` : ''}
  ${renderBulletList(bullets)}
</div>`;
}

function wrapBlocks(markdown: string, className: BlockClass): string {
  return splitEntries(markdown)
    .map(chunk => className === 'project' ? renderProject(chunk) : renderEntry(chunk))
    .join('\n');
}

function certificationsLine(markdown: string): string {
  return inlineMarkdown(
    markdown
      .split(/\r?\n/)
      .map(line => line.trim().replace(/^[-*]\s+/, ''))
      .filter(Boolean)
      .filter(line => !/^-{3,}$/.test(line))
      .join(' | ')
      .replace(/^Certifications\s*(?:&|and)\s*Memberships:\s*/i, '')
      .trim(),
  );
}

function resumeHtmlFromMarkdown(markdown: string): string {
  const template = readRoot('templates/cv-template.html');
  const profileYml = readRoot('config/profile.yml');
  const contact = contactPlaceholders(profileYml);
  const cleanedMarkdown = stripGeneratedIntro(markdown);
  const sections = splitResumeSections(cleanedMarkdown);
  const certifications = section(sections, 'Certifications & Memberships', 'Certifications and Memberships', 'Certifications', 'Memberships');

  return replaceAll(template, {
    LANG: 'en',
    NAME: contact.name,
    LOCATION: contact.location,
    EMAIL: contact.email,
    PHONE: contact.phone,
    LINKEDIN_URL: contact.linkedinUrl,
    LINKEDIN_DISPLAY: contact.linkedinDisplay,
    PORTFOLIO_URL: contact.portfolioUrl,
    PORTFOLIO_DISPLAY: contact.portfolioDisplay,
    GITHUB_URL: contact.githubUrl,
    GITHUB_DISPLAY: contact.githubDisplay,
    SUMMARY_TEXT: profileText(cleanedMarkdown, sections),
    HIGHLIGHTS: markdownToHtml(section(sections, 'Highlights of Qualifications', 'Highlights', 'Qualifications')),
    SKILLS: skillsTable(section(sections, 'Technical Skills Summary', 'Technical Skills', 'Technical Summary', 'Skills')),
    EXPERIENCE: wrapBlocks(section(sections, 'Professional Experience', 'Experience', 'Work Experience'), 'entry'),
    PROJECTS: wrapBlocks(section(sections, 'Projects', 'Project Experience'), 'project'),
    EDUCATION: wrapBlocks(section(sections, 'Education'), 'entry'),
    EXTRACURRICULAR: wrapBlocks(section(sections, 'Extracurricular Activities', 'Leadership and Activities', 'Activities'), 'entry'),
    AWARDS: wrapBlocks(section(sections, 'Awards and Recognition', 'Awards & Recognition', 'Awards'), 'entry'),
    CERTIFICATIONS: certificationsLine(certifications),
  });
}

const COVER_LETTER_METADATA_LINE = /^\s*(?:\*\*)?\s*(?:Date|Application|Job\s*(?:ID|Number|No\.?|Ref(?:erence)?|Code)|Req(?:uisition)?\s*(?:ID|Number|No\.?|#)?|Reference|Ref)\s*(?:\*\*)?\s*:/i;

function stripCoverLetterMetadata(markdown: string): string {
  const afterRule = markdown.includes('\n---\n') ? markdown.split('\n---\n').slice(1).join('\n---\n') : markdown;
  return afterRule
    .split(/\r?\n/)
    .filter(line => !/^#\s+/.test(line.trim()))
    .filter(line => !COVER_LETTER_METADATA_LINE.test(line.trim()))
    .join('\n')
    .trim();
}

function manualCoverLetterJobReference(markdown: string): string {
  const line = markdown
    .split(/\r?\n/)
    .map(value => value.trim())
    .find(value => /^\s*(?:\*\*)?\s*(?:Job\s*(?:ID|Number|No\.?|Ref(?:erence)?|Code)|Req(?:uisition)?\s*(?:ID|Number|No\.?|#)?|Reference|Ref)\s*(?:\*\*)?\s*:/i.test(value));
  if (!line) return '';

  const value = line
    .replace(/^\s*(?:\*\*)?\s*(?:Job\s*(?:ID|Number|No\.?|Ref(?:erence)?|Code)|Req(?:uisition)?\s*(?:ID|Number|No\.?|#)?|Reference|Ref)\s*(?:\*\*)?\s*:/i, '')
    .replace(/\*\*/g, '')
    .trim();
  return formatJobReferenceValue(value);
}

function coverLetterHtmlFromMarkdown(markdown: string, app: NonNullable<ReturnType<typeof getApplication>>): string {
  const template = readRoot('templates/cover-letter-template.html');
  const profileYml = readRoot('config/profile.yml');
  const contact = contactPlaceholders(profileYml);
  const body = markdownToHtml(stripCoverLetterMetadata(markdown));
  const today = formatCoverLetterDate();

  return replaceAll(template, {
    LANG: 'en',
    PAGE_WIDTH: '8.5in',
    NAME: contact.name,
    LOCATION: contact.location,
    EMAIL: contact.email,
    PHONE: contact.phone,
    LINKEDIN_URL: contact.linkedinUrl,
    LINKEDIN_DISPLAY: contact.linkedinDisplay,
    PORTFOLIO_URL: contact.portfolioUrl,
    PORTFOLIO_DISPLAY: contact.portfolioDisplay,
    GITHUB_URL: contact.githubUrl,
    GITHUB_DISPLAY: contact.githubDisplay,
    DATE: today,
    HIRING_MANAGER: 'Hiring Manager',
    RECIPIENT_TITLE_LINE: '',
    COMPANY: app.company,
    COMPANY_ADDRESS: app.location ?? '',
    JOB_TITLE: app.jobTitle,
    JOB_REF: manualCoverLetterJobReference(markdown) || formatJobReferenceForSubject(app.jobDescription),
    SALUTATION: 'Hiring Team',
    BODY: body,
  });
}

async function generatePdf(htmlPath: string, pdfPath: string): Promise<number | null> {
  const script = path.join(/*turbopackIgnore: true*/ ROOT, 'generate-pdf.mjs');
  const { stdout, stderr } = await execFileAsync(process.execPath, [script, htmlPath, pdfPath, '--format=letter'], {
    cwd: ROOT,
    timeout: 60000,
  });
  const output = `${stdout}\n${stderr}`;
  const pageCount = Number(output.match(/Pages:\s*(\d+)/i)?.[1] ?? NaN);
  return Number.isFinite(pageCount) ? pageCount : null;
}

export async function refreshDocumentPdfIfStale(id: string, type: DocumentType): Promise<RenderResult> {
  const app = getApplication(id);
  if (!app) throw new Error(`Application not found: ${id}`);

  const folderPath = path.join(/*turbopackIgnore: true*/ ROOT, app.applicationFolder);
  const sourceName = type === 'resume' ? 'resume.md' : 'cover-letter.md';
  const htmlName = type === 'resume' ? 'resume.html' : 'cover-letter.html';
  const pdfName = type === 'resume' ? 'resume.pdf' : 'cover-letter.pdf';
  const sourcePath = path.join(folderPath, sourceName);
  const htmlPath = path.join(folderPath, htmlName);
  const pdfPath = path.join(folderPath, pdfName);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`${sourceName} not found - generate documents first`);
  }

  const pdfExists = fs.existsSync(pdfPath);
  const shouldUpdateMetadata = !pdfExists || fs.statSync(sourcePath).mtimeMs > fs.statSync(pdfPath).mtimeMs;
  const markdown = fs.readFileSync(sourcePath, 'utf-8');
  const html = type === 'resume'
    ? resumeHtmlFromMarkdown(markdown)
    : coverLetterHtmlFromMarkdown(markdown, app);

  fs.writeFileSync(htmlPath, html);
  const pageCount = await generatePdf(htmlPath, pdfPath);

  if (shouldUpdateMetadata) {
    const now = new Date().toISOString();
    const relativePath = `${app.applicationFolder}/${pdfName}`;
    if (type === 'resume') {
      updateApplicationFields(id, {
        resumePath: relativePath,
        resumeGeneratedAt: now,
        lastDocumentGeneratedAt: now,
      });
    } else {
      updateApplicationFields(id, {
        coverLetterPath: relativePath,
        coverLetterGeneratedAt: now,
        lastDocumentGeneratedAt: now,
      });
    }
  }

  return { refreshed: true, htmlPath, pdfPath, pageCount };
}