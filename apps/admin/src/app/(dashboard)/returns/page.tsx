'use client';

import { useState, type FormEvent } from 'react';
import {
  RETURN_KIND_LABELS,
  RETURN_KINDS,
  RETURN_STATUSES,
  RETURN_STATUS_LABELS,
  type Order,
  type ReturnKind,
  type ReturnRequest,
  type ReturnStatus,
} from '@dostelo/types';
import { api, formatDateTime, formatMoney, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Returns & Refunds: intake against delivered orders, approval
 * with restock, and the refund hand-off into Payments. The API
 * enforces the rules (delivered orders only, quantities left to
 * return, refund before completion); this page renders the
 * states and offers only the actions the state allows.
 */
export default function ReturnsPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('orders.edit');
  const canRefund = permissions.includes('payments.refund');

  const [status, setStatus] = useState<ReturnStatus | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create form state.
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [kind, setKind] = useState<ReturnKind>('return');
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const returns = useData(
    (client) => client.listReturns(status ? { status } : undefined),
    [status],
  );

  const selected: ReturnRequest | null =
    returns.data?.items.find((item) => item.id === selectedId) ?? null;

  async function runAction(
    action: () => Promise<ReturnRequest>,
    done: string,
  ): Promise<void> {
    setBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await action();
      setActionMessage(done);
      returns.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setActionError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadOrder(event: FormEvent): Promise<void> {
    event.preventDefault();
    setOrderError(null);
    setOrder(null);
    try {
      const detail = await api.getStaffOrder(orderNumber.trim());
      if (detail.order.status !== 'delivered') {
        setOrderError(
          `Order ${detail.order.orderNumber} is ${detail.order.status}. Returns open only against delivered orders.`,
        );
        return;
      }
      setOrder(detail.order);
      setQuantities({});
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setOrderError(uiError.message);
    }
  }

  async function createReturn(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!order) return;
    const items = order.items
      .map((item) => ({
        orderItemId: item.id,
        quantity: Number(quantities[item.id] ?? 0),
      }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) {
      setOrderError('Enter a quantity for at least one item.');
      return;
    }
    setBusy(true);
    setOrderError(null);
    try {
      const created = await api.createReturn({
        orderNumber: order.orderNumber,
        kind,
        reason: reason.trim() ? reason.trim() : undefined,
        items,
      });
      setSelectedId(created.id);
      setOrder(null);
      setOrderNumber('');
      setReason('');
      returns.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setOrderError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader title="Returns & Refunds" />
      <div className="toolbar">
        <label className="field">
          Status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ReturnStatus | '')
            }
          >
            <option value="">All statuses</option>
            {RETURN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {RETURN_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {returns.loading ? <LoadingNote label="Loading returns..." /> : null}
      {returns.error ? (
        <ErrorNote error={returns.error} onRetry={returns.reload} />
      ) : null}
      {returns.data && returns.data.items.length === 0 ? (
        <EmptyNote>
          No return requests yet. Open one below against a delivered order.
        </EmptyNote>
      ) : null}
      {returns.data && returns.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Order</th>
                <th>Kind</th>
                <th>Status</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th>Refund</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {returns.data.items.map((item) => (
                <tr
                  key={item.id}
                  className="clickable"
                  onClick={() => {
                    setSelectedId(item.id);
                    setActionError(null);
                    setActionMessage(null);
                  }}
                >
                  <td>{item.orderNumber}</td>
                  <td>{RETURN_KIND_LABELS[item.kind]}</td>
                  <td>
                    <Badge>{RETURN_STATUS_LABELS[item.status]}</Badge>
                  </td>
                  <td className="num">
                    {item.items.reduce((sum, line) => sum + line.quantity, 0)}
                  </td>
                  <td className="num">{formatMoney(item.total)}</td>
                  <td>{item.refundState}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 17, marginTop: 0 }}>
            {RETURN_KIND_LABELS[selected.kind]} for order{' '}
            {selected.orderNumber}
          </h2>
          <dl className="kv">
            <dt>Status</dt>
            <dd>{RETURN_STATUS_LABELS[selected.status]}</dd>
            <dt>Reason</dt>
            <dd>{selected.reason ?? 'Not given'}</dd>
            <dt>Restocked</dt>
            <dd>{selected.restocked ? 'Yes' : 'No'}</dd>
            <dt>Refund state</dt>
            <dd>
              {selected.refundState}
              {selected.refundId ? ` (refund ${selected.refundId})` : ''}
            </dd>
          </dl>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((line) => (
                  <tr key={line.orderItemId}>
                    <td>{line.productName}</td>
                    <td>{line.variantName ?? ''}</td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{formatMoney(line.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 14,
            }}
          >
            {selected.status === 'requested' && canEdit ? (
              <>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      () => api.approveReturn(selected.id),
                      'Approved. Returned units are back in stock.',
                    )
                  }
                >
                  Approve and restock
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      () => api.rejectReturn(selected.id),
                      'Return rejected.',
                    )
                  }
                >
                  Reject
                </button>
              </>
            ) : null}
            {selected.status === 'approved' &&
            selected.refundState === 'none' &&
            canRefund ? (
              <button
                type="button"
                className="btn btn-small"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    async () => {
                      const result = await api.handOffReturnRefund(
                        selected.id,
                      );
                      return result.request;
                    },
                    'Refund handed off to Payments.',
                  )
                }
              >
                Hand refund off to Payments
              </button>
            ) : null}
            {selected.status === 'approved' &&
            selected.refundState !== 'none' &&
            canEdit ? (
              <button
                type="button"
                className="btn btn-small"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    () => api.completeReturn(selected.id),
                    'Return completed.',
                  )
                }
              >
                Complete return
              </button>
            ) : null}
            {selected.status === 'approved' &&
            selected.refundState === 'none' ? (
              <span className="note muted">
                Hand the refund off (or let the API record that none is
                needed) before this return can complete.
              </span>
            ) : null}
          </div>
          {actionMessage ? (
            <p className="note" style={{ margin: '10px 0 0' }}>
              {actionMessage}
            </p>
          ) : null}
          {actionError ? (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        <div className="card" style={{ marginTop: 20, maxWidth: 760 }}>
          <h2 style={{ fontSize: 17, marginTop: 0 }}>Open a return</h2>
          <form onSubmit={loadOrder}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ flex: 1, minWidth: 180, marginTop: 0 }}
                placeholder="Order number, for example BP-123456"
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                aria-label="Order number"
              />
              <button type="submit" className="btn btn-small">
                Load order
              </button>
            </div>
          </form>
          {order ? (
            <form onSubmit={createReturn} style={{ marginTop: 14 }}>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th className="num">Ordered</th>
                      <th className="num">Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productName}</td>
                        <td>{item.variantName ?? ''}</td>
                        <td className="num">{item.quantity}</td>
                        <td className="num">
                          <input
                            className="input"
                            style={{ width: 80, marginTop: 0 }}
                            inputMode="numeric"
                            value={quantities[item.id] ?? ''}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            aria-label={`Return quantity for ${item.productName}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="toolbar" style={{ marginTop: 12 }}>
                <label className="field">
                  Kind
                  <select
                    className="select"
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as ReturnKind)
                    }
                  >
                    {RETURN_KINDS.map((value) => (
                      <option key={value} value={value}>
                        {RETURN_KIND_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ flex: 1, minWidth: 200 }}>
                  Reason
                  <input
                    className="input"
                    placeholder="Why the customer is returning it"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-small"
                  disabled={busy}
                >
                  {busy ? 'Saving...' : 'Create return request'}
                </button>
              </div>
            </form>
          ) : null}
          {orderError ? (
            <p className="form-error" role="alert">
              {orderError}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="note muted" style={{ marginTop: 20 }}>
          Your role can view returns but cannot open or decide them (the
          orders.edit permission is required).
        </p>
      )}
    </section>
  );
}
