'use client';

import Link from 'next/link';
import { Card, CardBody, CardHeader, CardTitle, Button } from '@referralplatform/ui-components';
import { RequireAuth } from './components/RequireAuth';

const SECTIONS = [
  {
    href: '/queue',
    title: 'Incoming referral queue',
    description:
      'New referrals awaiting your decision, and cases in review — the AI-assisted extraction summary is shown first, with the full letter available on demand.',
  },
  {
    href: '/bookings',
    title: 'Bookings & calendar',
    description: 'Connect your calendar, see open slots, and manage confirmed/waitlisted bookings.',
  },
  {
    href: '/followup-plans/new',
    title: 'Create a Follow-up Plan',
    description: 'Structured next-review-date, required tests, and referral type for a patient you’ve just seen.',
  },
  {
    href: '/profile',
    title: 'Directory profile',
    description:
      'Your self-maintained listing (location, consulting days, subspecialty) — always supersedes NHSD sync data.',
  },
];

export default function HomePage() {
  return (
    <RequireAuth>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--rp-space-5)' }}>
        <h1 style={{ fontSize: 'var(--rp-font-size-xl)', marginBottom: 'var(--rp-space-4)' }}>Welcome back</h1>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--rp-space-4)',
          }}
        >
          {SECTIONS.map((section) => (
            <Card key={section.href}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardBody>
                <p style={{ color: 'var(--rp-color-text-muted)', marginBottom: 'var(--rp-space-3)' }}>
                  {section.description}
                </p>
                <Button asChild variant="primary">
                  <Link href={section.href}>Open</Link>
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      </main>
    </RequireAuth>
  );
}
