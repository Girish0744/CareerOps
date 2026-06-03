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
| `/` | Job Discovery | Paste JD or URL → evaluate → score card → generate docs |
| `/applications` | Application Tracker | All applications with status, score, and document links |
| `/applications/[id]` | Application Detail | Resume, cover letter, chat editor, interview guide |

## API Routes

| Route | Method | What it does |
|-------|--------|-------------|
| `/api/evaluate` | POST | Gemini 2.5 Flash: score JD against profile (0–100), extract company/title/location, list matched skills and gaps. Creates `applications/{id}/` folder + `score.json`. |
| `/api/generate-docs/[id]` | POST | Gemini 2.5 Flash × 2 + Playwright: generate resume markdown → HTML → PDF, then cover letter markdown → HTML → PDF. Saves both to `applications/{id}/`. |
| `/api/applications` | GET | List all applications from `applications/` folders. |
| `/api/applications/[id]` | GET | Single application detail (metadata, score, documents). |
| `/api/applications/[id]` | PUT | Update application status (syncs `metadata.json` + `applications.json`). |
| `/api/applications/[id]/pdf` | GET | Stream PDF file from disk. Query: `?type=resume` or `?type=cover-letter`. |
| `/api/chat` | POST | Gemini 2.0 Flash: multi-turn chat scoped to one application's documents. Edits `resume.md` or `cover-letter.md` on request. |
| `/api/interview` | POST | Gemini 2.0 Flash: generate `interview.md` from JD + resume + story bank. Optional LinkedIn URL for research. |
| `/api/scan` | GET | Read `data/scored-queue.json` — returns pre-scored job cards from portal scan *(Phase 13, not yet wired)* |

## Current Baseline

- Frontend workflow statuses are authoritative: `Saved`, `Evaluated`, `Resume Generated`, `Cover Letter Generated`, `Ready to Apply`, `Applied`, `In Progress`, `Interview`, `Offer`, `Rejected`, `Withdrawn`.
- Legacy statuses are still accepted where scripts/dashboard need compatibility: `Responded`, `Discarded`, `SKIP`.
- Root `portals.yml` is initialized for Girish's Canada/Ontario software, full-stack, and AI application search.
- `data/scored-queue.json` starts as an empty array and is the Phase 13 queue target.
- `data/pipeline.md` exists with the scanner's expected `Pendientes` and `Procesadas` sections.
- Job evaluation normalizes both pasted text and fetched URLs through the same cleanup layer, removing ATS/legal boilerplate before scoring.
- ATS URLs from Greenhouse, Ashby, and Lever use structured provider APIs when possible before falling back to generic HTML extraction.
- Backend score guardrails run after Gemini responds. They cap scores for hard seniority gaps, professional embedded requirements, and missing industrial automation stacks, then save the applied guardrails in `score.json`.
- Model routing is configurable through `.env.local` via `GEMINI_MODEL`, `GEMINI_EVALUATE_MODEL`, `GEMINI_DOCS_MODEL`, `GEMINI_CHAT_MODEL`, `GEMINI_INTERVIEW_MODEL`, and fallback model lists.
- Offline scoring QA is available with root `npm run eval:qa`; it validates known JD fixtures against the same guardrail core used by the app and does not call Gemini.
- Job Discovery score cards include an **Evaluate another job** action in every evaluated state, so low-score results do not require a page refresh before pasting the next posting.
- Application Detail has a live in-app preview for resume, cover letter, and interview prep, plus a Source toggle for raw Markdown.
- Validation commands for the current baseline: root `node doctor.mjs`, `node cv-sync-check.mjs`, `node verify-pipeline.mjs`; frontend `npm run lint` and `npm run build`.

## Model Strategy

| Route | Model | Why |
|-------|-------|-----|
| `/api/evaluate` | `gemini-2.5-flash` | Best reasoning for scoring |
| `/api/generate-docs` | `gemini-2.5-flash` | Best output quality for documents |
| `/api/chat` | `gemini-2.5-flash` | Reliability for document edits and application Q&A |
| `/api/interview` | `gemini-2.5-flash` | Reliability for complete interview guide generation |

`gemini-2.5-flash` uses `thinkingConfig: { thinkingBudget: 0 }` to disable thinking mode — without this, thinking tokens consume the output budget and JSON/HTML gets truncated.

Evaluation uses deterministic settings (`temperature: 0`) and a fixed 100-point rubric. After the model responds, the API recomputes the rubric score and applies deterministic caps for hard requirements such as 4+ years professional experience, 2+ years embedded software experience, or missing SCADA/MES/CAN/LIN/automotive stack requirements. This reduces variance between pasted JDs and direct job URLs; remaining differences usually mean the job URL did not expose the same content as the pasted JD.

Before Phase 13 bulk scanning, run root `npm run eval:qa`. Current fixtures cover:
- ATS-style embedded/industrial automation role: expected `55-65`
- Ontario new-grad full-stack role: expected `75-90`
- Senior AI architect role: expected `<60`
- Remote US-only role: expected `<50`

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

## What's Next

| Phase | Feature | Status | Key Files |
|-------|---------|--------|-----------|
| 13 | **Scan queue** — `POST /api/scan/run` runs `scan.mjs` + bulk quick-scores via Gemini (one call, `gemini-2.0-flash`) → `data/scored-queue.json`. Job Discovery gains a "Scan Results" tab: ranked cards with score badges and a Refresh button. Baseline queue/config files are ready. | 🔜 Next | `app/api/scan/route.ts`, `app/api/scan/run/route.ts`, `app/page.tsx` |
| 14 | **"Generate Application" from scan cards** — "Evaluate" on a scan card fetches the full JD → `/api/evaluate` → score modal → user confirms → `/api/generate-docs`. Same two-step gate as manual paste. | 🔜 After 13 | `app/page.tsx`, `app/api/evaluate/route.ts` |
| 18 | **Expanded portals** — Grow `portals.yml` from ~45 to 150+ companies: Canadian AI startups (Cohere, Waabi, Ada, Darwin AI), Ontario scale-ups (Shopify, Wealthsimple, Miovision, Veeva), and Big Tech Canada offices. More scan results at zero API cost. | 🔜 After 13 | `portals.yml` (project root) |
| 19 | **Email job alerts** — After each scan, diff against last run. New jobs ≥ score threshold → Resend API digest email with ranked cards and one-click Evaluate links. Add `RESEND_API_KEY` to `.env.local`. | 🔜 After 18 | `app/api/scan/run/route.ts`, `lib/email.ts` |
| 16 | **Settings / Profile page** — `/settings`: edit `profile.yml` (name, roles, comp, location) and `portals.yml` (companies, keyword filters) from the browser. No file editing needed. | 🔜 After 19 | `app/settings/page.tsx`, `app/api/settings/route.ts` |
| 17 | **Apply tab** — "Apply" tab in Application Detail: paste form questions → AI generates copy-paste answers from saved resume + cover letter + JD. Never auto-submits. | 🔜 After 16 | `app/applications/[id]/page.tsx`, `app/api/apply/route.ts` |

## Switching to Claude API

All AI work currently uses Gemini. To switch to Claude (Anthropic API):

1. Replace `@google/genai` imports with `@anthropic-ai/sdk`
2. Change `GEMINI_API_KEY` to `ANTHROPIC_API_KEY` in `.env.local`
3. Update model names: `claude-sonnet-4-6` for quality routes, `claude-haiku-4-5-20251001` for chat
4. Adjust response parsing (Anthropic SDK returns `content[0].text`, not `.text`)
