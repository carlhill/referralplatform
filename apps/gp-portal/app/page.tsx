'use client';

import Link from 'next/link';
import * as React from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle, StatusBadge } from '@referralplatform/ui-components';
import { useAuth } from '../lib/auth/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { loadPracticeProfile } from '../lib/local/practiceProfile';

const QUICK_LINKS: Array<{ href: string; title: string; description: string }> = [
  {
    href: '/patients',
    title: 'Patient search & lookup',
    description: 'Trigger a new patient account, or request a GP link to a patient already on the platform.',
  },
  {
    href: '/referrals/new',
    title: 'Create a referral',
    description: 'Compliance checklist, HealthPathways-suggested specialist type, urgent flag, consent capture.',
  },
  {
    href: '/referrals',
    title: 'Referral dashboard',
    description: 'Every referral this practice has sent, filterable by status and patient.',
  },
  {
    href: '/follow-up',
    title: 'Follow-up & recall',
    description: 'Courtesy calls due, tests overdue, Follow-up Plans needing GP action.',
  },
  {
    href: '/messages',
    title: 'Message threads',
    description: 'Secure messaging with specialists across every active referral.',
  },
  {
    href: '/deceased-flag',
    title: 'Deceased-patient flag',
    description: 'Flag a patient deceased and trigger the reminder-freeze/suppression sequence.',
  },
  {
    href: '/settings',
    title: 'Practice settings',
    description: 'HPI-O verification status, integration tier, compliance-checklist acknowledgement.',
  },
];

export default function HomePage() {
  const auth = useAuth();
  const practice = auth.status === 'authenticated' ? loadPracticeProfile() : null;

  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--rp-font-family)',
          fontSize: 'var(--rp-font-size-xl)',
          fontWeight: 'var(--rp-font-weight-bold)',
          marginBottom: 'var(--rp-space-3)',
        }}
      >
        ReferralPlatform — GP Portal
      </h1>

      {auth.status === 'loading' && <LoadingState label="Checking your sign-in…" />}

      {auth.status === 'unauthenticated' && (
        <Card>
          <CardHeader>
            <CardTitle>Sign in to get started</CardTitle>
          </CardHeader>
          <CardBody>
            <p>Patient search/lookup, referral creation, and every other GP-portal screen requires sign-in.</p>
            <Button variant="primary" onClick={() => void auth.login('/')}>
              Sign in
            </Button>
          </CardBody>
        </Card>
      )}

      {auth.status === 'authenticated' && auth.wrongPrincipalType && (
        <Card style={{ borderColor: 'var(--rp-color-urgent-100)' }}>
          <CardBody>
            <StatusBadge tone="urgent" label="Wrong account type" />
            <p>
              This portal is for GPs and internal staff only. You&apos;re signed in as{' '}
              <strong>{auth.principal?.principalType}</strong> — sign out and sign in with a GP account.
            </p>
            <Button variant="secondary" onClick={() => auth.logout()}>
              Sign out
            </Button>
          </CardBody>
        </Card>
      )}

      {auth.status === 'authenticated' && !auth.wrongPrincipalType && (
        <>
          {!practice && (
            <Card style={{ marginBottom: 'var(--rp-space-4)', borderColor: 'var(--rp-color-attention-100)' }}>
              <CardBody>
                <StatusBadge tone="attention" label="No practice profile set up yet" />
                <p style={{ marginTop: 'var(--rp-space-2)' }}>
                  Register (or look up) your practice&apos;s HPI-O on the Practice settings screen — referral
                  creation and GP-link requests need it.
                </p>
                <Link href="/settings">
                  <Button variant="primary">Go to practice settings</Button>
                </Link>
              </CardBody>
            </Card>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--rp-space-4)',
            }}
          >
            {QUICK_LINKS.map((link) => (
              <Link key={link.href} href={link.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Card style={{ height: '100%', cursor: 'pointer' }}>
                  <CardHeader>
                    <CardTitle>{link.title}</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <p style={{ margin: 0, color: 'var(--rp-color-text-muted)' }}>{link.description}</p>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
