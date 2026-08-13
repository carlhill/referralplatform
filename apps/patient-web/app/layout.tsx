import type { Metadata } from 'next';
import '@referralplatform/ui-components/dist/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReferralPlatform — Patient Companion Web',
  description:
    "Next.js companion web app for the patient/carer's bigger-screen use cases (document history, linked-GP management). The primary patient/carer surface is the Expo mobile app in apps/patient-mobile.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
