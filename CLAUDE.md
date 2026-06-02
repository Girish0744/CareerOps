# Career-Ops -- AI Job Search Pipeline

## Origin

This system was built and used by [santifer](https://santifer.io) to evaluate 740+ job offers, generate 100+ tailored CVs, and land a Head of Applied AI role. The archetypes, scoring logic, negotiation scripts, and proof point structure all reflect his specific career search in AI/automation roles.

The portfolio that goes with this system is also open source: [cv-santiago](https://github.com/santifer/cv-santiago).

**It will work out of the box, but it's designed to be made yours.** If the archetypes don't match your career, the modes are in the wrong language, or the scoring doesn't fit your priorities -- just ask. You (AI Agent) can edit the user's files. The user says "change the archetypes to data engineering roles" and you do it. That's the whole point.

## Data Contract (CRITICAL)

There are two layers. Read `DATA_CONTRACT.md` for the full list.

**User Layer (NEVER auto-updated, personalization goes HERE):**
- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`
- `data/*`, `reports/*`, `output/*`, `interview-prep/*`

**System Layer (auto-updatable, DON'T put user data here):**
- `modes/_shared.md`, `modes/oferta.md`, all other modes
- `CLAUDE.md`, `*.mjs` scripts, `dashboard/*`, `templates/*`, `batch/*`

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

AI-powered job search automation built on Claude Code: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing.

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
| `reports/` | Evaluation reports (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`). Blocks A-F + G (Posting Legitimacy), plus `## Machine Summary` YAML for downstream scripts. Header includes `**Legitimacy:** {tier}`. |

### OpenCode Commands

When using [OpenCode](https://opencode.ai), the following slash commands are available (defined in `.opencode/commands/`):

| Command | Claude Code Equivalent | Description |
|---------|------------------------|-------------|
| `/career-ops` | `/career-ops` | Show menu or evaluate JD with args |
| `/career-ops-pipeline` | `/career-ops pipeline` | Process pending URLs from inbox |
| `/career-ops-evaluate` | `/career-ops oferta` | Evaluate job offer (A-F scoring) |
| `/career-ops-compare` | `/career-ops ofertas` | Compare and rank multiple offers |
| `/career-ops-contact` | `/career-ops contacto` | LinkedIn outreach (find contacts + draft) |
| `/career-ops-deep` | `/career-ops deep` | Deep company research |
| `/career-ops-pdf` | `/career-ops pdf` | Generate ATS-optimized CV |
| `/career-ops-latex` | `/career-ops latex` | Export CV as LaTeX/Overleaf .tex |
| `/career-ops-training` | `/career-ops training` | Evaluate course/cert against goals |
| `/career-ops-project` | `/career-ops project` | Evaluate portfolio project idea |
| `/career-ops-tracker` | `/career-ops tracker` | Application status overview |
| `/career-ops-apply` | `/career-ops apply` | Live application assistant |
| `/career-ops-scan` | `/career-ops scan` | Scan portals for new offers |
| `/career-ops-batch` | `/career-ops batch` | Batch processing with parallel workers |
| `/career-ops-patterns` | `/career-ops patterns` | Analyze rejection patterns and improve targeting |
| `/career-ops-followup` | `/career-ops followup` | Follow-up cadence tracker |

**Note:** OpenCode commands invoke the same `.claude/skills/career-ops/SKILL.md` skill used by Claude Code. The `modes/*` files are shared between both platforms.

### Gemini CLI Commands

When using the [Gemini CLI](https://github.com/google-gemini/gemini-cli), the following slash commands are available (defined in `.gemini/commands/`):

| Command | Claude Code Equivalent | Description |
|---------|------------------------|-------------|
| `/career-ops` | `/career-ops` | Show menu or evaluate JD with args |
| `/career-ops-pipeline` | `/career-ops pipeline` | Process pending URLs from inbox |
| `/career-ops-evaluate` | `/career-ops oferta` | Evaluate job offer (A-G scoring) |
| `/career-ops-compare` | `/career-ops ofertas` | Compare and rank multiple offers |
| `/career-ops-contact` | `/career-ops contacto` | LinkedIn outreach (find contacts + draft) |
| `/career-ops-deep` | `/career-ops deep` | Deep company research |
| `/career-ops-pdf` | `/career-ops pdf` | Generate ATS-optimized CV |
| `/career-ops-training` | `/career-ops training` | Evaluate course/cert against goals |
| `/career-ops-project` | `/career-ops project` | Evaluate portfolio project idea |
| `/career-ops-tracker` | `/career-ops tracker` | Application status overview |
| `/career-ops-apply` | `/career-ops apply` | Live application assistant |
| `/career-ops-scan` | `/career-ops scan` | Scan portals for new offers |
| `/career-ops-batch` | `/career-ops batch` | Batch processing with parallel workers |
| `/career-ops-patterns` | `/career-ops patterns` | Analyze rejection patterns and improve targeting |
| `/career-ops-followup` | `/career-ops followup` | Follow-up cadence tracker |

**Note:** Gemini CLI commands are defined in `.gemini/commands/*.toml`. The project context is auto-loaded from `GEMINI.md`. All `modes/*` files are shared across Claude Code, OpenCode, and Gemini CLI.

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

**When NOT to:** If the user applies to English-language roles, even at French, German, or Japanese companies, use the default English modes.

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

**Exception for batch workers (`claude -p`):** Playwright is not available in headless pipe mode. Use WebFetch as fallback and mark the report header with `**Verification:** unconfirmed (batch mode)`. The user can verify manually later.

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
@AGENTS.md
<!-- Add anything Claude Code specific that other agents don't need -->

---

## Personal Job Application Command Center

This project has been customized into a personal job application command center for Girish Bhuteja.

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

Folder names: lowercase, hyphens only. Example: `openai-ai-engineer-2026-05-28`.

### metadata.json Schema

```json
{
  "id": "openai-ai-engineer-2026-05-28",
  "company": "OpenAI",
  "jobTitle": "AI Engineer",
  "location": "Toronto, ON / Remote",
  "jobUrl": "https://example.com/job",
  "status": "Resume Generated",
  "createdAt": "2026-05-28",
  "updatedAt": "2026-05-28",
  "resumePath": "applications/openai-ai-engineer-2026-05-28/resume.pdf",
  "coverLetterPath": "applications/openai-ai-engineer-2026-05-28/cover-letter.pdf",
  "interviewPrepPath": null,
  "notesPath": "applications/openai-ai-engineer-2026-05-28/notes.md"
}
```

### Supported Application Statuses

```
Saved → Resume Generated → Cover Letter Generated → Ready to Apply →
Applied → In Progress → Interview → Offer / Rejected / Withdrawn
```

### Interview Prep Trigger

When an application status changes to `Interview`, automatically:
1. Generate `applications/{id}/interview.md` using `modes/interview-prep.md` as instructions.
2. Use `job-description.md`, `resume.md`, `cover-letter.md`, `score.json`, and `interview-prep/story-bank.md` as inputs.
3. Update `metadata.json` with the `interviewPrepPath`.

### Chat Editing Rules

When the user requests edits to a generated resume or cover letter:
- Edit only `applications/{id}/resume.md` or `applications/{id}/cover-letter.md`.
- After editing the Markdown, regenerate the PDF.
- Log the edit to `applications/{id}/edit-history.json` if it exists.
- Do NOT rewrite the whole document unless the user explicitly asks.
- Do NOT add skills or experience not present in the master profile.

### Phased Implementation Plan

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Codebase inspection + CLAUDE.md baseline | ✅ Complete |
| 1 | Profile alignment — profile.yml, _profile.md, applications/ dir, applications.json, new-application.mjs | ✅ Complete |
| 2 | Cover letter generation — `modes/cover-letter.md` + `templates/cover-letter-template.html` | ✅ Complete |
| 3 | Full pipeline — evaluation, score.json, resume + cover letter in application folder, metadata sync | ✅ Complete |
| 4 | Resume + cover letter templates redesigned to match user's actual PDF format | ✅ Complete |
| 5 | Status management — `update-status.mjs` updates all 3 data stores | ✅ Complete |
| 6 | Interview prep — on-demand button only, NEVER auto-triggered | ✅ Complete |
| 7 | Chat-based document editing — `modes/edit-application.md`, never touches master profile | ✅ Complete |
| 8 | CLI dashboard — `list-applications.mjs`, `modes/tracker.md` | ✅ Complete |
| 9 | Gated pipeline — score gate in `modes/auto-pipeline.md` Step 1.5 (score < 80 = ask to skip) | ✅ Complete |
| 10 | Web frontend — Next.js at `frontend/`, Job Discovery, Application Tracker, Application Detail, Chat, Interview Guide | ✅ Complete |
| 11 | Frontend UI redesign — light theme, polished components, hydration error fix | ✅ Complete |
| 12 | **Self-contained frontend pipeline** — replaced clipboard approach: paste JD/URL → `/api/evaluate` (Gemini API) → score card shown in UI → user decides → `/api/generate-docs/{id}` (Gemini API + Playwright subprocess) → resume PDF + cover letter PDF, all from browser, no Claude Code session needed | ✅ Complete |
| 13 | **Portal scan → scored job cards** — scan.mjs → quick-score each result → `data/scored-queue.json` → Job Discovery page shows live scanned job cards with scores | 🔜 Next |
| 14 | **"Generate Application" from scanned cards** — "Generate Application" button on scanned job cards triggers the full evaluate → generate-docs pipeline via API | 🔜 After 13 |
| 15 | **PDF download** — `GET /api/applications/{id}/pdf?type=resume\|cover-letter` streams PDF from disk; Download buttons appear in Application Detail when PDFs exist | ✅ Complete |
| 16 | **Settings / Profile page** — View and edit profile.yml and portals.yml from the frontend | 🔜 After 13 |
| 17 | **Application form assistant** — Structured "Apply" tab for copy-paste form filling (paste questions → get answers) | 🔜 After 16 |

### Interview Prep — Exact Behaviour (IMPORTANT)

**Block F in evaluation report** = a STAR stories table saved inside `reports/{###}.md`. This is always generated as part of A-G evaluation. It is planning notes, NOT the full interview prep.

**Full interview prep** (`modes/interview-prep.md`) = deep web research, real Glassdoor questions, complete interview guide saved to `applications/{id}/interview.md`. This runs ONLY when:
1. User explicitly says "prep for interview at [company]", OR
2. User runs `node update-status.mjs --id="..." --status="Interview"` and then confirms they want prep generated.

**Never runs during auto-pipeline.** Never runs on initial evaluation.

### Gated Pipeline — How It Works (Phases 9 + 12, Complete)

**In the frontend (primary flow):**
When user pastes a JD or URL in the Job Discovery page:
1. Click **Evaluate** → `POST /api/evaluate` → Gemini scores the JD against candidate profile
2. Score card appears in the UI (score 0–100, fit level, 2–3 sentence summary, matched skills, gaps)
3. User sees the score and decides what to do — no automatic doc generation
4. If user clicks **Generate Resume & Cover Letter** → `POST /api/generate-docs/{id}` → Gemini generates both docs + PDFs
5. "View evaluation only" link goes to Application Detail without generating docs
6. Application folder is always created at step 1 (status = `Evaluated`)

**Score interpretation:**
- 85+ → Strong Apply (emerald)
- 70–84 → Apply (blue)
- 50–69 → Maybe (amber)
- <50 → Skip (red)
User may generate docs for any score — the gate is informational, not blocking.

### Scan Queue — How It Works (Phase 13, Next)

1. User runs `/career-ops scan` → portals scan runs (scan.mjs)
2. For each new job found: quick score against profile (no full report, just a fit rating)
3. Show ranked list to user:
   ```
   Company        Role                    Score   Recommendation
   Shopify        Full Stack Developer    91/100  ★ Strong Apply
   D2L            Software Developer      82/100  ★ Strong Apply
   Acme Corp      Junior Dev              61/100  ✗ Below threshold
   ```
4. User selects which ones to process (by number or company name)
5. For each selected: full gated pipeline runs (evaluation → confirm → resume + cover letter)
6. Jobs below threshold are saved as Discarded/Skip in the tracker automatically

### Frontend

```
frontend/                        Next.js app — run with: cd frontend && npm run dev
  app/page.tsx                   Job Discovery page (localhost:3000/) — two-step pipeline
  app/applications/page.tsx      Application Tracker (localhost:3000/applications)
  app/applications/[id]/page.tsx Application Detail — resume, cover letter, chat, interview guide
  app/api/evaluate/route.ts      POST — Gemini 2.5 Flash: evaluate JD, return score card, create app folder
  app/api/generate-docs/[id]/    POST — Gemini 2.5 Flash x2 + Playwright: generate resume PDF + cover letter PDF
  app/api/applications/          GET all / GET one / PUT status / GET pdf (streams PDF file)
  app/api/chat/                  POST — Gemini 2.0 Flash: chat scoped to one application's documents
  app/api/interview/             POST — Gemini 2.0 Flash: generate interview.md with optional LinkedIn URL
  app/api/scan/                  GET — reads data/scored-queue.json (Phase 13)
  lib/filesystem.ts              All file reads/writes — swap this for a DB to deploy later
  .env.local                     GEMINI_API_KEY=AIzaSy...   ← REQUIRED
```

**To start:** `cd frontend && npm run dev` → opens at http://localhost:3000

**Required:** Add your Gemini API key to `frontend/.env.local`:
```
GEMINI_API_KEY=your-key-here
```
Get a free key (no credit card): https://aistudio.google.com/app/apikey

### AI API — What Each Route Uses It For

All AI work happens server-side via the **Google Gemini API** using the `@google/genai` SDK (v0.24+). The user never needs to open a Claude Code session.

**Two-tier model strategy (free tier quota management):**
| Route | Model | Free Tier Quota | Reason |
|-------|-------|----------------|--------|
| `/api/evaluate` | `gemini-2.5-flash` | 20 req/day | Quality scoring — needs best reasoning |
| `/api/generate-docs` | `gemini-2.5-flash` | 20 req/day | Quality doc generation — needs best output |
| `/api/chat` | `gemini-2.0-flash` | 200 req/day | Frequent — preserve 2.5-flash quota |
| `/api/interview` | `gemini-2.0-flash` | 200 req/day | Frequent — preserve 2.5-flash quota |

**Important:** `gemini-2.5-flash` uses `thinkingConfig: { thinkingBudget: 0 }` to disable thinking mode. Without this, thinking tokens consume the output token budget and the JSON/HTML response gets truncated mid-output.

**Production plan:** Switch to `claude-sonnet-4-6` via Anthropic API once the full pipeline is validated end-to-end.

**API key:** `GEMINI_API_KEY` in `frontend/.env.local`
Get a free key at: https://aistudio.google.com/app/apikey

| API Route | What the Model Does | Approx Tokens |
|-----------|---------------------|---------------|
| `POST /api/evaluate` | Reads JD + CV + profile → scores 0–100, extracts company/title/location, lists matched skills and gaps | ~2k input / 1.5k output |
| `POST /api/generate-docs/{id}` | Call 1: tailored resume markdown + filled HTML. Call 2: cover letter markdown + HTML. Then Playwright converts each to PDF. | ~12k input / 8k output per call |
| `POST /api/chat` | Answers editing questions scoped to one application's documents (multi-turn with history) | ~4k input / 2k output |
| `POST /api/interview` | Generates full interview prep guide from JD + resume + story bank | ~6k input / 8k output |

**Key behaviours:**
- `/api/evaluate` creates the application folder and `score.json` — always runs first
- `/api/generate-docs` requires the application to exist (404 if not). Called only after user sees score and decides to proceed.
- Response parsing uses a 3-fallback chain: custom `===DELIMITERS===` → markdown code blocks → raw `{...}` object. This handles Gemini's varying output formats.
- Font paths in generated HTML use `../../fonts/` (relative to `applications/{id}/`) to resolve correctly to `career-ops/fonts/` when Playwright renders via `file://` URL
- `export const maxDuration = 120` on generate-docs route to override Next.js 30s default (PDF gen takes ~45–90s)
- To switch to Claude: replace `@google/genai` imports with `@anthropic-ai/sdk`, change env var to `ANTHROPIC_API_KEY`

### Key Scripts

| Script | Usage |
|--------|-------|
| `new-application.mjs` | `node new-application.mjs --company="..." --role="..." [--url="..."] [--location="..."]` — Create application folder |
| `update-status.mjs` | `node update-status.mjs --id="..." --status="..."` — Update status in all 3 data stores |
| `update-status.mjs` | `node update-status.mjs --list` — Show all application IDs |
| `list-applications.mjs` | `node list-applications.mjs` — View all applications with status and docs |
| `list-applications.mjs` | `node list-applications.mjs --id="..."` — View one application in detail |
| `list-applications.mjs` | `node list-applications.mjs --open="..."` — Open application folder in file explorer |

### Skill Mode Routing (updated)

| If the user... | Mode |
|----------------|------|
| Pastes JD or URL | `auto-pipeline` — full package: folder + score + resume + cover letter |
| Asks to evaluate | `oferta` — A-G evaluation only |
| Wants only resume PDF | `pdf` — routes to application folder |
| Wants cover letter | `cover-letter` |
| Wants to edit resume or cover letter | `edit-application` |
| Asks about application status | `tracker` |
| Updates status to Interview | `interview-prep` — generate `applications/{id}/interview.md` |
| Compares offers | `ofertas` |
| LinkedIn outreach | `contacto` |
| Company research | `deep` |
| Fills out application form | `apply` — NEVER auto-submits |
| Scans portals | `scan` |
| Processes pending URLs | `pipeline` |
| Batch processing | `batch` |
| Rejection patterns | `patterns` |
| Follow-up cadence | `followup` |
