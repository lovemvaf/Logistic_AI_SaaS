'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export function TopBar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const pathParts = pathname.split('/').filter(Boolean);
  const currentPage = pathParts.length > 1
    ? pathParts[pathParts.length - 1].charAt(0).toUpperCase() + pathParts[pathParts.length - 1].slice(1).replace(/-/g, ' ')
    : 'Home';

  const displayName = user?.email?.split('@')[0] || user?.email || 'Admin';
  const displayRole = user?.role ? String(user.role).replace(/_/g, ' ') : 'Super Admin';
  const initials = displayName.charAt(0).toUpperCase() + (displayName.split(' ')[1]?.charAt(0)?.toUpperCase() || '');

  return (
  <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-10 px-8 flex items-center justify-between">
    <h2 className="text-lg font-semibold text-ink">{currentPage}</h2>

    <div className="flex items-center gap-4">
      <button className="relative rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:text-ink transition-colors">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-400"></span>
      </button>

      <div className="h-8 w-px bg-slate-200"></div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold text-ink">{displayName}</p>
          <p className="text-xs text-slate-500">{displayRole}</p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white font-bold text-xs">
          {initials || 'AD'}
        </div>
        <button
          onClick={logout}
          className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:border-primary hover:text-primary transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  </header>
  );
}
