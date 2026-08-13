import * as React from 'react';

/**
 * A deliberately minimal, state-based in-app router — NOT `@react-navigation`.
 * Judgment call (documented in BUILD_LOG/patient-app.md): this app's screen
 * inventory is a fairly shallow tree (no nested tab/stack combinations), and
 * `@react-navigation`'s native dependencies (`react-native-screens`,
 * `react-native-safe-area-context`, `react-native-gesture-handler`) add real
 * risk of native-linking breakage in a sandboxed build/test environment with
 * no simulator to verify against (this repo's own root CONVENTIONS.md/
 * patient-mobile README already flags that constraint). A plain
 * `useState`-driven route + params, exposed via context, keeps every screen a
 * plain component that's trivially testable with
 * `@testing-library/react-native`, and can be swapped for real navigation
 * later without changing any screen's internals (each screen already just
 * receives `params` and calls `navigate()`).
 */
export type RouteName =
  | 'onboarding-token'
  | 'onboarding-verify-identity'
  | 'onboarding-branch'
  | 'onboarding-otp'
  | 'onboarding-success'
  | 'login'
  | 'home'
  | 'referrals'
  | 'referral-detail'
  | 'booking'
  | 'gp-approvals'
  | 'consent-security'
  | 'concern'
  | 'documents';

export interface Route {
  name: RouteName;
  params?: Record<string, string>;
}

export interface NavContextValue {
  route: Route;
  navigate: (name: RouteName, params?: Record<string, string>) => void;
  /** Simple one-level "back" — pops to the previous route in this session's history. */
  goBack: () => void;
  history: Route[];
}

const NavContext = React.createContext<NavContextValue | null>(null);

export function NavProvider({ initial, children }: { initial: Route; children: React.ReactNode }) {
  const [history, setHistory] = React.useState<Route[]>([initial]);

  const navigate = React.useCallback((name: RouteName, params?: Record<string, string>) => {
    setHistory((prev) => [...prev, { name, params }]);
  }, []);

  const goBack = React.useCallback(() => {
    setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const value: NavContextValue = {
    route: history[history.length - 1],
    navigate,
    goBack,
    history,
  };

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = React.useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within a NavProvider');
  return ctx;
}
