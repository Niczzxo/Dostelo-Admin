'use client';

import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import {
  Card, DataTable, ErrorNote, LoadingNote, ModuleHeader, StatCard, StatGrid,
  StatusBadge, StatusTabs, Unavailable,
} from '../../../components/ui';
import { ValueBars } from '../../../components/charts';
import { formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../lib/types';
import { useState } from 'react';

/* Payments & Finance: payments from GET /v1/payments, the
   reconciliation summary, settlement records and gateway fee
   tracking. Verification and refunds live on the payment detail.
   A payment is only ever shown in the state the API recorded;
   nothing here marks a payment verified without the verify call.
   Gateways answer not-configured until the owner adds merchant
   credentials, and settlements and fees panels say so honestly
   when the running API has no such records endpoint yet. */
const TABS = [
  { value: '', label: 'All gateways' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'sslcommerz', label: 'SSLCommerz' },
  { value: 'cod', label: 'Cash on delivery' },
  { value: 'manual', label: 'Manual' },
];

export default function PaymentsPage() {
  const [gateway, setGateway] = useState('');
  const payments = useData((c) => c.listPayments(gateway ? { gateway } : {}), [gateway]);
  const summary = useData((c) => c.getPaymentsSummary());
  const settlements = useData((c) => c.gap.listSettlements());
  const fees = useData((c) => c.gap.listGatewayFees());

  const items = itemsOf(payments.data);
  const summaryRec = asRec(summary.data);
  const byStatus = itemsOf(summaryRec.byStatus);
  const settlementItems = settlements.data ? itemsOf(settlements.data) : [];
  const feeItems = fees.data ? itemsOf(fees.data) : [];

  return (
    <>
      <ModuleHeader
        icon={CreditCard}
        title="Payments & Finance"
        description="Reconciliation across gateways, settlement records and fee tracking, all from real payment records. Gateways stay not-configured until merchant credentials exist."
      />
      <StatGrid>
        <StatCard label="Payments recorded" value={summary.loading ? '...' : String(num(summaryRec.count))} />
        <StatCard label="Total recorded" value={formatMinor(num(summaryRec.totalMinor))} />
        <StatCard label="In this view" value={payments.loading ? '...' : String(items.length)} />
        <StatCard label="Settlements" value={settlements.data === null ? 'Unavailable' : String(settlementItems.length)} />
      </StatGrid>

      <div className="section-grid">
        <Card title="Reconciliation by status">
          {summary.loading ? (
            <LoadingNote />
          ) : summary.error ? (
            <ErrorNote error={summary.error} onRetry={summary.reload} />
          ) : (
            <ValueBars rows={byStatus.map((g) => ({ label: str(g.key), value: num(g.totalMinor) }))} format={(v) => formatMinor(v)} />
          )}
        </Card>
        <Card title="Gateway fees">
          {fees.loading ? (
            <LoadingNote />
          ) : fees.data === null ? (
            <Unavailable title="Fee tracking is not available on the running API yet.">
              This panel needs GET /v1/payments/fees. Fees are never estimated here; when the API
              records the fee a gateway actually charged, it will appear in this table.
            </Unavailable>
          ) : (
            <DataTable
              searchable={false}
              emptyText="No gateway fees recorded yet."
              columns={[
                { key: 'gateway', label: 'Gateway' },
                { key: 'period', label: 'Period' },
                { key: 'grossMinor', label: 'Gross', render: (r) => formatMinor(num(r.grossMinor)) },
                { key: 'feeMinor', label: 'Fee', render: (r) => formatMinor(num(r.feeMinor)) },
                { key: 'netMinor', label: 'Net', render: (r) => formatMinor(num(r.netMinor)) },
              ]}
              rows={feeItems}
            />
          )}
        </Card>
      </div>

      <Card title="Settlements">
        {settlements.loading ? (
          <LoadingNote />
        ) : settlements.data === null ? (
          <Unavailable title="Settlements are not available on the running API yet.">
            This panel needs GET /v1/payments/settlements. With gateways not configured there are
            no settlements to show, and none are invented.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No settlements recorded yet."
            columns={[
              { key: 'id', label: 'Settlement' },
              { key: 'gateway', label: 'Gateway' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'amountMinor', label: 'Amount', render: (r) => formatMinor(num(r.amountMinor)) },
              { key: 'feeMinor', label: 'Fee', render: (r) => formatMinor(num(r.feeMinor)) },
              { key: 'settledAt', label: 'Settled', date: true },
            ]}
            rows={settlementItems}
          />
        )}
      </Card>

      <Card title="Payments">
        <StatusTabs options={TABS} value={gateway} onChange={setGateway} />
        {payments.loading ? (
          <LoadingNote />
        ) : payments.error ? (
          <ErrorNote error={payments.error} onRetry={payments.reload} />
        ) : (
          <DataTable
            emptyText="No payments on this gateway yet."
            columns={[
              { key: 'id', label: 'Payment', render: (r) => <Link href={`/payments/${str(r.id ?? r.paymentId)}`}>{str(r.id ?? r.paymentId).slice(0, 12)}...</Link> },
              { key: 'orderNumber', label: 'Order', render: (r) => <Link href={`/orders/${str(r.orderNumber)}`}>{str(r.orderNumber)}</Link> },
              { key: 'gateway', label: 'Gateway' },
              { key: 'method', label: 'Method' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'amount', label: 'Amount', money: true },
              { key: 'createdAt', label: 'Recorded', date: true },
            ]}
            rows={items}
          />
        )}
      </Card>
    </>
  );
}
