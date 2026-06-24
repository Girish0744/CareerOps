import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getApplication } from '@/lib/filesystem';
import { saveDocumentEdit } from '@/lib/filesystem';
import { apiErrorMessage } from '@/lib/errors';
import { generateGeminiContent } from '@/lib/ai-config';
import { refreshDocumentPdfIfStale } from '@/lib/document-renderer';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
export const maxDuration = 120;

interface ChatRequest {
  applicationId: string;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function POST(req: Request) {
  try {
  const body = await req.json() as ChatRequest;
  const { applicationId, message, history } = body;

  const app = getApplication(applicationId);
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const systemPrompt = `You are a career assistant helping with the job application for:

Company: ${app.company}
Role: ${app.jobTitle}
Location: ${app.location ?? 'Not specified'}
Score: ${app.score ?? 'N/A'}/100 (${app.fitLevel ?? 'N/A'})

--- JOB DESCRIPTION ---
${app.jobDescription ?? 'Not available'}

--- TAILORED RESUME (resume.md) ---
${app.resumeMd ?? 'Not generated yet'}

--- COVER LETTER (cover-letter.md) ---
${app.coverLetterMd ?? 'Not generated yet'}

--- NOTES ---
${app.notesMd ?? ''}

Your job:
1. Help edit the resume or cover letter when asked. Make ONLY the requested change. Do not rewrite the whole document unless explicitly asked.
2. Answer questions about this application, the company, or interview prep.
3. Never invent experience not in the resume. Never edit the master profile (cv.md).
4. When you make an edit to resume.md or cover-letter.md, return the FULL updated file content wrapped like this:
   ===RESUME_UPDATE===
   {full updated resume.md content}
   ===END_RESUME_UPDATE===
   or
   ===COVERLETTER_UPDATE===
   {full updated cover-letter.md content}
   ===END_COVERLETTER_UPDATE===
5. Keep responses concise. Lead with what changed, then show the changed section.`;

  const contents = [
    ...history.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const { result } = await generateGeminiContent(ai, 'chat', {
    contents,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 8192,
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = result.text ?? '';
  if (!text.trim()) throw new Error('Gemini returned an empty chat response.');

  // Auto-apply document edits if Claude returned an update block
  let appliedEdit: string | null = null;

  const resumeMatch = text.match(/===RESUME_UPDATE===\n([\s\S]*?)\n===END_RESUME_UPDATE===/);
  if (resumeMatch) {
    saveDocumentEdit(applicationId, 'resume.md', resumeMatch[1]);
    await refreshDocumentPdfIfStale(applicationId, 'resume');
    appliedEdit = 'resume.md';
  }

  const clMatch = text.match(/===COVERLETTER_UPDATE===\n([\s\S]*?)\n===END_COVERLETTER_UPDATE===/);
  if (clMatch) {
    saveDocumentEdit(applicationId, 'cover-letter.md', clMatch[1]);
    await refreshDocumentPdfIfStale(applicationId, 'cover-letter');
    appliedEdit = 'cover-letter.md';
  }

  // Strip the raw update blocks from the reply shown to the user
  const cleanText = text
    .replace(/===RESUME_UPDATE===[\s\S]*?===END_RESUME_UPDATE===/g, '')
    .replace(/===COVERLETTER_UPDATE===[\s\S]*?===END_COVERLETTER_UPDATE===/g, '')
    .trim() || (appliedEdit ? `Updated ${appliedEdit}. The live preview has been refreshed.` : 'Done.');

  return NextResponse.json({ reply: cleanText, appliedEdit });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
