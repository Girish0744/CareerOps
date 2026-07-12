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
  zonalyze: {
    name: 'Zonalyze - Business Feasibility Intelligence Platform',
    links: [{ label: 'github.com/Girish0744/Zonalyze', url: 'https://github.com/Girish0744/Zonalyze' }],
    dateRange: 'Jan 2026 - Present',
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
    title: 'Open Education Technology Project Assistant',
    company: 'Conestoga College, Waterloo, ON',
    dateRange: 'Jan 2025 - Present',
    note: 'Part-time and co-op role; converted to co-op based on performance; retained after departmental restructuring',
    minBullets: 2,
    maxBullets: 3,
  },
  'olive-branch': {
    title: 'Web and Tech Integration Specialist (Volunteer)',
    company: 'Olive Branch Mentorship Inc., Cambridge, ON',
    dateRange: 'May 2025 - Present',
    note: '',
    minBullets: 2,
    maxBullets: 2,
  },
};

export const EXTRACURRICULAR_CATALOG = {
  'it-club': { title: 'President, IT Club', organization: 'Conestoga College', dateRange: 'Apr 2025 - Present', required: true },
  hackthebrain: { title: 'Director, Student Success Team', organization: 'HackTheBrain, Toronto Tech Week', dateRange: 'Mar 2025 - Jul 2025', required: true },
  'ai-build-lab': { title: 'Area Leader, AI Build Lab', organization: 'Toronto Tech Week', dateRange: 'May 2026 - Jun 2026', required: false },
  mentor: { title: 'Student Experience Mentor', organization: 'Conestoga College', dateRange: 'Sept 2025 - Dec 2025', required: false },
  gdg: { title: 'Subcommittee Member', organization: 'GDG Waterloo', dateRange: 'Apr 2026 - Present', required: false },
};

export const EDUCATION_ENTRY = {
  title: 'Bachelor of Computer Science (Honours)',
  company: 'Conestoga College, Waterloo, ON',
  dateRange: 'Sept 2022 - Present',
  gpaBullet: 'GPA: 3.74/4.00; expected graduation August 2026',
};

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

export const CERTIFICATIONS_LINE = 'Java SE, Oracle, 2024 · OOP Using C++, Infosys Springboard, 2024 · CIPS Ontario Member, 2025';

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
];

// ── Language rules (enforced in code, mirrored in the prompt) ────────────────

export const BANNED_POWER_VERBS = ['Spearheaded', 'Championed', 'Orchestrated', 'Revolutionized', 'Pioneered'];

export const BANNED_RESUME_PHRASES = [
  'passionate about', 'excited to', 'team player', 'detail-oriented', 'results-driven',
  'innovative solutions', 'fast-paced environment', 'cutting-edge', 'leveraging',
  'utilized', 'utilizing', 'proven track record', 'adept at',
];

export const BANNED_PROFILE_PHRASES = ['expertise in', 'deep technical experience', 'possesses', 'utilizes'];

export const FABRICATION_TRIPWIRES = ['Golang', 'Spring Boot', 'Kubernetes', 'Kafka'];

