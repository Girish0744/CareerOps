# Story Bank — Master STAR+R Stories

This file accumulates your best interview stories over time. Each evaluation (Block F) adds new stories here. Instead of memorizing 100 answers, maintain 5-10 deep stories that you can bend to answer almost any behavioral question.

## How it works

1. Every time `/career-ops oferta` generates Block F (Interview Plan), new STAR+R stories get appended here
2. Before your next interview, review this file — your stories are already organized by theme
3. The "Big Three" questions can be answered with stories from this bank:
   - "Tell me about yourself" → combine 2-3 stories into a narrative
   - "Tell me about your most impactful project" → pick your highest-impact story
   - "Tell me about a conflict you resolved" → find a story with a Reflection

## Stories

<!-- Stories will be added here as you evaluate offers -->
<!-- Format:
### [Theme] Story Title
**Source:** Report #NNN — Company — Role
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** What I learned / what I'd do differently
**Best for questions about:** [list of question types this story answers]
-->

### [AI Integration] MediTwin — LLM API in Production
**Source:** Report #001 — Unknown Company — AI/ML Backend Developer
**S:** Built a health app that needed AI-powered drug interaction insights, but manual lookups were slow and error-prone.
**T:** Integrate an LLM backend layer that takes user health data and returns personalized medication reports automatically.
**A:** Integrated Google Gemini API into a Flask backend, wrote a prompt engineering layer, connected OpenFDA API for drug data, and wired it end-to-end.
**R:** Cut manual drug research time by 40%; delivered personalized interaction reports on demand.
**Reflection:** Would have added response caching from day one — learned that API cost management matters at scale, not just correctness.
**Best for questions about:** AI/ML project experience, LLM integration, backend development, shipping AI features, problem-solving

---

### [Backend / API] Olive Branch — 5+ Third-Party API Integrations
**Source:** Report #001 — Unknown Company — AI/ML Backend Developer
**S:** Volunteer web project needed live data from 5+ external services simultaneously, and the existing site had no integration layer.
**T:** Connect all services without breaking existing workflows or degrading performance.
**A:** Built RESTful connectors for each service, resolved cross-platform compatibility bugs, optimized backend sync logic.
**R:** Improved data synchronization efficiency and user response time across the platform.
**Reflection:** Learned to build abstraction layers between the app and external providers — so swapping one vendor doesn't cascade failures.
**Best for questions about:** Backend development, API integration, debugging, software architecture

---

### [Testing / QA] MediNet+ — Selenium Test Automation
**Source:** Report #001 — Unknown Company — AI/ML Backend Developer
**S:** Hospital management system had slow manual QA cycles that were holding back delivery velocity.
**T:** Reduce testing time without expanding the team.
**A:** Built a Selenium automated test suite targeting record management and scheduling modules — the two highest-risk areas.
**R:** Reduced testing time by 20%; caught 3 regressions before production deployment.
**Reflection:** Edge case coverage beats happy-path coverage — that's where automation actually earns its keep.
**Best for questions about:** Testing, QA automation, debugging, code quality, reliability

---

### [Cross-functional Collaboration] Conestoga OER — SME Coordination
**Source:** Report #001 — Unknown Company — AI/ML Backend Developer
**S:** 5+ Open Educational Resources needed to ship on schedule, but the team was distributed and non-technical stakeholders (subject matter experts) had to approve every decision.
**T:** Deliver on time while translating between technical work and SME requirements.
**A:** Ran structured Zoom coordination sessions, adapted technical solutions based on non-technical feedback, published to Pressbooks, H5P, and WordPress.
**R:** 5+ OERs shipped on time; 1,000+ students reached; 20% increase in engagement.
**Reflection:** "What's the user's goal" is more useful than "what's the task" — same translation skill applies when business stakeholders give engineering requirements.
**Best for questions about:** Cross-functional collaboration, stakeholder communication, Agile teamwork, delivering under constraints
