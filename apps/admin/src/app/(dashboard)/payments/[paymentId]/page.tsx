'use client';

import { use, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, Field, KeyValues, LoadingNote,
  ModuleHeader, StatusBadge, TextInput, Timeline,
} from '../../../../components/ui';
import { moneyOf } from '../../../../lib/api';
import { useAction, useData } from '../../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../../lib/types';

/* Payment detail: GET /v1/payments/:paymentId returns the payment,
   its events and its refunds. Manual verification posts the
   transaction reference the staff member checked against the
   provider or bank record; the order is never marked paid from
   this screen without that verified payment behind it. Refunds
   are requested here and confirmed as a separate step. */
export default function PaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = use(params);
  const detail = useData((c) => c.getPayment(paymentId), [paymentId]);
  const action = useAction();
  const [reference, setReference] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const data = asRec(detail.data);
  const payment = asRec(data.payment ?? detail.data);
  const events = itemsOf(data.events);
  const refunds = itemsOf(data.refunds);

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.verifyPayment(paymentId, { reference }))) detail.reload();
  }

  async function requestRefund(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { reason: refundReason };
    if (refundAmount) dto.amountMinor = Math.round(Number(refundAmount) * 100);
    if (await action.run((c) => c.requestRefund(paymentId, dto))) detail.reload();
  }

  return (
    <>
      <ModuleHeader
        icon={CreditCard}
        title="Payment detail"
        description="One payment: its events, verification and refunds, exactly as recorded by the API."
      >
        <Link className="btn secondary" href="/payments">Back to payments</Link>
      </ModuleHeader>
      {detail.loading ? (
        <LoadingNote />
      ) : detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : (
        <>
          <ActionError error={action.error} />
          <Card title="Payment">
            <KeyValues
              entries={[
                ['Payment ID', str(payment.id ?? payment.paymentId)],
                ['Order', str(payment.orderNumber)],
                ['Gateway', str(payment.gateway)],
                ['Method', str(payment.method)],
                ['Status', <StatusBadge key="s" status={payment.status} />],
                ['Amount', moneyOf(payment.amount)],
                ['Transaction reference', str(payment.reference ?? payment.transactionId) || 'None recorded'],
                ['Recorded', str(payment.createdAt)],
              ]}
            />
          </Card>
          <div className="section-grid">
            <Card title="Verify manually">
              <p className="note">
                For manual payments (bank transfer, mobile money sent by the customer): check the
                transaction against the provider or bank record first, then enter its reference.
                Verification is what allows the order to count as paid.
              </p>
              <form onSubmit={verify}>
                <Field label="Verified transaction reference">
                  <TextInput required value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
                <button type="submit" className="btn" disabled={action.busy}>Verify payment</button>
              </form>
            </Card>
            <Card title="Request a refund">
              <form onSubmit={requestRefund}>
                <Field label="Amount (BDT, blank for full)">
                  <TextInput type="number" min={0} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
                </Field>
                <Field label="Reason">
                  <TextInput required value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
                </Field>
                <button type="submit" className="btn" disabled={action.busy}>Request refund</button>
              </form>
            </Card>
          </div>
          <Card title="Refunds">
            <DataTable
              searchable={false}
              emptyText="No refunds on this payment."
              columns={[
                { key: 'id', label: 'Refund' },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'amount', label: 'Amount', money: true },
                { key: 'reason', label: 'Reason' },
                {
                  key: 'confirm', label: 'Action',
                  render: (r) => str(r.status) === 'requested' || str(r.status) === 'pending' ? (
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={action.busy}
                      onClick={async () => {
                        if (await action.run((c) => c.confirmRefund(paymentId, str(r.id)))) detail.reload();
                      }}
                    >
                      Confirm refund
                    </button>
                  ) : <span className="note">Settled in Payments</span>,
                },
              ]}
              rows={refunds}
            />
          </Card>
          <Card title="Payment events">
            <Timeline items={events} />
          </Card>
        </>
      )}
    </>
  );
}
