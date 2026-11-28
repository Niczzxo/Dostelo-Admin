'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ActionError, Field, TextInput } from '../../../components/ui';
import { api, toUiError, type UiError } from '../../../lib/api';

/* Accept a staff invite: the invite token arrives in the link, the
   invitee sets their own password here, and the API creates the
   active staff account. The password is sent only to the API; it
   is never stored by this page. */

function AcceptInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError({ kind: 'api', message: 'The two passwords do not match.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.acceptStaffInvite({ token, name, password });
      setDone(true);
    } catch (caught) {
      setError(toUiError(caught));
      setBusy(false);
    }
  }

  return (
    <main style={{ display: 'flex', justifyContent: 'center', padding: '64px 16px' }}>
      <form className="card" style={{ maxWidth: 420, width: '100%' }} onSubmit={submit}>
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Accept your Dostelo staff invite</h1>
        {!token ? (
          <p className="note">
            This link is missing its invite token. Ask the staff manager who invited you to send a
            fresh invite link.
          </p>
        ) : done ? (
          <>
            <p className="note">Your staff account is active. You can sign in now.</p>
            <button type="button" className="btn" onClick={() => router.replace('/login')}>
              Go to sign in
            </button>
          </>
        ) : (
          <>
            <p className="note">Set your name and a password to activate the account.</p>
            <ActionError error={error} />
            <Field label="Your name">
              <TextInput required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Password" hint="(at least the length the API requires)">
              <TextInput type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirm password">
              <TextInput type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </Field>
            <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
              {busy ? 'Activating...' : 'Activate account'}
            </button>
          </>
        )}
      </form>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<p className="note" style={{ padding: 40 }}>Loading...</p>}>
      <AcceptInviteForm />
    </Suspense>
  );
}
