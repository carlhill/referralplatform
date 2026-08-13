import * as React from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react';

/**
 * Pill / StatusBadge — status is never conveyed by colour alone (WCAG + the
 * patient population's age range, per ui-design.md): every tone pairs an icon
 * and a text label with the colour.
 */
export type StatusTone = 'neutral' | 'success' | 'attention' | 'urgent';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  label: string;
}

const toneStyle: Record<StatusTone, { bg: string; fg: string; Icon: React.ComponentType<{ size?: number }> }> = {
  neutral: { bg: 'var(--rp-color-bg-subtle)', fg: 'var(--rp-color-text-muted)', Icon: Circle },
  success: { bg: 'var(--rp-color-success-100)', fg: 'var(--rp-color-success-500)', Icon: CheckCircle2 },
  attention: { bg: 'var(--rp-color-attention-100)', fg: 'var(--rp-color-attention-500)', Icon: Clock },
  urgent: { bg: 'var(--rp-color-urgent-100)', fg: 'var(--rp-color-urgent-500)', Icon: AlertTriangle },
};

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ tone = 'neutral', label, style, className, ...props }, ref) => {
    const { bg, fg, Icon } = toneStyle[tone];
    return (
      <span
        ref={ref}
        role="status"
        className={['rp-status-badge', className].filter(Boolean).join(' ')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--rp-space-1)',
          background: bg,
          color: fg,
          fontFamily: 'var(--rp-font-family)',
          fontSize: 'var(--rp-font-size-sm)',
          fontWeight: 'var(--rp-font-weight-medium)',
          borderRadius: '999px',
          padding: '4px var(--rp-space-2)',
          ...style,
        }}
        {...props}
      >
        <Icon size={16} />
        {label}
      </span>
    );
  },
);
StatusBadge.displayName = 'StatusBadge';

/** Alias — "Pill" is the name used in ui-design.md's screen inventory; StatusBadge is the same component. */
export const Pill = StatusBadge;
