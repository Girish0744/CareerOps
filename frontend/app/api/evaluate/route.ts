import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { createApplication, updateApplicationFields } from '@/lib/filesystem';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const ROOT = path.resolve(process.cwd(), '..');

function readFile(rel: string): string {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchJdFromUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; career-ops/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
  const html = await res.text();
  // Strip HTML tags to get readable text
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 12000); // cap to avoid massive token counts
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { text?: string; url?: string };
    const { text, url } = body;

    if (!text && !url) {
      return NextResponse.json({ error: 'Provide text or url' }, { status: 400 });
    }

    let jdText: string;
    let jobUrl: string | null = null;

    if (url) {
      jobUrl = url;
      jdText = await fetchJdFromUrl(url);
    } else {
      jdText = text!;
    }

    const cv = readFile('cv.md');
    const profile = readFile('config/profile.yml');
    const profileMd = readFile('modes/_profile.md');
    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are a job application evaluator scoring a job description against a specific candidate's profile.

=== CANDIDATE CV ===
${cv}

=== CANDIDATE PROFILE (YAML) ===
${profile}

=== CANDIDATE NARRATIVE & ARCHETYPES ===
${profileMd}

=== INSTRUCTIONS ===
Evaluate the job description the user provides. You must respond with EXACTLY this structure:

===SUMMARY===
Write 2-3 sentences explaining the fit. Be direct and specific — reference actual skills and the actual role.
===END_SUMMARY===

===JSON===
{
  "company": "exact company name from JD",
  "jobTitle": "exact job title from JD",
  "location": "city/remote/hybrid from JD or null",
  "score": 82,
  "fitLevel": "Apply",
  "recommendation": "Apply",
  "summary": "2-3 sentence summary (same as above, single line)",
  "matched": ["top matching skill or experience 1", "matching point 2", "matching point 3"],
  "gaps": ["gap or concern 1", "gap 2", "gap 3"],
  "categories": {
    "experienceMatch": 22,
    "skillsMatch": 16,
    "roleLevelMatch": 12,
    "locationMatch": 8,
    "industryMatch": 8,
    "growthPotential": 8,
    "riskFactors": 4
  },
  "matchedKeywords": ["keyword1", "keyword2"],
  "missingKeywords": ["gap1", "gap2"]
}
===END_JSON===

Score categories add up to 78 max (riskFactors subtracts from a base of 78, min 0 max 5 deduction). Final score = sum of positive categories minus riskFactors deduction.
fitLevel: Strong Apply (85+), Apply (70-84), Maybe (50-69), Skip (<50).
Do not add any text before ===SUMMARY=== or after ===END_JSON===.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Evaluate this job description:\n\n${jdText}`,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const raw = result.text ?? '';

    console.log('[evaluate] raw response (first 500 chars):', raw.slice(0, 500));

    // Extract summary — try custom delimiters, fall back to text before JSON block
    const summaryMatch = raw.match(/===SUMMARY===\s*([\s\S]*?)\s*===END_SUMMARY===/);

    // Extract JSON — try custom delimiters, markdown code block, or raw { } object
    function extractJsonString(text: string): string | null {
      const delim = text.match(/===JSON===\s*([\s\S]*?)\s*===END_JSON===/);
      if (delim) return delim[1].trim();
      const code = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (code) return code[1].trim();
      // Last resort: find the outermost { } block
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end > start) return text.slice(start, end + 1);
      return null;
    }

    const jsonString = extractJsonString(raw);
    if (!jsonString) {
      console.error('[evaluate] could not find JSON in response. Full raw:\n', raw);
      return NextResponse.json({ error: 'Failed to parse evaluation response', debug: raw.slice(0, 300) }, { status: 500 });
    }

    let parsed: {
      company: string; jobTitle: string; location: string | null;
      score: number; fitLevel: string; recommendation: string; summary: string;
      matched: string[]; gaps: string[];
      categories: Record<string, number>;
      matchedKeywords: string[]; missingKeywords: string[];
    };

    try {
      parsed = JSON.parse(jsonString);
    } catch (parseErr) {
      console.error('[evaluate] JSON.parse failed:', parseErr, '\nString was:', jsonString.slice(0, 300));
      return NextResponse.json({ error: 'Malformed JSON in evaluation response', debug: jsonString.slice(0, 300) }, { status: 500 });
    }

    const { company, jobTitle, location, score, fitLevel, recommendation, matched, gaps,
            categories, matchedKeywords, missingKeywords } = parsed;
    const summary = summaryMatch?.[1]?.trim() ?? parsed.summary;

    // Build application ID
    const id = `${slugify(company)}-${slugify(jobTitle)}-${today}`;

    // Create application folder + data/applications.json entry
    createApplication(id, company, jobTitle, location, jobUrl, jdText, today);

    // Write score.json
    const scoreData = {
      overallScore: score, fitLevel, recommendation, summary,
      categories, matchedKeywords, missingKeywords,
      notes: summary,
      evaluatedAt: today,
    };
    updateApplicationFields(id, { score, fitLevel, status: 'Evaluated' }, scoreData);

    return NextResponse.json({
      applicationId: id,
      company, jobTitle, location,
      score, fitLevel, recommendation,
      summary, matched, gaps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
