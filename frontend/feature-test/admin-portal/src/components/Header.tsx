'use client';

import { useRouter } from 'next/navigation';
import { clearToken } from '@/lib/auth';
import { useEffect, useState } from 'react';

export default function Header() {
  const router = useRouter();
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const max = scrollHeight - clientHeight;
      setScrollProgress(max > 0 ? Math.min(100, (scrollTop / max) * 100) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = () => {
    clearToken();
    router.replace('/login');
  };

  return (
    <header className="h-16 w-full border-b border-slate-200 bg-white sticky top-0 z-10 flex flex-col">
      <div className="h-[3px] w-full bg-slate-200 overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-75 ease-out"
          style={{ width: `${scrollProgress}%`, opacity: scrollProgress > 0.1 ? 1 : 0 }}
        />
      </div>
      <div className="h-16 flex items-center justify-between px-8 flex-1">
        <div className="flex-1">
        <div className="relative w-96">
          <input
            type="text"
            placeholder="Search tenants, users, audits..."
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="absolute left-4 top-2.5 text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative rounded-full border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:text-ink transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
          </svg>
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400"></span>
        </button>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold text-ink">Super Admin</p>
            <p className="text-xs text-slate-500">admin@smartlogi.vn</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:border-primary hover:text-primary transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
      </div>
    </header>
  );
}
