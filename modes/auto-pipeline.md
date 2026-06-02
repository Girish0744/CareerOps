# Mode: auto-pipeline — Full Automatic Pipeline

When the user pastes a JD (text or URL) without an explicit sub-command, execute the ENTIRE pipeline in sequence. This produces a complete application package: evaluation report, score, tailored resume, and cover letter, all saved in a dedicated folder.

---

## Step 0 — Extract JD

If the input is a **URL** (not pasted JD text), follow this strategy:

**Priority order:**
1. **Playwright (preferred):** Use `browser_navigate` + `browser_snapshot` for SPAs (Lever, Ashby, Greenhouse, Workday).
2. **WebFetch (fallback):** For static pages (ZipRecruiter, company career pages).
3. **WebSearch (last resort):** Search for role title + company in secondary portals.

If no method works: ask the candidate to paste the JD manually or share a screenshot.

If the input is **JD text**: use directly.

---

## Step 0.5 — Create Application Folder

From the JD, extract:
- **Company name** (use the official company name, e.g. "Shopify")
- **Job title** (exact title from the posting)

Compute the application ID:
```
id = {slugify(company)}-{slugify(role)}-{YYYY-MM-DD}
```
Where `slugify` = lowercase, spaces → hyphens, remove special characters.
Example: "Shopify" + "Software Developer" + "2026-05-28" → `shopify-software-developer-2026-05-28`

Create the folder and files:

**`applications/{id}/job-description.md`**
```markdown
# Job Description: {Job Title} at {Company}

**URL:** {url or "Pasted JD"}
**Location:** {extracted from JD or "TBD"}
**Date saved:** {YYYY-MM-DD}

---

{full job description text}
```

**`applications/{id}/metadata.json`**
```json
{
  "id": "{id}",
  "company": "{Company}",
  "jobTitle": "{Job Title}",
  "location": "{location from JD or null}",
  "jobUrl": "{url or null}",
  "status": "Saved",
  "createdAt": "{YYYY-MM-DD}",
  "updatedAt": "{YYYY-MM-DD}",
  "resumePath": null,
  "coverLetterPath": null,
  "interviewPrepPath": null,
  "notesPath": "applications/{id}/notes.md",
  "reportPath": null,
  "scorePath": "applications/{id}/score.json"
}
```

**`applications/{id}/score.json`** — (empty, filled in Step 2)

**`applications/{id}/notes.md`** — empty file for user notes

Also add entry to `data/applications.json`:
```json
{
  "id": "{id}",
  "company": "{Company}",
  "jobTitle": "{Job Title}",
  "location": "{location or null}",
  "jobUrl": "{url or null}",
  "status": "Saved",
  "score": null,
  "fitLevel": null,
  "applicationFolder": "applications/{id}",
  "resumePath": null,
  "coverLetterPath": null,
  "interviewPrepPath": null,
  "notesPath": "applications/{id}/notes.md",
  "reportPath": null,
  "createdAt": "{YYYY-MM-DD}",
  "updatedAt": "{YYYY-MM-DD}",
  "appliedAt": null
}
```

If `applications/{id}` already exists (re-run), skip creation and continue with the existing folder.

---

## Step 1 — A-G Evaluation

Execute the same as the `oferta` mode (read `modes/oferta.md` for all blocks A-F + Block G Posting Legitimacy).

**Important:** Block F (STAR stories table) is always included in the evaluation report. This is planning notes only — do NOT run the full `modes/interview-prep.md` mode here. Full interview prep only runs when the user explicitly changes status to `Interview`.

---

## Step 1.5 — Score Gate (REQUIRED — do not skip)

After completing the evaluation, show the user a short summary and ask before generating any documents:

```
Score: {X}/100 ({fit level})
Recommendation: {Strong Apply | Apply | Maybe | Skip}

Top 2 reasons this fits: ...
Top gap: ...
```

Then ask:

**If score < 80:**
> "This job scored {X}/100 — below your 80-point threshold. I'd recommend skipping it. Want me to save the evaluation only, or override and generate the resume and cover letter anyway?"
> - "Save evaluation only" → skip to Step 5 (update tracker, status = Evaluated)
> - "Generate anyway" → continue to Step 2

**If score ≥ 80:**
> "This job scored {X}/100 ({fit level}). Generate tailored resume and cover letter?"
> - "Yes" → continue to Step 2
> - "No" → skip to Step 5 (save evaluation only, status = Evaluated)

**Do not proceed to Steps 2–4 until the user explicitly confirms.**

---

## Step 2 — Save Report + Score

