import * as React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from './page';
import { AuthProvider } from './lib/auth/AuthContext';

describe('HomePage', () => {
  it('gates the dashboard behind sign-in when there is no session', async () => {
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );
    expect(await screen.findByText('Sign in required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
