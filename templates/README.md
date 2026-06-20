# Templates

System-layer template files used by career-ops scripts and modes.

Important for Girish's fork: `cv-template.html` is the approved final resume format. Do not change it during normal resume-content, ATS, scoring, cover-letter, or frontend work. Only edit `cv-template.html` when Girish explicitly asks for a resume design/layout change. Content tailoring should happen in prompts, source data, and generated application files, not by changing this locked template.

## Files

| File | Used By | Purpose |
|------|---------|---------|
| `cv-template.html` | `generate-pdf.mjs` | Locked final HTML/CSS format for Girish's ATS-optimized resume PDFs |
| `cv-template.tex` | `generate-latex.mjs` | LaTeX/Overleaf template for ATS-optimized CV PDFs |
| `portals.example.yml` | Onboarding | Example portal scanner configuration (copy to `portals.yml` to activate) |
| `states.yml` | `verify-pipeline.mjs`, `normalize-statuses.mjs`, `merge-tracker.mjs` | Canonical application states and their aliases |

### cv-template.html

The HTML template rendered by Playwright into PDF. Uses placeholder tokens (`{{NAME}}`, `{{SUMMARY_TEXT}}`, `{{EXPERIENCE}}`, etc.) that the PDF pipeline fills at generation time.

**Design:** Girish's final approved two-page resume format. Single-column, ATS-safe, selectable text, self-hosted fonts from `fonts/`, fixed section order, and a structural `page-two` wrapper so Projects starts on page 2.

**Format selection:** There is no runtime theme picker. Every generated resume uses this one template. The document-generation route may tailor the content, but it canonicalizes the final resume HTML back to this template's CSS before `generate-pdf.mjs` renders the PDF.

**Customization:** Locked for this fork. If Girish explicitly asks for a layout redesign, edit this file carefully and then regenerate/test at least one application resume PDF. Otherwise leave it unchanged.

### cv-template.tex

LaTeX template for Overleaf-compatible CV generation. Based on the [sb2nov/resume](https://github.com/sb2nov/resume) format. Uses placeholder tokens (`{{NAME}}`, `{{EXPERIENCE}}`, `{{PROJECTS}}`, etc.) that the LaTeX pipeline fills at generation time.

**Design:** Single-column ATS-safe layout using standard CTAN packages (`fontawesome5`, `enumitem`, `hyperref`, `titlesec`). No custom fonts or external dependencies — uploads directly to Overleaf.

**Usage:**
```bash
# Validate and compile .tex → .pdf (requires pdflatex on PATH)
node generate-latex.mjs output/cv-name-company-date.tex

# Or specify a custom output path
node generate-latex.mjs output/cv-name-company-date.tex output/custom-name.pdf
```

**Prerequisites:** `pdflatex` via [MiKTeX](https://miktex.org/) (Windows) or TeX Live (Linux/macOS). First compilation may auto-install missing LaTeX packages. Alternatively, upload the `.tex` file directly to [Overleaf](https://www.overleaf.com) — no local install needed.

**Customization:** Edit this file to change margins, section order, or formatting commands. The placeholder tokens are documented in `modes/latex.md` under "Template Placeholders."

### portals.example.yml

Pre-configured portal scanner with 45+ tracked companies and search queries. Contains title filters, company career page URLs, Greenhouse API endpoints, and WebSearch queries.

**To activate:** Copy to project root as `portals.yml` and customize `title_filter.positive` keywords for your target roles. Add or remove companies as needed.

### states.yml

Defines canonical application states. Girish's fork treats the frontend workflow states as authoritative (`Saved`, `Evaluated`, `Resume Generated`, `Cover Letter Generated`, `Ready to Apply`, `Applied`, `In Progress`, `Interview`, `Offer`, `Rejected`, `Withdrawn`) while keeping upstream compatibility states (`Responded`, `Discarded`, `SKIP`). All pipeline scripts validate statuses against this file.

**Do not rename states** -- the dashboard and all scripts depend on these exact IDs. You can add aliases if you encounter new variants that should map to an existing state.
