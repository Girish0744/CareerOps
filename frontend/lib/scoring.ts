export function fitLevelForScore(score: number): string {
  if (score >= 85) return 'Strong Apply';
  if (score >= 70) return 'Apply';
  if (score >= 50) return 'Maybe';
  return 'Skip';
}

export function scoreTone(score: number): 'emerald' | 'blue' | 'amber' | 'red' {
  if (score >= 85) return 'emerald';
  if (score >= 70) return 'blue';
  if (score >= 50) return 'amber';
  return 'red';
}
