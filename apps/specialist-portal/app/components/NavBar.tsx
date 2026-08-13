'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth/AuthContext';
import { Button } from '@referralplatform/ui-components';

const NAV_LINKS = [
  { href: '/queue', label: 'Referral queue' },
  { href: '/bookings', label: 'Bookings & calendar' },
  { href: '/followup-plans', label: 'Follow-up plans' },
  { href: '/profile', label: 'Directory profile' },
];

export function NavBar() {
  const { principal, logout, specialistId, setSpecialistId } = useAuth();
  const [editingId, setEditingId] = React.useState(false);
  const [draftId, setDraftId] = React.useState(specialistId);

  React.useEffect(() => setDraftId(specialistId), [specialistId]);

  return (
    <header
      style={{
        borderBottom: '1px solid var(--rp-color-border)',
        background: 'var(--rp-color-bg)',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: 'var(--rp-space-3) var(--rp-space-4)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--rp-space-4)',
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/"
          style={{
            fontWeight: 'var(--rp-font-weight-bold)',
            color: 'var(--rp-color-primary-600)',
            textDecoration: 'none',
          }}
        >
          ReferralPlatform — Specialist Portal
        </Link>
        <nav style={{ display: 'flex', gap: 'var(--rp-space-3)', flex: 1 }}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{ color: 'var(--rp-color-text)', textDecoration: 'none', fontSize: 'var(--rp-font-size-body)' }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--rp-space-2)',
            fontSize: 'var(--rp-font-size-sm)',
          }}
        >
          {editingId ? (
            <>
              <input
                value={draftId}
                onChange={(e) => setDraftId(e.target.value)}
                aria-label="Specialist id"
                style={{
                  minHeight: 32,
                  padding: '0 8px',
                  border: '1px solid var(--rp-color-border)',
                  borderRadius: 'var(--rp-radius-sm)',
                }}
              />
              <Button
                size="md"
                variant="ghost"
                onClick={() => {
                  setSpecialistId(draftId);
                  setEditingId(false);
                }}
              >
                Save
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditingId(true)}
              title="Which SpecialistId every list on this app is scoped to — see AuthContext's doc comment for why this is editable"
              style={{
                background: 'var(--rp-color-bg-subtle)',
                border: '1px solid var(--rp-color-border)',
                borderRadius: 'var(--rp-radius-sm)',
                padding: '4px 10px',
                color: 'var(--rp-color-text-muted)',
                cursor: 'pointer',
              }}
            >
              Specialist id: {specialistId || '(none)'}
            </button>
          )}
          {principal && (
            <>
              <span style={{ color: 'var(--rp-color-text-muted)' }}>
                {principal.preferredUsername ?? principal.sub}
              </span>
              <Button size="md" variant="ghost" onClick={logout}>
                Sign out
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
