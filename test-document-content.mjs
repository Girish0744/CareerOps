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
  BANNED_COVER_LETTER_PHRASES,
  countProjectBulletItems,
  PROJECT_CATALOG,
  EXPERIENCE_CATALOG,
  EXTRACURRICULAR_CATALOG,
  RESUME_FILL_TARGETS,
  dateRangeSortKey,
  sortChronologically,
  applyLengthBudget,
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

// ── Experience selection + bullet quality ────────────────────────────────────

// A third role pushed Experience to page 2 and Projects to page 3; the overflow
// trimmer cannot recover from that because it only cuts bullets, never entries.
const twoBullets = key => [
  `${key} bullet one serving 1,000+ users across three academic programs each term`,
  `${key} bullet two improving processing efficiency by 20% across the department`,
];
const threeRoles = normalizeResumeContent({
  ...good.resume,
  experience: [
    { key: 'oer', bullets: twoBullets('oer') },
    { key: 'olive-branch', bullets: twoBullets('ob') },
    { key: 'home-depot', bullets: twoBullets('hd') },
  ],
});
check('three roles are capped to two',
  threeRoles.experience.length === 2, threeRoles.experience.map(e => e.key).join(', '));

const supportRanked = normalizeResumeContent({
  ...good.resume,
  experience: [
    { key: 'oer', bullets: twoBullets('oer') },
    { key: 'home-depot', bullets: twoBullets('hd') },
    { key: 'olive-branch', bullets: twoBullets('ob') },
  ],
});
check('the JD ranking decides which optional role survives, not the date order',
  supportRanked.experience.some(e => e.key === 'home-depot')
  && !supportRanked.experience.some(e => e.key === 'olive-branch'),
  supportRanked.experience.map(e => e.key).join(', '));

check('a single role is flagged so the repair pass adds the second',
  verifyResumeContent(normalizeResumeContent({
    ...good.resume,
    experience: [{ key: 'oer', bullets: twoBullets('oer') }],
  }), {}).issues.some(issue => issue.code === 'experience-count'));

check('"Early-career" in the profile is rejected',
  verifyResumeContent(normalizeResumeContent({
    ...good.resume,
    profileSentences: ['Early-career technologist with applied experience in technical support.', ...good.resume.profileSentences.slice(1)],
  }), {}).issues.some(issue => issue.code === 'ai-filler'));

check('Home Depot is selectable but not forced',
  EXPERIENCE_CATALOG['home-depot'] && EXPERIENCE_CATALOG['home-depot'].required === false);
check('omitting an optional role is not a missing-experience error',
  !verifyResumeContent(normalizeResumeContent(good.resume), {}).issues
    .some(issue => issue.code === 'experience-missing'));

// oer plus home-depot: the client-facing pairing, olive-branch swapped OUT.
const withHomeDepot = normalizeResumeContent({
  ...good.resume,
  experience: [
    good.resume.experience.find(entry => entry.key === 'oer'),
    {
      key: 'home-depot',
      bullets: [
        'Trained 10+ associates on equipment safety protocols while maintaining a 100% safety record across shifts',
        'Boosted order processing efficiency 20% by optimizing inventory workflows using My Toolbelt and Article Lookup',
      ],
    },
  ],
});

check('omitting the required oer role is still caught',
  verifyResumeContent(normalizeResumeContent({
    ...good.resume,
    experience: [{ key: 'home-depot', bullets: twoBullets('hd') }],
  }), {}).issues.some(issue => issue.code === 'experience-missing'));
check('Home Depot renders when selected for a client-facing role',
  withHomeDepot.experience.some(entry => entry.key === 'home-depot')
  && buildResumeMarkdown(withHomeDepot, { name: 'Girish Bhuteja' }).includes('The Home Depot'));

const unquantified = normalizeResumeContent({
  ...good.resume,
  experience: good.resume.experience.map(entry => ({
    ...entry,
    bullets: [
      'Supported users with various platform issues and provided guidance on resolution steps',
      'Maintained documentation and improved internal processes for the team consistently',
    ],
  })),
});
check('a role with no quantified bullet is rejected',
  verifyResumeContent(unquantified, {}).issues.some(issue => issue.code === 'experience-unquantified'));
check('quantified bullets pass',
  !verifyResumeContent(withHomeDepot, {}).issues.some(issue => issue.code === 'experience-unquantified'));

