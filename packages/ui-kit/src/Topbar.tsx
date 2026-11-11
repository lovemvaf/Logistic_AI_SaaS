'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useShell } from './shell-context';

export type TopbarUser = {
  name?: string;
  email?: string;
  role?: string;
};

export type TopbarProps = {
  title?: string;
  search?: {
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    label?: string;
  };
  user?: TopbarUser | null;
  onLogout?: () => void;
  logoutLabel?: string;
  notificationsHref?: string;
  showNotifications?: boolean;
  notificationsLabel?: string;
  actions?: ReactNode;
  /** @deprecated kept for compatibility; scroll progress is intentionally removed. */
  showProgress?: boolean;
  menuLabel?: string;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function displayName(user?: TopbarUser | null) {
  if (!user) return 'User';
  if (user.name?.trim()) return user.name.trim();
  if (user.email) return user.email.split('@')[0];
  return 'User';
}

function initialsOf(name: string) {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function roleOf(role?: string) {
  if (!role) return undefined;
  return role
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function Topbar({
  title,
  search,
  user,
  onLogout,
  logoutLabel = 'Logout',
  notificationsHref,
  showNotifications = false,
  notificationsLabel = 'Notifications',
  actions,
  menuLabel = 'Open menu',
}: TopbarProps) {
  const { setMobileOpen } = useShell();

  const name = displayName(user);
  const role = roleOf(user?.role);
  const initials = initialsOf(name) || 'U';

  const searchField = search ? (
    <input
      type="search"
      value={search.value}
      onChange={search.onChange ? (event) => search.onChange?.(event.target.value) : undefined}
      placeholder={search.placeholder ?? 'Search…'}
      aria-label={search.label ?? search.placeholder ?? 'Search'}
      className="h-9 w-full max-w-[360px] rounded-md border border-line bg-surface-alt px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
    />
  ) : null;

  const notifications = notificationsHref ? (
    <Link
      href={notificationsHref}
      className="hidden h-9 items-center rounded-md px-2 text-[12px] font-medium text-ink-soft transition-colors hover:bg-surface-alt hover:text-ink sm:inline-flex"
    >
      {notificationsLabel}
    </Link>
  ) : showNotifications ? (
    <button
      type="button"
      className="hidden h-9 items-center rounded-md px-2 text-[12px] font-medium text-ink-soft transition-colors hover:bg-surface-alt hover:text-ink sm:inline-flex"
    >
      {notificationsLabel}
    </button>
  ) : null;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex h-[52px] items-center gap-2 px-4 sm:gap-3 sm:px-5 lg:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="h-8 rounded-md border border-line px-2.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 lg:hidden"
          aria-label={menuLabel}
        >
          Menu
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          {title ? (
            <h1
              className={cx(
                'truncate text-[13px] font-semibold text-ink',
                search && 'hidden md:block',
              )}
            >
              {title}
            </h1>
          ) : null}
          <div className="hidden min-w-0 flex-1 md:block">{searchField}</div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}
          {notifications}

          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <div className="text-right">
                <p className="max-w-[12rem] truncate text-[13px] font-semibold leading-tight text-ink">
                  {name}
                </p>
                {role ? (
                  <p className="max-w-[12rem] truncate text-[11px] leading-tight text-ink-soft">
                    {role}
                  </p>
                ) : null}
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-[11px] font-semibold text-accent">
                {initials}
              </div>
            </div>
          ) : null}

          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="h-9 rounded-md border border-line px-3 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              title={logoutLabel}
            >
              {logoutLabel}
            </button>
          ) : null}
        </div>
      </div>

      {search ? (
        <div className="border-t border-line px-4 py-2 md:hidden">
          {searchField}
        </div>
      ) : null}
    </header>
  );
}
