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
- Girish fork exception: `templates/cv-template.html` is user-approved presentation state and must not be overwritten or edited unless Girish explicitly asks for a resume layout/design change.

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
| `templates/cv-template.html` | Final locked HTML template for Girish's generated resume PDFs |
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
- "Change the CV template design" → edit `templates/cv-template.html` only if Girish explicitly requests a resume layout/design change; otherwise keep the locked format unchanged
- "Adjust the scoring weights" → edit `modes/_profile.md` for user-specific weighting, or edit `modes/_shared.md` and `batch/batch-prompt.md` only when changing the shared system defaults for everyone

### Language Modes

Default modes are in `modes/` (English). Additional language-specific modes are available:

- **German (DACH market):** `modes/de/` — native German translations with DACH-specific vocabulary (13. Monatsgehalt, Probezeit, Kündigungsfrist, AGG, Tarifvertrag, etc.). Includes `_shared.md`, `angebot.md` (evaluation), `bewerben.md` (apply), `pipeline.md`.
- **French (Francophone market):** `modes/fr/` — native French translations with France/Belgium/Switzerland/Luxembourg-specific vocabulary (CDI/CDD, convention collective SYNTEC, RTT, mutuelle, prévoyance, 13e mois, intéressement/participation, titres-restaurant, CSE, portage salarial, etc.). Includes `_shared.md`, `offre.md` (evaluation), `postuler.md` (apply), `pipeline.md`.
- **Japanese (Japan market):** `modes/ja/` — native Japanese translations with Japan-specific vocabulary (正社員, 業務委託, 賞与, 退職金, みなし残業, 年俸制, 36協定, 通勤手当, 住宅手当, etc.). Includes `_shared.md`, `kyujin.md` (evaluation), `oubo.md` (apply), `pipeline.md`.
- **Turkish (Turkey market):** `modes/tr/` — native Turkish translations with Turkey-specific vocabulary (SGK, kıdem tazminatı, ihbar süresi, brüt/net maaş, AGİ, BES, yemek kartı, yol yardımı, TÜFE zammı, etc.). Includes `_shared.md`, `is-ilani.md` (evaluation), `basvuru.md` (apply), `pipeline.md`.
- **Portuguese:** `modes/pt/` — Includes `_shared.md`, `oferta.md`, `aplicar.md`, `pipeline.md`.
- **Russian:** `modes/ru/` — Includes `_shared.md`, `oferta.md`, `apply.md`, `interview-prep.md`, `pipeline.md`.
- **Ukrainian:** `modes/ua/` — Includes `_shared.md`, `oferta.md`, `apply.md`, `interview-prep.md`, `pipeline.md`.

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
<!-- Claude Code-specific additions below. AGENTS.md is the primary source of truth for everything else. -->

---

## Personal Job Application Command Center

This project has been customized into a personal job application command center for **Girish Bhuteja** (Cambridge, ON · graduating BCS Conestoga August 2026 · targeting software/AI roles in Canada).

### Safety Rules (MANDATORY)

