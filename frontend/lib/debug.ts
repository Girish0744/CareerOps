/**
 * debug.ts — opt-in verbose logging.
 *
 * Content-bearing logs (raw model output, job descriptions, profile-derived
 * text) must never print by default. They only appear when CAREER_OPS_DEBUG is
 * explicitly enabled, keeping PII and model output out of normal server logs.
 */

const DEBUG_ENABLED =
  process.env.CAREER_OPS_DEBUG === '1' || process.env.CAREER_OPS_DEBUG === 'true';

export function debugLog(...args: unknown[]): void {
  if (DEBUG_ENABLED) console.log(...args);
}
