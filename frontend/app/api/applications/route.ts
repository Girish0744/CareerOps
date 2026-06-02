import { NextResponse } from 'next/server';
import { getAllApplications } from '@/lib/filesystem';

export async function GET() {
  const apps = getAllApplications();
  return NextResponse.json(apps);
}
