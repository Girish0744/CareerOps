# Scripts Reference

All scripts live in the project root as `.mjs` modules and are exposed via `npm run <name>`.

## Quick Reference

| Command | Script | Purpose |
|---------|--------|---------|
| `npm run doctor` | `doctor.mjs` | Validate setup prerequisites |
| `npm run verify` | `verify-pipeline.mjs` | Check pipeline data integrity |
| `npm run normalize` | `normalize-statuses.mjs` | Fix non-canonical statuses |
| `npm run dedup` | `dedup-tracker.mjs` | Remove duplicate tracker entries |
| `npm run merge` | `merge-tracker.mjs` | Merge batch TSVs into applications.md |
| `npm run pdf` | `generate-pdf.mjs` | Convert HTML to ATS-optimized PDF |
| `npm run sync-check` | `cv-sync-check.mjs` | Validate CV/profile consistency |
| `npm run patterns` | `analyze-patterns.mjs` | Analyze tracker outcomes and report patterns |
| `npm run update:check` | `update-system.mjs check` | Check for upstream updates |
| `npm run update` | `update-system.mjs apply` | Apply upstream update |
| `npm run rollback` | `update-system.mjs rollback` | Rollback last update |
| `npm run liveness` | `check-liveness.mjs` | Test if job URLs are still active |
| `npm run scan` | `scan.mjs` | Zero-token portal scanner |

---

## doctor

Validates that all prerequisites are in place: Node.js >= 18, dependencies installed, Playwright chromium, required files (`cv.md`, `config/profile.yml`, `portals.yml`), fonts directory, and auto-creates `data/`, `output/`, `reports/` if missing. In Girish's fork, `portals.yml` is initialized for Canada/Ontario software, full-stack, and AI application roles.

```bash
npm run doctor
```

**Exit codes:** `0` all checks passed, `1` one or more checks failed (fix messages printed).

---

## verify

