import * as React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('renders a human-readable label for a snake_case status', () => {
    render(<StatusPill status="in_review" />);
    expect(screen.getByText('In review')).toBeInTheDocument();
  });

  it('never conveys status by colour alone — every pill has a text label', () => {
    render(<StatusPill status="completed" />);
    expect(screen.getByRole('status')).toHaveTextContent('Completed');
  });

  it('falls back to a humanized, capitalised label for an unmapped status', () => {
    render(<StatusPill status="some_new_status" />);
    expect(screen.getByText('Some new status')).toBeInTheDocument();
  });
});
