const CATEGORY_LIMITS = {
  experienceMatch: 30,
  skillsMatch: 25,
  roleLevelMatch: 15,
  locationMatch: 10,
  industryMatch: 10,
  growthPotential: 10,
  riskFactors: 10,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCategory(value, max) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return clamp(Math.round(value), 0, max);
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fitLevelForScore(score) {
  if (score >= 85) return 'Strong Apply';
  if (score >= 70) return 'Apply';
  if (score >= 50) return 'Maybe';
  return 'Skip';
}

function maxRequiredYears(text, patterns) {
  let max = 0;
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const years = Number(match[1]);
      if (!Number.isNaN(years)) max = Math.max(max, years);
    }
  }
  return max;
}

function hasEarlyCareerSignal(candidateContext) {
  return /graduating\s+august\s+2026|full-time\s+roles?\s+from\s+august\s+2026|entry-to-intermediate|open_to_internships|co-?op\/internship/i
    .test(candidateContext);
}

function hasProfessionalEmbeddedSignal(candidateContext) {
  return /embedded\s+(software\s+)?(engineer|developer)|professional\s+embedded|production\s+embedded|work(ed|ing)?\s+.*embedded/i
    .test(candidateContext);
}

function hasSeniorOnlySignal(jobDescription) {
  return /\b(senior|staff|principal|architect|lead)\b/i.test(jobDescription);
}

function hasUsOnlyLocationSignal(jobDescription) {
  return /\b(us only|u\.s\. only|united states only|remote[, ]+us|remote[, ]+u\.s\.|remote within the united states|must be located in the united states)\b/i
    .test(jobDescription)
    && !/\bcanada|ontario|toronto|waterloo|kitchener|cambridge\b/i.test(jobDescription);
}

function countIndustrialStackGaps(jobDescription, candidateContext) {
  const checks = [
    { jd: /\bscada\b/i, candidate: /\bscada\b/i },
    { jd: /\bmes\b|manufacturing execution systems?/i, candidate: /\bmes\b|manufacturing execution systems?/i },
    { jd: /\bcan\b.*\blin\b|packet traces?/i, candidate: /\bcan\b.*\blin\b|packet traces?/i },
    { jd: /automotive software standards?|automotive .*build processes?/i, candidate: /automotive software standards?|automotive .*build processes?/i },
  ];

  return checks.reduce((count, check) => (
    check.jd.test(jobDescription) && !check.candidate.test(candidateContext) ? count + 1 : count
  ), 0);
}

function categoryScore(categories) {
  const experienceMatch = normalizeCategory(categories.experienceMatch, CATEGORY_LIMITS.experienceMatch);
  const skillsMatch = normalizeCategory(categories.skillsMatch, CATEGORY_LIMITS.skillsMatch);
  const roleLevelMatch = normalizeCategory(categories.roleLevelMatch, CATEGORY_LIMITS.roleLevelMatch);
  const locationMatch = normalizeCategory(categories.locationMatch, CATEGORY_LIMITS.locationMatch);
  const industryMatch = normalizeCategory(categories.industryMatch, CATEGORY_LIMITS.industryMatch);
  const growthPotential = normalizeCategory(categories.growthPotential, CATEGORY_LIMITS.growthPotential);
  const riskFactors = normalizeCategory(categories.riskFactors, CATEGORY_LIMITS.riskFactors);

  return clamp(
    experienceMatch + skillsMatch + roleLevelMatch + locationMatch + industryMatch + growthPotential - riskFactors,
    0,
    100,
  );
}