- **NEVER auto-submit a job application.** Fill forms, draft answers, generate PDFs — but always STOP before Submit/Send/Apply. The user clicks last.
- **NEVER invent candidate experience.** Only use facts from `cv.md`, `config/profile.yml`, `modes/_profile.md`, and `article-digest.md`.
- **NEVER edit master profile files during job-specific chat edits.** Application-specific edits go only into `applications/{id}/resume.md` or `applications/{id}/cover-letter.md`.
- **ATS-friendly resumes only.** Single-column, standard headings, selectable text, no sidebars.
- **Two-page max for resume PDFs.** Flag if content exceeds two pages.
- **Resume format is locked.** `templates/cv-template.html` is Girish's final approved resume format. Do not edit it for content selection, ATS tuning, scoring, frontend work, or cover-letter work. Only change it if Girish explicitly asks for a resume layout/design update.

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
| 13 | Portal scan → scored job cards — `POST /api/scan/run` + `data/scored-queue.json` + Job Discovery scan tab | ✅ Complete |
| 14 | Generate application from scan cards — scan card Evaluate runs full `/api/evaluate`; user confirms → generate-docs | ✅ Complete |
| 15 | PDF download — `GET /api/applications/{id}/pdf?type=resume\|cover-letter` streams PDF; download buttons in UI | ✅ Complete |
| 17A | Human-reviewed Apply foundation — Apply tab, apply-session answers, profile truth table, upload paths, final-submit guard | ✅ Complete |
| 17B | Visible ATS apply filling — Playwright opens visible browser, resolves Apply links, fills high-confidence fields, stops before Submit | ✅ Complete |
| 17B.2 | Reliable apply-fill hardening — source-balanced scan ranking, multi-hop Apply resolver, natural field matching, checkbox/radio safety | ✅ Complete |
| 17C | Chrome extension companion — MV3 foundation in `browser-extension/` (manifest, popup, content.js) | ✅ Foundation |
| 18A | Expanded portals, first batch — verified provider-compatible Canadian/Ontario sources in `portals.yml` | ✅ First batch |
| 18B | Rich scan metadata — posted/first-seen/last-seen/source/direct-apply metadata + filters + quality lanes | ✅ Complete |
| 20 | Baseline stabilization — frontend statuses accepted by validators, Canada-focused portals, initial scan queue files | ✅ Complete |
| 21 | Compliant outreach assistant — public-source contact leads + LinkedIn/email drafts in Application Detail | ✅ Complete |
| 22 | Recent-first discovery — Eluta Canada adapter, 24h freshness mode, role-priority ranking, manual job-alert import | ✅ Complete |
| 23 | Review-state tracking — scan cards track New, Viewed, Evaluated, Docs Ready, Applied, and Archived states; Applications sort by latest activity timestamps | ✅ Complete |
| 24 | Resume format lock — `templates/cv-template.html` is the final visual format for generated resume PDFs; future work should improve tailored content without editing the template unless explicitly requested | ✅ Complete |
| 18 | **Expanded portals, next batch** — grow from 19 → 150+ companies; add Workday/Teamtailor/BambooHR providers | 🔜 Next |
| 19 | **Email job alerts** — diff scan queue after run; new jobs ≥ threshold → Resend API digest email | 🔜 After 18 |
| 16 | **Settings / Profile page** — `/settings`: edit `profile.yml` and `portals.yml` from browser | 🔜 After 19 |
| 17C | **Chrome extension completion** — app picker dropdown, current-tab URL capture, field filling via apply-session | 🔜 After 16 |

### Gated Pipeline — How It Works

**In the frontend (primary flow):**
1. User pastes JD or URL → clicks **Evaluate** → `POST /api/evaluate` → score card shown (0–100)
2. User decides — no automatic doc generation
3. If user clicks **Generate Resume & Cover Letter** → `POST /api/generate-docs/{id}` → PDFs created

**Resume format lock:** all generated resumes use `templates/cv-template.html` as the single final visual format. There is no runtime format/theme selection. `/api/generate-docs/{id}` may tailor content and project selection, but final resume styling is canonicalized to the template before PDF rendering. Preserve this template unless Girish explicitly requests a layout/design change.

**Document generation pipeline (staged, verified):** `/api/generate-docs/{id}` no longer asks Gemini for HTML. Per document it runs: (1) one Gemini call returning structured JSON (`analysis` with archetype + must-have ATS keywords first, then content fields); (2) programmatic verification in `frontend/lib/document-content-core.mjs` — keyword coverage, banned phrases/verbs, voice, bullet budgets, fabrication tripwires; (3) at most ONE targeted Gemini repair call when fix-severity issues remain; (4) deterministic markdown build from the JSON (fixed facts — project names/URLs/dates, employer headers, education, awards, certifications — come from code catalogs in `document-content-core.mjs`, never from the model); (5) render through the locked template via `document-renderer.ts`; (6) if the PDF exceeds 2 pages, deterministic content trims + re-render (no extra AI calls). Results are written to `applications/{id}/generation-report.json` (keyword coverage, remaining issues, repairs, trims, page count) and surfaced in the Job Discovery done-card and the Application Detail "Generation report" panel. When Girish's fixed facts change (new project, award, role), update the catalogs in `frontend/lib/document-content-core.mjs` AND the prompts in `frontend/lib/document-prompts.ts`.

