#!/usr/bin/env node
// docs:qa — verifies the deterministic resume/cover-letter content layer
// (builder, verifier, overflow trimmer, cover-letter checks) without calling Gemini.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeResumeContent,
  buildResumeMarkdown,
  verifyResumeContent,
  trimResumeForOverflow,
  varyLeadingVerbs,
  buildCoverLetterChecks,
  countProjectBulletItems,
  PROJECT_CATALOG,
  EXPERIENCE_CATALOG,
} from './frontend/lib/document-content-core.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(ROOT, 'tests', 'document-fixtures');

let failures = 0;
function check(name, condition, detail = '') {
  const pass = Boolean(condition);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${!pass && detail ? ` — ${detail}` : ''}`);
}

function loadFixture(file) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf-8'));
}

// ── 1. Good content: builder round-trip + clean verification ────────────────

const good = loadFixture('good-resume-content.json');
const goodContent = normalizeResumeContent(good.resume);
const markdown = buildResumeMarkdown(goodContent, { name: 'Girish Bhuteja' });

const REQUIRED_HEADINGS = [
  '## Profile',
  '## Highlights of Qualifications',
  '## Technical Skills Summary',
  '## Professional Experience',
  '## Projects',
  '## Education',
  '## Extracurricular Activities',
  '## Awards and Recognition',
  '## Certifications & Memberships',
];
let previousIndex = -1;
let headingsOrdered = true;
for (const heading of REQUIRED_HEADINGS) {
  const index = markdown.indexOf(heading);
  if (index === -1 || index < previousIndex) headingsOrdered = false;
  previousIndex = index;
}
check('markdown contains all 9 sections in template order', headingsOrdered);

check('markdown includes fixed OER header + italic context note',
  markdown.includes(`**${EXPERIENCE_CATALOG.oer.title}**`)
  && markdown.includes(EXPERIENCE_CATALOG.oer.company)
  && markdown.includes(`*${EXPERIENCE_CATALOG.oer.note}*`));

check('markdown includes fixed project name, URL link, and date from catalog',
  markdown.includes(`**${PROJECT_CATALOG.zonalyze.name}**`)
  && markdown.includes('[github.com/Girish0744/Zonalyze](https://github.com/Girish0744/Zonalyze)')
  && markdown.includes(PROJECT_CATALOG.zonalyze.dateRange));

check('markdown includes fixed education, awards, and certifications facts',
  markdown.includes('GPA: 3.74/4.00; expected graduation August 2026')
  && markdown.includes('**Narhari Sharma Memorial Award** | Conestoga College')
  && markdown.includes('Java SE, Oracle, 2024'));

const bulletLines = markdown.split('\n').filter(line => line.startsWith('- '));
check('no bullet ends with a period and no em dashes anywhere',
  bulletLines.every(line => !line.endsWith('.')) && !markdown.includes('—'),
  bulletLines.filter(line => line.endsWith('.')).slice(0, 2).join(' | '));

const experienceSection = markdown.split('## Professional Experience')[1].split('## Projects')[0];
const projectSection = markdown.split('## Projects')[1].split('## Education')[0];
check('experience section has 2 bold entry headers, projects has 3',
  (experienceSection.match(/^\*\*/gm) ?? []).length === 2
  && (projectSection.match(/^\*\*/gm) ?? []).length === 3);

const goodResult = verifyResumeContent(goodContent, good.analysis);
const goodFixIssues = goodResult.issues.filter(issue => issue.severity === 'fix');
check('good content produces zero fix-severity issues', goodFixIssues.length === 0,
  goodFixIssues.map(issue => issue.code).join(', '));

const uncovered = goodResult.keywordCoverage.filter(entry => !entry.present);
check('keyword coverage matches all must-have keywords (incl. CI/CD and Node.js normalization)',
  goodResult.keywordCoverage.length === good.analysis.mustHaveKeywords.length && uncovered.length === 0,
  `uncovered: ${uncovered.map(entry => entry.keyword).join(', ')}`);

// ── 2. Planted violations are each caught ────────────────────────────────────

const bad = loadFixture('violations-resume-content.json');
const badContent = normalizeResumeContent(bad.resume);
const badResult = verifyResumeContent(badContent, bad.analysis);
const badCodes = new Set(badResult.issues.map(issue => issue.code));
for (const expectedCode of bad.expectedIssueCodes) {
  check(`violation detected: ${expectedCode}`, badCodes.has(expectedCode),
    `got: ${[...badCodes].join(', ')}`);
}
check('unknown project/experience keys are dropped by normalization',
  badContent.projects.length === 1 && badContent.experience.length === 1);

// ── 3. Overflow trim priority order ──────────────────────────────────────────

let trimContent = normalizeResumeContent({
  ...good.resume,
  projects: good.resume.projects.map((project, index) => index === 0
    ? { ...project, bullets: [...project.bullets, 'Extra third content bullet for density testing purposes on page two'] }
    : project),
  experience: good.resume.experience.map(entry => entry.key === 'oer'
    ? { ...entry, bullets: [...entry.bullets, 'Third OER bullet kept short for page one density'] }
    : entry),
  extracurricular: [...good.resume.extracurricular, { key: 'gdg', bullet: 'Facilitated technical workshops and coordinated event logistics' }],
});

const step1 = trimResumeForOverflow(trimContent);
check('trim step 1 drops the 3rd extracurricular first', /extracurricular/.test(step1.action ?? ''), step1.action ?? 'null');
const step2 = trimResumeForOverflow(step1.content);
check('trim step 2 trims the fattest project bullet', /project/.test(step2.action ?? ''), step2.action ?? 'null');
const step3 = trimResumeForOverflow(step2.content);
check('trim step 3 drops the 3rd OER bullet', /OER/.test(step3.action ?? ''), step3.action ?? 'null');
check('project bullet accounting matches builder output',
  countProjectBulletItems(step2.content) === countProjectBulletItems(step1.content) - 1);

// ── 4. Leading-verb variety pass ─────────────────────────────────────────────

const verbDupContent = normalizeResumeContent({
  ...good.resume,
  highlights: [
    'Built five things for the first highlight of the page',
    'Built five more things for the second highlight of the page',
    'Completed 2 co-op work terms at Conestoga College with strong reviews',
    'Deployed 8+ full-stack projects using React and Docker across GitHub',
    'Narhari Sharma Memorial Award recipient coordinating programs for 100+ students',
  ],
  projects: good.resume.projects.map((project, index) => index === 0
    ? { ...project, bullets: ['Engineered the first platform module for live updates', 'Engineered the second platform module for data processing'] }
    : project),
});
const verbPass = varyLeadingVerbs(verbDupContent);
const verbIssues = verifyResumeContent(verbPass.content, good.analysis).issues
  .filter(issue => issue.code === 'duplicate-lead-verb');
check('varyLeadingVerbs removes all duplicate-lead-verb warnings', verbIssues.length === 0,
  verbIssues.map(issue => issue.message).join(' | '));
check('verb pass keeps first occurrence and only changes the lead word',
  verbPass.content.highlights[0].startsWith('Built five things')
  && !verbPass.content.highlights[1].startsWith('Built')
  && verbPass.content.highlights[1].endsWith('five more things for the second highlight of the page')
  && verbPass.content.projects[0].bullets[0].startsWith('Engineered')
  && !verbPass.content.projects[0].bullets[1].startsWith('Engineered'),
  JSON.stringify(verbPass.changes));
check('verb pass reports its changes', verbPass.changes.length >= 2, JSON.stringify(verbPass.changes));
const noDupResult = verifyResumeContent(varyLeadingVerbs(normalizeResumeContent(good.resume)).content, good.analysis);
check('verb pass leaves the good fixture with zero duplicate-lead-verb warnings too',
  !noDupResult.issues.some(issue => issue.code === 'duplicate-lead-verb'));

// ── 5. Cover letter checks ───────────────────────────────────────────────────

const letters = loadFixture('cover-letters.json');
const contactOptions = { email: letters.email, phone: letters.phone };

const goodLetterIssues = buildCoverLetterChecks(letters.good, contactOptions);
const goodLetterFixes = goodLetterIssues.filter(issue => issue.severity === 'fix');
check('good cover letter passes all fix-severity checks', goodLetterFixes.length === 0,
  goodLetterFixes.map(issue => issue.code).join(', '));

const sqlOverlapLetter = [
  'The role stood out because it matches the systems work I already do.',
  'While developing a hospital management system, I architected a backend using C# and SQL Server, ensuring data integrity through 85+ unit tests before every release cycle went out.',
  `That habit of verifying before shipping is what I would bring to the team. I can be reached at ${letters.email} or ${letters.phone}.`,
].join('\n\n');
check('overlapping tech names (SQL within SQL Server) count once, not as tech-dump',
  !buildCoverLetterChecks(sqlOverlapLetter, contactOptions).some(issue => issue.code === 'tech-dump'));

const javaContent = normalizeResumeContent({ ...good.resume });
const javaCoverage = verifyResumeContent(javaContent, { mustHaveKeywords: ['Java'] }).keywordCoverage;
check('"Java" keyword does not false-match inside "JavaScript"',
  javaCoverage.length === 1 && javaCoverage[0].present === false);

const badLetterIssues = buildCoverLetterChecks(letters.bad, contactOptions);
const badLetterCodes = new Set(badLetterIssues.map(issue => issue.code));
for (const expectedCode of letters.badExpectedCodes) {
  check(`cover letter violation detected: ${expectedCode}`, badLetterCodes.has(expectedCode),
    `got: ${[...badLetterCodes].join(', ')}`);
}

// ── Result ───────────────────────────────────────────────────────────────────

console.log(failures === 0 ? '\nAll document-content checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
