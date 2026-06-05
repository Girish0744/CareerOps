# Career-Ops — Web Frontend

A Next.js web app that runs the full job application pipeline from the browser. No Claude Code session needed — paste a job description, get a score, generate a tailored resume and cover letter as PDFs, track everything.

## Stack

- **Framework:** Next.js 16 (App Router)
- **AI:** Google Gemini API (`@google/genai` SDK) — `gemini-2.5-flash` for evaluation, document generation, chat, and interview prep
- **PDF Generation:** Playwright subprocess (called from API routes)
- **Styling:** Tailwind CSS with custom components
- **Data:** File system (`lib/filesystem.ts`) — swap for a DB to deploy later

## Setup

```bash
cd frontend
npm install

# Required — get a free key at https://aistudio.google.com/app/apikey
echo "GEMINI_API_KEY=your_key_here" > .env.local

npm run dev   # → http://localhost:3000
```

`GEMINI_API_KEY` must be a Google AI Studio API key, not an OAuth token or login credential. The key usually starts with `AIza`. After changing `.env.local`, restart `npm run dev` so Next.js reloads it.

Optional model overrides for testing or quota fallback:

```bash
# One model for all Gemini routes
GEMINI_MODEL=gemini-3.1-flash-lite

# Or task-specific model choices
GEMINI_EVALUATE_MODEL=gemini-3.1-flash-lite
GEMINI_DOCS_MODEL=gemini-2.5-flash
GEMINI_CHAT_MODEL=gemini-3.1-flash-lite
GEMINI_INTERVIEW_MODEL=gemini-3.1-flash-lite

# Optional comma-separated fallback list if the primary model is rate-limited
GEMINI_FALLBACK_MODELS=gemini-2.5-flash-lite,gemini-3-flash
```

If a model name from AI Studio is not accepted by the API, try `gemini-2.5-flash-lite` first; it is the safest low-cost fallback model for text generation. API limits are per Google Cloud project, so another key from the same project does not bypass quota. A key from a different project has its own quota.

Playwright must be installed at the project root for PDF generation:

```bash
cd ..
npx playwright install chromium
```

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Job Discovery | Paste JD/URL, refresh recent-first scan cards, import saved job-board links, evaluate, then generate docs |
| `/applications` | Application Tracker | All applications with status, score, and document links |
| `/applications/[id]` | Application Detail | Resume, cover letter, chat editor, interview guide, outreach drafts, apply prep |

## API Routes

| Route | Method | What it does |
|-------|--------|-------------|
| `/api/evaluate` | POST | Gemini 2.5 Flash: score JD against profile (0–100), extract company/title/location, list matched skills and gaps. Creates `applications/{id}/` folder + `score.json`. |
| `/api/generate-docs/[id]` | POST | Gemini 2.5 Flash × 2 + Playwright: generate resume markdown → HTML → PDF, then cover letter markdown → HTML → PDF. Saves both to `applications/{id}/`. |
| `/api/applications` | GET | List all applications from `applications/` folders. |
| `/api/applications/[id]` | GET | Single application detail (metadata, score, documents). |
| `/api/applications/[id]` | PUT | Update application status (syncs `metadata.json` + `applications.json`). |
| `/api/applications/[id]/pdf` | GET | Stream PDF file from disk. Query: `?type=resume` or `?type=cover-letter`. |
| `/api/chat` | POST | Configurable Gemini chat model: multi-turn chat scoped to one application's documents. Edits `resume.md` or `cover-letter.md` on request. |
| `/api/interview` | POST | Configurable Gemini interview model: generate `interview.md` from JD + resume + story bank. Optional LinkedIn URL for research. |
| `/api/scan` | GET | Read `data/scored-queue.json` — returns ranked scan cards. |
| `/api/scan/run` | POST | Runs `scan.mjs --dry-run --json`, quick-scores discovered jobs, merges them into `data/scored-queue.json`, and returns the queue. |
| `/api/scan/import` | POST | Imports pasted job-board URLs or job-alert text into `data/scored-queue.json` without scraping restricted platforms. |
| `/api/applications/[id]/contacts` | GET/POST | Reads or generates compliant contact leads and outreach drafts from public job context plus user-provided URLs. |
| `/api/applications/[id]/apply` | GET/POST | Reads or generates `apply-session.json` with known fields, reviewable answers, upload paths, and final-submit guard. |
| `/api/applications/[id]/apply/automate` | POST | Starts a visible Playwright apply-fill session for the saved employer/ATS URL and updates `apply-session.json` with automation status. |

