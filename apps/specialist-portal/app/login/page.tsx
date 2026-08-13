'use client';

import { Button, Card, CardBody, CardHeader, CardTitle } from '@referralplatform/ui-components';
import { useAuth } from '../lib/auth/AuthContext';

/**
 * Redirects to Keycloak's Authorization Code + PKCE flow for the
 * "specialist-portal" public client. Passkey/hardware-key step-up for
 * clinician principals (root CONVENTIONS.md §8, "passkey/hardware-key is
 * mandatory for GP/specialist roles") is configured on the Keycloak side
 * (see infra/keycloak/realm-export.json's `authenticationFlowBindingOverrides`
 * for this client) — this app doesn't need to know how the user
 * authenticated, only that Keycloak issued a token afterwards.
 */
export default function LoginPage() {
  const { login } = useAuth();

  return (
    <main style={{ maxWidth: 480, margin: 'var(--rp-space-6) auto', padding: 'var(--rp-space-4)' }}>
      <Card>
        <CardHeader>
          <CardTitle>Sign in — Specialist Portal</CardTitle>
        </CardHeader>
        <CardBody>
          <p style={{ marginBottom: 'var(--rp-space-3)' }}>
            You’ll be taken to ReferralPlatform’s identity provider to sign in (including passkey, if enrolled).
          </p>
          <Button variant="primary" size="lg" onClick={login}>
            Sign in with ReferralPlatform ID
          </Button>
        </CardBody>
      </Card>
    </main>
  );
}
