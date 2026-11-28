'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3, Bell, Blocks, ChevronLeft, ChevronRight, ClipboardList,
  CreditCard, Crown, Database, Globe, LayoutDashboard, LifeBuoy,
  Megaphone, MessageSquare, RotateCcw, Scale, ShieldCheck, ShoppingBag,
  ShoppingCart, Star, Target, Truck, Users, UserSearch, UsersRound,
  Warehouse, Zap, type LucideIcon,
} from 'lucide-react';
import { ADMIN_MODULES } from '../lib/modules';
import { useData } from '../lib/use-data';
import { num } from '../lib/types';
import { useAuth } from './auth-provider';

/* One Lucide icon per module, keyed by the module slug from the
   sidebar registry. The registry stays the single source of module
   order, labels and permissions. */
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

/* The sidebar: Warm Black with off-white text and the red brand
   mark, the 25 modules in registry order, and real badges only:
   the notifications unread count from the API, and a dot when the
   communication log holds failed or not-configured entries.
   Items whose view permission the signed-in role does not hold
   are hidden; the API enforces the same permissions server-side. */
export default function Sidebar({
  collapsed,
  open,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  open: boolean;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
}) {
  const { session } = useAuth();
  const pathname = usePathname();
  const permissions = session.principal?.permissions ?? [];
  const visible = ADMIN_MODULES.filter((item) => permissions.includes(item.permission));

  const canNotifications = permissions.includes('settings.manage');
  const feed = useData(
    (client) => (canNotifications ? client.getNotificationFeed() : Promise.resolve(null)),
    [canNotifications],
  );
  const unread = feed.data ? num(feed.data.unread) : 0;

  const canCommunications = permissions.includes('communications.read');
  const commLog = useData(
    (client) => (canCommunications ? client.listCommunicationLog({}) : Promise.resolve(null)),
    [canCommunications],
  );
  const commNeedsAttention = commLog.data
    ? (Array.isArray(commLog.data.items) ? commLog.data.items : []).some(
        (entry) =>
          entry && typeof entry === 'object' &&
          ((entry as { status?: string }).status === 'failed' ||
            (entry as { status?: string }).status === 'not-configured'),
      )
    : false;

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${open ? ' open' : ''}`}>
      <div className="sidebar-brand">
        <span className="sidebar-logo-mark">D</span>
        {!collapsed ? (
          <span>
            <span className="sidebar-brand-name">DOSTELO</span>
            <br />
            <span className="sidebar-brand-sub">Admin Portal</span>
          </span>
        ) : null}
      </div>
      <nav className="sidebar-nav" aria-label="Admin modules">
        {visible.map((item) => {
          const Icon = MODULE_ICONS[item.slug] ?? LayoutDashboard;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.slug}
              href={item.href}
              className={active ? 'sidebar-link active' : 'sidebar-link'}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} strokeWidth={1.9} />
              {!collapsed ? <span>{item.label}</span> : null}
              {!collapsed && item.slug === 'notifications' && unread > 0 ? (
                <span className="sidebar-badge">{unread}</span>
              ) : null}
              {!collapsed && item.slug === 'communication' && commNeedsAttention ? (
                <span className="sidebar-dot" aria-label="Needs attention" />
              ) : null}
            </Link>
          );
        })}
      </nav>
      <button type="button" className="sidebar-toggle" onClick={onToggleCollapsed}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        {!collapsed ? <span>Collapse</span> : null}
      </button>
    </aside>
  );
}
