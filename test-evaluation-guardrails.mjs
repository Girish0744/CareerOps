import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyEvaluationGuardrails } from './frontend/lib/evaluation-guardrails-core.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(ROOT, 'tests', 'evaluation-fixtures');

function readIfExists(relPath) {
  const fullPath = path.join(ROOT, relPath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '';
}

function readCandidateContext() {
  return [
    readIfExists('cv.md'),
    readIfExists('config/profile.yml'),
    readIfExists('modes/_profile.md'),
  ].join('\n\n');
}

function loadFixtures() {
  if (!fs.existsSync(FIXTURE_DIR)) return [];
  return fs.readdirSync(FIXTURE_DIR)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => {
      const fullPath = path.join(FIXTURE_DIR, file);
      return {
        file,
        ...JSON.parse(fs.readFileSync(fullPath, 'utf-8')),
      };
    });
}

function validateFixture(fixture) {
  const required = ['id', 'expected', 'jobDescription', 'modelEvaluation'];
  const missing = required.filter(key => fixture[key] === undefined);
  if (missing.length) {
    throw new Error(`${fixture.file} missing required keys: ${missing.join(', ')}`);
  }
  if (typeof fixture.expected.min !== 'number' || typeof fixture.expected.max !== 'number') {
    throw new Error(`${fixture.file} expected must include numeric min and max`);
  }
}

const candidateContext = readCandidateContext();
const fixtures = loadFixtures();

if (!fixtures.length) {
  console.error(`No evaluation fixtures found in ${FIXTURE_DIR}`);
  process.exit(1);
}

let failures = 0;

for (const fixture of fixtures) {
  validateFixture(fixture);
  const adjusted = applyEvaluationGuardrails(
    fixture.modelEvaluation,
    fixture.jobDescription,
    candidateContext,
  );
  const { min, max } = fixture.expected;
  const pass = adjusted.score >= min && adjusted.score <= max;

  if (!pass) failures += 1;

  const guardrailCodes = adjusted.guardrails.map(g => g.code).join(', ') || 'none';
  console.log(`${pass ? 'PASS' : 'FAIL'} ${fixture.id}: ${adjusted.score}/100 expected ${min}-${max} guardrails=[${guardrailCodes}]`);
}

if (failures > 0) {
  console.error(`\n${failures} evaluation guardrail fixture(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${fixtures.length} evaluation guardrail fixtures passed.`);