**Score thresholds:** 85+ Strong Apply (emerald) · 70–84 Apply (blue) · 50–69 Maybe (amber) · <50 Skip (red). Gate is informational, not blocking.

### Scan Review State

`data/scored-queue.json` stores scan-card discovery metadata plus review state. Job Discovery states are `new`, `viewed`, `evaluated`, `docs`, `applied`, and `archived`. Opening a scan-card posting link or clicking Mark viewed records `viewedAt` without creating an application folder. Evaluate creates/syncs the application, document generation moves the card to Docs ready, and Mark applied records manual submission after confirmation.

Applications store `evaluatedAt`, `resumeGeneratedAt`, `coverLetterGeneratedAt`, `lastDocumentGeneratedAt`, `appliedAt`, and `lastActivityAt`. The Applications page sorts by latest activity and Application Detail shows the same timeline.

### Apply-by-Email (postings with no application link)

Some postings (LinkedIn hiring posts, recruiter posts) have no URL and no form — you apply by emailing a resume, often with a **mandatory subject line** ("mention the RQ Number and Closing Date in the subject"). Pasting that post into the evaluator works: the pasted-JD floor is 100 chars (URL-extracted JDs stay at 500, where a short result means a nav bar or blocked page).

`frontend/lib/apply-email.js` parses the saved JD **deterministically** — recipient, requested subject, reference/RQ number, closing date, recruiter name. Parsing is never delegated to the model: recruiters filter on the exact subject string, so a stated subject is copied verbatim (en dashes, casing, closing date included) and only falls back to `{ref} - {title} - {name}` when the post specifies none. The candidate's own address is excluded from recipient detection, no-reply addresses are dropped, and with multiple addresses the one on a "send your resume to" line wins.

Only the email **body** is model-written, via `POST /api/applications/{id}/apply/email` (one Gemini call + at most ONE repair pass, then a deterministic fallback body if the model fails). `verifyApplyEmailBody` enforces humanized output: it reuses `BANNED_COVER_LETTER_PHRASES` plus email-specific filler ("I hope this email finds you well", "kindly find attached", "esteemed organization"), and catches em dashes, leaked subject lines, unfilled placeholders, missing sign-off/contact, missing attachment mention, and 90–160 word budget.

The draft is saved to `applications/{id}/apply-email.json` and surfaced in the Application Detail **Apply** tab with copy buttons and a mailto link. **Nothing is ever sent automatically** — Girish attaches the PDFs and clicks send.

QA: `npm run email:qa` (`test-apply-email.mjs`, 21 checks, no Gemini calls).

### Resume Header Location (per application)

The resume/cover-letter header location is **not** in `resume.md`; it is injected at render time by `contactPlaceholders` in `document-renderer.ts`. Precedence: per-application `resumeLocation` → `candidate.resume_location` in `config/profile.yml` → literal `city, province`.

**Critical:** `candidate.resume_location` is header-only and deliberately separate from `apply.city`/`apply.province`, which fill real application-form address fields and must stay literally accurate. Relocation wording must never reach a form field; `npm run apply:qa` guards this and fails if it leaks.

Set per application via `PUT /api/applications/{id}` with `{ "resumeLocation": "Toronto, ON · Open to relocation" }` (single line, ≤60 chars; empty string resets to the profile default). Saving re-renders both existing documents. The UI field is "Document header location" on the Application Detail page. Keep values truthful — state relocation, never a city the candidate does not live in.

