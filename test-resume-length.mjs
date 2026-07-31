#!/usr/bin/env node
// length:qa — verifies the deterministic one-page/two-page suggestion.
// No Gemini calls: the suggester is pure text analysis.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// The suggester is TypeScript; rewrite its one relative import so Node's
// type stripping can load it straight from source (no build step in QA).
const SRC = path.join(ROOT, 'frontend', 'lib', 'resume-length.ts');
const TMP = path.join(ROOT, 'frontend', 'lib', '.resume-length.qa.mts');
fs.writeFileSync(TMP, fs.readFileSync(SRC, 'utf-8')
  .replace("from './document-content-core.mjs'", "from './document-content-core.mjs'"));

let failures = 0;
function check(name, condition, detail = '') {
  const pass = Boolean(condition);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${!pass && detail ? ` — ${detail}` : ''}`);
}

try {
  const { suggestResumeLength, describeResumeLengthSuggestion } = await import(`file://${TMP}`);

  const cases = [
    {
      name: 'software engineering intern',
      title: 'Software Engineer Intern',
      jd: 'Internship for current students. 0-2 years. Python and React.',
      expect: 'one-page',
    },
    {
      name: 'new grad program',
      title: 'New Graduate Software Developer',
      jd: 'Our university recruiting program hires new grads each year.',
      expect: 'one-page',
    },
    {
      name: 'client-facing support role',
      title: 'Graduate Support Analyst',
      jd: 'Frontline support via phone and ticketing systems. Excellent communication required.',
      expect: 'one-page',
    },
    {
      name: 'senior multi-stack engineer',
      title: 'Senior Staff Software Engineer',
      jd: '8+ years required. Java, Kubernetes, Kafka, Terraform, AWS, Docker, React, Node.js, PostgreSQL, Redis, GraphQL, Python, TypeScript.',
      expect: 'two-page',
    },
    {
      name: 'mid-level developer, 3+ years',
      title: 'Software Developer',
      jd: '3+ years of experience building web applications with React and Node.js.',
      expect: 'two-page',
    },
  ];

  for (const testCase of cases) {
    const result = suggestResumeLength(testCase.jd, testCase.title);
    check(`${testCase.name} -> ${testCase.expect}`, result.length === testCase.expect,
      `got ${result.length} (${result.reasons.join(', ')})`);
    check(`${testCase.name} explains itself`, result.reasons.length > 0 && result.reasons.every(Boolean));
  }

  // "Graduate Analyst II" must not read as senior just because of the numeral.
  const gradWithNumeral = suggestResumeLength('Entry level position for recent graduates.', 'Graduate Analyst II');
  check('an early-career title outranks a seniority numeral', gradWithNumeral.length === 'one-page',
    `${gradWithNumeral.length}: ${gradWithNumeral.reasons.join(', ')}`);

  // An empty posting must still produce a usable default and a reason.
  const empty = suggestResumeLength('', '');
  check('empty input defaults to one page with a stated reason',
    empty.length === 'one-page' && empty.reasons.length > 0);

  check('description reads as a sentence',
    /^(1 page|2 pages) suggested — .+/.test(describeResumeLengthSuggestion(
      suggestResumeLength('Internship for students.', 'Software Engineer Intern'))),
    describeResumeLengthSuggestion(suggestResumeLength('Internship for students.', 'Software Engineer Intern')));
} finally {
  fs.rmSync(TMP, { force: true });
}

console.log(failures === 0 ? '\nAll resume-length checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
