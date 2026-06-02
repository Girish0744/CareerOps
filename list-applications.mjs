#!/usr/bin/env node
/**
 * list-applications.mjs — View applications from data/applications.json
 *
 * Usage:
 *   node list-applications.mjs                          List all
 *   node list-applications.mjs --status="Applied"       Filter by status
 *   node list-applications.mjs --id="company-role-date" Show one in detail
 *   node list-applications.mjs --open="company-role-date" Open application folder in explorer
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-zA-Z]+)(?:=(.+))?$/);
    if (match) result[match[1]] = match[2] ? match[2].replace(/^["']|["']$/g, '') : true;
  }
  return result;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function fmt(str, width) {
  if (!str) return '—'.padEnd(width);
  return str.length > width ? str.slice(0, width - 1) + '…' : str.padEnd(width);
}

const args = parseArgs(process.argv.slice(2));
const appsJsonPath = resolve(__dirname, 'data', 'applications.json');

const data = readJson(appsJsonPath);
if (!data || !data.applications || !data.applications.length) {
  console.log('No applications yet.');
  console.log('Create one: node new-application.mjs --company="..." --role="..."');
  process.exit(0);
}

let apps = data.applications;

// Filter by status
if (args.status) {
  apps = apps.filter(a => a.status && a.status.toLowerCase() === args.status.toLowerCase());
  if (!apps.length) {
    console.log(`No applications with status "${args.status}".`);
    process.exit(0);
  }
}

// Show one in detail
if (args.id) {
  const app = data.applications.find(a => a.id === args.id);
  if (!app) {
    console.error(`Application not found: ${args.id}`);
    process.exit(1);
  }

  console.log('');
  console.log(`${app.company} — ${app.jobTitle}`);
  console.log('='.repeat(60));
  console.log(`ID:           ${app.id}`);
  console.log(`Status:       ${app.status || '—'}`);
  console.log(`Score:        ${app.score ? `${app.score}/100` : '—'}${app.fitLevel ? ` (${app.fitLevel})` : ''}`);
  console.log(`Location:     ${app.location || '—'}`);
  console.log(`URL:          ${app.jobUrl || '—'}`);
  console.log(`Folder:       ${app.applicationFolder || '—'}`);
  console.log(`Created:      ${app.createdAt || '—'}`);
  console.log(`Updated:      ${app.updatedAt || '—'}`);
  console.log(`Applied:      ${app.appliedAt || '—'}`);
  console.log('');
  console.log('Documents:');
  console.log(`  Resume:         ${app.resumePath || 'not generated'}`);
  console.log(`  Cover Letter:   ${app.coverLetterPath || 'not generated'}`);
  console.log(`  Interview Prep: ${app.interviewPrepPath || 'not generated'}`);
  console.log(`  Report:         ${app.reportPath || 'not generated'}`);
  console.log(`  Notes:          ${app.notesPath || '—'}`);
  console.log('');

  // Check which files actually exist
  const folder = app.applicationFolder;
  if (folder) {
    const files = ['job-description.md', 'resume.md', 'resume.pdf', 'cover-letter.md', 'cover-letter.pdf', 'interview.md', 'notes.md', 'score.json', 'metadata.json'];
    const present = files.filter(f => existsSync(resolve(__dirname, folder, f)));
    console.log(`Files in folder: ${present.join(', ')}`);
  }
  process.exit(0);
}

// Open folder in explorer
if (args.open) {
  const app = data.applications.find(a => a.id === args.open);
  if (!app || !app.applicationFolder) {
    console.error(`Application or folder not found: ${args.open}`);
    process.exit(1);
  }
  const folderPath = resolve(__dirname, app.applicationFolder);
  const cmd = process.platform === 'win32' ? `explorer "${folderPath}"` :
               process.platform === 'darwin' ? `open "${folderPath}"` :
               `xdg-open "${folderPath}"`;
  exec(cmd);
  console.log(`Opening: ${folderPath}`);
  process.exit(0);
}

// Default: list all
const statusOrder = ['Interview', 'Applied', 'In Progress', 'Ready to Apply', 'Cover Letter Generated', 'Resume Generated', 'Saved', 'Offer', 'Rejected', 'Withdrawn'];
apps.sort((a, b) => {
  const ai = statusOrder.indexOf(a.status);
  const bi = statusOrder.indexOf(b.status);
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
});

const STATUS_COLORS = {
  'Interview':              '\x1b[32m', // green
  'Applied':                '\x1b[36m', // cyan
  'In Progress':            '\x1b[36m',
  'Offer':                  '\x1b[33m', // yellow
  'Ready to Apply':         '\x1b[34m', // blue
  'Cover Letter Generated': '\x1b[34m',
  'Resume Generated':       '\x1b[37m', // white
  'Saved':                  '\x1b[37m',
  'Rejected':               '\x1b[31m', // red
  'Withdrawn':              '\x1b[31m',
};
const RESET = '\x1b[0m';

console.log('');
console.log(`${fmt('Company', 20)} ${fmt('Role', 28)} ${fmt('Status', 22)} ${'Score'.padEnd(6)} ${'Date'.padEnd(12)} Docs`);
console.log('-'.repeat(100));

for (const app of apps) {
  const score = app.score ? String(app.score) : '—';
  const color = STATUS_COLORS[app.status] || '';
  const docs = [
    app.resumePath ? 'R' : '-',
    app.coverLetterPath ? 'C' : '-',
    app.interviewPrepPath ? 'I' : '-',
    app.reportPath ? 'E' : '-',
  ].join('');
  console.log(
    `${fmt(app.company, 20)} ${fmt(app.jobTitle, 28)} ${color}${fmt(app.status, 22)}${RESET} ${score.padEnd(6)} ${(app.createdAt || '—').padEnd(12)} ${docs}`
  );
}

console.log('');
console.log(`Total: ${apps.length} application(s)`);
console.log('');
console.log('Docs legend: R=Resume  C=Cover Letter  I=Interview Prep  E=Evaluation Report');
console.log('Commands:');
console.log('  node list-applications.mjs --id="<id>"      View details');
console.log('  node list-applications.mjs --status="..."   Filter');
console.log('  node update-status.mjs --id="<id>" --status="..."  Update status');
