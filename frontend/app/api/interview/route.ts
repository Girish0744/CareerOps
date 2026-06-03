import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getApplication, saveInterviewPrep } from '@/lib/filesystem';
import fs from 'fs';
import path from 'path';
import { apiErrorMessage } from '@/lib/errors';
import { generateGeminiContent } from '@/lib/ai-config';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

interface InterviewRequest {
  applicationId: string;
  linkedinUrl?: string;
}

export async function POST(req: Request) {
  try {
  const body = await req.json() as InterviewRequest;
  const { applicationId, linkedinUrl } = body;

  const app = getApplication(applicationId);
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  // Read story bank if it exists
  const storyBankPath = path.resolve(process.cwd(), '..', 'interview-prep', 'story-bank.md');
  const storyBank = fs.existsSync(storyBankPath)
    ? fs.readFileSync(storyBankPath, 'utf-8')
    : 'No story bank found.';

  const linkedinSection = linkedinUrl
    ? `\n\nINTERVIEWER LINKEDIN: ${linkedinUrl}\nAnalyze this profile and add a section "## Interviewer-Specific Questions" with 5-8 questions tailored to what this specific person would likely ask based on their background, role, and experience.`
    : '';

  const prompt = `Generate a complete, personalized interview preparation guide for this application.

COMPANY: ${app.company}
ROLE: ${app.jobTitle}
LOCATION: ${app.location ?? 'Not specified'}

--- JOB DESCRIPTION ---
${app.jobDescription ?? 'Not available'}

--- RESUME USED FOR THIS APPLICATION ---
${app.resumeMd ?? 'Not available'}

--- COVER LETTER SENT ---
${app.coverLetterMd ?? 'Not available'}

--- SCORE & GAPS ---
Score: ${app.score ?? 'N/A'}/100
Fit Level: ${app.fitLevel ?? 'N/A'}
Matched Keywords: ${app.scoreData?.matchedKeywords?.join(', ') ?? 'N/A'}
Gaps: ${app.scoreData?.missingKeywords?.join(', ') ?? 'None noted'}

--- EXISTING STORY BANK ---
${storyBank}
${linkedinSection}

Generate the guide in this exact format:

# Interview Preparation: ${app.jobTitle} at ${app.company}

**Date:** ${new Date().toISOString().split('T')[0]}
**Application folder:** ${app.applicationFolder}

## 1. Company Overview
Brief summary of what ${app.company} does and why this role exists.

## 2. Why This Role Fits Me
3-4 bullet points connecting the resume to the JD — written in first person, ready to say out loud.

## 3. Resume Version Used
Reference which resume was used and its key positioning for this role.

## 4. Key Skills to Revise
3-5 topics from the JD I should brush up on before the interview.

## 5. Likely Interview Questions (from JD analysis)
10-15 questions likely based on the job description. Mark each as [Technical], [Behavioural], or [Situational].

## 6. STAR Stories Mapped to This Role
Map 5-6 existing or new STAR+R stories to likely questions. Format:
| JD Requirement | Story | S | T | A | R | Reflection |
|---|---|---|---|---|---|---|

## 7. Technical Topics to Prepare
Specific technical areas from the JD with preparation tips.

## 8. Questions I Can Ask the Interviewer
5 strong, specific questions to ask — not generic.

## 9. 30-Second Introduction
A tight, confident introduction ready to deliver: who I am, what I bring, why I'm here.

## 10. Gaps to Address
How to handle the gaps identified in the score — honest, confident framing.

Be specific. Reference real details from the resume and job description. Do not be generic.`;

  const { result } = await generateGeminiContent(ai, 'interview', {
    contents: prompt,
    config: {
      maxOutputTokens: 12000,
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const content = result.text ?? '';
  if (!content.trim()) throw new Error('Gemini returned an empty interview guide.');
  const savedPath = saveInterviewPrep(applicationId, content);

  return NextResponse.json({ success: true, path: savedPath, content });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
