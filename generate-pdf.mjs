#!/usr/bin/env node

/**
 * generate-pdf.mjs — HTML → PDF via Playwright
 *
 * Usage:
 *   node career-ops/generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4]
 *
 * Requires: @playwright/test (or playwright) installed.
 * Uses Chromium headless to render the HTML and produce a clean, ATS-parseable PDF.
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { readFile } from 'fs/promises';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure output directory exists (fresh setup)
mkdirSync(resolve(__dirname, 'output'), { recursive: true });

/**
 * Normalize text for ATS compatibility by converting problematic Unicode.
 *
 * ATS parsers and legacy systems often fail on em-dashes, smart quotes,
 * zero-width characters, and non-breaking spaces. These cause mojibake,
 * parsing errors, or display issues. See issue #1.
 *
 * Only touches body text — preserves CSS, JS, tag attributes, and URLs.
 * Returns { html, replacements } so the caller can log what was changed.
 */
function normalizeTextForATS(html) {
  const replacements = {};
  const bump = (key, n) => { replacements[key] = (replacements[key] || 0) + n; };

  const masks = [];
  const masked = html.replace(
    /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (match) => {
      const token = `\u0000MASK${masks.length}\u0000`;
      masks.push(match);
      return token;
    }
  );

  let out = '';
  let i = 0;
  while (i < masked.length) {
    const lt = masked.indexOf('<', i);
    if (lt === -1) { out += sanitizeText(masked.slice(i)); break; }
    out += sanitizeText(masked.slice(i, lt));
    const gt = masked.indexOf('>', lt);
    if (gt === -1) { out += masked.slice(lt); break; }
    out += masked.slice(lt, gt + 1);
    i = gt + 1;
  }

  const restored = out.replace(/\u0000MASK(\d+)\u0000/g, (_, n) => masks[Number(n)]);
  return { html: restored, replacements };

  function sanitizeText(text) {
    if (!text) return text;
    let t = text;
    t = t.replace(/\u2014/g, () => { bump('em-dash', 1); return '-'; });
    t = t.replace(/\u2013/g, () => { bump('en-dash', 1); return '-'; });
    t = t.replace(/[\u201C\u201D\u201E\u201F]/g, () => { bump('smart-double-quote', 1); return '"'; });
    t = t.replace(/[\u2018\u2019\u201A\u201B]/g, () => { bump('smart-single-quote', 1); return "'"; });
    t = t.replace(/\u2026/g, () => { bump('ellipsis', 1); return '...'; });
    t = t.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, () => { bump('zero-width', 1); return ''; });
    t = t.replace(/\u00A0/g, () => { bump('nbsp', 1); return ' '; });
    return t;
  }
}

/**
 * Strip active content from HTML before rendering (SEC-06).
 *
 * The resume/cover-letter HTML is partly model-generated, so remove <script>
 * blocks, inline event-handler attributes (on*), and javascript: URLs before
 * Chromium renders it. The locked templates contain no scripts or handlers, so
 * this is a no-op for them and only neutralizes anything an injected job
 * description could have coaxed the model into emitting. CSS/<style> is kept.
 */
function stripActiveContent(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2');
}

