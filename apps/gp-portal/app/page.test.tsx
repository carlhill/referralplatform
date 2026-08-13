import * as React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from './page';

describe('HomePage', () => {
  it('renders the app title', () => {
    render(<HomePage />);
    expect(screen.getByText('ReferralPlatform — GP Portal')).toBeInTheDocument();
  });
});
