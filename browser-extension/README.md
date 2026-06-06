# Career-Ops Browser Extension Companion

Phase 17C foundation: a small Chrome/Edge extension that helps bridge the gap when Playwright cannot click through a user-handled posting page.

What it does:

- Reads the current tab only after you click the extension.
- Blocks restricted job-board DOM extraction for LinkedIn, Indeed, and Glassdoor.
- Opens a safe posting-page Apply link when needed, then fills high-confidence fields on the visible form.
- Saves the current apply URL to the local Career-Ops app for review/audit.
- Leaves ambiguous fields, consent checkboxes, demographic questions, and file uploads for review.
- Never clicks Submit, Send, Apply, login, referral, share, save, or destructive controls.

Local setup:

1. Start the frontend at `http://localhost:3000`.
2. Open Chrome or Edge extensions.
3. Enable Developer mode.
4. Load unpacked extension from `browser-extension/`.
5. Open an application in Career-Ops and copy the application id from the URL.
6. Open the employer/ATS job page, click the extension, paste the id, and click **Fill Current Page**.
7. Review the filled form. You still click the final submit/apply button yourself.

This companion is intentionally narrow. It is not a LinkedIn/Indeed/Glassdoor scraper and it does not submit applications.
