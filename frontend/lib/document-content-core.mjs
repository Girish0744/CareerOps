/**
 * document-content-core.mjs — deterministic resume/cover-letter content layer.
 *
 * The Gemini call produces structured content JSON (see buildResumeMarkdown's
 * `content` shape). Everything that is a fixed fact about the candidate —
 * project names/URLs/dates, experience headers, awards, education,
 * certifications — lives HERE as constants so the model can never fabricate
 * or drift on them. The model only writes the variable parts: profile
 * sentences, highlight bullets, skill rows, experience/project bullets, and
 * the extracurricular/coursework selections.
 *
 * buildResumeMarkdown emits markdown in exactly the shape that
 * frontend/lib/document-renderer.ts parses (section aliases, bold entry
 * titles, date lines, `- ` bullets), so the locked cv-template.html render
 * path is untouched.
 *
 * Shared between the Next.js API routes and the root docs:qa test script,
 * same pattern as evaluation-guardrails-core.mjs.
 */

// ── Fixed candidate facts ────────────────────────────────────────────────────

export const PROJECT_CATALOG = {
  bestspot: {
    name: 'BestSpot - Business Location Intelligence Platform',
    links: [{ label: 'bestspot.biz', url: 'https://bestspot.biz' }],
    dateRange: 'Jan 2026 - Aug 2026',
  },
  careerops: {
    name: 'CareerOps - AI Job Application Platform',
    links: [{ label: 'github.com/Girish0744/CareerOps', url: 'https://github.com/Girish0744/CareerOps' }],
    dateRange: 'Apr 2026 - Present',
  },
  ethos: {
    name: 'ETHOS - Autonomous Exoplanet Discovery Pipeline',
    links: [
      { label: 'github.com/Girish0744/ETHOS-MLPROJECT', url: 'https://github.com/Girish0744/ETHOS-MLPROJECT' },
      { label: 'eth0s.online', url: 'https://eth0s.online' },
    ],
    dateRange: 'Jan 2026 - Apr 2026',
  },
  aegisgrid: {
    name: 'AegisGrid - Drone Swarm Threat Prioritization',
    links: [
      { label: 'github.com/Girish0744/AegisGrid', url: 'https://github.com/Girish0744/AegisGrid' },
      { label: 'aegis-grid.vercel.app', url: 'https://aegis-grid.vercel.app' },
    ],
    dateRange: 'Apr 2026',
  },
  meditwin: {
    name: 'MediTwin - AI Health Companion',
    links: [{ label: 'github.com/Girish0744/MediTwin', url: 'https://github.com/Girish0744/MediTwin' }],
    dateRange: 'May 2025 - Aug 2025',
  },
  dineease: {
    name: 'DineEase - Restaurant Ordering System',
    links: [{ label: 'github.com/Girish0744/DineEase', url: 'https://github.com/Girish0744/DineEase' }],
    dateRange: 'Sept 2024 - Dec 2024',
  },
  medinet: {
    name: 'MediNet+ - Hospital Management System',
    links: [{ label: 'github.com/Girish0744/MediNet', url: 'https://github.com/Girish0744/MediNet' }],
    dateRange: 'Jan 2025 - Apr 2025',
  },
  'dropout-analysis': {
    name: 'Student Dropout Risk Analysis',
    links: [{ label: 'github.com/Girish0744/Student-Dropout-Risk-Analysis', url: 'https://github.com/Girish0744/Student-Dropout-Risk-Analysis' }],
    dateRange: 'Jan 2026 - Apr 2026',
  },
  telemetry: {
    name: 'TelemetryDownloader - TCP Client-Server File Transfer',
    links: [{ label: 'github.com/Girish0744/TelemetryDownloader', url: 'https://github.com/Girish0744/TelemetryDownloader' }],
    dateRange: 'Jan 2026 - Apr 2026',
  },
};

export const EXPERIENCE_CATALOG = {
  oer: {
    title: 'Data and Software Engineering Assistant',
    company: 'Conestoga College, Waterloo, ON',
    dateRange: 'Jan 2025 - Present',
    note: 'Part-time and co-op role; converted to co-op based on performance; retained after departmental restructuring',
    minBullets: 2,
    maxBullets: 3,
    required: true,
  },
  // Current software role. Required: a resume that ends its newest job in Aug 2026
  // reads as unemployed, and the recruiter feedback was explicitly to add a third role.
  kingdom: {
    title: 'Software Developer',
    company: 'The Kingdom Group, Brampton, ON',
    dateRange: 'May 2026 - Present',
    note: '',
    minBullets: 2,
    maxBullets: 2,
    required: true,
  },
  // Selectable, not automatic: the strongest evidence for client-facing,
  // service-desk, operations and retail roles, and mandatory for any Home Depot
  // posting. Left off engineering-heavy resumes to keep page 1 for technical work.
  'home-depot': {
    title: 'Freight Associate and Trainer',
    company: 'The Home Depot, Brampton, ON',
    dateRange: 'Jan 2023 - Present',
    note: '',
    minBullets: 2,
    maxBullets: 3,
    required: false,
  },
  'olive-branch': {
    title: 'Full-Stack Developer, Web and Integrations',
    company: 'Olive Branch Mentorship Inc., Cambridge, ON',
    dateRange: 'May 2025 - Aug 2026',
    note: '',
    minBullets: 2,
    maxBullets: 2, // page 1 now carries three roles; there is no room for a third bullet
    required: false,
  },
};

/**
 * Page 1 fits exactly three roles: the two required ones (oer, kingdom) plus ONE
 * of olive-branch or home-depot chosen for this JD. A fourth pushes Professional
 * Experience onto page 2 and Projects onto page 3, which the overflow trimmer
 * cannot recover from because it can only cut bullets, never a whole entry.
 */
export const MAX_EXPERIENCE_ENTRIES = 3;

/** Always rendered first, regardless of dates. See the ordering note below. */
export const PRIMARY_EXPERIENCE_KEY = 'oer';

