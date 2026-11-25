'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  Blocks,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Crown,
  Database,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  RotateCcw,
  Scale,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Target,
  Truck,
  Users,
  UserSearch,
  UsersRound,
  Warehouse,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { ADMIN_MODULES } from '../lib/modules';
import { useData } from '../lib/use-data';
import { useAuth } from './auth-provider';

/** One Lucide icon per module, keyed by the module slug from the
 * sidebar registry. The registry itself stays the single source
 * of module order, labels and permissions. */
export const MODULE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  'buyer-intelligence': UserSearch,
  crm: Users,
  leads: Target,
  'cart-recovery': ShoppingCart,
  communication: MessageSquare,
  orders: ClipboardList,
  products: ShoppingBag,
  inventory: Warehouse,
  payments: CreditCard,
  shipping: Truck,
  returns: RotateCcw,
  marketing: Megaphone,
  automation: Zap,
  support: LifeBuoy,
  reviews: Star,
  loyalty: Crown,
  reports: BarChart3,
  website: Globe,
  notifications: Bell,
  staff: UsersRound,
  security: ShieldCheck,
  integrations: Blocks,
  legal: Scale,
  backup: Database,
};

/**
 * The redesigned sidebar: dark navy with a subtle purple
 * gradient, the DOSTELO Admin Portal brand block, the 25 modules
 * in registry order with Lucide icons, a purple gradient pill for
 * the active module, and real badges (the notifications unread
 * count and a dot when the communication log holds failed or
 * not-configured entries). Items whose view permission the
 * signed-in role does not hold are hidden; the API enforces the
 * same permissions server-side.
 */
export default function Sidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
}) {
  const { session } = useAuth();
  const pathname = usePathname();
  const permissions = session.principal?.permissions ?? [];
  const visible = ADMIN_MODULES.filter((item) =>
    permissions.includes(item.permission),
  );

  const canNotifications = permissions.includes('settings.manage');
  const feed = useData(
    (client) =>
      canNotifications
        ? client.getNotificationFeed()
        : Promise.resolve(null),
    [canNotifications],
  );
  const unread = feed.data?.unread ?? 0;

  const canCommunications = permissions.includes('communications.read');
  const commLog = useData(
    (client) =>
      canCommunications
        ? client.listCommunicationLog({})
        : Promise.resolve(null),
    [canCommunications],
  );
  const commNeedsAttention =
    commLog.data?.items.some(
      (entry) => entry.status === 'failed' || entry.status === 'not-configured',
    ) ?? false;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo-mark">D</span>
        <span className="sidebar-brand-text">
          <span className="sidebar-logo">DOSTELO</span>
          <span className="sidebar-sub" style={{ display: 'block' }}>
            Admin Portal
          </span>
        </span>
        <button
          type="button"
          className="sidebar-collapse"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <nav>
        <ul className="sidebar-list">
          {visible.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = MODULE_ICONS[item.slug] ?? LayoutDashboard;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={active ? 'sidebar-link active' : 'sidebar-link'}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="sidebar-link-icon">
                    <Icon size={19} strokeWidth={1.9} />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                  {item.slug === 'notifications' && unread > 0 ? (
                    <span className="sidebar-badge">{unread}</span>
                  ) : null}
                  {item.slug === 'communication' && commNeedsAttention ? (
                    <span className="sidebar-dot" aria-label="Needs attention" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
