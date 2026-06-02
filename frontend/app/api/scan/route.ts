import { NextResponse } from 'next/server';
import { getScoredQueue } from '@/lib/filesystem';

export async function GET() {
  const queue = getScoredQueue();
  return NextResponse.json(queue);
}
