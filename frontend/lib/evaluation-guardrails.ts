import { applyEvaluationGuardrails as applyCoreGuardrails } from './evaluation-guardrails-core.mjs';

export interface ScoreCategories {
  experienceMatch?: number | null;
  skillsMatch?: number | null;
  roleLevelMatch?: number | null;
  locationMatch?: number | null;
  industryMatch?: number | null;
  growthPotential?: number | null;
  riskFactors?: number | null;
}

export interface EvaluationGuardrail {
  code: string;
  label: string;
  reason: string;
  cap: number;
  riskMinimum: number;
}

export interface EvaluationForGuardrails {
  score: number;
  fitLevel: string;
  recommendation: string;
  summary: string;
  gaps: string[];
  categories: ScoreCategories;
  missingKeywords: string[];
}

export function applyEvaluationGuardrails<T extends EvaluationForGuardrails>(
  evaluation: T,
  jobDescription: string,
  candidateContext: string,
): T & {
  originalScore: number;
  guardrails: EvaluationGuardrail[];
  adjustedByGuardrails: boolean;
} {
  return applyCoreGuardrails(evaluation, jobDescription, candidateContext);
}
