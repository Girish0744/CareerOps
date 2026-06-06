'use client';

import { scoreTone } from '@/lib/scoring';

export default function ScoreBadge({ score, fitLevel }: { score: number | null; fitLevel?: string | null }) {
  if (score === null) return (
    <span className="text-xs text-slate-400 font-medium">No score</span>
  );

  const tone = scoreTone(score);
  const ringColor = tone === 'emerald' ? 'ring-emerald-200' : tone === 'blue' ? 'ring-blue-200' : tone === 'amber' ? 'ring-amber-200' : 'ring-red-200';
  const bgColor   = tone === 'emerald' ? 'bg-emerald-50'   : tone === 'blue' ? 'bg-blue-50'   : tone === 'amber' ? 'bg-amber-50'   : 'bg-red-50';
  const numColor  = tone === 'emerald' ? 'text-emerald-700' : tone === 'blue' ? 'text-blue-700' : tone === 'amber' ? 'text-amber-700' : 'text-red-700';
  const dotColor  = tone === 'emerald' ? 'bg-emerald-500'   : tone === 'blue' ? 'bg-blue-500'   : tone === 'amber' ? 'bg-amber-500'   : 'bg-red-500';
  const subColor  = tone === 'emerald' ? 'text-emerald-600' : tone === 'blue' ? 'text-blue-600' : tone === 'amber' ? 'text-amber-600' : 'text-red-600';

  return (
    <div className={`inline-flex flex-col items-end px-3 py-2 rounded-xl ring-1 ${ringColor} ${bgColor}`}>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className={`text-base font-bold ${numColor} leading-none`}>
          {score}<span className="text-xs font-normal opacity-60">/100</span>
        </span>
      </div>
      {fitLevel && (
        <span className={`text-[10px] font-semibold mt-0.5 ${subColor}`}>{fitLevel}</span>
      )}
    </div>
  );
}
