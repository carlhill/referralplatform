'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useAuth } from './AuthContext';

/**
 * Every protected page calls this at the top. Redirects to `/login` when
 * unauthenticated; leaves the "wrong principal type" (e.g. a patient token)
 * case for the page to render explicitly via `wrongPrincipalType`, since a
 * silent redirect there would be confusing (this portal is GP-only, per
 * ui-design.md's screen inventory — a specialist/patient hitting it should
 * see why, not bounce unexplained).
 */
export function useRequireGp() {
  const auth = useAuth();
  const pathname = usePathname();

  React.useEffect(() => {
    if (auth.status === 'unauthenticated') {
      void auth.login(pathname ?? '/');
    }
  }, [auth.status]);

  return auth;
}
