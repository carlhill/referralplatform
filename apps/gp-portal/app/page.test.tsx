import * as React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from './page';
import { AuthProvider } from '../lib/auth/AuthContext';

describe('HomePage', () => {
  it('renders the app title', () => {
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );
    expect(screen.getByText('ReferralPlatform — GP Portal')).toBeInTheDocument();
  });

  it('prompts sign-in when unauthenticated', async () => {
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );
    expect(await screen.findByText('Sign in to get started')).toBeInTheDocument();
  });
});