async function generatePDF() {
  const args = process.argv.slice(2);

  // Parse arguments
  let inputPath, outputPath, format = 'a4';

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      format = arg.split('=')[1].toLowerCase();
    } else if (!inputPath) {
      inputPath = arg;
    } else if (!outputPath) {
      outputPath = arg;
    }
  }

  if (!inputPath || !outputPath) {
    console.error('Usage: node generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4]');
    process.exit(1);
  }

  inputPath = resolve(inputPath);
  outputPath = resolve(outputPath);

  // Validate format
  const validFormats = ['a4', 'letter'];
  if (!validFormats.includes(format)) {
    console.error(`Invalid format "${format}". Use: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  console.log(`📄 Input:  ${inputPath}`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`📏 Format: ${format.toUpperCase()}`);

  // Read HTML to inject font paths as absolute file:// URLs
  let html = await readFile(inputPath, 'utf-8');

  // Remove any active content (scripts / inline handlers) before rendering (SEC-06)
  html = stripActiveContent(html);

  // Resolve font paths relative to career-ops/fonts/
  const fontsDir = resolve(__dirname, 'fonts');
  html = html.replace(
    /url\(['"]?\.\/fonts\//g,
    `url('file://${fontsDir}/`
  );
  // Close any unclosed quotes from the replacement (handles all font formats)
  html = html.replace(
    /file:\/\/([^'")]+)\.(woff2?|ttf|otf)['"]?\)/g,
    `file://$1.$2')`
  );

  // Normalize text for ATS compatibility (issue #1)
  const normalized = normalizeTextForATS(html);
  html = normalized.html;
  const totalReplacements = Object.values(normalized.replacements).reduce((a, b) => a + b, 0);
  if (totalReplacements > 0) {
    const breakdown = Object.entries(normalized.replacements).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`🧹 ATS normalization: ${totalReplacements} replacements (${breakdown})`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();

    // Set content with file base URL for any relative resources
    await page.setContent(html, {
      waitUntil: 'networkidle',
      baseURL: `file://${dirname(inputPath)}/`,
    });

    // Wait for fonts to load
    await page.evaluate(() => document.fonts.ready);

    // Measure page fill so callers can expand/trim content to fit.
    // The resume template's screen CSS mirrors its @page margins exactly
    // (same width + padding, border-box), so screen-media heights match the
    // print layout. `.page-two` is the template's forced page break.
    try {
      const fill = await page.evaluate((pageHeightIn) => {
        const PX_PER_IN = 96;
        const toPx = (value) => {
          const n = parseFloat(value) || 0;
          if (/in\s*$/.test(value)) return n * PX_PER_IN;
          if (/cm\s*$/.test(value)) return n * PX_PER_IN / 2.54;
          if (/mm\s*$/.test(value)) return n * PX_PER_IN / 25.4;
          if (/pt\s*$/.test(value)) return n * PX_PER_IN / 72;
          return n; // px or unitless
        };
        let marginTop = 0, marginBottom = 0;
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule instanceof CSSPageRule) {
                if (rule.style.marginTop) marginTop = toPx(rule.style.marginTop);
                if (rule.style.marginBottom) marginBottom = toPx(rule.style.marginBottom);
              }
            }
          } catch { /* cross-origin sheet — skip */ }
        }
        const usable = pageHeightIn * PX_PER_IN - marginTop - marginBottom;
        if (!(usable > 0)) return null;
        const body = document.body;
        const style = getComputedStyle(body);
        const padTop = parseFloat(style.paddingTop) || 0;
        const padBottom = parseFloat(style.paddingBottom) || 0;
        const round = (n) => Math.round(n * 1000) / 1000;
        const pageTwo = document.querySelector('.page-two');
        if (pageTwo) {
          const bodyTop = body.getBoundingClientRect().top;
          const page1Px = pageTwo.getBoundingClientRect().top - bodyTop - padTop;
          const page2Px = pageTwo.scrollHeight;
          return { page1: round(page1Px / usable), page2: round(page2Px / usable) };
        }
        const contentPx = body.scrollHeight - padTop - padBottom;
        return { content: round(contentPx / usable) };
      }, format === 'letter' ? 11 : 11.69);
      if (fill) console.log(`📐 Fill: ${JSON.stringify(fill)}`);
    } catch (fillErr) {
      console.log(`📐 Fill: unavailable (${fillErr.message})`);
    }

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: format,
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
      preferCSSPageSize: true,
    });

    // Write PDF. On Windows the destination is often transiently locked by
    // OneDrive sync or held open by a PDF viewer (Acrobat/Edge), which throws
    // EBUSY/EPERM/EACCES. Retry with backoff so a sync collision self-heals;
    // a viewer holding the file persistently still fails, with a clear hint.
    const { writeFile } = await import('fs/promises');
    const lockCodes = new Set(['EBUSY', 'EPERM', 'EACCES']);
    const attempts = 6;
    for (let i = 0; ; i++) {
      try {
        await writeFile(outputPath, pdfBuffer);
        break;
      } catch (err) {
        if (!lockCodes.has(err.code) || i >= attempts - 1) {
          if (lockCodes.has(err.code)) {
            err.message += ` — the file is locked. Close "${outputPath}" in any PDF viewer (e.g. Adobe Acrobat) and let OneDrive finish syncing, then try again.`;
          }
          throw err;
        }
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }

    // Count pages (approximate from PDF structure)
    const pdfString = pdfBuffer.toString('latin1');
    const pageCount = (pdfString.match(/\/Type\s*\/Page[^s]/g) || []).length;

    console.log(`✅ PDF generated: ${outputPath}`);
    console.log(`📊 Pages: ${pageCount}`);
    console.log(`📦 Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    return { outputPath, pageCount, size: pdfBuffer.length };
  } finally {
    await browser.close();
  }
}

generatePDF().catch((err) => {
  console.error('❌ PDF generation failed:', err.message);
  process.exit(1);
});
