'use client';

import * as React from 'react';
import Link from 'next/link';
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
        <CardTitle>Sign in to ReferralPlatform</CardTitle>
      </CardHeader>
      <CardBody>
        <p>
          Sign in with a passkey (recommended — fast and phishing-resistant) or your password plus a one-time code sent
          to your device. Keycloak will guide you through registering a passkey if you don&apos;t have one yet.
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => void auth.login('/')}
          style={{ marginTop: 'var(--rp-space-3)' }}
        >
          Sign in
        </Button>
        <p
          style={{
            marginTop: 'var(--rp-space-4)',
            fontSize: 'var(--rp-font-size-sm)',
            color: 'var(--rp-color-text-muted)',
          }}
        >
          New here? Your GP sends a link by text message to set up your account the first time they refer you to a
          specialist. Got a link already?{' '}
          <Link href="/onboarding/activate" style={{ color: 'var(--rp-color-primary-600)' }}>
            Continue setting up your account
          </Link>
          .
        </p>
      </CardBody>
    </Card>
  );
}
