type TenantStatusBadgeProps = {
  status: "ACTIVE" | "PENDING" | "SUSPENDED"
}

const statusStyles: Record<TenantStatusBadgeProps["status"], string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  SUSPENDED: "bg-rose-50 text-rose-700",
}

export default function TenantStatusBadge({ status }: TenantStatusBadgeProps) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}
    >
      {status}
    </span>
  )
}
