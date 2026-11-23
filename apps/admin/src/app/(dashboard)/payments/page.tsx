'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  PAYMENT_GATEWAYS,
  PAYMENT_GATEWAY_LABELS,
  type PaymentGateway,
  type PaymentStatus,
} from '@dostelo/types';
import { formatDateTime, formatMinor, formatMoney } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
  StatCard,
} from '../../../components/ui';

const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = [
  'initiated',
  'awaiting-customer',
  'verification-pending',
  'pending',
  'pending-collection',
  'successful',
  'collected',
  'failed',
  'cancelled',
  'refunded',
];

function SummaryHeader() {
  const { data, error, loading, reload } = useData(
    (client) => client.getPaymentsSummary(),
    [],
  );
  if (loading) return <LoadingNote label="Loading payment summary..." />;
  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <div className="grid" style={{ marginBottom: 20 }}>
      <StatCard label="Payment attempts" value={String(data.count)} />
      <StatCard
        label="Total volume"
        value={formatMinor(data.totalMinor)}
        note="Sum of all attempt amounts"
      />
      {data.byStatus.map((group) => (
        <StatCard
          key={group.key}
          label={group.key}
          value={String(group.count)}
          note={formatMinor(group.totalMinor)}
        />
      ))}
    </div>
  );
}

export default function PaymentsPage() {
  const [gateway, setGateway] = useState<PaymentGateway | ''>('');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const { data, error, loading, reload } = useData(
    (client) =>
      client.listPayments({
        gateway: gateway || undefined,
        status: status || undefined,
      }),
    [gateway, status],
  );

  return (
    <section>
      <PageHeader title="Payments & Finance" />
      <SummaryHeader />
      <div className="toolbar">
        <label className="field">
          Gateway
          <select
            className="select"
            value={gateway}
            onChange={(event) =>
              setGateway(event.target.value as PaymentGateway | '')
            }
          >
            <option value="">All gateways</option>
            {PAYMENT_GATEWAYS.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_GATEWAY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as PaymentStatus | '')
            }
          >
            <option value="">All statuses</option>
            {PAYMENT_STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <LoadingNote label="Loading payments..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyNote>No payments match this filter.</EmptyNote>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Created</th>
                <th>Gateway</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Transaction</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDateTime(payment.createdAt)}</td>
                  <td>
                    <Link href={`/payments/${payment.id}`}>
                      {PAYMENT_GATEWAY_LABELS[payment.gateway]}
                    </Link>
                  </td>
                  <td>{payment.channel}</td>
                  <td>
                    <Badge>{payment.status}</Badge>
                  </td>
                  <td>{payment.providerTxnId ?? payment.customerTxnId ?? '-'}</td>
                  <td className="num">{formatMoney(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
