import type { Metadata } from 'next';
import '@referralplatform/ui-components/dist/tokens.css';
import './globals.css';
import { AuthProvider } from '../lib/auth/AuthContext';
import { Nav } from '../components/Nav';

export const metadata: Metadata = {
  title: 'ReferralPlatform — GP Portal',
  description:
    'Next.js web portal for GPs and practice staff: patient search/lookup, referral creation, referral list/dashboard, follow-up & recall dashboard, message threads, deceased-patient flag, practice settings.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Nav />
          <main style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--rp-space-5, 32px) var(--rp-space-4, 24px)' }}>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