const firstPersonResume = normalizeResumeContent({
  ...good.resume,
  experience: good.resume.experience.map((entry, index) => index === 0
    ? { ...entry, bullets: ['I automated the publishing workflow for 1,000+ students', ...entry.bullets.slice(1)] }
    : entry),
});
check('first-person wording in a bullet is rejected (resume stays third person)',
  verifyResumeContent(firstPersonResume, {}).issues.some(issue => issue.code === 'first-person'));

const repeatedVerbs = normalizeResumeContent({
  ...good.resume,
  experience: good.resume.experience.map(entry => ({
    ...entry,
    bullets: [
      'Built accessible templates for 1,000+ students across three programs',
      'Built automated workflows reducing manual processing time by 20% each week',
    ],
  })),
});
const variedVerbs = varyLeadingVerbs(repeatedVerbs).content;
const leadVerbs = variedVerbs.experience.flatMap(entry => entry.bullets.map(bullet => bullet.split(' ')[0]));
check('repeated leading verbs are automatically varied',
  new Set(leadVerbs).size === leadVerbs.length, leadVerbs.join(', '));

// ── Cover letter human voice ─────────────────────────────────────────────────
// These are 'fix' severity so the repair pass actually rewrites them; as
// warnings they were reported on every generation and never acted on.

const longSentenceLetter = [
  'The role caught my attention because the team owns the data pipeline problem that I have spent the better part of this year working through in my own projects.',
  'I have built and shipped several systems where the hardest part was never the model itself but the messy work of getting reliable data into it consistently.',
  'That experience taught me that careful schema design and honest validation matter far more than clever algorithms when the underlying inputs cannot be trusted.',
  "I've seen this pattern repeat across every project I have taken from an idea through to something that real people actually depend on daily.",
  'I can be reached at test@example.com or 555-0100.',
].join(' ');

const longIssues = buildCoverLetterChecks(longSentenceLetter, { email: 'test@example.com', phone: '555-0100' });
const longCodes = new Set(longIssues.map(issue => issue.code));
check('all-long-sentence letter is flagged', longCodes.has('uniform-sentences') || longCodes.has('long-sentences'),
  `got: ${[...longCodes].join(', ')}`);
check('sentence-rhythm issues are fix severity so repair runs',
  longIssues.filter(issue => ['uniform-sentences', 'long-sentences'].includes(issue.code))
    .every(issue => issue.severity === 'fix'));

const variedLetter = [
  'Your team owns the data pipeline that feeds every downstream report.',
  'That problem is familiar.',
  "I've built systems where the model was easy and the inputs were the real work.",
  'Schema design mattered more than the algorithm.',
  "I'd bring that same instinct here, and I think it fits what this role needs.",
  'I can be reached at test@example.com or 555-0100.',
].join(' ');
check('varied-rhythm letter passes the sentence checks',
  !buildCoverLetterChecks(variedLetter, { email: 'test@example.com', phone: '555-0100' })
    .some(issue => ['uniform-sentences', 'long-sentences'].includes(issue.code)));

for (const filler of ['Furthermore', 'Moreover', 'a testament to', 'seamless', 'a wealth of']) {
  const letter = `${variedLetter} ${filler} the work continues.`;
  check(`formal filler rejected: "${filler}"`,
    buildCoverLetterChecks(letter, { email: 'test@example.com', phone: '555-0100' })
      .some(issue => issue.code === 'banned-phrase'));
}

// ── Real generated letter that passed the old checks but read as AI ──────────
// From a real TMX Group generation: rhythm was fine, content was not.

const tmxLetter = [
  "Maintaining the stability of mission-critical systems requires technical precision and clear communication under pressure. As a Graduate Support Analyst at TMX Group, I'd bring this mindset to your frontline team. I'm ready to ensure your capital market environments remain resilient.",
  "My work at Conestoga College taught me to translate complex requirements into accessible solutions for over 1,000 students. Whether I was automating workflows or troubleshooting accessibility issues, I learned that effective support is about more than just fixing a bug. It's about providing proactive guidance to the user.",
  'I am drawn to TMX Group because of the intersection of global economic impact and the need for reliable infrastructure. I can be reached at test@example.com or 555-0100.',
].join('\n\n');
const tmxCodes = new Set(buildCoverLetterChecks(tmxLetter, { email: 'test@example.com', phone: '555-0100' })
  .filter(issue => issue.severity === 'fix').map(issue => issue.code));

