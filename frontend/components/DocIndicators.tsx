'use client';

interface Props {
  resume: boolean;
  coverLetter: boolean;
  interviewPrep: boolean;
  report: boolean;
}

const ITEMS = [
  { key: 'resume',       label: 'R', title: 'Resume' },
  { key: 'coverLetter',  label: 'C', title: 'Cover Letter' },
  { key: 'interviewPrep',label: 'I', title: 'Interview Prep' },
  { key: 'report',       label: 'E', title: 'Evaluation Report' },
] as const;

export default function DocIndicators({ resume, coverLetter, interviewPrep, report }: Props) {
  const values = { resume, coverLetter, interviewPrep, report };
  return (
    <div className="flex gap-1">
      {ITEMS.map(item => {
        const present = values[item.key];
        return (
          <span
            key={item.key}
            title={item.title}
            className={`w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center transition-colors
              ${present
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-300'}`}
          >
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
