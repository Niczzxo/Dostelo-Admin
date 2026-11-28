'use client';

import { useState, type ReactNode } from 'react';
import Sidebar from './sidebar';
import Topbar from './topbar';

/* Portal shell: sidebar plus topbar plus the scrollable workspace.
   The sidebar collapses to icons on desktop and slides over the
   content on small screens, with a scrim behind it. */
export default function Shell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <Sidebar
        collapsed={collapsed}
        open={open}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        onNavigate={() => setOpen(false)}
      />
      {open ? (
        <div className="shell-scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      ) : null}
      <div className="shell-body">
        <Topbar onMenu={() => setOpen((v) => !v)} />
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