### Interview Prep — Exact Behaviour (IMPORTANT)

**Block F in evaluation report** = STAR stories table inside the report. Always generated with A-G evaluation. Planning notes only, NOT the full interview prep.

**Full interview prep** = `modes/interview-prep.md` → `applications/{id}/interview.md`. Runs ONLY when:
1. User explicitly says "prep for interview at [company]", OR
2. Status changes to `Interview` and user confirms they want prep generated.

**Never runs during auto-pipeline or initial evaluation.**

### Frontend Architecture

```
frontend/                        Next.js app — run with: cd frontend && npm run dev
  app/page.tsx                   Job Discovery (localhost:3000/) — paste JD + scan results tab
  app/applications/page.tsx      Application Tracker (localhost:3000/applications)
  app/applications/[id]/page.tsx Application Detail — resume, cover letter, chat, interview guide, apply, contacts
  app/api/evaluate/route.ts      POST — score JD, extract info, create app folder
  app/api/generate-docs/[id]/    POST — staged pipeline: content JSON → verify → repair → locked-template PDF
  lib/document-content-core.mjs  Deterministic content layer: fixed-fact catalogs, markdown builder, verifier, trimmer
  lib/document-prompts.ts        Trimmed resume/cover-letter prompts + Gemini JSON response schemas
  app/api/applications/          GET all / GET one / PUT status / GET pdf
  app/api/chat/                  POST — multi-turn chat for document editing
  app/api/interview/             POST — generate interview.md
  app/api/scan/                  GET — reads data/scored-queue.json
  app/api/scan/run/              POST — runs scan.mjs + bulk quick-scores
  app/api/scan/import/           POST — imports pasted job URLs or job-alert text
  app/api/scan/viewed/           POST — marks a scan card viewed without creating an application
  app/api/applications/[id]/contacts/  GET/POST — compliant contact leads + outreach drafts
  app/api/applications/[id]/apply/     GET/POST — human-reviewed apply-session fields + answers
  app/api/applications/[id]/apply/automate/  POST — visible Playwright assisted fill, stops before submit
  app/api/applications/[id]/apply/current-tab/ POST — save apply URL from browser extension
  lib/filesystem.ts              All file reads/writes — single swap point for DB migration
  .env.local                     GEMINI_API_KEY=... (required) · RESEND_API_KEY=... (Phase 19)
```

**To start:** `cd frontend && npm run dev` → opens at http://localhost:3000

### AI Model Strategy

All AI work happens server-side via the **Google Gemini API** (`@google/genai` SDK). The user never needs a Claude Code session open.

| Route | Model | Reason |
|-------|-------|--------|
| `/api/evaluate` | `gemini-2.5-flash` | Best reasoning for scoring + guardrails |
| `/api/generate-docs` | `gemini-2.5-flash` | Best output for resume/cover letter generation |
| `/api/chat` | `gemini-2.5-flash` | Reliability for document edits and Q&A |
| `/api/interview` | `gemini-2.5-flash` | Reliability for complete interview guide |
| `/api/scan/run` quick-score | Configurable via `GEMINI_EVALUATE_MODEL` | Bulk ranking; local fallback if quota fails |

**All Gemini calls MUST use `thinkingConfig: { thinkingBudget: 0 }`.** Without this, thinking tokens truncate JSON/HTML output mid-response.

Response parsing uses a 3-fallback chain: `===DELIMITERS===` → markdown code blocks → raw `{...}` object.

Font paths in generated HTML use `../../fonts/` (relative to `applications/{id}/`) — resolves to `career-ops/fonts/` when Playwright renders via `file://`.

`export const maxDuration = 120` on generate-docs route (typical staged generation takes 15–40s; repair + overflow trims can extend it). `maxDuration = 180` on scan/run. `maxDuration = 300` on apply/automate.

