# Career-Ops -- AI Job Search Pipeline

## Origin

This system was built and used by [santifer](https://santifer.io) to evaluate 740+ job offers, generate 100+ tailored CVs, and land a Head of Applied AI role. The archetypes, scoring logic, negotiation scripts, and proof point structure all reflect his specific career search in AI/automation roles.

The portfolio that goes with this system is also open source: [cv-santiago](https://github.com/santifer/cv-santiago).

**It will work out of the box, but it's designed to be made yours.** If the archetypes don't match your career, the modes are in the wrong language, or the scoring doesn't fit your priorities -- just ask. You (AI Agent) can edit the user's files. The user says "change the archetypes to data engineering roles" and you do it. That's the whole point.

## Data Contract (CRITICAL)

There are two layers. Read `DATA_CONTRACT.md` for the full list.

**User Layer (NEVER auto-updated, personalization goes HERE):**
- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`
- `data/*`, `reports/*`, `output/*`, `interview-prep/*`, `applications/*`

**System Layer (auto-updatable, DON'T put user data here):**
- `modes/_shared.md`, `modes/oferta.md`, all other modes
- `AGENTS.md`, `CLAUDE.md`, `*.mjs` scripts, `dashboard/*`, `templates/*`, `batch/*`

**THE RULE: When the user asks to customize anything (archetypes, narrative, negotiation scripts, proof points, location policy, comp targets), ALWAYS write to `modes/_profile.md` or `config/profile.yml`. NEVER edit `modes/_shared.md` for user-specific content.** This ensures system updates don't overwrite their customizations.

## Update Check

On the first message of each session, run the update checker silently:

```bash
node update-system.mjs check
```

Parse the JSON output:
- `{"status": "update-available", "local": "1.0.0", "remote": "1.1.0", "changelog": "..."}` → tell the user:
  > "career-ops update available (v{local} → v{remote}). Your data (CV, profile, tracker, reports) will NOT be touched. Want me to update?"
  If yes → run `node update-system.mjs apply`. If no → run `node update-system.mjs dismiss`.
- `{"status": "up-to-date"}` → say nothing
- `{"status": "dismissed"}` → say nothing
- `{"status": "offline"}` → say nothing
- `{"status": "no-remote-version"}` → say nothing (checker reached GitHub but neither VERSION nor the latest release tag parsed as semver — treat as a silent non-failure, same as offline)

The user can also say "check for updates" or "update career-ops" at any time to force a check.
To rollback: `node update-system.mjs rollback`

## What is career-ops

AI-powered, CLI-agnostic job search automation: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing. Runs on any AI coding CLI that follows the [open agent skill standard](https://agentskills.io) (Claude Code, Codex, Gemini, OpenCode, Qwen, Copilot, Kimi).

### Main Files

| File | Function |
|------|----------|
| `data/applications.md` | Application tracker |
| `data/pipeline.md` | Inbox of pending URLs |
| `data/scan-history.tsv` | Scanner dedup history |
| `portals.yml` | Query and company config |
| `templates/cv-template.html` | HTML template for CVs |
| `templates/cv-template.tex` | LaTeX/Overleaf template for CVs |
| `generate-pdf.mjs` | Playwright: HTML to PDF |
| `generate-latex.mjs` | LaTeX CV validator + pdflatex compiler |
| `article-digest.md` | Compact proof points from portfolio (optional) |
| `interview-prep/story-bank.md` | Accumulated STAR+R stories across evaluations |
| `interview-prep/{company}-{role}.md` | Company-specific interview intel reports |
| `analyze-patterns.mjs` | Pattern analysis script (JSON output) |
| `followup-cadence.mjs` | Follow-up cadence calculator (JSON output) |
| `data/follow-ups.md` | Follow-up history tracker |
| `scan.mjs` | Zero-token portal scanner — hits Greenhouse/Ashby/Lever APIs directly, zero LLM cost |
| `check-liveness.mjs` | Job posting liveness checker |
| `liveness-core.mjs` | Shared liveness logic (expired signals win over generic Apply text) |
| `reports/` | Evaluation reports (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`). Blocks A-F + G (Posting Legitimacy). Header includes `**Legitimacy:** {tier}`. |

### First Run — Onboarding (IMPORTANT)

**Before doing ANYTHING else, check if the system is set up.** Run these checks silently every time a session starts:

1. Does `cv.md` exist?
2. Does `config/profile.yml` exist (not just profile.example.yml)?
3. Does `modes/_profile.md` exist (not just _profile.template.md)?
4. Does `portals.yml` exist (not just templates/portals.example.yml)?

If `modes/_profile.md` is missing, copy from `modes/_profile.template.md` silently. This is the user's customization file — it will never be overwritten by updates.

**If ANY of these is missing, enter onboarding mode.** Do NOT proceed with evaluations, scans, or any other mode until the basics are in place. Guide the user step by step:

#### Step 1: CV (required)
If `cv.md` is missing, ask:
> "I don't have your CV yet. You can either:
> 1. Paste your CV here and I'll convert it to markdown
> 2. Paste your LinkedIn URL and I'll extract the key info
> 3. Tell me about your experience and I'll draft a CV for you
>
> Which do you prefer?"

Create `cv.md` from whatever they provide. Make it clean markdown with standard sections (Summary, Experience, Projects, Education, Skills).

#### Step 2: Profile (required)
If `config/profile.yml` is missing, copy from `config/profile.example.yml` and then ask:
> "I need a few details to personalize the system:
> - Your full name and email
> - Your location and timezone
> - What roles are you targeting? (e.g., 'Senior Backend Engineer', 'AI Product Manager')
> - Your salary target range
>
> I'll set everything up for you."

Fill in `config/profile.yml` with their answers. For archetypes and targeting narrative, store the user-specific mapping in `modes/_profile.md` or `config/profile.yml` rather than editing `modes/_shared.md`.

#### Step 3: Portals (recommended)
If `portals.yml` is missing:
> "I'll set up the job scanner with 45+ pre-configured companies. Want me to customize the search keywords for your target roles?"

Copy `templates/portals.example.yml` → `portals.yml`. If they gave target roles in Step 2, update `title_filter.positive` to match.

#### Step 4: Tracker
If `data/applications.md` doesn't exist, create it:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

#### Step 5: Get to know the user (important for quality)

After the basics are set up, proactively ask for more context. The more you know, the better your evaluations will be:

> "The basics are ready. But the system works much better when it knows you well. Can you tell me more about:
> - What makes you unique? What's your 'superpower' that other candidates don't have?
> - What kind of work excites you? What drains you?
> - Any deal-breakers? (e.g., no on-site, no startups under 20 people, no Java shops)
> - Your best professional achievement — the one you'd lead with in an interview
> - Any projects, articles, or case studies you've published?
>
> The more context you give me, the better I filter. Think of it as onboarding a recruiter — the first week I need to learn about you, then I become invaluable."

Store any insights the user shares in `config/profile.yml` (under narrative), `modes/_profile.md`, or in `article-digest.md` if they share proof points. Do not put user-specific archetypes or framing into `modes/_shared.md`.

**After every evaluation, learn.** If the user says "this score is too high, I wouldn't apply here" or "you missed that I have experience in X", update your understanding in `modes/_profile.md`, `config/profile.yml`, or `article-digest.md`. The system should get smarter with every interaction without putting personalization into system-layer files.

#### Step 6: Ready
Once all files exist, confirm:
> "You're all set! You can now:
> - Paste a job URL to evaluate it
> - Run `/career-ops scan` (or `/career-ops-scan` if using OpenCode) to search portals
> - Run `/career-ops` to see all commands
>
> Everything is customizable — just ask me to change anything.
>
> Tip: Having a personal portfolio dramatically improves your job search. If you don't have one yet, the author's portfolio is also open source: github.com/santifer/cv-santiago — feel free to fork it and make it yours."

Then suggest automation:
> "Want me to scan for new offers automatically? I can set up a recurring scan every few days so you don't miss anything. Just say 'scan every 3 days' and I'll configure it."

If the user accepts, use the `/loop` or `/schedule` skill (if available) to set up a recurring `/career-ops scan` (or `/career-ops-scan` if using OpenCode). If those aren't available, suggest adding a cron job or remind them to run `/career-ops scan` (or `/career-ops-scan` if using OpenCode) periodically.

### Personalization

This system is designed to be customized by YOU (AI Agent). When the user asks you to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts -- do it directly. You read the same files you use, so you know exactly what to edit.

**Common customization requests:**
- "Change the archetypes to [backend/frontend/data/devops] roles" → edit `modes/_profile.md` or `config/profile.yml`
- "Translate the modes to English" → edit all files in `modes/`
- "Add these companies to my portals" → edit `portals.yml`
- "Update my profile" → edit `config/profile.yml`
- "Change the CV template design" → edit `templates/cv-template.html`
- "Adjust the scoring weights" → edit `modes/_profile.md` for user-specific weighting, or edit `modes/_shared.md` and `batch/batch-prompt.md` only when changing the shared system defaults for everyone

### Language Modes

Default modes are in `modes/` (English). Additional language-specific modes are available:

- **German (DACH market):** `modes/de/` — native German translations with DACH-specific vocabulary (13. Monatsgehalt, Probezeit, Kündigungsfrist, AGG, Tarifvertrag, etc.). Includes `_shared.md`, `angebot.md` (evaluation), `bewerben.md` (apply), `pipeline.md`.
- **French (Francophone market):** `modes/fr/` — native French translations with France/Belgium/Switzerland/Luxembourg-specific vocabulary (CDI/CDD, convention collective SYNTEC, RTT, mutuelle, prévoyance, 13e mois, intéressement/participation, titres-restaurant, CSE, portage salarial, etc.). Includes `_shared.md`, `offre.md` (evaluation), `postuler.md` (apply), `pipeline.md`.
- **Japanese (Japan market):** `modes/ja/` — native Japanese translations with Japan-specific vocabulary (正社員, 業務委託, 賞与, 退職金, みなし残業, 年俸制, 36協定, 通勤手当, 住宅手当, etc.). Includes `_shared.md`, `kyujin.md` (evaluation), `oubo.md` (apply), `pipeline.md`.
- **Turkish (Turkey market):** `modes/tr/` — native Turkish translations with Turkey-specific vocabulary (SGK, kıdem tazminatı, ihbar süresi, brüt/net maaş, AGİ, BES, yemek kartı, yol yardımı, TÜFE zammı, etc.). Includes `_shared.md`, `is-ilani.md` (evaluation), `basvuru.md` (apply), `pipeline.md`.

**When to use German modes:** If the user is targeting German-language job postings, lives in DACH, or asks for German output. Either:
1. User says "use German modes" → read from `modes/de/` instead of `modes/`
2. User sets `language.modes_dir: modes/de` in `config/profile.yml` → always use German modes
3. You detect a German JD → suggest switching to German modes

**When to use French modes:** If the user is targeting French-language job postings, lives in France/Belgium/Switzerland/Luxembourg/Quebec, or asks for French output. Either:
1. User says "use French modes" → read from `modes/fr/` instead of `modes/`
2. User sets `language.modes_dir: modes/fr` in `config/profile.yml` → always use French modes
3. You detect a French JD → suggest switching to French modes

**When to use Japanese modes:** If the user is targeting Japanese-language job postings, lives in Japan, or asks for Japanese output. Either:
1. User says "use Japanese modes" → read from `modes/ja/` instead of `modes/`
2. User sets `language.modes_dir: modes/ja` in `config/profile.yml` → always use Japanese modes
3. You detect a Japanese JD → suggest switching to Japanese modes

**When to use Turkish modes:** If the user is targeting Turkish-language job postings, lives in Turkey, or asks for Turkish output. Either:
1. User says "use Turkish modes" → read from `modes/tr/` instead of `modes/`
2. User sets `language.modes_dir: modes/tr` in `config/profile.yml` → always use Turkish modes
3. You detect a Turkish JD → suggest switching to Turkish modes

**When NOT to:** If the user applies to English-language roles, even at French, German, Japanese, or Turkish companies, use the default English modes — *unless* the user has explicitly requested another mode in this conversation, or `language.modes_dir` is set in `config/profile.yml` (the explicit user preference always wins over JD-language detection).

### Skill Modes

| If the user... | Mode |
|----------------|------|
| Pastes JD or URL | auto-pipeline (evaluate + report + PDF + tracker) |
| Asks to evaluate offer | `oferta` |
| Asks to compare offers | `ofertas` |
| Wants LinkedIn outreach | `contacto` |
| Asks for company research | `deep` |
| Preps for interview at specific company | `interview-prep` |
| Wants to generate CV/PDF | `pdf` |
| Evaluates a course/cert | `training` |
| Evaluates portfolio project | `project` |
| Asks about application status | `tracker` |
| Fills out application form | `apply` |
| Searches for new offers | `scan` |
| Processes pending URLs | `pipeline` |
| Batch processes offers | `batch` |
| Asks about rejection patterns or wants to improve targeting | `patterns` |
| Asks about follow-ups or application cadence | `followup` |
| Wants to update the system | `update` |

### CV Source of Truth

- `cv.md` in project root is the canonical CV
- `article-digest.md` has detailed proof points (optional)
- **NEVER hardcode metrics** -- read them from these files at evaluation time

---

## Ethical Use -- CRITICAL

**This system is designed for quality, not quantity.** The goal is to help the user find and apply to roles where there is a genuine match -- not to spam companies with mass applications.

- **NEVER submit an application without the user reviewing it first.** Fill forms, draft answers, generate PDFs -- but always STOP before clicking Submit/Send/Apply. The user makes the final call.
- **Strongly discourage low-fit applications.** If a score is below 4.0/5, explicitly recommend against applying. The user's time and the recruiter's time are both valuable. Only proceed if the user has a specific reason to override the score.
- **Quality over speed.** A well-targeted application to 5 companies beats a generic blast to 50. Guide the user toward fewer, better applications.
- **Respect recruiters' time.** Every application a human reads costs someone's attention. Only send what's worth reading.

---

## Offer Verification -- MANDATORY

**NEVER trust WebSearch/WebFetch to verify if an offer is still active.** ALWAYS use Playwright:
1. `browser_navigate` to the URL
2. `browser_snapshot` to read content
3. Only footer/navbar without JD = closed. Title + description + Apply = active.

**Exception for batch workers (headless mode):** Playwright is not available in headless pipe mode. Use WebFetch as fallback and mark the report header with `**Verification:** unconfirmed (batch mode)`. The user can verify manually later.

---

## CI/CD and Quality

- **GitHub Actions** run on every PR: `test-all.mjs` (63+ checks), auto-labeler (risk-based: 🔴 core-architecture, ⚠️ agent-behavior, 📄 docs), welcome bot for first-time contributors
- **Branch protection** on `main`: status checks must pass before merge. No direct pushes to main (except admin bypass).
- **Dependabot** monitors npm, Go modules, and GitHub Actions for security updates
- **Contributing process**: issue first → discussion → PR with linked issue → CI passes → maintainer review → merge

## Community and Governance

- **Code of Conduct**: Contributor Covenant 2.1 with enforcement actions (see `CODE_OF_CONDUCT.md`)
- **Governance**: BDFL model with contributor ladder — Participant → Contributor → Triager → Reviewer → Maintainer (see `GOVERNANCE.md`)
- **Security**: private vulnerability reporting via email (see `SECURITY.md`)
- **Support**: help questions go to Discord/Discussions, not issues (see `SUPPORT.md`)
- **Discord**: https://discord.gg/8pRpHETxa4

## Headless / Batch Mode

When spawning headless workers for batch processing, use the appropriate command for your CLI:

| CLI | Command |
|-----|---------|
| Claude Code | `claude -p "prompt"` |
| Gemini CLI | `gemini -p "prompt"` |
| Copilot CLI | `copilot -p "prompt"` |
| Codex | `codex exec "prompt"` |
| OpenCode | `opencode run "prompt"` |
| Qwen | `qwen -p "prompt"` |

## Stack and Conventions

- Node.js (mjs modules), Playwright (PDF + scraping), YAML (config), HTML/CSS (template), Markdown (data), Canva MCP (optional visual CV)
- Scripts in `.mjs`, configuration in YAML
- Output in `output/` (gitignored), Reports in `reports/`
- JDs in `jds/` (referenced as `local:jds/{file}` in pipeline.md)
- Batch in `batch/` (gitignored except scripts and prompt)
- Report numbering: sequential 3-digit zero-padded, max existing + 1
- **RULE: After each batch of evaluations, run `node merge-tracker.mjs`** to merge tracker additions and avoid duplications.
- **RULE: NEVER create new entries in applications.md if company+role already exists.** Update the existing entry.

### TSV Format for Tracker Additions

Write one TSV file per evaluation to `batch/tracker-additions/{num}-{company-slug}.tsv`. Single line, 9 tab-separated columns:

```
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

**Column order (IMPORTANT -- status BEFORE score):**
1. `num` -- sequential number (integer)
2. `date` -- YYYY-MM-DD
3. `company` -- short company name
4. `role` -- job title
5. `status` -- canonical status (e.g., `Evaluated`)
6. `score` -- format `X.X/5` (e.g., `4.2/5`)
7. `pdf` -- `✅` or `❌`
8. `report` -- markdown link `[num](reports/...)`
9. `notes` -- one-line summary

**Note:** In applications.md, score comes BEFORE status. The merge script handles this column swap automatically.

### Pipeline Integrity

1. **NEVER edit applications.md to ADD new entries** -- Write TSV in `batch/tracker-additions/` and `merge-tracker.mjs` handles the merge.
2. **YES you can edit applications.md to UPDATE status/notes of existing entries.**
3. All reports MUST include `**URL:**` in the header (between Score and PDF). Include `**Legitimacy:** {tier}` (see Block G in `modes/oferta.md`).
4. All statuses MUST be canonical (see `templates/states.yml`).
5. Health check: `node verify-pipeline.mjs`
6. Normalize statuses: `node normalize-statuses.mjs`
7. Dedup: `node dedup-tracker.mjs`

### Canonical States (applications.md)

**Source of truth:** `templates/states.yml`

| State | When to use |
|-------|-------------|
| `Evaluated` | Report completed, pending decision |
| `Applied` | Application sent |
| `Responded` | Company responded |
| `Interview` | In interview process |
| `Offer` | Offer received |
| `Rejected` | Rejected by company |
| `Discarded` | Discarded by candidate or offer closed |
| `SKIP` | Doesn't fit, don't apply |

**RULES:**
- No markdown bold (`**`) in status field
- No dates in status field (use the date column)
- No extra text (use the notes column)

---

## Personal Job Application Command Center

This project has been customized into a personal job application command center for **Girish Bhuteja** (Cambridge, ON · graduating BCS Conestoga August 2026 · targeting AI/ML roles in Canada).

### Product Goals

- Generate tailored resumes for each job application.
- Generate tailored cover letters for each job application.
- Score jobs against the candidate profile.
- Track every application with status, documents, and notes.
- Save exact documents (resume + cover letter) used per application, in a dedicated folder.
- Support chat-based edits to application-specific documents.
- Generate interview prep when an application reaches Interview status.
- Keep the user in control — never auto-submit a job application.

### Safety Rules (MANDATORY)

- **NEVER auto-submit a job application.** Fill forms, draft answers, generate PDFs — but always STOP before Submit/Send/Apply. The user clicks last.
- **NEVER invent candidate experience.** Only use facts from `cv.md`, `config/profile.yml`, `modes/_profile.md`, and `article-digest.md`.
- **NEVER edit master profile files during job-specific chat edits.** `cv.md`, `config/profile.yml`, and `modes/_profile.md` are the source of truth. Application-specific edits go only into `applications/{id}/resume.md` or `applications/{id}/cover-letter.md`.
- **ATS-friendly resumes only.** Single-column, standard headings, selectable text, no sidebars.
- **Two-page max for resume PDFs.** Flag if content exceeds two pages.
- **Work in phases.** Explain changes before large refactors. Preserve existing functionality unless a change is clearly necessary.

### Application Folder System

Every job application lives in its own folder:

```
applications/
  {company-slug}-{role-slug}-{YYYY-MM-DD}/
    job-description.md
    metadata.json
    score.json
    resume.md
    resume.pdf
    cover-letter.md
    cover-letter.pdf
    notes.md
    interview.md          (generated when status → Interview)
    edit-history.json     (optional, chat edit log)
```

Folder names: lowercase, hyphens only. Example: `d2l-software-developer-2026-05-28`.

### metadata.json Schema

```json
{
  "id": "d2l-software-developer-2026-05-28",
  "company": "D2L",
  "jobTitle": "New Graduate Software Developer",
  "location": "Kitchener, ON / Hybrid",
  "jobUrl": "https://careers.d2l.com/...",
  "status": "Cover Letter Generated",
  "createdAt": "2026-05-28",
  "updatedAt": "2026-05-28",
  "resumePath": "applications/d2l-software-developer-2026-05-28/resume.pdf",
  "coverLetterPath": "applications/d2l-software-developer-2026-05-28/cover-letter.pdf",
  "interviewPrepPath": null,
  "notesPath": "applications/d2l-software-developer-2026-05-28/notes.md"
}
```

### Supported Application Statuses

```
Saved → Resume Generated → Cover Letter Generated → Ready to Apply →
Applied → In Progress → Interview → Offer / Rejected / Withdrawn
```

Frontend workflow statuses are authoritative for this personalized fork. Legacy upstream statuses
(`Responded`, `Discarded`, `SKIP`) remain accepted by validation/merge/dashboard tooling for compatibility.

### Phased Implementation Plan

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Codebase inspection + baseline | ✅ Complete |
| 1 | Profile setup — `profile.yml`, `_profile.md`, `applications/` dir, `new-application.mjs` | ✅ Complete |
| 2 | Cover letter generation — `modes/cover-letter.md` + `templates/cover-letter-template.html` | ✅ Complete |
| 3 | Full pipeline — evaluation, `score.json`, resume + cover letter saved per application, metadata sync | ✅ Complete |
| 4 | Resume + cover letter templates redesigned to match candidate's PDF format | ✅ Complete |
| 5 | Status management — `update-status.mjs` syncs all 3 data stores | ✅ Complete |
| 6 | Interview prep — on-demand only (`modes/interview-prep.md`), never auto-triggered | ✅ Complete |
| 7 | Chat-based document editing — `modes/edit-application.md`, never touches master profile | ✅ Complete |
| 8 | CLI dashboard — `list-applications.mjs`, `modes/tracker.md` | ✅ Complete |
| 9 | Gated pipeline — score gate (score < 80 → ask before proceeding) | ✅ Complete |
| 10 | Web frontend — Next.js at `frontend/`: Job Discovery, Application Tracker, Application Detail, Chat, Interview Guide | ✅ Complete |
| 11 | Frontend UI redesign — light theme, polished components | ✅ Complete |
| 12 | Self-contained frontend pipeline — paste JD/URL → `/api/evaluate` → score card → user decides → `/api/generate-docs/{id}` → PDFs | ✅ Complete |
| 15 | PDF download — `GET /api/applications/{id}/pdf?type=resume\|cover-letter` streams PDF; download buttons in UI | ✅ Complete |
| 20 | Baseline stabilization — frontend statuses accepted by legacy validators, Canada-focused `portals.yml`, initial scan queue files, docs synced | ✅ Complete |
| 13 | Portal scan → scored job cards — `POST /api/scan/run` runs `scan.mjs --dry-run --json`, quick-scores results, writes `data/scored-queue.json`, and Job Discovery can refresh/evaluate scan cards | ✅ Complete |
| 14 | Generate application from scan cards — scan card Evaluate runs full `/api/evaluate`; user confirms from the score card → generate-docs | ✅ Complete |
| 18A | Expanded portals, first batch — added verified provider-compatible Canadian/Ontario sources to `portals.yml` | ✅ First batch |
| 18B | Rich scan metadata — posted/first-seen/last-seen/source/direct-apply metadata plus filters and quality lanes | ✅ First batch |
| 21 | Compliant outreach assistant — public-source/user-provided contact leads + LinkedIn/email drafts in Application Detail | ✅ First batch |
| 22 | Recent-first discovery — Eluta Canada search adapter, 24h freshness mode, role-priority ranking, and manual job-alert/URL import without scraping LinkedIn/Indeed/Glassdoor | ✅ First batch |
| 18 | **Expanded portals, next batch** — continue toward 150+ companies; add Workday/Teamtailor/BambooHR/custom parsers only for verified high-value Canadian sources | 🔜 Next |
| 19 | **Email job alerts** — After scan, diff against last run; new jobs ≥ threshold → Resend API digest email | 🔜 After 18 |
| 16 | **Settings / Profile page** — `/settings`: edit `profile.yml` and `portals.yml` from the browser | 🔜 After 19 |
| 17 | **Application form assistant** — "Apply" tab: paste form questions → AI generates copy-paste answers | 🔜 After 16 |

### Gated Pipeline — How It Works

**In the frontend (primary flow):**
1. User pastes JD or URL → clicks **Evaluate** → `POST /api/evaluate` → score card shown (0–100)
2. User decides — no automatic doc generation
3. If user clicks **Generate Resume & Cover Letter** → `POST /api/generate-docs/{id}` → PDFs created

**Score thresholds:** 85+ Strong Apply (emerald) · 70–84 Apply (blue) · 50–69 Maybe (amber) · <50 Skip (red). Gate is informational, not blocking.

**Evaluation reliability rule:** pasted JD text and direct job URLs must pass through the same normalization layer before scoring. The evaluator strips ATS/legal boilerplate, uses structured Greenhouse/Ashby/Lever data when available, and scores with deterministic settings plus a fixed 100-point rubric. After Gemini responds, backend guardrails recompute/cap the score for hard requirements such as 4+ years professional software experience, 2+ years professional embedded software experience, or missing industrial automation stacks (SCADA/MES/CAN/LIN/automotive standards). If URL and pasted-text results diverge, inspect the saved `applications/{id}/job-description.md` first — the URL may not have exposed the full JD.

**Model routing:** frontend Gemini routes use configurable model selection. `.env.local` may set `GEMINI_MODEL` for all routes or task-specific overrides (`GEMINI_EVALUATE_MODEL`, `GEMINI_DOCS_MODEL`, `GEMINI_CHAT_MODEL`, `GEMINI_INTERVIEW_MODEL`) plus comma-separated fallback lists (`GEMINI_FALLBACK_MODELS` or task-specific fallback variables). Restart `npm run dev` after changing model env vars.

**Scoring QA:** run `npm run eval:qa` from the repo root before bulk scanning sessions or scoring changes. It uses `tests/evaluation-fixtures/*.json` and the same guardrail core as the app, without calling Gemini.

**Scan QA:** run `npm run scan:qa` before changing scanner ranking, Eluta parsing, or role-priority logic. It checks Eluta-style relative timestamps and verifies full-time new-grad/entry roles outrank internships/co-ops.

**Contact QA:** run `npm run contacts:qa` before changing outreach extraction. It verifies that contact leads come only from public job context, user-provided LinkedIn URLs, or an explicit manual-research placeholder.

**Job Discovery reset:** every evaluated score card should let the user evaluate another job without refreshing the page. Keep this available for Maybe/Skip outcomes as well as Apply outcomes.

**Application detail previews:** resume, cover letter, and interview prep are viewable inside the platform with a Preview/Source toggle. Chat edits refresh the live Markdown preview immediately.

### Scan Queue — How It Works (Phase 13)

Phase 13 is implemented. `portals.yml` exists with Canada/Ontario-focused provider-compatible companies plus an Eluta Canada IT/software search adapter,
`data/pipeline.md` has the scanner's expected sections, and `data/scored-queue.json` is the local ranked scan queue.

1. User clicks Refresh in Job Discovery → `POST /api/scan/run`
2. API runs `node scan.mjs --dry-run --json` so scanner discovery is machine-readable without mutating `pipeline.md`
3. New job metadata is quick-scored in one Gemini call through the configurable evaluate model; if AI scoring fails, local fallback scoring keeps the queue usable
4. Results merge into `data/scored-queue.json`, sorted by posting/first-seen freshness, then `rolePriority`, score, and source quality. Cards store `postedAt`, `postedAgeHours`, `freshnessBucket`, `firstSeenAt`, `lastSeenAt`, `directApplyUrl`, `sourceType`, `sourceName`, `rolePriority`, `employmentType`, and `recencyConfidence`
5. User clicks Evaluate on a card → full `/api/evaluate` fetches the JD and applies the trusted evaluation/guardrails
6. User confirms from the score card → `/api/generate-docs/{id}` creates the tailored resume and cover letter
7. Job Discovery shows Strong Apply / Apply / Maybe / Skip lanes plus score, company, source, role type, and freshness filters. Default operating mode is last-24-hours first.
8. User can paste LinkedIn/Indeed/Glassdoor/Eluta/employer URLs or job-alert text into `POST /api/scan/import`. This preserves job-board signals without scraping restricted platforms.

### Outreach Assistant — Exact Behaviour

- Contact leads are stored per application in `applications/{id}/contacts.json`.
- Allowed sources: public job/application text, public company/team/recruiting notes pasted by the user, and user-provided LinkedIn/profile URLs.
- Forbidden behavior: automated LinkedIn scraping, auto-connecting, auto-messaging, hidden phone-number collection, or invented contact facts.
- Drafts generated: LinkedIn connection note, LinkedIn follow-up, cold email subject, and cold email body. User sends everything manually. Connection notes should be warm, specific, and low-pressure; do not ask for a referral or favor in the first note.

### Interview Prep — Exact Behaviour

- **Block F in evaluation report** = STAR stories table inside the report. Always generated with A-G evaluation. Planning notes only.
- **Full interview prep** = `modes/interview-prep.md` → `applications/{id}/interview.md`. Runs ONLY when user explicitly requests it OR status changes to `Interview`.
- **Never runs during auto-pipeline or initial evaluation.**

### Frontend Architecture

```
frontend/                        Next.js app — run with: cd frontend && npm run dev
  app/page.tsx                   Job Discovery (localhost:3000/) — paste JD + scan results tab
  app/applications/page.tsx      Application Tracker (localhost:3000/applications)
  app/applications/[id]/page.tsx Application Detail — resume, cover letter, chat, interview guide
  app/api/evaluate/route.ts      POST — Gemini 2.5 Flash: score JD, extract info, create app folder
  app/api/generate-docs/[id]/    POST — Gemini 2.5 Flash ×2 + Playwright: resume PDF + cover letter PDF
  app/api/applications/          GET all / GET one / PUT status / GET pdf
  app/api/chat/                  POST — configurable Gemini chat model: multi-turn chat for document editing
  app/api/interview/             POST — configurable Gemini interview model: generate interview.md
  app/api/scan/                  GET — reads data/scored-queue.json
  app/api/scan/run/              POST — runs scan.mjs + bulk quick-scores with scan metadata
  app/api/scan/import/           POST — imports pasted job-board URLs or job-alert text without scraping restricted platforms
  app/api/applications/[id]/contacts/ GET/POST — compliant contact leads + outreach drafts
  lib/filesystem.ts              All file reads/writes — single swap point for DB migration
  .env.local                     GEMINI_API_KEY=... (required) · RESEND_API_KEY=... (Phase 19)
```

### AI Model Strategy

| Route | Model | Reason |
|-------|-------|--------|
| `/api/evaluate` | `gemini-2.5-flash` | Best reasoning for scoring |
| `/api/generate-docs` | `gemini-2.5-flash` | Best output for document generation |
| `/api/chat` | `gemini-2.5-flash` | Reliability for document edits and application Q&A |
| `/api/interview` | `gemini-2.5-flash` | Reliability for complete interview guide generation |
| `/api/scan/run` quick-score | Configurable evaluate model (`GEMINI_EVALUATE_MODEL`/fallbacks) | Bulk preliminary ranking; local fallback if AI quota/model fails |

`gemini-2.5-flash` MUST use `thinkingConfig: { thinkingBudget: 0 }` — without this, thinking tokens truncate JSON/HTML output mid-response.

Response parsing uses a 3-fallback chain: `===DELIMITERS===` → markdown code blocks → raw `{...}` object.

Font paths in generated HTML use `../../fonts/` (relative to `applications/{id}/`) → resolves to `career-ops/fonts/` when Playwright renders via `file://`.

The frontend shell uses the local system font stack rather than `next/font/google`, so `npm run build` does not depend on Google Fonts network access. Turbopack may still print a trace warning because API routes intentionally read career-ops root files outside `frontend/`.

`export const maxDuration = 120` on generate-docs route (PDF gen takes 45–90s).

### Key Scripts

| Script | Usage |
|--------|-------|
| `new-application.mjs` | `node new-application.mjs --company="..." --role="..." [--url="..."] [--location="..."]` |
| `update-status.mjs` | `node update-status.mjs --id="..." --status="..."` — syncs metadata.json + applications.json + applications.md |
| `update-status.mjs` | `node update-status.mjs --list` — list all application IDs |
| `list-applications.mjs` | `node list-applications.mjs [--id="..."] [--open="..."]` |
