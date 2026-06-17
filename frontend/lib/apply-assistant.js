import crypto from 'crypto';

function stableId(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
}

function cleanValue(value) {
  return String(value ?? '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function extractBlock(yml, blockName) {
  const lines = String(yml || '').split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `${blockName}:`);
  if (start === -1) return [];
  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim().endsWith(':')) break;
    if (/^\S/.test(line) && line.includes(':')) break;
    block.push(line);
  }
  return block;
}

function fieldFromBlock(block, key) {
  const pattern = new RegExp(`^\\s*${key}:\\s*(.*)$`);
  const match = block.find(line => pattern.test(line))?.match(pattern);
  return cleanValue(match?.[1] ?? '');
}

function boolFromValue(value) {
  if (typeof value === 'boolean') return value;
  const text = cleanValue(value).toLowerCase();
  if (['true', 'yes', 'y'].includes(text)) return true;
  if (['false', 'no', 'n'].includes(text)) return false;
  return null;
}

export function extractApplicantProfile(profileYml) {
  const candidate = extractBlock(profileYml, 'candidate');
  const location = extractBlock(profileYml, 'location');
  const availability = extractBlock(profileYml, 'availability');
  const apply = extractBlock(profileYml, 'apply');

  const fullName = fieldFromBlock(candidate, 'full_name');
  const applyCity = fieldFromBlock(apply, 'city');
  const locationCity = fieldFromBlock(location, 'city') || fieldFromBlock(candidate, 'location');
  const [cityPart = '', provincePart = ''] = (applyCity || locationCity).split(',').map(part => part.trim());
  const needsSponsorship = boolFromValue(fieldFromBlock(apply, 'needs_sponsorship'));

  return {
    legalName: fieldFromBlock(apply, 'legal_name') || fullName,
    preferredName: fieldFromBlock(apply, 'preferred_name') || fullName.split(/\s+/)[0] || '',
    fullName,
    email: fieldFromBlock(candidate, 'email'),
    phone: fieldFromBlock(candidate, 'phone'),
    addressLine1: fieldFromBlock(apply, 'address_line1'),
    addressLine2: fieldFromBlock(apply, 'address_line2'),
    city: applyCity || cityPart,
    province: fieldFromBlock(apply, 'province') || provincePart,
    country: fieldFromBlock(apply, 'country') || fieldFromBlock(location, 'country'),
    postalCode: fieldFromBlock(apply, 'postal_code'),
    linkedin: fieldFromBlock(candidate, 'linkedin'),
    portfolioUrl: fieldFromBlock(candidate, 'portfolio_url'),
    github: fieldFromBlock(candidate, 'github'),
    workAuthorization: fieldFromBlock(apply, 'work_authorization') || fieldFromBlock(location, 'visa_status'),
    needsSponsorship,
    availability: fieldFromBlock(apply, 'availability') || fieldFromBlock(availability, 'note') || fieldFromBlock(availability, 'full_time_start'),
    transcriptPath: fieldFromBlock(apply, 'transcript_path'),
  };
}

export function splitQuestions(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*0-9.)\s]+/, '').trim())
    .filter(line => line.length > 3)
    .slice(0, 40);
}

export function standardApplyFields(profile, app = {}) {
  const rows = [
    ['legal_name', 'Legal name', profile.legalName, 'profile.apply.legal_name or candidate.full_name'],
    ['email', 'Email', profile.email, 'profile.candidate.email'],
    ['phone', 'Phone', profile.phone, 'profile.candidate.phone'],
    ['linkedin', 'LinkedIn', profile.linkedin, 'profile.candidate.linkedin'],
    ['portfolio', 'Portfolio', profile.portfolioUrl, 'profile.candidate.portfolio_url'],
    ['github', 'GitHub', profile.github, 'profile.candidate.github'],
    ['address_line1', 'Street address', profile.addressLine1, 'profile.apply.address_line1'],
    ['address_line2', 'Apartment/unit', profile.addressLine2, 'profile.apply.address_line2'],
    ['city', 'City', profile.city, 'profile.apply.city or location.city'],
    ['province', 'Province', profile.province, 'profile.apply.province or location.city'],
    ['country', 'Country', profile.country, 'profile.apply.country or location.country'],
    ['postal_code', 'Postal code', profile.postalCode, 'profile.apply.postal_code'],
    ['work_authorization', 'Work authorization', profile.workAuthorization, 'profile.apply.work_authorization or location.visa_status'],
    ['sponsorship', 'Needs sponsorship', profile.needsSponsorship === null ? '' : (profile.needsSponsorship ? 'Yes' : 'No'), 'profile.apply.needs_sponsorship'],
    ['availability', 'Availability', profile.availability, 'profile.apply.availability or availability.note'],
    ['resume_upload', 'Resume upload', app.resumePath || '', 'application.resumePath'],
    ['cover_letter_upload', 'Cover letter upload', app.coverLetterPath || '', 'application.coverLetterPath'],
    ['transcript_upload', 'Transcript upload', profile.transcriptPath, 'profile.apply.transcript_path'],
  ];

  return rows.map(([key, label, value, source]) => ({
    id: stableId(`${key}:${label}`),
    key,
    label,
    value: cleanValue(value),
    fieldType: key.includes('upload') ? 'file' : key === 'sponsorship' ? 'yes_no' : 'standard',
    confidence: cleanValue(value) ? 'high' : 'needs_review',
    source,
    reviewed: false,
    needsReview: !cleanValue(value),
  }));
}

