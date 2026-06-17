# Career-Ops — Girish Bhuteja's Personal Fork

> **This is a personalized job search command center forked from [santifer/career-ops](https://github.com/santifer/career-ops) and customized for Girish Bhuteja's job search in Canada.**
> The upstream README follows below. Personal extensions are documented in the section immediately beneath.

---

## Personal Implementation Status

This fork extends the base career-ops system with a full **web frontend pipeline** powered by the Gemini API. No Claude Code session needed to evaluate jobs or generate documents — everything runs from the browser.

### Completed Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Codebase inspection + CLAUDE.md baseline | ✅ Complete |
| 1 | Profile setup — `profile.yml`, `_profile.md`, `applications/` folder structure, `new-application.mjs` | ✅ Complete |
| 2 | Cover letter generation — `modes/cover-letter.md` + `templates/cover-letter-template.html` | ✅ Complete |
| 3 | Full pipeline — evaluation, `score.json`, resume + cover letter saved per application, metadata sync | ✅ Complete |
| 4 | Resume + cover letter templates redesigned to match candidate's actual PDF format | ✅ Complete |
| 5 | Status management — `update-status.mjs` syncs all 3 data stores atomically | ✅ Complete |
| 6 | Interview prep — on-demand only (`modes/interview-prep.md`), never auto-triggered | ✅ Complete |
| 7 | Chat-based document editing — `modes/edit-application.md`, never touches master profile | ✅ Complete |
| 8 | CLI dashboard — `list-applications.mjs`, `modes/tracker.md` | ✅ Complete |
| 9 | Gated pipeline — score gate in `modes/auto-pipeline.md` (score < 80 → ask before proceeding) | ✅ Complete |
| 10 | Web frontend — Next.js at `frontend/`: Job Discovery, Application Tracker, Application Detail, Chat, Interview Guide | ✅ Complete |
| 11 | Frontend UI redesign — light theme, polished components, hydration error fix | ✅ Complete |
| 12 | Self-contained frontend pipeline — paste JD/URL → `/api/evaluate` → score card → user decides → `/api/generate-docs/{id}` → resume PDF + cover letter PDF | ✅ Complete |
| 15 | PDF download — `GET /api/applications/{id}/pdf?type=resume\|cover-letter` streams PDF; download buttons in Application Detail | ✅ Complete |
| 20 | Baseline stabilization — frontend statuses accepted by legacy validators, Canada-focused `portals.yml`, initial scan queue files, docs synced | ✅ Complete |
| 13 | Portal scan → scored job cards — `POST /api/scan/run` runs `scan.mjs --dry-run --json`, quick-scores results, saves ranked cards to `data/scored-queue.json`, and Job Discovery can refresh/evaluate scan cards | ✅ Complete |
| 14 | Generate application from scan cards — scan card Evaluate runs full `/api/evaluate`; user confirms with the same score-card button to generate resume + cover letter | ✅ Complete |
| 18A | Canada source expansion, first batch — verified additional Ashby/Greenhouse/Lever sources in `portals.yml` | ✅ First batch |
| 18B | Rich scan metadata — posted/first-seen/last-seen/source/direct-apply metadata plus Job Discovery filters and quality lanes | ✅ First batch |
| 21 | Compliant contact/outreach assistant — public-source/user-provided contact leads and personalized drafts saved to `applications/{id}/contacts.json` | ✅ First batch |
| 22 | Recent-first discovery — Eluta Canada search adapter, 24h freshness mode, role-priority ranking, and manual job-alert/URL import for LinkedIn/Indeed/Glassdoor signals without scraping those platforms | ✅ First batch |
| 23 | Review-state tracking — scan cards track New, Viewed, Evaluated, Docs Ready, Applied, and Archived states; Applications sort by latest activity timestamps | ✅ Complete |
| 17A | Human-reviewed Apply foundation — Apply tab, apply-session answers, profile truth table, upload paths, and final-submit guard | ✅ First batch |
| 17B | Visible ATS apply filling — Playwright opens a visible browser, resolves posting-page Apply links, fills high-confidence ATS fields, uploads generated documents, and stops before final Submit/Apply | ✅ First batch |
| 17B.2 | Reliable apply-fill hardening — source-balanced scan ranking, multi-hop Apply resolver, natural field matching, checkbox/radio safety, and current-application upload guard | ✅ Complete |

### Current Baseline Notes

- The **frontend workflow statuses are authoritative** in this fork: `Saved`, `Evaluated`, `Resume Generated`, `Cover Letter Generated`, `Ready to Apply`, `Applied`, `In Progress`, `Interview`, `Offer`, `Rejected`, `Withdrawn`.
- Upstream/legacy statuses still work for compatibility: `Responded`, `Discarded`, `SKIP`.
- `portals.yml` is tuned for Girish's Canada/Ontario software, full-stack, and AI application search. It now includes structured Ashby/Greenhouse/Lever sources plus an Eluta Canada IT/software search adapter.
- Scanner default freshness mode is `scan.freshnessWindowHours: 24`. Results rank by freshness bucket, role priority, source quality, score, exact recency, and company name so Eluta remains useful for fresh discovery without overwhelming ATS/direct-employer cards.
- `data/pipeline.md` and `data/scored-queue.json` are initialized; Job Discovery can refresh scanned jobs, import saved job-board URLs/alerts, filter by score/company/source/recency/role type/review state, and show ranked quality lanes.
- Scan cards store richer metadata: `postedAt`, `postedAgeHours`, `freshnessBucket`, `firstSeenAt`/`lastSeenAt`, source labels, source type, direct apply URLs, `rolePriority`, `employmentType`, recency confidence, `viewedAt`, and review-state fields. Job Discovery shows a source summary so source mix is visible after scans/imports.
- Job Discovery review states are `new`, `viewed`, `evaluated`, `docs`, `applied`, and `archived`. Opening a posting link or clicking **Mark viewed** removes a card from the New bucket without creating an application folder; Evaluate creates/syncs the application, document generation moves it to Docs ready, and **Mark applied** records manual submission after confirmation.
- Applications store activity timestamps (`evaluatedAt`, `resumeGeneratedAt`, `coverLetterGeneratedAt`, `lastDocumentGeneratedAt`, `appliedAt`, `lastActivityAt`) and the Applications page sorts by latest activity, not only creation date.
- Role priority values are `full_time_new_grad`, `full_time_entry`, `full_time_general`, `intern_coop`, `stretch`, and `skip`. Full-time new-grad/entry roles rank above internships/co-ops by default.
- LinkedIn, Indeed, and Glassdoor are import/signal sources only. The app does not scrape them, auto-connect, auto-message, or submit applications automatically.
- Job evaluation now normalizes pasted JD text and direct job URLs through the same cleanup layer. Greenhouse, Ashby, and Lever URLs use structured APIs when possible, then fall back to cleaned HTML.
- Evaluation uses a deterministic 100-point rubric and strips ATS/legal boilerplate before scoring so pasted text and URL input are much closer and more trustworthy.
- Evaluation also applies backend score guardrails after the model responds: hard seniority requirements, professional embedded requirements, and missing industrial automation stacks can cap the score and raise risk factors. This prevents the same JD from becoming an 80+ "Apply" only because it came from a URL.
- Gemini model selection is configurable through `.env.local` (`GEMINI_MODEL`, task-specific overrides, and fallback model lists), so testing can temporarily use a higher-quota model when `gemini-2.5-flash` is exhausted.
- Offline scoring QA exists at `npm run eval:qa`; it runs known JD fixtures against the backend guardrails without spending API quota.
- Job Discovery lets the user evaluate another job immediately from any score card, including low-score Maybe/Skip results, without refreshing the page.
- Application Detail now shows live previews for resume, cover letter, and interview prep in the platform, with a Source toggle for raw Markdown.
- Application Detail includes a compliant Outreach section. It uses public job/application context and user-provided URLs only; it does not automate LinkedIn scraping, connecting, or messaging. LinkedIn notes should be warm, specific, and low-pressure, never a first-message referral ask.
- Application Detail includes an Apply tab. It prepares known fields, generated answers, resume/cover-letter upload paths, optional transcript path, and must stop before final Submit/Apply. Written answers should sound like Girish: practical, warm, professional, role-specific, and grounded in saved proof points rather than generic AI phrasing.
- Application Detail also includes **Start Assisted Fill**. It launches a visible Playwright browser for Greenhouse, Lever, Ashby, and conservative generic employer forms. If the saved URL is a posting page with no form fields, it may follow up to 3 safe Apply hops (`Apply`, `Apply Now`, `Apply for this job`, `Start Application`, `Continue to application`), but it never clicks final submit/login/share/referral controls.
- Assisted fill reads labels, placeholders, aria labels, field names/ids, fieldset legends, and nearby question text. It first checks whether visible fields actually look like an application form, so posting-page search/filter boxes do not stop the Apply resolver. Natural wording such as "where do you stay?" can map to location/country when confidence is high; unclear fields stay review-only.
- Checkboxes/radios are answered only from profile truth, such as Canadian work authorization = yes and sponsorship required = no. Terms, certifications, voluntary demographic questions, and ambiguous options stay for manual review.
- Resume and cover-letter uploads must come from the current `applications/{id}/` folder. Generic/root/output resumes are blocked so the assistant uses the job-specific PDFs generated for that role.
- Private apply data lives in gitignored `config/profile.yml` under `apply:`. Use `address_line1`, `address_line2`, `postal_code`, and `transcript_path` there; put transcript files under gitignored `private-docs/`.
- Current baseline checks: `npm run scan:qa`, `npm run eval:qa`, `npm run contacts:qa`, `npm run apply:qa`, `node doctor.mjs`, `node cv-sync-check.mjs`, `node verify-pipeline.mjs`, `cd frontend && npm run lint`, `cd frontend && npm run build`.
- Frontend builds use the local system font stack, so production builds do not depend on fetching Google Fonts. Turbopack may still print a trace warning because API routes intentionally read career-ops root files outside `frontend/`.

### In Progress / Up Next

| Phase | Scope | Status |
|-------|-------|--------|
| 18 | **Expanded portals, next batch** — Continue growing `portals.yml` toward 150+ companies, adding Workday/Teamtailor/BambooHR/custom parsers only for high-value Canadian sources where structured endpoints are verified. | 🔜 Next |
| 19 | **Email job alerts** — After each scan run, diff new results against the last scan. Any new job ≥ score threshold (default 70) triggers a Resend API email digest: ranked cards, score badges, one-click "Evaluate" links. `RESEND_API_KEY` in `.env.local`. Free tier: 3,000 emails/month. | 🔜 After 18 |
| 16 | **Settings / Profile page** — `/settings` in the frontend: view and edit `profile.yml` (name, target roles, comp range, location) and `portals.yml` (add/remove companies, adjust keyword filters). No file editor needed. | 🔜 After 19 |
| 17C | **Chrome extension companion** — MV3 current-tab companion fills high-confidence fields on the active employer/ATS tab, opens safe posting-page Apply links when needed, saves the apply URL for audit, and keeps the final-submit guard mandatory. | ✅ First foundation |

### Quick Start (Personal Setup)

```bash
# 1. Install dependencies
npm install
npx playwright install chromium

# 2. Start the web frontend
cd frontend && npm install
echo "GEMINI_API_KEY=your_key_here" > .env.local
npm run dev   # → http://localhost:3000

# 3. Or use Claude Code CLI directly
cd ..
claude        # Then paste a job URL or use /career-ops
```

Get a free Gemini API key (no credit card): https://aistudio.google.com/app/apikey

### Application Folder Structure

Every job application lives in its own folder under `applications/`:

```
applications/
  {company-slug}-{role-slug}-{YYYY-MM-DD}/
    job-description.md    metadata.json    score.json
    resume.md             resume.pdf
    cover-letter.md       cover-letter.pdf
    notes.md              interview.md (when status → Interview)
```

Generated per-application folders are local work product and gitignored by default; `applications/.gitkeep` preserves the directory.

---

# Career-Ops (Upstream)

[English](README.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [한국어](README.ko-KR.md) | [日本語](README.ja.md) | [Українська](README.ua.md) | [Русский](README.ru.md) | [繁體中文](README.zh-TW.md)

<p align="center">
  <a href="https://x.com/santifer"><img src="docs/hero-banner.jpg" alt="Career-Ops — Multi-Agent Job Search System" width="800"></a>
</p>

<p align="center">
  <em>I spent months applying to jobs the hard way. So I engineered the system I wish I had.</em><br>
  Companies use AI to filter candidates. <strong>I just gave candidates AI to <em>choose</em> companies.</strong><br>
  <em>Now it's open source.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/OpenCode-111827?style=flat&logo=terminal&logoColor=white" alt="OpenCode">
  <img src="https://img.shields.io/badge/Gemini_CLI-4285F4?style=flat&logo=google&logoColor=white" alt="Gemini CLI">
  <img src="https://img.shields.io/badge/Codex_(soon)-6B7280?style=flat&logo=openai&logoColor=white" alt="Codex">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <a href="TRADEMARK.md"><img src="https://img.shields.io/badge/Trademark-Policy-blue.svg" alt="Trademark Policy"></a>
  <a href="https://discord.gg/8pRpHETxa4"><img src="https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Discord"></a>
  <br>
  <img src="https://img.shields.io/badge/EN-blue?style=flat" alt="EN">
  <img src="https://img.shields.io/badge/ES-red?style=flat" alt="ES">
  <img src="https://img.shields.io/badge/DE-grey?style=flat" alt="DE">
  <img src="https://img.shields.io/badge/FR-blue?style=flat" alt="FR">
  <img src="https://img.shields.io/badge/PT--BR-green?style=flat" alt="PT-BR">
  <img src="https://img.shields.io/badge/KO-white?style=flat" alt="KO">
  <img src="https://img.shields.io/badge/JA-red?style=flat" alt="JA">
  <img src="https://img.shields.io/badge/ZH--CN-red?style=flat" alt="ZH-CN">
  <img src="https://img.shields.io/badge/ZH--TW-blue?style=flat" alt="ZH-TW">
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="Career-Ops Demo" width="800">
</p>

<p align="center"><strong>740+ job listings evaluated · 100+ personalized CVs · 1 dream role landed</strong></p>

<p align="center"><a href="https://discord.gg/8pRpHETxa4"><img src="https://img.shields.io/badge/Join_the_community-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a></p>

## What Is This

Career-Ops turns any AI coding CLI into a full job search command center. Instead of manually tracking applications in a spreadsheet, you get an AI-powered pipeline that:

- **Evaluates offers** with a structured A-F scoring system (10 weighted dimensions)
- **Generates tailored PDFs** -- ATS-optimized CVs customized per job description
- **Scans portals** automatically (Greenhouse, Ashby, Lever, company pages)
- **Processes in batch** -- evaluate 10+ offers in parallel with sub-agents
- **Tracks everything** in a single source of truth with integrity checks

> **Important: This is NOT a spray-and-pray tool.** Career-ops is a filter -- it helps you find the few offers worth your time out of hundreds. The system strongly recommends against applying to anything scoring below 4.0/5. Your time is valuable, and so is the recruiter's. Always review before submitting.

Career-ops is agentic: Claude Code navigates career pages with Playwright, evaluates fit by reasoning about your CV vs the job description (not keyword matching), and adapts your resume per listing.

> **Heads up: the first evaluations won't be great.** The system doesn't know you yet. Feed it context -- your CV, your career story, your proof points, your preferences, what you're good at, what you want to avoid. The more you nurture it, the better it gets. Think of it as onboarding a new recruiter: the first week they need to learn about you, then they become invaluable.

Built by someone who used it to evaluate 740+ job offers, generate 100+ tailored CVs, and land a Head of Applied AI role. [Read the full case study](https://santifer.io/career-ops-system).

## Features

| Feature                  | Description                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto-Pipeline**        | Paste a URL, get a full evaluation + PDF + tracker entry                                                                                 |
| **6-Block Evaluation**   | Role summary, CV match, level strategy, comp research, personalization, interview prep (STAR+R)                                          |
| **Interview Story Bank** | Accumulates STAR+Reflection stories across evaluations -- 5-10 master stories that answer any behavioral question                        |
| **Negotiation Scripts**  | Salary negotiation frameworks, geographic discount pushback, competing offer leverage                                                    |
| **ATS PDF Generation**   | Keyword-injected CVs with Space Grotesk + DM Sans design                                                                                 |
| **Portal Scanner**       | 45+ companies pre-configured (Anthropic, OpenAI, ElevenLabs, Retool, n8n...) + custom queries across Ashby, Greenhouse, Lever, Wellfound |
| **Batch Processing**     | Parallel evaluation with `claude -p` workers                                                                                             |
| **Dashboard TUI**        | Terminal UI to browse, filter, and sort your pipeline                                                                                    |
| **Human-in-the-Loop**    | AI evaluates and recommends, you decide and act. The system never submits an application -- you always have the final call               |
| **Pipeline Integrity**   | Automated merge, dedup, status normalization, health checks                                                                              |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/santifer/career-ops.git
cd career-ops && npm install
npx playwright install chromium   # Required for PDF generation

# 2. Check setup
npm run doctor                     # Validates all prerequisites

# 3. Configure
cp config/profile.example.yml config/profile.yml  # Edit with your details
cp templates/portals.example.yml portals.yml       # Customize companies

# 4. Add your CV
# Create cv.md in the project root with your CV in markdown

# 5. Personalize with Claude
claude   # Open Claude Code in this directory

# Then ask Claude to adapt the system to you:
# "Change the archetypes to backend engineering roles"
# "Translate the modes to English"
# "Add these 5 companies to portals.yml"
# "Update my profile with this CV I'm pasting"

# 6. Start using
# Paste a job URL or run /career-ops
```

> **The system is designed to be customized by Claude itself.** Modes, archetypes, scoring weights, negotiation scripts -- just ask Claude to change them. It reads the same files it uses, so it knows exactly what to edit.

See [docs/SETUP.md](docs/SETUP.md) for the full setup guide.

## Gemini CLI Integration

Career-ops supports [Gemini CLI](https://github.com/google-gemini/gemini-cli) natively — the same way it supports Claude Code and OpenCode. All 15 slash commands are available, using the same `modes/*.md` evaluation logic.

### Option A — Native Gemini CLI (Recommended)

```bash
# 1. Install Gemini CLI
npm install -g @google/gemini-cli
# or: npx @google/gemini-cli --version

# 2. Authenticate (free — uses your Google account)
gemini auth

# 3. Run in the career-ops directory
cd career-ops
gemini

# 4. Use slash commands just like Claude Code
/career-ops "Senior AI Engineer at Anthropic..."
/career-ops-evaluate --file ./jds/openai.txt
/career-ops-scan
/career-ops-pdf
/career-ops-tracker
```

The `GEMINI.md` file is auto-loaded as context. All 15 commands are defined in `.gemini/commands/*.toml`.

### Option B — Standalone API Script (No CLI install needed)

```bash
# 1. Get a free API key at https://aistudio.google.com/apikey
cp .env.example .env
# Edit .env → set GEMINI_API_KEY=your_key_here

# 2. Install dependencies
npm install

# 3. Evaluate a job description
node gemini-eval.mjs "We are looking for a Senior AI Engineer..."
node gemini-eval.mjs --file ./jds/my-job.txt
npm run gemini:eval -- "JD text here"
```

> **Free tier:** Both options work without billing. Native CLI uses Google OAuth; the API script uses `gemini-2.5-flash` (15 RPM, 1M tokens/day free).

## Usage

Career-ops is a single slash command with multiple modes:

```
/career-ops                → Show all available commands
/career-ops {paste a JD}   → Full auto-pipeline (evaluate + PDF + tracker)
/career-ops scan           → Scan portals for new offers
/career-ops pdf            → Generate ATS-optimized CV
/career-ops batch          → Batch evaluate multiple offers
/career-ops tracker        → View application status
/career-ops apply          → Fill application forms with AI
/career-ops pipeline       → Process pending URLs
/career-ops contacto       → LinkedIn outreach message
/career-ops deep           → Deep company research
/career-ops training       → Evaluate a course/cert
/career-ops project        → Evaluate a portfolio project
```

Or just paste a job URL or description directly -- career-ops auto-detects it and runs the full pipeline.

## How It Works

```
You paste a job URL or description
        │
        ▼
┌──────────────────┐
│  Archetype       │  Classifies: LLMOps / Agentic / PM / SA / FDE / Transformation
│  Detection       │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  A-F Evaluation  │  Match, gaps, comp research, STAR stories
│  (reads cv.md)   │
└────────┬─────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
 Report  PDF  Tracker
  .md   .pdf   .tsv
```

## Pre-configured Portals

The scanner comes with **45+ companies** ready to scan and **19 search queries** across major job boards. Copy `templates/portals.example.yml` to `portals.yml` and add your own:

**AI Labs:** Anthropic, OpenAI, Mistral, Cohere, LangChain, Pinecone
**Voice AI:** ElevenLabs, PolyAI, Parloa, Hume AI, Deepgram, Vapi, Bland AI
**AI Platforms:** Retool, Airtable, Vercel, Temporal, Glean, Arize AI
**Contact Center:** Ada, LivePerson, Sierra, Decagon, Talkdesk, Genesys
**Enterprise:** Salesforce, Twilio, Gong, Dialpad
**LLMOps:** Langfuse, Weights & Biases, Lindy, Cognigy, Speechmatics
**Automation:** n8n, Zapier, Make.com
**European:** Factorial, Attio, Tinybird, Clarity AI, Travelperk

**Job boards searched:** Ashby, Greenhouse, Lever, Wellfound, Workable, RemoteFront

By default `node scan.mjs` (a.k.a. `npm run scan`) trusts what each ATS feed returns. Some companies leave stale postings in their public API even after the role is closed, so those expired entries can leak into `pipeline.md`. Pass `--verify` to launch Playwright after the API pass and drop expired postings before they hit the pipeline:

```bash
node scan.mjs --verify          # zero-token discovery + Playwright liveness check
```

The verification is sequential and only runs against new offers (after dedup), so the cost stays bounded.

## Dashboard TUI

The built-in terminal dashboard lets you browse your pipeline visually:

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

Features: 6 filter tabs, 4 sort modes, grouped/flat view, lazy-loaded previews, inline status changes.

## Project Structure

```
career-ops/
├── AGENTS.md                    # Canonical agent instructions (all CLIs)
├── CLAUDE.md                    # Claude Code wrapper (imports AGENTS.md)
├── cv.md                        # Your CV (create this)
├── article-digest.md            # Your proof points (optional)
├── config/
│   └── profile.example.yml      # Template for your profile
├── modes/                       # 14 skill modes
│   ├── _shared.md               # Shared context (customize this)
│   ├── oferta.md                # Single evaluation
│   ├── pdf.md                   # PDF generation
│   ├── scan.md                  # Portal scanner
│   ├── batch.md                 # Batch processing
│   └── ...
├── templates/
│   ├── cv-template.html         # ATS-optimized CV template
│   ├── portals.example.yml      # Scanner config template
│   └── states.yml               # Canonical statuses
├── batch/
│   ├── batch-prompt.md          # Self-contained worker prompt
│   └── batch-runner.sh          # Orchestrator script
├── dashboard/                   # Go TUI pipeline viewer
├── data/                        # Your tracking data (gitignored)
├── reports/                     # Evaluation reports (gitignored)
├── output/                      # Generated PDFs (gitignored)
├── fonts/                       # Space Grotesk + DM Sans
├── docs/                        # Setup, customization, architecture
└── examples/                    # Sample CV, report, proof points
```

## Tech Stack

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Bubble Tea](https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white)

- **Agent**: Claude Code with custom skills and modes
- **PDF**: Playwright/Puppeteer + HTML template
- **Scanner**: Playwright + Greenhouse API + WebSearch
- **Dashboard**: Go + Bubble Tea + Lipgloss (Catppuccin Mocha theme)
- **Data**: Markdown tables + YAML config + TSV batch files

## Also Open Source

- **[cv-santiago](https://github.com/santifer/cv-santiago)** -- The portfolio website (santifer.io) with AI chatbot, LLMOps dashboard, and case studies. If you need a portfolio to showcase alongside your job search, fork it and make it yours.

## About the Author

I'm Santiago -- Head of Applied AI, former founder (built and sold a business that still runs with my name on it). I built career-ops to manage my own job search. It worked: I used it to land my current role.

My portfolio and other open source projects → [santifer.io](https://santifer.io)

## Star History

<a href="https://www.star-history.com/?repos=santifer%2Fcareer-ops&type=timeline&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&legend=top-left" />
 </picture>
</a>

## Disclaimer

**career-ops is a local, open-source tool — NOT a hosted service.** By using this software, you acknowledge:

1. **You control your data.** Your CV, contact info, and personal data stay on your machine and are sent directly to the AI provider you choose (Anthropic, OpenAI, etc.). We do not collect, store, or have access to any of your data.
2. **You control the AI.** The default prompts instruct the AI not to auto-submit applications, but AI models can behave unpredictably. If you modify the prompts or use different models, you do so at your own risk. **Always review AI-generated content for accuracy before submitting.**
3. **You comply with third-party ToS.** You must use this tool in accordance with the Terms of Service of the career portals you interact with (Greenhouse, Lever, Workday, LinkedIn, etc.). Do not use this tool to spam employers or overwhelm ATS systems.
4. **No guarantees.** Evaluations are recommendations, not truth. AI models may hallucinate skills or experience. The authors are not liable for employment outcomes, rejected applications, account restrictions, or any other consequences.

See [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md) for full details. This software is provided under the [MIT License](LICENSE) "as is", without warranty of any kind.

## Contributors

<a href="https://github.com/santifer/career-ops/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=santifer/career-ops" />
</a>

Got hired using career-ops? [Share your story!](https://github.com/santifer/career-ops/issues/new?template=i-got-hired.yml)

## License & Trademark

The code is licensed under [MIT](LICENSE). The "career-ops" name and
brand are governed by the [Trademark Policy](TRADEMARK.md) — permissive
for community use, reserved for commercial product naming and
endorsement.

## Let's Connect

[![Website](https://img.shields.io/badge/santifer.io-000?style=for-the-badge&logo=safari&logoColor=white)](https://santifer.io)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/santifer)
[![X](https://img.shields.io/badge/X-000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/santifer)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8pRpHETxa4)
[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hi@santifer.io)
