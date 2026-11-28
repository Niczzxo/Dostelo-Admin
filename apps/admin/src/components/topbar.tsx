'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, Search } from 'lucide-react';
import { ADMIN_MODULES } from '../lib/modules';
import { useAuth } from './auth-provider';

/* Topbar: a module jump search over the 25 registry modules (it
   navigates, it does not search business data the API has not
   returned), the signed-in staff identity from the session, and
   sign out. */
export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const name = session.displayName ?? 'Staff';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const matches = query.trim()
    ? ADMIN_MODULES.filter((m) =>
        m.label.toLowerCase().includes(query.trim().toLowerCase()),
      ).slice(0, 6)
    : [];

  return (
    <header className="topbar">
      <button type="button" className="icon-btn" onClick={onMenu} aria-label="Open navigation">
        <Menu size={17} />
      </button>
      <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
        <input
          className="topbar-search"
          style={{ paddingLeft: 32 }}
          placeholder="Jump to a module"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Jump to a module"
        />
        {matches.length > 0 ? (
          <div
            className="card"
            style={{ position: 'absolute', top: 44, left: 0, right: 0, padding: 8, zIndex: 50 }}
          >
            {matches.map((m) => (
              <button
                key={m.slug}
                type="button"
                className="btn secondary small"
                style={{ display: 'flex', width: '100%', marginBottom: 4, justifyContent: 'flex-start' }}
                onClick={() => {
                  setQuery('');
                  router.push(m.href);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="topbar-user">
        <span className="avatar-chip" aria-hidden="true">{initials || 'S'}</span>
        <span>
          <span style={{ color: 'var(--ink)', fontWeight: 650, display: 'block', lineHeight: 1.2 }}>{name}</span>
          <span className="note" style={{ fontSize: 12 }}>
            {(session.principal?.roles ?? []).join(', ') || 'Staff'}
          </span>
        </span>
        <button type="button" className="btn secondary small" onClick={() => void signOut()}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </header>
  );
}
