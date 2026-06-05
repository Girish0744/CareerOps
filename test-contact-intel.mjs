import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const { extractPublicContactLeads } = await import(pathToFileURL(path.resolve('frontend/lib/contact-intel.js')).href);

const fixturesDir = path.resolve('tests/contact-fixtures');
const fixtures = fs.readdirSync(fixturesDir).filter(file => file.endsWith('.json')).sort();
let failed = 0;

for (const file of fixtures) {
  const fixture = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf-8'));
  const leads = extractPublicContactLeads(fixture);
  const expected = fixture.expected || {};
  const errors = [];

  if (leads.length < (expected.minContacts ?? 1)) {
    errors.push(`expected at least ${expected.minContacts} contacts, got ${leads.length}`);
  }
  if (expected.email && !leads.some(lead => lead.email === expected.email)) {
    errors.push(`missing expected email ${expected.email}`);
  }
  if (expected.linkedinUrl && !leads.some(lead => lead.linkedinUrl === expected.linkedinUrl)) {
    errors.push(`missing expected LinkedIn URL ${expected.linkedinUrl}`);
  }
  if (Array.isArray(expected.allowedSourceTypes)) {
    const allowed = new Set(expected.allowedSourceTypes);
    const unexpected = leads.filter(lead => !allowed.has(lead.sourceType));
    if (unexpected.length > 0) {
      errors.push(`unexpected source types: ${unexpected.map(lead => lead.sourceType).join(', ')}`);
    }
  }

  if (errors.length > 0) {
    failed++;
    console.error(`FAIL ${file}: ${errors.join('; ')}`);
  } else {
    console.log(`PASS ${file}: ${leads.length} contact(s)`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} contact fixture(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${fixtures.length} contact intelligence fixtures passed.`);
