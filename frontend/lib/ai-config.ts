export type GeminiTask = 'evaluate' | 'generateDocs' | 'chat' | 'interview';

const DEFAULT_MODELS: Record<GeminiTask, string> = {
  evaluate: 'gemini-2.5-flash',
  generateDocs: 'gemini-2.5-flash',
  chat: 'gemini-2.5-flash',
  interview: 'gemini-2.5-flash',
};

const TASK_ENV_KEYS: Record<GeminiTask, { primary: string; fallbacks: string }> = {
  evaluate: { primary: 'GEMINI_EVALUATE_MODEL', fallbacks: 'GEMINI_EVALUATE_FALLBACK_MODELS' },
  generateDocs: { primary: 'GEMINI_DOCS_MODEL', fallbacks: 'GEMINI_DOCS_FALLBACK_MODELS' },
  chat: { primary: 'GEMINI_CHAT_MODEL', fallbacks: 'GEMINI_CHAT_FALLBACK_MODELS' },
  interview: { primary: 'GEMINI_INTERVIEW_MODEL', fallbacks: 'GEMINI_INTERVIEW_FALLBACK_MODELS' },
};

function envValue(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function parseModelList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(model => model.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function isRetryableModelError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /429|quota|rate limit|resource_exhausted|too many requests|not found|unsupported|invalid model/i.test(text);
}

export function geminiModelsForTask(task: GeminiTask): string[] {
  const keys = TASK_ENV_KEYS[task];
  return unique([
    envValue(keys.primary) ?? envValue('GEMINI_MODEL') ?? DEFAULT_MODELS[task],
    ...parseModelList(envValue(keys.fallbacks)),
    ...parseModelList(envValue('GEMINI_FALLBACK_MODELS')),
  ]);
}

export async function generateGeminiContent<TRequest extends Record<string, unknown>, TResult>(
  ai: { models: { generateContent: (request: TRequest & { model: string }) => Promise<TResult> } },
  task: GeminiTask,
  request: TRequest,
): Promise<{ result: TResult; modelUsed: string }> {
  const models = geminiModelsForTask(task);
  let lastError: unknown;

  for (const model of models) {
    try {
      const result = await ai.models.generateContent({ ...request, model });
      console.log(`[gemini] ${task} used ${model}`);
      return { result, modelUsed: model };
    } catch (err) {
      lastError = err;
      if (!isRetryableModelError(err) || model === models[models.length - 1]) {
        throw err;
      }
      console.warn(`[gemini] ${task} failed on ${model}; trying next configured model.`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini request failed.');
}
