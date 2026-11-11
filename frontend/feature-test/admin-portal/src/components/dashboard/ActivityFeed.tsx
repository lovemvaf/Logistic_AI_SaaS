'use client';

interface Activity {
  id: string | number;
  type: string;
  title?: string;
  message?: string;
  time?: string;
  desc?: string;
}

const typeStyles: Record<string, { bg: string, text: string, border: string }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  error: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};

export function ActivityFeed({ activities }: { activities?: Activity[] }) {
  if (!activities || activities.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        No activities yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {activities.map((activity) => {
        const style = typeStyles[activity.type] || typeStyles.info;
        return (
          <div key={activity.id} className="relative pl-8 pb-4 last:pb-0">
            <div className={`absolute left-[-6px] top-1 w-3 h-3 rounded-full ${style.bg} ${style.border} border-2`}></div>
            <div className="flex justify-between items-start mb-1">
              <h4 className="text-sm font-semibold text-ink">{activity.title || activity.message}</h4>
              <span className="text-xs text-slate-400 whitespace-nowrap ml-2">{activity.time}</span>
            </div>
            <p className="text-sm text-slate-500 leading-snug">{activity.desc || ''}</p>
          </div>
        );
      })}
    </div>
  );
}
