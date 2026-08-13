'use client';

import * as React from 'react';
import { Card, CardBody } from '@referralplatform/ui-components';
import { useAuth } from '../lib/auth/AuthContext';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

/** Gates a page behind an authenticated patient/carer session — redirects to /login otherwise. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  React.useEffect(() => {
    if (auth.status === 'unauthenticated') {
      window.location.assign('/login');
    }
  }, [auth.status]);

  if (auth.status === 'loading') {
    return <LoadingState label="Checking your sign-in…" />;
  }
  if (auth.status === 'unauthenticated') {
    return <LoadingState label="Redirecting to sign-in…" />;
  }
  if (auth.wrongPrincipalType) {
    return (
      <Card>
        <CardBody>
          <ErrorState message="This app is for patients and carers only. Sign out and use the correct portal for your role." />
        </CardBody>
      </Card>
    );
  }
  return <>{children}</>;
}
