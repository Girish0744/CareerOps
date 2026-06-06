export const ALL_STATUSES = [
  'Saved',
  'Evaluated',
  'Resume Generated',
  'Cover Letter Generated',
  'Ready to Apply',
  'Applied',
  'In Progress',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Responded',
  'Discarded',
  'SKIP',
] as const;

export type ApplicationStatus = typeof ALL_STATUSES[number];

export function isValidStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && (ALL_STATUSES as readonly string[]).includes(value);
}
