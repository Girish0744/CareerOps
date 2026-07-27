# Article Digest

Use this file for additional proof points, articles, case studies, and project notes that are not already captured in `cv.md`.

## Master Resume Proof Points

This proof-point library was refreshed from `Girish-Bhuteja-Master-Resume.docx` on 2026-06-17. Use it to pick job-specific evidence honestly. Do not invent metrics beyond what is listed here.

### Zonalyze -- Business Feasibility Intelligence Platform

- Built a full-stack business feasibility intelligence platform for entrepreneurs evaluating location viability across 26 business types in 552 Ontario municipalities.
- Uses Statistics Canada 2021 Census data plus live OpenStreetMap competitor, transit, and commercial activity feeds.
- Trained three Random Forest models on 50,000+ synthetic records derived from real census features:
  - Risk classifier: 88.14% accuracy.
  - Revenue regressor: R2 = 0.93.
  - Feasibility score regressor: R2 = 0.99.
- Built a data pipeline transforming raw Statistics Canada CSD files into 45-feature model-ready matrices.
- Implemented WebSocket updates across 8 monitoring modules in under 2 seconds.
- Added LLM-powered natural language scenario analysis and business insight Q&A.
- Containerized the multi-service stack with Docker Compose.
- Delivered investor-ready PDF export, scenario history, multi-scenario comparison, geospatial market context mapping, and token-based authentication.

### CareerOps -- AI Job Application Platform

- Full-stack AI job-application platform (Next.js, React, TypeScript, Node.js) with 19 REST API routes.
- Scored and ranked 300+ live job postings and drove 90+ tracked applications end to end.
- 5-stage document-generation pipeline on the Google Gemini API (structured generation, in-code verification, targeted repair, locked-template render, 2-page fit control); tailored ATS resume in under a minute.
- In-code verification layer enforcing a 100-point, 7-category scoring rubric plus keyword-coverage, anti-fabrication, and voice checks; guarded by 5 automated QA suites.
- Playwright PDF rendering from a locked template with programmatic page-fill measurement holding output to exactly 2 pages.
- Zero-cost job-discovery scanner across 3 ATS provider APIs (Greenhouse, Ashby, Lever) plus a Canadian aggregator into a scored, deduplicated queue.
- Scheduled batch automation: up to 4 complete application packages per run, prioritizing 20 referral companies, with a WhatsApp briefing via a self-hosted Node.js service.
- Human-in-the-loop Playwright apply assistant that fills ATS fields from a profile truth table and stops before final submission.
- Available metrics to draw from: 19 API routes, 300+ postings scored, 90+ applications tracked, 5-stage pipeline, 100-point/7-category rubric, 5 QA suites, 3 ATS APIs, 20 referral companies, 2-page output.
- Note: personal engineering project extended from an open-source starting point; the platform, AI document pipeline, automation, and Canadian job sourcing above are Girish's own work.

### ETHOS -- Autonomous Exoplanet Discovery Pipeline

- Classified 9,500+ Kepler Space Telescope candidates as confirmed exoplanets or false positives using NASA Exoplanet Archive data.
- Applied domain-driven physical auditing to eliminate sensor artifacts before model training.
- Compared Random Forest and MLP models using an 80/20 train-test split and GridSearchCV with 5-fold cross-validation.
- Random Forest champion model: 94.91% accuracy, 95% precision, 94% recall.
- MLP comparison model: 91.42% accuracy.
- Used MLflow to track training runs and log 9 performance metrics per run.
- Deployed the champion model on AWS EC2 with a Streamlit frontend and Flask backend.

### AegisGrid -- Drone Swarm Threat Prioritization

- Built during ConHacks 2026 in a 48-hour hackathon.
- Used DBSCAN spatial clustering to classify and rank multi-source aerial threats by severity and proximity.
- Built a FastAPI backend for threat processing and real-time scoring.
- Built a React/TypeScript frontend for live tactical visualization and decision support.
- Deployed the frontend on Vercel.

### MediTwin -- AI Health Companion

- Built a Next.js + Flask AI health companion for medication safety analysis.
- Analyzes medication against user health context: chronic conditions, allergies, and current medications.
- Fetches official FDA drug label data through OpenFDA, including warnings, adverse reactions, interactions, and usage.
- Passes FDA data and health context into Gemini 1.5 Flash with strict JSON output across five analysis dimensions.
- Built regex-based JSON fallback parsing for response resilience.
- Structured frontend across landing, health profile, medication inquiry, and results pages.

