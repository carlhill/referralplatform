import * as React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import type { StatusTone } from '../lib/ui/status';

/**
 * A small, self-contained React Native design system for this app.
 * `@referralplatform/ui-components` (root CONVENTIONS.md §4) is web-only
 * (DOM elements, `lucide-react`, CSS custom properties via `tokens.css`) —
 * not usable from React Native — so this file re-expresses the same visual
 * vocabulary (Card, Button, StatusBadge, FormField equivalents) with plain
 * React Native primitives. Colours are hand-copied from
 * packages/ui-components/src/tokens.css so the two surfaces read as one
 * product; if that file's palette changes, update COLORS below too.
 */
export const COLORS = {
  bg: '#ffffff',
  bgSubtle: '#f4f6f7',
  border: '#dde3e6',
  text: '#172023',
  textMuted: '#566268',
  textInverse: '#ffffff',
  primary600: '#0b5566',
  accent500: '#0f7d8f',
  success100: '#e0f5ea',
  success500: '#1f8a52',
  attention100: '#fdf1de',
  attention500: '#b5690a',
  urgent100: '#fbe4e2',
  urgent500: '#c22e21',
};

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bgSubtle }}
      contentContainerStyle={[styles.screenContent, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.cardTitle}>{children}</Text>;
}

export function Body({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function MutedText({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export type ButtonVariant = 'primary' | 'secondary' | 'urgent' | 'ghost';

export interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
}

const buttonVariantStyle: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: COLORS.accent500, borderColor: 'transparent' },
  secondary: { backgroundColor: COLORS.bg, borderColor: COLORS.border },
  urgent: { backgroundColor: COLORS.urgent500, borderColor: 'transparent' },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
};

const buttonVariantTextColor: Record<ButtonVariant, string> = {
  primary: COLORS.textInverse,
  secondary: COLORS.primary600,
  urgent: COLORS.textInverse,
  ghost: COLORS.primary600,
};

export function Button({ children, onPress, variant = 'secondary', disabled, testID }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        buttonVariantStyle[variant],
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, { color: buttonVariantTextColor[variant] }]}>{children}</Text>
    </Pressable>
  );
}

const toneStyle: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: COLORS.bgSubtle, fg: COLORS.textMuted },
  success: { bg: COLORS.success100, fg: COLORS.success500 },
  attention: { bg: COLORS.attention100, fg: COLORS.attention500 },
  urgent: { bg: COLORS.urgent100, fg: COLORS.urgent500 },
};

export function StatusBadge({ tone = 'neutral', label }: { tone?: StatusTone; label: string }) {
  const { bg, fg } = toneStyle[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} accessibilityRole="text">
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, style, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={COLORS.textMuted}
        {...inputProps}
      />
      {error && (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loadingRow} accessibilityRole="progressbar">
      <ActivityIndicator color={COLORS.accent500} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: COLORS.urgent100, borderWidth: 1 }}>
      <StatusBadge tone="urgent" label="Something went wrong" />
      <Text style={[styles.body, { marginTop: 8 }]} accessibilityRole="alert">
        {message}
      </Text>
      {onRetry && (
        <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
          <Button variant="secondary" onPress={onRetry}>
            Try again
          </Button>
        </View>
      )}
    </Card>
  );
}

export function RadioOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }} style={styles.radioRow}>
      <View style={[styles.radioOuter, selected && { borderColor: COLORS.accent500 }]}>
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.body}>{label}</Text>
    </Pressable>
  );
}

export function Checkbox({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.radioRow}>
      <View
        style={[styles.checkboxOuter, checked && { backgroundColor: COLORS.accent500, borderColor: COLORS.accent500 }]}
      >
        {checked && <Text style={{ color: COLORS.textInverse, fontSize: 12, fontWeight: '700' }}>✓</Text>}
      </View>
      <Text style={styles.body}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: { padding: 16, gap: 16 },
  card: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  body: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  muted: { fontSize: 13, color: COLORS.textMuted },
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  field: { gap: 4, marginBottom: 4 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  fieldHint: { fontSize: 12, color: COLORS.textMuted },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    minHeight: 44,
  },
  inputError: { borderColor: COLORS.urgent500 },
  fieldError: { fontSize: 12, color: COLORS.urgent500 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent500 },
  checkboxOuter: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
