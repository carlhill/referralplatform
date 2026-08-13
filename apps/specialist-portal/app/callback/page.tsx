'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@referralplatform/ui-components';
import { completeLogin } from '../lib/auth/oidc';

/**
 * The OIDC redirect target (`redirect_uri`) registered for the
 * "specialist-portal" Keycloak client. Exchanges the authorization code for
 * tokens, then does a full page navigation (not a router.push) to `/` so
 * `AuthProvider`'s mount-time token load picks up the freshly-stored
 * session — see AuthContext.tsx's doc comment on why a client-side
 * navigation wouldn't re-trigger that.
 */
export default function CallbackPage() {
  return (
    <React.Suspense
      fallback={
        <main style={{ maxWidth: 480, margin: 'var(--rp-space-6) auto', padding: 'var(--rp-space-4)' }}>Loading…</main>
      }
    >
      <CallbackExchange />
    </React.Suspense>
  );
}

function CallbackExchange() {
  const params = useSearchParams();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error');

    if (oauthError) {
      setError(params.get('error_description') ?? oauthError);
      return;
    }
    if (!code || !state) {
      setError('Missing authorization code — please sign in again.');
      return;
    }

    completeLogin(code, state)
      .then(() => {
        window.location.assign('/');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Sign-in failed.');
      });
  }, [params]);

  return (
    <main style={{ maxWidth: 480, margin: 'var(--rp-space-6) auto', padding: 'var(--rp-space-4)' }}>
      <Card>
        <CardHeader>
          <CardTitle>Signing you in…</CardTitle>
        </CardHeader>
        <CardBody>
          {error ? (
            <>
              <p style={{ color: 'var(--rp-color-urgent-500)' }}>{error}</p>
              <a href="/login">Try again</a>
            </>
          ) : (
            <p>One moment…</p>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
