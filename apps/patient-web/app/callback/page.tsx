'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle } from '@referralplatform/ui-components';
import { handleCallback } from '../../lib/auth/oidc-client';
import { useAuth } from '../../lib/auth/AuthContext';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';

function CallbackInner() {
  const searchParams = useSearchParams();
  const auth = useAuth();
  const [error, setError] = React.useState<string | null>(null);
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    (async () => {
      try {
        const { postLoginPath } = await handleCallback(searchParams);
        auth.refreshFromStorage();
        window.location.assign(postLoginPath || '/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed.');
      }
    })();
  }, []);

  return (
    <Card style={{ maxWidth: 480, margin: '48px auto' }}>
      <CardHeader>
        <CardTitle>Completing sign-in…</CardTitle>
      </CardHeader>
      <CardBody>
        {error ? (
          <ErrorState message={error} onRetry={() => void auth.login('/')} />
        ) : (
          <LoadingState label="Exchanging authorization code…" />
        )}
      </CardBody>
    </Card>
  );
}

export default function CallbackPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading…" />}>
      <CallbackInner />
    </React.Suspense>
  );
}
