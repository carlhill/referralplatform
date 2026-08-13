import * as React from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { config } from '../api/config';
import { decodeJwt, hasStepUp, isExpired, rolesOf, type DecodedAccessToken } from './jwt';
import { buildLocalActivationSession, endSessionEndpoint, isTokenSetExpired, type TokenSet } from './oidc';
import { clearTokens, loadTokens, saveTokens } from './storage';

WebBrowser.maybeCompleteAuthSession();

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `${config.keycloakIssuer}/protocol/openid-connect/auth`,
  tokenEndpoint: `${config.keycloakIssuer}/protocol/openid-connect/token`,
  revocationEndpoint: `${config.keycloakIssuer}/protocol/openid-connect/revoke`,
};

export interface AuthPrincipal {
  sub: string;
  principalType: DecodedAccessToken['principal_type'];
  displayName: string;
  healthcareIdentifier?: string;
  roles: string[];
  hasStepUp: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  principal: AuthPrincipal | null;
  accessToken: string | null;
  wrongPrincipalType: boolean;
  /**
   * Kicks off the real Keycloak Authorization Code + PKCE flow via
   * `expo-auth-session` (bound to the `patient-carer-browser` auth flow —
   * passkey ALTERNATIVE to password+conditional-OTP). `request` is `null`
   * until `expo-auth-session` finishes preparing the PKCE parameters; guard
   * UI on that before calling `login()`.
   *
   * KNOWN GAP (see BUILD_LOG/patient-app.md): no Keycloak user is
   * provisioned for a patient/carer anywhere in this build yet — this is
   * real, correctly-shaped PKCE code (verified: `request` prepares a valid
   * authorization URL with S256 `code_challenge`), but there is no user
   * account on the other end of it until that provisioning gap is closed.
   * Use `startLocalActivationSession` (wired to the onboarding flow) to
   * exercise the rest of the app in local dev until then.
   */
  login: () => Promise<void>;
  request: AuthSession.AuthRequest | null;
  logout: () => Promise<void>;
  startLocalActivationSession: (patientId: string, role: 'patient' | 'carer') => Promise<void>;
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
    hasStepUp: hasStepUp(decoded),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>('loading');
  const [tokens, setTokens] = React.useState<TokenSet | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'referralplatform', path: 'callback' });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.keycloakClientId,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    discovery,
  );

  const applyTokens = React.useCallback(async (next: TokenSet | null) => {
    if (next) {
      await saveTokens(JSON.stringify(next));
    } else {
      await clearTokens();
    }
    setTokens(next);
    setStatus(next ? 'authenticated' : 'unauthenticated');
  }, []);

  React.useEffect(() => {
    (async () => {
      const raw = await loadTokens();
      if (!raw) {
        setStatus('unauthenticated');
        return;
      }
      try {
        const parsed = JSON.parse(raw) as TokenSet;
        if (isTokenSetExpired(parsed) && !parsed.accessToken.endsWith('.LOCALDEV')) {
          await clearTokens();
          setStatus('unauthenticated');
          return;
        }
        setTokens(parsed);
        setStatus('authenticated');
      } catch {
        await clearTokens();
        setStatus('unauthenticated');
      }
    })();
  }, []);

  // Handle the redirect back from Keycloak's hosted login once expo-auth-session resolves it.
  React.useEffect(() => {
    if (response?.type !== 'success' || !request?.codeVerifier) return;
    (async () => {
      try {
        const result = await AuthSession.exchangeCodeAsync(
          {
            clientId: config.keycloakClientId,
            code: response.params.code,
            redirectUri,
            extraParams: { code_verifier: request.codeVerifier! },
          },
          discovery,
        );
        await applyTokens({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          idToken: result.idToken,
          obtainedAt: Date.now(),
          expiresInSeconds: result.expiresIn ?? 300,
        });
      } catch {
        // Surfaced by status staying 'unauthenticated' — LoginScreen shows a retry prompt.
        await applyTokens(null);
      }
    })();
  }, [response]);

  const decoded = tokens ? decodeJwt(tokens.accessToken) : null;
  const principal = tokens && !isExpired(decoded) ? principalFromTokens(tokens) : null;

  const value: AuthContextValue = {
    status,
    principal,
    accessToken: tokens?.accessToken ?? null,
    wrongPrincipalType: !!principal && principal.principalType !== 'patient' && principal.principalType !== 'carer',
    request,
    login: async () => {
      await promptAsync();
    },
    logout: async () => {
      const idToken = tokens?.idToken;
      await applyTokens(null);
      if (!idToken) return; // local activation session — nothing to end at Keycloak
      try {
        await fetch(
          `${endSessionEndpoint()}?${new URLSearchParams({ client_id: config.keycloakClientId, id_token_hint: idToken }).toString()}`,
        );
      } catch {
        // Best-effort — local session is already cleared regardless.
      }
    },
    startLocalActivationSession: async (patientId, role) => {
      await applyTokens(buildLocalActivationSession(patientId, role));
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
