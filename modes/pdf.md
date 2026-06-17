# Mode: pdf — ATS-Optimized PDF Generation

## Full pipeline

1. Read `cv.md` as the source of truth
2. Ask the user for the JD if it is not in context (text or URL)
3. Extract 15-20 keywords from the JD
4. Detect JD language → CV language (EN default)
5. Detect company location → paper format:
   - US/Canada → `letter`
   - Rest of the world → `a4`
6. Detect role archetype → adapt framing
7. Rewrite Professional Summary by injecting JD keywords + candidate narrative bridge (use `modes/_profile.md` exit narrative and positioning for the detected archetype)
8. Select top 3-4 most relevant projects for the job
9. Reorder experience bullets by JD relevance
10. Build competency grid from JD requirements (6-8 keyword phrases)
11. Inject keywords naturally into existing achievements (NEVER invent)
12. Generate full HTML from template + personalized content
13. Read `name` from `config/profile.yml` → normalize to kebab-case lowercase (e.g. "Girish Bhuteja" → "girish-bhuteja") → `{candidate}`
14. Write HTML to `/tmp/cv-{candidate}-{company}.html`
15. Execute: `node generate-pdf.mjs /tmp/cv-{candidate}-{company}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
16. **Save tailored resume Markdown** to `applications/{id}/resume.md` (the full tailored markdown used to generate this PDF)
17. **Copy PDF** to `applications/{id}/resume.pdf`
18. **Update `applications/{id}/metadata.json`**: set `resumePath` → `applications/{id}/resume.pdf`, `updatedAt` → today, `status` → `Resume Generated`
19. **Update `data/applications.json`**: set `resumePath`, `status`, `updatedAt` for the matching entry
20. Report: PDF path, application folder path, number of pages, keyword coverage %

**Note on application ID:** When called from the auto-pipeline, the `{id}` is already established in Step 0.5. When called standalone (`/career-ops pdf`), compute `{id}` the same way: `{slugify(company)}-{slugify(role)}-{YYYY-MM-DD}`. If the folder does not exist yet, create it (same structure as auto-pipeline Step 0.5).

## ATS Rules (clean parsing)

- Single-column layout (no sidebars, no parallel columns)
- Standard section headers: Technical Skills, Education, Professional Experience, Project Experience, Extracurricular Activities
- No text in images/SVGs
- No critical info in PDF headers/footers (ATS ignores them)
- UTF-8, selectable text (not rasterized)
- No nested tables
- Distributed JD keywords: Summary paragraph (top 5), first bullet of each role, Skills table

## PDF Design

- **Fonts**: Space Grotesk (name + section titles) + DM Sans (all body text)
- **Fonts self-hosted**: `fonts/`
- **Header**: name centered (Space Grotesk 22pt bold) + contact line (10pt) with bullet separators: `Location • email • phone • LinkedIn • Portfolio • GitHub`
- **Rule**: 1.5px solid black below header; 1px solid black below each section title
- **Section titles**: Space Grotesk 10.5pt bold, ALL CAPS, centered, black
- **Body**: DM Sans 10.5pt, line-height 1.45, black on white
- **No colors, no gradients, no colored accents** — plain black and white
- **Margins**: 0.5in top/bottom, 0.65in left/right
- **Background**: pure white

## Section order

1. Header — centered name + contact line + horizontal rule
2. Professional Summary — 2-3 lines, no section label, flows directly under header rule
3. Technical Skills — two-column table: **bold category name** | skills list
4. Education — degree, institution, location | dates (right-aligned), bullet notes
5. Professional Experience — reverse chronological, **bold title**, company, location | dates
6. Project Experience — **bold name**, GitHub link | year, with bullets: **Overview:** / **Technology Stack:** / **Outcome:**
7. Extracurricular Activities — top 3-4 most relevant to the JD, **bold role**, org | dates

## Content generation rules

**Summary (step 7):** 2-3 sentences. Use the candidate's narrative from `modes/_profile.md` as the base. Inject 3-5 JD keywords naturally. Keep it factual — no claims not backed by `cv.md`.

**Skills (step 10):** Keep the same 5 categories from `cv.md`. Within each category, reorder and front-load the skills most relevant to the JD. Do NOT add skills the candidate doesn't have.

**Experience bullets (step 9):** 2-3 bullets per role on a 2-page resume. Lead each bullet with the JD-relevant action. Keep metrics intact — do not invent or inflate numbers.

**Projects (step 8):** Select top 3 most relevant. Use **Overview / Technology Stack / Outcome** format exactly. Keep Outcome bullet — it has the metrics. Rewrite Technology Stack line to front-load JD-relevant technologies.

**Extracurricular (step 8):** Select top 3-4 most relevant to the JD. One bullet per entry. For technical roles: IT Club and HackTheBrain are usually most relevant.

**2-page rule:** If content exceeds 2 pages in the PDF, trim in this order:
1. Reduce extracurricular entries from 4 to 3
2. Reduce each experience entry from 3 bullets to 2
3. Reduce projects from 3 to 2 (keep the top 2 by JD relevance)
Never trim Education or the Skills table.

## Keyword injection strategy (ethical, truth-based)

Examples of legitimate reformulation:
- JD says "REST APIs" and cv.md says "integrated third-party APIs" → change to "integrated 5+ RESTful APIs"
- JD says "agile development" and cv.md says "Agile Methodologies" → change to "agile development workflows"
- JD says "cross-functional collaboration" and cv.md says "collaborated with SMEs and teams" → change to "cross-functional collaboration with subject matter experts and internal teams"

**NEVER add skills, tools, or experience the candidate does not have. Only reword real experience using the exact JD vocabulary.**

## Template HTML

Use `templates/cv-template.html`. Replace every `{{...}}` placeholder:

| Placeholder | Content |
|-------------|---------|
| `{{LANG}}` | `en` (or language of JD) |
| `{{PAGE_WIDTH}}` | `8.5in` for US/Canada; `210mm` for rest of world |
| `{{NAME}}` | `candidate.full_name` from `config/profile.yml` |
| `{{LOCATION}}` | `candidate.location` from `config/profile.yml` |
| `{{EMAIL}}` | `candidate.email` from `config/profile.yml` |
| `{{PHONE_SPAN}}` | When `candidate.phone` is set: `{phone}<span class="bsep">•</span>` — omit entirely if phone is empty |
| `{{LINKEDIN_URL}}` | `candidate.linkedin` from `config/profile.yml` |
| `{{LINKEDIN_DISPLAY}}` | `LinkedIn` (link text) |
| `{{PORTFOLIO_URL}}` | `candidate.portfolio_url` from `config/profile.yml` |
| `{{PORTFOLIO_DISPLAY}}` | Hostname only, e.g. `girishbhuteja.com` |
| `{{GITHUB_URL}}` | `candidate.github` from `config/profile.yml` |
| `{{GITHUB_DISPLAY}}` | `GitHub` (link text) |
| `{{SUMMARY_TEXT}}` | 2-3 sentence summary with JD keywords injected |
| `{{SKILLS}}` | `<table class="skills-table">` with one `<tr>` per category: `<td class="skill-cat">Category:</td><td>skills list</td>` |
| `{{EDUCATION}}` | One `.entry` div per degree — see HTML format below |
| `{{EXPERIENCE}}` | One `.entry` div per job (top 3-4 most recent/relevant) |
| `{{PROJECTS}}` | One `.project` div per project (top 3) |
| `{{EXTRACURRICULAR}}` | One `.entry` div per activity (top 3-4) |

### HTML formats for each section

**Skills table:**
```html
<table class="skills-table">
  <tr>
    <td class="skill-cat">Languages:</td>
    <td>Python, JavaScript, TypeScript, C, C++, C#, SQL, HTML, CSS</td>
  </tr>
  <tr>
    <td class="skill-cat">Frameworks and Libraries:</td>
    <td>React, Next.js, FastAPI, Flask, Node.js, Streamlit, REST APIs, WebSocket</td>
  </tr>
