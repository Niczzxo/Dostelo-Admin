'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { api, toUiError } from '../../../lib/api';

/**
 * Staff invitation acceptance. An inviting admin hands the
 * invitee this link with its one-time token; setting a password
 * here activates the account. The token is single-use and
 * expires 72 hours after the invite was created; nothing was
 * emailed, because no email provider is configured. The API
 * validates the token and the password rules server-side.
 */
function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError('This invite link is missing its token. Ask the inviting admin for the full link.');
      return;
    }
    if (password.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.acceptStaffInvite({ token, password });
      setDone(true);
    } catch (caught) {
      setError(toUiError(caught).message);
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background:
          'radial-gradient(900px 480px at 85% -10%, rgba(151,117,255,0.35) 0%, rgba(151,117,255,0) 60%), linear-gradient(160deg, #161231 0%, #1C1744 55%, #2A1E63 100%)',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 430, padding: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span className="sidebar-logo-mark">D</span>
          <div>
            <div style={{ fontWeight: 800, letterSpacing: '0.08em', color: 'var(--ink)' }}>
              DOSTELO
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Admin Portal invitation
            </div>
          </div>
        </div>
        {done ? (
          <>
            <h1 style={{ fontSize: 21, margin: '14px 0 8px' }}>
              Your account is active
            </h1>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              Your password is set and this invite link cannot be
              used again. Sign in with your email and the password
              you just chose.
            </p>
            <Link className="btn" href="/login" style={{ display: 'inline-block', marginTop: 14, textDecoration: 'none' }}>
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 21, margin: '14px 0 8px' }}>
              Set your password
            </h1>
            <p className="muted" style={{ lineHeight: 1.6 }}>
              You were invited to the Dostelo admin portal. Choose a
              password to activate your account. This link works
              once and expires 72 hours after it was created.
            </p>
            <form onSubmit={handleSubmit} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <label className="field">
                New password
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="field">
                Confirm password
                <input
                  className="input"
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="btn" disabled={busy}>
                <KeyRound size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                {busy ? 'Activating...' : 'Set password and activate'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
