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
  expandResumeForUnderfill,
  varyLeadingVerbs,
  buildCoverLetterChecks,
  countProjectBulletItems,
  PROJECT_CATALOG,
  EXPERIENCE_CATALOG,
  RESUME_FILL_TARGETS,
  dateRangeSortKey,
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
  && markdown.includes('AI Agents: Intensive Vibe Coding, Google & Kaggle'));

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

// Skills density: a visibly sparse row is a hard failure; a 5-item
// non-Databases row is a warning; the 5-item Databases row is exempt.
const sparseSkills = normalizeResumeContent({
  ...good.resume,
  skills: good.resume.skills.map((row, index) => index === 4
    ? { ...row, items: row.items.slice(0, 3) }
    : row),
});
const sparseIssues = verifyResumeContent(sparseSkills, good.analysis).issues
  .filter(issue => issue.code === 'skills-row-sparse');
check('a 3-item skills row is a fix-severity density violation',
  sparseIssues.some(issue => issue.severity === 'fix'),
  JSON.stringify(sparseIssues));
const goodDensityIssues = verifyResumeContent(goodContent, good.analysis).issues
  .filter(issue => issue.code === 'skills-row-sparse');
check('the 5-item Databases row never triggers a density issue',
  !goodDensityIssues.some(issue => /database/i.test(issue.message)),
  JSON.stringify(goodDensityIssues));

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

// ── 3.5 Under-fill expansion (reserve promotion) ─────────────────────────────

const RESERVE_OER = 'Automated content publishing workflows with Power Automate reducing manual steps for 1,000+ students across three programs';
const RESERVE_PROJECT_1 = 'Implemented role-based access control across the API layer covering three user tiers with integration tests';
const RESERVE_PROJECT_2 = 'Containerised the full stack with Docker Compose enabling one-command local setup for reviewers';
const RESERVE_DIRTY = 'I am passionate about building innovative solutions with Kubernetes';

const RESERVE_PROFILE = 'Comfortable working across accessibility standards and iterative delivery workflows in cross-functional academic teams';

const reserveContent = normalizeResumeContent({
  ...good.resume,
  educationCoursework: good.resume.educationCoursework.slice(0, 4),
  reserveProfileSentence: RESERVE_PROFILE,
  experience: good.resume.experience.map(entry => entry.key === 'oer'
    ? { ...entry, reserveBullets: [RESERVE_OER] }
    : entry),
  projects: good.resume.projects.map((project, index) => index === 0
    ? { ...project, reserveBullets: [RESERVE_DIRTY, RESERVE_PROJECT_1, RESERVE_PROJECT_2] }
    : project),
  reserveExtracurricular: [
    { key: 'gdg', bullet: 'Co-organized two community study sessions on web performance for 40+ local developers' },
    { key: 'it-club', bullet: 'Duplicate of a selected entry that must be dropped' },
  ],
});

check('normalization captures reserves and drops duplicates/overflow',
  reserveContent.reserve.experience.oer?.length === 1
  && reserveContent.reserve.projects[good.resume.projects[0].key]?.length === 2
  && reserveContent.reserve.extracurricular.length === 1
  && reserveContent.reserve.extracurricular[0].key === 'gdg',
  JSON.stringify(reserveContent.reserve));

check('builder markdown is identical with and without reserves (reserve is never rendered)',
  buildResumeMarkdown(reserveContent, { name: 'Girish Bhuteja' })
    === buildResumeMarkdown(normalizeResumeContent({ ...good.resume, educationCoursework: good.resume.educationCoursework.slice(0, 4) }), { name: 'Girish Bhuteja' }));

const p1Step = expandResumeForUnderfill(reserveContent, 'page1');
check('page1 expansion promotes the reserve OER bullet',
  /experience "oer"/.test(p1Step.action ?? '')
  && p1Step.content.experience.find(entry => entry.key === 'oer').bullets.includes(RESERVE_OER),
  p1Step.action ?? 'null');
const p1Step2 = expandResumeForUnderfill(p1Step.content, 'page1');
check('page1 expansion then promotes the reserve 4th profile sentence',
  /profile sentence/.test(p1Step2.action ?? '')
  && p1Step2.content.profileSentences.length === 4
  && p1Step2.content.profileSentences[3].startsWith('Comfortable working'),
  p1Step2.action ?? 'null');
check('page1 expansion with an exhausted reserve returns null',
  expandResumeForUnderfill(p1Step2.content, 'page1').action === null);
check('a 4-sentence profile still verifies clean',
  !verifyResumeContent(p1Step2.content, good.analysis).issues.some(issue => issue.code === 'profile-sentence-count'));

const p2Step1 = expandResumeForUnderfill(reserveContent, 'page2');
check('page2 expansion step 1 skips the dirty reserve bullet and promotes the clean one',
  /project/.test(p2Step1.action ?? '')
  && p2Step1.content.projects[0].bullets.includes(RESERVE_PROJECT_1)
  && !p2Step1.content.projects[0].bullets.includes(RESERVE_DIRTY),
  p2Step1.action ?? 'null');

