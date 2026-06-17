# Mode: apply — Live Application Assistant

Interactive mode for when the candidate is filling out an application form. In the frontend, Phase 17A stores a human-reviewed `applications/{id}/apply-session.json` with known fields, generated answers, upload paths, and review flags. Phase 17B can open a visible Playwright browser, follow bounded safe Apply hops when needed, fill high-confidence ATS fields, upload generated job-specific documents, and stop before final Submit/Apply. Phase 17C has a first Chrome/Edge extension companion that fills the current employer/ATS tab where browser permissions allow, reusing the same conservative matching and final-submit guard.

## Requirements

- **Frontend Apply tab**: paste form questions, generate answers, copy/review fields, and open the apply link.
- **Visible Playwright mode**: the candidate sees the browser while the assistant fills supported Greenhouse, Lever, Ashby, or conservative generic employer forms.
- **Chrome extension companion**: the MV3 extension in `browser-extension/` can read the current employer/ATS tab after the candidate clicks it, open a safe posting-page Apply link when needed, fill high-confidence fields, and save the current apply URL back to the local app. It cannot upload local files directly, and it must never click final Submit/Send/Apply.
- **Without browser automation**: the candidate shares a screenshot or pastes the questions manually.
- **Final submit rule**: never click Submit/Send/Apply. The candidate reviews and clicks the final button.
- **Voice**: written answers should sound like Girish - practical, warm, professional, role-specific, and grounded in saved proof points. Avoid generic AI phrasing, empty company praise, and invented experience.
- **Private facts**: address fields live in gitignored `config/profile.yml` under `apply.address_line1`, `apply.address_line2`, and `apply.postal_code`. Transcript files live in gitignored `private-docs/` and are referenced by `apply.transcript_path`.

## Workflow

```text
1. DETECT      → Read active Chrome tab (screenshot/URL/title)
2. IDENTIFY    → Extract company + role from the page
3. SEARCH      → Match against existing reports in reports/
4. LOAD        → Read full report + Section G (if it exists)
5. COMPARE     → Does the role on screen match the one evaluated? If it changed → notify
6. ANALYZE     → Identify ALL visible form questions
7. GENERATE    → For each question, generate a personalized response
8. PRESENT     → Show formatted responses for copy-paste
```

## Step 1 — Detect the job

**With Playwright:** Take a snapshot of the active page. Read title, URL, and visible content.

**Without Playwright:** Ask the candidate to:
- Share a screenshot of the form (Read tool can read images)
- Or paste the form questions as text
- Or say company + role so we can search for it

## Step 2 — Identify and search for context

1. Extract company name and role title from the page
2. Search in `reports/` by company name (case-insensitive grep)
3. If there is a match → load the full report
4. If there is a Section G → load previous draft answers as a base
5. If there is NO match → notify and offer to run a quick auto-pipeline

## Step 3 — Detect changes in the role

If the role on screen differs from the one evaluated:
- **Notify the candidate**: "The role has changed from [X] to [Y]. Do you want me to re-evaluate or adapt the responses to the new title?"
- **If adapt**: Adjust responses to the new role without re-evaluating
- **If re-evaluate**: Execute full A-F evaluation, update report, regenerate Section G
- **Update tracker**: Change role title in applications.md if applicable

## Step 4 — Analyze form questions

Identify ALL visible questions:
- Free text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No (relocation, visa, etc.)
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)

Classify each question:
- **Already answered in Section G** → adapt the existing response
- **New question** → generate response from the report + cv.md

## Step 5 — Generate responses

For each question, generate the response following:

1. **Report context**: Use proof points from block B, STAR stories from block F
2. **Previous Section G**: If a draft response exists, use it as a base and refine
3. **"I'm choosing you" tone**: Same auto-pipeline framework
4. **Specificity**: Reference something specific from the JD visible on screen
5. **career-ops proof point**: Include in "Additional info" if there is a field for it
6. **Natural voice**: Keep it concise and human. Prefer specific examples like Zonalyze, ETHOS, AegisGrid, MediTwin, OER tools, MediNet+, TelemetryDownloader, Student Dropout Risk Analysis, IT Club/community leadership, or support/trainer experience when they fit the question. Do not use phrases like "perfect fit", "leverage", "dynamic team", or "I am passionate about".

## Step 5B — Assisted fill

When using `POST /api/applications/{id}/apply/automate`:

1. Open the saved employer/ATS URL in a visible Playwright browser
2. Detect provider: Greenhouse, Lever, Ashby, or generic
3. Block restricted job-board hosts such as LinkedIn, Indeed, and Glassdoor
4. If no form fields are visible yet, follow up to 3 safe Apply hops such as `Apply`, `Apply Now`, `Apply for this job`, `Start Application`, or `Continue to application`; never treat `Submit Application`, login, share, or referral controls as safe apply-page resolvers
5. Stop navigation only when visible fields look like an application form. Ignore posting-page search/filter fields so safe Apply navigation can continue
6. Match fields using labels, placeholders, aria labels, field names/ids, fieldset legends, and nearby question text. Natural wording such as "where do you stay?" may map to country/location only when confidence is high
7. Fill only high-confidence fields from `apply-session.json`
8. Answer checkboxes/radios only from known profile truth, such as Canada work authorization = yes and sponsorship required = no. Leave terms, certification, voluntary demographic, and ambiguous options for review
9. Upload generated resume/cover-letter PDFs only when they belong to the current `applications/{id}/` folder. Upload the configured transcript file only when it exists
10. Leave uncertain fields unchanged and record them in `apply-session.json`
11. Stop with the browser open for human review before final Submit/Apply

## Step 5C — Extension companion

When using the Chrome/Edge extension:

1. Require the frontend to be running locally so the extension can call `/api/applications/{id}/apply`
2. Read the current tab only after the candidate clicks **Fill Current Page**
3. Block LinkedIn, Indeed, Glassdoor, login walls, and restricted job-board DOM extraction
4. If the current tab is a posting page, open only a safe Apply link (`Apply`, `Apply Now`, `Start Application`, etc.)
5. Fill only high-confidence text/select/checkbox/radio fields from the saved apply session
6. Leave uploads, ambiguous fields, demographics, consent/certification, and final-submit controls for human review
7. Save the selected/current apply URL back through `/api/applications/{id}/apply/current-tab` for audit

**Output format:**

```text
## Responses for [Company] — [Role]

Based on: Report #NNN | Score: X.X/5 | Archetype: [type]

---

### 1. [Exact form question]
> [Response ready for copy-paste]

### 2. [Next question]
> [Response]

...

---

Notes:
- [Any observations about the role, changes, etc.]
- [Personalization suggestions the candidate should review]
```

## Step 6 — Post-apply (optional)

If the candidate confirms that they submitted the application:
1. Update status in `applications.md` from "Evaluated" to "Applied"
2. Update Section G of the report with the final responses
3. Suggest next step: `/career-ops contacto` for LinkedIn outreach

## Scroll handling

If the form has more questions than the visible ones:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process in iterations until the entire form is covered
