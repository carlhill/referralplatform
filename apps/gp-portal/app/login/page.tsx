'use client';

import * as React from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle } from '@referralplatform/ui-components';
import { useAuth } from '../../lib/auth/AuthContext';

export default function LoginPage() {
  const auth = useAuth();

  React.useEffect(() => {
    if (auth.status === 'authenticated' && !auth.wrongPrincipalType) {
      window.location.assign('/');
    }
  }, [auth.status, auth.wrongPrincipalType]);

  return (
    <Card style={{ maxWidth: 480, margin: '48px auto' }}>
      <CardHeader>
        <CardTitle>Sign in to the GP Portal</CardTitle>
      </CardHeader>
      <CardBody>
        <p>
          GP and practice-staff sign-in requires a passkey or hardware security key (mandatory step-up, per this
          platform&apos;s clinician identity policy) — Keycloak will guide you through registering one on first
          sign-in.
        </p>
        <Button variant="primary" size="lg" onClick={() => void auth.login('/')} style={{ marginTop: 'var(--rp-space-3)' }}>
          Sign in with ReferralPlatform
        </Button>
      </CardBody>
    </Card>
  );
}