check('generic industry-truism opener is caught', tmxCodes.has('role-description-opener'));
check('split "more than just X. It is about Y" is caught', tmxCodes.has('not-just-construction'));
check('filler buzzwords are caught', tmxCodes.has('banned-phrase'));
check('under-length letter is fix severity so repair expands it', tmxCodes.has('word-count'));

check('every banned phrase is listed, not only the first',
  buildCoverLetterChecks(tmxLetter, { email: 'test@example.com', phone: '555-0100' })
    .some(issue => issue.code === 'banned-phrase' && /mission-critical/.test(issue.message) && /under pressure|I am drawn to/.test(issue.message)));

// A concrete hook written in the third person with no proper noun is GOOD;
// the old generic-opener heuristic flagged it, so it was removed.
const concreteHookLetter = [
  'A single configuration error in an open education platform can disrupt learning for an entire department. During my time supporting technology at Conestoga College, I managed accessible templates for over 1,000 students.',
  "I built a telemetry transfer system on a custom binary protocol and a five-state machine. The protocol was the hard part. I'd learned that defensive handling prevents recurring failures.",
  'I can be reached at test@example.com or 555-0100.',
].join('\n\n');
check('a concrete third-person hook is not flagged as a bad opener',
  !buildCoverLetterChecks(concreteHookLetter, { email: 'test@example.com', phone: '555-0100' })
    .some(issue => ['generic-opener', 'role-description-opener'].includes(issue.code)));

// research-unused: enforce that the injected company research is actually used.
const researchText = [
  '# Company research: TMX Group', '',
  '*   Operates the Toronto Stock Exchange and TSX Venture Exchange.',
  '*   Runs the Montreal Exchange for derivatives trading.',
  '*   Provides clearing through the Canadian Depository for Securities.',
].join('\n');
const researchOpts = { email: 'test@example.com', phone: '555-0100', companyResearch: researchText, company: 'TMX Group' };

check('letter ignoring the company research is flagged',
  buildCoverLetterChecks(concreteHookLetter, researchOpts).some(issue => issue.code === 'research-unused'));
check('letter naming a researched fact is not flagged',
  !buildCoverLetterChecks(
    concreteHookLetter.replace('an open education platform', 'a system like the Toronto Stock Exchange'),
    researchOpts,
  ).some(issue => issue.code === 'research-unused'));
check('research-unused stays silent when no research was supplied',
  !buildCoverLetterChecks(concreteHookLetter, { email: 'test@example.com', phone: '555-0100' })
    .some(issue => issue.code === 'research-unused'));
// Application-statement phrases are cover-letter-only: an apply-by-email
// message legitimately says the sender is applying, so the lists must stay split.
check('cover letters reject application boilerplate',
  buildCoverLetterChecks(
    'I am applying for the Graduate Support Analyst role because I understand things. I can be reached at test@example.com or 555-0100.',
    { email: 'test@example.com', phone: '555-0100' },
  ).some(issue => issue.code === 'banned-phrase'));
check('application-statement phrases stay OUT of the shared list (apply-email needs them)',
  !BANNED_COVER_LETTER_PHRASES.some(phrase => /applying for the|would like to apply|writing to express/i.test(phrase)));

// The recruiter reads resume + letter together: the letter may only build on
// experience the tailored resume actually shows.
const resumeWithoutHomeDepot = [
  '## Professional Experience',
  '**Open Education Technology Project Assistant**', 'Conestoga College, Waterloo, ON',
  '## Extracurricular Activities',
  '**Director, Student Success Team**, HackTheBrain, Toronto Tech Week',
].join('\n');
const offResumeLetter = 'My experience at The Home Depot as an Associate Trainer taught me to triage. I can be reached at test@example.com or 555-0100.';
const onResumeLetter = 'My work with HackTheBrain participant operations taught me to triage. I can be reached at test@example.com or 555-0100.';

check('letter citing an employer missing from the resume is rejected',
  buildCoverLetterChecks(offResumeLetter, { email: 'test@example.com', phone: '555-0100', resumeMarkdown: resumeWithoutHomeDepot })
    .some(issue => issue.code === 'evidence-not-on-resume'));
check('letter citing experience that IS on the resume passes',
  !buildCoverLetterChecks(onResumeLetter, { email: 'test@example.com', phone: '555-0100', resumeMarkdown: resumeWithoutHomeDepot })
    .some(issue => issue.code === 'evidence-not-on-resume'));
