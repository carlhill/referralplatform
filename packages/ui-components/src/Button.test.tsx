import * as React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Confirm booking</Button>);
    expect(screen.getByText('Confirm booking')).toBeInTheDocument();
  });

  it('renders as a native button by default', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });
});
