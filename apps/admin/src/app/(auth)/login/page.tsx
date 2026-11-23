'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { isMfaChallenge, type MfaChallenge } from '@dostelo/types';
import { api, toUiError } from '../../../lib/api';
import { applyTokens } from '../../../lib/session';

/**
 * Admin sign in (Phase 4, chunk 2). Password login against the
 * API; when the account has MFA enabled the API answers with an
 * mfaRequired challenge instead of tokens, and this page shows
 * the TOTP step and completes the login through the MFA exchange.
 * Tokens land in the session store: access token in memory,
 * refresh token in sessionStorage (see src/lib/session.ts).
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handlePasswordLogin(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.loginAdmin({ email, password });
      if (isMfaChallenge(result)) {
        setChallenge(result);
        setBusy(false);
        return;
      }
      applyTokens(result);
      router.replace('/dashboard');
    } catch (caught) {
      setError(toUiError(caught).message);
      setBusy(false);
    }
  }

  async function handleMfaExchange(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.exchangeAdminMfa({
        challengeId: challenge.challengeId,
        code,
      });
      applyTokens(tokens);
      router.replace('/dashboard');
    } catch (caught) {
      setError(toUiError(caught).message);
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
      }}
    >
      <form
        onSubmit={challenge ? handleMfaExchange : handlePasswordLogin}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-lg)',
          maxWidth: 380,
          padding: 32,
          width: '100%',
        }}
      >
        <div
          style={{
            color: 'var(--ink)',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.08em',
          }}
        >
          DOSTELO
        </div>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>
          Admin sign in. Staff only.
        </p>

        {challenge ? (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 16 }}>
              This account uses two-factor authentication. Enter the
              six-digit code from your authenticator app.
            </p>
            <label className="field" htmlFor="code">
              Authentication code
            </label>
            <input
              id="code"
              name="code"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
            <button
              type="submit"
              className="btn"
              style={{ marginTop: 24, width: '100%' }}
              disabled={busy}
            >
              {busy ? 'Verifying...' : 'Verify and sign in'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 10, width: '100%' }}
              disabled={busy}
              onClick={() => {
                setChallenge(null);
                setCode('');
                setError(null);
              }}
            >
              Back
            </button>
          </>
        ) : (
          <>
            <label className="field" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              autoComplete="username"
              placeholder="you@dostelo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label className="field" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="submit"
              className="btn"
              style={{ marginTop: 24, width: '100%' }}
              disabled={busy}
            >
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </>
        )}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
