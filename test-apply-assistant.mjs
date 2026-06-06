import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const helper = await import(pathToFileURL(path.resolve('frontend/lib/apply-assistant.js')).href);
const automation = await import(pathToFileURL(path.resolve('frontend/lib/apply-automation.js')).href);
const profileYml = fs.readFileSync(path.resolve('tests/apply-fixtures/profile-truth-table.yml'), 'utf-8');
const profile = helper.extractApplicantProfile(profileYml);
const app = {
  id: 'example',
  company: 'ExampleCo',
  jobTitle: 'Junior Software Developer',
  resumePath: 'applications/example/resume.pdf',
  coverLetterPath: 'applications/example/cover-letter.pdf',
};

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${message}`);
  } else {
    console.log(`PASS ${message}`);
  }
}

assert(profile.legalName === 'Girish Bhuteja', 'extracts legal name');
assert(profile.email === 'girish@example.com', 'extracts email');
assert(profile.needsSponsorship === false, 'extracts sponsorship truth');
assert(profile.transcriptPath === 'private-docs/transcript.pdf', 'extracts private transcript path');

const fields = helper.standardApplyFields(profile, app);
const applySession = {
  applicationId: app.id,
  documents: {
    resumePath: app.resumePath,
    coverLetterPath: app.coverLetterPath,
    transcriptPath: profile.transcriptPath,
  },
  standardFields: fields,
  answers: [
    helper.fallbackWrittenAnswer('Why are you interested in this role?', app),
    {
      id: 'experience-answer',
      key: 'written_response',
      question: 'Tell us about your experience for this role.',
      answer: 'I have built practical full-stack and AI applications through my computer science degree and project work.',
      fieldType: 'written',
      confidence: 'medium',
      source: 'fixture',
      reviewed: false,
      needsReview: true,
    },
  ],
};
assert(fields.some(field => field.key === 'resume_upload' && field.value === app.resumePath), 'includes resume upload path');
assert(fields.some(field => field.key === 'cover_letter_upload' && field.value === app.coverLetterPath), 'includes cover letter upload path');
assert(fields.some(field => field.key === 'address_line1' && field.needsReview), 'flags blank street address for review');
assert(fields.some(field => field.key === 'postal_code' && field.needsReview), 'flags blank postal code for review');

const workAuth = helper.answerKnownQuestion('Are you legally authorized to work in Canada?', profile, app);
assert(workAuth?.answer === 'Yes' && workAuth.fieldType === 'yes_no', 'answers work authorization from profile truth');

const sponsorship = helper.answerKnownQuestion('Will you now or in the future require sponsorship?', profile, app);
assert(sponsorship?.answer === 'No' && sponsorship.fieldType === 'yes_no', 'answers sponsorship from profile truth');

const transcript = helper.answerKnownQuestion('Please upload your transcript', profile, app);
assert(transcript?.answer === 'private-docs/transcript.pdf' && transcript.fieldType === 'file', 'answers transcript upload path');

const address = helper.answerKnownQuestion('Street address', profile, app);
assert(address?.key === 'address_line1' && address.needsReview, 'flags street address question for review when blank');

const fallback = helper.fallbackWrittenAnswer('Why are you interested in this role?', app);
assert(/shipped work used by real people/i.test(fallback.answer), 'fallback answer uses Girish proof-point voice');
assert(!/passionate|perfect fit|leverage|thrilled/i.test(fallback.answer), 'fallback answer avoids generic AI phrases');

const questions = helper.splitQuestions(`
1. Why are you interested in this role?
- LinkedIn profile
* Upload resume
`);
assert(questions.length === 3, 'splits pasted form questions');

assert(automation.detectApplyProvider('https://boards.greenhouse.io/example/jobs/123') === 'greenhouse', 'detects Greenhouse provider');
assert(automation.detectApplyProvider('https://jobs.lever.co/example/123') === 'lever', 'detects Lever provider');
assert(automation.detectApplyProvider('https://jobs.ashbyhq.com/example/123') === 'ashby', 'detects Ashby provider');
assert(automation.isRestrictedApplyHost('https://www.linkedin.com/jobs/view/123'), 'blocks restricted job-board hosts');
assert(automation.isSafeApplyCta('Apply Now', 'https://boards.greenhouse.io/example/jobs/123'), 'accepts safe posting-page apply CTA');
assert(!automation.isSafeApplyCta('Submit Application', ''), 'rejects final submit CTA');
assert(!automation.isSafeApplyCta('Sign in to apply', '/login'), 'rejects login apply CTA');

const postingHtml = fs.readFileSync(path.resolve('tests/apply-fixtures/posting-page.html'), 'utf-8');
const postingCtas = automation.extractFixtureApplyCtasFromHtml(postingHtml);
assert(postingCtas.length === 1 && postingCtas[0].label === 'Apply Now', 'extracts one safe Apply CTA from posting page fixture');

const postingWithSearchHtml = fs.readFileSync(path.resolve('tests/apply-fixtures/posting-page-with-search.html'), 'utf-8');
const postingWithSearchFields = automation.extractFixtureFieldsFromHtml(postingWithSearchHtml);
assert(!automation.looksLikeApplicationForm(postingWithSearchFields), 'does not treat posting-page search fields as an application form');
assert(automation.extractFixtureApplyCtasFromHtml(postingWithSearchHtml).length === 1, 'still finds safe Apply CTA when posting page has search fields');
assert(automation.resolveAutomationValue(postingWithSearchFields[0], applySession).reason === 'Non-application search/filter field ignored.', 'does not fill job search fields during assisted fill');

const unsafeHtml = fs.readFileSync(path.resolve('tests/apply-fixtures/unsafe-submit-page.html'), 'utf-8');
assert(automation.extractFixtureApplyCtasFromHtml(unsafeHtml).length === 0, 'does not extract unsafe final-submit/login CTAs');

const greenhouseHtml = fs.readFileSync(path.resolve('tests/apply-fixtures/greenhouse-form.html'), 'utf-8');
const greenhouseFields = automation.extractFixtureFieldsFromHtml(greenhouseHtml);
assert(automation.looksLikeApplicationForm(greenhouseFields), 'detects Greenhouse fixture as an application form');
const greenhousePlan = automation.buildAutomationPlan(greenhouseFields, applySession);
assert(greenhousePlan.items.some(item => item.resolution.key === 'first_name' && item.resolution.value === 'Girish'), 'plans first-name fill for Greenhouse fixture');
assert(greenhousePlan.items.some(item => item.resolution.action === 'upload' && item.resolution.key === 'resume_upload'), 'plans resume upload for Greenhouse fixture');
assert(greenhousePlan.items.some(item => item.resolution.key === 'written_response'), 'plans written answer fill for Greenhouse fixture');

const lastNameResolution = automation.resolveAutomationValue({ tag: 'input', type: 'text', label: 'Last Name', name: 'last_name' }, applySession);
assert(lastNameResolution.key === 'last_name' && lastNameResolution.value === 'Bhuteja', 'fills last name from legal name instead of first name');
const emailResolution = automation.resolveAutomationValue({ tag: 'input', type: 'email', label: 'Email Address', name: 'email' }, applySession);
assert(emailResolution.key === 'email' && emailResolution.value === 'girish@example.com', 'fills email from email field');
const broadSectionResolution = automation.resolveAutomationValue({
  tag: 'input',
  type: 'text',
  label: 'Required First Name Last Name Email Address Phone Address City Province Postal Code',
}, applySession);
assert(broadSectionResolution.action === 'review', 'does not guess from broad mixed contact-section labels');

const leverHtml = fs.readFileSync(path.resolve('tests/apply-fixtures/lever-form.html'), 'utf-8');
const leverPlan = automation.buildAutomationPlan(automation.extractFixtureFieldsFromHtml(leverHtml), applySession);
assert(leverPlan.items.some(item => item.resolution.key === 'linkedin'), 'plans LinkedIn fill for Lever fixture');
assert(leverPlan.items.some(item => item.resolution.key === 'cover_letter_upload'), 'plans cover-letter upload for Lever fixture');

const ashbyHtml = fs.readFileSync(path.resolve('tests/apply-fixtures/ashby-form.html'), 'utf-8');
const ashbyPlan = automation.buildAutomationPlan(automation.extractFixtureFieldsFromHtml(ashbyHtml), applySession);
assert(ashbyPlan.items.some(item => item.resolution.key === 'transcript_upload' && item.resolution.action === 'upload'), 'plans transcript upload for Ashby fixture');
assert(ashbyPlan.items.some(item => item.resolution.key === 'address_line1' && item.resolution.action === 'review'), 'keeps missing address in review for Ashby fixture');

const naturalLabelHtml = fs.readFileSync(path.resolve('tests/apply-fixtures/natural-labels-form.html'), 'utf-8');
const naturalLabelPlan = automation.buildAutomationPlan(automation.extractFixtureFieldsFromHtml(naturalLabelHtml), applySession);
assert(naturalLabelPlan.items.some(item => item.resolution.key === 'country' && item.resolution.value === 'Canada'), 'maps natural country wording to Canada');
assert(naturalLabelPlan.items.some(item => item.resolution.key === 'city' && item.resolution.value === 'Cambridge'), 'maps natural location wording to city');

const truthTableHtml = fs.readFileSync(path.resolve('tests/apply-fixtures/checkbox-radio-form.html'), 'utf-8');
const truthTablePlan = automation.buildAutomationPlan(automation.extractFixtureFieldsFromHtml(truthTableHtml), applySession);
assert(truthTablePlan.items.some(item => item.resolution.action === 'check' && item.resolution.key === 'work_authorization'), 'checks work authorization Yes from profile truth');
assert(truthTablePlan.items.some(item => item.resolution.action === 'check' && item.resolution.key === 'sponsorship'), 'checks sponsorship No from profile truth');
assert(truthTablePlan.items.some(item => item.resolution.action === 'review' && /Voluntary demographic/.test(item.resolution.reason)), 'leaves voluntary demographic fields for review');
assert(truthTablePlan.items.some(item => item.resolution.action === 'review' && /Consent\/certification/.test(item.resolution.reason)), 'leaves consent/accuracy checkbox for review');

const fixtureRoot = path.resolve('tests/apply-fixtures');
assert(automation.validateUploadPath(fixtureRoot, app.id, app.resumePath, 'resume_upload').ok, 'allows current application resume upload path');
assert(automation.validateUploadPath(fixtureRoot, app.id, app.coverLetterPath, 'cover_letter_upload').ok, 'allows current application cover-letter upload path');
assert(automation.validateUploadPath(fixtureRoot, app.id, profile.transcriptPath, 'transcript_upload').ok, 'allows configured private transcript upload path');
assert(!automation.validateUploadPath(fixtureRoot, app.id, 'output/resume.pdf', 'resume_upload').ok, 'rejects generic resume upload path');
assert(!automation.validateUploadPath(fixtureRoot, 'other-app', app.resumePath, 'resume_upload').ok, 'rejects resume from a different application folder');

if (failures > 0) {
  console.error(`\n${failures} apply assistant fixture(s) failed.`);
  process.exit(1);
}

console.log('\nAll apply assistant fixtures passed.');