const normalizeEmployer = name => String(name ?? '')
  .toLowerCase()
  .split(',')[0]
  .replace(/\b(the|inc|ltd|llc|corp|corporation|company|canada|of)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * A posting FROM a past employer must show that employer's role: it is the one
 * piece of evidence no other candidate has. Returns '' for everyone else.
 */
export function experienceKeyForEmployer(company) {
  const target = normalizeEmployer(company);
  if (target.length < 4) return '';
  return Object.keys(EXPERIENCE_CATALOG).find(key => {
    const known = normalizeEmployer(EXPERIENCE_CATALOG[key].company);
    return known.length >= 4 && (target.includes(known) || known.includes(target));
  }) ?? '';
}

function capExperienceEntries(entries, forcedKey = '') {
  const seen = new Set();
  const unique = entries.filter(entry => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
  // Required roles first, then the employer's own role when this posting is
  // theirs, then the model's own ordering (its relevance ranking).
  const required = unique.filter(entry => EXPERIENCE_CATALOG[entry.key].required);
  const optional = unique.filter(entry => !EXPERIENCE_CATALOG[entry.key].required);
  const forced = optional.filter(entry => entry.key === forcedKey);
  return [...required, ...forced, ...optional.filter(entry => entry.key !== forcedKey)]
    .slice(0, MAX_EXPERIENCE_ENTRIES);
}

export const EXTRACURRICULAR_CATALOG = {
  // Ongoing since Jul 2026, so the chronological sort puts it first in the
  // section. Event is November 2026: describe organizing it, never the outcome.
  'nasa-space-apps': { title: 'Lead, NASA International Space Apps Challenge', organization: 'Waterloo, ON', dateRange: 'Jul 2026 - Present', required: true },
  'it-club': { title: 'President, IT Club', organization: 'Conestoga College', dateRange: 'Apr 2025 - Present', required: true },
  hackthebrain: { title: 'Director, Student Success Team', organization: 'HackTheBrain, Toronto Tech Week', dateRange: 'Mar 2025 - Jul 2025', required: false },
  'ai-build-lab': { title: 'Area Leader, AI Build Lab', organization: 'Toronto Tech Week', dateRange: 'May 2026 - Jun 2026', required: false },
  mentor: { title: 'Student Experience Mentor', organization: 'Conestoga College', dateRange: 'Sept 2025 - Dec 2025', required: false },
  gdg: { title: 'Subcommittee Member', organization: 'GDG Waterloo', dateRange: 'Apr 2026 - Present', required: false },
};

export const EDUCATION_ENTRY = {
  title: 'Bachelor of Computer Science (Honours)',
  company: 'Conestoga College, Waterloo, ON',
  dateRange: 'Sept 2022 - Aug 2026',
  gpaBullet: 'GPA: 3.76/4.00',
};

/**
 * Entries that are TRUE but read as junior in a headline skills row: a library's
 * internal function name, or a vendor API name presented as a competency. These
 * stay welcome in a project stack line, where they are concrete evidence rather
 * than a claim of expertise.
 */
export const BANNED_SKILL_ITEMS = [
  'gridsearchcv',
  'google gemini api',
  'gemini api',
  'openai api',
  'train-test split',
  'cross-validation',
  'k-fold cross-validation',
  'jupyter',
  'jupyter notebook',
  'vs code',
  'visual studio code',
  'ms office',
  'microsoft office',
  'windows',
  'macos',
  'internet',
];

/**
 * Banned in COVER LETTERS only. An apply-by-email message legitimately opens by
 * stating that the sender is applying, often with a required subject line, so
 * these must not be shared with the apply-email verifier. In a cover letter the
 * same wording announces the act of applying instead of making a point, and it
 * reliably breaks the chain of thought in paragraph 1.
 */
export const BANNED_COVER_LETTER_ONLY_PHRASES = [
  'I am applying for the',
  "I'm applying for the",
  'I would like to apply',
  'I am writing to express',
];

/**
 * Employers and organisations that may appear in the candidate's documents.
 * Used to verify a cover letter only tells stories the tailored resume backs
 * up: experience is deliberately left off the resume when it is not relevant to
 * a posting, and a letter that names it anyway makes the two documents
 * contradict each other in front of the recruiter.
 */
export const CANDIDATE_ORGANISATIONS = [
  'The Home Depot',
  'Home Depot',
  'Olive Branch',
  'HackTheBrain',
  'Toronto Tech Week',
  'GDG Waterloo',
  'Space Apps',
  'Conestoga College',
];

/** [specific, general] — listing both is padding, since one contains the other. */
export const REDUNDANT_SKILL_PAIRS = [
  ['dbscan', 'clustering'],
  ['k-means', 'clustering'],
  ['random forest', 'ensemble methods'],
  ['cnn', 'deep learning'],
  ['rnn', 'deep learning'],
];

// ── Reverse-chronological ordering ───────────────────────────────────────────
// The model picks WHICH projects/experience/activities to include (relevance),
// but never the order they appear in. Dates are fixed facts in the catalogs
// above, so ordering is decided here in code: newest first, always.

const MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const ONGOING = Number.MAX_SAFE_INTEGER;

function monthYearValue(token, fallbackMonth) {
  const match = String(token).match(/([A-Za-z]+)?\s*((?:19|20)\d{2})/);
  if (!match) return null;
  const month = match[1] ? MONTH_INDEX[match[1].slice(0, 3).toLowerCase()] : undefined;
  return Number(match[2]) * 12 + (month ?? fallbackMonth);
}

/**
 * Sort key for a catalog dateRange: "Jan 2026 - Present", "Apr 2026",
 * "Sept 2024 - Dec 2024". Resume convention is newest END date first, then
 * newest START date; anything ongoing outranks everything finished.
 */
export function dateRangeSortKey(dateRange) {
  const text = String(dateRange ?? '');
  const parts = text.split(/\s*[-–—]\s*/).map(part => part.trim()).filter(Boolean);
  const start = monthYearValue(parts[0] ?? '', 0);
  const end = /present|current/i.test(text)
    ? ONGOING
    : monthYearValue(parts[parts.length - 1] ?? '', 11);
  return { start: start ?? -1, end: end ?? start ?? -1 };
}

/** Stable: entries with identical dates keep the model's relevance order. */
export function sortChronologically(entries, dateRangeOf) {
  return entries
    .map((entry, index) => ({ entry, index, key: dateRangeSortKey(dateRangeOf(entry)) }))
    .sort((a, b) => (b.key.end - a.key.end) || (b.key.start - a.key.start) || (a.index - b.index))
    .map(item => item.entry);
}

export const ALLOWED_COURSEWORK = [
  'Software Engineering',
  'OOP',
  'Data Structures and Algorithms',
  'Database Systems',
  'Computer Networks',
  'OS and Security',
  'Cloud Computing',
  'Big Data',
  'AI and Machine Learning',
  'Advanced Topics in AI/ML',
];

export const AWARDS = [
  {
    name: 'Narhari Sharma Memorial Award',
    institution: 'Conestoga College',
    date: 'April 2026',
    bullet: 'Awarded for academic excellence, leadership, and sustained commitment to helping others succeed; nominated by management and colleagues',
  },
  {
    name: 'Helena Webb Mentorship Program',
    institution: 'Conestoga College',
    date: 'January - April 2026',
    bullet: 'Selected for a structured four-month industry mentorship, recognizing academic achievement and leadership potential',
  },
];

export const CERTIFICATIONS_LINE = 'AI Agents: Intensive Vibe Coding, Google & Kaggle · Java SE, Oracle · OOP Using C++, Infosys · CIPS Ontario Member';

export const RESUME_ARCHETYPES = [
  'SWE_FULLSTACK', 'AI_ML', 'DA_BA', 'DATA_ENGINEER', 'BACKEND_JAVA_SYSTEMS',
  'SYSTEMS_CPP', 'CSHARP_DOTNET', 'HELPDESK_IT', 'GENERAL',
];

// Tools/tech vocabulary supported by the master resume. Used for the
// cover-letter paragraph-2 tech-count check and coverage location hints.
export const KNOWN_TECH_VOCABULARY = [
  'Python', 'JavaScript', 'TypeScript', 'C++', 'C#', 'Java', 'SQL', 'HTML', 'CSS',
  'React', 'Next.js', 'FastAPI', 'Flask', 'Node.js', 'Streamlit', 'WordPress', 'WebSocket',
  'TensorFlow', 'Keras', 'scikit-learn', 'MLflow', 'Pandas', 'NumPy', 'Random Forest', 'DBSCAN',
  'GridSearchCV', 'PostgreSQL', 'SQL Server', 'MongoDB', 'MySQL', 'SQLite',
  'AWS', 'Azure', 'Docker', 'Vercel', 'Git', 'GitHub', 'Postman', 'Selenium',
  'Power BI', 'Power Automate', 'SharePoint', 'MSTest', 'Winsock', 'SimpleTCP',
  'Matplotlib', 'Seaborn', 'Gemini', 'OpenFDA', 'H5P', 'Pressbooks',
  'Express', 'Playwright', 'JMeter', 'REST APIs', 'CI/CD', 'Excel',
];

// ── Language rules (enforced in code, mirrored in the prompt) ────────────────

export const BANNED_POWER_VERBS = ['Spearheaded', 'Championed', 'Orchestrated', 'Revolutionized', 'Pioneered'];

export const BANNED_RESUME_PHRASES = [
  'passionate about', 'excited to', 'team player', 'detail-oriented', 'results-driven',
  'innovative solutions', 'fast-paced environment', 'cutting-edge', 'leveraging',
  'utilized', 'utilizing', 'proven track record', 'adept at',
  // Self-labelled inexperience. A resume whose first words announce that the
  // candidate is a beginner is filtered out before the evidence is read, and
  // the function performed is truthful without any claim about tenure.
  'early-career', 'early career', 'aspiring', 'entry-level', 'entry level',
  'recent graduate', 'emerging professional', 'budding', 'motivated student',
];

export const BANNED_PROFILE_PHRASES = ['expertise in', 'deep technical experience', 'possesses', 'utilizes'];

// The resume states the degree and its date range and stops there. A graduation
// date adds nothing a recruiter needs and dates the candidate, and student
// framing reads as inexperience. The model reaches for both constantly because
// so much of its training data describes this profile as a student, so they are
// caught here rather than trusted away.
//
// Deliberately matches graduated/graduating/graduation but NOT the bare noun
// "graduate" — "New Graduate Software Developer" is a real job title and must
// stay usable.
const GRADUATION_MENTION = new RegExp([
  'graduat(?:ed|ing|ion)',
  'will graduate',
  'upcoming graduate',
  'soon-to-be graduate',
  'final[- ]year student',
  'currently (?:a |an )?(?:student|undergraduate)',
  'pursuing (?:a |an |his )?(?:bachelor|b\.?sc|degree)',
  '(?:is|am) (?:a |an )?(?:computer science |cs )?student',
  'candidate at Conestoga',
].join('|'), 'i');

/** Returns the offending phrase, or null. */
export function findGraduationMention(text) {
  const match = String(text ?? '').match(GRADUATION_MENTION);
  return match ? match[0] : null;
}

// Tech that appears in job descriptions but NOT in cv.md. If the model reaches for
// one of these it is copying the JD, not describing Girish. Keep every entry checked
// against cv.md before adding — a term he genuinely has here would silently delete a
// true skill in stripFabricatedSkills().
export const FABRICATION_TRIPWIRES = [
  'Golang', 'Spring Boot', 'Spring', 'Kubernetes', 'Kafka', 'JUnit', 'Maven', 'Gradle',
  'Angular', 'Vue', 'Spark', 'Hadoop', 'Hibernate', 'Scala', 'Ruby', 'Rails', 'PHP',
  'Laravel', 'Django', 'Terraform', 'Ansible', 'Jenkins', 'GraphQL', 'Redis',
  'Elasticsearch', 'Snowflake', 'Databricks', 'Tableau', 'Kotlin', 'Swift', 'Rust',
];

function normalizeTitleForMatch(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** True when the profile already states the posting title, in either word order. */
export function profileHasJobTitle(content, jobTitle) {
  const target = normalizeTitleForMatch(jobTitle);
  if (!target) return true;
  const profile = normalizeTitleForMatch(asArray(content.profileSentences).join(' '));
  if (profile.includes(target)) return true;
  // "Intern, AI Engineer" and "AI Engineer Intern" are the same posting to a
  // recruiter's search, so accept either ordering of the same words.
  const words = target.split(' ').filter(Boolean);
  return words.length > 1 && words.every(word => new RegExp(`\\b${word}\\b`).test(profile));
}

/**
 * Deterministic backstop for the posting title.
 *
 * The prompt asks the model to work the title into the opening sentence, which reads
 * best. When it does not comply — and the Spring Boot incident showed the repair pass
 * cannot be trusted to — append a short, truthful targeting sentence instead of
 * rewriting a sentence the user may already be happy with.
 */
export function ensureJobTitleInProfile(content, jobTitle) {
  const title = String(jobTitle || '').trim();
  if (!title || profileHasJobTitle(content, title)) return { content, added: false };
  return {
    content: {
      ...content,
      // "Applying for the X role" rather than "Targeting X roles" because ATS titles
      // are often comma-inverted ("Intern, AI Engineer", "Consultant, Data Engineer")
      // and only the first phrasing stays grammatical while keeping the string exact.
      profileSentences: [...asArray(content.profileSentences), `Applying for the ${title} role.`],
    },
    added: true,
  };
}

/**
 * Last line of defence for the skills rows.
 *
 * The verifier already flags a tripwire term anywhere in the resume, but a flagged
 * issue only *reports* — generation still ships. That is fine for a wording nit and
 * unacceptable for a fabricated skill, which is a claim Girish would have to defend
 * in an interview. Skills are a plain list, so removing the item is deterministic and
 * safe in a way that rewriting a bullet is not: drop it and the row still reads.
 *
 * Returns the cleaned content plus what was removed, so the caller can log it.
 */
export function stripFabricatedSkills(content) {
  const removed = [];
  const skills = asArray(content.skills).map(row => {
    const items = asArray(row.items).filter(item => {
      const hit = FABRICATION_TRIPWIRES.find(
        term => new RegExp(`\\b${term}\\b`, 'i').test(String(item)),
      );
      if (hit) removed.push(`${row.category}: ${item}`);
      return !hit;
    });
    return { ...row, items };
  });
  return removed.length === 0
    ? { content, removed }
    : { content: { ...content, skills }, removed };
}

// Rendered page-fill targets for the locked template's fixed page split
// (page 1 = profile..experience, .page-two = projects..certifications).
// Fractions of the usable page height; the generate-docs route expands
// reserve content until each page meets its minimum or reserve runs out.
// Calibrated against Girish's hand-tuned resumes. page2Min is deliberately high
// so page 2 keeps adding JD-relevant project bullets until it is genuinely full;
// the generate-docs loop reverts the last add if it would spill onto page 3, so
// a high target just means "fill until one bullet short of overflow."
export const RESUME_FILL_TARGETS = { page1Min: 0.93, page2Min: 0.97 };

/**
 * Per-length page rules. The two-page entry keeps today's values exactly, so
 * the approved format cannot regress when the one-page option is added.
 */
export const RESUME_BUDGETS = {
  'two-page': { maxPages: 2, fillTargets: RESUME_FILL_TARGETS },
  // 0.96 so the bottom margin ends up matching the top one. The expansion loop
  // reverts any promotion that spills onto a second page, so this fills to one
  // bullet short of overflow rather than risking it.
  'one-page': { maxPages: 1, fillTargets: { page1Min: 0.96 } },
};

/**
 * Cut content down to what one page can hold. Selection stays JD-driven: this
 * only limits HOW MUCH survives, never WHICH items, so the relevance ranking
 * upstream still decides what makes the cut.
 *
 * Returns the content untouched for two-page, which is the regression guard.
 */
export function applyLengthBudget(content, length = 'two-page') {
  if (length !== 'one-page') return content;
  // Leadership gets a single line on one page, and the NASA Space Apps lead is
  // the chosen entry: it is the most recent role and the token a recruiter's eye
  // stops on when skimming.
  const leadership = content.extracurricular.filter(entry => entry.key === 'nasa-space-apps');
  // NOTE: an earlier version truncated an over-long bullet at a word boundary.
  // That produced broken English in the delivered PDF ("...using Gemini API for
  // automated", "...across 8 modules in under"), which is far worse than a
  // bullet that wraps to a second line. Over-long bullets are now left intact:
  // the verifier flags them and the repair pass rewrites them properly.
  //
  // Reserve bullets are still pruned, because they are promoted AFTER
  // verification and would otherwise reach the page unchecked.
  const fits = bullet => bullet.length <= ONE_PAGE_BULLET_MAX_CHARS;
  const pruneReserveMap = (map = {}) => Object.fromEntries(
    Object.entries(map).map(([key, bullets]) => [key, (bullets ?? []).filter(fits)]),
  );
  const reserve = content.reserve ?? {};
  return {
    ...content,
    reserve: {
      ...reserve,
      experience: pruneReserveMap(reserve.experience),
      projects: pruneReserveMap(reserve.projects),
      // Page-fill must never grow the profile past three rendered lines, nor add
      // a second Leadership entry, so both levers are removed. The page fills
      // through project and experience bullets instead.
      profileSentence: '',
      extracurricular: [],
    },
    // Two sentences lands at three rendered lines at this width.
    profileSentences: content.profileSentences.slice(0, 2),
    // The one-page template has no Highlights section; its content is carried
    // by Profile, Education and Leadership instead.
    highlights: [],
    // Page 2 is where the third role lives; one page holds the two required ones.
    experience: content.experience.slice(0, 2).map(entry => ({ ...entry, bullets: entry.bullets.slice(0, 3) })),
    projects: content.projects.slice(0, 3).map(project => ({ ...project, bullets: project.bullets.slice(0, 2) })),
    extracurricular: (leadership.length ? leadership : content.extracurricular).slice(0, 1),
    educationCoursework: content.educationCoursework.slice(0, 4),
  };
}

// Most bullets a single project may hold after deep page-2 fill.
export const MAX_PROJECT_BULLETS = 5;

export const BANNED_COVER_LETTER_PHRASES = [
  'I am writing to apply', 'I am passionate about', 'I would love the opportunity',
  'I believe I would be a great fit', 'I am eager', 'eager to contribute', 'excited to apply',
  'thrilled', 'leveraging', 'utilizing', 'utilize', 'robust', 'comprehensive',
  'extensive experience', 'technical rigors', 'enterprise-scale', 'dynamic environment',
  'cutting-edge', 'drive innovation', 'hit the ground running', 'synergy',
  'proven track record', 'adept at', 'perfect fit', 'uniquely qualified',
  'resonates', 'aligns perfectly', 'deeply committed', 'keen interest', 'esteemed',
  'I am confident that my', 'contribute effectively to',
  // Formal connectors and inflated vocabulary: individually harmless, but they
  // are the register a model reaches for and a person almost never writes.
  'furthermore', 'moreover', 'in conclusion', 'it is worth noting',
  'delve', 'underscore', 'testament to', 'myriad', 'plethora', 'endeavor',
  'seamless', 'pivotal', 'instrumental in', 'a wealth of', 'poised to',
  'wide range of', 'strong foundation in', 'invaluable',
  // Filler that asserts a quality instead of showing it.
  'mission-critical', 'fast-paced', 'I look forward to',
  'problem-solving skills', 'high standards', 'under pressure',
  'I am drawn to', 'ready to ensure', 'these experiences prepared me',
  'I thrive in', 'take full ownership', 'high-quality service',
  'I am ready to contribute', 'diverse user base', 'actionable solutions',
  'until a resolution is reached', 'precision and responsiveness',
  'high-stakes', 'attention to detail', 'I want to apply my',
  'this blend of', 'prepares me to contribute', 'my background in managing',
  // Empty short sentences bolted on to satisfy the sentence-rhythm rule. A
  // short sentence has to carry a fact, not just be short.
  "It's critical work", 'It is critical work', 'That mattered',
  "That's important", 'It matters', 'That was important',
];

// ── Text helpers ─────────────────────────────────────────────────────────────

function sanitizeInline(value) {
  return String(value ?? '')
    .replace(/—/g, ',')      // em dash → comma (project rule)
    .replace(/–/g, '-')      // en dash → hyphen
    .replace(/−/g, '-')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeBullet(value) {
  return sanitizeInline(value).replace(/[.\s]+$/, '');
}

function sanitizeSentence(value) {
  const text = sanitizeInline(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Normalize text for keyword matching. Keeps + and # so "C++"/"C#" survive;
 * folds separators so "Node.js"/"NodeJS"/"node js" and "CI/CD"/"ci cd" match.
 */
function normalizeForMatch(value) {
  return ` ${String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function keywordVariants(keyword) {
  const base = normalizeForMatch(keyword).trim();
  const variants = new Set([base]);
  if (base.includes(' ')) variants.add(base.replace(/ /g, '')); // "node js" → "nodejs"
  return [...variants].filter(Boolean);
}

/**
 * Prepare text for keyword matching: normalized tokens plus merged adjacent
 * token pairs, so "Node.js" (→ "nodejs") matches text containing "Node js"
 * while "Java" can never match inside "JavaScript" (whole tokens only).
 */
function prepareTextForMatch(value) {
  const tokens = normalizeForMatch(value).trim().split(' ').filter(Boolean);
  const pairs = tokens.slice(0, -1).map((token, index) => `${token}${tokens[index + 1]}`);
  return ` ${[...tokens, ...pairs].join(' ')} `;
}

function textIncludesKeyword(preparedText, keyword) {
  return keywordVariants(keyword).some(variant => preparedText.includes(` ${variant} `));
}

// ── Content normalization ────────────────────────────────────────────────────

const MAX_RESERVE_BULLETS_PER_ENTRY = 3;

/**
 * Coerce the model's JSON into a clean, deterministic content object.
 * Unknown catalog keys are dropped (they get reported by verifyResumeContent
 * via structural checks). All text is sanitized: em dashes and trailing
 * bullet periods removed here so those rules never depend on the model.
 *
 * `reserve` holds the model's ranked spare content (extra experience/project
 * bullets, an extra extracurricular entry). It is never rendered directly —
 * expandResumeForUnderfill promotes from it when the rendered page is short.
 */
export function normalizeResumeContent(raw, company = '') {
  const source = raw && typeof raw === 'object' ? raw : {};

  const profileSentences = asArray(source.profileSentences).map(sanitizeSentence).filter(Boolean);
  const highlights = asArray(source.highlights).map(sanitizeBullet).filter(Boolean);

  const skills = asArray(source.skills)
    .map(row => ({
      category: sanitizeInline(row?.category ?? '').replace(/:$/, '').replace(/\band\b/g, '&'),
      items: asArray(row?.items).map(sanitizeInline).filter(Boolean),
    }))
    .filter(row => row.category && row.items.length > 0);

  const reserve = { experience: {}, projects: {}, extracurricular: [], profileSentence: '' };
  const reserveBulletsOf = entry => asArray(entry?.reserveBullets)
    .map(sanitizeBullet)
    .filter(isPromotableBullet)
    .slice(0, MAX_RESERVE_BULLETS_PER_ENTRY);

  const spareProfileSentence = sanitizeSentence(source.reserveProfileSentence ?? '');
  if (spareProfileSentence && isPromotableBullet(spareProfileSentence)) {
    reserve.profileSentence = spareProfileSentence;
  }

  // Cap BEFORE sorting: the cap must respect the model's relevance ranking,
  // whereas the sort is chronological and would otherwise decide which role
  // survives by date rather than by fit to the job.
  // oer is pinned to the top rather than sorted. It is the primary technical
  // role, and the roles overlap in time, so a pure date sort would put the
  // volunteer role above it purely because it started four months later.
  const orderedExperience = capExperienceEntries(
    asArray(source.experience)
      .map(entry => ({
        key: String(entry?.key ?? '').trim(),
        bullets: asArray(entry?.bullets).map(sanitizeBullet).filter(Boolean),
      }))
      .filter(entry => EXPERIENCE_CATALOG[entry.key]),
    experienceKeyForEmployer(company),
  );
  const experience = [
    ...orderedExperience.filter(entry => entry.key === PRIMARY_EXPERIENCE_KEY),
    ...sortChronologically(
      orderedExperience.filter(entry => entry.key !== PRIMARY_EXPERIENCE_KEY),
      entry => EXPERIENCE_CATALOG[entry.key].dateRange,
    ),
  ];
  for (const entry of asArray(source.experience)) {
    const key = String(entry?.key ?? '').trim();
    const spare = reserveBulletsOf(entry);
    if (EXPERIENCE_CATALOG[key] && spare.length > 0) reserve.experience[key] = spare;
  }

  const projects = sortChronologically(
    asArray(source.projects)
      .map(project => ({
        key: String(project?.key ?? '').trim(),
        stack: sanitizeBullet(project?.stack ?? '').replace(/^Stack:\s*/i, ''),
        bullets: asArray(project?.bullets).map(sanitizeBullet).filter(Boolean),
      }))
      .filter(project => PROJECT_CATALOG[project.key]),
    project => PROJECT_CATALOG[project.key].dateRange,
  );
  for (const project of asArray(source.projects)) {
    const key = String(project?.key ?? '').trim();
    const spare = reserveBulletsOf(project);
    if (PROJECT_CATALOG[key] && spare.length > 0) reserve.projects[key] = spare;
  }

  const educationCoursework = asArray(source.educationCoursework).map(sanitizeInline).filter(Boolean);

  const extracurricular = sortChronologically(
    asArray(source.extracurricular)
      .map(entry => ({
        key: String(entry?.key ?? '').trim(),
        bullet: sanitizeBullet(entry?.bullet ?? ''),
      }))
      .filter(entry => EXTRACURRICULAR_CATALOG[entry.key] && entry.bullet),
    entry => EXTRACURRICULAR_CATALOG[entry.key].dateRange,
  );

  const selectedExtracurricular = new Set(extracurricular.map(entry => entry.key));
  reserve.extracurricular = asArray(source.reserveExtracurricular)
    .map(entry => ({
      key: String(entry?.key ?? '').trim(),
      bullet: sanitizeBullet(entry?.bullet ?? ''),
    }))
    .filter(entry => EXTRACURRICULAR_CATALOG[entry.key] && isPromotableBullet(entry.bullet) && !selectedExtracurricular.has(entry.key))
    .slice(0, MAX_RESERVE_BULLETS_PER_ENTRY);

  return { profileSentences, highlights, skills, experience, projects, educationCoursework, extracurricular, reserve };
}

// ── Markdown builder (the compatibility contract with document-renderer.ts) ──

export function buildResumeMarkdown(content, contact = {}, length = 'two-page') {
  const name = sanitizeInline(contact.name || 'Girish Bhuteja');
  const onePage = length === 'one-page';
  const lines = [];

  lines.push(`# ${name}`, '');

  lines.push('## Profile', '', content.profileSentences.join(' '), '');

  if (!onePage) {
    lines.push('## Highlights of Qualifications', '');
    for (const highlight of content.highlights) lines.push(`- ${highlight}`);
    lines.push('');
  }

  lines.push('## Technical Skills Summary', '');
  for (const row of content.skills) lines.push(`- **${row.category}:** ${row.items.join(', ')}`);
  lines.push('');

  lines.push('## Professional Experience', '');
  for (const entry of content.experience) {
    const fixed = EXPERIENCE_CATALOG[entry.key];
    lines.push(`**${fixed.title}**`);
    lines.push(fixed.company);
    lines.push(fixed.dateRange);
    if (fixed.note) lines.push(`*${fixed.note}*`);
    for (const bullet of entry.bullets) lines.push(`- ${bullet}`);
    lines.push('');
  }

  lines.push('## Projects', '');
  for (const project of content.projects) {
    const fixed = PROJECT_CATALOG[project.key];
    const links = fixed.links.map(link => `[${link.label}](${link.url})`).join(' | ');
    lines.push(`**${fixed.name}** | ${links}`);
    lines.push(fixed.dateRange);
    if (project.stack) lines.push(`- Stack: ${project.stack}`);
    for (const bullet of project.bullets) lines.push(`- ${bullet}`);
    lines.push('');
  }

  lines.push('## Education', '');
  lines.push(`**${EDUCATION_ENTRY.title}**`);
  lines.push(EDUCATION_ENTRY.company);
  lines.push(EDUCATION_ENTRY.dateRange);
  lines.push(`- ${EDUCATION_ENTRY.gpaBullet}`);
  if (content.educationCoursework.length > 0) {
    lines.push(`- Relevant coursework: ${content.educationCoursework.join(', ')}`);
  }
  lines.push('');

  lines.push('## Extracurricular Activities', '');
  for (const entry of content.extracurricular) {
    const fixed = EXTRACURRICULAR_CATALOG[entry.key];
    // One page renders leadership exactly like an experience entry (bold title,
    // italic organisation on its own line) so the type never changes mid-page.
    // Two pages keep the compact single-line header they were approved with.
    if (onePage) {
      lines.push(`**${fixed.title}**`);
      lines.push(fixed.organization);
    } else {
      lines.push(`**${fixed.title}**, ${fixed.organization}`);
    }
    lines.push(fixed.dateRange);
    lines.push(`- ${entry.bullet}`, '');
  }

  // Awards are dropped on one page; Certifications earn the space instead.
  if (!onePage) {
    lines.push('## Awards and Recognition', '');
    for (const award of AWARDS) {
      lines.push(`**${award.name}** | ${award.institution}`);
      lines.push(award.date);
      lines.push(`- ${award.bullet}`, '');
    }
  }

  lines.push('## Certifications & Memberships', '', CERTIFICATIONS_LINE, '');

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ── Verification ─────────────────────────────────────────────────────────────

function collectResumeTextSections(content) {
  const sections = [];
  sections.push({ section: 'profile', text: content.profileSentences.join(' ') });
  sections.push({ section: 'highlights', text: content.highlights.join('\n') });
  sections.push({ section: 'skills', text: content.skills.map(row => `${row.category}: ${row.items.join(', ')}`).join('\n') });
  for (const entry of content.experience) {
    sections.push({ section: `experience:${entry.key}`, text: entry.bullets.join('\n') });
  }
  for (const project of content.projects) {
    sections.push({ section: `project:${project.key}`, text: `${project.stack}\n${project.bullets.join('\n')}` });
  }
  sections.push({ section: 'education', text: content.educationCoursework.join(', ') });
  sections.push({ section: 'extracurricular', text: content.extracurricular.map(entry => entry.bullet).join('\n') });
  return sections;
}

export function buildKeywordCoverage(content, keywords) {
  const sections = collectResumeTextSections(content).map(entry => ({
    section: entry.section,
    normalized: prepareTextForMatch(entry.text),
  }));

  return asArray(keywords)
    .map(keyword => sanitizeInline(keyword))
    .filter(Boolean)
    .map(keyword => {
      const locations = sections
        .filter(entry => textIncludesKeyword(entry.normalized, keyword))
        .map(entry => entry.section);
      return { keyword, present: locations.length > 0, locations };
    });
}

function findPhrase(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.find(phrase => lower.includes(phrase.toLowerCase())) ?? null;
}

function countSentences(text) {
  const matches = text.match(/[.!?](?:\s|$)/g);
  return matches ? matches.length : (text.trim() ? 1 : 0);
}

export function countProjectBulletItems(content) {
  return content.projects.reduce((sum, project) => sum + (project.stack ? 1 : 0) + project.bullets.length, 0);
}

/**
 * Verify structured resume content. Returns:
 *   issues: [{ code, severity: 'fix'|'warn', section, message }]
 *   keywordCoverage: [{ keyword, present, locations }]
 * 'fix' issues trigger the single repair call; 'warn' issues surface to the UI.
 */
/**
 * Longest bullet that still fits one printed line in the one-page template.
 * Measured in the rendered PDF, not estimated: bullets up to 110 characters
 * render on one line with nothing wrapping, so that is the ceiling. Anything
 * longer genuinely wraps and silently grows the page.
 */
export const ONE_PAGE_BULLET_MAX_CHARS = 110;

export function verifyResumeContent(content, analysis = {}, length = 'two-page') {
  const issues = [];
  const push = (code, severity, section, message) => issues.push({ code, severity, section, message });

  // The education entry carries the degree and its dates. The model writes the
  // profile, highlights and bullets freely, and that is where a graduation date
  // or student framing creeps back in.
  for (const [section, text] of [
    ['profile', asArray(content.profileSentences).join(' ')],
    ['highlights', asArray(content.highlights).join(' ')],
    ...asArray(content.experience).map(e => [`experience:${e.key}`, asArray(e.bullets).join(' ')]),
    ...asArray(content.projects).map(p => [`project:${p.key}`, asArray(p.bullets).join(' ')]),
  ]) {
    const claim = findGraduationMention(text);
    if (claim) {
      push('graduation-mention', 'fix', section,
        `says "${claim}" — drop it; the Education entry already carries the degree and its dates`);
    }
  }

  // On one page every bullet must fit a single line, or the resume silently
  // grows past the page. The prompt asks for this and the model overshoots, so
  // it is enforced here and handed to the repair pass to rewrite shorter.
  if (length === 'one-page') {
    const longBullets = [
      ...content.experience.flatMap(entry => entry.bullets.map(bullet => ({ section: `experience:${entry.key}`, bullet }))),
      ...content.projects.flatMap(project => project.bullets.map(bullet => ({ section: `project:${project.key}`, bullet }))),
      ...content.extracurricular.map(entry => ({ section: `extracurricular:${entry.key}`, bullet: entry.bullet })),
    ].filter(item => item.bullet.length > ONE_PAGE_BULLET_MAX_CHARS);
    // Shortening must not hollow the bullets out. A page of unquantified
    // one-liners reads as filler, which is worse than a slightly longer page.
    const contentBullets = [
      ...content.experience.flatMap(entry => entry.bullets),
      ...content.projects.flatMap(project => project.bullets),
    ];
    // A JD keyword stapled to the end of a bullet is the clearest tell that the
    // resume was machine-written: the phrase is grammatically dangling and says
    // nothing. Real examples: "...and software development", "...to enforce
    // software development", "...improving platform functionality".
    const STAPLED_TAIL = /(?:and|to (?:ensure|enforce|support|drive|improve)|improving|strengthening|ensuring)\s+(?:software development|technical excellence|high[- ]quality|user engagement metrics|platform functionality|business needs|operational efficiency|project quality|system efficiency)\s*$/i;
    for (const entry of content.experience) {
      for (const bullet of entry.bullets) {
        if (STAPLED_TAIL.test(bullet)) {
          push('stapled-keyword-tail', 'fix', `experience:${entry.key}`,
            `bullet ends on a stapled keyword phrase that says nothing: "${bullet.slice(-46)}". End on the concrete result or a number instead`);
        }
      }
    }
    for (const project of content.projects) {
      for (const bullet of project.bullets) {
        if (STAPLED_TAIL.test(bullet)) {
          push('stapled-keyword-tail', 'fix', `project:${project.key}`,
            `bullet ends on a stapled keyword phrase that says nothing: "${bullet.slice(-46)}". End on the concrete result or a number instead`);
        }
      }
    }

    const quantified = contentBullets.filter(bullet => /\d/.test(bullet));
    // Half is the practical bar: some true bullets (a protocol implemented, a
    // system built) carry no honest number, and inventing one is worse.
    if (contentBullets.length > 0 && quantified.length < Math.ceil(contentBullets.length * 0.5)) {
      push('bullets-unquantified', 'fix', 'bullets',
        `only ${quantified.length} of ${contentBullets.length} bullets carry a number; at least 60% must state a concrete figure from the master resume. Replace vague tails such as "to improve efficiency" with the actual metric`);
    }

    for (const item of longBullets) {
      push('bullet-too-long', 'fix', item.section,
        `bullet is ${item.bullet.length} characters and wraps to a second line; rewrite it under ${ONE_PAGE_BULLET_MAX_CHARS} characters (about 12-15 words) keeping the metric and the JD keyword: "${item.bullet.slice(0, 60)}..."`);
    }
  }

  // Structure
  // Structural counts differ by format: the one-page template has no Highlights
  // section and holds a two-sentence profile, so the two-page counts would fire
  // against content that is exactly right for the page it renders on.
  const onePageFormat = length === 'one-page';
  const sentenceTotal = content.profileSentences.length;
  if (onePageFormat ? sentenceTotal !== 2 : (sentenceTotal < 3 || sentenceTotal > 4)) {
    push('profile-sentence-count', 'fix', 'profile',
      `profile has ${sentenceTotal} sentences; needs ${onePageFormat ? 'exactly 2 (one page)' : '3-4'}`);
  }
  if (!onePageFormat && content.highlights.length !== 4) {
    push('highlights-count', 'fix', 'highlights', `highlights has ${content.highlights.length} bullets; needs exactly 4`);
  }
  if (content.skills.length !== 5) {
    push('skills-rows', 'fix', 'skills', `skills table has ${content.skills.length} rows; needs exactly 5`);
  }
  // Row size: target 5-7. Rows were previously padded to 6-9 purely so the line
  // rendered full, which produced 30-45 skills and read as an implausible
  // "knows everything" list. Underfilled pages are the page-fill expander's job,
  // not the skills row's. The Databases row stays at its true 5.
  for (const row of content.skills) {
    if (row.items.length < 4) {
      push('skills-row-sparse', 'fix', 'skills',
        `skills row "${row.category}" lists only ${row.items.length} item(s); target 5-7 JD-relevant skills the candidate genuinely has`);
    } else if (row.items.length > 8) {
      push('skills-row-overfull', 'fix', 'skills',
        `skills row "${row.category}" lists ${row.items.length} items; cap at 7 — an over-long row reads as padding and dilutes the JD-relevant skills`);
    }
  }

  // Credibility checks: the three ways a truthful skills row still reads junior.
  const skillItems = content.skills.flatMap(row =>
    row.items.map(item => ({ row: row.category, item, key: item.trim().toLowerCase() })));

  for (const { row, item, key } of skillItems) {
    if (BANNED_SKILL_ITEMS.some(banned => key === banned || key.startsWith(`${banned} `))) {
      push('skills-too-granular', 'fix', 'skills',
        `skills row "${row}" lists "${item}"; a library function or vendor API name belongs in a project stack line, not a headline skill`);
    }
  }

  const firstRowFor = new Map();
  for (const { row, item, key } of skillItems) {
    if (firstRowFor.has(key) && firstRowFor.get(key) !== row) {
      push('skills-duplicate', 'fix', 'skills',
        `"${item}" appears in both "${firstRowFor.get(key)}" and "${row}"; list each skill once`);
    } else if (!firstRowFor.has(key)) {
      firstRowFor.set(key, row);
    }
  }

  const skillKeys = new Set(skillItems.map(entry => entry.key));
  for (const [specific, general] of REDUNDANT_SKILL_PAIRS) {
    if (skillKeys.has(specific) && skillKeys.has(general)) {
      push('skills-redundant', 'fix', 'skills',
        `"${specific}" is a kind of "${general}" — listing both is padding; keep one`);
    }
  }
  if (content.projects.length !== 3) {
    push('project-count', 'fix', 'projects', `resume selects ${content.projects.length} projects; needs exactly 3`);
  }
  for (const project of content.projects) {
    if (!project.stack) {
      push('project-stack-missing', 'fix', `project:${project.key}`, `project ${project.key} is missing its Stack bullet`);
    }
    if (project.bullets.length < 2) {
      push('project-bullets-min', 'fix', `project:${project.key}`, `project ${project.key} has ${project.bullets.length} content bullets; needs 2-3`);
    }
    if (project.bullets.length > 3) {
      push('project-bullets-max', 'warn', `project:${project.key}`, `project ${project.key} has ${project.bullets.length} content bullets; cap is 3`);
    }
  }
  const experienceKeys = content.experience.map(entry => entry.key);
  if (content.experience.length !== MAX_EXPERIENCE_ENTRIES) {
    push('experience-count', 'fix', 'experience',
      `resume shows ${content.experience.length} roles; page 1 fits exactly ${MAX_EXPERIENCE_ENTRIES} (always oer and kingdom, plus ONE of olive-branch or home-depot chosen for this JD)`);
  }
  // Only entries flagged required are mandatory; the rest are selected when the
  // JD calls for them (Home Depot for client-facing/service/retail roles).
  for (const [key, fixed] of Object.entries(EXPERIENCE_CATALOG)) {
    if (fixed.required && !experienceKeys.includes(key)) {
      push('experience-missing', 'fix', `experience:${key}`, `required experience entry "${key}" is missing`);
    }
  }
  // Applying back to a past employer: their own role is the strongest evidence
  // on the page and dropping it is indefensible, so it outranks JD relevance.
  const employerKey = experienceKeyForEmployer(analysis.company);
  if (employerKey && !experienceKeys.includes(employerKey)) {
    push('experience-employer-missing', 'fix', `experience:${employerKey}`,
      `this posting is from ${analysis.company}, where the candidate already works: slot 2 MUST be "${employerKey}" (${EXPERIENCE_CATALOG[employerKey].title}). Drop the other optional role to make room.`);
  }
  for (const entry of content.experience) {
    const bounds = EXPERIENCE_CATALOG[entry.key];
    if (entry.bullets.length < bounds.minBullets || entry.bullets.length > bounds.maxBullets) {
      push('experience-bullets', 'fix', `experience:${entry.key}`,
        `${entry.key} has ${entry.bullets.length} bullets; needs ${bounds.minBullets}-${bounds.maxBullets}`);
    }
    // A recruiter skims for numbers. Every role in the sources has at least one
    // quantifiable fact available, so a role with none means the model chose
    // vague phrasing over the evidence it was given.
    if (!EXPERIENCE_CATALOG[entry.key]?.quantifyOptional
        && entry.bullets.length > 0 && !entry.bullets.some(bullet => /\d/.test(bullet))) {
      push('experience-unquantified', 'fix', `experience:${entry.key}`,
        `no bullet for "${entry.key}" contains a number; quantify at least one (users served, percent improved, people trained, systems handled) using a figure from the sources`);
    }
  }
  const extracurricularKeys = content.extracurricular.map(entry => entry.key);
  for (const [key, fixed] of Object.entries(EXTRACURRICULAR_CATALOG)) {
    // One page carries a single leadership line, and that line is the NASA
    // entry, so only that one stays required; the rest do not apply.
    const requiredHere = onePageFormat ? key === 'nasa-space-apps' : fixed.required;
    if (requiredHere && !extracurricularKeys.includes(key)) {
      push('extracurricular-missing', 'fix', 'extracurricular', `required extracurricular entry "${key}" is missing`);
    }
  }
  if (onePageFormat ? content.extracurricular.length !== 1 : (content.extracurricular.length < 2 || content.extracurricular.length > 3)) {
    push('extracurricular-count', 'fix', 'extracurricular',
      `extracurricular has ${content.extracurricular.length} entries; needs 2-3`);
  }
  if (content.educationCoursework.length < 4 || content.educationCoursework.length > 5) {
    push('coursework-count', 'warn', 'education',
      `coursework lists ${content.educationCoursework.length} subjects; target is 4-5`);
  }

  // Profile voice
  const profileText = content.profileSentences.join(' ');
  if (/\b(?:girish|bhuteja)\b/i.test(profileText)) {
    push('profile-name', 'fix', 'profile', 'profile mentions the candidate name; use impersonal resume voice');
  }
  const thirdPerson = profileText.match(/\b(?:he|his|him|she|her)\b/i);
  if (thirdPerson) {
    push('profile-third-person', 'fix', 'profile', `profile uses third-person pronoun "${thirdPerson[0]}"`);
  }
  if (/^(?:computer science|cs honours|bachelor|b\.?sc?\.?|honours candidate|graduating|recent graduate)/i.test(profileText.trim())) {
    push('profile-education-first', 'fix', 'profile', 'profile opens with education/credentials; lead with value and capabilities');
  }
  const profileBanned = findPhrase(profileText, [...BANNED_PROFILE_PHRASES, 'proven track record']);
  if (profileBanned) {
    push('profile-banned-phrase', 'fix', 'profile', `profile contains banned phrase "${profileBanned}"`);
  }

  // Recruiters search their ATS by the exact posting title, so a resume that never
  // states it is invisible to that search. Jobscan flags the same thing. The profile
  // is the right home for it — Girish has not held these titles, so it belongs in a
  // summary statement rather than the experience section.
  if (analysis.jobTitle && !profileHasJobTitle(content, analysis.jobTitle)) {
    push('job-title-missing', 'fix', 'profile',
      `profile never states the posting title "${analysis.jobTitle}"; recruiters search on it`);
  }

  // Whole-resume language
  const allSections = collectResumeTextSections(content);
  for (const { section, text } of allSections) {
    const firstPerson = text.match(/\b(?:I|me|my|mine|we|our|ours|us)\b/);
    if (firstPerson) {
      push('first-person', 'fix', section, `contains first-person wording "${firstPerson[0]}"`);
    }
    const powerVerb = BANNED_POWER_VERBS.find(verb => new RegExp(`\\b${verb}\\b`, 'i').test(text));
    if (powerVerb) {
      push('power-verb', 'fix', section, `uses overstated verb "${powerVerb}"; use built/led/designed/managed instead`);
    }
    const filler = findPhrase(text, BANNED_RESUME_PHRASES);
    if (filler) {
      push('ai-filler', 'fix', section, `contains AI/generic filler "${filler}"`);
    }
    const tripwire = FABRICATION_TRIPWIRES.find(term => new RegExp(`\\b${term}\\b`, 'i').test(text));
    if (tripwire) {
      push('fabrication-tripwire', 'fix', section, `claims "${tripwire}" which is not in the master resume; remove it`);
    }
  }

  // Duplicate leading verbs (page-level rule; warn only)
  const pageOneBullets = [
    ...content.highlights,
    ...content.experience.flatMap(entry => entry.bullets),
  ];
  const pageTwoBullets = [
    ...content.projects.flatMap(project => project.bullets),
    ...content.extracurricular.map(entry => entry.bullet),
  ];
  for (const [page, bullets] of [['page 1', pageOneBullets], ['page 2', pageTwoBullets]]) {
    const seen = new Map();
    for (const bullet of bullets) {
      const lead = bullet.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '');
      if (lead) seen.set(lead, (seen.get(lead) ?? 0) + 1);
    }
    for (const [lead, count] of seen) {
      const looksLikeVerb = /ed$/.test(lead) || ['built', 'led'].includes(lead);
      if (count > 1 && looksLikeVerb) {
        push('duplicate-lead-verb', 'warn', page, `${count} bullets on ${page} start with "${lead}"; vary the leading verbs`);
      }
    }
  }

  // Bullet length targets (warn only — page fill happens through richer bullets).
  // Skipped for one page, where bullets are deliberately cut to a single line
  // and this would contradict the bullet-too-long rule above.
  const shortBullets = length === 'one-page' ? [] :
    [...content.experience.flatMap(e => e.bullets), ...content.projects.flatMap(p => p.bullets)]
      .filter(bullet => bullet.split(/\s+/).length < 12);
  if (shortBullets.length > 2) {
    push('short-bullets', 'warn', 'bullets',
      `${shortBullets.length} experience/project bullets are under 12 words; expand with technical detail from the master resume`);
  }

  // Overflow risk before rendering
  const projectBulletItems = countProjectBulletItems(content);
  if (projectBulletItems > 11 && content.extracurricular.length >= 3) {
    push('overflow-risk', 'warn', 'page 2',
      `${projectBulletItems} project bullets with 3 extracurricular entries will overflow to page 3`);
  }

  // Keyword coverage
  const keywordCoverage = buildKeywordCoverage(content, analysis.mustHaveKeywords ?? []);
  const missing = keywordCoverage.filter(entry => !entry.present);
  if (missing.length > 0) {
    push('missing-keywords', missing.length >= 2 ? 'fix' : 'warn', 'keywords',
      `JD must-have keywords not found in the resume: ${missing.map(entry => entry.keyword).join(', ')}. Add each one naturally ONLY where the master resume truthfully supports it; skip any the candidate does not have.`);
  }

  return { issues, keywordCoverage };
}

// ── Leading-verb variety (deterministic, no LLM) ─────────────────────────────

// Resume-safe synonym families: every replacement describes the same action at
// the same level of honesty, so a swap can never fabricate or inflate a claim.
const LEAD_VERB_SYNONYMS = {
  built: ['developed', 'created', 'engineered', 'constructed', 'designed', 'implemented'],
  developed: ['built', 'created', 'engineered', 'designed'],
  created: ['built', 'developed', 'produced', 'designed'],
  engineered: ['built', 'developed', 'implemented', 'designed'],
  implemented: ['built', 'developed', 'integrated', 'engineered'],
  designed: ['created', 'developed', 'built', 'architected'],
  architected: ['designed', 'built', 'engineered'],
  constructed: ['built', 'developed'],
  produced: ['created', 'developed'],
  managed: ['led', 'coordinated', 'oversaw', 'directed'],
  led: ['directed', 'managed', 'coordinated'],
  directed: ['led', 'managed', 'coordinated'],
  oversaw: ['managed', 'led'],
  coordinated: ['organized', 'managed', 'led'],
  organized: ['coordinated', 'planned', 'led'],
  planned: ['organized', 'coordinated'],
  automated: ['streamlined'],
  streamlined: ['automated', 'simplified'],
  analyzed: ['examined', 'assessed', 'investigated'],
  examined: ['analyzed', 'assessed'],
  deployed: ['shipped', 'launched', 'released'],
  launched: ['deployed', 'released'],
  maintained: ['managed', 'supported'],
  supported: ['assisted', 'maintained'],
  integrated: ['connected', 'implemented'],
  optimized: ['improved', 'refined', 'streamlined'],
  improved: ['enhanced', 'strengthened', 'optimized'],
  enhanced: ['improved', 'strengthened'],
  delivered: ['shipped', 'produced'],
  wrote: ['authored'],
};

function leadWordOf(bullet) {
  return bullet.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
}

function matchCase(original, replacement) {
  return /^[A-Z]/.test(original)
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

/**
 * Deterministically fix duplicate leading verbs per page: the first occurrence
 * keeps its verb, later duplicates get a same-family synonym not already used
 * on that page. Only the first word of a bullet ever changes. Verbs without a
 * safe synonym are left alone (they stay as a warning). No LLM calls.
 * Returns { content, changes: string[] }.
 */
export function varyLeadingVerbs(content) {
  const next = {
    ...content,
    highlights: [...content.highlights],
    experience: content.experience.map(entry => ({ ...entry, bullets: [...entry.bullets] })),
    projects: content.projects.map(project => ({ ...project, bullets: [...project.bullets] })),
    extracurricular: content.extracurricular.map(entry => ({ ...entry })),
  };
  const changes = [];

  // Page-wise bullet references (get/set so we can rewrite in place).
  const pages = [
    ['page 1', [
      ...next.highlights.map((_, i) => ({
        get: () => next.highlights[i],
        set: value => { next.highlights[i] = value; },
      })),
      ...next.experience.flatMap(entry => entry.bullets.map((_, i) => ({
        get: () => entry.bullets[i],
        set: value => { entry.bullets[i] = value; },
      }))),
    ]],
    ['page 2', [
      ...next.projects.flatMap(project => project.bullets.map((_, i) => ({
        get: () => project.bullets[i],
        set: value => { project.bullets[i] = value; },
      }))),
      ...next.extracurricular.map(entry => ({
        get: () => entry.bullet,
        set: value => { entry.bullet = value; },
      })),
    ]],
  ];

  for (const [page, refs] of pages) {
    const used = new Set();
    for (const ref of refs) {
      const bullet = ref.get();
      const lead = leadWordOf(bullet);
      if (!lead) continue;
      if (!used.has(lead)) {
        used.add(lead);
        continue;
      }
      const synonyms = LEAD_VERB_SYNONYMS[lead] ?? [];
      const replacement = synonyms.find(candidate => !used.has(candidate));
      if (!replacement) continue; // no safe swap — verifier keeps the warning
      const firstWord = bullet.split(/\s+/)[0];
      ref.set(`${matchCase(firstWord, replacement)}${bullet.slice(firstWord.length)}`);
      used.add(replacement);
      changes.push(`${page}: "${lead}" → "${replacement}"`);
    }
  }

  return { content: next, changes };
}

// ── Overflow trimming (deterministic, no LLM) ────────────────────────────────

/**
 * Apply exactly one trim step, in priority order. Returns { content, action }
 * where action is null when nothing more can be trimmed.
 */
export function trimResumeForOverflow(content) {
  const next = {
    ...content,
    highlights: [...content.highlights],
    experience: content.experience.map(entry => ({ ...entry, bullets: [...entry.bullets] })),
    projects: content.projects.map(project => ({ ...project, bullets: [...project.bullets] })),
    extracurricular: [...content.extracurricular],
  };

  if (next.extracurricular.length > 2) {
    const dropped = next.extracurricular.pop();
    return { content: next, action: `dropped extracurricular entry "${dropped.key}"` };
  }

  const candidates = next.projects
    .map((project, index) => ({ project, index }))
    .filter(entry => entry.project.bullets.length > 2)
    .sort((a, b) => b.project.bullets.length - a.project.bullets.length || b.index - a.index);
  if (candidates.length > 0) {
    const { project } = candidates[0];
    project.bullets.pop();
    return { content: next, action: `trimmed a content bullet from project "${project.key}"` };
  }

  if (next.highlights.length > 3) {
    next.highlights = next.highlights.slice(0, -1);
    return { content: next, action: 'dropped the last highlight' };
  }

  const oer = next.experience.find(entry => entry.key === 'oer');
  if (oer && oer.bullets.length > 2) {
    oer.bullets.pop();
    return { content: next, action: 'dropped the 3rd OER experience bullet' };
  }

  const oliveBranch = next.experience.find(entry => entry.key === 'olive-branch');
  if (oliveBranch && oliveBranch.bullets.length > 2) {
    oliveBranch.bullets.pop();
    return { content: next, action: 'dropped the 3rd Olive Branch experience bullet' };
  }

  const lastResort = next.projects
    .map((project, index) => ({ project, index }))
    .filter(entry => entry.project.bullets.length > 1)
    .sort((a, b) => b.index - a.index);
  if (lastResort.length > 0) {
    const { project } = lastResort[0];
    project.bullets.pop();
    return { content: next, action: `trimmed project "${project.key}" to 1 content bullet (last resort)` };
  }

  return { content: next, action: null };
}

// ── Under-fill expansion (deterministic, no LLM) ─────────────────────────────

/**
 * A reserve bullet is only promotable when it passes the same language rules
 * the verifier enforces on rendered content, so expansion can never introduce
 * a violation (or a fabricated tech claim) that the repair pass already ran.
 */
function isPromotableBullet(text) {
  if (!text) return false;
  if (/\b(?:I|me|my|mine|we|our|ours|us|he|his|him|she|her)\b/.test(text)) return false;
  if (BANNED_POWER_VERBS.some(verb => new RegExp(`\\b${verb}\\b`, 'i').test(text))) return false;
  if (findPhrase(text, BANNED_RESUME_PHRASES)) return false;
  if (FABRICATION_TRIPWIRES.some(term => new RegExp(`\\b${term}\\b`, 'i').test(text))) return false;
  return true;
}

function takePromotableBullet(list) {
  while (list.length > 0) {
    const bullet = list.shift();
    if (isPromotableBullet(bullet)) return bullet;
  }
  return null;
}

/**
 * Apply exactly one expansion step for the given under-filled page, the
 * mirror image of trimResumeForOverflow. Content comes ONLY from the model's
 * reserve (already sanitized) or the fixed coursework catalog — never invented.
 * Returns { content, action } where action is null when nothing can expand.
 *
 * page: 'page1' (profile..experience) | 'page2' (.page-two: projects..certs)
 */
export function expandResumeForUnderfill(content, page) {
  const reserve = content.reserve ?? { experience: {}, projects: {}, extracurricular: [], profileSentence: '' };
  const next = {
    ...content,
    profileSentences: [...content.profileSentences],
    experience: content.experience.map(entry => ({ ...entry, bullets: [...entry.bullets] })),
    projects: content.projects.map(project => ({ ...project, bullets: [...project.bullets] })),
    educationCoursework: [...content.educationCoursework],
    extracurricular: [...content.extracurricular],
    reserve: {
      experience: Object.fromEntries(Object.entries(reserve.experience ?? {}).map(([key, list]) => [key, [...list]])),
      projects: Object.fromEntries(Object.entries(reserve.projects ?? {}).map(([key, list]) => [key, [...list]])),
      extracurricular: [...(reserve.extracurricular ?? [])],
      profileSentence: reserve.profileSentence ?? '',
    },
  };

  if (page === 'page1') {
    // Page 1's flexible blocks: experience bullets (oer/olive-branch up to
    // their catalog max), then a 4th profile sentence. Highlights and skills
    // have exact counts.
    for (const entry of next.experience) {
      const bounds = EXPERIENCE_CATALOG[entry.key];
      const spare = next.reserve.experience[entry.key];
      if (!bounds || !spare || entry.bullets.length >= bounds.maxBullets) continue;
      const bullet = takePromotableBullet(spare);
      if (!bullet) continue;
      entry.bullets.push(bullet);
      return { content: next, action: `added a reserve bullet to experience "${entry.key}"` };
    }
    if (next.reserve.profileSentence && next.profileSentences.length < 4) {
      next.profileSentences.push(next.reserve.profileSentence);
      next.reserve.profileSentence = '';
      return { content: next, action: 'added the reserve 4th profile sentence' };
    }
    return { content: next, action: null };
  }

  // page2 — fill projects first and hardest: the user wants page 2 packed with
  // JD-relevant project bullets, not left half-empty. Grow projects round-robin
  // (always feed the project with the fewest bullets) so all three deepen
  // evenly, then add a 3rd extracurricular and a 5th coursework subject, then
  // keep deepening projects up to MAX_PROJECT_BULLETS. The generate-docs loop
  // reverts the last add if it overflows to page 3, so this fills right up to
  // the edge. Every promoted bullet is a truthful, JD-tailored reserve bullet
  // the model wrote from the master CV — never fabricated.
  const growProjectsTo = (cap) => {
    const ordered = [...next.projects]
      .filter(p => (next.reserve.projects[p.key]?.length ?? 0) > 0 && p.bullets.length < cap)
      .sort((a, b) => a.bullets.length - b.bullets.length);
    for (const project of ordered) {
      const bullet = takePromotableBullet(next.reserve.projects[project.key]);
      if (!bullet) continue;
      project.bullets.push(bullet);
      return `added a JD-relevant bullet to project "${project.key}" (now ${project.bullets.length})`;
    }
    return null;
  };

  // 1) bring every project up to 3 content bullets
  let action = growProjectsTo(3);
  if (action) return { content: next, action };

  // 2) a 3rd extracurricular entry
  if (next.extracurricular.length < 3 && next.reserve.extracurricular.length > 0) {
    const entry = next.reserve.extracurricular.shift();
    if (isPromotableBullet(entry.bullet)) {
      next.extracurricular.push(entry);
      // Re-sort: a promoted entry must slot into date order, not land last.
      next.extracurricular = sortChronologically(
        next.extracurricular,
        item => EXTRACURRICULAR_CATALOG[item.key].dateRange,
      );
      return { content: next, action: `added reserve extracurricular entry "${entry.key}"` };
    }
  }

  // 3) a 5th coursework subject
  if (next.educationCoursework.length < 5) {
    const selected = new Set(next.educationCoursework.map(item => item.toLowerCase()));
    const addition = ALLOWED_COURSEWORK.find(subject => !selected.has(subject.toLowerCase()));
    if (addition) {
      next.educationCoursework.push(addition);
      return { content: next, action: `added coursework subject "${addition}"` };
    }
  }

  // 4) keep deepening projects up to MAX_PROJECT_BULLETS each
  action = growProjectsTo(MAX_PROJECT_BULLETS);
  if (action) return { content: next, action };

  return { content: next, action: null };
}

// ── Cover letter checks ──────────────────────────────────────────────────────

function splitParagraphs(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

/**
 * Programmatic checks for the cover letter BODY text (no salutation/sign-off —
 * the locked template adds those). Returns [{ code, severity, message }].
 */
export function buildCoverLetterChecks(letterText, options = {}) {
  const issues = [];
  const push = (code, severity, message) => issues.push({ code, severity, message });
  // Models emit curly apostrophes ("I’m"), which are correct typography and are
  // left alone in the rendered PDF. Analysis normalizes them to straight quotes
  // so contraction and phrase matching does not silently miss them.
  letterText = String(letterText ?? '').replace(/[‘’]/g, "'");
  const text = String(letterText ?? '').trim();
  const paragraphs = splitParagraphs(text);
  const email = options.email ?? '';
  const phone = options.phone ?? '';

  if (paragraphs.length !== 3) {
    push('paragraph-count', 'fix', `letter has ${paragraphs.length} paragraphs; needs exactly 3`);
  }

  const gradMention = findGraduationMention(text);
  if (gradMention) {
    push('graduation-mention', 'fix',
      `letter says "${gradMention}" — drop it; sell capability, not schooling`);
  }

  // Under-length is 'fix': a short letter is a thin letter, and the repair pass
  // can only act on fix-severity issues. As a warning it was reported to the
  // user on every generation and never actually corrected.
  const wordCount = text ? text.split(/\s+/).length : 0;
  if (wordCount < 210 || wordCount > 330) {
    push('word-count', 'fix', `letter is ${wordCount} words; target 220-300`);
  }

  // Report EVERY banned phrase, not just the first: the repair pass rewrites
  // from these messages, so a hidden second phrase survives the repair.
  const coverLetterBanned = [...BANNED_COVER_LETTER_PHRASES, ...BANNED_COVER_LETTER_ONLY_PHRASES];
  const allBanned = coverLetterBanned
    .filter(phrase => text.toLowerCase().includes(phrase.toLowerCase()));
  if (allBanned.length > 1) {
    push('banned-phrase', 'fix',
      `letter contains banned phrases ${allBanned.map(phrase => `"${phrase}"`).join(', ')}; rewrite each of those sentences`);
  }
  const banned = allBanned.length > 1 ? null : findPhrase(text, coverLetterBanned);
  if (banned) {
    push('banned-phrase', 'fix', `letter contains banned phrase "${banned}"; rewrite that sentence`);
  }

  if (text.includes('—')) {
    push('em-dash', 'warn', 'letter contains em dashes; use commas or parentheses');
  }

  // Human-voice checks: letters with zero contractions and uniformly long
  // sentences read as machine-written to recruiters.
  const contractionMatches = text.match(/\b(?:I've|I'm|I'd|I'll|that's|it's|there's|what's|isn't|wasn't|don't|didn't|doesn't|can't|couldn't|wouldn't|won't|haven't|hasn't)\b/gi) ?? [];
  if (contractionMatches.length < 2) {
    push('no-contractions', 'fix',
      `letter uses ${contractionMatches.length} contraction(s); use at least 2 natural contractions (I've, I'm, that's, it's) so it reads as human writing`);
  }
  // Sentence rhythm is the single biggest "written by AI" tell: models produce
  // long, evenly-weighted sentences. These are 'fix' severity on purpose —
  // the repair pass only runs on fix issues, so as warnings they were reported
  // to the user on every generation and then never actually repaired.
  const sentences = text.split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(Boolean);
  // Exclude the mandatory contact sentence: it is boilerplate and about 8 words,
  // so counting it would satisfy the "has a short sentence" test on its own while
  // the actual body stayed uniformly long.
  const bodySentences = sentences.filter(sentence =>
    !(options.email && sentence.includes(options.email)) && !(options.phone && sentence.includes(options.phone)));
  const wordCounts = bodySentences.map(sentence => sentence.split(/\s+/).length);
  if (!wordCounts.some(count => count <= 8)) {
    push('uniform-sentences', 'fix',
      'every sentence is long; rewrite one sentence to under 8 words so the rhythm varies (this is what makes a letter read as human)');
  }
  const averageWords = wordCounts.length
    ? wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length
    : 0;
  if (averageWords > 24) {
    push('long-sentences', 'fix',
      `sentences average ${Math.round(averageWords)} words; split the longest ones so the average is under 20 (long even sentences are the main reason a letter reads as machine-written)`);
  }

  // The opening sentence is the hook. A sentence with no proper noun, no
  // first-person reference and no number is a general truism about the
  // industry, which is the one thing an opener must never be.
  // The recruiter reads both documents together, so the letter may only tell
  // stories the tailored resume actually supports.
  const resumeMarkdown = String(options.resumeMarkdown ?? '');
  if (resumeMarkdown) {
    const offResume = CANDIDATE_ORGANISATIONS
      .filter(org => text.toLowerCase().includes(org.toLowerCase())
        && !resumeMarkdown.toLowerCase().includes(org.toLowerCase()))
      // "Home Depot" inside "The Home Depot" is one organisation, not two.
      .filter((org, _index, list) => !list.some(other => other !== org && other.toLowerCase().includes(org.toLowerCase())));
    if (offResume.length > 0) {
      push('evidence-not-on-resume', 'fix',
        `letter builds on ${offResume.map(org => `"${org}"`).join(', ')}, which the tailored resume for this application does not mention; use evidence that appears on the resume so both documents tell one story`);
    }
  }

  // The company research is injected into the prompt with instructions to build
  // paragraph 1 and 3 around one specific fact, and the model routinely ignored
  // it and wrote a platitude instead. Require at least one distinctive proper
  // noun from the research to actually appear in the letter.
  const research = String(options.companyResearch ?? '');
  if (research) {
    const company = String(options.company ?? '').trim();
    const terms = [...new Set(research.match(/\b[A-Z][A-Za-zÀ-ÿ]+(?:\s+[A-Z][A-Za-zÀ-ÿ]+)+\b|\b[A-Z]{3,}\b/g) ?? [])]
      .map(term => term.trim())
      .filter(term => term.length > 3
        && !(company && (term.includes(company) || company.includes(term)))
        && !/^(?:The|This|These|Their|Company|Research|Generated|Here)\b/.test(term));
    // Only enforce when the research genuinely carries specifics.
    if (terms.length >= 3 && !terms.some(term => text.includes(term))) {
      push('research-unused', 'fix',
        `letter uses none of the specific facts from the company research (${terms.slice(0, 5).join(', ')}); paragraph 1 or 3 must engage one of them concretely rather than describing the industry in general`);
    }
  }

  // "X is more than just Y. It's about Z" is the same rhetorical move as
  // "not just X, but Y" and reads as machine-written. It is written across two
  // sentences often enough that a single-sentence pattern misses it.
  const notJustPattern = /\b(?:more than just|not just|isn't just|is not just|isn't merely|is not merely|rather than simply)\b/i;
  if (notJustPattern.test(text)) {
    push('not-just-construction', 'fix',
      'letter uses a "more than just X, it is about Y" construction; state the point directly instead');
  }

  const firstSentence = bodySentences[0] ?? '';
  if (firstSentence) {
    // NOTE: there used to be a broader "generic-opener" check here that fired
    // when the first sentence had no proper noun, first-person reference or
    // number. It flagged genuinely good concrete hooks ("A single
    // configuration error in an open education platform can disrupt learning
    // for an entire department"), and every real failure it caught was already
    // caught by the sharper pattern below, so it was removed.
    //
    // "Managing X requires an analyst who ..." describes the ROLE in the
    // abstract instead of hooking the reader. Naming the company inside it
    // does not make it specific.
    if (/^\W*\w+ing\b[^.!?]*\brequires?\b/i.test(firstSentence)
      || /\brequires? (?:a|an|the|someone|professionals?|analysts?|engineers?|developers?)\b/i.test(firstSentence)) {
      push('role-description-opener', 'fix',
        'the opening sentence describes what the job requires rather than hooking the reader; start with something the candidate did, saw, or built, not a definition of the role');
    }
  }
  // Duration claims ("three years of building...") must come from the sources;
  // the model cannot verify them, so keep them out entirely.
  const durationClaim = text.match(/\b(?:over|last|past|nearly|more than)?\s*(?:two|three|four|five|\d+)\+?\s+years?\b(?:\s+of)?\s+(?:experience|building|developing|working|writing|professional)/i);
  if (durationClaim) {
    push('duration-claim', 'fix',
      `letter states a years-of-experience figure ("${durationClaim[0].trim()}"); remove it — describe the work itself, never a duration the sources do not state`);
  }

  if (/^dear\b/i.test(text) || /\b(?:sincerely|best regards|kind regards|yours truly)\b/i.test(text)) {
    push('salutation-leak', 'fix', 'letter body must not include a salutation or sign-off; the template adds those');
  }

  if (paragraphs[0] && /^I\b/.test(paragraphs[0])) {
    push('opens-with-i', 'fix', 'paragraph 1 must not start with "I"; open with the company, role, or mission');
  }

  const lastParagraph = paragraphs[paragraphs.length - 1] ?? '';
  const hasContact = (email && lastParagraph.includes(email)) || (phone && lastParagraph.includes(phone));
  if ((email || phone) && !hasContact) {
    push('missing-contact', 'fix', `final paragraph must end with the contact sentence including ${email}${email && phone ? ' or ' : ''}${phone}`);
  }

  if (paragraphs.length >= 2) {
    const paragraphTwo = prepareTextForMatch(paragraphs[1]);
    const matched = KNOWN_TECH_VOCABULARY.filter(tool => textIncludesKeyword(paragraphTwo, tool));
    // Subsume overlapping names: "SQL" inside "SQL Server" is one mention, not two.
    const techMentions = matched.filter(tool => {
      const norm = normalizeForMatch(tool).trim();
      return !matched.some(other => {
        if (other === tool) return false;
        const otherNorm = normalizeForMatch(other).trim();
        return otherNorm.length > norm.length && ` ${otherNorm} `.includes(` ${norm} `);
      });
    });
    if (techMentions.length > 2) {
      push('tech-dump', 'fix',
        `paragraph 2 names ${techMentions.length} technologies (${techMentions.slice(0, 5).join(', ')}); keep at most 2 and focus on how the candidate thinks`);
    }
  }

  const tripwire = FABRICATION_TRIPWIRES.find(term => new RegExp(`\\b${term}\\b`, 'i').test(text));
  if (tripwire) {
    push('fabrication-tripwire', 'fix', `letter claims "${tripwire}" which is not in the master resume; remove it`);
  }

  return issues;
}
