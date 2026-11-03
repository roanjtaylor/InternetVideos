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

/** youtube (not youtube.readonly): the app saves to playlists and likes. */
const SCOPES = ['https://www.googleapis.com/auth/youtube'];

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

/** A valid access token, refreshed when within a minute of expiry. */
export async function getAccessToken(): Promise<string> {
  const t = await loadTokens();
  if (!t) throw new NotSignedIn();
  if (Date.now() < t.expiresAt - 60_000) return t.accessToken;
  try {
    const r = await refreshAsync({ clientId: GOOGLE_CLIENT_ID, refreshToken: t.refreshToken }, discovery);
    const next = fromResponse(r, t.refreshToken);
    await saveTokens(next);
    return next.accessToken;
  } catch (e: any) {
    // invalid_grant = revoked or expired refresh token (7 days while the
    // Google Cloud consent screen is in Testing). Force a fresh sign-in.
    if (String(e?.message ?? e).includes('invalid_grant')) await saveTokens(null);
    throw e;
  }
}

export async function signIn(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set in app/.env');
  }
  const request = new AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: SCOPES,
    redirectUri: redirectUri(),
    usePKCE: true,
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
  await saveTokens(fromResponse(r));
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
  await saveTokens(null);
}

/** { ready, signedIn } for the auth gate in the root layout. */
export function useAuth() {
  const [state, setState] = useState<{ ready: boolean; signedIn: boolean }>({
    ready: tokens !== undefined,
    signedIn: !!tokens,
  });
  useEffect(() => {
    let alive = true;
    const sync = () => alive && setState({ ready: true, signedIn: !!tokens });
    loadTokens().then(sync);
    listeners.add(sync);
    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, []);
  return state;
}
