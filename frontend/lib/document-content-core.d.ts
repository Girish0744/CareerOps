export interface ProjectCatalogEntry {
  name: string;
  links: Array<{ label: string; url: string }>;
  dateRange: string;
}

export interface ExperienceCatalogEntry {
  title: string;
  company: string;
  dateRange: string;
  note: string;
  minBullets: number;
  maxBullets: number;
}

export interface ExtracurricularCatalogEntry {
  title: string;
  organization: string;
  dateRange: string;
  required: boolean;
}

export interface ResumeReserve {
  experience: Record<string, string[]>;
  projects: Record<string, string[]>;
  extracurricular: Array<{ key: string; bullet: string }>;
  profileSentence?: string;
}

export interface ResumeContent {
  profileSentences: string[];
  highlights: string[];
  skills: Array<{ category: string; items: string[] }>;
  experience: Array<{ key: string; bullets: string[] }>;
  projects: Array<{ key: string; stack: string; bullets: string[] }>;
  educationCoursework: string[];
  extracurricular: Array<{ key: string; bullet: string }>;
  reserve?: ResumeReserve;
}

export type ResumePage = 'page1' | 'page2';

export interface ResumeAnalysis {
  archetype?: string;
  companyDomain?: string;
  topResponsibilities?: string[];
  mustHaveKeywords?: string[];
  niceToHaveKeywords?: string[];
}

export interface ContentIssue {
  code: string;
  severity: 'fix' | 'warn';
  section: string;
  message: string;
}

export interface CoverLetterIssue {
  code: string;
  severity: 'fix' | 'warn';
  message: string;
}

export interface KeywordCoverageEntry {
  keyword: string;
  present: boolean;
  locations: string[];
}

export declare const PROJECT_CATALOG: Record<string, ProjectCatalogEntry>;
export declare const EXPERIENCE_CATALOG: Record<string, ExperienceCatalogEntry>;
export declare const EXTRACURRICULAR_CATALOG: Record<string, ExtracurricularCatalogEntry>;
export declare const EDUCATION_ENTRY: {
  title: string;
  company: string;
  dateRange: string;
  gpaBullet: string;
};
export declare const ALLOWED_COURSEWORK: string[];
export declare const AWARDS: Array<{ name: string; institution: string; date: string; bullet: string }>;
export declare const CERTIFICATIONS_LINE: string;
export declare const RESUME_ARCHETYPES: string[];
export declare const KNOWN_TECH_VOCABULARY: string[];
export declare const BANNED_POWER_VERBS: string[];
export declare const BANNED_RESUME_PHRASES: string[];
export declare const BANNED_PROFILE_PHRASES: string[];
export declare const FABRICATION_TRIPWIRES: string[];
export declare const BANNED_COVER_LETTER_PHRASES: string[];

export declare function normalizeResumeContent(raw: unknown): ResumeContent;
export declare function buildResumeMarkdown(content: ResumeContent, contact?: { name?: string }, length?: ResumeLengthOption): string;
export declare function buildKeywordCoverage(content: ResumeContent, keywords: string[]): KeywordCoverageEntry[];
export declare function countProjectBulletItems(content: ResumeContent): number;
export declare function verifyResumeContent(
  content: ResumeContent,
  analysis?: ResumeAnalysis,
  length?: ResumeLengthOption,
): { issues: ContentIssue[]; keywordCoverage: KeywordCoverageEntry[] };
export declare const ONE_PAGE_BULLET_MAX_CHARS: number;
export declare function trimResumeForOverflow(content: ResumeContent): { content: ResumeContent; action: string | null };
export declare function expandResumeForUnderfill(content: ResumeContent, page: ResumePage): { content: ResumeContent; action: string | null };
export declare const RESUME_FILL_TARGETS: { page1Min: number; page2Min: number };

export type ResumeLengthOption = 'one-page' | 'two-page';
/** page2Min is absent for the one-page budget, so it is optional here. */
export declare const RESUME_BUDGETS: Record<ResumeLengthOption, {
  maxPages: number;
  fillTargets: { page1Min: number; page2Min?: number };
}>;
export declare function applyLengthBudget(content: ResumeContent, length?: ResumeLengthOption): ResumeContent;
export declare function varyLeadingVerbs(content: ResumeContent): { content: ResumeContent; changes: string[] };
export declare function buildCoverLetterChecks(
  letterText: string,
  options?: { email?: string; phone?: string },
): CoverLetterIssue[];