check('no resume supplied means no off-resume complaint (cover-letter-only runs)',
  !buildCoverLetterChecks(offResumeLetter, { email: 'test@example.com', phone: '555-0100' })
    .some(issue => issue.code === 'evidence-not-on-resume'));

check('empty filler short sentences are rejected',
  buildCoverLetterChecks(`${concreteHookLetter} It's critical work.`, { email: 'test@example.com', phone: '555-0100' })
    .some(issue => issue.code === 'banned-phrase'));

// Second real generation: naming the company inside a role-definition opener
// does not make it a hook, and curly apostrophes are still contractions.
const tmxLetter2 = [
  'Managing the high-frequency data flows that power TMX Group’s markets requires a support analyst who treats every technical hiccup as a high-stakes puzzle. I’m ready to bring my background in building reliable systems to your Application Support team.',
  'While supporting over 1,000 students and faculty, I managed platform requests and automated repetitive workflows. I also built a C# hospital management system on a TCP client-server architecture, which meant rigorous unit testing. It’s critical work.',
  'Whether I’m troubleshooting API integrations or managing configuration changes, I see each issue through to a fix. I can be reached at test@example.com or 555-0100.',
].join('\n\n');
const tmx2 = buildCoverLetterChecks(tmxLetter2, { email: 'test@example.com', phone: '555-0100' });
const tmx2Codes = new Set(tmx2.map(issue => issue.code));

check('curly-apostrophe contractions are counted (no false no-contractions)',
  !tmx2Codes.has('no-contractions'),
  tmx2.filter(issue => issue.code === 'no-contractions').map(issue => issue.message).join(''));
check('"Managing X requires an analyst who..." opener is caught',
  tmx2Codes.has('role-description-opener'));
check('naming the company does not exempt a role-definition opener',
  tmxLetter2.includes('TMX Group') && tmx2Codes.has('role-description-opener'));

// ── NASA Space Apps lead ─────────────────────────────────────────────────────

check('nasa-space-apps is a required extracurricular entry',
  EXTRACURRICULAR_CATALOG['nasa-space-apps']?.required === true);
check('hackthebrain is no longer required (demoted for the NASA slot)',
  EXTRACURRICULAR_CATALOG.hackthebrain?.required === false);
check('NASA entry sorts first in extracurriculars (most recent ongoing role)',
  sortChronologically(
    [{ key: 'it-club' }, { key: 'hackthebrain' }, { key: 'nasa-space-apps' }],
    entry => EXTRACURRICULAR_CATALOG[entry.key].dateRange,
  )[0].key === 'nasa-space-apps');
// The title is "Lead", so the Waterloo organisation line is what keeps the
// scope honest: it must never read as employment by NASA itself.
check('NASA entry is scoped to the Waterloo site, not NASA employment',
  /^Lead,/.test(EXTRACURRICULAR_CATALOG['nasa-space-apps'].title)
  && /Waterloo/.test(EXTRACURRICULAR_CATALOG['nasa-space-apps'].organization));
check('omitting the required NASA entry is a fix-severity issue',
  verifyResumeContent(normalizeResumeContent({
    ...good.resume,
    extracurricular: [
      { key: 'it-club', bullet: 'Ran workshops and build nights for club members.' },
      { key: 'hackthebrain', bullet: 'Managed participant operations for the hackathon.' },
    ],
  }), {}).issues.some(issue => issue.code === 'extracurricular-missing'));

// ── Skills credibility ───────────────────────────────────────────────────────
// Each check maps to a real complaint: junior-sounding rows caused by padding,
// vendor API names as skills, and an algorithm listed beside its own category.

const skillIssues = rows => verifyResumeContent(
  normalizeResumeContent({ ...good.resume, skills: rows }), {},
).remainingIssues ?? [];
const skillCodes = rows => new Set(
  verifyResumeContent(normalizeResumeContent({ ...good.resume, skills: rows }), {})
    .issues.map(issue => issue.code));

const baseRows = extra => ([
  { category: 'Languages', items: ['Python', 'TypeScript', 'C++', 'C#', 'Java'] },
  { category: 'Frameworks & Libraries', items: ['React', 'Next.js', 'FastAPI', 'Flask', 'Node.js'] },
  { category: 'AI/ML & Data', items: extra },
  { category: 'Databases', items: ['PostgreSQL', 'SQL Server', 'MongoDB', 'MySQL', 'SQLite'] },
  { category: 'Tools & Infrastructure', items: ['AWS', 'Docker', 'Git', 'CI/CD', 'Postman'] },
]);

