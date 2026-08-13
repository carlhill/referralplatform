import type { Metadata } from 'next';
import '@referralplatform/ui-components/dist/tokens.css';
import './globals.css';
import { AuthProvider } from '../lib/auth/AuthContext';
import { Nav } from '../components/Nav';

export const metadata: Metadata = {
  title: 'ReferralPlatform — Patient Companion Web',
  description:
    "Next.js companion web app for the patient/carer's bigger-screen use cases (document history, linked-GP management). The primary patient/carer surface is the Expo mobile app in apps/patient-mobile.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Nav />
          <main style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--rp-space-4)' }}>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
