import type { AuthPrincipalView, AuthTokens } from '@dostelo/types';

/**
 * Admin session store (Phase 4, chunk 2).
 *
 * Storage choice, and its trade-off (also documented in the admin
 * README): the access token lives only in memory in this module,
 * so it never persists anywhere an XSS payload or a later visitor
 * of the machine could read it back, at the cost of a refresh
 * round-trip on every full page load. The refresh token lives in
 * sessionStorage: it survives reloads within the tab session but
 * is cleared when the tab closes, and it is never written to
 * localStorage or a cookie. The API stores only a hash of the
 * refresh token and rotates it on every use, so a leaked value
 * has a short useful life and reuse revokes the session family.
 */

const REFRESH_TOKEN_KEY = 'dostelo-admin-refresh-token';

export type SessionStatus = 'restoring' | 'signed-in' | 'signed-out';

export interface SessionSnapshot {
  status: SessionStatus;
  principal: AuthPrincipalView | null;
  /** Display name decoded from the access token's name claim.
   * Presentation only; the API verifies the token itself. */
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

/** Current access token for the API client, or null. */
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

/** Stores a fresh token pair from login, MFA exchange or refresh. */
export function applyTokens(tokens: AuthTokens): void {
  accessToken = tokens.accessToken;
  principal = tokens.principal;
  displayName = nameFromAccessToken(tokens.accessToken);
  status = 'signed-in';
  try {
    window.sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } catch {
    // Storage unavailable (private mode): the session still works
    // in memory until the tab reloads.
  }
  emit();
}

/** Marks the restore attempt finished with no session. */
export function markSignedOut(): void {
  accessToken = null;
  principal = null;
  displayName = null;
  status = 'signed-out';
  emit();
}

/** Clears every trace of the session locally. */
export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
  markSignedOut();
}

let expiring = false;

/**
 * Session expiry path for 401 responses: drop the tokens and send
 * the browser to the login page. Guarded so a burst of parallel
 * 401s redirects once.
 */
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
