type StatCardProps = {
  title: string
  value: string
  trend: string
}

export default function StatCard({ title, value, trend }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
        {title}
      </p>
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{trend}</p>
    </div>
  )
}