check('vendor API name is rejected as a skill (Google Gemini API)',
  skillCodes(baseRows(['Transformers', 'CNN', 'TensorFlow', 'Keras', 'Google Gemini API'])).has('skills-too-granular'));
check('library function name is rejected as a skill (GridSearchCV)',
  skillCodes(baseRows(['Transformers', 'CNN', 'TensorFlow', 'Keras', 'GridSearchCV'])).has('skills-too-granular'));
check('algorithm beside its own category is rejected (DBSCAN + Clustering)',
  skillCodes(baseRows(['DBSCAN', 'Clustering', 'TensorFlow', 'Keras', 'Transformers'])).has('skills-redundant'));
check('same skill in two rows is rejected',
  skillCodes([
    { category: 'Languages', items: ['Python', 'TypeScript', 'C++', 'C#', 'Docker'] },
    { category: 'Frameworks & Libraries', items: ['React', 'Next.js', 'FastAPI', 'Flask', 'Node.js'] },
    { category: 'AI/ML & Data', items: ['Transformers', 'CNN', 'TensorFlow', 'Keras', 'MLflow'] },
    { category: 'Databases', items: ['PostgreSQL', 'SQL Server', 'MongoDB', 'MySQL', 'SQLite'] },
    { category: 'Tools & Infrastructure', items: ['AWS', 'Docker', 'Git', 'CI/CD', 'Postman'] },
  ]).has('skills-duplicate'));
check('over-long row is rejected as padding',
  skillCodes(baseRows(['Transformers', 'CNN', 'RNN', 'Autoencoders', 'GANs', 'MLP', 'TensorFlow', 'Keras', 'MLflow'])).has('skills-row-overfull'));
check('a clean capability-led AI/ML row passes',
  skillIssues(baseRows(['Transformers', 'CNN', 'RNN', 'Autoencoders', 'TensorFlow', 'Keras']))
    .filter(issue => issue.field === 'skills').length === 0);
check('5-item rows are accepted (no longer forced to 6-9)',
  skillIssues(baseRows(['Transformers', 'CNN', 'TensorFlow', 'Keras', 'MLflow']))
    .filter(issue => issue.field === 'skills').length === 0);

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

// ── One-page resume budget ───────────────────────────────────────────────────

const twoPageMd = buildResumeMarkdown(goodContent, { name: 'Girish Bhuteja' });
const onePageContent = applyLengthBudget(goodContent, 'one-page');
const onePageMd = buildResumeMarkdown(onePageContent, { name: 'Girish Bhuteja' }, 'one-page');
const sectionsOf = md => md.split('\n').filter(line => line.startsWith('## ')).map(line => line.slice(3));

// The regression guard that matters: the approved two-page format is untouched.
check('two-page output is unchanged when the budget is applied',
  buildResumeMarkdown(applyLengthBudget(goodContent, 'two-page'), { name: 'Girish Bhuteja' }) === twoPageMd);

check('one-page drops Highlights',
  !sectionsOf(onePageMd).includes('Highlights of Qualifications'),
  sectionsOf(onePageMd).join(' | '));
check('one-page keeps Profile, Skills, Experience, Projects, Education',
  ['Profile', 'Technical Skills Summary', 'Professional Experience', 'Projects', 'Education']
    .every(name => sectionsOf(onePageMd).includes(name)));
check('one-page gives each role 3 bullets and each project 2',
  onePageContent.experience.every(entry => entry.bullets.length <= 3)
  && onePageContent.projects.length <= 3
  && onePageContent.projects.every(project => project.bullets.length <= 2));
check('one-page leadership is the single NASA entry',
  applyLengthBudget(normalizeResumeContent({
    ...good.resume,
    extracurricular: [
      { key: 'nasa-space-apps', bullet: 'Led venue selection and volunteer coordination for the Waterloo site' },
      { key: 'it-club', bullet: 'Ran workshops and mentorship for 100+ students across the year' },
    ],
  }), 'one-page').extracurricular.map(e => e.key).join(',') === 'nasa-space-apps')

