'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@referralplatform/ui-components';
import { useAuth } from '../lib/auth/AuthContext';

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/', label: 'Home' },
  { href: '/referrals', label: 'My referrals' },
  { href: '/gp-approvals', label: 'GP requests' },
  { href: '/documents', label: 'Documents' },
  { href: '/consent', label: 'Consent & security' },
  { href: '/concern', label: 'Raise a concern' },
];

export function Nav() {
  const auth = useAuth();
  const pathname = usePathname();

  return (
    <header style={{ borderBottom: '1px solid var(--rp-color-border)', background: 'var(--rp-color-bg)' }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: 'var(--rp-space-3) var(--rp-space-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--rp-space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--rp-space-4)', flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--rp-font-family)',
              fontWeight: 'var(--rp-font-weight-bold)',
              fontSize: 'var(--rp-font-size-lg)',
              color: 'var(--rp-color-primary-600)',
              textDecoration: 'none',
            }}
          >
            ReferralPlatform
          </Link>
          {auth.status === 'authenticated' && !auth.wrongPrincipalType && (
            <nav aria-label="Main" style={{ display: 'flex', gap: 'var(--rp-space-3)', flexWrap: 'wrap' }}>
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={pathname === link.href ? 'page' : undefined}
                  style={{
                    fontFamily: 'var(--rp-font-family)',
                    fontSize: 'var(--rp-font-size-sm)',
                    color: pathname === link.href ? 'var(--rp-color-primary-600)' : 'var(--rp-color-text-muted)',
                    fontWeight: pathname === link.href ? 'var(--rp-font-weight-bold)' : 'var(--rp-font-weight-regular)',
                    textDecoration: 'none',
                    padding: '4px 0',
                    borderBottom:
                      pathname === link.href ? '2px solid var(--rp-color-accent-500)' : '2px solid transparent',
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div>
          {auth.status === 'authenticated' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--rp-space-2)' }}>
              <span style={{ fontFamily: 'var(--rp-font-family)', fontSize: 'var(--rp-font-size-sm)' }}>
                {auth.principal?.displayName}
              </span>
              <Button variant="ghost" onClick={() => auth.logout()}>
                Sign out
              </Button>
            </div>
          ) : auth.status === 'unauthenticated' ? (
            <Button variant="primary" onClick={() => void auth.login()}>
              Sign in
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
