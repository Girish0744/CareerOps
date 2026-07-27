/**
 * Single source of truth for generated PDF filenames.
 *
 * Each application folder holds exactly ONE resume PDF and ONE cover-letter
 * PDF, both named from the profile ("Girish_Bhuteja_Resume.pdf"). Earlier
 * versions rendered to internal resume.pdf/cover-letter.pdf and then copied to
 * the named file; that copy was best-effort, so a PDF viewer holding a Windows
 * lock left the named file silently stale after an edit. Rendering straight to
 * the final name removes both the duplicate and that failure mode.
 *
 * Lives in its own module because both filesystem.ts and document-renderer.ts
 * need it, and document-renderer already imports filesystem.
 */

import fs from 'fs';
import path from 'path';
import { extractApplicantProfile } from './apply-assistant';

export type DocumentType = 'resume' | 'cover-letter';

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');

/** Legacy internal names, still recognised so old folders keep working. */
export const LEGACY_PDF_NAMES: Record<DocumentType, string> = {
  resume: 'resume.pdf',
  'cover-letter': 'cover-letter.pdf',
};

export function pdfFilename(type: DocumentType): string {
  const profilePath = path.join(/*turbopackIgnore: true*/ ROOT, 'config', 'profile.yml');
  const yml = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf-8') : '';
  const profile = extractApplicantProfile(yml);
  const name = profile.fullName || profile.legalName || 'Candidate';
  const safe = name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Candidate';
  return type === 'resume' ? `${safe}_Resume.pdf` : `${safe}_Cover_Letter.pdf`;
}

/**
 * Absolute path to an application's PDF: the named file, or a legacy
 * resume.pdf that predates the rename and has not been migrated yet.
 * Returns the named path when neither exists, so callers can write to it.
 */
export function resolvePdfPath(folderPath: string, type: DocumentType): string {
  const preferred = path.join(folderPath, pdfFilename(type));
  if (fs.existsSync(preferred)) return preferred;
  const legacy = path.join(folderPath, LEGACY_PDF_NAMES[type]);
  return fs.existsSync(legacy) ? legacy : preferred;
}
