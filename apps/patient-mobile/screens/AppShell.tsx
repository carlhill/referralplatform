import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, COLORS, Screen } from '../components/ui';
import { useNav, type RouteName } from '../lib/nav';
import { useAuth } from '../lib/auth/AuthContext';

const TABS: Array<{ name: RouteName; label: string }> = [
  { name: 'home', label: 'Home' },
  { name: 'referrals', label: 'Referrals' },
  { name: 'gp-approvals', label: 'GP requests' },
  { name: 'documents', label: 'Documents' },
  { name: 'consent-security', label: 'Consent' },
  { name: 'concern', label: 'Concern' },
];

/** Shared chrome for every signed-in screen — a top nav row (no bottom tab bar dependency) plus a sign-out action. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { route, navigate, goBack, history } = useNav();
  const auth = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgSubtle }}>
      <View style={{ backgroundColor: COLORS.bg, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.primary600 }}>ReferralPlatform</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {history.length > 1 && (
              <Button variant="ghost" onPress={goBack}>
                Back
              </Button>
            )}
            <Button variant="ghost" onPress={() => void auth.logout()}>
              Sign out
            </Button>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}
        >
          {TABS.map((tab) => (
            <Button
              key={tab.name}
              variant={route.name === tab.name ? 'primary' : 'ghost'}
              onPress={() => navigate(tab.name)}
            >
              {tab.label}
            </Button>
          ))}
        </ScrollView>
      </View>
      <Screen>{children}</Screen>
    </View>
  );
}
