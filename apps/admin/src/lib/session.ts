import type { AuthPrincipalView, AuthTokens } from './types';

/* Admin session store, fresh rebuild 2026-11-28.
   The access token lives only in memory in this module, so it is
   never persisted where a later visitor of the machine could read
   it back. The refresh token lives in sessionStorage: it survives
   reloads inside the tab session, clears when the tab closes, and
   is never written to localStorage or a cookie. The API stores
   only a hash of the refresh token and rotates it on every use. */

const REFRESH_TOKEN_KEY = 'dostelo-admin-refresh-token';

export type SessionStatus = 'restoring' | 'signed-in' | 'signed-out';

export interface SessionSnapshot {
  status: SessionStatus;
  principal: AuthPrincipalView | null;
  displayName: string | null;
}

let accessToken: string | null = null;
let principal: AuthPrincipalView | null = null;
let displayName: string | null = null;
let status: SessionStatus = 'restoring';
let snapshot: SessionSnapshot = { status, principal, displayName };
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { status, principal, displayName };
  for (const listener of listeners) listener();
}

function nameFromAccessToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { name?: unknown };
    return typeof decoded.name === 'string' ? decoded.name : null;
  } catch {
    return null;
  }
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function applyTokens(tokens: AuthTokens): void {
  accessToken = tokens.accessToken;
  principal = tokens.principal;
  displayName = nameFromAccessToken(tokens.accessToken);
  status = 'signed-in';
  try {
    window.sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } catch {
    // Storage unavailable: the session still works in memory.
  }
  emit();
}

export function markSignedOut(): void {
  accessToken = null;
  principal = null;
  displayName = null;
  status = 'signed-out';
  emit();
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
  markSignedOut();
}

let expiring = false;

export function expireSession(): void {
  if (expiring) return;
  expiring = true;
  clearSession();
  if (
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login')
  ) {
    window.location.assign('/login');
  }
}
