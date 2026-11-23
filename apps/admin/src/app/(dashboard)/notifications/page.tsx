'use client';

import Link from 'next/link';
import { useState } from 'react';
import { STAFF_NOTIFICATION_KIND_LABELS } from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
  StatCard,
} from '../../../components/ui';

/**
 * Notifications: the staff feed, derived by the API at read time
 * from pending orders, low stock and detected abandoned carts.
 * Only the per-staff read marks are stored, so an item disappears
 * when the underlying record stops matching, and read state is
 * personal: marking yours read does not touch anyone else's.
 */
export default function NotificationsPage() {
  const feed = useData((client) => client.getNotificationFeed(), []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function markRead(keys: string[]): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.markNotificationsRead({ keys });
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

  const items = feed.data?.items ?? [];
  const unreadKeys = items
    .filter((item) => !item.read)
    .map((item) => item.key);

  return (
    <section>
      <PageHeader title="Notifications">
        {unreadKeys.length > 0 ? (
          <button
            type="button"
            className="btn btn-small"
            disabled={busy}
            onClick={() => void markRead(unreadKeys)}
          >
            Mark all read
          </button>
        ) : null}
      </PageHeader>
      <div className="grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="Unread for you"
          value={String(feed.data?.unread ?? 0)}
        />
        <StatCard label="Items in feed" value={String(items.length)} />
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
          Nothing needs attention: no pending orders, no low stock and
          no abandoned carts in recovery.
        </EmptyNote>
      ) : null}
      {items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Notification</th>
                <th>When</th>
                <th>State</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td>
                    <Badge>
                      {STAFF_NOTIFICATION_KIND_LABELS[item.kind]}
                    </Badge>
                  </td>
                  <td>
                    <strong>{item.title}</strong>
                    <div className="muted">{item.detail}</div>
                  </td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>{item.read ? 'Read' : 'Unread'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {item.href ? (
                        <Link href={item.href}>Open</Link>
                      ) : null}
                      {!item.read ? (
                        <button
                          type="button"
                          className="btn btn-small btn-secondary"
                          disabled={busy}
                          onClick={() => void markRead([item.key])}
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
