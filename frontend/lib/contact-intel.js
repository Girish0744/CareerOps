import crypto from 'crypto';

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const LINKEDIN_RE = /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/in\/[^\s<>)"']+/gi;

function stableId(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function cleanUrl(value) {
  return value.replace(/[.,;]+$/, '');
}

/**
 * @param {{
 *   company: string;
 *   jobTitle: string;
 *   jobDescription?: string;
 *   jobUrl?: string | null;
 *   publicNotes?: string;
 *   linkedinUrls?: string[];
 * }} input
 */
export function extractPublicContactLeads({
  company,
  jobTitle,
  jobDescription = '',
  jobUrl = null,
  publicNotes = '',
  linkedinUrls = [],
}) {
  const text = `${jobDescription}\n${publicNotes}`;
  const leads = new Map();

  const addLead = lead => {
    const key = lead.email || lead.linkedinUrl || `${lead.name}|${lead.sourceUrl}|${lead.title}`;
    if (!key) return;
    leads.set(key.toLowerCase(), {
      id: stableId(key),
      name: lead.name || 'Recruiting contact',
      title: lead.title || 'Recruiting / hiring contact',
      company,
      linkedinUrl: lead.linkedinUrl || null,
      email: lead.email || null,
      sourceUrl: lead.sourceUrl || jobUrl,
      sourceType: lead.sourceType || 'job-post',
      confidence: lead.confidence || 'medium',
      rationale: lead.rationale || `Potential contact for ${jobTitle} at ${company}.`,
    });
  };

  for (const email of text.match(EMAIL_RE) ?? []) {
    addLead({
      email: email.toLowerCase(),
      sourceUrl: jobUrl,
      sourceType: 'public-job-context',
      confidence: email.toLowerCase().includes('recruit') || email.toLowerCase().includes('talent') ? 'high' : 'medium',
      rationale: 'Email appeared in the public job/application context.',
    });
  }

  for (const url of text.match(LINKEDIN_RE) ?? []) {
    addLead({
      linkedinUrl: cleanUrl(url),
      sourceUrl: jobUrl,
      sourceType: 'public-job-context',
      confidence: 'medium',
      rationale: 'LinkedIn profile URL appeared in the public job/application context.',
    });
  }

  for (const url of linkedinUrls.filter(Boolean)) {
    addLead({
      linkedinUrl: cleanUrl(url),
      sourceUrl: cleanUrl(url),
      sourceType: 'user-provided-linkedin',
      confidence: 'user-provided',
      rationale: 'LinkedIn URL was provided manually by the user for this application.',
    });
  }

  if (leads.size === 0) {
    addLead({
      sourceUrl: jobUrl,
      sourceType: 'manual-research-needed',
      confidence: 'low',
      rationale: 'No explicit public contact was found yet. Use this placeholder to guide manual recruiter or hiring-manager research.',
    });
  }

  return Array.from(leads.values());
}

/**
 * @param {{ lead: Record<string, any>; app: { company: string; jobTitle: string } }} input
 */
export function fallbackOutreachDrafts({ lead, app }) {
  const firstName = lead.name && lead.name !== 'Recruiting contact'
    ? lead.name.split(/\s+/)[0]
    : 'there';
  return {
    linkedinConnectionNote: `Hi ${firstName}, I came across ${app.company}'s ${app.jobTitle} role and liked how close it feels to the full-stack and AI product work I enjoy building. I would be glad to connect and follow the team's work.`,
    linkedinFollowUp: `Thanks for connecting, ${firstName}. I am exploring the ${app.jobTitle} role at ${app.company} because it connects with the kind of practical full-stack and AI application work I have been building. If you are open to it, I would enjoy hearing what makes someone thrive on the team.`,
    coldEmailSubject: `${app.jobTitle} at ${app.company}`,
    coldEmailBody: `Hi ${firstName},\n\nI came across the ${app.jobTitle} role at ${app.company} and wanted to reach out directly. The role stood out because it connects with the kind of practical full-stack and AI application work I have been building with React, Node/TypeScript, C#, Python, and product-focused projects.\n\nI am graduating from Conestoga's Bachelor of Computer Science program in August 2026 and am looking for teams where I can contribute carefully, learn quickly, and build useful software. If you are close to this team, I would be grateful for any perspective on what the team values in strong early-career candidates.\n\nBest,\nGirish Bhuteja`,
  };
}