### DineEase -- Restaurant Ordering System

- Built a C# Windows Forms restaurant ordering application with Guna UI.
- Supported Customer, Waiter, and Chef workflows through role-based login routing.
- Designed FoodItem and Order classes.
- Implemented JSON serialization for per-table persistent order storage.
- Supported real-time menu lookups across 5 concurrent table sessions.

### MediNet+ -- Hospital Management System

- Built a C# Windows Forms hospital management system with SQL Server and SimpleTCP.
- Covered patient registration, appointment scheduling, prescription management, billing, ward management, and employee records.
- Supported Admin, Doctor, and Nurse roles through a dedicated TCP server.
- Designed a SQL Server data access layer using parameterized queries.
- Built real-time multi-role server dashboards and PDF report generation.
- Wrote 85+ MSTest methods across unit, integration, and system testing tiers.

### Student Dropout Risk Analysis

- Analyzed 4,400+ student records across UCI Student Dropout and OULAD datasets.
- Integrated academic, demographic, and socioeconomic variables.
- Applied IQR-based statistical outlier detection and visual boxplot analysis across 6 continuous features.
- Determined outliers represented genuine real-world variation and should be retained.
- Identified first-semester GPA as the dominant dropout predictor.
- Found admission grades, age, GDP, and unemployment rate to be weak predictors.
- Translated findings into recommendations for early-semester risk flagging, targeted intervention triggers, and evidence-based resource allocation.

### TelemetryDownloader -- TCP Client-Server File Transfer

- Built a C++ Winsock TCP client-server telemetry transfer system.
- Designed a custom 7-type binary packet protocol: HELLO, VERIFY, GET_STATUS, DATA, ACK, ERROR.
- Implemented Stop-and-Wait ACK for reliable 1 MB file delivery.
- Built a 5-state server lifecycle state machine.
- Added malformed packet rejection, out-of-order command blocking, and RAII resource cleanup.
- Achieved 32 passing tests and 134+ assertions across unit, integration, and byte-exact end-to-end system testing.

### Open Education Technology Work

- Developed accessible HTML/CSS templates for Pressbooks, H5P Studio, and WordPress-based open courses.
- Supported 1,000+ students across Business, Health Sciences, and Community Services programs.
- Designed and published 5+ open textbooks and interactive H5P learning objects.
- Increased student engagement by 20% through interactive activity integration.
- Automated repetitive workflows using Power Automate.
- Maintained GitHub repositories and contributed to H5P/Pressbooks open-source communities.
- Conducted WCAG accessibility testing, APA 7th proofreading, and SharePoint document library management.

### Olive Branch Mentorship

- Designed and implemented React/Node.js web features.
- Diagnosed and resolved front-end and back-end issues.
- Integrated 5+ third-party APIs.
- Optimized backend architecture for data synchronization and lower user-facing response time.
- Contributed mobile UI/UX features and multi-device compatibility testing.

### Leadership, Mentorship, and Community

- IT Club President: roadmap for workshops, Build Nights, hackathons, and mentorship programs for 100+ students.
- HackTheBrain Director, Student Success Team: participant operations for a 250+ attendee AI hackathon.
- AI Build Lab Organizing Team Member and Area Leader: logistics for 100+ participants and support for a Replit build challenge.
- GDG Waterloo Subcommittee Member: technical workshops, registration, venue setup, and attendee flow.
- Student Experience Mentor: supported an incoming international student with cultural adjustment, networking, resume, LinkedIn, and job readiness.
- Student Ambassador: engaged 300+ students, organized 10+ campus initiatives, grew volunteer involvement by 30%, and maintained a 95% student satisfaction rate.
- Home Depot Associate Trainer: trained 10+ associates on forklifts, reach trucks, and electric pallet jacks while maintaining a 100% safety record.

### Awards, Certifications, and Memberships

- Narhari Sharma Memorial Award, Conestoga College, Apr 2026: academic excellence, leadership, and sustained commitment to helping others succeed.
- Helena Webb Mentorship Program, selected mentee, Jan-Apr 2026.
- AI Agents: Intensive Vibe Coding, Google & Kaggle.
- Java SE, Oracle.
- OOP Using C++, Infosys.
- CIPS Ontario Member.
