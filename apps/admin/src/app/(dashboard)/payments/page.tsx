'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Download,
  Landmark,
  ListChecks,
  PlusCircle,
  ReceiptText,
  RotateCcw,
  Scale,
  Search,
  Settings2,
  TrendingUp,
  Undo2,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  PAYMENT_GATEWAY_LABELS,
  type Order,
  type Payment,
  type PaymentStatus,
} from '@dostelo/types';
import { formatDateTime, formatMinor, formatMoney } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import { downloadCsv, toCsv } from '../../../lib/csv';
import { AreaChart, DonutChart } from '../../../components/charts';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
  Pagination,
  pageCountFor,
  paginate,
} from '../../../components/ui';

const PAGE_SIZE = 10;

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

/**
 * The payment methods Dostelo actually takes, and nothing else:
 * manual mobile banking for bKash, Nagad, Rocket and Upay (the
 * customer sends money and staff verify it), card payments carried
 * by SSLCommerz, the bKash tokenized gateway, and cash on delivery.
 * A method key combines the gateway and the channel on the payment
 * record, because bKash alone runs in both manual and gateway form.
 */
const METHOD_OPTIONS: { key: string; label: string; short: string }[] = [
  { key: 'bkash-manual', label: 'bKash (Manual Mobile Banking)', short: 'bKash' },
  { key: 'nagad-manual', label: 'Nagad (Manual Mobile Banking)', short: 'Nagad' },
  { key: 'rocket-manual', label: 'Rocket (Manual Mobile Banking)', short: 'Rocket' },
  { key: 'upay-manual', label: 'Upay (Manual Mobile Banking)', short: 'Upay' },
  { key: 'card-sslcommerz', label: 'Card via SSLCommerz', short: 'Card via SSLCommerz' },
  { key: 'bkash-gateway', label: 'bKash Gateway', short: 'bKash Gateway' },
  { key: 'cod', label: 'Cash on Delivery (COD)', short: 'COD' },
];

const METHOD_COLORS: Record<string, string> = {
  'bkash-manual': '#E2136E',
  'nagad-manual': '#F6921E',
  'rocket-manual': '#8C3494',
  'upay-manual': '#00A651',
  'card-sslcommerz': '#2F6BFF',
  'bkash-gateway': '#B30E5A',
  cod: '#1C1B17',
};

function methodKey(payment: Payment): string {
  if (payment.gateway === 'cod') return 'cod';
  if (payment.channel === 'manual') return `${payment.gateway}-manual`;
  if (payment.gateway === 'bkash') return 'bkash-gateway';
  if (payment.gateway === 'sslcommerz' || payment.gateway === 'card') {
    return 'card-sslcommerz';
  }
  return payment.gateway;
}

function methodLabel(payment: Payment): string {
  const found = METHOD_OPTIONS.find((option) => option.key === methodKey(payment));
  return found?.label ?? PAYMENT_GATEWAY_LABELS[payment.gateway];
}

function methodShort(payment: Payment): string {
  const found = METHOD_OPTIONS.find((option) => option.key === methodKey(payment));
  return found?.short ?? PAYMENT_GATEWAY_LABELS[payment.gateway];
}

function isSuccessful(payment: Payment): boolean {
  return payment.status === 'successful' || payment.status === 'collected';
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type RangePreset = '7' | '30' | '90' | 'all' | 'custom';

function presetRange(preset: RangePreset): { from: string; to: string } {
  if (preset === 'all') return { from: '', to: '' };
  const days = preset === 'custom' ? 30 : Number(preset);
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60_000);
  return { from: toDateInput(from), to: toDateInput(to) };
}

interface Filters {
  search: string;
  method: string;
  status: string;
  from: string;
  to: string;
}

const INITIAL_RANGE = presetRange('30');
const INITIAL_FILTERS: Filters = {
  search: '',
  method: '',
  status: '',
  from: INITIAL_RANGE.from,
  to: INITIAL_RANGE.to,
};