**Production plan:** Switch to `claude-sonnet-4-6` via Anthropic API once pipeline is validated end-to-end. `@anthropic-ai/sdk` is listed in `frontend/package.json` as the planned production SDK.

### Key Scripts

| Script | Usage |
|--------|-------|
| `new-application.mjs` | `node new-application.mjs --company="..." --role="..." [--url="..."] [--location="..."]` |
| `update-status.mjs` | `node update-status.mjs --id="..." --status="..."` — syncs metadata.json + applications.json + applications.md |
| `update-status.mjs` | `node update-status.mjs --list` — list all application IDs |
| `list-applications.mjs` | `node list-applications.mjs [--id="..."] [--open="..."]` |
| `verify-pipeline.mjs` | `node verify-pipeline.mjs` — health check (run after any bulk changes) |
| `merge-tracker.mjs` | `node merge-tracker.mjs` — merge batch TSV additions into applications.md |
| `dedup-tracker.mjs` | `node dedup-tracker.mjs` — remove duplicate company+role entries |
| `doctor.mjs` | `node doctor.mjs` — full setup validation checklist |

### QA Commands (run before major changes)

```bash
npm run eval:qa        # evaluation guardrails
npm run scan:qa        # scanner ranking + Eluta parsing
npm run contacts:qa    # contact extraction policy
npm run apply:qa       # apply form safety
npm run docs:qa        # resume/cover-letter content layer (builder, verifier, trimmer, CL checks)
npm run email:qa       # apply-by-email parsing (subject/recipient/RQ) + humanization checks
cd frontend && npm run build  # frontend compiles cleanly
```

### Known Issues (as of 2026-06-17)

All previously documented issues have been resolved:
- `data/applications.md` is in sync — 22 entries matching `applications.json` (21 folders + 1 pre-folder orphan from report 001). Pipeline health check passes clean.
- No duplicate application folders — confirmed one entry each for BlackBerry, ATS Automation, and all other companies.
- `data/follow-ups.md` exists (header-only, populate as follow-ups occur).
- `data/scan-history.tsv` exists (header-only, auto-populated by scanner).

**Current state (2026-06-17):** 22 tracked applications, 21 application folders, pipeline clean. Next phase is 18 (portal expansion: Workday/Teamtailor/BambooHR providers).

**Update (2026-07-13):** `data/applications.json` + per-folder `applications/{id}/metadata.json` are the source of truth for applications (85+ entries). `data/applications.md` is a legacy markdown mirror that only the CLI flow updates (22 rows) — do not treat it as complete, and do not bulk-backfill it; the frontend and autopilot read/write JSON only.

**Career Autopilot (added 2026-07-13):** `autopilot.mjs` + `config/autopilot.yml` run a capped morning batch (scheduled task `career-autopilot`, daily 8:00): refresh scan → evaluate top new queue cards → generate resume/cover-letter packages for full scores ≥ 80 (borderline 75–79 listed only) → save a run summary to `data/autopilot-runs/` → send a WhatsApp briefing via Postbox when `postbox.url` is configured. It never applies or submits. The package cap counts packages produced (quick scores are optimistic; full evaluation demotes many), with an evaluation budget of 3× the cap.

**Referral priority (added 2026-07-13):** `config/referrals.yml` lists companies where Girish knows someone (with contact names). The autopilot processes matching queue cards FIRST at a lower quick-score threshold (70), and the briefing shows the contact to message ("→ ask Raghav"). `portals.yml` includes employer-scoped Eluta pages for these companies ("Referral Companies via Eluta"). The Eluta provider paces requests ~2-3s apart, skips bad URLs per-URL, and backs off (never bypasses) Eluta's "User Verification" wall.

