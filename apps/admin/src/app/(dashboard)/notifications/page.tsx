'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  LOW_STOCK_THRESHOLD,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  STAFF_NOTIFICATION_KIND_LABELS,
  type NotificationCategory,
  type NotificationPreference,
  type StaffNotificationKind,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import {
  Badge,
  CardHead,
  Drawer,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  ModuleHeader,
  Pagination,
  StatusTabs,
  Switch,
  pageCountFor,
  paginate,
} from '../../../components/ui';
import {
  Bell,
  BellRing,
  CheckCheck,
  Inbox,
  MoreVertical,
  PackageX,
  PackageMinus,
  Settings2,
  TriangleAlert,
} from 'lucide-react';

type StateFilter = 'unread' | 'read' | 'all';
type SortOrder = 'newest' | 'oldest';

/**
 * Notifications: the staff feed, derived by the API at read time
 * from pending orders, low and out of stock variants, abandoned
 * carts and the other classified sources. Only per staff read
 * marks, hides and preferences are stored, so an item disappears
 * when the underlying record stops matching, and read state is
 * personal: marking yours read does not touch anyone else's.
 * The page refetches the feed every 30 seconds, matching the
 * shell badge pattern.
 */
export default function NotificationsPage() {
  const feed = useData((client) => client.getNotificationFeed(), []);
  const products = useData((client) => client.listAdminProducts(), []);
  const preferences = useData(
    (client) => client.getNotificationPreferences(),
    [],
  );

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('unread');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefDraft, setPrefDraft] = useState<NotificationPreference | null>(
    null,
  );
  const [prefMessage, setPrefMessage] = useState<string | null>(null);
  const [prefBusy, setPrefBusy] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => feed.reload(), 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [category, search, kindFilter, stateFilter, from, to, sort, pageSize]);

  useEffect(() => {
    if (preferences.data) setPrefDraft(preferences.data);
  }, [preferences.data]);

  async function run(
    action: () => Promise<unknown>,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      setSelected(new Set());
      feed.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  const markRead = (keys: string[]) =>
    run(() => api.markNotificationsRead({ keys }));
  const markUnread = (keys: string[]) =>
    run(() => api.markNotificationsUnread({ keys }));
  const hide = (keys: string[]) =>
    run(() => api.hideNotifications({ keys }));

  function bulkHide(keys: string[]): void {
    if (
      !window.confirm(
        `Hide ${keys.length} notification${keys.length === 1 ? '' : 's'} for you? This hides them from your feed only.`,
      )
    ) {
      return;
    }
    void hide(keys);
  }

  async function savePreferences(): Promise<void> {
    if (!prefDraft) return;
    setPrefBusy(true);
    setError(null);
    setPrefMessage(null);
    try {
      const saved = await api.updateNotificationPreferences({
        categories: prefDraft.categories,
        emailEnabled: prefDraft.emailEnabled,
      });
      setPrefDraft(saved);
      setPrefMessage('Notification preferences saved.');
      preferences.reload();
      feed.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setError(uiError.message);
    } finally {
      setPrefBusy(false);
    }
  }

  const items = feed.data?.items ?? [];
  const unreadKeys = items
    .filter((item) => !item.read)
    .map((item) => item.key);

  const productThumb = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products.data?.items ?? []) {
      const image = product.media.find((media) => media.type === 'image');
      if (image) map.set(product.id, image.url);
    }
    return map;
  }, [products.data]);

  const kindsPresent = useMemo(
    () =>
      [...new Set(items.map((item) => item.kind))] as StaffNotificationKind[],
    [items],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTime = to ? new Date(`${to}T23:59:59`).getTime() : null;
    const list = items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (stateFilter === 'unread' && item.read) return false;
      if (stateFilter === 'read' && !item.read) return false;
      if (
        query &&
        !`${item.title} ${item.detail}`.toLowerCase().includes(query)
      ) {
        return false;
      }
      const time = new Date(item.createdAt).getTime();
      if (fromTime !== null && time < fromTime) return false;
      if (toTime !== null && time > toTime) return false;
      return true;
    });
    list.sort((a, b) =>
      sort === 'newest'
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
    return list;
  }, [items, category, search, kindFilter, stateFilter, from, to, sort]);

  const pageCount = pageCountFor(filtered.length, pageSize);
  const safePage = Math.min(page, pageCount);
  const pageItems = paginate(filtered, safePage, pageSize);
  const pageKeys = pageItems.map((item) => item.key);
  const allPageSelected =
    pageKeys.length > 0 && pageKeys.every((key) => selected.has(key));
  const selectedKeys = [...selected];

  function toggleSelected(key: string, checked: boolean): void {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function resetFilters(): void {
    setCategory('all');
    setSearch('');
    setKindFilter('all');
    setStateFilter('unread');
    setFrom('');
    setTo('');
    setSort('newest');
  }

  return (
    <section>
      <ModuleHeader
        icon={Bell}
        title="Notifications"
        description="Your personal feed, derived by the server from orders, stock, carts, leads, support and system events. Read marks and hides are yours only."
      >
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 size={16} /> Notification Settings
        </button>
        {unreadKeys.length > 0 ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void markRead(unreadKeys)}
          >
            <CheckCheck size={16} /> Mark All as Read
          </button>
        ) : null}
      </ModuleHeader>

      <div className="kpi-grid">
        <KpiCard
          icon={BellRing}
          label="Unread for you"
          value={String(feed.data?.unread ?? 0)}
          tone="orange"
        />
        <KpiCard
          icon={Inbox}
          label="Items in feed"
          value={String(items.length)}
          tone="purple"
        />
        <KpiCard
          icon={PackageMinus}
          label="Low stock alerts"
          value={String(items.filter((item) => item.kind === 'low-stock').length)}
          tone="blue"
        />
        <KpiCard
          icon={PackageX}
          label="Out of stock alerts"
          value={String(
            items.filter((item) => item.kind === 'out-of-stock').length,
          )}
          tone="orange"
        />
        <KpiCard
          icon={TriangleAlert}
          label="System alerts"
          value={String(
            items.filter((item) => item.category === 'system').length,
          )}
          tone="green"
        />
      </div>

      <StatusTabs
        active={category}
        onChange={setCategory}
        tabs={[
          { key: 'all', label: 'All Notifications', count: items.length },
          ...NOTIFICATION_CATEGORIES.map((value) => ({
            key: value,
            label: NOTIFICATION_CATEGORY_LABELS[value],
            count: categoryCounts.get(value) ?? 0,
          })),
        ]}
      />

      <div className="card filter-card">
        <div className="filter-row">
          <label className="field" style={{ flex: 1, minWidth: 200 }}>
            Search
            <input
              className="input"
              placeholder="Search title or detail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="field">
            Type
            <select
              className="select"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value)}
            >
              <option value="all">All types</option>
              {kindsPresent.map((kind) => (
                <option key={kind} value={kind}>
                  {STAFF_NOTIFICATION_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            State
            <select
              className="select"
              value={stateFilter}
              onChange={(event) =>
                setStateFilter(event.target.value as StateFilter)
              }
            >
              <option value="unread">Unread</option>
              <option value="read">Read</option>
              <option value="all">All</option>
            </select>
          </label>
          <label className="field">
            From
            <input
              className="input"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="field">
            To
            <input
              className="input"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="field">
            Sort
            <select
              className="select"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOrder)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <label className="field">
            Page size
            <select
              className="select"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
          <div className="filter-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {feed.loading ? <LoadingNote label="Loading feed..." /> : null}
      {feed.error ? (
        <ErrorNote error={feed.error} onRetry={feed.reload} />
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {feed.data && items.length === 0 ? (
        <EmptyNote>
          Nothing needs attention: no pending orders, no low stock and no
          abandoned carts in recovery.
        </EmptyNote>
      ) : null}
      {feed.data && items.length > 0 && filtered.length === 0 ? (
        <EmptyNote>
          No notifications match the current category and filters.
        </EmptyNote>
      ) : null}

      {selectedKeys.length > 0 ? (
        <div className="card" style={{ marginBottom: 16, padding: '12px 18px' }}>
          <div className="filter-row">
            <strong>
              {selectedKeys.length} selected
            </strong>
            <div className="filter-actions">
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={busy}
                onClick={() => void markRead(selectedKeys)}
              >
                Mark read
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={busy}
                onClick={() => void markUnread(selectedKeys)}
              >
                Mark unread
              </button>
              <button
                type="button"
                className="btn-danger btn-small"
                disabled={busy}
                onClick={() => bulkHide(selectedKeys)}
              >
                Hide for me
              </button>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pageItems.length > 0 ? (
        <div className="card">
          <CardHead icon={Bell} title="Feed">
            <span className="muted">
              {filtered.length} matching, page {safePage} of {pageCount}
            </span>
          </CardHead>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allPageSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelected(
                            (current) =>
                              new Set([...current, ...pageKeys]),
                          );
                        } else {
                          setSelected((current) => {
                            const next = new Set(current);
                            for (const key of pageKeys) next.delete(key);
                            return next;
                          });
                        }
                      }}
                    />
                  </th>
                  <th>Kind</th>
                  <th>Notification</th>
                  <th>When</th>
                  <th>State</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => {
                  const thumb = item.productId
                    ? productThumb.get(item.productId)
                    : undefined;
                  return (
                    <tr key={item.key}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.title}`}
                          checked={selected.has(item.key)}
                          onChange={(event) =>
                            toggleSelected(item.key, event.target.checked)
                          }
                        />
                      </td>
                      <td>
                        <Badge>
                          {STAFF_NOTIFICATION_KIND_LABELS[item.kind]}
                        </Badge>
                        <div className="muted" style={{ marginTop: 4 }}>
                          {NOTIFICATION_CATEGORY_LABELS[item.category]}
                        </div>
                      </td>
                      <td>
                        <div className="identity-cell">
                          {item.productId ? (
                            <span className="thumb">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt="" />
                              ) : (
                                <PackageMinus size={16} />
                              )}
                            </span>
                          ) : null}
                          <span>
                            <span className="identity-main">{item.title}</span>
                            <span className="identity-sub">{item.detail}</span>
                          </span>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td>
                        <Badge>{item.read ? 'Read' : 'Unread'}</Badge>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {item.href ? (
                            <Link
                              className="btn-secondary btn-small"
                              href={item.href}
                            >
                              Open
                            </Link>
                          ) : null}
                          {item.read ? (
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              disabled={busy}
                              onClick={() => void markUnread([item.key])}
                            >
                              Mark unread
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              disabled={busy}
                              onClick={() => void markRead([item.key])}
                            >
                              Mark read
                            </button>
                          )}
                          <span className="menu-wrap">
                            <button
                              type="button"
                              className="btn-secondary btn-small"
                              aria-label={`More actions for ${item.title}`}
                              onClick={() =>
                                setMenuKey(
                                  menuKey === item.key ? null : item.key,
                                )
                              }
                            >
                              <MoreVertical size={15} />
                            </button>
                            {menuKey === item.key ? (
                              <span className="topbar-menu">
                                <button
                                  type="button"
                                  className="topbar-menu-item"
                                  disabled={busy}
                                  onClick={() => {
                                    setMenuKey(null);
                                    void markUnread([item.key]);
                                  }}
                                >
                                  Mark unread
                                </button>
                                <button
                                  type="button"
                                  className="topbar-menu-item"
                                  disabled={busy}
                                  onClick={() => {
                                    setMenuKey(null);
                                    if (
                                      window.confirm(
                                        'Hide this notification for you? It stays visible to other staff.',
                                      )
                                    ) {
                                      void hide([item.key]);
                                    }
                                  }}
                                >
                                  Hide for me
                                </button>
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-foot">
            <span className="muted">
              Showing {pageItems.length} of {filtered.length}
            </span>
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onChange={setPage}
            />
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <Drawer
          title="Notification Settings"
          onClose={() => setSettingsOpen(false)}
        >
          {preferences.loading ? (
            <LoadingNote label="Loading preferences..." />
          ) : null}
          {preferences.error ? (
            <ErrorNote
              error={preferences.error}
              onRetry={preferences.reload}
            />
          ) : null}
          {prefDraft ? (
            <>
              <p className="note muted" style={{ marginTop: 0 }}>
                Categories you keep switched on are the categories that
                arrive in your feed. This is per admin: it changes your
                feed only.
              </p>
              {NOTIFICATION_CATEGORIES.map((value: NotificationCategory) => (
                <label
                  key={value}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginTop: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={prefDraft.categories.includes(value)}
                    onChange={(event) =>
                      setPrefDraft({
                        ...prefDraft,
                        categories: event.target.checked
                          ? [...prefDraft.categories, value]
                          : prefDraft.categories.filter(
                              (entry) => entry !== value,
                            ),
                      })
                    }
                  />
                  {NOTIFICATION_CATEGORY_LABELS[value]}
                </label>
              ))}
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  marginTop: 18,
                }}
              >
                <Switch
                  checked={prefDraft.emailEnabled}
                  label="Email notifications"
                  onChange={(value) =>
                    setPrefDraft({ ...prefDraft, emailEnabled: value })
                  }
                />
                <span>
                  <strong>Email notifications</strong>
                  <div className="muted">
                    The preference is recorded, while email delivery stays
                    not configured until a provider exists.
                  </div>
                </span>
              </div>
              <p className="note muted">
                Low stock threshold: a variant counts as low stock at{' '}
                {LOW_STOCK_THRESHOLD} or fewer available units (on hand
                minus reserved), the server threshold the feed uses. It
                is read only here.
              </p>
              <button
                type="button"
                className="btn"
                disabled={prefBusy}
                onClick={() => void savePreferences()}
                style={{ marginTop: 14 }}
              >
                {prefBusy ? 'Saving...' : 'Save preferences'}
              </button>
              {prefMessage ? (
                <p className="note" style={{ margin: '10px 0 0' }}>
                  {prefMessage}
                </p>
              ) : null}
            </>
          ) : null}
        </Drawer>
      ) : null}
    </section>
  );
}
