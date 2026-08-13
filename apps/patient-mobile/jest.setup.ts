/**
 * Manual mocks for native Expo modules this app depends on, so unit/component
 * tests run under Jest (Node, no simulator/device) without touching real
 * native bindings. `jest-expo`'s preset does not ship mocks for these
 * specific packages out of the box — see BUILD_LOG/patient-app.md. `.ts`
 * (not `.js`) so typescript-eslint's TS override (which turns off `no-undef`
 * for TS files, since the TS compiler already covers that) applies to the
 * `jest`/`require` globals used below — matching how every other
 * `*.test.ts` file in this monorepo already avoids `no-undef` on `jest`.
 */
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(false),
  isEnrolledAsync: jest.fn().mockResolvedValue(false),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([]),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  parse: jest.fn().mockReturnValue({ queryParams: {} }),
  createURL: jest.fn().mockReturnValue('referralplatform://'),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn().mockReturnValue({ type: 'success' }),
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn().mockReturnValue('referralplatform://callback'),
  useAuthRequest: jest.fn().mockReturnValue([null, null, jest.fn()]),
  exchangeCodeAsync: jest
    .fn()
    .mockResolvedValue({ accessToken: 'mock', refreshToken: 'mock', idToken: 'mock', expiresIn: 300 }),
  ResponseType: { Code: 'code' },
}));

jest.mock('react-native-safe-area-context', () => {
  // jest.mock() factories can't reference top-level ES import bindings (Jest's
  // hoisting restriction) — require() inside the factory is the standard workaround.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    SafeAreaView: ({ children, ...props }: { children: unknown }) => ReactLib.createElement(View, props, children),
    SafeAreaConsumer: ({ children }: { children: (inset: unknown) => unknown }) => children(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
  };
});
