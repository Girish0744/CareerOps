# Mode: cover-letter — Tailored Cover Letter Generation

## When to run

- As part of the auto-pipeline (Step 3.5, after resume PDF is generated)
- When the user explicitly requests: "generate cover letter", "write cover letter"
- When regenerating for an existing application: "regenerate cover letter for [company]"

## Inputs

1. **Job description** — from context, URL, or `applications/{id}/job-description.md`
2. **Evaluation report** — `reports/{###}-{company}-{date}.md` if available (use Block B gaps + Block E plan)
3. **CV** — `cv.md`
4. **Profile** — `config/profile.yml` + `modes/_profile.md`
5. **Application ID** — the `{company-slug}-{role-slug}-{YYYY-MM-DD}` folder name

## Cover Letter Rules

- Max 4 short paragraphs. Target 250-350 words total.
- Human, direct, confident. Not sycophantic.
- Do NOT start the opening paragraph with "I".
- Do NOT use: "I am passionate about", "I would love the opportunity", "I believe I would be a great fit", "I am writing to apply for".
- No claims not backed by `cv.md` or `config/profile.yml`.
- Use JD keywords naturally — do not keyword-stuff.
- Reference something specific about the company or team (product, mission, tech stack, recent news — use what's in the evaluation report or JD).
- Language: match the JD language (English default).

## Step 1 — Extract Key Points

From the JD, extract:
- Top 2-3 things the company is looking for in this hire
- One specific, concrete detail about the company/team worth referencing
- Exact job title

From `cv.md` + `config/profile.yml`, identify:
- The single best proof point that matches the role (lead with this in paragraph 2)
- The candidate's positioning for this archetype (see `modes/_profile.md` adaptive framing table)

## Step 2 — Write the Letter

### Paragraph 1 — Opening: Role interest + company alignment
Reference something specific about the company or team. Show you know what they do and why this role fits where you are going. Do NOT start with "I".

Example opening: "What stood out about [Company]'s [specific thing] is how directly it maps to [your experience]."

### Paragraph 2 — Evidence: Best proof point
Lead with a concrete, quantified achievement from `cv.md` that directly addresses the company's top need. One proof point, well-told, beats a list of claims.

Example: "At [context], I [built/led/shipped] [X] that [result]. [Company]'s need for [Y] is exactly where that experience applies."

### Paragraph 3 — Fit + forward: Why this is the right next step
Connect past experience to what this role offers. Show genuine interest in the growth this role provides. Keep it forward-looking, not backward-looking.

### Paragraph 4 — Closing (can be merged into Paragraph 3 if short)
Clear call to action. Confident, not begging.

Example: "I would welcome the chance to discuss how my background fits what you are building. Thank you for your consideration."

## Step 3 — Generate HTML

Use `templates/cover-letter-template.html`. Replace every `{{...}}` placeholder:

| Placeholder | Value |
|-------------|-------|
| `{{LANG}}` | `en` (or match JD language) |
| `{{PAGE_WIDTH}}` | `8.5in` for US/Canada; `210mm` for rest of world |
| `{{NAME}}` | `candidate.full_name` from `config/profile.yml` |
| `{{LOCATION}}` | `candidate.location` from `config/profile.yml` |
| `{{EMAIL}}` | `candidate.email` from `config/profile.yml` |
| `{{PHONE_SPAN}}` | When `candidate.phone` is set: `{phone}, ` (with trailing comma + space) — omit entirely if phone is empty |
| `{{LINKEDIN_URL}}` | `candidate.linkedin` from `config/profile.yml` |
| `{{LINKEDIN_DISPLAY}}` | `LinkedIn` |
| `{{PORTFOLIO_URL}}` | `candidate.portfolio_url` from `config/profile.yml` |
| `{{PORTFOLIO_DISPLAY}}` | Hostname only (e.g. `girishbhuteja.com`) |
| `{{GITHUB_URL}}` | `candidate.github` from `config/profile.yml` |
| `{{GITHUB_DISPLAY}}` | `GitHub` |
| `{{DATE}}` | Today's date written out (e.g., `May 28, 2026`) |
| `{{HIRING_MANAGER}}` | Recipient's full name — use `Hiring Manager` if unknown |
| `{{RECIPIENT_TITLE_LINE}}` | Recipient's job title followed by `<br>` — empty string if unknown |
| `{{COMPANY}}` | Company name from JD |
| `{{COMPANY_ADDRESS}}` | Full address on one line if available; empty string if not found |
| `{{JOB_TITLE}}` | Exact job title from JD |
| `{{JOB_REF}}` | Job ref number if in JD, e.g. ` (Req #1234)` — empty string if not found |
| `{{SALUTATION}}` | `Ms./Mr. {LastName}` if name known; otherwise `Hiring Manager` |
| `{{BODY}}` | 3–4 paragraphs in `<p>...</p>`; bullet lists in `<ul><li>...</li></ul>` |

## Step 4 — Save Files

Compute the candidate slug: normalize `candidate.full_name` from `config/profile.yml` to kebab-case lowercase (e.g. "Girish Bhuteja" → "girish-bhuteja").

1. **Write Markdown** to `applications/{id}/cover-letter.md`:

```markdown
# Cover Letter: {Job Title} at {Company}

**Date:** {YYYY-MM-DD}
**Application:** applications/{id}/

---

{candidate name}
{phone} | {email} | {linkedin}

{Date written out}

Hiring Manager
{Company}

Re: Application for {Job Title}

Dear Hiring Manager,

{paragraph 1}

{paragraph 2}

{paragraph 3}

{closing paragraph}

Sincerely,
{candidate name}
```

2. **Write HTML** to a temp path:
   ```
   /tmp/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.html
   ```

3. **Generate PDF**:
   ```bash
   node generate-pdf.mjs /tmp/cover-letter-{candidate-slug}-{company-slug}-{YYYY-MM-DD}.html applications/{id}/cover-letter.pdf --format=letter
   ```
   (Use `--format=a4` for non-US/Canada companies.)

4. **Update `applications/{id}/metadata.json`**:
   - Set `coverLetterPath` → `applications/{id}/cover-letter.pdf`
   - Set `updatedAt` → today's date
   - If `status` is `Resume Generated` → update to `Cover Letter Generated`

5. **Update `data/applications.json`**:
   - Find the entry where `id` matches
   - Set `coverLetterPath` → `applications/{id}/cover-letter.pdf`
   - Set `updatedAt` → today's date
   - Update `status` if it was `Resume Generated`

## Step 5 — Output Summary

```
Cover letter generated:
  MD:     applications/{id}/cover-letter.md
  PDF:    applications/{id}/cover-letter.pdf
  Words:  ~{word count}

Status updated to: Cover Letter Generated
```

Offer the user:
> "Cover letter saved. Want me to make any changes, or is this ready to review?"