**Single named PDF per document (changed 2026-07-26, supersedes the 2026-07-14 copy scheme):** each application folder holds exactly ONE resume PDF and ONE cover-letter PDF, named from the profile — `Girish_Bhuteja_Resume.pdf` / `Girish_Bhuteja_Cover_Letter.pdf`. `frontend/lib/pdf-filename.ts` is the single source of truth (`pdfFilename`, `resolvePdfPath`, `LEGACY_PDF_NAMES`); it is a standalone module because both `filesystem.ts` and `document-renderer.ts` need it and the latter already imports the former.

Previously the renderer wrote internal `resume.pdf` / `cover-letter.pdf` and then *copied* to the named file. That copy was best-effort, so a PDF viewer holding a Windows lock left the named file silently stale — edits appeared to not apply. `refreshDocumentPdfIfStale` now renders straight to the named file and deletes any leftover legacy PDF, so there is no second file and no copy step to fail.

`resolvePdfPath` still falls back to a legacy `resume.pdf` when the named file is absent, so un-migrated folders keep working until their next render. Never reintroduce hardcoded `'resume.pdf'` / `'cover-letter.pdf'`; use `pdfFilename(type)` / `resolvePdfPath(folder, type)`. The apply-upload guard validates the folder prefix (not the filename), so it is unaffected.

One-time cleanup for existing folders: `node migrate-pdf-names.mjs --dry-run` then without the flag. It renames a lone legacy PDF, and where both exist keeps the NEWER content under the named filename before deleting the legacy one. `applications/{id}/versions/**` snapshots keep their historical `resume.pdf` names and are deliberately untouched.

**Page-fill (calibrated 2026-07-14):** `generate-pdf.mjs` emits a `Fill:` metric per page; the generate-docs route auto-expands model-provided reserve content until page 1 ≥ 93% and **page 2 ≥ 97%** full, reverting any expansion that overflows to page 3 (so it fills to one bullet short of overflow), and auto-trims true overflow as before. Page 2 is filled hardest and project-first: the model supplies up to 3 reserve bullets per project (`reserveBullets`), and `expandResumeForUnderfill` grows all three projects round-robin up to `MAX_PROJECT_BULLETS` (5) with JD-relevant, keyword-rich, truthful bullets before touching the smaller levers (3rd extracurricular, 5th coursework). Targets and caps live in `RESUME_FILL_TARGETS` / `MAX_PROJECT_BULLETS` in `frontend/lib/document-content-core.mjs`; `MAX_UNDERFILL_EXPANSIONS` (12) is in the generate-docs route.

**Quality pipeline (added 2026-07-19):**
- **Skills density:** the verifier rejects skills rows under 5 items (`skills-row-sparse`, fix) and warns under 6 (Databases row exempt — the sources genuinely list exactly 5 databases). The prompt builds each row JD-relevant-first, then fills to 6-9 with adjacent true skills from the sources, so rows read as breadth, not JD copy-paste.
- **Company research:** `getCompanyResearch` in the generate-docs route runs one Gemini call with Google Search grounding per application, cached in `applications/{id}/company-research.md` (regenerations and the autopilot never re-pay). The research feeds the resume user prompt (industry framing) and the cover-letter system prompt (paragraph 1/3 specificity). Fail-soft: any error → JD-only generation plus a warning.
- **Cover-letter human-voice checks** (in `buildCoverLetterChecks`): `no-contractions` (fix, needs ≥2), `uniform-sentences` (warn, wants one sentence ≤8 words), `duration-claim` (fix — no years-of-experience figures; the sources state none), plus expanded banned phrases (`resonates`, `aligns perfectly`, `I am confident that my`, `contribute effectively to`, ...). The prompt also bans rule-of-three flourishes and "not just X, but Y" constructions and requires one concrete human detail from the narrative.

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
| Wants visible browser form filling | `apply` → automate endpoint |
| Scans portals | `scan` |
| Processes pending URLs | `pipeline` |
| Batch processing | `batch` |
| Rejection patterns | `patterns` |
| Follow-up cadence | `followup` |
