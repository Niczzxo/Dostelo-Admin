'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLE_LABELS } from '@dostelo/types';
import { useAuth } from './auth-provider';

/** Top bar for the dashboard shell: who is signed in, with which
 * roles, and the sign-out action. */
export default function Topbar() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const principal = session.principal;
  if (!principal) return null;

  const roleLabels = principal.roles
    .map((role) => ADMIN_ROLE_LABELS[role])
    .join(', ');

  async function handleSignOut(): Promise<void> {
    setBusy(true);
    await signOut();
    router.replace('/login');
  }

  return (
    <header className="topbar">
      <div className="topbar-identity">
        <span className="topbar-name">
          {session.displayName ?? 'Admin user'}
        </span>
        <span className="topbar-role">{roleLabels}</span>
      </div>
      <button
        type="button"
        className="btn btn-small"
        disabled={busy}
        onClick={handleSignOut}
      >
        {busy ? 'Signing out...' : 'Sign out'}
      </button>
    </header>
  );
}