// A bullet that wraps to a second line silently pushes the resume past one page.
const longBulletContent = normalizeResumeContent({
  ...good.resume,
  experience: good.resume.experience.map(entry => ({
    ...entry,
    bullets: ['Provided technical support and troubleshooting across accessible learning platforms for more than one thousand students and faculty every term'],
  })),
});
check('a bullet that wraps to two lines is a fix on one page',
  verifyResumeContent(longBulletContent, {}, 'one-page').issues
    .some(issue => issue.code === 'bullet-too-long' && issue.severity === 'fix'));
check('the same bullet is fine on two pages',
  !verifyResumeContent(longBulletContent, {}, 'two-page').issues
    .some(issue => issue.code === 'bullet-too-long'));
// The ceiling is measured from the rendered PDF: 110 chars fits one line.
check('a bullet at the measured one-line ceiling is accepted',
  !verifyResumeContent(normalizeResumeContent({
    ...good.resume,
    experience: good.resume.experience.map(entry => ({ ...entry, bullets: ['x'.repeat(110)] })),
  }), {}, 'one-page').issues.some(issue => issue.code === 'bullet-too-long'
    && issue.section?.startsWith('experience:')));
check('a bullet one character over the ceiling is rejected',
  verifyResumeContent(normalizeResumeContent({
    ...good.resume,
    experience: good.resume.experience.map(entry => ({ ...entry, bullets: ['x'.repeat(111)] })),
  }), {}, 'one-page').issues.some(issue => issue.code === 'bullet-too-long'
    && issue.section?.startsWith('experience:')));
check('mostly unquantified one-page bullets are rejected',
  verifyResumeContent(normalizeResumeContent({
    ...good.resume,
    experience: good.resume.experience.map(entry => ({
      ...entry,
      bullets: ['Maintained documentation standards to ensure project quality', 'Improved workflows to support operations'],
    })),
    projects: good.resume.projects.map(project => ({ ...project, bullets: ['Built a platform to improve efficiency'] })),
  }), {}, 'one-page').issues.some(issue => issue.code === 'bullets-unquantified'));
check('over-long reserve bullets are pruned so expansion cannot promote them',
  Object.values(applyLengthBudget(normalizeResumeContent({
    ...good.resume,
    experience: good.resume.experience.map(entry => ({
      ...entry,
      reserveBullets: ['y'.repeat(140), 'Trained 10+ associates on equipment safety with a 100% record'],
    })),
  }), 'one-page').reserve.experience).flat().every(bullet => bullet.length <= 110));

check('one-page does not also demand longer bullets',
  !verifyResumeContent(onePageContent, {}, 'one-page').issues
    .some(issue => issue.code === 'short-bullets'));
check('one-page is materially shorter than two-page',
  onePageMd.split(/\s+/).length < twoPageMd.split(/\s+/).length * 0.75,
  `one=${onePageMd.split(/\s+/).length} two=${twoPageMd.split(/\s+/).length}`);
check('one-page budget still respects the two-role cap',
  onePageContent.experience.length === 2);

// ── Bullet substance (from a real weak Geotab resume) ────────────────────────

const withBullet = bullet => normalizeResumeContent({
  ...good.resume,
  experience: good.resume.experience.map(entry => ({ ...entry, bullets: [bullet] })),
});
const stapledCount = bullet => verifyResumeContent(withBullet(bullet), {}, 'one-page')
  .issues.filter(issue => issue.code === 'stapled-keyword-tail').length;

for (const bullet of [
  'Resolved front-end and back-end issues, strengthening cross-platform performance and software development',
  'Implemented new React and Node.js features, improving platform functionality',
  'Implemented a 100-point scoring rubric guarded by 5 QA suites to enforce software development',
]) {
  check(`stapled keyword tail caught: "...${bullet.slice(-34)}"`, stapledCount(bullet) > 0);
}
check('a bullet ending on a real result is not flagged',
  stapledCount('Rebuilt the shared course-template system across 5+ OER titles, cutting publishing effort for 1,000+ users') === 0);

// Truncation used to produce broken English ("...Gemini API for automated").
check('over-long bullets are left intact rather than truncated mid-sentence',
  applyLengthBudget(withBullet('Engineered a 5-stage AI document-generation pipeline using the Gemini API for automated resume rendering across every application'), 'one-page')
    .experience[0].bullets[0].endsWith('across every application'));

// ── Result ───────────────────────────────────────────────────────────────────

console.log(failures === 0 ? '\nAll document-content checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
