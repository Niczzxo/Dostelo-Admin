'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider } from '../../../components/auth-provider';
import { ActionError, Field, TextInput } from '../../../components/ui';
import { api, toUiError, type UiError } from '../../../lib/api';
import { applyTokens } from '../../../lib/session';
import { isMfaChallenge, type AdminLoginResult } from '../../../lib/types';

/* Staff sign in. Password login goes to POST /v1/auth/admin/login.
   When the account has MFA enabled the API answers with a
   challenge instead of tokens; the form then collects the
   authenticator code and exchanges it. Errors are generic: the
   page never reveals whether an account exists. */

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (challengeId) {
        const tokens = await api.exchangeAdminMfa({ challengeId, code });
        applyTokens(tokens);
        router.replace('/dashboard');
        return;
      }
      const result: AdminLoginResult = await api.loginAdmin({ email, password });
      if (isMfaChallenge(result)) {
        setChallengeId(result.challengeId);
        setBusy(false);
        return;
      }
      applyTokens(result);
      router.replace('/dashboard');
    } catch (caught) {
      const uiError = toUiError(caught);
      setError(
        uiError.kind === 'api' || uiError.kind === 'forbidden'
          ? { kind: 'api', message: 'Sign in failed. Check the email, password and code, then try again.' }
          : uiError,
      );
      setBusy(false);
    }
  }

  return (
    <main style={{ display: 'flex', justifyContent: 'center', padding: '64px 16px' }}>
      <form className="card" style={{ maxWidth: 400, width: '100%' }} onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span className="sidebar-logo-mark">D</span>
          <div>
            <h1 style={{ fontSize: 20 }}>Dostelo Admin</h1>
            <p className="note" style={{ margin: 0 }}>Staff only. Sign in with your admin account.</p>
          </div>
        </div>
        <ActionError error={error} />
        {!challengeId ? (
          <>
            <Field label="Email">
              <TextInput type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <TextInput type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <p className="note">
              This account uses multi-factor authentication. Enter the six digit code from your
              authenticator app. The challenge expires shortly; if it does, sign in again.
            </p>
            <Field label="Authenticator code">
              <TextInput inputMode="numeric" required autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          </>
        )}
        <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? 'Signing in...' : challengeId ? 'Verify and sign in' : 'Sign in'}
        </button>
        {challengeId ? (
          <button
            type="button"
            className="btn secondary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            onClick={() => setChallengeId(null)}
          >
            Back to password sign in
          </button>
        ) : null}
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
