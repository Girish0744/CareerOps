# Mode: edit-application — Chat-Based Document Editing

## When to run

When the user requests changes to a generated resume or cover letter for a specific application.

Trigger phrases:
- "Edit my resume for [company]"
- "Change the [section] in the cover letter"
- "Make this bullet more ATS-friendly"
- "Shorten the cover letter"
- "Change the heading to [new title]"
- "Add [skill] to the skills section"
- "Rewrite the summary for [company]"
- "Make the cover letter sound less generic"

## Critical Rules

1. **Only edit `applications/{id}/` files** — NEVER edit `cv.md`, `config/profile.yml`, or `modes/_profile.md`. These are the master profile and must not be changed.
2. **No invented experience** — only reword or reframe what exists in the master profile files. Do not add skills, achievements, or facts not present in `cv.md`.
3. **Targeted edits only** — unless the user explicitly asks to rewrite the whole document, change ONLY what was requested.
4. **Always regenerate PDF** — after saving the updated `.md`, re-run the PDF generator. The PDF and markdown must stay in sync.
5. **One document at a time** — complete the edit and PDF regeneration before moving to the next document.

## Step 1 — Identify Target

Determine:
- **Which application?** — from context (recent evaluation or mention) or `data/applications.json`. If unclear, list open applications and ask.
- **Which document?** — `resume.md` or `cover-letter.md`
- **What specific change?** — extract the exact request

If no application ID is clear, read `data/applications.json`, show a short list:
```
Recent applications:
  1. {company} — {role} ({status}) → {id}
  2. ...
Which one?
```

## Step 2 — Read the Document

Read `applications/{id}/resume.md` or `applications/{id}/cover-letter.md`.

Confirm the edit scope with the user if the request is ambiguous:
> "I'll change [X specific thing] in your [resume/cover letter] for [Company]. Confirm?"

## Step 3 — Apply the Edit

Make ONLY the change requested. Rules:
- If the user says "change the heading" → change just the heading
- If the user says "shorten" → remove redundant phrases, not whole sections
- If the user says "make this ATS-friendly" → replace fancy formatting/symbols with plain text equivalents
- If the user says "rewrite the summary" → rewrite only the Professional Summary section
- If the user says "make it fit one page" → trim bullets and reduce spacing hints, flag if content is still too long

Write the updated file back to `applications/{id}/{document}.md`.

## Step 4 — Regenerate PDF

**For resume edits:**

Follow the same process as `modes/pdf.md`:
1. Generate full HTML from the updated `resume.md` using `templates/cv-template.html`
2. Write HTML to `/tmp/cv-{candidate-slug}-{company-slug}-edit.html`
3. Run:
   ```bash
   node generate-pdf.mjs /tmp/cv-{candidate-slug}-{company-slug}-edit.html applications/{id}/resume.pdf --format=letter
   ```

**For cover letter edits:**

1. Generate HTML from the updated content using `templates/cover-letter-template.html`
2. Write HTML to `/tmp/cover-letter-{candidate-slug}-{company-slug}-edit.html`
3. Run:
   ```bash
   node generate-pdf.mjs /tmp/cover-letter-{candidate-slug}-{company-slug}-edit.html applications/{id}/cover-letter.pdf --format=letter
   ```

## Step 5 — Log the Edit

Append to `applications/{id}/edit-history.json`. If the file does not exist, create it as an empty array first.

```json
{
  "timestamp": "{ISO 8601 timestamp}",
  "document": "resume.md",
  "instruction": "{exact user request}",
  "changedFiles": ["resume.md", "resume.pdf"]
}
```

## Step 6 — Update Metadata

Update `applications/{id}/metadata.json`:
- Set `updatedAt` to today's date

## Step 7 — Confirm

```
Updated:  applications/{id}/{document}.md
PDF:      applications/{id}/{document}.pdf
Change:   {1-line description of what changed}
```

Ask: "Anything else to change, or does this look good?"

## Handling Multi-Step Edit Sessions

If the user makes multiple edit requests in sequence:
- Complete each edit + PDF regeneration before moving to the next
- After 3+ edits, remind the user: "You've made several changes. Want me to show you a summary of what's different from the original?"
- Keep the original in context — never accidentally undo a previous intentional edit
