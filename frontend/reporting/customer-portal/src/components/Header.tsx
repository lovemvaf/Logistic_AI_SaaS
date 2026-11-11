import React from 'react';
import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-line bg-surface">
      <div className="mx-auto flex h-[52px] max-w-[1440px] items-center justify-between px-4 sm:px-5 lg:px-6">
        <Link
          href="/"
          className="flex items-baseline gap-2 text-ink transition-colors hover:text-accent"
        >
          <span className="font-editorial text-[24px] font-semibold leading-none tracking-tight">
            SmartLogi
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">
            Customer
          </span>
        </Link>
        <nav className="hidden items-center gap-5 md:flex">
          <Link
            href="/"
            className="text-[12px] font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Track order
          </Link>
          <Link
            href="/client"
            className="text-[12px] font-medium text-ink-soft transition-colors hover:text-ink"
          >
            B2B portal
          </Link>
          <span className="cursor-not-allowed text-[12px] font-medium text-ink-faint" title="Coming soon">
            Support
          </span>
        </nav>
      </div>
    </header>
  );
}
