'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../../components/ui';

function handleActionError(caught: unknown): string {
  const uiError = toUiError(caught);
  if (uiError.kind === 'unauthorized') {
    expireSession();
    return 'Your session has expired.';
  }
  return uiError.message;
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
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Verify manual payment</h2>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        The customer reports sending {formatMoney(payment.amount)} from{' '}
        {payment.senderNumber ?? 'an unknown number'} with transaction id{' '}
        {payment.customerTxnId ?? 'not reported'}. Verify only after the
        money is visible in the store account.
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
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Refunds</h2>
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
              {refund.reason ? <div>{refund.reason}</div> : null}
              {refund.gatewayNote ? <div>{refund.gatewayNote}</div> : null}
              <div className="when">{formatDateTime(refund.createdAt)}</div>
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
          Your role cannot manage refunds (the payments.refund permission
          is required).
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

  const detail = useData((client) => client.getPayment(paymentId), [paymentId]);
  const payment = detail.data?.payment;

  return (
    <section>
      <PageHeader title="Payment detail">
        <Link href="/payments">Back to payments</Link>
      </PageHeader>

      {detail.loading ? <LoadingNote label="Loading payment..." /> : null}
      {detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : null}

      {payment ? (
        <>
          <div className="detail-grid">
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Payment</h2>
              <dl className="kv">
                <dt>Gateway</dt>
                <dd>{PAYMENT_GATEWAY_LABELS[payment.gateway]}</dd>
                <dt>Channel</dt>
                <dd>{payment.channel}</dd>
                <dt>Status</dt>
                <dd>
                  <Badge>{payment.status}</Badge>
                </dd>
                <dt>Amount</dt>
                <dd>
                  <strong>{formatMoney(payment.amount)}</strong>
                </dd>
                <dt>Order</dt>
                <dd>{payment.orderId}</dd>
                <dt>Provider txn</dt>
                <dd>{payment.providerTxnId ?? '-'}</dd>
                <dt>Created</dt>
                <dd>{formatDateTime(payment.createdAt)}</dd>
                <dt>Updated</dt>
                <dd>{formatDateTime(payment.updatedAt)}</dd>
              </dl>
            </div>
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Events</h2>
              {detail.data && detail.data.events.length === 0 ? (
                <EmptyNote>No events recorded.</EmptyNote>
              ) : null}
              <ul className="timeline">
                {(detail.data?.events ?? []).map((event) => (
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
                    <div className="when">
                      {formatDateTime(event.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="detail-grid section-gap">
            {payment.status === 'verification-pending' &&
            payment.channel === 'manual' ? (
              canVerify ? (
                <VerifyCard payment={payment} onDone={detail.reload} />
              ) : (
                <div className="card">
                  <h2 style={{ fontSize: 16, marginTop: 0 }}>
                    Verify manual payment
                  </h2>
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
        </>
      ) : null}
    </section>
  );
}
