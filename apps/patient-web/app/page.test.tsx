import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from './page';
import { AuthProvider } from '../lib/auth/AuthContext';

describe('HomePage', () => {
  it('renders the signed-out landing state', async () => {
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('ReferralPlatform — Patient Companion Web')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Activate a new account' })).toBeInTheDocument();
  });
});
