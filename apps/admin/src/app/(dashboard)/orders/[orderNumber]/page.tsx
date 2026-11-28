'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ClipboardList,
  CreditCard,
  FileText,
  Package,
  Printer,
  RotateCcw,
  Truck,
  User,
} from 'lucide-react';
import {
  COURIER_LABELS,
  DELIVERY_ZONE_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_GATEWAY_LABELS,
  SHIPMENT_STATUS_LABELS,
  type OrderStatus,
} from '@dostelo/types';
import {
  api,
  formatDateTime,
  formatMoney,
  toUiError,
} from '../../../../lib/api';
import { useData } from '../../../../lib/use-data';
import { expireSession } from '../../../../lib/session';
import { useAuth } from '../../../../components/auth-provider';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  Modal,
  ModuleHeader,
} from '../../../../components/ui';

type PrintSheetKind = 'invoice' | 'packing';

/**
 * Order detail: summary, customer, items, financials, payments,
 * shipments and the status timeline from getStaffOrder, with the
 * legal transitions the API returns (allowedTransitions) as the
 * only status actions. Print Invoice and Print Packing Slip render
 * a .print-sheet for the chosen document and call window.print();
 * everything else on the page carries .no-print.
 *
 * Note on internal notes: the API exposes order.adminNote as a
 * read-only field and the client has no updateOrderNote style
 * method, so staff notes are recorded with status transitions
 * (the note field in the Move card, stored on the status event).
 */
