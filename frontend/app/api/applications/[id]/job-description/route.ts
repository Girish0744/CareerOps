import { NextResponse } from 'next/server';
import { getApplication, saveJobDescriptionSnapshot } from '@/lib/filesystem';
import { apiErrorMessage } from '@/lib/errors';
import {
  assertUsableJobDescription,
  extractJobDescriptionFromUrl,
} from '@/lib/job-description';

function uniqueUrls(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const matches = String(value).match(/https?:\/\/[^\s<>)"']+/gi) ?? [];
    for (const raw of matches) {
      const url = raw.replace(/[.,;]+$/, '');
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  return urls;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const app = getApplication(id);
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    const urls = uniqueUrls([
      app.jobUrl,
      app.scoreData?.applyUrl,
      app.scoreData?.sourceUrl,
      app.jobDescription,
    ]);
    if (urls.length === 0) {
      return NextResponse.json({ error: 'This application has no posting URL to fetch from.' }, { status: 400 });
    }

    const failures: string[] = [];
    for (const url of urls) {
      try {
        const extracted = await extractJobDescriptionFromUrl(url);
        assertUsableJobDescription(extracted.text);
        if (extracted.text.length < 500) {
          failures.push(`${url}: text too short`);
          continue;
        }
        saveJobDescriptionSnapshot(id, extracted.text);
        return NextResponse.json({ ok: true, source: extracted.source, fetchedFrom: url });
      } catch (err) {
        failures.push(`${url}: ${apiErrorMessage(err)}`);
      }
    }

    return NextResponse.json({
      error: `Could not fetch the full job description from the saved URL${urls.length === 1 ? '' : 's'}. The posting may be blocked, expired, or behind a verification page.`,
      attempts: failures,
    }, { status: 422 });
  } catch (err) {
    return NextResponse.json({ error: apiErrorMessage(err) }, { status: 500 });
  }
}
