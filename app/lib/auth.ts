/**
 * Google sign-in on the device. Authorization code + PKCE against an iOS
 * OAuth client (no client secret). Tokens live in the Keychain via
 * expo-secure-store; the refresh token keeps the app signed in.
 */
import {
  AuthRequest,
  DiscoveryDocument,
  exchangeCodeAsync,
  makeRedirectUri,
  refreshAsync,
  revokeAsync,
  TokenResponse,
} from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/**
 * youtube (not youtube.readonly): the app saves to playlists and likes.
 * openid/email/profile: the profile tab shows the Google account.
 */
const SCOPES = ['https://www.googleapis.com/auth/youtube', 'openid', 'email', 'profile'];

const discovery: DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/** Google iOS clients redirect to their reversed client id as a URL scheme. */
export function reversedClientId(clientId = GOOGLE_CLIENT_ID): string {
  const [id, ...rest] = clientId.split('.');
  return [...rest.reverse(), id].join('.');
}

function redirectUri(): string {
  return makeRedirectUri({ native: `${reversedClientId()}:/oauthredirect` });
}

type StoredTokens = { accessToken: string; refreshToken: string; expiresAt: number };

const STORE_KEY = 'google_tokens';
let tokens: StoredTokens | null | undefined; // undefined = not loaded yet
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

async function loadTokens(): Promise<StoredTokens | null> {
  if (tokens !== undefined) return tokens;
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    tokens = raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    tokens = null;
  }
  return tokens;
}

async function saveTokens(t: StoredTokens | null) {
  tokens = t;
  if (t) await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(t));
  else await SecureStore.deleteItemAsync(STORE_KEY);
  notify();
}

function fromResponse(r: TokenResponse, previousRefresh?: string): StoredTokens {
  const refreshToken = r.refreshToken ?? previousRefresh;
  if (!refreshToken) throw new Error('Google did not return a refresh token. Sign out and in again.');
  return {
    accessToken: r.accessToken,
    refreshToken,
    expiresAt: (r.issuedAt + (r.expiresIn ?? 3600)) * 1000,
  };
}

export class NotSignedIn extends Error {
  constructor() {
    super('Not signed in');
  }
}

/** Google ended the session (refresh token expired or revoked); the sign-in screen says so. */
export class SessionExpired extends NotSignedIn {
  constructor() {
    super();
    this.message = 'Your Google sign-in expired. Sign in again to continue.';
  }
}

/** True from the moment Google rejects the refresh token until the next sign-in. */
let expired = false;

/** The last signed-in email, so signing in again skips Google's account chooser. */
const EMAIL_KEY = 'google_email';

let refreshing: Promise<string> | null = null;

async function refresh(t: StoredTokens): Promise<string> {
  try {
    const r = await refreshAsync({ clientId: GOOGLE_CLIENT_ID, refreshToken: t.refreshToken }, discovery);
    const next = fromResponse(r, t.refreshToken);
    await saveTokens(next);
    return next.accessToken;
  } catch (e: any) {
    // invalid_grant = revoked or expired refresh token (7 days while the
    // Google Cloud consent screen is in Testing). expo-auth-session puts it
    // in e.code; e.message is Google's description. Force a fresh sign-in.
    if (e?.code === 'invalid_grant' || String(e?.message ?? e).includes('invalid_grant')) {
      expired = true;
      await saveTokens(null);
      throw new SessionExpired();
    }
    throw e;
  }
}

/**
 * A valid access token, refreshed when within a minute of expiry. Pass the
 * token an API call just had rejected (401) as `rejected` to force a refresh.
 * Concurrent callers share one refresh.
 */
export async function getAccessToken(rejected?: string): Promise<string> {
  const t = await loadTokens();
  if (!t) throw expired ? new SessionExpired() : new NotSignedIn();
  if (t.accessToken !== rejected && Date.now() < t.expiresAt - 60_000) return t.accessToken;
  refreshing ??= refresh(t).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function signIn(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set in app/.env');
  }
  const hint = await SecureStore.getItemAsync(EMAIL_KEY).catch(() => null);
  const request = new AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: SCOPES,
    redirectUri: redirectUri(),
    usePKCE: true,
    extraParams: hint ? { login_hint: hint } : undefined,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') {
    if (result.type === 'cancel' || result.type === 'dismiss') return;
    throw new Error(`Sign-in failed: ${(result as any).params?.error ?? result.type}`);
  }
  const r = await exchangeCodeAsync(
    {
      clientId: GOOGLE_CLIENT_ID,
      code: result.params.code,
      redirectUri: redirectUri(),
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    discovery,
  );
  expired = false;
  await saveTokens(fromResponse(r));
  googleAccount().catch(() => {}); // remembers the email for next time
}

export async function signOut(): Promise<void> {
  const t = await loadTokens();
  if (t) {
    try {
      await revokeAsync({ clientId: GOOGLE_CLIENT_ID, token: t.refreshToken }, discovery);
    } catch {
      // Revocation is best effort; the local copy is gone either way.
    }
  }
  expired = false;
  await SecureStore.deleteItemAsync(EMAIL_KEY).catch(() => {});
  await saveTokens(null);
}

export type GoogleAccount = { name: string | null; email: string | null; picture: string | null };

/**
 * The Google account behind the token. Tokens issued before the profile
 * scopes were added get a 401/403 here; the caller treats null as "sign out
 * and in again to see this".
 */
export async function googleAccount(): Promise<GoogleAccount | null> {
  const token = await getAccessToken();
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (j.email) SecureStore.setItemAsync(EMAIL_KEY, j.email).catch(() => {});
  return { name: j.name ?? null, email: j.email ?? null, picture: j.picture ?? null };
}

/** { ready, signedIn, expired } for the auth gate in the root layout and the sign-in screen. */
export function useAuth() {
  const [state, setState] = useState<{ ready: boolean; signedIn: boolean; expired: boolean }>({
    ready: tokens !== undefined,
    signedIn: !!tokens,
    expired,
  });
  useEffect(() => {
    let alive = true;
    const sync = () => alive && setState({ ready: true, signedIn: !!tokens, expired });
    loadTokens().then(sync);
    listeners.add(sync);
    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, []);
  return state;
}
