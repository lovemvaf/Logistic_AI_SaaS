import Link from 'next/link';

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-[100dvh] fixed top-0 left-0 border-r border-slate-200 bg-white flex flex-col z-10">
      <div className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">SmartLogi</h1>
        <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Super Admin</p>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-8">
        <Link href="/admin/dashboard" className="block px-4 py-3 rounded-lg text-sm font-medium text-ink bg-slate-50 hover:bg-slate-100 transition-colors">
          Dashboard
        </Link>
        <Link href="/admin/tenants" className="block px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:text-ink hover:bg-slate-50 transition-colors">
          Tenants
        </Link>
        <Link href="/admin/billing" className="block px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:text-ink hover:bg-slate-50 transition-colors">
          Billing
        </Link>
        <Link href="/admin/audit-logs" className="block px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:text-ink hover:bg-slate-50 transition-colors">
          Audit Logs
        </Link>
      </nav>

      <div className="p-4 mt-auto">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white font-semibold">
              SA
            </div>
            <div className="text-sm">
              <p className="font-semibold text-ink">Super Admin</p>
              <p className="text-xs text-slate-500">admin@smartlogi.vn</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Secure access to tenant orchestration
          </p>
        </div>
      </div>
    </aside>

  );
}