function paymentCsvRows(payments: Payment[], orderById: Map<string, Order>) {
  return payments.map((payment) => {
    const order = orderById.get(payment.orderId);
    return [
      payment.id,
      payment.providerTxnId ?? payment.customerTxnId ?? '',
      payment.orderId,
      order?.orderNumber ?? '',
      order?.address.fullName ?? '',
      methodLabel(payment),
      payment.channel,
      PAYMENT_GATEWAY_LABELS[payment.gateway],
      payment.status,
      (payment.amount.amountMinor / 100).toFixed(2),
      payment.createdAt,
    ];
  });
}

const CSV_HEADERS = [
  'Payment ID',
  'Transaction Reference',
  'Order ID',
  'Order Number',
  'Customer',
  'Method',
  'Channel',
  'Gateway',
  'Status',
  'Amount (BDT)',
  'Created At',
];

export default function PaymentsPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canReadOrders = permissions.includes('orders.read');
  const canManageSettings = permissions.includes('settings.manage');

  const [draft, setDraft] = useState<Filters>(INITIAL_FILTERS);
  const [applied, setApplied] = useState<Filters>(INITIAL_FILTERS);
  const [preset, setPreset] = useState<RangePreset>('30');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<'createdAt' | 'amount'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState({
    customer: true,
    channel: true,
    txnRef: true,
  });
  const [recordOpen, setRecordOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  const payments = useData((client) => client.listPayments({}), []);
  const summary = useData((client) => client.getPaymentsSummary(), []);
  const orders = useData(
    (client) =>
      canReadOrders ? client.listStaffOrders() : Promise.resolve(null),
    [canReadOrders],
  );
  const integrations = useData(
    (client) =>
      canManageSettings ? client.listIntegrations() : Promise.resolve(null),
    [canManageSettings],
  );

  const allPayments = useMemo(
    () => payments.data?.items ?? [],
    [payments.data],
  );
  const orderById = useMemo(
    () =>
      new Map(
        (orders.data?.items ?? []).map((order) => [order.id, order] as const),
      ),
    [orders.data],
  );

  const inRange = useMemo(
    () =>
      allPayments.filter((payment) => {
        const day = dayKey(payment.createdAt);
        if (applied.from && day < applied.from) return false;
        if (applied.to && day > applied.to) return false;
        return true;
      }),
    [allPayments, applied.from, applied.to],
  );

  const filtered = useMemo(() => {
    const needle = applied.search.trim().toLowerCase();
    return inRange.filter((payment) => {
      if (applied.method && methodKey(payment) !== applied.method) return false;
      if (applied.status && payment.status !== applied.status) return false;
      if (needle) {
        const order = orderById.get(payment.orderId);
        const haystack = [
          payment.id,
          payment.orderId,
          order?.orderNumber ?? '',
          payment.providerTxnId ?? '',
          payment.customerTxnId ?? '',
          payment.senderNumber ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [inRange, applied, orderById]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const cmp =
        sortKey === 'amount'
          ? a.amount.amountMinor - b.amount.amountMinor
          : a.createdAt.localeCompare(b.createdAt);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const pageRows = paginate(sorted, page, PAGE_SIZE);

  // KPIs are computed over the selected date range only, from the
  // real payment records. Refund transactions live on each payment
  // detail, so the refunds card reports the amount carried by
  // payments in the refunded state and says exactly that.
  const successful = inRange.filter(isSuccessful);
  const failed = inRange.filter((payment) => payment.status === 'failed');
  const refundedPayments = inRange.filter(
    (payment) => payment.status === 'refunded',
  );
  const volumeMinor = successful.reduce(
    (sum, payment) => sum + payment.amount.amountMinor,
    0,
  );
  const refundedMinor = refundedPayments.reduce(
    (sum, payment) => sum + payment.amount.amountMinor,
    0,
  );
  const successRate =
    inRange.length > 0
      ? `${Math.round((successful.length / inRange.length) * 1000) / 10}% success rate`
      : 'No attempts in range';
  const failureRate =
    inRange.length > 0
      ? `${Math.round((failed.length / inRange.length) * 1000) / 10}% failure rate`
      : 'No attempts in range';

  // Revenue trend: successful and collected volume per day across
  // the selected range. Long ranges roll up to weeks so the chart
  // stays readable.
  const trendPoints = useMemo(() => {
    if (successful.length === 0) return [];
    const start = applied.from
      ? new Date(`${applied.from}T00:00:00`)
      : new Date(
          Math.min(...successful.map((p) => new Date(p.createdAt).getTime())),
        );
    const end = applied.to
      ? new Date(`${applied.to}T00:00:00`)
      : new Date(
          Math.max(...successful.map((p) => new Date(p.createdAt).getTime())),
        );
    const spanDays =
      Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const weekly = spanDays > 120;
    const buckets = new Map<string, number>();
    for (const payment of successful) {
      const date = new Date(payment.createdAt);
      let key: string;
      if (weekly) {
        const monday = new Date(date);
        const offset = (date.getDay() + 6) % 7;
        monday.setDate(date.getDate() - offset);
        key = toDateInput(monday);
      } else {
        key = dayKey(payment.createdAt);
      }
      buckets.set(key, (buckets.get(key) ?? 0) + payment.amount.amountMinor);
    }
    const points: { label: string; value: number }[] = [];
    const step = weekly ? 7 : 1;
    const cursor = new Date(start);
    if (weekly) {
      const offset = (cursor.getDay() + 6) % 7;
      cursor.setDate(cursor.getDate() - offset);
    }
    while (cursor <= end) {
      const key = toDateInput(cursor);
      points.push({
        label: key.slice(5),
        value: (buckets.get(key) ?? 0) / 100,
      });
      cursor.setDate(cursor.getDate() + step);
    }
    return points;
  }, [successful, applied.from, applied.to]);

  const methodGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; label: string; count: number; volumeMinor: number }
    >();
    for (const payment of inRange) {
      const key = methodKey(payment);
      const group = groups.get(key) ?? {
        key,
        label: methodLabel(payment),
        count: 0,
        volumeMinor: 0,
      };
      group.count += 1;
      group.volumeMinor += payment.amount.amountMinor;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }, [inRange]);
  const totalVolumeAllMethods = methodGroups.reduce(
    (sum, group) => sum + group.volumeMinor,
    0,
  );

  const pendingManual = allPayments.filter(
    (payment) =>
      payment.status === 'verification-pending' && payment.channel === 'manual',
  );
  const pendingCod = allPayments.filter(
    (payment) => payment.status === 'pending-collection',
  );

  const paymentIntegrations = (integrations.data?.items ?? []).filter(
    (item) => item.category === 'payments',
  );

  function applyFilters() {
    setApplied(draft);
    setPage(1);
    setSelected(new Set());
  }

  function resetFilters() {
    setDraft(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
    setPreset('30');
    setPage(1);
    setSelected(new Set());
  }

  function toggleSort(key: 'createdAt' | 'amount') {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageSelection() {
    setSelected((current) => {
      const next = new Set(current);
      const allOnPage = pageRows.every((payment) => next.has(payment.id));
      for (const payment of pageRows) {
        if (allOnPage) next.delete(payment.id);
        else next.add(payment.id);
      }
      return next;
    });
  }

  function exportRows(rows: Payment[], filename: string) {
    downloadCsv(filename, toCsv(CSV_HEADERS, paymentCsvRows(rows, orderById)));
  }

  // Reconciliation figures for the modal and its CSV: counts and
  // totals by status and by method, from the payments in range.
  const reconcileByStatus = useMemo(() => {
    const groups = new Map<string, { count: number; totalMinor: number }>();
    for (const payment of inRange) {
      const group = groups.get(payment.status) ?? { count: 0, totalMinor: 0 };
      group.count += 1;
      group.totalMinor += payment.amount.amountMinor;
      groups.set(payment.status, group);
    }
    return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
  }, [inRange]);

  function downloadReconcileCsv() {
    const rows: (string | number)[][] = [
      ['Section', 'Key', 'Count', 'Total (BDT)'],
      ...reconcileByStatus.map((group) => [
        'By status',
        group.key,
        group.count,
        (group.totalMinor / 100).toFixed(2),
      ]),
      ...methodGroups.map((group) => [
        'By method',
        group.label,
        group.count,
        (group.volumeMinor / 100).toFixed(2),
      ]),
      ['Total', 'All payments in range', inRange.length, (inRange.reduce((s, p) => s + p.amount.amountMinor, 0) / 100).toFixed(2)],
      ['Total', 'Successful and collected', successful.length, (volumeMinor / 100).toFixed(2)],
    ];
    downloadCsv(
      'payments-reconciliation.csv',
      toCsv(rows[0]!.map(String), rows.slice(1)),
    );
  }

  return (
    <section>
      <ModuleHeader
        icon={CreditCard}
        title="Payments and Finance"
        description="Every payment attempt across manual mobile banking, card via SSLCommerz, the bKash gateway and cash on delivery, with staff verification, refunds and reconciliation."
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setReconcileOpen(true)}
        >
          <Scale size={15} /> Reconcile
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => exportRows(filtered, 'payments-export.csv')}
        >
          <Download size={15} /> Export
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setRecordOpen(true)}
        >
          <PlusCircle size={15} /> Record Payment
        </button>
      </ModuleHeader>

      {payments.loading ? (
        <LoadingNote label="Loading payments..." />
      ) : payments.error ? (
        <ErrorNote error={payments.error} onRetry={payments.reload} />
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard
              icon={ReceiptText}
              label="Payment Attempts"
              value={inRange.length.toLocaleString('en-US')}
              note="Attempts created in the selected range"
              tone="purple"
            />
            <KpiCard
              icon={Wallet}
              label="Successful Payments"
              value={successful.length.toLocaleString('en-US')}
              note={successRate}
              tone="green"
            />
            <KpiCard
              icon={XCircle}
              label="Failed Payments"
              value={failed.length.toLocaleString('en-US')}
              note={failureRate}
              tone="orange"
            />
            <KpiCard
              icon={Landmark}
              label="Total Volume"
              value={formatMinor(volumeMinor)}
              note="Successful and collected payments only"
              tone="blue"
            />
            <KpiCard
              icon={Undo2}
              label="Total Refunds"
              value={formatMinor(refundedMinor)}
              note={`${refundedPayments.length} payment${refundedPayments.length === 1 ? '' : 's'} in the refunded state. Individual refund transactions are recorded on each payment detail.`}
              tone="purple"
            />
          </div>

          <div className="dash-row">
            <div className="card">
              <CardHead icon={TrendingUp} title="Revenue Trend">
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Successful and collected volume per day
                </span>
              </CardHead>
              {trendPoints.length === 0 ? (
                <EmptyNote>
                  No successful or collected payments in the selected range
                  yet.
                </EmptyNote>
              ) : (
                <AreaChart
                  points={trendPoints}
                  formatValue={(value) => formatMinor(Math.round(value * 100))}
                />
              )}
            </div>
            <div className="card">
              <CardHead icon={CreditCard} title="Payments by Method" />
              {methodGroups.length === 0 ? (
                <EmptyNote>No payments in the selected range yet.</EmptyNote>
              ) : (
                <>
                  <DonutChart
                    centreValue={inRange.length.toLocaleString('en-US')}
                    centreLabel="Payments"
                    slices={methodGroups.map((group) => ({
                      label: group.label,
                      value: group.count,
                      color: METHOD_COLORS[group.key] ?? '#6E695D',
                    }))}
                  />
                  <div style={{ marginTop: 12 }}>
                    {methodGroups.map((group) => (
                      <div className="legend-row" key={group.key}>
                        <span>{group.label}</span>
                        <span className="legend-value">
                          {group.count} payments, {formatMinor(group.volumeMinor)}
                          {totalVolumeAllMethods > 0
                            ? ` (${Math.round((group.volumeMinor / totalVolumeAllMethods) * 100)}% of volume)`
                            : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card filter-card section-gap">
            <div className="filter-row">
              <label className="field">
                Search
                <span style={{ position: 'relative', display: 'block' }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: 9,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#6E695D',
                    }}
                  />
                  <input
                    className="input"
                    style={{ paddingLeft: 28 }}
                    placeholder="Payment id, transaction id, order id or number"
                    value={draft.search}
                    onChange={(event) =>
                      setDraft((d) => ({ ...d, search: event.target.value }))
                    }
                  />
                </span>
              </label>
              <label className="field">
                Method
                <select
                  className="select"
                  value={draft.method}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, method: event.target.value }))
                  }
                >
                  <option value="">All methods</option>
                  {METHOD_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Status
                <select
                  className="select"
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, status: event.target.value }))
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
              <label className="field">
                Range
                <select
                  className="select"
                  value={preset}
                  onChange={(event) => {
                    const next = event.target.value as RangePreset;
                    setPreset(next);
                    if (next !== 'custom') {
                      const range = presetRange(next);
                      setDraft((d) => ({ ...d, ...range }));
                    }
                  }}
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="all">All time</option>
                  <option value="custom">Custom dates</option>
                </select>
              </label>
              <label className="field">
                From
                <input
                  className="input"
                  type="date"
                  value={draft.from}
                  onChange={(event) => {
                    setPreset('custom');
                    setDraft((d) => ({ ...d, from: event.target.value }));
                  }}
                />
              </label>
              <label className="field">
                To
                <input
                  className="input"
                  type="date"
                  value={draft.to}
                  onChange={(event) => {
                    setPreset('custom');
                    setDraft((d) => ({ ...d, to: event.target.value }));
                  }}
                />
              </label>
              <div className="filter-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetFilters}
                >
                  <RotateCcw size={14} /> Reset
                </button>
                <button type="button" className="btn" onClick={applyFilters}>
                  Apply
                </button>
              </div>
            </div>
          </div>

          <div className="card section-gap">
            <CardHead icon={ListChecks} title="Transactions">
              <span style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => setShowColumns((value) => !value)}
                >
                  <Settings2 size={14} /> Columns
                </button>
                {showColumns ? (
                  <span
                    className="card"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 6px)',
                      zIndex: 5,
                      display: 'block',
                      padding: 12,
                      minWidth: 180,
                    }}
                  >
                    {(
                      [
                        ['customer', 'Customer'],
                        ['channel', 'Channel'],
                        ['txnRef', 'Transaction reference'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center',
                          fontSize: 13,
                          padding: '4px 0',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={columns[key]}
                          onChange={(event) =>
                            setColumns((c) => ({
                              ...c,
                              [key]: event.target.checked,
                            }))
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </span>
                ) : null}
              </span>
            </CardHead>
            {selected.size > 0 ? (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <span className="muted" style={{ fontSize: 13 }}>
                  {selected.size} payment{selected.size === 1 ? '' : 's'}{' '}
                  selected
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() =>
                    exportRows(
                      sorted.filter((payment) => selected.has(payment.id)),
                      'payments-selected-export.csv',
                    )
                  }
                >
                  <Download size={14} /> Export selected
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </button>
              </div>
            ) : null}
            {sorted.length === 0 ? (
              <EmptyNote>No payments match these filters.</EmptyNote>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label="Select all payments on this page"
                            checked={
                              pageRows.length > 0 &&
                              pageRows.every((payment) =>
                                selected.has(payment.id),
                              )
                            }
                            onChange={togglePageSelection}
                          />
                        </th>
                        <th>Transaction ID</th>
                        <th>Order ID</th>
                        {columns.customer ? <th>Customer</th> : null}
                        <th>Method</th>
                        {columns.channel ? <th>Channel</th> : null}
                        {columns.txnRef ? <th>Transaction Ref</th> : null}
                        <th className="num">
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => toggleSort('amount')}
                          >
                            Amount{' '}
                            {sortKey === 'amount'
                              ? sortDir === 'asc'
                                ? '▲'
                                : '▼'
                              : ''}
                          </button>
                        </th>
                        <th>Status</th>
                        <th>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => toggleSort('createdAt')}
                          >
                            Date and Time{' '}
                            {sortKey === 'createdAt'
                              ? sortDir === 'asc'
                                ? '▲'
                                : '▼'
                              : ''}
                          </button>
                        </th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((payment) => {
                        const order = orderById.get(payment.orderId);
                        return (
                          <tr key={payment.id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Select payment ${payment.id}`}
                                checked={selected.has(payment.id)}
                                onChange={() => toggleSelected(payment.id)}
                              />
                            </td>
                            <td>
                              <Link href={`/payments/${payment.id}`}>
                                {payment.id}
                              </Link>
                            </td>
                            <td>{order?.orderNumber ?? payment.orderId}</td>
                            {columns.customer ? (
                              <td>{order?.address.fullName ?? '-'}</td>
                            ) : null}
                            <td>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '3px 10px',
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: '#fff',
                                  background:
                                    METHOD_COLORS[methodKey(payment)] ??
                                    '#6E695D',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {methodShort(payment)}
                              </span>
                            </td>
                            {columns.channel ? (
                              <td>{payment.channel}</td>
                            ) : null}
                            {columns.txnRef ? (
                              <td>
                                {payment.providerTxnId ??
                                  payment.customerTxnId ??
                                  '-'}
                              </td>
                            ) : null}
                            <td className="num">
                              {formatMoney(payment.amount)}
                            </td>
                            <td>
                              <Badge>{payment.status}</Badge>
                            </td>
                            <td>{formatDateTime(payment.createdAt)}</td>
                            <td>
                              <Link
                                className="btn btn-secondary btn-small"
                                href={`/payments/${payment.id}`}
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="table-foot">
                  <span className="muted">
                    {sorted.length} payment{sorted.length === 1 ? '' : 's'} in
                    the selected range
                    {!canReadOrders
                      ? '. Customer names need the orders.read permission.'
                      : ''}
                  </span>
                  <Pagination
                    page={page}
                    pageCount={pageCountFor(sorted.length, PAGE_SIZE)}
                    onChange={setPage}
                  />
                </div>
              </>
            )}
          </div>

          <div className="card section-gap">
            <CardHead icon={Undo2} title="Refunds">
              <Link className="btn btn-secondary btn-small" href="#refunds-note">
                How refunds work
              </Link>
            </CardHead>
            <p className="note muted" id="refunds-note" style={{ marginTop: 0 }}>
              Refund transactions are recorded per payment and cannot be listed
              globally from the payments API, so this section lists payments in
              the refunded state in the selected range and links into each
              payment detail, where refunds are requested and, for manual
              refunds, confirmed once the money is handed back.
            </p>
            {refundedPayments.length === 0 ? (
              <EmptyNote>
                No payments are in the refunded state in the selected range.
              </EmptyNote>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Transaction ID</th>
                      <th>Order ID</th>
                      <th>Method</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                      <th>Date and Time</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refundedPayments.map((payment) => {
                      const order = orderById.get(payment.orderId);
                      return (
                        <tr key={payment.id}>
                          <td>
                            <Link href={`/payments/${payment.id}`}>
                              {payment.id}
                            </Link>
                          </td>
                          <td>{order?.orderNumber ?? payment.orderId}</td>
                          <td>{methodLabel(payment)}</td>
                          <td className="num">
                            {formatMoney(payment.amount)}
                          </td>
                          <td>
                            <Badge>{payment.status}</Badge>
                          </td>
                          <td>{formatDateTime(payment.updatedAt)}</td>
                          <td>
                            <Link
                              className="btn btn-secondary btn-small"
                              href={`/payments/${payment.id}`}
                            >
                              View refunds
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card section-gap">
            <CardHead icon={Settings2} title="Gateway Settings" />
            {!canManageSettings ? (
              <EmptyNote>
                Gateway status needs the settings.manage permission.
              </EmptyNote>
            ) : integrations.loading ? (
              <LoadingNote label="Loading gateway status..." />
            ) : integrations.error ? (
              <ErrorNote
                error={integrations.error}
                onRetry={integrations.reload}
              />
            ) : paymentIntegrations.length === 0 ? (
              <EmptyNote>No payment integrations reported by the API.</EmptyNote>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gateway</th>
                      <th>Configured</th>
                      <th>Missing Variables</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentIntegrations.map((item) => (
                      <tr key={item.key}>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td>
                          <Badge>
                            {item.configured ? 'Configured' : 'Not configured'}
                          </Badge>
                        </td>
                        <td>
                          {item.missing.length > 0
                            ? item.missing.join(', ')
                            : '-'}
                        </td>
                        <td>{item.note ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="note muted">
              Credentials live in the API host environment variables and are
              never entered or shown here. Only the names of missing variables
              are reported.
            </p>
          </div>
        </>
      )}

      {recordOpen ? (
        <Modal title="Record a payment" onClose={() => setRecordOpen(false)}>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Recording a payment in Dostelo always means staff verification of
            money a customer already sent. There is no free-form way to mark a
            payment as paid. For a manual mobile banking payment, open the
            pending payment below and use its Verify action once the money is
            visible in the store account. For cash on delivery, the collection
            is recorded from the order when it is delivered, not from this
            page.
          </p>
          <h3 style={{ fontSize: 15 }}>
            Pending manual verifications ({pendingManual.length})
          </h3>
          {pendingManual.length === 0 ? (
            <EmptyNote>
              No manual payments are waiting for verification right now.
            </EmptyNote>
          ) : (
            <ul className="timeline">
              {pendingManual.map((payment) => (
                <li key={payment.id}>
                  <div>
                    <strong>{formatMoney(payment.amount)}</strong>{' '}
                    {methodLabel(payment)}
                  </div>
                  <div>
                    From {payment.senderNumber ?? 'an unknown number'}, txn{' '}
                    {payment.customerTxnId ?? 'not reported'}, order{' '}
                    {orderById.get(payment.orderId)?.orderNumber ??
                      payment.orderId}
                  </div>
                  <div className="when">
                    {formatDateTime(payment.createdAt)}
                  </div>
                  <Link
                    className="btn btn-small"
                    style={{ marginTop: 8, display: 'inline-block' }}
                    href={`/payments/${payment.id}`}
                  >
                    Verify this payment
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="note muted">
            Cash on delivery: {pendingCod.length} payment
            {pendingCod.length === 1 ? ' is' : 's are'} still pending
            collection. Collections are confirmed through the order delivery
            flow in Orders.
          </p>
        </Modal>
      ) : null}

      {reconcileOpen ? (
        <Modal title="Reconciliation summary" onClose={() => setReconcileOpen(false)}>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Internal reconciliation for the selected range, computed from the
            payment records loaded on this page.
            {applied.from || applied.to
              ? ` Range: ${applied.from || 'start'} to ${applied.to || 'today'}.`
              : ' Range: all time.'}
          </p>
          {summary.data ? (
            <p className="note muted">
              Server summary across all payments on record:{' '}
              {summary.data.count} attempts, {formatMinor(summary.data.totalMinor)}{' '}
              in attempt amounts.
            </p>
          ) : null}
          <h3 style={{ fontSize: 15 }}>By status</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th className="num">Count</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {reconcileByStatus.map((group) => (
                  <tr key={group.key}>
                    <td>{group.key}</td>
                    <td className="num">{group.count}</td>
                    <td className="num">{formatMinor(group.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 style={{ fontSize: 15 }}>By method</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th className="num">Count</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {methodGroups.map((group) => (
                  <tr key={group.key}>
                    <td>{group.label}</td>
                    <td className="num">{group.count}</td>
                    <td className="num">{formatMinor(group.volumeMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Successful and collected total: {formatMinor(volumeMinor)} across{' '}
            {successful.length} payments.
          </p>
          <p className="note muted">
            Gateway settlement matching is not available because settlement
            data is not provided by the gateways to this system. This summary
            reconciles internal payment records only.
          </p>
          <button
            type="button"
            className="btn"
            onClick={downloadReconcileCsv}
          >
            <Download size={15} /> Download CSV
          </button>
        </Modal>
      ) : null}
    </section>
  );
}
