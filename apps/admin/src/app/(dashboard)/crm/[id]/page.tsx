'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  DELIVERY_ZONE_LABELS,
  IDENTITY_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from '@dostelo/types';
import {
  api,
  formatDateTime,
  formatMinor,
  formatMoney,
  toUiError,
} from '../../../../lib/api';
import { useData } from '../../../../lib/use-data';
import { expireSession } from '../../../../lib/session';
import { useAuth } from '../../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../../components/ui';

/**
 * The CRM timeline (Phase 5): the customer's orders, the visitor
 * activity linked to them through an authenticated or consented
 * flow (sessions, identity status, best lead score), staff notes
 * and tags. Nothing here is inferred from an IP or a fingerprint:
 * the visitor summary only ever aggregates sessions the linking
 * flows recorded against this customer.
 */

function actionErrorMessage(caught: unknown): string | null {
  const uiError = toUiError(caught);
  if (uiError.kind === 'unauthorized') {
    expireSession();
    return null;
  }
  return uiError.message;
}

function NoteForm({
  customerId,
  onDone,
}: {
  customerId: string;
  onDone: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addCustomerNote(customerId, { body: body.trim() });
      setBody('');
      onDone();
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 12 }}>
      <label className="field" style={{ marginTop: 0 }}>
        Add a note
        <textarea
          className="input"
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Recorded with your name and the time; notes are never edited"
        />
      </label>
      <button type="submit" className="btn" disabled={busy || !body.trim()}>
        {busy ? 'Saving...' : 'Add note'}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function TagManager({
  customerId,
  tags,
  canEdit,
  onDone,
}: {
  customerId: string;
  tags: string[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!tag.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addCustomerTag(customerId, { tag: tag.trim() });
      setTag('');
      onDone();
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(value: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.removeCustomerTag(customerId, value);
      onDone();
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {tags.length === 0 ? (
        <EmptyNote>No tags on this customer.</EmptyNote>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tags.map((value) => (
            <span key={value} className="badge">
              {value}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove tag ${value}`}
                  disabled={busy}
                  onClick={() => remove(value)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    marginLeft: 6,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}
      {canEdit ? (
        <form
          onSubmit={add}
          style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'end' }}
        >
          <label className="field" style={{ marginTop: 0, flex: 1 }}>
            New tag
            <input
              className="input"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="Letters, numbers, spaces and dashes"
            />
          </label>
          <button type="submit" className="btn" disabled={busy || !tag.trim()}>
            {busy ? 'Saving...' : 'Add tag'}
          </button>
        </form>
      ) : (
        <p className="note muted">
          Your role cannot edit tags (the customers.edit permission
          is required).
        </p>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const { session } = useAuth();
  const canEdit =
    session.principal?.permissions.includes('customers.edit') ?? false;

  const profile = useData((client) => client.getCustomer(customerId), [
    customerId,
  ]);
  const orders = useData(
    (client) => client.listCustomerOrders(customerId),
    [customerId],
  );
  const timeline = useData(
    (client) => client.getCustomerTimeline(customerId),
    [customerId],
  );
  const customer = profile.data;

  return (
    <section>
      <PageHeader title={customer ? customer.fullName : 'Customer'}>
        <Link href="/crm">Back to customers</Link>
      </PageHeader>

      {profile.loading ? <LoadingNote label="Loading profile..." /> : null}
      {profile.error ? (
        <ErrorNote error={profile.error} onRetry={profile.reload} />
      ) : null}

      {customer ? (
        <>
          <div className="detail-grid">
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Profile</h2>
              <dl className="kv">
                <dt>Name</dt>
                <dd>{customer.fullName}</dd>
                <dt>Email</dt>
                <dd>
                  {customer.email ?? '-'}{' '}
                  {customer.email
                    ? customer.isEmailVerified
                      ? '(verified)'
                      : '(unverified)'
                    : ''}
                </dd>
                <dt>Phone</dt>
                <dd>
                  {customer.phone}{' '}
                  {customer.isPhoneVerified ? '(verified)' : '(unverified)'}
                </dd>
                <dt>Orders</dt>
                <dd>{customer.orderCount}</dd>
                <dt>Lifetime value</dt>
                <dd>{formatMinor(customer.lifetimeValueMinor)}</dd>
                <dt>Joined</dt>
                <dd>{formatDateTime(customer.createdAt)}</dd>
                <dt>Tags</dt>
                <dd>
                  {customer.tags.length > 0
                    ? customer.tags.join(', ')
                    : 'None'}
                </dd>
              </dl>
            </div>
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Addresses</h2>
              {customer.addresses.length === 0 ? (
                <EmptyNote>No saved addresses.</EmptyNote>
              ) : (
                customer.addresses.map((address) => (
                  <div key={address.id} style={{ marginBottom: 14 }}>
                    <div>
                      <strong>{address.fullName}</strong>
                      {address.isDefault ? (
                        <>
                          {' '}
                          <Badge>Default</Badge>
                        </>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                      {address.addressLine}
                      {address.area ? `, ${address.area}` : ''},{' '}
                      {address.city}, {address.district} (
                      {DELIVERY_ZONE_LABELS[address.deliveryZone]})
                      <br />
                      {address.phone}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <h2 className="section-gap" style={{ fontSize: 18 }}>
            Activity timeline
          </h2>
          {timeline.loading ? (
            <LoadingNote label="Loading timeline..." />
          ) : null}
          {timeline.error ? (
            <ErrorNote error={timeline.error} onRetry={timeline.reload} />
          ) : null}
          {timeline.data ? (
            <>
              <div className="detail-grid">
                <div className="card">
                  <h2 style={{ fontSize: 16, marginTop: 0 }}>
                    Visitor activity
                  </h2>
                  <dl className="kv">
                    <dt>Linked sessions</dt>
                    <dd>{timeline.data.visitor.sessionCount}</dd>
                    <dt>Identity status</dt>
                    <dd>
                      {timeline.data.visitor.identityStatuses.length > 0
                        ? timeline.data.visitor.identityStatuses.map(
                            (status) => (
                              <span key={status} style={{ marginRight: 6 }}>
                                <Badge>
                                  {IDENTITY_STATUS_LABELS[status]}
                                </Badge>
                              </span>
                            ),
                          )
                        : 'No linked sessions'}
                    </dd>
                    <dt>Tracked events</dt>
                    <dd>{timeline.data.visitor.eventCount}</dd>
                    <dt>Best lead score</dt>
                    <dd>{timeline.data.visitor.bestLeadScore}</dd>
                    <dt>Last activity</dt>
                    <dd>
                      {timeline.data.visitor.lastActivityAt
                        ? formatDateTime(timeline.data.visitor.lastActivityAt)
                        : 'None recorded'}
                    </dd>
                    <dt>Orders on timeline</dt>
                    <dd>{timeline.data.orders.length}</dd>
                  </dl>
                  {Object.keys(timeline.data.visitor.eventCounts).length >
                  0 ? (
                    <ul className="timeline" style={{ marginTop: 12 }}>
                      {Object.entries(timeline.data.visitor.eventCounts).map(
                        ([type, count]) => (
                          <li key={type}>
                            <Badge>{type}</Badge> × {count}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </div>
                <div className="card">
                  <h2 style={{ fontSize: 16, marginTop: 0 }}>Tags</h2>
                  <TagManager
                    customerId={customerId}
                    tags={timeline.data.tags}
                    canEdit={canEdit}
                    onDone={() => {
                      timeline.reload();
                      profile.reload();
                    }}
                  />
                </div>
              </div>

              <div className="card section-gap">
                <h2 style={{ fontSize: 16, marginTop: 0 }}>Notes</h2>
                {timeline.data.notes.length === 0 ? (
                  <EmptyNote>No staff notes yet.</EmptyNote>
                ) : (
                  <ul className="timeline">
                    {timeline.data.notes.map((note) => (
                      <li key={note.id}>
                        <div>{note.body}</div>
                        <div className="when">
                          {formatDateTime(note.createdAt)} · by{' '}
                          {note.authorId}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit ? (
                  <NoteForm
                    customerId={customerId}
                    onDone={timeline.reload}
                  />
                ) : (
                  <p className="note muted">
                    Your role cannot add notes (the customers.edit
                    permission is required).
                  </p>
                )}
              </div>
            </>
          ) : null}

          <h2 className="section-gap" style={{ fontSize: 18 }}>
            Orders
          </h2>
          {orders.loading ? <LoadingNote label="Loading orders..." /> : null}
          {orders.error ? (
            <ErrorNote error={orders.error} onRetry={orders.reload} />
          ) : null}
          {orders.data && orders.data.items.length === 0 ? (
            <EmptyNote>This customer has not ordered yet.</EmptyNote>
          ) : null}
          {orders.data && orders.data.items.length > 0 ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Placed</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.data.items.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/orders/${order.orderNumber}`}>
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td>{formatDateTime(order.createdAt)}</td>
                      <td>
                        <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
                      </td>
                      <td>{order.paymentStatus}</td>
                      <td className="num">{formatMoney(order.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
