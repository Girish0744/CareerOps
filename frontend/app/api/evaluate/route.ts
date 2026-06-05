import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { createApplication, updateApplicationFields } from '@/lib/filesystem';
import { apiErrorMessage } from '@/lib/errors';
import { applyEvaluationGuardrails } from '@/lib/evaluation-guardrails';
import { extractJobDescriptionFromUrl, normalizeJobDescriptionText } from '@/lib/job-description';
import { generateGeminiContent } from '@/lib/ai-config';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const ROOT = path.resolve(process.cwd(), '..');

function readFile(rel: string): string {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { text?: string; url?: string; applyUrl?: string; sourceUrl?: string };
    const { text, url, applyUrl, sourceUrl } = body;

    if (!text && !url) {
      return NextResponse.json({ error: 'Provide text or url' }, { status: 400 });
    }

    let jdText: string;
    let jobUrl: string | null = null;
    let savedApplyUrl: string | null = null;

    if (url) {
      jobUrl = url;
      savedApplyUrl = applyUrl || url;
      const extracted = await extractJobDescriptionFromUrl(url);
      jdText = extracted.text;
    } else {
      jdText = normalizeJobDescriptionText(text!);
    }

    if (jdText.length < 500) {
      return NextResponse.json({
        error: 'The job description looks too short after cleanup. Paste the full posting text or use a direct ATS job URL.',
      }, { status: 400 });
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

Use this exact 100-point rubric:
- experienceMatch: 0-30
- skillsMatch: 0-25
- roleLevelMatch: 0-15
- locationMatch: 0-10
- industryMatch: 0-10
- growthPotential: 0-10
- riskFactors: 0-10 deduction

Final score = experienceMatch + skillsMatch + roleLevelMatch + locationMatch + industryMatch + growthPotential - riskFactors, clamped to 0-100.
fitLevel: Strong Apply (85+), Apply (70-84), Maybe (50-69), Skip (<50).
Ignore ATS/legal/EEO boilerplate and score only the actual role requirements against the candidate profile.
Be conservative: do not award points for skills that are not in the candidate files.
Hard requirement guardrails:
- If the candidate is early-career and the JD requires 4+ years of professional software engineering experience, the score cannot exceed 69.
- If the JD requires 2+ years of professional embedded software experience and the candidate only has project/course exposure, the score cannot exceed 69.
- If both of those are true, the score cannot exceed 62.
- If the JD is senior/staff/principal/architect/lead and requires 6+ years, the score cannot exceed 55.
- If the JD is US-only and does not allow Canada/Ontario/Remote Canada, the score cannot exceed 49.
- Missing SCADA/MES, CAN/LIN traces, or automotive software standards must increase riskFactors and appear in gaps.
Do not add any text before ===SUMMARY=== or after ===END_JSON===.`;

    const { result, modelUsed } = await generateGeminiContent(ai, 'evaluate', {
      contents: `Evaluate this job description:\n\n${jdText}`,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 8192,
        temperature: 0,
        topP: 0.1,
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

    const candidateContext = [cv, profile, profileMd].join('\n\n');
    const evaluation = applyEvaluationGuardrails({
      ...parsed,
      summary: summaryMatch?.[1]?.trim() ?? parsed.summary,
    }, jdText, candidateContext);

    const { company, jobTitle, location, score, fitLevel, recommendation, matched, gaps,
            categories, matchedKeywords, missingKeywords, summary } = evaluation;

    // Build application ID
    const id = `${slugify(company)}-${slugify(jobTitle)}-${today}`;

    // Create application folder + data/applications.json entry
    createApplication(id, company, jobTitle, location, savedApplyUrl ?? jobUrl, jdText, today);

    // Write score.json
    const scoreData = {
      overallScore: score, fitLevel, recommendation, summary,
      originalScore: evaluation.originalScore,
      adjustedByGuardrails: evaluation.adjustedByGuardrails,
      guardrails: evaluation.guardrails,
      modelUsed,
      categories, matchedKeywords, missingKeywords,
      notes: summary,
      sourceUrl: sourceUrl ?? jobUrl,
      applyUrl: savedApplyUrl ?? jobUrl,
      evaluatedAt: today,
    };
    updateApplicationFields(id, { score, fitLevel, status: 'Evaluated', jobUrl: savedApplyUrl ?? jobUrl }, scoreData);

    return NextResponse.json({
      applicationId: id,
      company, jobTitle, location,
      score, fitLevel, recommendation,
      summary, matched, gaps,
      guardrails: evaluation.guardrails,
      adjustedByGuardrails: evaluation.adjustedByGuardrails,
    });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
