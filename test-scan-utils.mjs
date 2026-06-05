import fs from 'fs';
import path from 'path';
import {
  classifyRolePriority,
  parseRelativeTimestamp,
  rolePriorityRank,
} from './scan-utils.mjs';

const FIXTURE_DIR = path.resolve('tests/scan-fixtures');
const now = new Date('2026-06-04T16:00:00.000Z');
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

const timestampFixtures = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'eluta-relative-timestamps.json'), 'utf-8'),
);

for (const fixture of timestampFixtures) {
  const parsed = parseRelativeTimestamp(fixture.label, now);
  if (!parsed) {
    fail(`${fixture.label}: did not parse`);
    continue;
  }
  const ageHours = Math.round((now.getTime() - Date.parse(parsed)) / (60 * 60 * 1000));
  const min = fixture.expectedMinHours ?? 0;
  const max = fixture.expectedMaxHours;
  if (ageHours < min || ageHours > max) {
    fail(`${fixture.label}: expected ${min}-${max}h, got ${ageHours}h`);
  } else {
    pass(`${fixture.label}: ${ageHours}h`);
  }
}

const roleFixtures = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'role-priority.json'), 'utf-8'),
);

for (const fixture of roleFixtures) {
  const actual = classifyRolePriority(fixture.title, fixture.location);
  if (actual !== fixture.expected) {
    fail(`${fixture.title}: expected ${fixture.expected}, got ${actual}`);
  } else {
    pass(`${fixture.title}: ${actual}`);
  }
}

const fullTimeRank = rolePriorityRank('full_time_new_grad');
const internRank = rolePriorityRank('intern_coop');
if (fullTimeRank >= internRank) {
  fail('full-time new-grad role should outrank intern/co-op');
} else {
  pass('full-time new-grad role outranks intern/co-op');
}

if (failures > 0) {
  console.error(`\n${failures} scanner fixture(s) failed.`);
  process.exit(1);
}

console.log(`\nAll scanner utility fixtures passed.`);
