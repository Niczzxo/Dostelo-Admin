'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_MODULES } from '../lib/modules';
import { useAuth } from './auth-provider';

/**
 * The admin sidebar: exactly the 25 items of the admin master
 * structure, in structure order. Items whose view permission the
 * signed-in role does not hold are hidden; the API enforces the
 * same permissions server-side, so this is presentation, not the
 * security boundary.
 */
export default function Sidebar() {
  const { session } = useAuth();
  const pathname = usePathname();
  const permissions = session.principal?.permissions ?? [];
  const visible = ADMIN_MODULES.filter((item) =>
    permissions.includes(item.permission),
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">DOSTELO</div>
        <div className="sidebar-sub">Admin Panel</div>
      </div>
      <nav>
        <ul className="sidebar-list">
          {visible.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={active ? 'sidebar-link active' : 'sidebar-link'}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
