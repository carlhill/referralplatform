'use client';

import * as React from 'react';
import {
  type DecodedPrincipal,
  type TokenSet,
  clearTokens,
  decodeJwtPayload,
  loadTokens,
  refreshTokens,
  startLogin,
} from './oidc';

export interface AuthState {
  loading: boolean;
  accessToken: string | null;
  principal: DecodedPrincipal | null;
  login: () => void;
  logout: () => void;
  /**
   * The specialist id used to scope every API call in this app (referral
   * assignment, case ownership, directory profile, calendar connection).
   *
   * Documented gap: no service in this build maps a Keycloak principal
   * (`sub`) to a domain `SpecialistId` — `AuthenticatedPrincipal` (see
   * `packages/auth-client`) carries `sub`/`healthcareIdentifier` but
   * `services/directory`'s own BUILD_LOG flags "AuthenticatedPrincipal
   * doesn't carry an hpiI claim yet" as an open item, and no service
   * exposes a "look up my SpecialistId from my token" endpoint. Defaulting
   * to the token's own `sub` is the least-surprising placeholder (it's at
   * least stable per-login and unique per-specialist); the override lets
   * this app be exercised against seeded/demo data that uses different
   * specialist ids without waiting on that cross-service mapping to be
   * built. A real fix is a follow-up to `services/identity-access`, not to
   * this app.
   */
  specialistId: string;
  setSpecialistId: (id: string) => void;
}

const AuthContext = React.createContext<AuthState | undefined>(undefined);

const SPECIALIST_ID_STORAGE_KEY = 'rp_specialist_portal_specialist_id';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [tokens, setTokens] = React.useState<TokenSet | null>(null);
  const [specialistId, setSpecialistIdState] = React.useState<string>('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = loadTokens();
      if (!stored) {
        setLoading(false);
        return;
      }
      if (stored.expiresAt <= Date.now() + 5000) {
        const refreshed = await refreshTokens(stored);
        if (!cancelled) {
          setTokens(refreshed);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) {
        setTokens(stored);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(SPECIALIST_ID_STORAGE_KEY);
    if (stored) {
      setSpecialistIdState(stored);
    } else if (tokens?.accessToken) {
      const principal = decodeJwtPayload(tokens.accessToken);
      if (principal?.sub) setSpecialistIdState(principal.sub);
    }
  }, [tokens?.accessToken]);

  const principal = tokens ? decodeJwtPayload(tokens.accessToken) : null;

  const value: AuthState = {
    loading,
    accessToken: tokens?.accessToken ?? null,
    principal,
    login: () => {
      void startLogin();
    },
    logout: () => {
      clearTokens();
      setTokens(null);
    },
    specialistId,
    setSpecialistId: (id: string) => {
      window.localStorage.setItem(SPECIALIST_ID_STORAGE_KEY, id);
      setSpecialistIdState(id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/** Called by the /callback page once tokens are exchanged, to force this provider to pick them up without a full reload. */
export function useRefreshAuthFromStorage() {
  const [, force] = React.useState(0);
  return () => force((n) => n + 1);
}