</table>
```

**Education entry:**
```html
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Bachelor Of Computer Science (Honours)</span>, Conestoga College, Waterloo, ON</div>
    <div class="entry-right">September 2022 – August 2026</div>
  </div>
  <ul>
    <li>GPA: 3.74/4.00; expected graduation August 2026</li>
    <li>Relevant coursework: Software Engineering, Database Systems, Cloud Computing, Big Data, AI and Machine Learning</li>
  </ul>
</div>
```

**Experience entry:**
```html
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Open Education Technology Project Assistant</span>, Conestoga College, Waterloo, ON</div>
    <div class="entry-right">January 2025 – Present</div>
  </div>
  <ul>
    <li>Developed accessible HTML/CSS templates for Pressbooks, H5P Studio, and WordPress-based courses supporting 1,000+ students.</li>
    <li>Automated repetitive workflows using Power Automate and maintained GitHub repositories for open education projects.</li>
  </ul>
</div>
```

**Project entry:**
```html
<div class="project">
  <div class="project-header">
    <div class="project-name">ETHOS, <a href="https://eth0s.online">Live Site</a></div>
    <div class="project-year">2026</div>
  </div>
  <ul>
    <li><strong>Overview:</strong> Built an ML pipeline to classify 9,500+ Kepler candidates as confirmed exoplanets or false positives.</li>
    <li><strong>Technology Stack:</strong> Python, Random Forest, MLP, GridSearchCV, MLflow, Streamlit, Flask, AWS EC2.</li>
    <li><strong>Outcome:</strong> Achieved 94.91% accuracy, 95% precision, and 94% recall with the champion Random Forest model.</li>
  </ul>
