import type { Metadata } from 'next';
import '@referralplatform/ui-components/dist/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReferralPlatform — GP Portal',
  description:
    'Next.js web portal for GPs and practice staff: patient search/lookup, referral creation, referral list/dashboard, follow-up & recall dashboard, message threads, deceased-patient flag, practice settings.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