export function answerKnownQuestion(question, profile, app = {}) {
  const q = String(question || '').toLowerCase();
  const field = (key, label, value, source, fieldType = 'standard') => ({
    id: stableId(question),
    key,
    question,
    label,
    answer: cleanValue(value),
    fieldType,
    confidence: cleanValue(value) ? 'high' : 'needs_review',
    source,
    reviewed: false,
    needsReview: !cleanValue(value),
  });

  if (/email/.test(q)) return field('email', 'Email', profile.email, 'profile.candidate.email');
  if (/phone|mobile|telephone/.test(q)) return field('phone', 'Phone', profile.phone, 'profile.candidate.phone');
  if (/linkedin/.test(q)) return field('linkedin', 'LinkedIn', profile.linkedin, 'profile.candidate.linkedin');
  if (/portfolio|website|personal site/.test(q)) return field('portfolio', 'Portfolio', profile.portfolioUrl, 'profile.candidate.portfolio_url');
  if (/github/.test(q)) return field('github', 'GitHub', profile.github, 'profile.candidate.github');
  if (/address line 2|address 2|unit|apartment|apt|suite/.test(q)) return field('address_line2', 'Apartment/unit', profile.addressLine2, 'profile.apply.address_line2');
  if (/street address|address line 1|address 1|home address|mailing address|residential address|\baddress\b/.test(q)) return field('address_line1', 'Street address', profile.addressLine1, 'profile.apply.address_line1');
  if (/postal|zip/.test(q)) return field('postal_code', 'Postal code', profile.postalCode, 'profile.apply.postal_code');
  if (/city/.test(q)) return field('city', 'City', profile.city, 'profile.apply.city or location.city');
  if (/province|state/.test(q)) return field('province', 'Province', profile.province, 'profile.apply.province or location.city');
  if (/country/.test(q)) return field('country', 'Country', profile.country, 'profile.apply.country or location.country');
  if (/legal name|full name|your name|name/.test(q)) return field('legal_name', 'Legal name', profile.legalName, 'profile.apply.legal_name or candidate.full_name');
  if (/authorized|eligible|legally.*work|work.*canada/.test(q)) return field('work_authorization', 'Work authorization', profile.workAuthorization ? 'Yes' : '', 'profile.apply.work_authorization or location.visa_status', 'yes_no');
  if (/sponsor|sponsorship|visa/.test(q)) {
    const value = profile.needsSponsorship === null ? '' : (profile.needsSponsorship ? 'Yes' : 'No');
    return field('sponsorship', 'Needs sponsorship', value, 'profile.apply.needs_sponsorship', 'yes_no');
  }
  if (/resume/.test(q)) return field('resume_upload', 'Resume upload', app.resumePath || '', 'application.resumePath', 'file');
  if (/cover letter/.test(q)) return field('cover_letter_upload', 'Cover letter upload', app.coverLetterPath || '', 'application.coverLetterPath', 'file');
  if (/transcript/.test(q)) return field('transcript_upload', 'Transcript upload', profile.transcriptPath, 'profile.apply.transcript_path', 'file');
  return null;
}

function roleFocus(app = {}) {
  const title = String(app.jobTitle || '').toLowerCase();
  if (/ai|machine learning|\bml\b|data/.test(title)) {
    return 'AI, ML, and data work like ETHOS, Zonalyze, AegisGrid, and MediTwin, where I built pipelines, models, APIs, and user-facing tools';
  }
  if (/full.?stack|front.?end|react|next|web/.test(title)) {
    return 'full-stack work across React, TypeScript, FastAPI, Flask/Node.js, APIs, deployment, and user-facing product details';
  }
  if (/business analyst|systems analyst|system analyst|it analyst/.test(title)) {
    return 'analysis work that connects data, workflows, systems, and practical recommendations, including Zonalyze, dropout-risk analysis, and OER workflow automation';
  }
  if (/qa|quality assurance|test|tester/.test(title)) {
    return 'testing and quality work across MSTest, Catch2, Selenium, JMeter, accessibility testing, and defensive edge-case handling';
  }
  if (/help desk|support|technician|it technician/.test(title)) {
    return 'technical support work grounded in troubleshooting, user-facing communication, documentation, platform support, and trainer experience';
  }
  if (/backend|api|software developer|java|c#|python|\.net/.test(title)) {
    return 'software development work across APIs, OOP, C#, C++, Python, databases, testing, and practical systems';
  }
  return 'practical technology projects that connect technical implementation with real user needs';
}

export function fallbackWrittenAnswer(question, app = {}) {
  const role = app.jobTitle || 'role';
  const company = app.company || 'the team';
  const focus = roleFocus(app);
  return {
    id: stableId(question),
    key: 'written_response',
    question,
    label: question,
    answer: `What draws me to this ${role} role is the chance to keep building useful technology in a team setting. In my computer science degree, co-op work, and projects, I have focused on ${focus}. I am still early in my career, but I have shipped work used by real people, including OER tools used by 1,000+ students, full-stack and ML projects like Zonalyze and ETHOS, and practical systems built with testing and deployment in mind. I would bring that same careful, hands-on approach to ${company}.`,
    fieldType: 'written',
    confidence: 'medium',
    source: 'local fallback from application context',
    reviewed: false,
    needsReview: true,
  };
}
