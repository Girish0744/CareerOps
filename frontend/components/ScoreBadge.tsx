'use client';

export default function ScoreBadge({ score, fitLevel }: { score: number | null; fitLevel?: string | null }) {
  if (score === null) return (
    <span className="text-xs text-slate-400 font-medium">No score</span>
  );

  const isHigh   = score >= 80;
  const isMedium = score >= 60 && score < 80;

  const ringColor = isHigh ? 'ring-emerald-200' : isMedium ? 'ring-amber-200' : 'ring-red-200';
  const bgColor   = isHigh ? 'bg-emerald-50'   : isMedium ? 'bg-amber-50'    : 'bg-red-50';
  const numColor  = isHigh ? 'text-emerald-700' : isMedium ? 'text-amber-700' : 'text-red-700';
  const dotColor  = isHigh ? 'bg-emerald-500'   : isMedium ? 'bg-amber-500'   : 'bg-red-500';
  const subColor  = isHigh ? 'text-emerald-600' : isMedium ? 'text-amber-600' : 'text-red-600';

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