## Current Baseline

- Frontend workflow statuses are authoritative: `Saved`, `Evaluated`, `Resume Generated`, `Cover Letter Generated`, `Ready to Apply`, `Applied`, `In Progress`, `Interview`, `Offer`, `Rejected`, `Withdrawn`.
- Legacy statuses are still accepted where scripts/dashboard need compatibility: `Responded`, `Discarded`, `SKIP`.
- Root `portals.yml` is initialized for Girish's Canada/Ontario software, full-stack, and AI application search, with structured Ashby/Greenhouse/Lever boards plus an Eluta Canada IT/software search adapter.
- Scanner default freshness mode is `scan.freshnessWindowHours: 24`; scan queues rank freshness bucket first, then full-time new-grad/entry-level role priority, source quality, score, exact recency, and company name. This keeps Eluta fresh-discovery results visible without letting one source dominate the default queue.
- `data/scored-queue.json` stores ranked preliminary scan cards from Job Discovery's Refresh and Import actions, including `postedAt`, `postedAgeHours`, `freshnessBucket`, `firstSeenAt`, `lastSeenAt`, source labels/types, direct apply URLs, `rolePriority`, `employmentType`, and recency confidence.
- Job Discovery scan cards are grouped into Strong Apply / Apply / Maybe / Skip lanes, show a source-count summary, and can be filtered by score, company, source, role type, and freshness (`24h`, `72h`, `7d`, `all`).
- LinkedIn, Indeed, Glassdoor, and job-alert emails are supported as manual/import signals only. The frontend does not scrape those platforms or automate activity on them.
- `data/pipeline.md` exists with the scanner's expected `Pendientes` and `Procesadas` sections.
- Job evaluation normalizes both pasted text and fetched URLs through the same cleanup layer, removing ATS/legal boilerplate before scoring.
- ATS URLs from Greenhouse, Ashby, and Lever use structured provider APIs when possible before falling back to generic HTML extraction.
- Backend score guardrails run after Gemini responds. They cap scores for hard seniority gaps, professional embedded requirements, and missing industrial automation stacks, then save the applied guardrails in `score.json`.
- Model routing is configurable through `.env.local` via `GEMINI_MODEL`, `GEMINI_EVALUATE_MODEL`, `GEMINI_DOCS_MODEL`, `GEMINI_CHAT_MODEL`, `GEMINI_INTERVIEW_MODEL`, and fallback model lists.
- Offline scoring QA is available with root `npm run eval:qa`; it validates known JD fixtures against the same guardrail core used by the app and does not call Gemini.
- Job Discovery score cards include an **Evaluate another job** action in every evaluated state, so low-score results do not require a page refresh before pasting the next posting.
- Application Detail has a live in-app preview for resume, cover letter, and interview prep, plus a Source toggle for raw Markdown.
- Application Detail has a compliant Outreach tab. It uses public job/application context and manually provided profile URLs only; LinkedIn scraping, auto-connecting, and auto-messaging are intentionally out of scope. Drafts should sound friendly, specific, and low-pressure, not like a referral demand.
- Application Detail has an Apply tab. It can generate missing resume/cover-letter PDFs, prepare known profile fields, answer pasted form questions, surface missing private fields, and open the apply link. It never clicks final submit.
- Apply tab has **Start Assisted Fill** for Phase 17B. It opens a visible controlled browser, supports Greenhouse/Lever/Ashby plus conservative generic forms, can follow up to 3 safe posting-page Apply hops when no form fields are visible yet, fills high-confidence fields/uploads only, and stops before final Submit/Apply.
- Assisted fill uses richer label/question matching, including placeholders, aria labels, field names/ids, fieldset legends, and nearby question text. It only stops navigation when visible fields look like an application form; posting-page search/filter boxes are ignored so the resolver can continue to the real Apply link. Natural wording like "where do you stay?" can map to location/country when clear; uncertain fields remain review-only.
- Checkbox/radio automation uses the profile truth table only. Canadian work authorization can be answered Yes and sponsorship can be answered No when those facts are present; voluntary demographic, terms/certification, and ambiguous choices stay for review.
- Resume and cover-letter uploads must resolve to the current `applications/{id}/` folder. Generic/root/output documents are blocked so every upload uses the role-specific PDFs.
- Apply answers should sound like Girish: practical, warm, professional, role-specific, and grounded in saved proof points instead of generic AI phrasing.
- Private apply data lives in gitignored `config/profile.yml` under `apply:`. Address fields are `address_line1`, `address_line2`, and `postal_code`; transcript uploads should be saved under gitignored `private-docs/` and referenced with `transcript_path`.
- Validation commands for the current baseline: root `npm run scan:qa`, `npm run eval:qa`, `npm run contacts:qa`, `npm run apply:qa`, `node doctor.mjs`, `node cv-sync-check.mjs`, `node verify-pipeline.mjs`; frontend `npm run lint` and `npm run build`.
- Frontend builds use the local system font stack and do not fetch Google Fonts. Turbopack may still print a trace warning because API routes intentionally read career-ops root files outside `frontend/`.

