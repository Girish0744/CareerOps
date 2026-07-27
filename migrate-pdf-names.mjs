/**
 * One-time migration: collapse the two PDFs per application down to one.
 *
 * Older folders hold BOTH an internal resume.pdf and a named copy
 * (Girish_Bhuteja_Resume.pdf). The copy was best-effort, so where a PDF viewer
 * held a Windows lock the named file is stale. This keeps whichever file is
 * NEWER under the named filename and removes the internal one.
 *
 *   node migrate-pdf-names.mjs --dry-run   # report only, changes nothing
 *   node migrate-pdf-names.mjs             # apply
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const APPS_DIR = path.join(ROOT, 'applications');
const APPS_JSON = path.join(ROOT, 'data', 'applications.json');
const DRY_RUN = process.argv.includes('--dry-run');

const TYPES = [
  { key: 'resume', legacy: 'resume.pdf', metaKey: 'resumePath' },
  { key: 'cover-letter', legacy: 'cover-letter.pdf', metaKey: 'coverLetterPath' },
];

function candidateName() {
  const p = path.join(ROOT, 'config', 'profile.yml');
  const yml = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  const block = yml.split(/^candidate:/m)[1] ?? '';
  const match = block.match(/^\s+full_name:\s*["']?([^"'\n]+)/m);
  const name = (match?.[1] ?? 'Candidate').trim();
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Candidate';
}

const SAFE = candidateName();
const namedFor = type => (type === 'resume' ? `${SAFE}_Resume.pdf` : `${SAFE}_Cover_Letter.pdf`);

const mtime = p => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : -1);

let renamed = 0, removed = 0, kept = 0, skipped = 0;
const notes = [];

if (!fs.existsSync(APPS_DIR)) {
  console.log('No applications/ directory. Nothing to migrate.');
  process.exit(0);
}

for (const folder of fs.readdirSync(APPS_DIR)) {
  const folderPath = path.join(APPS_DIR, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;

  for (const { key, legacy } of TYPES) {
    const legacyPath = path.join(folderPath, legacy);
    const namedPath = path.join(folderPath, namedFor(key));
    const hasLegacy = fs.existsSync(legacyPath);
    const hasNamed = fs.existsSync(namedPath);

    if (!hasLegacy && !hasNamed) continue;
    if (!hasLegacy) { kept++; continue; }

    if (!hasNamed) {
      notes.push(`  rename  ${folder}/${legacy} -> ${namedFor(key)}`);
      if (!DRY_RUN) fs.renameSync(legacyPath, namedPath);
      renamed++;
      continue;
    }

    // Both exist. The newer file is the real current render.
    const legacyNewer = mtime(legacyPath) > mtime(namedPath);
    notes.push(`  dedupe  ${folder}/${legacy} (${legacyNewer ? 'newer, promoted over stale named copy' : 'older, discarded'})`);
    if (DRY_RUN) { removed++; continue; }
    try {
      if (legacyNewer) fs.copyFileSync(legacyPath, namedPath);
      fs.unlinkSync(legacyPath);
      removed++;
    } catch (err) {
      notes.push(`  SKIP    ${folder}/${legacy}: ${err.code ?? err.message} (file locked? close any open PDF viewer)`);
      skipped++;
    }
  }
}

// Point tracker paths at the named file.
if (fs.existsSync(APPS_JSON)) {
  const data = JSON.parse(fs.readFileSync(APPS_JSON, 'utf-8'));
  let touched = 0;
  for (const app of data.applications ?? []) {
    for (const { key, legacy, metaKey } of TYPES) {
      if (typeof app[metaKey] === 'string' && app[metaKey].endsWith(`/${legacy}`)) {
        app[metaKey] = app[metaKey].replace(new RegExp(`/${legacy}$`), `/${namedFor(key)}`);
        touched++;
      }
    }
  }
  if (touched && !DRY_RUN) fs.writeFileSync(APPS_JSON, JSON.stringify(data, null, 2));
  notes.push(`  tracker paths updated: ${touched}`);
}

console.log(notes.join('\n') || '  (nothing to change)');
console.log(`\n${DRY_RUN ? '[dry run] would have' : 'Done:'} renamed ${renamed}, removed duplicate ${removed}, already-clean ${kept}, skipped ${skipped}`);
if (skipped) console.log('Re-run after closing any open PDF to finish the skipped files.');
