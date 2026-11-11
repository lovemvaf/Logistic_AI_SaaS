'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useShell } from './shell-context';

export type NavItem = {
  label: string;
  href: string;
  /** Kept for compatibility with existing portal configs; not rendered. */
  icon?: ReactNode;
  badge?: string | number;
  /** Optional prefix used for active-state matching (e.g. /logistics). */
  match?: string;
  exact?: boolean;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export type SidebarBrand = {
  name: string;
  tagline: string;
  href: string;
  /** Kept for compatibility; the editorial shell uses a wordmark only. */
  initials?: string;
};

export type SidebarProps = {
  brand: SidebarBrand;
  sections: NavSection[];
  footer?: ReactNode;
  /** Labels kept as props so each portal can stay in its own language. */
  labels?: {
    openMenu?: string;
    closeMenu?: string;
    navigation?: string;
    /** @deprecated desktop collapse was removed. */
    collapse?: string;
    /** @deprecated desktop collapse was removed. */
    expand?: string;
  };
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function isItemActive(item: NavItem, pathname: string) {
  const target = item.match ?? item.href;
  if (item.exact) return pathname === target;
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function Sidebar({ brand, sections, footer, labels }: SidebarProps) {
  const pathname = usePathname();
  const { mobileOpen, setMobileOpen } = useShell();

  const copy = {
    closeMenu: labels?.closeMenu ?? 'Close menu',
    navigation: labels?.navigation ?? 'Main navigation',
  };

  return (
    <>
      <div
        className={cx(
          'fixed inset-0 z-40 bg-ink/30 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface transition-transform duration-150 lg:w-52 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full invisible lg:visible',
        )}
        aria-label={copy.navigation}
      >
        <div className="flex items-start justify-between border-b border-line px-3 py-4">
          <Link
            href={brand.href}
            onClick={() => setMobileOpen(false)}
            className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <span className="block truncate font-editorial text-[26px] font-semibold leading-none tracking-tight text-ink">
              {brand.name}
            </span>
            <span className="mt-1 block truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">
              {brand.tagline}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="-mr-1 -mt-1 rounded-md p-2 text-lg leading-none text-ink-soft hover:bg-surface-alt hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 lg:hidden"
            aria-label={copy.closeMenu}
          >
            ×
          </button>
        </div>

        <nav
          aria-label={copy.navigation}
          className="flex-1 space-y-6 overflow-y-auto px-2 py-4"
        >
          {sections.map((section, sectionIndex) => (
            <div key={section.title ?? sectionIndex} className="space-y-0.5">
              {section.title ? (
                <p className="truncate px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  {section.title}
                </p>
              ) : null}

              {section.items.map((item) => {
                const active = isItemActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={cx(
                      'flex h-9 items-center gap-2 rounded-md border-l-2 py-1 pl-3 pr-2 text-[13px] font-medium transition-colors',
                      'outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
                      active
                        ? 'border-accent bg-accent-soft/70 text-ink'
                        : 'border-transparent text-ink-soft hover:bg-surface-alt hover:text-ink',
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.badge != null ? (
                      <span className="ml-auto text-[11px] font-medium tabular-nums text-ink-faint">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {footer ? (
          <div className="border-t border-line p-3">{footer}</div>
        ) : null}
      </aside>
    </>
  );
}