## Model Strategy

| Route | Model | Why |
|-------|-------|-----|
| `/api/evaluate` | `gemini-2.5-flash` | Best reasoning for scoring |
| `/api/generate-docs` | `gemini-2.5-flash` | Best output quality for documents |
| `/api/chat` | `gemini-2.5-flash` | Reliability for document edits and application Q&A |
| `/api/interview` | `gemini-2.5-flash` | Reliability for complete interview guide generation |
| `/api/scan/run` quick-score | Configurable evaluate model plus local fallback | Preliminary ranking before full evaluation |

`gemini-2.5-flash` uses `thinkingConfig: { thinkingBudget: 0 }` to disable thinking mode — without this, thinking tokens consume the output budget and JSON/HTML gets truncated.

Evaluation uses deterministic settings (`temperature: 0`) and a fixed 100-point rubric. After the model responds, the API recomputes the rubric score and applies deterministic caps for hard requirements such as 4+ years professional experience, 2+ years embedded software experience, or missing SCADA/MES/CAN/LIN/automotive stack requirements. This reduces variance between pasted JDs and direct job URLs; remaining differences usually mean the job URL did not expose the same content as the pasted JD.

Before changing scan ranking or source parsing, run root `npm run scan:qa`. Current fixtures cover Eluta-style relative timestamps and role priority order, including full-time new-grad/entry roles outranking internships/co-ops.

Before bulk scanning or scoring changes, run root `npm run eval:qa`. Current fixtures cover:
- ATS-style embedded/industrial automation role: expected `55-65`
- Ontario new-grad full-stack role: expected `75-90`
- Senior AI architect role: expected `<60`
- Remote US-only role: expected `<50`

Before changing contact/outreach extraction, run root `npm run contacts:qa`. It verifies that contact leads come from public job context, manual user-provided LinkedIn URLs, or a manual-research placeholder.

Before changing apply-answer truth tables or visible fill behavior, run root `npm run apply:qa`. It verifies profile extraction, natural label matching, posting-page search fields being ignored, work-authorization/sponsorship answers, safe checkbox/radio handling, current-application document upload guards, and review flags for missing private data.

## How the Two-Step Pipeline Works

