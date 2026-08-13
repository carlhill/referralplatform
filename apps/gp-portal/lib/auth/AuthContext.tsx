'use client';

import * as React from 'react';
import { config } from '../api/config';
import { decodeJwt, isExpired, rolesOf, type DecodedAccessToken } from './jwt';
import {
  clearStoredTokens,
  endSessionEndpoint,
  isTokenSetExpired,
  loadStoredTokens,
  refreshTokens,
  startLogin,
  storeTokens,
  type TokenSet,
} from './oidc-client';

export interface AuthPrincipal {
  sub: string;
  principalType: DecodedAccessToken['principal_type'];
  displayName: string;
  healthcareIdentifier?: string;
  roles: string[];
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  principal: AuthPrincipal | null;
  accessToken: string | null;
  /** True once the signed-in principal is not a `gp`/`internal_staff` — the portal is GP-only. */
  wrongPrincipalType: boolean;
  login: (postLoginPath?: string) => Promise<void>;
  logout: () => void;
  /** Re-reads tokens from storage — call after `handleCallback()` completes on `/callback`. */
  refreshFromStorage: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

function principalFromTokens(tokens: TokenSet): AuthPrincipal | null {
  const decoded = decodeJwt(tokens.accessToken);
  if (!decoded) return null;
  return {
    sub: decoded.sub,
    principalType: decoded.principal_type,
    displayName: decoded.name ?? decoded.preferred_username ?? decoded.sub,
    healthcareIdentifier: decoded.healthcare_identifier,
    roles: rolesOf(decoded),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>('loading');
  const [tokens, setTokens] = React.useState<TokenSet | null>(null);
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyTokens = React.useCallback((next: TokenSet | null) => {
    setTokens(next);
    setStatus(next ? 'authenticated' : 'unauthenticated');
  }, []);

  const scheduleRefresh = React.useCallback(
    (current: TokenSet) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (!current.refreshToken) return;
      const expiresAt = current.obtainedAt + current.expiresInSeconds * 1000;
      const delay = Math.max(expiresAt - Date.now() - 60_000, 5_000); // refresh 60s before expiry
      refreshTimer.current = setTimeout(async () => {
        try {
          const next = await refreshTokens(current.refreshToken!);
          storeTokens(next);
          applyTokens(next);
          scheduleRefresh(next);
        } catch {
          clearStoredTokens();
          applyTokens(null);
        }
      }, delay);
    },
    [applyTokens],
  );

  const loadFromStorage = React.useCallback(async () => {
    const stored = loadStoredTokens();
    if (!stored) {
      applyTokens(null);
      return;
    }
    if (isTokenSetExpired(stored)) {
      if (!stored.refreshToken) {
        clearStoredTokens();
        applyTokens(null);
        return;
      }
      try {
        const next = await refreshTokens(stored.refreshToken);
        storeTokens(next);
        applyTokens(next);
        scheduleRefresh(next);
      } catch {
        clearStoredTokens();
        applyTokens(null);
      }
      return;
    }
    applyTokens(stored);
    scheduleRefresh(stored);
  }, [applyTokens, scheduleRefresh]);

  React.useEffect(() => {
    void loadFromStorage();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const decoded = tokens ? decodeJwt(tokens.accessToken) : null;
  const principal = tokens && !isExpired(decoded) ? principalFromTokens(tokens) : null;

  const value: AuthContextValue = {
    status,
    principal,
    accessToken: tokens?.accessToken ?? null,
    wrongPrincipalType: !!principal && principal.principalType !== 'gp' && principal.principalType !== 'internal_staff',
    login: (postLoginPath) => startLogin(postLoginPath ?? window.location.pathname),
    logout: () => {
      const idToken = tokens?.idToken;
      clearStoredTokens();
      applyTokens(null);
      const params = new URLSearchParams({
        client_id: config.keycloakClientId,
        post_logout_redirect_uri: config.appBaseUrl,
      });
      if (idToken) params.set('id_token_hint', idToken);
      window.location.assign(`${endSessionEndpoint()}?${params.toString()}`);
    },
    refreshFromStorage: () => void loadFromStorage(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