**Save evaluation report:**
`reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (format in `modes/oferta.md`).
Include Block G. Add `**URL:**` and `**Legitimacy:**` to the header.

**Save score to application folder:**
Update `applications/{id}/score.json` with the evaluation results:
```json
{
  "overallScore": {numeric 0-100, derived from A-F blocks},
  "fitLevel": "{Strong Apply | Apply | Maybe | Skip}",
  "categories": {
    "experienceMatch": {0-30},
    "skillsMatch": {0-20},
    "roleLevelMatch": {0-15},
    "locationMatch": {0-10},
    "industryMatch": {0-10},
    "growthPotential": {0-10},
    "riskFactors": {0-5}
  },
  "matchedKeywords": ["{list of matched JD keywords}"],
  "missingKeywords": ["{list of gaps}"],
  "recommendation": "{Strong Apply | Apply | Maybe | Skip}",
  "notes": "{1-2 sentence summary of fit}",
  "evaluatedAt": "{YYYY-MM-DD}"
}
```

**Update `applications/{id}/metadata.json`:**
- Set `reportPath` → `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`
- Set `status` → `Evaluated`
- Set `updatedAt` → today

**Update `data/applications.json`:**
- Set `score` → numeric overall score
- Set `fitLevel` → fit level string
- Set `reportPath` → report path
- Set `status` → `Evaluated`

---

## Step 3 — Generate Tailored Resume

Read `config/profile.yml`. Check `cv.output_format`:
- If `"latex"` → execute `modes/latex.md` pipeline
- Otherwise (default) → execute `modes/pdf.md` pipeline

After generating, the resume MUST be saved in TWO places:
1. `output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf` (existing output location, unchanged)
2. `applications/{id}/resume.pdf` (application folder copy)

Also save the tailored resume Markdown to `applications/{id}/resume.md`.

**Update `applications/{id}/metadata.json`:**
- Set `resumePath` → `applications/{id}/resume.pdf`
- Set `status` → `Resume Generated`
- Set `updatedAt` → today

**Update `data/applications.json`:**
- Set `resumePath` → `applications/{id}/resume.pdf`
- Set `status` → `Resume Generated`

---

## Step 3.5 — Generate Cover Letter

Execute `modes/cover-letter.md`.

Inputs already available in context:
- Job description (from Step 0)
- Evaluation report (from Step 2)
- Application ID (from Step 0.5)

The cover letter mode handles saving to `applications/{id}/cover-letter.md` + `cover-letter.pdf` and updating metadata.

---

## Step 4 — Draft Application Answers (only if score >= 75 / fit = "Apply" or higher)

If the overall score is >= 75 or recommendation is "Apply" or "Strong Apply", generate draft responses for the application form:

1. **Extract form questions**: Use Playwright to navigate to the form and snapshot. If unavailable, use generic questions below.
2. **Generate responses** using the tone framework below.
3. **Save in the report** as section `## H) Draft Application Answers`.

### Generic questions (fallback if form can't be extracted)
- Why are you interested in this role?
- Why do you want to work at [Company]?
- Tell us about a relevant project or achievement
- What makes you a good fit for this position?
- How did you hear about this role?

### Tone: "I'm choosing you"
- **Confident without arrogance**: "I've been building [X] — your role is where I want to apply that next"
- **Specific and concrete**: Always reference something real from the JD and something real from the candidate's profile
- **Direct, no fluff**: 2-4 sentences per response. No "I'm passionate about..." or "I would love the opportunity..."
- **The hook is the proof, not the statement**: Instead of "I'm great at X", say "I built X that does Y"

---

## Step 5 — Update Tracker

**`data/applications.md`** (existing markdown tracker):
Add or update the row with all columns: number, date, company, role, score, status, PDF ✅, report link.

**`applications/{id}/metadata.json`**:
Final update — ensure all paths are set and `status` reflects the highest completed step.

**`data/applications.json`**:
Sync all fields from the completed pipeline.

If any step failed, continue with remaining steps and note the failure in `applications/{id}/notes.md`.

---

## Step 6 — Summary to User

After the full pipeline, present a clean summary:

```
Pipeline complete: {Company} — {Job Title}

Score:         {score}/100 ({fit level})
Recommendation: {Strong Apply | Apply | Maybe | Skip}
Folder:        applications/{id}/

Documents generated:
  Resume:        applications/{id}/resume.pdf
  Cover Letter:  applications/{id}/cover-letter.pdf
  Report:        reports/{###}-{company-slug}-{date}.md

Next steps:
  → Review the resume and cover letter
  → If satisfied: node update-status.mjs --id="{id}" --status="Ready to Apply"
  → To edit: "edit my resume for {company}" or "change the cover letter"
  → To apply: use /career-ops apply to fill the form (you submit manually)
```

If score < 50 (Skip): recommend against applying. Let the user decide to override.
