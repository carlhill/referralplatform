import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

export type ButtonVariant = 'primary' | 'secondary' | 'urgent' | 'ghost';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Primary = the one accent-coloured action per screen, per ui-design.md. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render as a different element (e.g. a Next.js <Link>) while keeping button styling/behaviour. */
  asChild?: boolean;
}

const variantStyle: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--rp-color-accent-500)',
    color: 'var(--rp-color-text-inverse)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--rp-color-bg)',
    color: 'var(--rp-color-primary-600)',
    border: '1px solid var(--rp-color-border)',
  },
  urgent: {
    background: 'var(--rp-color-urgent-500)',
    color: 'var(--rp-color-text-inverse)',
    border: '1px solid transparent',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--rp-color-primary-600)',
    border: '1px solid transparent',
  },
};

const sizeStyle: Record<ButtonSize, React.CSSProperties> = {
  md: {
    minHeight: 'var(--rp-touch-target-min)',
    padding: '0 var(--rp-space-3)',
    fontSize: 'var(--rp-font-size-body)',
  },
  lg: {
    minHeight: '56px',
    padding: '0 var(--rp-space-4)',
    fontSize: 'var(--rp-font-size-lg)',
  },
};

/**
 * Button — the only accent-coloured (`primary`) button should be the single
 * primary action on a given screen ("referral status", "approve GP link",
 * "confirm booking"); everything else is `secondary` or `ghost`, per
 * claude/ui-design.md's hierarchy between primary and secondary actions.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', asChild = false, style, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={['rp-button', className].filter(Boolean).join(' ')}
        style={{
          fontFamily: 'var(--rp-font-family)',
          fontWeight: 'var(--rp-font-weight-medium)',
          borderRadius: 'var(--rp-radius-md)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--rp-space-2)',
          ...variantStyle[variant],
          ...sizeStyle[size],
          ...style,
        }}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
