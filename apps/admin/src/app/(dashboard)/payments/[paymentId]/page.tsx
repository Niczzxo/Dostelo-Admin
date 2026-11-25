'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CreditCard,
  History,
  Landmark,
  ReceiptText,
  ShieldCheck,
  Undo2,
  User,
} from 'lucide-react';
import {
  PAYMENT_GATEWAY_LABELS,
  type Payment,
  type Refund,
} from '@dostelo/types';
import { api, formatDateTime, formatMoney, toUiError } from '../../../../lib/api';
import { useData } from '../../../../lib/use-data';
import { expireSession } from '../../../../lib/session';
import { useAuth } from '../../../../components/auth-provider';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  ModuleHeader,
} from '../../../../components/ui';

function handleActionError(caught: unknown): string {
  const uiError = toUiError(caught);
  if (uiError.kind === 'unauthorized') {
    expireSession();
    return 'Your session has expired.';
  }
  return uiError.message;
}

const SENSITIVE_KEY = /token|secret|password|signature/i;

/** Renders an event payload as key and value rows, with any field
 * whose name suggests a secret replaced by the word hidden. Secret
 * values are never shown in the portal. */
function PayloadRows({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload);
  if (entries.length === 0) return <EmptyNote>Empty payload.</EmptyNote>;
  return (
    <dl className="kv">
      {entries.map(([key, value]) => (
        <div key={key} style={{ display: 'contents' }}>
          <dt>{key}</dt>
          <dd>
            {SENSITIVE_KEY.test(key)
              ? 'hidden'
              : value === null || value === undefined
                ? '-'
                : typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function VerifyCard({
  payment,
  onDone,
}: {
  payment: Payment;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'paid' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'paid' | 'rejected'): Promise<void> {
    const confirmed = window.confirm(
      decision === 'paid'
        ? 'Mark this payment as verified and paid?'
        : 'Reject this payment? The attempt will be marked failed.',
    );
    if (!confirmed) return;
    setBusy(decision);
    setError(null);
    try {
      await api.verifyPayment(payment.id, {
        decision,
        note: note.trim() ? note.trim() : undefined,
      });
      onDone();
    } catch (caught) {
      setError(handleActionError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <CardHead icon={ShieldCheck} title="Verify Manual Payment" />
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        The customer reports sending {formatMoney(payment.amount)} from{' '}
        {payment.senderNumber ?? 'an unknown number'} with transaction id{' '}
        {payment.customerTxnId ?? 'not reported'}. Verify only after the money
        is visible in the store account.
      </p>
      <label className="field">
        Note (optional)
        <input
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => decide('paid')}
        >
          {busy === 'paid' ? 'Saving...' : 'Mark as paid'}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy !== null}
          onClick={() => decide('rejected')}
        >
          {busy === 'rejected' ? 'Saving...' : 'Reject'}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RefundCard({
  payment,
  refunds,
  canRefund,
  onDone,
}: {
  payment: Payment;
  refunds: Refund[];
  canRefund: boolean;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refundable =
    payment.status === 'successful' || payment.status === 'collected';

  async function handleRequest(event: FormEvent): Promise<void> {
    event.preventDefault();
    let amountMinor: number | undefined;
    if (amount.trim()) {
      const taka = Number(amount);
      if (!Number.isFinite(taka) || taka <= 0) {
        setError('Enter an amount in taka, or leave it empty for a full refund.');
        return;
      }
      amountMinor = Math.round(taka * 100);
    }
    const confirmed = window.confirm(
      `Record a refund${amountMinor ? ` of ${formatMoney({ amountMinor, currency: 'BDT' })}` : ' for the full remaining amount'} against this payment?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestRefund(payment.id, {
        amountMinor,
        reason: reason.trim() ? reason.trim() : undefined,
      });
      setAmount('');
      setReason('');
      onDone();
    } catch (caught) {
      setError(handleActionError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(refund: Refund): Promise<void> {
    const confirmed = window.confirm(
      'Confirm this refund has actually been handed back to the customer?',
    );
    if (!confirmed) return;
    setConfirmingId(refund.id);
    setError(null);
    try {
      await api.confirmRefund(payment.id, refund.id, {});
      onDone();
    } catch (caught) {
      setError(handleActionError(caught));
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="card">
      <CardHead icon={Undo2} title="Refund History" />
      {refunds.length === 0 ? (
        <EmptyNote>No refunds recorded against this payment.</EmptyNote>
      ) : (
        <ul className="timeline">
          {refunds.map((refund) => (
            <li key={refund.id}>
              <div>
                <Badge>{refund.status}</Badge>{' '}
                <strong>{formatMoney(refund.amount)}</strong>
              </div>
              {refund.reason ? <div>Reason: {refund.reason}</div> : null}
              {refund.gatewayNote ? (
                <div>Gateway: {refund.gatewayNote}</div>
              ) : null}
              <div className="when">
                Recorded {formatDateTime(refund.createdAt)}
                {refund.updatedAt !== refund.createdAt
                  ? `, updated ${formatDateTime(refund.updatedAt)}`
                  : ''}
              </div>
              {canRefund && refund.status === 'manual-pending' ? (
                <button
                  type="button"
                  className="btn btn-small"
                  style={{ marginTop: 8 }}
                  disabled={confirmingId !== null}
                  onClick={() => handleConfirm(refund)}
                >
                  {confirmingId === refund.id
                    ? 'Confirming...'
                    : 'Confirm handed back'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canRefund && refundable ? (
        <form onSubmit={handleRequest} style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>Request a refund</h3>
          <label className="field">
            Amount in taka (empty means full remaining)
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 500"
            />
          </label>
          <label className="field">
            Reason (optional)
            <input
              className="input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn"
            style={{ marginTop: 14 }}
            disabled={busy}
          >
            {busy ? 'Recording...' : 'Record refund'}
          </button>
        </form>
      ) : null}
      {canRefund && !refundable ? (
        <p className="note muted">
          Only a paid payment (successful or collected) can be refunded.
        </p>
      ) : null}
      {!canRefund ? (
        <p className="note muted">
          Your role cannot manage refunds (the payments.refund permission is
          required).
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function PaymentDetailPage() {
  const params = useParams<{ paymentId: string }>();
  const paymentId = params.paymentId;
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canVerify = permissions.includes('payments.verify');
  const canRefund = permissions.includes('payments.refund');
  const canReadOrders = permissions.includes('orders.read');

  const detail = useData((client) => client.getPayment(paymentId), [paymentId]);
  const payment = detail.data?.payment;
  const orders = useData(
    (client) =>
      canReadOrders && payment
        ? client.listStaffOrders()
        : Promise.resolve(null),
    [canReadOrders, payment?.id],
  );
  const order = (orders.data?.items ?? []).find(
    (item) => item.id === payment?.orderId,
  );

  const events = detail.data?.events ?? [];
  const latestPayloadEvent = [...events]
    .reverse()
    .find((event) => event.payload && Object.keys(event.payload).length > 0);
  const confirmed =
    payment?.status === 'successful' || payment?.status === 'collected';

  return (
    <section>
      <ModuleHeader
        icon={CreditCard}
        title="Payment Detail"
        description={
          payment
            ? `${PAYMENT_GATEWAY_LABELS[payment.gateway]} payment, ${payment.channel} channel, status ${payment.status}.`
            : 'One payment attempt with its verification, events and refunds.'
        }
      >
        <Link className="btn btn-secondary" href="/payments">
          <ArrowLeft size={15} /> Back to payments
        </Link>
      </ModuleHeader>

      {detail.loading ? <LoadingNote label="Loading payment..." /> : null}
      {detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : null}

      {payment ? (
        <>
          <div className="detail-grid">
            <div className="card">
              <CardHead icon={ReceiptText} title="Transaction and Order" />
              <dl className="kv">
                <dt>Payment ID</dt>
                <dd>{payment.id}</dd>
                <dt>Transaction ID</dt>
                <dd>
                  {payment.providerTxnId ?? payment.customerTxnId ?? '-'}
                </dd>
                <dt>Status</dt>
                <dd>
                  <Badge>{payment.status}</Badge>
                </dd>
                <dt>Order</dt>
                <dd>
                  {order ? (
                    <Link href={`/orders/${order.orderNumber}`}>
                      {order.orderNumber}
                    </Link>
                  ) : (
                    payment.orderId
                  )}
                </dd>
                <dt>Created</dt>
                <dd>{formatDateTime(payment.createdAt)}</dd>
                <dt>Updated</dt>
                <dd>{formatDateTime(payment.updatedAt)}</dd>
              </dl>
            </div>

            <div className="card">
              <CardHead icon={Landmark} title="Amounts and Gateway" />
              <dl className="kv">
                <dt>Requested amount</dt>
                <dd>
                  <strong>{formatMoney(payment.amount)}</strong>
                </dd>
                <dt>Confirmed amount</dt>
                <dd>
                  {confirmed
                    ? formatMoney(payment.amount)
                    : 'Not confirmed yet'}
                </dd>
                <dt>Gateway</dt>
                <dd>{PAYMENT_GATEWAY_LABELS[payment.gateway]}</dd>
                <dt>Channel</dt>
                <dd>{payment.channel}</dd>
                <dt>Gateway reference</dt>
                <dd>{payment.providerTxnId ?? '-'}</dd>
                {payment.instructions ? (
                  <>
                    <dt>Instructions sent</dt>
                    <dd>
                      {payment.instructions.text} (reference{' '}
                      {payment.instructions.reference})
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>

            <div className="card">
              <CardHead icon={User} title="Customer" />
              {order ? (
                <dl className="kv">
                  <dt>Name</dt>
                  <dd>{order.address.fullName}</dd>
                  <dt>Phone</dt>
                  <dd>{order.address.phone}</dd>
                  <dt>Area</dt>
                  <dd>
                    {order.address.area
                      ? `${order.address.area}, ${order.address.city}`
                      : order.address.city}
                  </dd>
                </dl>
              ) : (
                <EmptyNote>
                  {canReadOrders
                    ? 'The linked order could not be loaded, so customer details are unavailable here.'
                    : 'Customer details come from the linked order and need the orders.read permission.'}
                </EmptyNote>
              )}
              {payment.channel === 'manual' ? (
                <dl className="kv" style={{ marginTop: 12 }}>
                  <dt>Sender number</dt>
                  <dd>{payment.senderNumber ?? '-'}</dd>
                  <dt>Customer txn id</dt>
                  <dd>{payment.customerTxnId ?? '-'}</dd>
                </dl>
              ) : null}
            </div>

            <div className="card">
              <CardHead icon={History} title="Gateway Response Summary" />
              {latestPayloadEvent?.payload ? (
                <>
                  <p className="note muted" style={{ marginTop: 0 }}>
                    From the latest event with a payload ({latestPayloadEvent.type},{' '}
                    {formatDateTime(latestPayloadEvent.createdAt)}). Fields whose
                    names suggest a secret are hidden.
                  </p>
                  <PayloadRows payload={latestPayloadEvent.payload} />
                </>
              ) : (
                <EmptyNote>
                  No gateway or event payload was recorded for this payment.
                </EmptyNote>
              )}
            </div>
          </div>

          <div className="detail-grid section-gap">
            <div className="card">
              <CardHead icon={History} title="Payment Timeline" />
              {events.length === 0 ? (
                <EmptyNote>No events recorded.</EmptyNote>
              ) : (
                <ul className="timeline">
                  {events.map((event) => (
                    <li key={event.id}>
                      <div>
                        <strong>{event.type}</strong>
                        {event.status ? (
                          <>
                            {' '}
                            <Badge>{event.status}</Badge>
                          </>
                        ) : null}
                      </div>
                      {event.payload ? (
                        <div className="muted" style={{ fontSize: 13 }}>
                          {Object.entries(event.payload)
                            .filter(([key]) => !SENSITIVE_KEY.test(key))
                            .slice(0, 4)
                            .map(
                              ([key, value]) =>
                                `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`,
                            )
                            .join(', ')}
                          {Object.keys(event.payload).some((key) =>
                            SENSITIVE_KEY.test(key),
                          )
                            ? ' (sensitive fields hidden)'
                            : ''}
                        </div>
                      ) : null}
                      <div className="when">
                        {formatDateTime(event.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="note muted">
                Audit note: every state change on this payment writes exactly
                one event above. Manual payments are only marked paid through
                the staff verification action, and refunds are only confirmed
                once the money is handed back, so this timeline is the audit
                trail for the money.
              </p>
            </div>

            <div>
              {payment.status === 'verification-pending' &&
              payment.channel === 'manual' ? (
                canVerify ? (
                  <VerifyCard payment={payment} onDone={detail.reload} />
                ) : (
                  <div className="card" style={{ marginBottom: 20 }}>
                    <CardHead icon={ShieldCheck} title="Verify Manual Payment" />
                    <p className="note muted">
                      Your role cannot verify payments (the payments.verify
                      permission is required).
                    </p>
                  </div>
                )
              ) : null}
              <RefundCard
                payment={payment}
                refunds={detail.data?.refunds ?? []}
                canRefund={canRefund}
                onDone={detail.reload}
              />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