export const BANNED_COVER_LETTER_PHRASES = [
  'I am writing to apply', 'I am passionate about', 'I would love the opportunity',
  'I believe I would be a great fit', 'I am eager', 'eager to contribute', 'excited to apply',
  'thrilled', 'leveraging', 'utilizing', 'utilize', 'robust', 'comprehensive',
  'extensive experience', 'technical rigors', 'enterprise-scale', 'dynamic environment',
  'cutting-edge', 'drive innovation', 'hit the ground running', 'synergy',
  'proven track record', 'adept at', 'perfect fit', 'uniquely qualified',
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

/**
 * Coerce the model's JSON into a clean, deterministic content object.
 * Unknown catalog keys are dropped (they get reported by verifyResumeContent
 * via structural checks). All text is sanitized: em dashes and trailing
 * bullet periods removed here so those rules never depend on the model.
 */
export function normalizeResumeContent(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  const profileSentences = asArray(source.profileSentences).map(sanitizeSentence).filter(Boolean);
  const highlights = asArray(source.highlights).map(sanitizeBullet).filter(Boolean);

  const skills = asArray(source.skills)
    .map(row => ({
      category: sanitizeInline(row?.category ?? '').replace(/:$/, '').replace(/\band\b/g, '&'),
      items: asArray(row?.items).map(sanitizeInline).filter(Boolean),
    }))
    .filter(row => row.category && row.items.length > 0);

  const experience = asArray(source.experience)
    .map(entry => ({
      key: String(entry?.key ?? '').trim(),
      bullets: asArray(entry?.bullets).map(sanitizeBullet).filter(Boolean),
    }))
    .filter(entry => EXPERIENCE_CATALOG[entry.key]);

  const projects = asArray(source.projects)
    .map(project => ({
      key: String(project?.key ?? '').trim(),
      stack: sanitizeBullet(project?.stack ?? '').replace(/^Stack:\s*/i, ''),
      bullets: asArray(project?.bullets).map(sanitizeBullet).filter(Boolean),
    }))
    .filter(project => PROJECT_CATALOG[project.key]);

  const educationCoursework = asArray(source.educationCoursework).map(sanitizeInline).filter(Boolean);

  const extracurricular = asArray(source.extracurricular)
    .map(entry => ({
      key: String(entry?.key ?? '').trim(),
      bullet: sanitizeBullet(entry?.bullet ?? ''),
    }))
    .filter(entry => EXTRACURRICULAR_CATALOG[entry.key] && entry.bullet);

  return { profileSentences, highlights, skills, experience, projects, educationCoursework, extracurricular };
}

// ── Markdown builder (the compatibility contract with document-renderer.ts) ──

export function buildResumeMarkdown(content, contact = {}) {
  const name = sanitizeInline(contact.name || 'Girish Bhuteja');
  const lines = [];

  lines.push(`# ${name}`, '');

  lines.push('## Profile', '', content.profileSentences.join(' '), '');

  lines.push('## Highlights of Qualifications', '');
  for (const highlight of content.highlights) lines.push(`- ${highlight}`);
  lines.push('');

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
    lines.push(`**${fixed.title}**, ${fixed.organization}`);
    lines.push(fixed.dateRange);
    lines.push(`- ${entry.bullet}`, '');
  }

  lines.push('## Awards and Recognition', '');
  for (const award of AWARDS) {
    lines.push(`**${award.name}** | ${award.institution}`);
    lines.push(award.date);
    lines.push(`- ${award.bullet}`, '');
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
export function verifyResumeContent(content, analysis = {}) {
  const issues = [];
  const push = (code, severity, section, message) => issues.push({ code, severity, section, message });

  // Structure
  const sentenceTotal = content.profileSentences.length;
  if (sentenceTotal < 3 || sentenceTotal > 4) {
    push('profile-sentence-count', 'fix', 'profile', `profile has ${sentenceTotal} sentences; needs 3-4`);
  }
  if (content.highlights.length !== 5) {
    push('highlights-count', 'fix', 'highlights', `highlights has ${content.highlights.length} bullets; needs exactly 5`);
  }
  if (content.skills.length !== 5) {
    push('skills-rows', 'fix', 'skills', `skills table has ${content.skills.length} rows; needs exactly 5`);
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
  for (const requiredKey of Object.keys(EXPERIENCE_CATALOG)) {
    if (!experienceKeys.includes(requiredKey)) {
      push('experience-missing', 'fix', `experience:${requiredKey}`, `required experience entry "${requiredKey}" is missing`);
    }
  }
  for (const entry of content.experience) {
    const bounds = EXPERIENCE_CATALOG[entry.key];
    if (entry.bullets.length < bounds.minBullets || entry.bullets.length > bounds.maxBullets) {
      push('experience-bullets', 'fix', `experience:${entry.key}`,
        `${entry.key} has ${entry.bullets.length} bullets; needs ${bounds.minBullets}-${bounds.maxBullets}`);
    }
  }
  const extracurricularKeys = content.extracurricular.map(entry => entry.key);
  for (const [key, fixed] of Object.entries(EXTRACURRICULAR_CATALOG)) {
    if (fixed.required && !extracurricularKeys.includes(key)) {
      push('extracurricular-missing', 'fix', 'extracurricular', `required extracurricular entry "${key}" is missing`);
    }
  }
  if (content.extracurricular.length < 2 || content.extracurricular.length > 3) {
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

  // Bullet length targets (warn only — page fill happens through richer bullets)
  const shortBullets = [...content.experience.flatMap(e => e.bullets), ...content.projects.flatMap(p => p.bullets)]
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

// ── Overflow trimming (deterministic, no LLM) ────────────────────────────────

/**
 * Apply exactly one trim step, in priority order. Returns { content, action }
 * where action is null when nothing more can be trimmed.
 */
export function trimResumeForOverflow(content) {
  const next = {
    ...content,
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

  const oer = next.experience.find(entry => entry.key === 'oer');
  if (oer && oer.bullets.length > 2) {
    oer.bullets.pop();
    return { content: next, action: 'dropped the 3rd OER experience bullet' };
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
  const text = String(letterText ?? '').trim();
  const paragraphs = splitParagraphs(text);
  const email = options.email ?? '';
  const phone = options.phone ?? '';

  if (paragraphs.length !== 3) {
    push('paragraph-count', 'fix', `letter has ${paragraphs.length} paragraphs; needs exactly 3`);
  }

  const wordCount = text ? text.split(/\s+/).length : 0;
  if (wordCount < 150 || wordCount > 400) {
    push('word-count', 'fix', `letter is ${wordCount} words; target 220-300`);
  } else if (wordCount < 200 || wordCount > 330) {
    push('word-count', 'warn', `letter is ${wordCount} words; target 220-300`);
  }

  const banned = findPhrase(text, BANNED_COVER_LETTER_PHRASES);
  if (banned) {
    push('banned-phrase', 'fix', `letter contains banned phrase "${banned}"; rewrite that sentence`);
  }

  if (text.includes('—')) {
    push('em-dash', 'warn', 'letter contains em dashes; use commas or parentheses');
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
