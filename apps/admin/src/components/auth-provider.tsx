'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import {
  applyTokens,
  clearSession,
  getSessionSnapshot,
  getStoredRefreshToken,
  markSignedOut,
  subscribeSession,
  type SessionSnapshot,
} from '../lib/session';

interface AuthContextValue {
  session: SessionSnapshot;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let restoreStarted = false;

/**
 * Restores the session once per page load: when a refresh token
 * is stored in sessionStorage, exchange it for a fresh pair (the
 * API rotates it). Any failure signs the portal out cleanly.
 */
function restoreOnce(): void {
  if (restoreStarted) return;
  restoreStarted = true;
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    markSignedOut();
    return;
  }
  api
    .refreshTokens(refreshToken)
    .then((tokens) => {
      applyTokens(tokens);
    })
    .catch(() => {
      clearSession();
    });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getSessionSnapshot,
  );

  useEffect(() => {
    restoreOnce();
  }, []);

  async function signOut(): Promise<void> {
    const refreshToken = getStoredRefreshToken();
    clearSession();
    if (refreshToken) {
      try {
        await api.logout(refreshToken);
      } catch {
        // The local session is already gone; a failed server-side
        // revoke must not trap the user on a signed-in screen.
      }
    }
  }

  return (
    <AuthContext.Provider value={{ session, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}

/**
 * Gate for the dashboard route group: while the session restores,
 * show a plain loading note; when signed out, redirect to login;
 * otherwise render the portal.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'signed-out') {
      router.replace('/login');
    }
  }, [session.status, router]);

  if (session.status === 'restoring') {
    return (
      <main style={{ padding: '48px 32px' }}>
        <p style={{ color: 'var(--muted)' }}>Restoring your session...</p>
      </main>
    );
  }
  if (session.status === 'signed-out') {
    return (
      <main style={{ padding: '48px 32px' }}>
        <p style={{ color: 'var(--muted)' }}>Redirecting to sign in...</p>
      </main>
    );
  }
  return <>{children}</>;
}
