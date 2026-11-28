'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Bell } from 'lucide-react';
import {
  ActionError, Badge, Card, EmptyNote, ErrorNote, LoadingNote, ModuleHeader,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../lib/types';

/* Notifications: the staff feed from GET /v1/admin/notifications,
   derived by the API from pending orders, low stock and abandoned
   cart detections, with per-staff read state, hide, and the
   caller's notification preferences. Nothing here invents an
   alert: an empty feed means the API derived none. */
export default function NotificationsPage() {
  const feed = useData((c) => c.getNotificationFeed());
  const prefs = useData((c) => c.getNotificationPreferences());
  const action = useAction();
  const [channels, setChannels] = useState({ email: false, inApp: true, sms: false });

  const data = asRec(feed.data);
  const items = itemsOf(data.items ?? feed.data);
  const unread = typeof data.unread === 'number' ? data.unread : items.filter((i) => i.read !== true).length;
  const prefRec = asRec(prefs.data);

  useEffect(() => {
    if (prefs.data) {
      setChannels({
        email: prefRec.email === true,
        inApp: prefRec.inApp !== false,
        sms: prefRec.sms === true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.data]);

  async function savePrefs(event: FormEvent) {
    event.preventDefault();
    await action.run((c) => c.updateNotificationPreferences({ ...prefRec, ...channels }));
  }

  return (
    <>
      <ModuleHeader
        icon={Bell}
        title="Notifications"
        description="The staff feed the API derives from pending orders, low stock and abandoned carts, with your read state and preferences."
      />
      <ActionError error={action.error} />
      <Card
        title={`Feed (${unread} unread)`}
        actions={
          <span className="btn-row">
            <button
              type="button"
              className="btn secondary small"
              disabled={action.busy || items.length === 0}
              onClick={async () => {
                if (await action.run((c) => c.markNotificationsRead({ ids: items.map((i) => str(i.id)) }))) feed.reload();
              }}
            >
              Mark all read
            </button>
          </span>
        }
      >
        {feed.loading ? (
          <LoadingNote />
        ) : feed.error ? (
          <ErrorNote error={feed.error} onRetry={feed.reload} />
        ) : items.length === 0 ? (
          <EmptyNote>No notifications. The API derives these from pending orders, low stock and abandoned carts.</EmptyNote>
        ) : (
          <ul className="timeline">
            {items.map((item) => (
              <li key={str(item.id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--ink)', fontWeight: item.read === true ? 400 : 650 }}>
                    {str(item.title ?? item.type)}
                    {item.read !== true ? <Badge tone="dark"> New</Badge> : null}
                  </div>
                  <div className="note">{str(item.body ?? item.message)} {str(item.createdAt)}</div>
                </div>
                <span className="btn-row">
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={async () => {
                      const fn = item.read === true ? 'markNotificationsUnread' : 'markNotificationsRead';
                      if (await action.run((c) => c[fn]({ ids: [str(item.id)] }))) feed.reload();
                    }}
                  >
                    {item.read === true ? 'Mark unread' : 'Mark read'}
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={async () => {
                      if (await action.run((c) => c.hideNotifications({ ids: [str(item.id)] }))) feed.reload();
                    }}
                  >
                    Hide
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="My notification preferences">
        {prefs.loading ? (
          <LoadingNote />
        ) : prefs.error ? (
          <ErrorNote error={prefs.error} onRetry={prefs.reload} />
        ) : (
          <form onSubmit={savePrefs}>
            <label className="check-row">
              <input type="checkbox" checked={channels.inApp} onChange={(e) => setChannels({ ...channels, inApp: e.target.checked })} />
              In-portal feed
            </label>
            <label className="check-row">
              <input type="checkbox" checked={channels.email} onChange={(e) => setChannels({ ...channels, email: e.target.checked })} />
              Email (delivered only when the email provider is configured)
            </label>
            <label className="check-row">
              <input type="checkbox" checked={channels.sms} onChange={(e) => setChannels({ ...channels, sms: e.target.checked })} />
              SMS (delivered only when the SMS provider is configured)
            </label>
            <button type="submit" className="btn" disabled={action.busy}>Save preferences</button>
          </form>
        )}
      </Card>
    </>
  );
}
