'use client';

export interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { bg: string, text: string, dot: string, border: string }> = {
  'CREATED': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  'IN_TRANSIT': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-200' },
  'DELIVERED': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  'FAILED': { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500', border: 'border-rose-200' },
  'AVAILABLE': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  'LOW_STOCK': { bg: 'bg-rose-50', text: 'text-rose-700 font-medium', dot: 'bg-rose-500', border: 'border-rose-200' },
  'PLANNING': { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', border: 'border-slate-200' },
  'DISPATCHED': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  'IN_PROGRESS': { bg: 'bg-amber-50', text: 'text-amber-700 font-semibold', dot: 'bg-amber-500', border: 'border-amber-200' },
  'COMPLETED': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  'ACTIVE': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  'PENDING': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  'SUSPENDED': { bg: 'bg-rose-50', text: 'text-rose-700 font-medium', dot: 'bg-rose-500', border: 'border-rose-200' },
  'DEFAULT': { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', border: 'border-slate-200' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.toUpperCase().replace(/\s+/g, '_');
  const config = statusConfig[normalizedStatus] || statusConfig['DEFAULT'];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${config.bg} ${config.border}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`}></div>
      <span className={`text-[11px] font-semibold tracking-wider ${config.text}`}>
        {status.replace(/_/g, ' ')}
      </span>
    </div>
  );
}
