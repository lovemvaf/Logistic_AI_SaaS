"use client";

import { ReactNode } from 'react';

/**
 * PackStation sub-layout — the root AppShell now owns the authenticated
 * shell (Sidebar + Header + main well). This route layout is a pass-through
 * so /pack and /pack/* render inside the shared shell without double chrome.
 */
export default function PackLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
