import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';

/** Minimal prop shape every wrapped control (input/select/textarea/Radix control) accepts. */
export interface FormControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

export interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement<FormControlProps>;
}

/**
 * FormField — wraps a single form control with an accessible Radix label,
 * optional hint text, and an error message region. Every input across the
 * three surfaces should be wrapped in this rather than a bare <label>/<input>
 * pair, so accessibility (label association, aria-describedby, aria-invalid)
 * is consistent everywhere.
 */
export function FormField({ id, label, hint, error, required, children }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = React.cloneElement(children, {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
  });

  return (
    <div
      className="rp-form-field"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--rp-space-1)', marginBottom: 'var(--rp-space-3)' }}
    >
      <LabelPrimitive.Root
        htmlFor={id}
        style={{
          fontFamily: 'var(--rp-font-family)',
          fontSize: 'var(--rp-font-size-body)',
          fontWeight: 'var(--rp-font-weight-medium)',
          color: 'var(--rp-color-text)',
        }}
      >
        {label}
        {required ? ' *' : ''}
      </LabelPrimitive.Root>
      {hint && (
        <span id={hintId} style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-text-muted)' }}>
          {hint}
        </span>
      )}
      {control}
      {error && (
        <span
          id={errorId}
          role="alert"
          style={{ fontSize: 'var(--rp-font-size-sm)', color: 'var(--rp-color-urgent-500)' }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
