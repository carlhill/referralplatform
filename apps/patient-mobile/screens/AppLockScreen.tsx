import * as React from 'react';
import { View } from 'react-native';
import { Body, Button, Card, CardTitle, ErrorState } from '../components/ui';

export function AppLockScreen({ onRetry, error }: { onRetry: () => void; error?: string | null }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#f4f6f7' }}>
      <Card>
        <CardTitle>ReferralPlatform is locked</CardTitle>
        <Body>Unlock with your device&apos;s fingerprint, face, or passcode to continue.</Body>
        {error && <ErrorState message={error} />}
        <Button variant="primary" onPress={onRetry}>
          Unlock
        </Button>
      </Card>
    </View>
  );
}