export function applyEvaluationGuardrails(evaluation, jobDescription, candidateContext) {
  const guardrails = [];
  const lowerJd = jobDescription.toLowerCase();
  const earlyCareer = hasEarlyCareerSignal(candidateContext);
  const hasProfessionalEmbedded = hasProfessionalEmbeddedSignal(candidateContext);

  const professionalYears = maxRequiredYears(lowerJd, [
    /(\d+)\+?\s+years?[^.\n;]{0,120}professional software engineering/gi,
    /(\d+)\+?\s+years?[^.\n;]{0,120}production systems/gi,
    /(\d+)\+?\s+years?[^.\n;]{0,120}software development life cycle/gi,
  ]);

  const embeddedYears = maxRequiredYears(lowerJd, [
    /(?:minimum|at least|required|requires)?[^.\n;]{0,40}(\d+)\+?\s+years?[^.\n;]{0,120}embedded software/gi,
    /(\d+)\+?\s+years?[^.\n;]{0,120}embedded development/gi,
    /(\d+)\+?\s+years?[^.\n;]{0,120}c\/c\+\+[^.\n;]{0,80}embedded/gi,
  ]);

  if (earlyCareer && professionalYears >= 4) {
    guardrails.push({
      code: 'required-professional-years',
      label: `${professionalYears}+ years professional software experience required`,
      reason: 'Candidate is still completing the BCS program and is targeting entry-to-intermediate roles.',
      cap: 69,
      riskMinimum: 7,
    });
  }

  if (earlyCareer && professionalYears >= 6 && hasSeniorOnlySignal(jobDescription)) {
    guardrails.push({
      code: 'senior-only-role-level',
      label: 'Senior/staff/principal role level required',
      reason: 'Candidate is targeting entry-to-intermediate roles, so senior-only postings should not pass as high-confidence applications.',
      cap: 55,
      riskMinimum: 9,
    });
  }

  if (embeddedYears >= 2 && !hasProfessionalEmbedded) {
    guardrails.push({
      code: 'required-embedded-years',
      label: `${embeddedYears}+ years embedded software experience required`,
      reason: 'Candidate has relevant C/C++ and IoT project exposure, but not professional embedded software experience.',
      cap: 69,
      riskMinimum: 6,
    });
  }

  const industrialGapCount = countIndustrialStackGaps(jobDescription, candidateContext);
  if (industrialGapCount >= 2) {
    guardrails.push({
      code: 'industrial-automation-stack-gap',
      label: 'Industrial automation stack has multiple missing requirements',
      reason: 'The JD asks for items such as SCADA/MES, CAN/LIN traces, or automotive software standards that are not in the candidate profile.',
      cap: 74,
      riskMinimum: 4,
    });
  }

  if (earlyCareer && professionalYears >= 5 && embeddedYears >= 3 && !hasProfessionalEmbedded) {
    guardrails.push({
      code: 'combined-seniority-embedded-cap',
      label: 'Hard cap: seniority plus embedded requirements',
      reason: 'A required 5+ years professional software background plus 3+ years embedded development is a major mismatch for this search stage.',
      cap: 62,
      riskMinimum: 10,
    });
  }

  if (hasUsOnlyLocationSignal(jobDescription)) {
    guardrails.push({
      code: 'us-only-location',
      label: 'US-only location requirement',
      reason: 'Candidate is currently targeting Canada/Ontario and is not pursuing US-only roles.',
      cap: 49,
      riskMinimum: 8,
    });
  }

  const categories = {
    experienceMatch: normalizeCategory(evaluation.categories?.experienceMatch, CATEGORY_LIMITS.experienceMatch),
    skillsMatch: normalizeCategory(evaluation.categories?.skillsMatch, CATEGORY_LIMITS.skillsMatch),
    roleLevelMatch: normalizeCategory(evaluation.categories?.roleLevelMatch, CATEGORY_LIMITS.roleLevelMatch),
    locationMatch: normalizeCategory(evaluation.categories?.locationMatch, CATEGORY_LIMITS.locationMatch),
    industryMatch: normalizeCategory(evaluation.categories?.industryMatch, CATEGORY_LIMITS.industryMatch),
    growthPotential: normalizeCategory(evaluation.categories?.growthPotential, CATEGORY_LIMITS.growthPotential),
    riskFactors: normalizeCategory(evaluation.categories?.riskFactors, CATEGORY_LIMITS.riskFactors),
  };

  for (const guardrail of guardrails) {
    categories.riskFactors = Math.max(categories.riskFactors ?? 0, guardrail.riskMinimum);
  }

  if (guardrails.some(g => g.code === 'required-professional-years')) {
    categories.experienceMatch = Math.min(categories.experienceMatch ?? 0, 18);
  }
  if (guardrails.some(g => g.code === 'required-embedded-years')) {
    categories.skillsMatch = Math.min(categories.skillsMatch ?? 0, 20);
  }
  if (guardrails.some(g => g.code === 'combined-seniority-embedded-cap')) {
    categories.roleLevelMatch = Math.min(categories.roleLevelMatch ?? 0, 10);
  }
  if (guardrails.some(g => g.code === 'senior-only-role-level')) {
    categories.roleLevelMatch = Math.min(categories.roleLevelMatch ?? 0, 6);
  }
  if (guardrails.some(g => g.code === 'us-only-location')) {
    categories.locationMatch = Math.min(categories.locationMatch ?? 0, 2);
  }

  const categoryBasedScore = categoryScore(categories);
  const cap = guardrails.length ? Math.min(...guardrails.map(g => g.cap)) : 100;
  const originalScore = clamp(Math.round(evaluation.score), 0, 100);
  const adjustedScore = clamp(Math.min(originalScore, categoryBasedScore, cap), 0, 100);
  const adjustedByGuardrails = adjustedScore !== originalScore || guardrails.length > 0;
  const fitLevel = fitLevelForScore(adjustedScore);
  const guardrailGaps = guardrails.map(g => `${g.label}: ${g.reason}`);

  const summary = adjustedByGuardrails && guardrails.length
    ? `${evaluation.summary} Score guardrail applied because ${guardrails.map(g => g.label.toLowerCase()).join('; ')}.`
    : evaluation.summary;

  return {
    ...evaluation,
    score: adjustedScore,
    fitLevel,
    recommendation: fitLevel,
    summary,
    categories,
    gaps: uniqueStrings([...evaluation.gaps, ...guardrailGaps]),
    missingKeywords: uniqueStrings([
      ...evaluation.missingKeywords,
      ...guardrails.map(g => g.label),
    ]),
    originalScore,
    guardrails,
    adjustedByGuardrails,
  };
}
