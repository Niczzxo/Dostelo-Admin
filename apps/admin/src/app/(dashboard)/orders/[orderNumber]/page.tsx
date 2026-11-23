'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  DELIVERY_ZONE_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_GATEWAY_LABELS,
  type OrderStatus,
} from '@dostelo/types';
import { api, formatDateTime, formatMoney, toUiError } from '../../../../lib/api';
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

function TransitionControls({
  orderNumber,
  currentStatus,
  allowed,
  onDone,
}: {
  orderNumber: string;
  currentStatus: OrderStatus;
  allowed: OrderStatus[];
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(to: OrderStatus): Promise<void> {
    const confirmed = window.confirm(
      `Move order ${orderNumber} from ${ORDER_STATUS_LABELS[currentStatus]} to ${ORDER_STATUS_LABELS[to]}?`,
    );
    if (!confirmed) return;
    setBusy(to);
    setError(null);
    try {
      await api.transitionOrderStatus(orderNumber, {
        status: to,
        note: note.trim() ? note.trim() : undefined,
      });
      setNote('');
      onDone();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(null);
    }
  }

  if (allowed.length === 0) {
    return (
      <p className="note muted">
        This order is in a terminal state; no further transitions are
        available.
      </p>
    );
  }
  return (
    <div>
      <label className="field" style={{ marginTop: 0 }}>
        Note (optional)
        <input
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Recorded with the status event"
        />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {allowed.map((to) => (
          <button
            key={to}
            type="button"
            className={to === 'cancelled' ? 'btn btn-danger' : 'btn'}
            disabled={busy !== null}
            onClick={() => move(to)}
          >
            {busy === to ? 'Moving...' : `Move to ${ORDER_STATUS_LABELS[to]}`}
          </button>
        ))}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = params.orderNumber;
  const { session } = useAuth();
  const canEdit =
    session.principal?.permissions.includes('orders.edit') ?? false;

  const detail = useData(
    (client) => client.getStaffOrder(orderNumber),
    [orderNumber],
  );
  const order = detail.data?.order;
  const payments = useData(
    (client) =>
      order
        ? client.listPayments({ orderId: order.id })
        : Promise.resolve({ items: [] }),
    [order?.id],
  );

  return (
    <section>
      <PageHeader title={`Order ${orderNumber}`}>
        <Link href="/orders">Back to orders</Link>
      </PageHeader>

      {detail.loading ? <LoadingNote label="Loading order..." /> : null}
      {detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : null}

      {order ? (
        <>
          <div className="detail-grid">
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Summary</h2>
              <dl className="kv">
                <dt>Status</dt>
                <dd>
                  <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
                </dd>
                <dt>Payment</dt>
                <dd>{order.paymentStatus}</dd>
                <dt>Placed</dt>
                <dd>{formatDateTime(order.createdAt)}</dd>
                <dt>Updated</dt>
                <dd>{formatDateTime(order.updatedAt)}</dd>
                <dt>Customer</dt>
                <dd>
                  <Link href={`/crm/${order.customerId}`}>
                    {order.address.fullName}
                  </Link>
                </dd>
                <dt>First order offer</dt>
                <dd>{order.firstOrderFreeDelivery ? 'Free delivery applied' : 'No'}</dd>
                {order.adminNote ? (
                  <>
                    <dt>Admin note</dt>
                    <dd>{order.adminNote}</dd>
                  </>
                ) : null}
              </dl>
            </div>
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Delivery address</h2>
              <dl className="kv">
                <dt>Name</dt>
                <dd>{order.address.fullName}</dd>
                <dt>Phone</dt>
                <dd>{order.address.phone}</dd>
                <dt>Address</dt>
                <dd>{order.address.addressLine}</dd>
                {order.address.area ? (
                  <>
                    <dt>Area</dt>
                    <dd>{order.address.area}</dd>
                  </>
                ) : null}
                <dt>City</dt>
                <dd>{order.address.city}</dd>
                <dt>District</dt>
                <dd>{order.address.district}</dd>
                <dt>Zone</dt>
                <dd>{DELIVERY_ZONE_LABELS[order.address.deliveryZone]}</dd>
              </dl>
            </div>
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Totals</h2>
              <dl className="kv">
                <dt>Subtotal</dt>
                <dd>{formatMoney(order.subtotal)}</dd>
                <dt>Delivery fee</dt>
                <dd>{formatMoney(order.deliveryFee)}</dd>
                <dt>COD fee</dt>
                <dd>{formatMoney(order.codFee)}</dd>
                <dt>Discount</dt>
                <dd>{formatMoney(order.discount)}</dd>
                <dt>Total</dt>
                <dd>
                  <strong>{formatMoney(order.total)}</strong>
                </dd>
              </dl>
            </div>
          </div>

          <h2 className="section-gap" style={{ fontSize: 18 }}>
            Items
          </h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.productName}</td>
                    <td>{item.variantName ?? '-'}</td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{formatMoney(item.unitPrice)}</td>
                    <td className="num">{formatMoney(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="section-gap" style={{ fontSize: 18 }}>
            Payment attempts
          </h2>
          {payments.loading ? (
            <LoadingNote label="Loading payments..." />
          ) : null}
          {payments.error ? (
            <ErrorNote error={payments.error} onRetry={payments.reload} />
          ) : null}
          {payments.data && payments.data.items.length === 0 ? (
            <EmptyNote>No payment attempts recorded for this order.</EmptyNote>
          ) : null}
          {payments.data && payments.data.items.length > 0 ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Gateway</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th className="num">Amount</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.items.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <Link href={`/payments/${payment.id}`}>
                          {PAYMENT_GATEWAY_LABELS[payment.gateway]}
                        </Link>
                      </td>
                      <td>{payment.channel}</td>
                      <td>
                        <Badge>{payment.status}</Badge>
                      </td>
                      <td className="num">{formatMoney(payment.amount)}</td>
                      <td>{formatDateTime(payment.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="detail-grid section-gap">
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Status history</h2>
              {detail.data && detail.data.events.length === 0 ? (
                <EmptyNote>No status events recorded.</EmptyNote>
              ) : null}
              <ul className="timeline">
                {(detail.data?.events ?? []).map((event) => (
                  <li key={event.id}>
                    <div>
                      <Badge>{ORDER_STATUS_LABELS[event.status]}</Badge>
                    </div>
                    {event.note ? <div>{event.note}</div> : null}
                    <div className="when">
                      {formatDateTime(event.createdAt)}
                      {event.actorId ? ` · by ${event.actorId}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Move this order</h2>
              {canEdit ? (
                <TransitionControls
                  orderNumber={order.orderNumber}
                  currentStatus={order.status}
                  allowed={detail.data?.allowedTransitions ?? []}
                  onDone={() => {
                    detail.reload();
                    payments.reload();
                  }}
                />
              ) : (
                <p className="note muted">
                  Your role cannot change order status (the orders.edit
                  permission is required).
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
