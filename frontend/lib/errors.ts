export function apiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (
    raw.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
    raw.includes('invalid authentication credentials') ||
    raw.includes('UNAUTHENTICATED') ||
    raw.includes('API key not valid')
  ) {
    return 'Gemini authentication failed. Check frontend/.env.local and set GEMINI_API_KEY to a Google AI Studio API key, usually starting with AIza. Restart npm run dev after changing it.';
  }

  if (raw.includes('GEMINI_API_KEY')) {
    return 'GEMINI_API_KEY is missing. Add it to frontend/.env.local, then restart npm run dev.';
  }

  return raw || 'Unknown error';
}
