import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { getApplication } from '@/lib/filesystem';
import { apiErrorMessage } from '@/lib/errors';
import { generateGeminiContent } from '@/lib/ai-config';
import { extractPublicContactLeads, fallbackOutreachDrafts } from '@/lib/contact-intel';

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

interface ContactsRequest {
  linkedinUrls?: string[];
  publicNotes?: string;
}

function contactsPath(applicationFolder: string) {
  return path.join(/*turbopackIgnore: true*/ ROOT, applicationFolder, 'contacts.json');
}

function readContacts(applicationFolder: string) {
  const p = contactsPath(applicationFolder);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

async function generateDrafts(app: NonNullable<ReturnType<typeof getApplication>>, lead: Record<string, unknown>) {
  const fallback = fallbackOutreachDrafts({ lead, app });
  const prompt = `Create human, concise outreach drafts for Girish Bhuteja.

Rules:
- Ground everything in the saved job/application context.
- Do not invent facts about the contact.
- Do not claim Girish has already applied unless the draft says he is applying.
- No robotic phrases, no exaggerated praise, no "I am passionate about".
- LinkedIn connection note must feel warm, specific, and low-pressure. Do not ask for a referral, favor, or interview in the connection note.
- Prefer curiosity + genuine role/team reason + a small human ask.
- Keep LinkedIn connection note under 280 characters.
- Return JSON only with keys: linkedinConnectionNote, linkedinFollowUp, coldEmailSubject, coldEmailBody.

CONTACT:
${JSON.stringify(lead, null, 2)}

APPLICATION:
Company: ${app.company}
Role: ${app.jobTitle}
Location: ${app.location ?? 'Not specified'}
Score: ${app.score ?? 'N/A'}/100 (${app.fitLevel ?? 'N/A'})

JOB DESCRIPTION:
${app.jobDescription ?? ''}

RESUME:
${app.resumeMd ?? 'Not generated yet'}

COVER LETTER:
${app.coverLetterMd ?? 'Not generated yet'}`;

  try {
    const { result } = await generateGeminiContent(ai, 'chat', {
      contents: prompt,
      config: {
        maxOutputTokens: 2048,
        temperature: 0.25,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const text = result.text ?? '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return fallback;
    return { ...fallback, ...JSON.parse(text.slice(start, end + 1)) };
  } catch {
    return fallback;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const app = getApplication(id);
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    return NextResponse.json(readContacts(app.applicationFolder) ?? { contacts: [], generatedAt: null });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const app = getApplication(id);
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    const body = await req.json().catch(() => ({})) as ContactsRequest;
    const contacts = extractPublicContactLeads({
      company: app.company,
      jobTitle: app.jobTitle,
      jobDescription: app.jobDescription ?? '',
      jobUrl: app.jobUrl,
      publicNotes: body.publicNotes ?? '',
      linkedinUrls: body.linkedinUrls ?? [],
    });

    const contactsWithDrafts = [];
    for (const lead of contacts.slice(0, 5)) {
      contactsWithDrafts.push({
        ...lead,
        outreach: await generateDrafts(app, lead),
      });
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      policy: 'Public-source and user-provided contacts only. No automated LinkedIn scraping or automated messaging.',
      contacts: contactsWithDrafts,
    };

    fs.writeFileSync(contactsPath(app.applicationFolder), JSON.stringify(payload, null, 2));
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
