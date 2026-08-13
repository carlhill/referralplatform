import * as React from 'react';
import { View } from 'react-native';
import { useAuth } from '../lib/auth/AuthContext';
import { useNav } from '../lib/nav';
import { LoadingState } from '../components/ui';
import { OnboardingTokenScreen } from './OnboardingTokenScreen';
import { VerifyIdentityScreen } from './VerifyIdentityScreen';
import { SelectBranchScreen } from './SelectBranchScreen';
import { OtpScreen } from './OtpScreen';
import { ActivationSuccessScreen } from './ActivationSuccessScreen';
import { LoginScreen } from './LoginScreen';
import { HomeScreen } from './HomeScreen';
import { ReferralsScreen } from './ReferralsScreen';
import { ReferralDetailScreen } from './ReferralDetailScreen';
import { BookingScreen } from './BookingScreen';
import { GpApprovalsScreen } from './GpApprovalsScreen';
import { ConsentSecurityScreen } from './ConsentSecurityScreen';
import { ConcernScreen } from './ConcernScreen';
import { DocumentVaultScreen } from './DocumentVaultScreen';

const PROTECTED_ROUTES = new Set([
  'home',
  'referrals',
  'referral-detail',
  'booking',
  'gp-approvals',
  'consent-security',
  'concern',
  'documents',
]);

/** Renders the screen for the current in-app route (see lib/nav.tsx). */
export function RootRouter() {
  const auth = useAuth();
  const { route, navigate } = useNav();

  React.useEffect(() => {
    if (auth.status === 'unauthenticated' && PROTECTED_ROUTES.has(route.name)) {
      navigate('login');
    }
  }, [auth.status, route.name]);

  if (auth.status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
        <LoadingState label="Loading ReferralPlatform…" />
      </View>
    );
  }

  switch (route.name) {
    case 'onboarding-token':
      return <OnboardingTokenScreen />;
    case 'onboarding-verify-identity':
      return <VerifyIdentityScreen />;
    case 'onboarding-branch':
      return <SelectBranchScreen />;
    case 'onboarding-otp':
      return <OtpScreen />;
    case 'onboarding-success':
      return <ActivationSuccessScreen />;
    case 'login':
      return <LoginScreen />;
    case 'home':
      return <HomeScreen />;
    case 'referrals':
      return <ReferralsScreen />;
    case 'referral-detail':
      return <ReferralDetailScreen id={route.params?.id ?? ''} />;
    case 'booking':
      return <BookingScreen referralId={route.params?.id ?? ''} />;
    case 'gp-approvals':
      return <GpApprovalsScreen />;
    case 'consent-security':
      return <ConsentSecurityScreen />;
    case 'concern':
      return <ConcernScreen />;
    case 'documents':
      return <DocumentVaultScreen />;
    default:
      return <HomeScreen />;
  }
}