```
User pastes JD or URL
        │
        ▼
POST /api/evaluate
  → Gemini scores 0–100
  → Extracts: company, title, location
  → Lists: matched skills, gaps
  → Creates: applications/{id}/job-description.md, score.json, metadata.json
        │
        ▼
Score card shown in UI
  ≥85 → Strong Apply (emerald)
  70–84 → Apply (blue)
  50–69 → Maybe (amber)
  <50 → Skip (red)
        │
   User decides
        │
        ▼ (if "Generate Resume & Cover Letter" clicked)
POST /api/generate-docs/{id}
  → Call 1: Gemini → tailored resume.md + filled resume HTML
  → Playwright → resume.pdf
  → Call 2: Gemini → cover-letter.md + filled cover letter HTML
  → Playwright → cover-letter.pdf
  → Saves all files to applications/{id}/
  → Updates metadata.json: status → "Cover Letter Generated"
```

Generated `applications/{id}/` folders are local work product and are gitignored by default; only `applications/.gitkeep` is tracked.

## Application Status Flow

```
Saved → Resume Generated → Cover Letter Generated → Ready to Apply →
Applied → In Progress → Interview → Offer / Rejected / Withdrawn
```

## Key Implementation Notes

- Font paths in generated HTML use `../../fonts/` (relative to `applications/{id}/`) → resolves to `career-ops/fonts/` when Playwright renders via `file://` URL
- `export const maxDuration = 120` on generate-docs route overrides Next.js 30s default (PDF gen takes 45–90s)
- Response parsing uses a 3-fallback chain: custom `===DELIMITERS===` → markdown code blocks → raw `{...}` — handles Gemini's variable output formats
- All file reads/writes go through `lib/filesystem.ts` — single swap point if migrating to a database

## What's Complete

| Feature | Status |
|---------|--------|
| Job evaluation with score card | ✅ |
| Resume PDF generation (tailored per JD) | ✅ |
| Cover letter PDF generation | ✅ |
| Application tracker page | ✅ |
| Application detail page | ✅ |
| Chat-based document editing | ✅ |
| Interview guide generation | ✅ |
| In-app document preview | ✅ |
| PDF download endpoints | ✅ |
| Status update via UI | ✅ |
| Scan queue refresh + ranked scan cards | ✅ |
| Scan filters, recency/source metadata, role priority, direct apply links | ✅ |
| Manual job-alert/URL import for LinkedIn/Indeed/Glassdoor signals | ✅ |
| Compliant warm outreach/contact drafts | ✅ |
| Apply tab + apply-session answer foundation | ✅ |
| Visible Playwright assisted fill for ATS forms | ✅ |
| Apply-fill hardening: source balance, multi-hop resolver, natural labels, upload guards | ✅ |

## What's Next

| Phase | Feature | Status | Key Files |
|-------|---------|--------|-----------|
| 18 | **Expanded portals, next batch** — Continue growing verified Canadian source coverage and add Workday/Teamtailor/BambooHR/custom parsers only where useful. | 🔜 Next | `portals.yml`, `providers/` |
| 19 | **Email job alerts** — After each scan, diff against last run. New jobs ≥ score threshold → Resend API digest email with ranked cards and one-click Evaluate links. Add `RESEND_API_KEY` to `.env.local`. | 🔜 After 18 | `app/api/scan/run/route.ts`, `lib/email.ts` |
| 16 | **Settings / Profile page** — `/settings`: edit `profile.yml` (name, roles, comp, location) and `portals.yml` (companies, keyword filters) from the browser. No file editing needed. | 🔜 After 19 | `app/settings/page.tsx`, `app/api/settings/route.ts` |
| 17C | **Chrome extension companion** — Reuse the shared apply automation engine from a browser extension for current-tab convenience where extension permissions allow it. | 🔜 Later | extension package, `app/api/applications/[id]/apply` |

## Switching to Claude API

All AI work currently uses Gemini. To switch to Claude (Anthropic API):

1. Replace `@google/genai` imports with `@anthropic-ai/sdk`
2. Change `GEMINI_API_KEY` to `ANTHROPIC_API_KEY` in `.env.local`
3. Update model names: `claude-sonnet-4-6` for quality routes, `claude-haiku-4-5-20251001` for chat
4. Adjust response parsing (Anthropic SDK returns `content[0].text`, not `.text`)
