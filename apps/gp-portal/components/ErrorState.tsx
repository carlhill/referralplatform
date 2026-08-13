import { Button, Card, CardBody, StatusBadge } from '@referralplatform/ui-components';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: 'var(--rp-color-urgent-100)' }}>
      <CardBody>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-2)', alignItems: 'flex-start' }}>
          <StatusBadge tone="urgent" label="Something went wrong" />
          <p role="alert" style={{ margin: 0 }}>
            {message}
          </p>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
