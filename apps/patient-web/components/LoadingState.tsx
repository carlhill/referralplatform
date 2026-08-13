import { StatusBadge } from '@referralplatform/ui-components';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" style={{ padding: 'var(--rp-space-4) 0' }}>
      <StatusBadge tone="neutral" label={label} />
    </div>
  );
}
