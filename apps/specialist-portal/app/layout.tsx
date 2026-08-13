import type { Metadata } from 'next';
import '@referralplatform/ui-components/dist/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReferralPlatform — Specialist Portal',
  description:
    'Next.js web portal for specialists and their practice staff: incoming referral queue, referral decisions, booking calendar management, Follow-up Plan creation, directory profile management.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