Health check for pipeline data integrity. Validates `data/applications.md` against seven rules: canonical statuses (per `templates/states.yml`, including Girish's frontend workflow statuses), no duplicate company+role pairs, all report links point to existing files, scores match `X.XX/5` / `N/A` / `DUP`, rows have proper pipe-delimited format, no pending TSVs in `batch/tracker-additions/`, and no markdown bold in scores.

```bash
npm run verify
```

**Exit codes:** `0` pipeline clean (zero errors), `1` errors found. Warnings (e.g. possible duplicates) do not cause a non-zero exit.

---

## normalize

Maps non-canonical statuses to their canonical equivalents and strips markdown bold and dates from the status column. Aliases like `Enviada` become `Aplicado`, `CERRADA` becomes `Descartado`, etc. DUPLICADO info is moved to the notes column.

```bash
npm run normalize             # apply changes
npm run normalize -- --dry-run  # preview without writing
```

Creates a `.bak` backup of `applications.md` before writing.

**Exit codes:** `0` always (changes or no changes).

---

## dedup

Removes duplicate entries from `applications.md` by grouping on normalized company name + fuzzy role match. Keeps the entry with the highest score. If a removed entry had a more advanced pipeline status, that status is promoted to the keeper.

```bash
npm run dedup             # apply changes
npm run dedup -- --dry-run  # preview without writing
```

Creates a `.bak` backup before writing.

**Exit codes:** `0` always.

---

## merge

Merges batch tracker additions (`batch/tracker-additions/*.tsv`) into `applications.md`. Handles 9-column TSV, 8-column TSV, and pipe-delimited markdown formats. Detects duplicates by report number, entry number, and company+role fuzzy match. Higher-scored re-evaluations update existing entries in place.

```bash
npm run merge                 # apply merge
npm run merge -- --dry-run    # preview without writing
npm run merge -- --verify     # merge then run verify-pipeline
```

Processed TSVs are moved to `batch/tracker-additions/merged/`.

**Exit codes:** `0` success, `1` verification errors (with `--verify`).

---

## pdf

Renders an HTML file to a print-quality, ATS-parseable PDF via headless Chromium. Resolves font paths from `fonts/`, normalizes Unicode for ATS compatibility (em-dashes, smart quotes, zero-width characters), and reports page count and file size.

The renderer honors CSS page sizing and margins from the HTML template (`@page`) using `preferCSSPageSize: true`. In Girish's fork, generated resume PDFs should get their visual format from `templates/cv-template.html`, not from extra margins or layout rules inside `generate-pdf.mjs`.

```bash
npm run pdf -- input.html output.pdf
npm run pdf -- input.html output.pdf --format=letter   # US letter
npm run pdf -- input.html output.pdf --format=a4        # A4 (default)
```

**Exit codes:** `0` PDF generated, `1` missing arguments or generation failure.

---

## sync-check

Validates that the career-ops setup is internally consistent: `cv.md` exists and is not too short, `config/profile.yml` exists with required fields, no hardcoded metrics in `modes/_shared.md` or `batch/batch-prompt.md`, and `article-digest.md` freshness (warns if older than 30 days).

```bash
npm run sync-check
```

**Exit codes:** `0` no errors (warnings allowed), `1` errors found.

---

## patterns

Analyzes application outcomes, scores, archetypes, blockers, remote policy, and company size from `data/applications.md` and linked reports. New reports should include `## Machine Summary` YAML; `analyze-patterns.mjs` uses it first and falls back to legacy markdown parsing for older reports.

```bash
npm run patterns
npm run patterns -- --summary
npm run patterns -- --min-threshold 3
node analyze-patterns.mjs --self-test
```

**Exit codes:** `0` analysis succeeded, `1` insufficient data or parser self-test failure.

---

## update:check

Checks whether a newer version of career-ops is available upstream. Outputs JSON to stdout:

```bash
npm run update:check
```

Possible JSON responses:

| `status` | Meaning |
|----------|---------|
| `up-to-date` | Local version matches remote |
| `update-available` | Newer version exists (includes `local`, `remote`, `changelog`) |
| `dismissed` | User dismissed the update prompt |
| `offline` | Could not reach GitHub |

**Exit codes:** `0` always.

---

## update

Applies the upstream update. Creates a backup branch (`backup-pre-update-{version}`), fetches from the canonical repo, checks out only system-layer files, runs `npm install`, and commits. User-layer files (`cv.md`, `config/profile.yml`, `data/`, etc.) are never touched.

```bash
npm run update
```

**Exit codes:** `0` success, `1` lock conflict or safety violation.

---

## rollback

Restores system-layer files from the most recent backup branch created during an update.

```bash
npm run rollback
```

**Exit codes:** `0` success, `1` no backup branch found or git error.

---

## liveness

Tests whether job posting URLs are still live using headless Chromium. Detects expired patterns (e.g. "job no longer available"), HTTP 404/410, ATS redirect patterns, and apply-button presence. Supports multi-language expired patterns (English, German, French).

```bash
npm run liveness -- https://example.com/job/123
npm run liveness -- https://a.com/job/1 https://b.com/job/2
npm run liveness -- --file urls.txt
```

Each URL gets a verdict: `active`, `expired`, or `uncertain` with a reason.

**Exit codes:** `0` all URLs active, `1` any expired or uncertain.

---

## scan

Zero-token portal scanner. Runs configured local parsers for SSR/static career pages, hits ATS APIs (Greenhouse, Ashby, Lever), and reads the Eluta Canada IT/software search adapter directly — no LLM tokens consumed. Reads `portals.yml` for target companies, outputs matching listings to stdout, and optionally appends to `data/pipeline.md`. The frontend uses `node scan.mjs --dry-run --json` from `/api/scan/run` to capture discovered jobs, quick-score them, and write `data/scored-queue.json`, which is local generated queue data and gitignored.

When a provider exposes metadata, scan JSON includes `postedAt`, `postedAgeHours`, `freshnessBucket`, `directApplyUrl`, `sourceType`, `sourceName`, `rolePriority`, `employmentType`, and `recencyConfidence`. The frontend queue adds `firstSeenAt` and `lastSeenAt`. If exact posting time is unavailable, the UI labels the job by first-seen date instead of inventing a posted date.

Recent-first behavior is configured in `portals.yml` under `scan.freshnessWindowHours` and defaults to `24`. Sorting favors freshness bucket, then full-time new-grad/entry-level roles, source quality, score, exact recency, and company name. This source-balanced ranking keeps Eluta useful for fresh discovery without letting it overwhelm ATS/direct-employer cards. Role priority values are `full_time_new_grad`, `full_time_entry`, `full_time_general`, `intern_coop`, `stretch`, and `skip`.

For custom SSR pages, configure a tracked company with `scan_method: local_parser` and a `parser` block. The parser can be written in JavaScript, Python, or any language available as a local executable. Company-specific parsers usually already know their source URL and only need to print JSON jobs to stdout:

```yaml
parser:
  command: node
  script: scripts/parsers/example-company-jobs.js
  format: jobs-json-v1
```

Use `args` only for reusable parsers that intentionally accept runtime parameters such as `{careers_url}` or `{company}`.

If a parser writes full extraction artifacts for debugging or audit, store them under `data/parser-output/{company}/`. `scan.mjs` reads stdout and does not require those JSON files after parsing. Keep generated JSON artifacts out of git; `.gitkeep` placeholders are the only exception for preserving directory structure.

```bash
npm run scan
npm run scan:qa
npm run apply:qa
node scan.mjs --dry-run --json
```

`--json` appends a machine-readable payload after the `__CAREER_OPS_SCAN_JSON__` marker. It is intended for the frontend scan API and can be combined with `--dry-run` to avoid mutating `pipeline.md` or `scan-history.tsv`.

`npm run scan:qa` validates Eluta-style relative timestamps and role-priority ordering fixtures before scanner/ranking changes.

`npm run apply:qa` validates apply-assistant profile extraction, natural field labels like "where do you stay?", posting-page search/filter fields being ignored before Apply navigation, work authorization/sponsorship truth-table answers, safe checkbox/radio handling, address/postal-code review flags, current-application document upload guards, the local written-answer fallback, provider detection, restricted-host blocking, posting-page Apply CTA resolution, unsafe final-submit/login CTA rejection, and Greenhouse/Lever/Ashby apply-form fixture mapping without calling an AI model.

**Exit codes:** `0` scan completed, `1` configuration error or no portals.yml found.
