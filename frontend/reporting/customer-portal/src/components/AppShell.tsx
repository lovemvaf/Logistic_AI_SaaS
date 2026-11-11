'use client';

import { ReactNode } from 'react';

/**
 * Customer portal root shell.
 *
 * The authenticated chrome (editorial sidebar + main well) lives in
 * `app/client/layout.tsx` for /client/* routes. The root AppShell is a thin
 * pass-through so public routes (landing `/`, tracking `/track/*`) and the
 * /client sub-layout (which owns its own auth gating + sidebar) render
 * without double chrome. The editorial token layer (typography/spacing/shadow/
 * scroll-reveal) is applied globally via `src/styles/layout-tokens.css`.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
