import * as React from 'react';
import { render } from '@testing-library/react-native';
import App from './App';

describe('App', () => {
  it('renders the ReferralPlatform title', () => {
    const { getByText } = render(<App />);
    expect(getByText('ReferralPlatform')).toBeTruthy();
  });
});
