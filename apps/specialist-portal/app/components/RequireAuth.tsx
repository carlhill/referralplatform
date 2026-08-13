'use client';

import * as React from 'react';
import { Card, CardBody, CardHeader, CardTitle, Button } from '@referralplatform/ui-components';
import { useAuth } from '../lib/auth/AuthContext';

/**
 * Gate wrapping every authenticated screen. This is a UX convenience only —
 * the real enforcement is server-side: every backend endpoint this app
 * calls is behind `BearerAuthGuard` (root CONVENTIONS.md §8), so a request
 * made without a valid token is rejected by the service itself regardless
 * of what this component does.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, accessToken, login } = useAuth();

  if (loading) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
        <p>Loading…</p>
      </main>
    );
  }

  if (!accessToken) {
    return (
      <main style={{ maxWidth: 480, margin: 'var(--rp-space-6) auto', padding: 'var(--rp-space-4)' }}>
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardBody>
            <p>Sign in with your specialist/practice-staff account to continue.</p>
            <Button variant="primary" onClick={login}>
              Sign in
            </Button>
          </CardBody>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
