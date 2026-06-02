#!/usr/bin/env node
/**
 * new-application.mjs — Initialize a per-job application folder
 *
 * Usage:
 *   node new-application.mjs --company="OpenAI" --role="AI Engineer" [--url="..."] [--location="Remote"]
 *
 * Creates:
 *   applications/{company-slug}-{role-slug}-{YYYY-MM-DD}/
 *     job-description.md
 *     metadata.json
 *     score.json
 *     notes.md
 *
 * Also appends an entry to data/applications.json.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-zA-Z]+)=(.+)$/);
    if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));

if (!args.company || !args.role) {
  console.error('Usage: node new-application.mjs --company="Company" --role="Role Title" [--url="..."] [--location="..."]');
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0];
const id = `${slugify(args.company)}-${slugify(args.role)}-${today}`;
const folderPath = resolve(__dirname, 'applications', id);

if (existsSync(folderPath)) {
  console.error(`Application folder already exists: applications/${id}`);
  console.error('To update an existing application, edit its files directly.');
  process.exit(1);
}

mkdirSync(folderPath, { recursive: true });

// job-description.md
writeFileSync(
  resolve(folderPath, 'job-description.md'),
  `# Job Description: ${args.role} at ${args.company}

**URL:** ${args.url || 'TBD'}
**Location:** ${args.location || 'TBD'}
**Date saved:** ${today}

---

<!-- Paste the full job description here -->
`
);

// metadata.json
const metadata = {
  id,
  company: args.company,
  jobTitle: args.role,
  location: args.location || null,
  jobUrl: args.url || null,
  status: 'Saved',
  createdAt: today,
  updatedAt: today,
  resumePath: null,
  coverLetterPath: null,
  interviewPrepPath: null,
  notesPath: `applications/${id}/notes.md`,
  reportPath: null,
  scorePath: `applications/${id}/score.json`
};

writeFileSync(resolve(folderPath, 'metadata.json'), JSON.stringify(metadata, null, 2));

// score.json — empty template, filled after evaluation
writeFileSync(
  resolve(folderPath, 'score.json'),
  JSON.stringify(
    {
      overallScore: null,
      fitLevel: null,
      categories: {
        experienceMatch: null,
        skillsMatch: null,
        roleLevelMatch: null,
        locationMatch: null,
        industryMatch: null,
        growthPotential: null,
        riskFactors: null
      },
      matchedKeywords: [],
      missingKeywords: [],
      recommendation: null,
      notes: null,
      evaluatedAt: null
    },
    null,
    2
  )
);

// notes.md
writeFileSync(
  resolve(folderPath, 'notes.md'),
  `# Notes: ${args.role} at ${args.company}\n\n`
);

// Update data/applications.json
const appsJsonPath = resolve(__dirname, 'data', 'applications.json');
let appsData = { applications: [] };

if (existsSync(appsJsonPath)) {
  try {
    appsData = JSON.parse(readFileSync(appsJsonPath, 'utf-8'));
    if (!Array.isArray(appsData.applications)) appsData.applications = [];
  } catch {
    appsData = { applications: [] };
  }
}

appsData.applications.push({
  id,
  company: args.company,
  jobTitle: args.role,
  location: args.location || null,
  jobUrl: args.url || null,
  status: 'Saved',
  score: null,
  fitLevel: null,
  applicationFolder: `applications/${id}`,
  resumePath: null,
  coverLetterPath: null,
  interviewPrepPath: null,
  notesPath: `applications/${id}/notes.md`,
  reportPath: null,
  createdAt: today,
  updatedAt: today,
  appliedAt: null
});

writeFileSync(appsJsonPath, JSON.stringify(appsData, null, 2));

console.log(`Application created: ${id}`);
console.log(`Folder:  applications/${id}/`);
console.log(`Files:   job-description.md, metadata.json, score.json, notes.md`);
console.log(`Tracker: data/applications.json updated (${appsData.applications.length} total)`);
console.log('');
console.log('Next steps:');
console.log('  1. Paste the job description into applications/' + id + '/job-description.md');
console.log('  2. Run /career-ops oferta to evaluate the job');
console.log('  3. Run /career-ops pdf to generate the tailored resume');
