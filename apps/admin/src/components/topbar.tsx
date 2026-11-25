'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Globe,
  Home,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { ADMIN_ROLE_LABELS } from '@dostelo/types';
import { api } from '../lib/api';
import { ADMIN_MODULES, moduleBySlug } from '../lib/modules';
import { useData } from '../lib/use-data';
import { useAuth } from './auth-provider';

interface SearchHit {
  group: string;
  label: string;
  sub: string;
  href: string;
}

/**
 * The redesigned topbar: breadcrumb for the current module, a
 * global search (Ctrl K) over the orders, customers and products
 * list endpoints (each group shown only when the role holds its
 * read permission), the notification bell with the same unread
 * count the Notifications page shows, a help menu, an EN selector
 * (English is the portal's only language today; the menu says so
 * rather than faking translations), and the profile chip with a
 * working sign-out menu.
 */
export default function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<'profile' | 'help' | 'lang' | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const principal = session.principal;
  const permissions = principal?.permissions ?? [];

  const feed = useData(
    (client) =>
      permissions.includes('settings.manage')
        ? client.getNotificationFeed()
        : Promise.resolve(null),
    [permissions.join(',')],
  );
  const unread = feed.data?.unread ?? 0;

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!principal) return null;

  const segment = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  const current =
    ADMIN_MODULES.find((item) => item.slug === segment) ??
    moduleBySlug(segment);
  const roleLabels = principal.roles
    .map((role) => ADMIN_ROLE_LABELS[role])
    .join(', ');
  const displayName = session.displayName ?? 'Admin user';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  async function handleSignOut(): Promise<void> {
    setBusy(true);
    await signOut();
    router.replace('/login');
  }

  function runSearch(value: string): void {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (value.trim().length < 2) {
      setHits([]);
      setSearchOpen(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const needle = value.trim().toLowerCase();
      const results: SearchHit[] = [];
      try {
        if (permissions.includes('orders.read')) {
          const orders = await api.listStaffOrders();
          for (const order of orders.items) {
            const haystack =
              `${order.orderNumber} ${order.address.fullName} ${order.address.phone}`.toLowerCase();
            if (haystack.includes(needle)) {
              results.push({
                group: 'Orders',
                label: order.orderNumber,
                sub: order.address.fullName,
                href: `/orders/${encodeURIComponent(order.orderNumber)}`,
              });
            }
            if (results.length >= 6) break;
          }
        }
        if (permissions.includes('customers.read')) {
          const customers = await api.listCustomers({
            search: value.trim(),
            limit: 5,
          });
          for (const customer of customers.items) {
            results.push({
              group: 'Customers',
              label: customer.fullName,
              sub: customer.email ?? customer.phone ?? '',
              href: `/crm/${customer.id}`,
            });
          }
        }
        if (permissions.includes('products.read')) {
          const products = await api.listProducts();
          for (const product of products.items) {
            if (product.name.toLowerCase().includes(needle)) {
              results.push({
                group: 'Products',
                label: product.name,
                sub: 'Catalogue',
                href: '/products',
              });
            }
            if (results.filter((h) => h.group === 'Products').length >= 5) {
              break;
            }
          }
        }
      } catch {
        // A failed group simply contributes no hits; the search
        // box never blocks the page on an API error.
      }
      setHits(results.slice(0, 15));
      setSearchOpen(true);
      setSearching(false);
    }, 280);
  }

  const groups = [...new Set(hits.map((hit) => hit.group))];

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn topbar-menu-btn"
        onClick={onOpenNav}
        aria-label="Open navigation"
      >
        <Menu size={19} />
      </button>
      <div className="topbar-crumb">
        <span className="topbar-crumb-icon">
          <Home size={16} />
        </span>
        <span className="topbar-crumb-sep">›</span>
        <span>{current?.label ?? 'Dashboard'}</span>
      </div>

      <div className="topbar-search">
        <div className="topbar-search-box">
          <Search size={16} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => runSearch(event.target.value)}
            onFocus={() => hits.length > 0 && setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
            placeholder="Search orders, customers, products..."
            aria-label="Global search"
          />
          <span className="kbd">Ctrl K</span>
        </div>
        {searchOpen ? (
          <div className="search-results">
            {searching ? (
              <p className="search-empty">Searching...</p>
            ) : hits.length === 0 ? (
              <p className="search-empty">
                No matches in orders, customers or products.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group}>
                  <div className="search-group">{group}</div>
                  {hits
                    .filter((hit) => hit.group === group)
                    .map((hit) => (
                      <Link
                        key={`${group}-${hit.label}-${hit.href}`}
                        className="search-item"
                        href={hit.href}
                        onClick={() => setSearchOpen(false)}
                      >
                        <span>{hit.label}</span>
                        <span className="search-item-sub">{hit.sub}</span>
                      </Link>
                    ))}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="topbar-actions">
        <Link
          href="/notifications"
          className="icon-btn"
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        >
          <Bell size={19} />
          {unread > 0 ? <span className="ping" /> : null}
          {unread > 0 ? <span className="count">{unread}</span> : null}
        </Link>

        <div className="menu-wrap">
          <button
            type="button"
            className="icon-btn"
            aria-label="Help"
            onClick={() => setMenu(menu === 'help' ? null : 'help')}
          >
            <CircleHelp size={19} />
          </button>
          {menu === 'help' ? (
            <div className="topbar-menu">
              <div className="topbar-menu-head">Help and shortcuts</div>
              <p className="topbar-menu-note">
                Press Ctrl K anywhere to jump to search. Every number
                in this portal comes from the live API; where a
                provider is not configured, the page says so instead
                of showing a placeholder.
              </p>
              <Link
                className="topbar-menu-item"
                href="/integrations"
                onClick={() => setMenu(null)}
              >
                <ShieldCheck size={15} /> Integration status
              </Link>
              <Link
                className="topbar-menu-item"
                href="/backup"
                onClick={() => setMenu(null)}
              >
                <Globe size={15} /> Backup and maintenance
              </Link>
            </div>
          ) : null}
        </div>

        <div className="menu-wrap">
          <button
            type="button"
            className="lang-btn"
            onClick={() => setMenu(menu === 'lang' ? null : 'lang')}
            aria-label="Language"
          >
            <Globe size={16} /> EN <ChevronDown size={13} />
          </button>
          {menu === 'lang' ? (
            <div className="topbar-menu">
              <div className="topbar-menu-item">
                <span>English (current)</span>
                <ChevronRight size={14} />
              </div>
              <p className="topbar-menu-note">
                The portal is available in English only today. No
                other language pack is installed, so no translated
                option is offered.
              </p>
            </div>
          ) : null}
        </div>

        <div className="menu-wrap">
          <button
            type="button"
            className="profile-chip"
            onClick={() => setMenu(menu === 'profile' ? null : 'profile')}
          >
            <span className="profile-avatar">{initials || 'A'}</span>
            <span className="profile-text">
              <span className="profile-name">{displayName}</span>
              <span className="profile-role">{roleLabels}</span>
            </span>
            <ChevronDown size={15} />
          </button>
          {menu === 'profile' ? (
            <div className="topbar-menu">
              <div className="topbar-menu-head">
                <UserRound size={15} /> {displayName}
              </div>
              <p className="topbar-menu-note">{roleLabels}</p>
              <Link
                className="topbar-menu-item"
                href="/security"
                onClick={() => setMenu(null)}
              >
                <ShieldCheck size={15} /> Security and sessions
              </Link>
              <Link
                className="topbar-menu-item"
                href="/staff"
                onClick={() => setMenu(null)}
              >
                <UserRound size={15} /> Staff directory
              </Link>
              <button
                type="button"
                className="topbar-menu-item"
                disabled={busy}
                onClick={handleSignOut}
              >
                <LogOut size={15} /> {busy ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