const p2Step2 = expandResumeForUnderfill(p2Step1.content, 'page2');
check('page2 expansion step 2 adds the reserve extracurricular entry',
  /extracurricular entry "gdg"/.test(p2Step2.action ?? '')
  && p2Step2.content.extracurricular.length === 3,
  p2Step2.action ?? 'null');

const p2Step3 = expandResumeForUnderfill(p2Step2.content, 'page2');
check('page2 expansion step 3 adds a 5th coursework subject from the fixed catalog',
  /coursework/.test(p2Step3.action ?? '')
  && p2Step3.content.educationCoursework.length === 5,
  p2Step3.action ?? 'null');

const p2Step4 = expandResumeForUnderfill(p2Step3.content, 'page2');
check('page2 expansion step 4 deep-fills another project bullet',
  /project "zonalyze"/.test(p2Step4.action ?? '')
  && p2Step4.content.projects[0].bullets.includes(RESERVE_PROJECT_2)
  && p2Step4.content.projects[0].bullets.length === 4,
  p2Step4.action ?? 'null');
check('page2 expansion with everything exhausted returns null',
  expandResumeForUnderfill(p2Step4.content, 'page2').action === null);

const allPromoted = [
  ...p2Step4.content.projects.flatMap(project => project.bullets),
  ...p1Step.content.experience.flatMap(entry => entry.bullets),
];
check('expansion only ever promotes reserve or catalog content (no invented text)',
  allPromoted.every(bullet =>
    good.resume.projects.some(project => project.bullets.includes(bullet))
    || good.resume.experience.some(entry => entry.bullets.includes(bullet))
    || [RESERVE_OER, RESERVE_PROJECT_1, RESERVE_PROJECT_2].includes(bullet)));

check('expansion does not mutate its input content',
  reserveContent.projects[0].bullets.length === 2
  && reserveContent.extracurricular.length === 2
  && reserveContent.reserve.projects[good.resume.projects[0].key].length === 2);

check('content without reserves expands only via coursework then returns null', (() => {
  const bare = normalizeResumeContent({ ...good.resume, educationCoursework: good.resume.educationCoursework.slice(0, 4) });
  const step = expandResumeForUnderfill(bare, 'page2');
  if (!/coursework/.test(step.action ?? '')) return false;
  return expandResumeForUnderfill(step.content, 'page2').action === null
    && expandResumeForUnderfill(bare, 'page1').action === null;
})());

check('fill targets are sane fractions',
  RESUME_FILL_TARGETS.page1Min > 0.5 && RESUME_FILL_TARGETS.page1Min < 1
  && RESUME_FILL_TARGETS.page2Min > 0.5 && RESUME_FILL_TARGETS.page2Min < 1);

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

// ── Reverse-chronological ordering ───────────────────────────────────────────
// Selection stays relevance-driven; the ORDER must always be newest-first.

const scrambled = normalizeResumeContent({
  ...good.resume,
  projects: [
    { key: 'dineease', stack: 'C#', bullets: ['Built the ordering flow for the restaurant system.'] },
    { key: 'careerops', stack: 'Next.js', bullets: ['Built the document generation pipeline end to end.'] },
    { key: 'meditwin', stack: 'Python', bullets: ['Built the health companion assistant interface.'] },
  ],
});
const projectOrder = scrambled.projects.map(project => project.key);
check('projects render newest-first regardless of relevance order',
  JSON.stringify(projectOrder) === JSON.stringify(['careerops', 'meditwin', 'dineease']),
  `got: ${projectOrder.join(', ')}`);

const projectDates = scrambled.projects.map(project => PROJECT_CATALOG[project.key].dateRange);
check('project date ranges descend',
  JSON.stringify(projectDates) === JSON.stringify(['Apr 2026 - Present', 'May 2025 - Aug 2025', 'Sept 2024 - Dec 2024']),
  `got: ${projectDates.join(' | ')}`);

check('ongoing entries sort above finished ones',
  dateRangeSortKey('Jan 2026 - Present').end > dateRangeSortKey('Apr 2026').end);
check('two ongoing entries order by later start date',
  dateRangeSortKey('Apr 2026 - Present').start > dateRangeSortKey('Jan 2026 - Present').start);
check('single-month range parses (Apr 2026)',
  dateRangeSortKey('Apr 2026').start === dateRangeSortKey('Apr 2026').end);
check('"Sept" abbreviation parses as September',
  dateRangeSortKey('Sept 2024 - Dec 2024').end > dateRangeSortKey('Sept 2024 - Dec 2024').start);

// ── Result ───────────────────────────────────────────────────────────────────

console.log(failures === 0 ? '\nAll document-content checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