</div>
```

**Extracurricular entry:**
```html
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">President - IT Club</span>, Conestoga College</div>
    <div class="entry-right">April 2025 – Present</div>
  </div>
  <ul>
    <li>Built the club roadmap across workshops, Build Nights, hackathons, and mentorship programs for 100+ students.</li>
  </ul>
</div>
```

## Canva CV Generation (optional)

If `config/profile.yml` has `cv.canva_resume_design_id` set, offer the user a choice before generating:
- **"HTML/PDF (fast, ATS-optimized)"** — existing flow above
- **"Canva CV (visual, design-preserving)"** — new flow below

If the user has no `cv.canva_resume_design_id`, skip this prompt and use the HTML/PDF flow.

### Canva workflow

#### Step 1 — Duplicate the base design

a. `export-design` the base design (using `cv.canva_resume_design_id`) as PDF → get download URL
b. `import-design-from-url` using that download URL → creates a new editable design (the duplicate)
c. Note the new `design_id` for the duplicate

#### Step 2 — Read the design structure

a. `get-design-content` on the new design → returns all text elements (richtexts) with their content
b. Map text elements to CV sections by content matching:
   - Look for the candidate's name → header section
   - Look for "Summary" or "Professional Summary" → summary section
   - Look for company names from cv.md → experience sections
   - Look for degree/school names → education section
   - Look for skill keywords → skills section
c. If mapping fails, show the user what was found and ask for guidance

#### Step 3 — Generate tailored content

Same content generation as the HTML flow (Steps 1-11 above):
- Rewrite Professional Summary with JD keywords + exit narrative
- Reorder experience bullets by JD relevance
- Select top competencies from JD requirements
- Inject keywords naturally (NEVER invent)

**IMPORTANT — Character budget rule:** Each replacement text MUST be approximately the same length as the original text it replaces (within ±15% character count). If tailored content is longer, condense it. The Canva design has fixed-size text boxes — longer text causes overlapping with adjacent elements. Count the characters in each original element from Step 2 and enforce this budget when generating replacements.

#### Step 4 — Apply edits

a. `start-editing-transaction` on the duplicate design
b. `perform-editing-operations` with `find_and_replace_text` for each section:
   - Replace summary text with tailored summary
   - Replace each experience bullet with reordered/rewritten bullets
   - Replace competency/skills text with JD-matched terms
   - Replace project descriptions with top relevant projects
c. **Reflow layout after text replacement:**
   After applying all text replacements, the text boxes auto-resize but neighboring elements stay in place. This causes uneven spacing between work experience sections. Fix this:
   1. Read the updated element positions and dimensions from the `perform-editing-operations` response
   2. For each work experience section (top to bottom), calculate where the bullets text box ends: `end_y = top + height`
   3. The next section's header should start at `end_y + consistent_gap` (use the original gap from the template, typically ~30px)
   4. Use `position_element` to move the next section's date, company name, role title, and bullets elements to maintain even spacing
   5. Repeat for all work experience sections
d. **Verify layout before commit:**
   - `get-design-thumbnail` with the transaction_id and page_index=1
   - Visually inspect the thumbnail for: text overlapping, uneven spacing, text cut off, text too small
   - If issues remain, adjust with `position_element`, `resize_element`, or `format_text`
   - Repeat until layout is clean
e. Show the user the final preview and ask for approval
f. `commit-editing-transaction` to save (ONLY after user approval)

#### Step 5 — Export and download PDF

a. `export-design` the duplicate as PDF (format: a4 or letter based on JD location)
b. **IMMEDIATELY** download the PDF using Bash:
   ```bash
   curl -sL -o "output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf" "{download_url}"
   ```
   The export URL is a pre-signed S3 link that expires in ~2 hours. Download it right away.
c. Verify the download:
   ```bash
   file output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf
   ```
   Must show "PDF document". If it shows XML or HTML, the URL expired — re-export and retry.
d. Report: PDF path, file size, Canva design URL (for manual tweaking)

#### Error handling

- If `import-design-from-url` fails → fall back to HTML/PDF pipeline with message
- If text elements can't be mapped → warn user, show what was found, ask for manual mapping
- If `find_and_replace_text` finds no matches → try broader substring matching
- Always provide the Canva design URL so the user can edit manually if auto-edit fails

## Post-generation

Update tracker if the job is already registered: change PDF from ❌ to ✅.
