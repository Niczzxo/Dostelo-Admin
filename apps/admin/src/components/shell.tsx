'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Sidebar from './sidebar';
import Topbar from './topbar';

/**
 * The redesigned portal shell: navy sidebar (collapsible on
 * desktop, a drawer under 1024px), glass topbar, lavender
 * workspace. The collapsed choice persists per browser in
 * localStorage; the mobile drawer is transient state.
 */
export default function Shell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(
        window.localStorage.getItem('dostelo-admin-nav-collapsed') === '1',
      );
    } catch {
      // Storage unavailable: the rail simply starts expanded.
    }
  }, []);

  function toggleCollapsed(): void {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(
          'dostelo-admin-nav-collapsed',
          next ? '1' : '0',
        );
      } catch {
        // Non-fatal: the choice just will not persist.
      }
      return next;
    });
  }

  const classes = [
    'shell',
    collapsed ? 'shell-collapsed' : '',
    navOpen ? 'shell-nav-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onNavigate={() => setNavOpen(false)}
      />
      {navOpen ? (
        <div className="shell-scrim" onClick={() => setNavOpen(false)} />
      ) : null}
      <div className="shell-body">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
