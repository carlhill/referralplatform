import * as React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import App from './App';

describe('App', () => {
  it('boots to the sign-in screen when no session is stored', async () => {
    const { getByText } = render(<App />);
    await waitFor(() => expect(getByText('Sign in to ReferralPlatform')).toBeTruthy(), { timeout: 5000 });
    expect(getByText(/Continue setting up a new account/)).toBeTruthy();
  });
});
