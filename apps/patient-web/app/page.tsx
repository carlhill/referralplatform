import { Card, CardBody, CardHeader, CardTitle, StatusBadge } from '@referralplatform/ui-components';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--rp-space-5, 32px)' }}>
      <Card>
        <CardHeader>
          <CardTitle>ReferralPlatform — Patient Companion Web</CardTitle>
        </CardHeader>
        <CardBody>
          <p>
            This is a skeleton screen — see the project&apos;s <code>claude/ui-design.md</code> doc for the real screen
            inventory this app will implement.
          </p>
          <StatusBadge tone="neutral" label="Skeleton — not yet implemented" />
        </CardBody>
      </Card>
    </main>
  );
}
