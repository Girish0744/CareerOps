# Mode: tracker — Application Status Overview

Show the user a status overview of all applications.

## Data sources (read both)

1. `data/applications.json` — primary source, has score, fit level, folder paths, document paths
2. `data/applications.md` — legacy markdown tracker, also kept in sync

Prefer `applications.json` when both exist. Fall back to `applications.md` if JSON is empty.

## Display format

### Summary table

Show a summary table sorted by status priority (Interview > Applied > In Progress > Ready to Apply > Cover Letter Generated > Resume Generated > Saved > Offer > Rejected > Withdrawn):

```
# Application Tracker

| # | Company | Role | Score | Status | Documents | Created |
|---|---------|------|-------|--------|-----------|---------|
| 1 | Shopify | Software Developer | 82/100 (Strong) | Applied | R C E | 2026-05-28 |
| 2 | OpenAI  | AI Engineer        | 74/100 (Apply)  | Resume Generated | R E | 2026-05-29 |
```

**Documents column key:** R = Resume  C = Cover Letter  I = Interview Prep  E = Evaluation Report

### Statistics

After the table, show:
```
Total: {n} | Applied: {n} | Interview: {n} | Offer: {n} | Rejected: {n}
Avg score: {n}/100 | Docs complete (R+C): {n}/{total}
```

## Status update via chat

If the user says "update [company] to [status]" or "mark [company] as [status]":
1. Find the matching application in `data/applications.json`
2. Update `status` in `data/applications.json`
3. Update `status` in `applications/{id}/metadata.json`
4. Update the matching row in `data/applications.md`
5. If new status = `Interview` → prompt:
   > "Interview stage for {Company}! Generate interview prep with: `/career-ops interview-prep` (or tell me 'prep for interview at {Company}')"

## Open application folder

If the user says "open [company] folder" or "show me the files for [company]":
- Report the folder path: `applications/{id}/`
- List the files present in that folder
- Offer: "Want me to open it in file explorer? Run: `node list-applications.mjs --open="{id}"`"

## Regenerate documents

If the user says "regenerate resume for [company]" or "new cover letter for [company]":
- Find the application in `data/applications.json`
- Route to `modes/pdf.md` (resume) or `modes/cover-letter.md` (cover letter)
- The existing application folder is reused

## CLI alternative

Remind the user that the CLI tools work outside of this chat session:

```bash
node list-applications.mjs                              # View all
node list-applications.mjs --id="company-role-date"    # View one
node update-status.mjs --id="..." --status="Applied"   # Update status
node update-status.mjs --list                          # List IDs
```