export default function OrderDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = params.orderNumber;
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('orders.edit');
  const canCustomers = permissions.includes('customers.read');
  const canShipping = permissions.includes('shipping.read');
  const canProducts = permissions.includes('products.read');

  const detail = useData(
    (client) => client.getStaffOrder(orderNumber),
    [orderNumber],
  );
  const order = detail.data?.order;
  const allowed = detail.data?.allowedTransitions ?? [];

  const payments = useData(
    (client) =>
      order
        ? client.listPayments({ orderId: order.id })
        : Promise.resolve({ items: [] }),
    [order?.id],
  );
  const shipments = useData(
    (client) =>
      canShipping
        ? client.listShipments({ orderNumber })
        : Promise.resolve(null),
    [orderNumber, canShipping],
  );
  const products = useData(
    (client) =>
      canProducts ? client.listProducts() : Promise.resolve(null),
    [canProducts],
  );
  const customer = useData(
    (client) =>
      canCustomers && order
        ? client.getCustomer(order.customerId)
        : Promise.resolve(null),
    [canCustomers, order?.customerId],
  );

  const [target, setTarget] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [printSheet, setPrintSheet] = useState<PrintSheetKind | null>(null);

  useEffect(() => {
    if (!printSheet) return;
    const timer = window.setTimeout(() => window.print(), 60);
    const clear = () => setPrintSheet(null);
    window.addEventListener('afterprint', clear);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', clear);
    };
  }, [printSheet]);

  const productById = new Map(
    (products.data?.items ?? []).map((product) => [product.id, product]),
  );
  const firstPayment = payments.data?.items[0] ?? null;
  const isGuest = customer.data ? customer.data.userId === null : !order?.customerId;
  const canCancel = allowed.includes('cancelled');
  const canConfirm = allowed.includes('confirmed');
  const selectableTargets = allowed.filter((status) => status !== 'cancelled');

  async function move(to: OrderStatus, moveNote?: string): Promise<boolean> {
    if (!order) return false;
    setBusy(true);
    setActionError(null);
    try {
      await api.transitionOrderStatus(order.orderNumber, {
        status: to,
        note: moveNote?.trim() ? moveNote.trim() : undefined,
      });
      setNote('');
      detail.reload();
      payments.reload();
      shipments.reload();
      return true;
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return false;
      }
      setActionError(uiError.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmOrder(): Promise<void> {
    if (!order) return;
    const confirmed = window.confirm(
      `Confirm order ${order.orderNumber}? It moves from ${ORDER_STATUS_LABELS[order.status]} to Confirmed.`,
    );
    if (!confirmed) return;
    await move('confirmed');
  }

  const headerActions = order ? (
    <>
      <Link className="btn btn-secondary" href="/orders">
        Back to orders
      </Link>
      {canEdit && canConfirm ? (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void confirmOrder()}
        >
          Confirm order
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setPrintSheet('invoice')}
      >
        <Printer size={15} /> Print Invoice
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setPrintSheet('packing')}
      >
        <FileText size={15} /> Print Packing Slip
      </button>
      <Link
        className="btn btn-secondary"
        href={firstPayment ? `/payments/${firstPayment.id}` : '/payments'}
      >
        <CreditCard size={15} /> Create Refund
      </Link>
      <Link className="btn btn-secondary" href="/returns">
        <RotateCcw size={15} /> Create Return
      </Link>
      <Link className="btn btn-secondary" href="/shipping">
        <Truck size={15} /> Create Shipment
      </Link>
      {canEdit && canCancel ? (
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => setCancelOpen(true)}
        >
          Cancel Order
        </button>
      ) : null}
    </>
  ) : (
    <Link className="btn btn-secondary" href="/orders">
      Back to orders
    </Link>
  );

  return (
    <section>
      <div className="no-print">
        <ModuleHeader
          icon={ClipboardList}
          title={`Order ${orderNumber}`}
          description={
            order
              ? `Placed ${formatDateTime(order.createdAt)}, updated ${formatDateTime(order.updatedAt)}`
              : 'Loading the order from the API.'
          }
        >
          {headerActions}
        </ModuleHeader>

        {detail.loading ? <LoadingNote label="Loading order..." /> : null}
        {detail.error ? (
          <ErrorNote error={detail.error} onRetry={detail.reload} />
        ) : null}
        {actionError ? (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        ) : null}

        {order ? (
          <>
            <p style={{ marginTop: 0 }}>
              <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>{' '}
              <span className="muted">
                Payment: {order.paymentStatus}
                {order.firstOrderFreeDelivery
                  ? ' · First order free delivery applied'
                  : ''}
              </span>
            </p>

            <div className="detail-grid">
              <div className="card">
                <CardHead icon={User} title="Customer" />
                <dl className="kv">
                  <dt>Name</dt>
                  <dd>
                    {order.customerId ? (
                      <Link href={`/crm/${order.customerId}`}>
                        {order.address.fullName}
                      </Link>
                    ) : (
                      order.address.fullName
                    )}
                    {isGuest ? ' (Guest)' : ''}
                  </dd>
                  <dt>Phone</dt>
                  <dd>{order.address.phone}</dd>
                  {customer.data?.email ? (
                    <>
                      <dt>Email</dt>
                      <dd>{customer.data.email}</dd>
                    </>
                  ) : null}
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
                  {order.adminNote ? (
                    <>
                      <dt>Admin note</dt>
                      <dd>{order.adminNote}</dd>
                    </>
                  ) : null}
                </dl>
                <p className="note muted">
                  Internal notes are recorded with status changes in the
                  Move this order card; the API has no separate order note
                  update.
                </p>
              </div>

              <div className="card">
                <CardHead icon={FileText} title="Financials" />
                <dl className="kv">
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(order.subtotal)}</dd>
                  <dt>Discount</dt>
                  <dd>{formatMoney(order.discount)}</dd>
                  <dt>Delivery charge</dt>
                  <dd>
                    {formatMoney(order.deliveryFee)}
                    {order.firstOrderFreeDelivery
                      ? ' (free delivery offer applied)'
                      : ''}
                  </dd>
                  <dt>COD fee</dt>
                  <dd>{formatMoney(order.codFee)}</dd>
                  <dt>Total</dt>
                  <dd>
                    <strong>{formatMoney(order.total)}</strong>
                  </dd>
                </dl>
                <p className="note muted">
                  The order record carries a discount amount only; it has
                  no coupon field, so no coupon line is shown.
                </p>
              </div>

              <div className="card">
                <CardHead icon={CreditCard} title="Payment" />
                <dl className="kv">
                  <dt>Status</dt>
                  <dd>{order.paymentStatus}</dd>
                  <dt>Method</dt>
                  <dd>
                    {firstPayment
                      ? PAYMENT_GATEWAY_LABELS[firstPayment.gateway]
                      : 'No payment attempt recorded'}
                  </dd>
                  {firstPayment ? (
                    <>
                      <dt>Channel</dt>
                      <dd>{firstPayment.channel}</dd>
                      <dt>Latest attempt</dt>
                      <dd>
                        <Link href={`/payments/${firstPayment.id}`}>
                          {PAYMENT_GATEWAY_LABELS[firstPayment.gateway]} ·{' '}
                          {firstPayment.status} ·{' '}
                          {formatMoney(firstPayment.amount)}
                        </Link>
                      </dd>
                    </>
                  ) : null}
                </dl>
              </div>

              <div className="card">
                <CardHead icon={Truck} title="Shipping" />
                {!canShipping ? (
                  <EmptyNote>
                    Your role cannot view shipments (shipping.read).
                  </EmptyNote>
                ) : shipments.loading ? (
                  <LoadingNote label="Loading shipments..." />
                ) : shipments.error ? (
                  <ErrorNote
                    error={shipments.error}
                    onRetry={shipments.reload}
                  />
                ) : (shipments.data?.items ?? []).length === 0 ? (
                  <EmptyNote>
                    No shipment booked for this order yet.{' '}
                    <Link href="/shipping">Create Shipment</Link>
                  </EmptyNote>
                ) : (
                  <ul className="timeline">
                    {(shipments.data?.items ?? []).map((shipment) => (
                      <li key={shipment.id}>
                        <div>
                          <Badge>
                            {SHIPMENT_STATUS_LABELS[shipment.status]}
                          </Badge>{' '}
                          <Link href={`/shipping/${shipment.id}`}>
                            {COURIER_LABELS[shipment.courier]}
                          </Link>
                        </div>
                        <div>
                          {shipment.trackingId
                            ? `Tracking: ${shipment.trackingId}`
                            : 'No tracking id yet (courier not confirmed)'}
                        </div>
                        <div className="when">
                          Booked {formatDateTime(shipment.createdAt)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="card section-gap">
              <CardHead icon={Package} title="Items" />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th className="num">Qty</th>
                      <th className="num">Unit price</th>
                      <th className="num">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => {
                      const product = productById.get(item.productId);
                      const media = product?.media
                        .filter((entry) => entry.type === 'image')
                        .slice()
                        .sort((a, b) => a.position - b.position)[0];
                      return (
                        <tr key={item.id}>
                          <td>
                            <span className="identity-cell">
                              <span className="thumb">
                                {media ? (
                                  <img src={media.url} alt={media.alt} />
                                ) : (
                                  <Package size={16} />
                                )}
                              </span>
                              <span className="identity-main">
                                {item.productName}
                              </span>
                            </span>
                          </td>
                          <td>{item.variantName ?? 'No variant'}</td>
                          <td className="num">{item.quantity}</td>
                          <td className="num">
                            {formatMoney(item.unitPrice)}
                          </td>
                          <td className="num">
                            {formatMoney(item.lineTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card section-gap">
              <CardHead icon={CreditCard} title="Payment attempts" />
              {payments.loading ? (
                <LoadingNote label="Loading payments..." />
              ) : null}
              {payments.error ? (
                <ErrorNote error={payments.error} onRetry={payments.reload} />
              ) : null}
              {payments.data && payments.data.items.length === 0 ? (
                <EmptyNote>
                  No payment attempts recorded for this order.
                </EmptyNote>
              ) : null}
              {payments.data && payments.data.items.length > 0 ? (
                <div className="table-wrap">
                  <table>
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
                          <td className="num">
                            {formatMoney(payment.amount)}
                          </td>
                          <td>{formatDateTime(payment.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="detail-grid section-gap">
              <div className="card">
                <CardHead icon={ClipboardList} title="Timeline" />
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
                <CardHead icon={Truck} title="Move this order" />
                {!canEdit ? (
                  <p className="note muted">
                    Your role cannot change order status (the orders.edit
                    permission is required).
                  </p>
                ) : allowed.length === 0 ? (
                  <p className="note muted">
                    This order is in a terminal state; no further
                    transitions are available.
                  </p>
                ) : (
                  <div>
                    <label className="field" style={{ marginTop: 0 }}>
                      Update status to
                      <select
                        className="select"
                        value={target}
                        onChange={(event) =>
                          setTarget(event.target.value as OrderStatus | '')
                        }
                      >
                        <option value="">Select a status</option>
                        {selectableTargets.map((status) => (
                          <option key={status} value={status}>
                            {ORDER_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Internal note (optional)
                      <input
                        className="input"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Recorded with the status event"
                      />
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginTop: 12,
                      }}
                    >
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || !target}
                        onClick={() => {
                          if (target) void move(target, note);
                        }}
                      >
                        {busy ? 'Updating...' : 'Update Status'}
                      </button>
                      {canCancel ? (
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={busy}
                          onClick={() => setCancelOpen(true)}
                        >
                          Cancel Order
                        </button>
                      ) : null}
                    </div>
                    <p className="note muted">
                      Only the transitions the API allows from{' '}
                      {ORDER_STATUS_LABELS[order.status]} are offered.
                      Cancellation has its own confirmation step.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {cancelOpen && order ? (
        <Modal title="Cancel this order" onClose={() => setCancelOpen(false)}>
          <p className="note">
            Cancel order <strong>{order.orderNumber}</strong>, currently{' '}
            {ORDER_STATUS_LABELS[order.status]}? The reserved stock is
            released by the server. This cannot be undone from the portal.
          </p>
          <label className="field">
            Internal note (optional)
            <input
              className="input"
              value={cancelNote}
              onChange={(event) => setCancelNote(event.target.value)}
              placeholder="Recorded with the cancellation event"
            />
          </label>
          {actionError ? (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={async () => {
                const ok = await move('cancelled', cancelNote);
                if (ok) {
                  setCancelOpen(false);
                  setCancelNote('');
                }
              }}
            >
              {busy ? 'Cancelling...' : 'Yes, cancel the order'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setCancelOpen(false)}
            >
              Keep the order
            </button>
          </div>
        </Modal>
      ) : null}

      {printSheet && order ? (
        <div className="card print-sheet">
          {printSheet === 'invoice' ? (
            <>
              <h2 style={{ marginTop: 0 }}>Dostelo Invoice</h2>
              <dl className="kv">
                <dt>Order</dt>
                <dd>{order.orderNumber}</dd>
                <dt>Date</dt>
                <dd>{formatDateTime(order.createdAt)}</dd>
                <dt>Status</dt>
                <dd>{ORDER_STATUS_LABELS[order.status]}</dd>
                <dt>Payment</dt>
                <dd>
                  {order.paymentStatus}
                  {firstPayment
                    ? ` via ${PAYMENT_GATEWAY_LABELS[firstPayment.gateway]}`
                    : ''}
                </dd>
                <dt>Bill to</dt>
                <dd>
                  {order.address.fullName}, {order.address.addressLine}
                  {order.address.area ? `, ${order.address.area}` : ''},{' '}
                  {order.address.city}, {order.address.district} (
                  {order.address.phone})
                </dd>
              </dl>
              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table>
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
                        <td>{item.variantName ?? 'No variant'}</td>
                        <td className="num">{item.quantity}</td>
                        <td className="num">{formatMoney(item.unitPrice)}</td>
                        <td className="num">{formatMoney(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="kv" style={{ marginTop: 14 }}>
                <dt>Subtotal</dt>
                <dd>{formatMoney(order.subtotal)}</dd>
                <dt>Discount</dt>
                <dd>{formatMoney(order.discount)}</dd>
                <dt>Delivery charge</dt>
                <dd>{formatMoney(order.deliveryFee)}</dd>
                <dt>COD fee</dt>
                <dd>{formatMoney(order.codFee)}</dd>
                <dt>Total</dt>
                <dd>
                  <strong>{formatMoney(order.total)}</strong>
                </dd>
              </dl>
            </>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>Dostelo Packing Slip</h2>
              <dl className="kv">
                <dt>Order</dt>
                <dd>{order.orderNumber}</dd>
                <dt>Deliver to</dt>
                <dd>
                  {order.address.fullName}, {order.address.addressLine}
                  {order.address.area ? `, ${order.address.area}` : ''},{' '}
                  {order.address.city}, {order.address.district}
                </dd>
                <dt>Phone</dt>
                <dd>{order.address.phone}</dd>
                <dt>Zone</dt>
                <dd>{DELIVERY_ZONE_LABELS[order.address.deliveryZone]}</dd>
                {(shipments.data?.items ?? []).length > 0 ? (
                  <>
                    <dt>Shipment</dt>
                    <dd>
                      {COURIER_LABELS[shipments.data!.items[0]!.courier]} ·{' '}
                      {SHIPMENT_STATUS_LABELS[shipments.data!.items[0]!.status]}
                      {shipments.data!.items[0]!.trackingId
                        ? ` · Tracking ${shipments.data!.items[0]!.trackingId}`
                        : ''}
                    </dd>
                  </>
                ) : null}
              </dl>
              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th>SKU</th>
                      <th className="num">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productName}</td>
                        <td>{item.variantName ?? 'No variant'}</td>
                        <td>{item.sku ?? 'No SKU'}</td>
                        <td className="num">{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note">
                Total items:{' '}
                {order.items.reduce((sum, item) => sum + item.quantity, 0)}.
                Prices are not shown on the packing slip.
              </p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
