#!/usr/bin/env node
/**
 * update-status.mjs — Update an application's status
 *
 * Usage:
 *   node update-status.mjs --id="openai-ai-engineer-2026-05-28" --status="Applied"
 *   node update-status.mjs --list
 *
 * Valid statuses:
 *   Saved | Resume Generated | Cover Letter Generated | Ready to Apply |
 *   Applied | In Progress | Interview | Offer | Rejected | Withdrawn
 *
 * Updates:
 *   applications/{id}/metadata.json
 *   data/applications.json
 *   data/applications.md (existing markdown tracker row)
 *
 * When status = "Interview", prints an interview prep reminder.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VALID_STATUSES = [
  'Saved',
  'Resume Generated',
  'Cover Letter Generated',
  'Ready to Apply',
  'Applied',
  'In Progress',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
];

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === '--list') { result.list = true; continue; }
    const match = arg.match(/^--([a-zA-Z]+)=(.+)$/);
    if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return result;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

const args = parseArgs(process.argv.slice(2));
const appsJsonPath = resolve(__dirname, 'data', 'applications.json');
const appsMdPath = resolve(__dirname, 'data', 'applications.md');

// --list: show all applications
if (args.list) {
  const data = readJson(appsJsonPath);
  if (!data || !data.applications.length) {
    console.log('No applications found in data/applications.json');
    process.exit(0);
  }
  console.log('\nApplications:\n');
  console.log(`${'ID'.padEnd(55)} ${'Status'.padEnd(22)} Score`);
  console.log('-'.repeat(85));
  for (const app of data.applications) {
    const score = app.score ? String(app.score) : '—';
    console.log(`${app.id.padEnd(55)} ${(app.status || '—').padEnd(22)} ${score}`);
  }
  console.log('');
  process.exit(0);
}

// Validate required args
if (!args.id || !args.status) {
  console.error('Usage:');
  console.error('  node update-status.mjs --id="<application-id>" --status="<new-status>"');
  console.error('  node update-status.mjs --list');
  console.error('');
  console.error('Valid statuses:', VALID_STATUSES.join(', '));
  process.exit(1);
}

if (!VALID_STATUSES.includes(args.status)) {
  console.error(`Invalid status: "${args.status}"`);
  console.error('Valid statuses:', VALID_STATUSES.join(', '));
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0];

// Update metadata.json
const metaPath = resolve(__dirname, 'applications', args.id, 'metadata.json');
if (!existsSync(metaPath)) {
  console.error(`Application folder not found: applications/${args.id}`);
  console.error('Run "node update-status.mjs --list" to see valid IDs.');
  process.exit(1);
}

const meta = readJson(metaPath);
const prevStatus = meta.status;
meta.status = args.status;
meta.updatedAt = today;
if (args.status === 'Applied' && !meta.appliedAt) {
  meta.appliedAt = today;
}
writeJson(metaPath, meta);

// Update data/applications.json
const appsData = readJson(appsJsonPath);
if (appsData) {
  const entry = appsData.applications.find(a => a.id === args.id);
  if (entry) {
    entry.status = args.status;
    entry.updatedAt = today;
    if (args.status === 'Applied' && !entry.appliedAt) entry.appliedAt = today;
    writeJson(appsJsonPath, appsData);
  }
}

// Update data/applications.md (update the status column of the matching row)
if (existsSync(appsMdPath)) {
  let md = readFileSync(appsMdPath, 'utf-8');
  // The markdown tracker uses the company name + role, not the ID.
  // Match by company + role derived from metadata.
  const company = meta.company;
  const role = meta.jobTitle;
  // Replace the status in the matching row — status is in column 6 (after Score)
  // Row format: | # | Date | Company | Role | Score | Status | PDF | Report | Notes |
  const lines = md.split('\n');
  const updated = lines.map(line => {
    if (!line.startsWith('|')) return line;
    const cols = line.split('|').map(c => c.trim());
    // cols[3] = Company, cols[4] = Role
    if (cols[3] === company && cols[4] === role) {
      cols[6] = ` ${args.status} `;
      return cols.join('|');
    }
    return line;
  });
  writeFileSync(appsMdPath, updated.join('\n'));
}

console.log(`Status updated: ${prevStatus} → ${args.status}`);
console.log(`Application:    ${args.id}`);
console.log(`Updated:        metadata.json, applications.json, applications.md`);

// Interview prep reminder
if (args.status === 'Interview') {
  console.log('');
  console.log('Interview stage! Generate your interview prep:');
  console.log('  /career-ops interview-prep');
  console.log('  (or paste the job URL again and say "prep for interview")');
  console.log('');
  console.log('Inputs it will use:');
  console.log(`  applications/${args.id}/job-description.md`);
  console.log(`  applications/${args.id}/resume.md`);
  console.log(`  applications/${args.id}/cover-letter.md`);
  console.log('  interview-prep/story-bank.md');
}
