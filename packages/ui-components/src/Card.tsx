import * as React from 'react';

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Card — generous whitespace, restrained visual weight. The default container
 * for a referral summary, a booking offer, a Follow-up Plan, etc.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ style, className, ...props }, ref) => (
  <div
    ref={ref}
    className={['rp-card', className].filter(Boolean).join(' ')}
    style={{
      background: 'var(--rp-color-bg)',
      border: '1px solid var(--rp-color-border)',
      borderRadius: 'var(--rp-radius-lg)',
      boxShadow: 'var(--rp-shadow-card)',
      padding: 'var(--rp-space-4)',
      fontFamily: 'var(--rp-font-family)',
      color: 'var(--rp-color-text)',
      ...style,
    }}
    {...props}
  />
));
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(({ style, ...props }, ref) => (
  <div ref={ref} style={{ marginBottom: 'var(--rp-space-3)', ...style }} {...props} />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ style, ...props }, ref) => (
    <h3
      ref={ref}
      style={{
        margin: 0,
        fontSize: 'var(--rp-font-size-lg)',
        fontWeight: 'var(--rp-font-weight-bold)',
        color: 'var(--rp-color-text)',
        ...style,
      }}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardBody = React.forwardRef<HTMLDivElement, CardProps>(({ style, ...props }, ref) => (
  <div
    ref={ref}
    style={{ fontSize: 'var(--rp-font-size-body)', lineHeight: 'var(--rp-line-height-body)', ...style }}
    {...props}
  />
));
CardBody.displayName = 'CardBody';
