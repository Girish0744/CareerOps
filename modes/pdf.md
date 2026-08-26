# Mode: pdf — ATS-Optimized PDF Generation

## Full pipeline

1. Read `cv.md` as the source of truth — never fabricate metrics or experience
2. Ask the user for the JD if not in context (text or URL)
3. Extract 15–20 keywords, skills, tools, responsibilities, and role-specific phrases from the JD
4. Detect role archetype (see Archetype Detection below)
5. Detect company location → paper format: US/Canada → `letter`, rest of world → `a4`
6. Select the most relevant projects using the Project Selection Matrix: 3 projects by default, 4 only if page 2 needs density and space allows
7. Write the tailored profile paragraph (3-4 sentences, zero first-person)
8. Build Highlights of Qualifications (always exactly 4 bullets)
9. Select experience bullets by archetype
10. Reorder skills within each category by JD relevance
11. Select extracurricular entries (2 always + 1 optional)
12. Include both award entries always
13. Build certifications line
14. Inject JD keywords naturally — never invent
15. Generate full HTML from the locked `templates/cv-template.html` structure + personalized content
16. Read `name` from `config/profile.yml` → normalize to kebab-case lowercase → `{candidate}`
17. Write HTML to `/tmp/cv-{candidate}-{company}.html`
18. Execute: `node generate-pdf.mjs /tmp/cv-{candidate}-{company}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
19. Save tailored resume markdown to `applications/{id}/resume.md`
20. Copy PDF to `applications/{id}/resume.pdf`
21. Update `applications/{id}/metadata.json`: set `resumePath`, `updatedAt`, `status` → `Resume Generated`
22. Update `data/applications.json`: set `resumePath`, `status`, `updatedAt` for the matching entry
23. Report: PDF path, application folder path, keyword coverage %

## Archetype Detection

Read the JD and classify into exactly one:

| Archetype | Dominant signals |
|-----------|-----------------|
| `SWE_FULLSTACK` | React, TypeScript, Node.js, REST APIs, databases, front-end/back-end primary |
| `AI_ML` | model training, ML pipelines, data science, Python (ML), scikit-learn, TensorFlow primary |
| `DA_BA` | SQL, data analysis, dashboards, BI, reporting, business intelligence primary |
| `SYSTEMS_CPP` | embedded, networking, C/C++, TCP, binary protocols, hardware primary |
| `CSHARP_DOTNET` | C#, .NET, Windows Forms, enterprise desktop, SQL Server primary |
| `GENERAL` | mixed or none of the above clearly dominant |

## Project Selection Matrix (3 required, 4 optional)

Every tailored resume must include at least 3 projects. Use exactly 3 by default. Add a 4th project only if the second page would otherwise look sparse and the extra project is strongly relevant to the JD. Never drop below 3 projects.

| Archetype | Projects to select |
|-----------|-------------------|
| SWE_FULLSTACK | BestSpot, AegisGrid, MediTwin |
| AI_ML | BestSpot, ETHOS, AegisGrid |
| DA_BA | BestSpot, ETHOS, Student Dropout Risk Analysis |
| SYSTEMS_CPP | TelemetryDownloader, MediNet+, BestSpot |
| CSHARP_DOTNET | MediNet+, DineEase, BestSpot |
| GENERAL | BestSpot, ETHOS, AegisGrid |

Optional 4th project guidance:
- Full-stack/web: MediTwin or DineEase
- AI/ML: MediTwin or Student Dropout Risk Analysis
- Data/analyst: AegisGrid or MediTwin
- Systems/C++: AegisGrid or ETHOS
- C#/.NET: DineEase

For data analytics roles, choose analytics/data-related projects over unrelated web-only projects.

### Project URLs (always use these exact links)

| Project | GitHub | Live |
|---------|--------|------|
| BestSpot | https://bestspot.biz | — |
| ETHOS | https://github.com/Girish0744/ETHOS-MLPROJECT | https://eth0s.online |
| AegisGrid | https://github.com/Girish0744/AegisGrid | https://aegis-grid.vercel.app |
| MediTwin | https://github.com/Girish0744/MediTwin | — |
| DineEase | https://github.com/Girish0744/DineEase | — |
| MediNet+ | https://github.com/Girish0744/MediNet | — |
| Student Dropout Risk Analysis | https://github.com/Girish0744/Student-Dropout-Risk-Analysis | — |
| TelemetryDownloader | https://github.com/Girish0744/TelemetryDownloader | — |

For each project: write one stack line (JD-relevant tech front-loaded) + 2–3 evidence bullets when possible (metric-bearing first). Each selected project should have at least 3 total bullets including the stack line.

## ATS Rules (clean parsing)

- Single-column layout (no sidebars, no parallel columns)
- Standard section headers (see Section Order below)
- No text in images/SVGs
- No critical info in PDF headers/footers (ATS ignores them)
- UTF-8, selectable text (not rasterized)
- No nested tables
- JD keywords distributed: profile paragraph (top 5), first bullet of each role, Skills table

## PDF Design

`templates/cv-template.html` is Girish's final approved resume format. Do not change fonts, margins, spacing, section styling, or page-break CSS from this mode. The PDF generator should fill the template's placeholders with tailored content, then let `generate-pdf.mjs` render the HTML using the template's own `@page` rules.

There is no dynamic resume theme or format selection. If a generated resume looks weak, improve content selection, section density, project choice, and truthful wording first. Edit `templates/cv-template.html` only if Girish explicitly asks for a resume layout/design change.

## Section Order (matches master CV)

1. Header — centered name + contact line + rule
2. Profile — max 4-sentence paragraph, no first-person wording
3. Highlights of Qualifications — 5 bullets always
4. Technical Skills — two-column table: **bold category** | skills list
5. Professional Experience — OER role (3 bullets) + Olive Branch (2 bullets)
6. Projects — start on page 2; 3 projects required, 4 optional only if space allows
7. Education — degree, institution, location | dates
8. Extracurricular Activities — 2 always + 1 optional
9. Awards and Recognition — both awards always
10. Certifications & Memberships — single line

## Page Layout Contract

- Page 1 should contain Profile, Highlights of Qualifications, Technical Skills Summary, and Professional Experience.
- Page 2 must start with Projects, then Education, Extracurricular Activities, Awards and Recognition, and Certifications & Memberships.
- Use `templates/cv-template.html` as the locked layout source. Keep its `page-two` wrapper around Projects through Certifications so the page break is structural.
- The second page should look full. If it is sparse, expand the strongest 3 projects with relevant evidence bullets before adding a 4th project.

## Content Generation Rules

### Profile (Step 7)

3-4 sentences, zero first-person pronouns anywhere:
- Sentence 1: Identity + primary stack for this archetype using JD vocabulary
- Sentence 2: Capability (what end-to-end means for this role) from real project evidence
- Sentence 3: Project background — cite 1–2 project names
- Optional sentence 4: Add only if it strengthens the JD fit with another real capability; do not use availability as filler

Profile starters by archetype (adapt, do not copy verbatim):
- SWE_FULLSTACK: "Full-stack developer with 3+ years of hands-on experience building and deploying web applications using React, TypeScript, FastAPI, and PostgreSQL..."
- AI_ML: "Machine learning developer with hands-on experience building and deploying ML pipelines using Python, scikit-learn, MLflow, and FastAPI..."
- DA_BA: "Data analyst with hands-on experience building data pipelines and translating findings into actionable recommendations using Python, SQL, Pandas, and visualization tools..."
- SYSTEMS_CPP: "Software developer with hands-on experience building networked systems and protocol implementations in C++ using TCP/IP, binary packet design, and state machine architecture..."
- CSHARP_DOTNET: "Software developer with hands-on experience building multi-role desktop applications in C# using Windows Forms, SQL Server, and TCP networking..."

### Highlights of Qualifications (Step 8) — always exactly 4 bullets

1. Delivery range (NEVER the degree, school, or GPA — Education states those): coursework may still be referenced from [4–5 JD-relevant subjects from: Software Engineering, OOP, Data Structures and Algorithms, Database Systems, Computer Networks, OS and Security, Cloud Computing, Big Data, AI and Machine Learning]"
2. Co-op: "Completed 2 co-op work terms at Conestoga College; converted from part-time to co-op based on performance and retained through departmental restructuring"
3. Deployment proof: "Deployed 8+ full-stack and ML projects using [6–8 JD-relevant tools from cv.md]; all publicly available on GitHub"
4a. IF AI_ML or GENERAL: "Built ML pipelines with scikit-learn, MLflow, and Random Forest, achieving 94.9% classification accuracy on real NASA Kepler telescope data"
4b. ELSE replace with most JD-relevant capability bullet:
   - SWE_FULLSTACK: "Architected and deployed a real-time WebSocket architecture with centralized message bus broadcasting updates across 8 modules in under 2 seconds"
   - DA_BA: "Analyzed 4,400+ student records across two real-world datasets applying IQR-based outlier detection and multi-variable correlation analysis to generate institutional recommendations"
   - SYSTEMS_CPP: "Implemented a 7-type binary packet protocol and 5-state server lifecycle state machine with Stop-and-Wait ACK, achieving 32 passing tests and a byte-exact 1 MB transfer"
   - CSHARP_DOTNET: "Wrote 85+ MSTest methods across unit, integration, and system tiers covering patient workflows, billing calculations, and server connectivity"
5. Award + leadership: "Narhari Sharma Memorial Award recipient (April 2026); IT Club President coordinating workshops, hackathons, and mentorship programs for 100+ students"

### Experience (Step 9)

**OER role — 3 bullets front-loaded by archetype:**
- SWE_FULLSTACK/GENERAL: HTML/CSS templates bullet → automation bullet → engagement metric
- AI_ML: automation bullet → HTML/CSS templates → engagement metric
- DA_BA: automation bullet → engagement/metrics bullet → HTML/CSS templates
- SYSTEMS_CPP/CSHARP_DOTNET: automation bullet → open-source contribution → HTML/CSS templates

**Olive Branch — both bullets (only 2 in master CV):** front-load JD-relevant one

**Home Depot — DROP entirely** (not relevant to tech roles)

### Skills (Step 10)

Keep all 5 categories with exact names. Front-load JD-matching skills within each:
- Languages:
- Frameworks and Libraries:
- AI/ML and Data:
- Databases:
- Tools and Infrastructure:

Never add skills the candidate does not have.

### Extracurricular (Step 11) — 2 always + 1 optional

Always include (1 bullet each):
1. President, IT Club, Conestoga College — Apr 2025 – Present
2. Director, Student Success Team, HackTheBrain, Toronto Tech Week — Mar 2025 – Jul 2025

Add 1 more ONLY if page space permits:
- Area Leader, AI Build Lab, Toronto Tech Week (May 2026 – Jun 2026) — for AI/tech roles
- Student Experience Mentor, Conestoga College (Sept 2025 – Dec 2025)
- Subcommittee Member, GDG Waterloo (Apr 2026 – Present)

DROP: Orientation Volunteer, Leadership Workshop Facilitator, Volunteering Panel Speaker

### Awards (Step 12) — always include both

1. Narhari Sharma Memorial Award, Conestoga College | April 2026
2. Helena Webb Mentorship Program, Conestoga College | January – April 2026

### Certifications (Step 13) — single line

Standard: "AI Agents: Intensive Vibe Coding, Google & Kaggle · Java SE, Oracle · OOP Using C++, Infosys · CIPS Ontario Member"
Never drop CIPS Ontario.

## Writing Quality Rules (non-negotiable)

- **ZERO first-person pronouns** — no "I", "my", "me", "we", "our" anywhere
- **No em dashes (—)** — use semicolons, colons, or restructure
- **No periods at the end of bullet points**
- **Round metrics**: 94.9% not 94.91%, 88% not 88.14%
- **Never fabricate** — every number and fact from cv.md exactly
- **Vary action verbs** — never use the same action verb twice on the same page
- **No AI filler**: no "passionate about", "excited to", "I believe", "team player", "detail-oriented", "innovative solutions", "fast-paced environment", "results-driven"
- **The degree is complete** (conferred August 2026). Write "holds" / "graduate of", never "candidate", "pursuing", "expected", or any graduation date. The Education entry carries the date range Sept 2022 - Aug 2026 and nothing else.
- Bullets are direct statements of fact and impact — no preamble, no hedging
- JD keywords appear in context, not bolted on — if a bullet sounds forced, rewrite it

## 2-Page Management (trim in this exact order)

1. Drop the optional 4th project if present
2. Drop the optional 3rd extracurricular entry
3. Reduce OER role from 3 bullets to 2 (drop least-relevant)
4. Reduce each project from 3 content bullets to 2 (keep the metric-bearing bullet)

**Never trim**: below 3 projects, Education, Highlights of Qualifications, Awards and Recognition, Skills table

## Keyword injection strategy

Examples of legitimate reformulation (never invent):
- JD says "REST APIs" + cv.md says "integrated third-party APIs" → "integrated 5+ RESTful APIs"
- JD says "agile development" + cv.md says "coordinated teams" → "coordinated teams in agile development workflows"
- JD says "cross-functional collaboration" + cv.md says "collaborated with SMEs" → "cross-functional collaboration with subject matter experts and internal teams"

## Template HTML

Use `templates/cv-template.html`. Replace every `{{...}}` placeholder:

| Placeholder | Content |
|-------------|---------|
| `{{LANG}}` | `en` |
| `{{PAGE_WIDTH}}` | `8.5in` for Canada/US; `210mm` for rest of world |
| `{{NAME}}` | candidate full name |
| `{{LOCATION}}` | city, province |
| `{{EMAIL}}` | candidate email |
| `{{PHONE_SPAN}}` | `{phone}<span class="bsep">•</span>` or empty |
| `{{LINKEDIN_URL}}` | linkedin URL without https:// |
| `{{LINKEDIN_DISPLAY}}` | `LinkedIn` |
| `{{PORTFOLIO_URL}}` | full portfolio URL |
| `{{PORTFOLIO_DISPLAY}}` | hostname only |
| `{{GITHUB_URL}}` | github URL without https:// |
| `{{GITHUB_DISPLAY}}` | `GitHub` |
| `{{SUMMARY_TEXT}}` | plain text profile paragraph |
| `{{HIGHLIGHTS}}` | `<ul>` with 5 `<li>` items |
| `{{SKILLS}}` | `<table class="skills-table">` |
| `{{EXPERIENCE}}` | one `<div class="entry">` per role |
| `{{PROJECTS}}` | one `<div class="project">` per project |
| `{{EDUCATION}}` | one `<div class="entry">` |
| `{{EXTRACURRICULAR}}` | one `<div class="entry">` per activity |
| `{{AWARDS}}` | one `<div class="entry">` per award |
| `{{CERTIFICATIONS}}` | plain text (template wraps in `<p>`) |

### HTML formats for each section

**Skills table:**
```html
<table class="skills-table">
  <tr><td class="skill-cat">Languages:</td><td>Python, JavaScript, TypeScript, C, C++, C#, SQL, HTML, CSS</td></tr>
  <tr><td class="skill-cat">Frameworks and Libraries:</td><td>React, Next.js, FastAPI, Flask, Node.js, Streamlit, REST APIs, WebSocket</td></tr>
  <tr><td class="skill-cat">AI/ML and Data:</td><td>TensorFlow, Keras, scikit-learn, MLflow, Pandas, NumPy, Random Forest, MLP, CNN, RNN, Transformers, Autoencoders, GANs, DBSCAN, Clustering, GridSearchCV</td></tr>
  <tr><td class="skill-cat">Databases:</td><td>PostgreSQL, SQL Server, MongoDB, MySQL, SQLite</td></tr>
  <tr><td class="skill-cat">Tools and Infrastructure:</td><td>AWS EC2, AWS S3, AWS Athena, AWS Lambda, Azure, Docker, Vercel, Git, GitHub, CI/CD, Postman, Power BI, Power Automate, Selenium</td></tr>
