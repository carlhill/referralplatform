import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Skeleton screen — see claude/ui-design.md, "Patient/carer mobile app (+ companion
 * web)" for the real screen inventory (Onboarding, Home/dashboard, Referral detail,
 * Booking, New GP approval, Consent & security, Raise a concern, Document vault).
 * Passkey/WebAuthn support on React Native is flagged as a real risk in
 * claude/solution-architecture-tech-stack.md — budget time to validate it early.
 *
 * NOTE: uses a plain `View` for this placeholder, not `SafeAreaView` from
 * react-native (deprecated) — wire up `react-native-safe-area-context` when
 * the real Onboarding/Home screens replace this skeleton.
 */
export default function App() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>ReferralPlatform</Text>
        <Text style={styles.subtitle}>Patient &amp; carer app — skeleton, not yet implemented</Text>
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#172023',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#172023',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: '#566268',
  },
});
