'use client';

import type { ReactNode } from 'react';

export type AppShellProps = {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
  /** Floating assistant / action button rendered above the content. */
  ai?: ReactNode;
  maxWidth?: '6xl' | '7xl' | 'full';
};

const WIDTHS: Record<NonNullable<AppShellProps['maxWidth']>, string> = {
  '6xl': 'mx-auto max-w-6xl',
  '7xl': 'mx-auto max-w-[1440px]',
  full: 'max-w-none',
};

/**
 * Common chrome for every portal: fixed text sidebar + compact topbar +
 * content well. The sidebar is 208px on desktop; the content well uses 24px
 * padding so data tables start high in the viewport.
 */
export function AppShell({
  sidebar,
  topbar,
  children,
  ai,
  maxWidth = 'full',
}: AppShellProps) {
  return (
    <div className="min-h-[100dvh] bg-background font-sans text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:border focus:border-line-strong focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        Bỏ qua điều hướng
      </a>

      {sidebar}

      <div className="flex min-h-[100dvh] flex-col lg:pl-52">
        {topbar}

        <main id="main-content" className="flex-1">
          <div
            className={`w-full px-4 py-4 sm:px-5 lg:px-6 lg:py-5 ${WIDTHS[maxWidth]}`}
          >
            {children}
          </div>
        </main>
      </div>

      {ai}
    </div>
  );
}