</table>
```

**Education entry:**
```html
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Bachelor of Computer Science (Honours)</span>, Conestoga College, Waterloo, ON</div>
    <div class="entry-right">September 2022 – August 2026</div>
  </div>
  <ul>
    <li>GPA: 3.76/4.00</li>
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
    <li>Developed accessible HTML/CSS templates for Pressbooks, H5P Studio, and WordPress-based courses supporting 1,000+ students</li>
    <li>Automated repetitive workflows using Power Automate and maintained GitHub repositories for open education projects</li>
  </ul>
</div>
```

**Project entry:**
```html
<div class="project">
  <div class="project-header">
    <div class="project-name">ETHOS, <a href="https://github.com/Girish0744/ETHOS-MLPROJECT">GitHub</a>, <a href="https://eth0s.online">Live Site</a></div>
    <div class="project-year">2026</div>
  </div>
  <ul>
    <li>Stack: Python, scikit-learn, Random Forest, MLP, GridSearchCV, MLflow, Streamlit, Flask, AWS EC2</li>
    <li>Developed a complete ML pipeline classifying 9,500+ Kepler telescope candidates, achieving 94.9% accuracy with the champion Random Forest model</li>
  </ul>
</div>
```

**Award entry:**
```html
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">Narhari Sharma Memorial Award</span>, Conestoga College</div>
    <div class="entry-right">April 2026</div>
  </div>
  <ul>
    <li>Awarded for academic excellence, leadership, and sustained commitment to helping others succeed; nominated by management and colleagues</li>
  </ul>
</div>
```

**Extracurricular entry:**
```html
<div class="entry">
  <div class="entry-header">
    <div class="entry-left"><span class="entry-title">President, IT Club</span>, Conestoga College</div>
    <div class="entry-right">April 2025 – Present</div>
  </div>
  <ul>
    <li>Coordinated workshops, Build Nights, hackathons, and mentorship programs equipping 100+ students with in-demand technical skills</li>
  </ul>
</div>
```

## Post-generation

Update tracker if the job is already registered: change PDF from ❌ to ✅.
