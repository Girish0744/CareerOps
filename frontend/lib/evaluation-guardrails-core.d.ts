import type { EvaluationForGuardrails, EvaluationGuardrail } from './evaluation-guardrails';

export function applyEvaluationGuardrails<T extends EvaluationForGuardrails>(
  evaluation: T,
  jobDescription: string,
  candidateContext: string,
): T & {
  originalScore: number;
  guardrails: EvaluationGuardrail[];
  adjustedByGuardrails: boolean;
};
