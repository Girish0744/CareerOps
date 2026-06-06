'use client';

import { ALL_STATUSES } from '@/lib/status';

const STATUS_STYLES: Record<string, string> = {
  'Interview':              'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200',
  'Applied':                'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
  'In Progress':            'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
  'Offer':                  'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  'Ready to Apply':         'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
  'Cover Letter Generated': 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200',
  'Resume Generated':       'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  'Saved':                  'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  'Evaluated':              'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  'Rejected':               'bg-red-100 text-red-700 ring-1 ring-red-200',
  'Withdrawn':              'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
};

const STATUS_DOTS: Record<string, string> = {
  'Interview':              'bg-emerald-500',
  'Applied':                'bg-blue-500',
  'In Progress':            'bg-blue-500',
  'Offer':                  'bg-amber-500',
  'Ready to Apply':         'bg-violet-500',
  'Cover Letter Generated': 'bg-indigo-500',
  'Resume Generated':       'bg-slate-400',
  'Saved':                  'bg-slate-300',
  'Evaluated':              'bg-slate-400',
  'Rejected':               'bg-red-500',
  'Withdrawn':              'bg-rose-500',
};

export { ALL_STATUSES };

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  const dot   = STATUS_DOTS[status]  ?? 'bg-slate-400';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}
