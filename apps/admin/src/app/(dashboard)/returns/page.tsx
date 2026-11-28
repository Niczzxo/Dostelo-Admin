'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Download,
  HandCoins,
  PackageCheck,
  Plus,
  RotateCcw,
  Settings,
  Undo2,
} from 'lucide-react';
import {
  INSPECTION_OUTCOMES,
  INSPECTION_OUTCOME_LABELS,
  ORDER_STATUS_LABELS,
  RETURN_KINDS,
  RETURN_KIND_LABELS,
  RETURN_REASONS,
  RETURN_REASON_LABELS,
  RETURN_RESOLUTION_TYPES,
  RETURN_RESOLUTION_LABELS,
  RETURN_STATUSES,
  RETURN_STATUS_LABELS,
  type InspectionOutcome,
  type Order,
  type Refund,
  type ReturnKind,
  type ReturnReason,
  type ReturnRequest,
  type ReturnResolutionType,
  type ReturnStatus,
} from '@dostelo/types';
import { api, formatDateTime, formatMoney, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useStaffDirectory } from '../../../lib/staff-directory';
import { useAuth } from '../../../components/auth-provider';
import {
  CardHead,
  Drawer,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
  Pagination,
  StatusTabs,
  pageCountFor,
  paginate,
} from '../../../components/ui';
import { DonutChart } from '../../../components/charts';
import { downloadCsv, toCsv } from '../../../lib/csv';

/**
 * Returns and Refunds (redesign): intake against delivered
 * orders, the full recorded workflow (review, information
 * requests, inspector assignment, pickup schedule, transit,
 * receipt, inspection, refund hand-off, refunded, completion)
 * and refund analytics, all from the real API. The API enforces
 * the rules (delivered orders only, the return window, the
 * quantities left to return, refund completion in Payments
 * before a return can be marked refunded); this page renders
 * the states and offers only the actions the state allows.
 * Evidence uploads have no API path yet, so the create panel
 * says so instead of showing a fake uploader.
 */
const PAGE_SIZE = 10;
const REASON_COLORS = ['#1C1B17', '#8A5A00', '#1E6B34', '#45423B', '#B42318', '#A79F92', '#6E695D'];

type SortKey = 'createdAt' | 'total' | 'items';

function reasonCategory(reason: string | null): ReturnReason {
  if (reason && (RETURN_REASONS as readonly string[]).includes(reason)) {
    return reason as ReturnReason;
  }
  return 'other';
}

function itemsCount(request: ReturnRequest): number {
  return request.items.reduce((sum, line) => sum + line.quantity, 0);
}

export default function ReturnsPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('orders.edit');

  const returns = useData((client) => client.listReturns({}), []);
  const items = useMemo(() => returns.data?.items ?? [], [returns.data]);
  // Delivered orders are loaded only so the return rate can be
  // computed; when this read is unavailable the rate is omitted.
  const deliveredOrders = useData(
    (client) => client.listStaffOrders('delivered'),
    [],
  );

  const [tab, setTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<ReturnStatus, number>();
    for (const item of items) map.set(item.status, (map.get(item.status) ?? 0) + 1);
    return map;
  }, [items]);

  const kpis = useMemo(() => {
    const refunded = items.filter((item) => item.status === 'refunded');
    return {
      requests: items.length,
      approved: counts.get('approved') ?? 0,
      itemsReceived: items.reduce((sum, item) => {
        if (item.inspection) return sum + item.inspection.quantityReceived;
        if (item.receivedAt) return sum + itemsCount(item);
        return sum;
      }, 0),
      refundedAmount: refunded.reduce((sum, item) => sum + item.total.amountMinor, 0),
      pending:
        (counts.get('requested') ?? 0) + (counts.get('under-review') ?? 0),
      refundsCompleted: refunded.length,
    };
  }, [items, counts]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = items.filter((item) => {
      if (tab !== 'all' && item.status !== tab) return false;
      if (reasonFilter && reasonCategory(item.reason) !== reasonFilter) return false;
      if (from && item.createdAt.slice(0, 10) < from) return false;
      if (to && item.createdAt.slice(0, 10) > to) return false;
      if (!needle) return true;
      return (
        item.id.toLowerCase().includes(needle) ||
        item.orderNumber.toLowerCase().includes(needle) ||
        item.customerId.toLowerCase().includes(needle) ||
        item.items.some((line) => line.productName.toLowerCase().includes(needle))
      );
    });
    const direction = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === 'total') return (a.total.amountMinor - b.total.amountMinor) * direction;
      if (sortKey === 'items') return (itemsCount(a) - itemsCount(b)) * direction;
      return a.createdAt.localeCompare(b.createdAt) * direction;
    });
    return rows;
  }, [items, tab, search, reasonFilter, from, to, sortKey, sortDir]);

  const pageCount = pageCountFor(filtered.length, PAGE_SIZE);
  const safePage = Math.min(page, pageCount);
  const pageRows = paginate(filtered, safePage, PAGE_SIZE);

  const reasonSlices = useMemo(() => {
    const byReason = new Map<ReturnReason, number>();
    for (const item of items) {
      const category = reasonCategory(item.reason);
      byReason.set(category, (byReason.get(category) ?? 0) + 1);
    }
    return RETURN_REASONS.filter((reason) => (byReason.get(reason) ?? 0) > 0).map(
      (reason, index) => ({
        label: RETURN_REASON_LABELS[reason],
        value: byReason.get(reason) ?? 0,
        color: REASON_COLORS[index % REASON_COLORS.length]!,
      }),
    );
  }, [items]);

  const refundSummary = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const recent = items.filter(
      (item) => new Date(item.updatedAt).getTime() >= cutoff,
    );
    const refunded = recent.filter((item) => item.status === 'refunded');
    const pending = recent.filter((item) => item.status === 'refund-pending');
    const amount = refunded.reduce((sum, item) => sum + item.total.amountMinor, 0);
    const denominator = refunded.length + pending.length;
    return {
      count: refunded.length,
      amount,
      average: refunded.length > 0 ? Math.round(amount / refunded.length) : null,
      successRate:
        denominator > 0 ? Math.round((refunded.length / denominator) * 100) : null,
    };
  }, [items]);

  const returnRate = useMemo(() => {
    const delivered = deliveredOrders.data?.items.length ?? 0;
    if (!deliveredOrders.data || delivered === 0) return null;
    return {
      returns: items.length,
      delivered,
      percent: ((items.length / delivered) * 100).toFixed(1),
    };
  }, [deliveredOrders.data, items.length]);

  function exportCsv(): void {
    downloadCsv(
      'returns.csv',
      toCsv(
        ['Return ID', 'Order Number', 'Customer ID', 'Kind', 'Status', 'Reason', 'Items', 'Amount (minor)', 'Refund State', 'Requested At'],
        filtered.map((item) => [
          item.id,
          item.orderNumber,
          item.customerId,
          RETURN_KIND_LABELS[item.kind],
          RETURN_STATUS_LABELS[item.status],
          item.reason ?? '',
          itemsCount(item),
          item.total.amountMinor,
          item.refundState,
          item.createdAt,
        ]),
      ),
    );
  }

  return (
    <section>
      <ModuleHeader
        icon={RotateCcw}
        title="Returns and Refunds"
        description="Return requests, inspections and the refund hand-off into Payments, from the real return records. Money is only ever shown as refunded when Payments completed it."
      >
        <button type="button" className="btn-secondary" onClick={() => setShowSettings(true)}>
          <Settings size={16} /> Return Settings
        </button>
        <button type="button" className="btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download size={16} /> Export
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            document
              .getElementById('create-return')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <Plus size={16} /> Create Return
        </button>
      </ModuleHeader>

      {showSettings ? <ReturnSettingsModal onClose={() => setShowSettings(false)} /> : null}

      {returns.loading ? <LoadingNote label="Loading returns..." /> : null}
      {returns.error ? <ErrorNote error={returns.error} onRetry={returns.reload} /> : null}

      {returns.data ? (
        <div className="kpi-grid">
          <KpiCard icon={Undo2} label="Return Requests" value={String(kpis.requests)} tone="purple" />
          <KpiCard icon={CheckCircle2} label="Approved Returns" value={String(kpis.approved)} tone="green" />
          <KpiCard icon={PackageCheck} label="Items Received" value={String(kpis.itemsReceived)} note="Inspection quantities, or items on received returns" tone="blue" />
          <KpiCard icon={HandCoins} label="Refunded Amount" value={formatMoney({ amountMinor: kpis.refundedAmount, currency: 'BDT' })} tone="green" />
          <KpiCard icon={Clock} label="Pending" value={String(kpis.pending)} note="Requested plus under review" tone="orange" />
          <KpiCard icon={CheckCircle2} label="Refunds Completed" value={String(kpis.refundsCompleted)} tone="blue" />
        </div>
      ) : null}

      <StatusTabs
        tabs={[
          { key: 'all', label: 'All Returns', count: items.length },
          ...RETURN_STATUSES.map((status) => ({
            key: status,
            label: RETURN_STATUS_LABELS[status],
            count: counts.get(status) ?? 0,
          })),
        ]}
        active={tab}
        onChange={(key) => {
          setTab(key);
          setPage(1);
        }}
      />

      <div className="card filter-card">
        <div className="filter-row">
          <label className="field">
            Search
            <input
              className="input"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Return id, order, customer, product"
            />
          </label>
          <label className="field">
            Reason
            <select
              className="select"
              value={reasonFilter}
              onChange={(event) => {
                setReasonFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All reasons</option>
              {RETURN_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {RETURN_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            From
            <input
              className="input"
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="field">
            To
            <input
              className="input"
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="field">
            Sort by
            <select
              className="select"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="createdAt">Requested at</option>
              <option value="total">Amount</option>
              <option value="items">Items count</option>
            </select>
          </label>
          <label className="field">
            Direction
            <select
              className="select"
              value={sortDir}
              onChange={(event) => setSortDir(event.target.value as 'asc' | 'desc')}
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
          <div className="filter-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearch('');
                setReasonFilter('');
                setFrom('');
                setTo('');
                setTab('all');
                setPage(1);
              }}
            >
              Reset
            </button>
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <CardHead icon={Undo2} title="Returns" />
        {returns.data && filtered.length === 0 ? (
          <EmptyNote>No return requests match these filters yet.</EmptyNote>
        ) : null}
        {pageRows.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Return ID</th>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th className="num">Items</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th>Requested At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.orderNumber}</td>
                      <td>
                        {item.customerId}
                        <div className="muted">{RETURN_KIND_LABELS[item.kind]}</div>
                      </td>
                      <td className="num">{itemsCount(item)}</td>
                      <td className="num">{formatMoney(item.total)}</td>
                      <td>
                        <span className="badge">{RETURN_STATUS_LABELS[item.status]}</span>
                      </td>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          onClick={() => setSelectedId(item.id)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="muted">
                {filtered.length} return{filtered.length === 1 ? '' : 's'}
              </span>
              <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
            </div>
          </>
        ) : null}
      </div>

      <div className="detail-grid section-gap">
        <div className="card">
          <CardHead icon={Undo2} title="Returns by Reason" />
          {returns.data ? (
            reasonSlices.length > 0 ? (
              <DonutChart
                slices={reasonSlices}
                centreLabel="returns"
                centreValue={String(items.length)}
              />
            ) : (
              <EmptyNote>No returns recorded yet, so there is no reason breakdown.</EmptyNote>
            )
          ) : (
            <EmptyNote>The reason breakdown appears once returns load.</EmptyNote>
          )}
        </div>
        <div className="card">
          <CardHead icon={HandCoins} title="Refund Summary, Last 30 Days" />
          {returns.data ? (
            <dl className="kv">
              <dt>Total refunds completed</dt>
              <dd>{refundSummary.count}</dd>
              <dt>Refunded amount</dt>
              <dd>{formatMoney({ amountMinor: refundSummary.amount, currency: 'BDT' })}</dd>
              <dt>Average refund value</dt>
              <dd>
                {refundSummary.average === null
                  ? 'No completed refunds in this period'
                  : formatMoney({ amountMinor: refundSummary.average, currency: 'BDT' })}
              </dd>
              <dt>Refund success rate</dt>
              <dd>
                {refundSummary.successRate === null
                  ? 'Not computable for this period'
                  : `${refundSummary.successRate}% of refund-pending plus refunded returns`}
              </dd>
              {returnRate ? (
                <>
                  <dt>Return rate</dt>
                  <dd>
                    {returnRate.percent}% ({returnRate.returns} returns over{' '}
                    {returnRate.delivered} delivered orders)
                  </dd>
                </>
              ) : null}
            </dl>
          ) : (
            <EmptyNote>The refund summary appears once returns load.</EmptyNote>
          )}
        </div>
      </div>

      <div className="card section-gap" id="create-return">
        <CardHead icon={Plus} title="Create Return" />
        {canEdit ? (
          <CreateReturnPanel allReturns={items} onCreated={returns.reload} />
        ) : (
          <p className="note muted">
            Your role can view returns but cannot open them (the orders.edit permission is
            required).
          </p>
        )}
      </div>

      {selectedId ? (
        <ReturnDetailDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={returns.reload}
        />
      ) : null}
    </section>
  );
}

function ReturnSettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useData((client) => client.getStoreSettings(), []);
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setDays(String(settings.data.returnWindowDays));
  }, [settings.data]);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    const value = Number(days);
    if (!Number.isInteger(value) || value < 0 || value > 365) {
      setError('Return window days must be a whole number between 0 and 365.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const updated = await api.updateStoreSettings({ returnWindowDays: value });
      setDays(String(updated.returnWindowDays));
      setSaved(`Saved. The return window is now ${updated.returnWindowDays} days.`);
      settings.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Return Settings" onClose={onClose}>
      {settings.loading ? <LoadingNote label="Loading store settings..." /> : null}
      {settings.error ? <ErrorNote error={settings.error} onRetry={settings.reload} /> : null}
      {settings.data ? (
        <form onSubmit={save}>
          <label className="field">
            Return window (days after delivery)
            <input
              className="input"
              type="number"
              min={0}
              max={365}
              step={1}
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
          </label>
          <p className="note muted">
            The window is enforced server-side at return creation: a return opened after the
            window closes is refused by the API, whatever this page shows.
          </p>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving...' : 'Save return window'}
          </button>
          {saved ? <p className="note">{saved}</p> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </Modal>
  );
}

function CreateReturnPanel({
  allReturns,
  onCreated,
}: {
  allReturns: ReturnRequest[];
  onCreated: () => void;
}) {
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [kind, setKind] = useState<ReturnKind>('return');
  const [reason, setReason] = useState<ReturnReason>('defective');
  const [resolutionType, setResolutionType] =
    useState<ReturnResolutionType>('refund');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [createdNote, setCreatedNote] = useState<string | null>(null);

  // Quantities already returned for this order, from the loaded
  // returns list (rejected requests do not consume quantity).
  // The API re-checks the remaining quantity at creation and
  // its answer is shown verbatim on submit.
  const alreadyReturned = useMemo(() => {
    const map = new Map<string, number>();
    if (!order) return map;
    for (const request of allReturns) {
      if (request.orderNumber !== order.orderNumber) continue;
      if (request.status === 'rejected') continue;
      for (const line of request.items) {
        map.set(line.orderItemId, (map.get(line.orderItemId) ?? 0) + line.quantity);
      }
    }
    return map;
  }, [allReturns, order]);

  async function loadOrder(event: FormEvent): Promise<void> {
    event.preventDefault();
    const number = orderNumber.trim();
    if (!number) return;
    setLoadingOrder(true);
    setOrderError(null);
    setCreatedNote(null);
    setOrder(null);
    try {
      const detail = await api.getStaffOrder(number);
      setOrder(detail.order);
      setQuantities({});
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setOrderError(uiError.message);
    } finally {
      setLoadingOrder(false);
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
        reason,
        note: description.trim() ? description.trim() : undefined,
        resolutionType,
        condition: condition.trim() ? condition.trim() : undefined,
        items,
      });
      setCreatedNote(
        `Return ${created.id} created for order ${created.orderNumber} in status ${RETURN_STATUS_LABELS[created.status]}.`,
      );
      setOrder(null);
      setOrderNumber('');
      setDescription('');
      setCondition('');
      onCreated();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      // Server errors are shown verbatim: eligibility, window
      // and quantity refusals come from the API, not this page.
      setOrderError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={loadOrder}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1, minWidth: 200, marginTop: 0 }}>
            Order number
            <input
              className="input"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
              placeholder="Order number, for example BP-123456"
            />
          </label>
          <button type="submit" className="btn-secondary" disabled={loadingOrder || !orderNumber.trim()}>
            {loadingOrder ? 'Loading...' : 'Load order'}
          </button>
        </div>
      </form>
      <p className="note muted">
        Eligibility: only delivered orders can take a return, inside the return window. Both
        rules are enforced server-side at return creation, and a refusal is shown here exactly
        as the API states it.
      </p>
      <p className="note muted">Evidence uploads are not supported yet.</p>

      {order ? (
        <form onSubmit={createReturn} style={{ marginTop: 12 }}>
          <dl className="kv">
            <dt>Customer</dt>
            <dd>
              {order.address.fullName} ({order.address.phone})
            </dd>
            <dt>Order date</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
            <dt>Last updated</dt>
            <dd>{formatDateTime(order.updatedAt)}</dd>
            <dt>Order status</dt>
            <dd>{ORDER_STATUS_LABELS[order.status]}</dd>
            <dt>Payment status</dt>
            <dd>{order.paymentStatus}</dd>
            <dt>Paid amount (order total)</dt>
            <dd>{formatMoney(order.total)}</dd>
          </dl>
          {order.status !== 'delivered' ? (
            <p className="note error-note" role="alert">
              Order {order.orderNumber} is {ORDER_STATUS_LABELS[order.status]}. Returns open
              only against delivered orders, and the API will refuse this submission.
            </p>
          ) : null}
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Product item</th>
                  <th>Variant</th>
                  <th className="num">Purchased</th>
                  <th className="num">Already returned</th>
                  <th className="num">Return quantity (max)</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const returnedQty = alreadyReturned.get(item.id) ?? 0;
                  const max = Math.max(item.quantity - returnedQty, 0);
                  return (
                    <tr key={item.id}>
                      <td>{item.productName}</td>
                      <td>{item.variantName ?? 'No variant'}</td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">{returnedQty}</td>
                      <td className="num">
                        <input
                          className="input"
                          style={{ width: 90, marginTop: 0 }}
                          type="number"
                          min={0}
                          max={max}
                          step={1}
                          value={quantities[item.id] ?? ''}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          aria-label={`Return quantity for ${item.productName}, maximum ${max}`}
                        />{' '}
                        <span className="muted">max {max}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="filter-row" style={{ marginTop: 12 }}>
            <label className="field">
              Kind
              <select
                className="select"
                value={kind}
                onChange={(event) => setKind(event.target.value as ReturnKind)}
              >
                {RETURN_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {RETURN_KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Reason
              <select
                className="select"
                value={reason}
                onChange={(event) => setReason(event.target.value as ReturnReason)}
              >
                {RETURN_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {RETURN_REASON_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Resolution type
              <select
                className="select"
                value={resolutionType}
                onChange={(event) =>
                  setResolutionType(event.target.value as ReturnResolutionType)
                }
              >
                {RETURN_RESOLUTION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {RETURN_RESOLUTION_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Condition (customer stated)
              <input
                className="input"
                value={condition}
                onChange={(event) => setCondition(event.target.value)}
                placeholder="For example: worn once, tags on"
              />
            </label>
          </div>
          <label className="field">
            Customer description
            <textarea
              className="input"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What the customer said about the return"
            />
          </label>
          <p className="note muted">
            The preferred resolution is recorded through the resolution type above (refund,
            exchange or replacement). The create API has no separate free-text preferred
            resolution field.
          </p>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Creating...' : 'Create return request'}
          </button>
        </form>
      ) : null}
      {createdNote ? (
        <p className="note" role="status">
          {createdNote}
        </p>
      ) : null}
      {orderError ? (
        <p className="form-error" role="alert">
          {orderError}
        </p>
      ) : null}
    </div>
  );
}

function ReturnDetailDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('orders.edit');
  const canRefund = permissions.includes('payments.refund');
  const { staff } = useStaffDirectory();

  const detail = useData((client) => client.getReturnDetail(id), [id]);
  const request = detail.data?.request ?? null;
  const events = detail.data?.events ?? [];

  // Supporting records for the drawer. Each load is optional:
  // when one is unavailable (for example payments.read is not
  // held) its section says so instead of breaking the drawer.
  const customer = useData(
    async (client) => {
      if (!request) return null;
      try {
        return await client.getCustomer(request.customerId);
      } catch {
        return null;
      }
    },
    [request?.customerId],
  );
  const orderDetail = useData(
    async (client) => {
      if (!request) return null;
      try {
        return await client.getStaffOrder(request.orderNumber);
      } catch {
        return null;
      }
    },
    [request?.orderNumber],
  );
  const moneySide = useData(
    async (client) => {
      if (!request) return null;
      try {
        const payments = await client.listPayments({ orderId: request.orderId });
        let refund: Refund | null = null;
        let paymentId: string | null = null;
        if (request.refundId) {
          for (const payment of payments.items) {
            const paymentDetail = await client.getPayment(payment.id).catch(() => null);
            const match = paymentDetail?.refunds.find(
              (entry) => entry.id === request.refundId,
            );
            if (match) {
              refund = match;
              paymentId = payment.id;
              break;
            }
          }
        }
        return { payments: payments.items, refund, paymentId };
      } catch {
        return null;
      }
    },
    [request?.id, request?.refundId, request?.orderId],
  );

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [infoNote, setInfoNote] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [pickupAt, setPickupAt] = useState('');
  const [inspCondition, setInspCondition] = useState('');
  const [inspPackaging, setInspPackaging] = useState('');
  const [inspAccessories, setInspAccessories] = useState('');
  const [inspQty, setInspQty] = useState('');
  const [inspOutcome, setInspOutcome] = useState<InspectionOutcome>('resellable');
  const [inspNotes, setInspNotes] = useState('');

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
      detail.reload();
      onChanged();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setActionError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  const refundCompleted = moneySide.data?.refund?.status === 'completed';
  const staffName = (staffId: string | null): string => {
    if (!staffId) return 'Not recorded';
    return staff.find((member) => member.id === staffId)?.displayName ?? staffId;
  };

  return (
    <Drawer title={request ? `Return for order ${request.orderNumber}` : 'Return detail'} onClose={onClose}>
      {detail.loading ? <LoadingNote label="Loading return detail..." /> : null}
      {detail.error ? <ErrorNote error={detail.error} onRetry={detail.reload} /> : null}
      {request ? (
        <div>
          <dl className="kv">
            <dt>Return ID</dt>
            <dd>{request.id}</dd>
            <dt>Status</dt>
            <dd>
              <span className="badge">{RETURN_STATUS_LABELS[request.status]}</span>
            </dd>
            <dt>Kind</dt>
            <dd>{RETURN_KIND_LABELS[request.kind]}</dd>
            <dt>Reason</dt>
            <dd>
              {request.reason
                ? (RETURN_REASON_LABELS[reasonCategory(request.reason)] ?? request.reason)
                : 'Not given'}
              {request.reason && reasonCategory(request.reason) === 'other' && request.reason !== 'other'
                ? ` (${request.reason})`
                : ''}
            </dd>
            <dt>Resolution type</dt>
            <dd>{RETURN_RESOLUTION_LABELS[request.resolutionType]}</dd>
            <dt>Requested at</dt>
            <dd>{formatDateTime(request.createdAt)}</dd>
            <dt>Total</dt>
            <dd>{formatMoney(request.total)}</dd>
            <dt>Restocked</dt>
            <dd>{request.restocked ? 'Yes' : 'No'}</dd>
          </dl>

          <h3>Customer</h3>
          {customer.data ? (
            <dl className="kv">
              <dt>Name</dt>
              <dd>{customer.data.fullName}</dd>
              <dt>Phone</dt>
              <dd>{customer.data.phone}</dd>
              <dt>Email</dt>
              <dd>{customer.data.email ?? 'Not recorded'}</dd>
            </dl>
          ) : (
            <p className="note muted">
              Customer record unavailable to this role. Customer ID: {request.customerId}.
              {orderDetail.data
                ? ` The order was placed by ${orderDetail.data.order.address.fullName} (${orderDetail.data.order.address.phone}).`
                : ''}
            </p>
          )}

          <h3>Original order and payment</h3>
          {orderDetail.data ? (
            <dl className="kv">
              <dt>Order</dt>
              <dd>
                <Link href={`/orders/${orderDetail.data.order.orderNumber}`}>
                  {orderDetail.data.order.orderNumber}
                </Link>
              </dd>
              <dt>Order status</dt>
              <dd>{ORDER_STATUS_LABELS[orderDetail.data.order.status]}</dd>
              <dt>Payment state</dt>
              <dd>{orderDetail.data.order.paymentStatus}</dd>
              <dt>Order total</dt>
              <dd>{formatMoney(orderDetail.data.order.total)}</dd>
            </dl>
          ) : (
            <p className="note muted">
              Order record unavailable to this role. Order number: {request.orderNumber}.
            </p>
          )}

          <h3>Returned items</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {request.items.map((line) => (
                  <tr key={line.orderItemId}>
                    <td>{line.productName}</td>
                    <td>{line.variantName ?? 'No variant'}</td>
                    <td className="num">{line.quantity}</td>
                    <td className="num">{formatMoney(line.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>Customer description</dt>
            <dd>{request.note ?? 'Not given'}</dd>
            <dt>Customer stated condition</dt>
            <dd>{request.condition ?? 'Not given'}</dd>
            <dt>Assigned inspector</dt>
            <dd>{request.assigneeId ? staffName(request.assigneeId) : 'Not assigned'}</dd>
            <dt>Pickup scheduled</dt>
            <dd>
              {request.pickupScheduledAt ? formatDateTime(request.pickupScheduledAt) : 'Not scheduled'}
            </dd>
            <dt>Received at</dt>
            <dd>{request.receivedAt ? formatDateTime(request.receivedAt) : 'Not received yet'}</dd>
          </dl>

          <h3>Inspection</h3>
          {request.inspection ? (
            <dl className="kv">
              <dt>Condition</dt>
              <dd>{request.inspection.condition}</dd>
              <dt>Packaging</dt>
              <dd>{request.inspection.packaging ?? 'Not recorded'}</dd>
              <dt>Accessories</dt>
              <dd>{request.inspection.accessories ?? 'Not recorded'}</dd>
              <dt>Quantity received</dt>
              <dd>{request.inspection.quantityReceived}</dd>
              <dt>Outcome</dt>
              <dd>{INSPECTION_OUTCOME_LABELS[request.inspection.outcome]}</dd>
              <dt>Notes</dt>
              <dd>{request.inspection.notes ?? 'Not recorded'}</dd>
              <dt>Inspected by</dt>
              <dd>{staffName(request.inspection.inspectedById)}</dd>
              <dt>Inspected at</dt>
              <dd>{formatDateTime(request.inspection.inspectedAt)}</dd>
            </dl>
          ) : (
            <p className="note muted">No inspection recorded yet.</p>
          )}
          {canEdit && (request.status === 'received' || request.status === 'inspection') ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const qty = Number(inspQty);
                if (!inspCondition.trim()) {
                  setActionError('Inspection condition is required.');
                  return;
                }
                if (!Number.isInteger(qty) || qty < 0) {
                  setActionError('Quantity received must be a whole number of 0 or more.');
                  return;
                }
                void runAction(
                  () =>
                    api.completeReturnInspection(request.id, {
                      condition: inspCondition.trim(),
                      packaging: inspPackaging.trim() ? inspPackaging.trim() : undefined,
                      accessories: inspAccessories.trim() ? inspAccessories.trim() : undefined,
                      quantityReceived: qty,
                      outcome: inspOutcome,
                      notes: inspNotes.trim() ? inspNotes.trim() : undefined,
                    }),
                  'Inspection completed. Only a resellable outcome restocks the received units.',
                );
              }}
            >
              <div className="filter-row">
                <label className="field">
                  Condition
                  <input
                    className="input"
                    value={inspCondition}
                    onChange={(event) => setInspCondition(event.target.value)}
                  />
                </label>
                <label className="field">
                  Packaging
                  <input
                    className="input"
                    value={inspPackaging}
                    onChange={(event) => setInspPackaging(event.target.value)}
                  />
                </label>
                <label className="field">
                  Accessories
                  <input
                    className="input"
                    value={inspAccessories}
                    onChange={(event) => setInspAccessories(event.target.value)}
                  />
                </label>
                <label className="field">
                  Quantity received
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={1}
                    value={inspQty}
                    onChange={(event) => setInspQty(event.target.value)}
                  />
                </label>
                <label className="field">
                  Outcome
                  <select
                    className="select"
                    value={inspOutcome}
                    onChange={(event) => setInspOutcome(event.target.value as InspectionOutcome)}
                  >
                    {INSPECTION_OUTCOMES.map((value) => (
                      <option key={value} value={value}>
                        {INSPECTION_OUTCOME_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                Inspection notes
                <textarea
                  className="input"
                  rows={2}
                  value={inspNotes}
                  onChange={(event) => setInspNotes(event.target.value)}
                />
              </label>
              {request.status === 'received' ? (
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      () => api.startReturnInspection(request.id),
                      'Inspection started.',
                    )
                  }
                >
                  Start inspection
                </button>
              ) : null}{' '}
              <button type="submit" className="btn btn-small" disabled={busy}>
                Complete inspection
              </button>
            </form>
          ) : null}

          <h3>Refund</h3>
          <dl className="kv">
            <dt>Refund state</dt>
            <dd>{request.refundState}</dd>
            <dt>Linked refund</dt>
            <dd>
              {request.refundId
                ? moneySide.data?.paymentId
                  ? (
                    <Link href={`/payments/${moneySide.data.paymentId}`}>
                      {request.refundId}
                    </Link>
                  )
                  : request.refundId
                : 'None'}
            </dd>
            <dt>Refund status in Payments</dt>
            <dd>
              {request.refundId
                ? moneySide.data?.refund
                  ? moneySide.data.refund.status
                  : 'Could not be loaded by this role'
                : 'No refund linked'}
            </dd>
          </dl>
          <p className="note muted">
            The money step lives in Payments: hand the refund off here, complete it on the
            payment, then mark this return refunded. Mark Refunded stays disabled until the
            linked refund itself reads completed.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canRefund &&
            request.refundState === 'none' &&
            (request.status === 'approved' || request.status === 'refund-pending') ? (
              <button
                type="button"
                className="btn btn-small"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    async () => (await api.handOffReturnRefund(request.id)).request,
                    'Refund handed off to Payments.',
                  )
                }
              >
                Hand off refund
              </button>
            ) : null}
            {request.status === 'refund-pending' ? (
              <button
                type="button"
                className="btn btn-small"
                disabled={busy || !canRefund || !refundCompleted}
                onClick={() =>
                  void runAction(
                    () => api.markReturnRefunded(request.id),
                    'Return marked refunded.',
                  )
                }
              >
                Mark refunded
              </button>
            ) : null}
            {canEdit &&
            (request.status === 'refunded' || request.status === 'exchange-processing') ? (
              <button
                type="button"
                className="btn btn-small"
                disabled={busy}
                onClick={() =>
                  void runAction(() => api.completeReturn(request.id), 'Return completed.')
                }
              >
                Complete return
              </button>
            ) : null}
          </div>
          {request.status === 'refund-pending' && !refundCompleted ? (
            <p className="note muted">
              {request.refundId
                ? 'The linked refund is not completed in Payments yet, so this return cannot be marked refunded.'
                : 'No refund is linked yet. Hand the refund off first.'}
            </p>
          ) : null}

          <h3>Workflow</h3>
          {canEdit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {request.status === 'requested' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        () => api.startReturnReview(request.id),
                        'Review started.',
                      )
                    }
                  >
                    Start review
                  </button>
                </div>
              ) : null}
              {request.status === 'requested' || request.status === 'under-review' ? (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={busy}
                      onClick={() =>
                        void runAction(() => api.approveReturn(request.id), 'Return approved.')
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      disabled={busy}
                      onClick={() =>
                        void runAction(() => api.rejectReturn(request.id), 'Return rejected.')
                      }
                    >
                      Reject
                    </button>
                  </div>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!infoNote.trim()) {
                        setActionError('Write the information you need from the customer.');
                        return;
                      }
                      void runAction(
                        () => api.requestReturnInfo(request.id, { note: infoNote.trim() }),
                        'Information request recorded on the timeline.',
                      );
                    }}
                  >
                    <label className="field">
                      Request more information
                      <textarea
                        className="input"
                        rows={2}
                        value={infoNote}
                        onChange={(event) => setInfoNote(event.target.value)}
                        placeholder="What the customer needs to provide"
                      />
                    </label>
                    <button type="submit" className="btn-secondary btn-small" disabled={busy}>
                      Request information
                    </button>
                  </form>
                </>
              ) : null}
              {request.status !== 'rejected' && request.status !== 'completed' ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!assigneeId) {
                      setActionError('Choose or enter the inspection staff member.');
                      return;
                    }
                    void runAction(
                      () => api.assignReturnInspector(request.id, { assigneeId }),
                      'Inspection staff assigned.',
                    );
                  }}
                >
                  <label className="field">
                    Assign inspection staff
                    {staff.length > 0 ? (
                      <select
                        className="select"
                        value={assigneeId}
                        onChange={(event) => setAssigneeId(event.target.value)}
                      >
                        <option value="">Choose staff member</option>
                        {staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.displayName} ({member.email})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        value={assigneeId}
                        onChange={(event) => setAssigneeId(event.target.value)}
                        placeholder="Staff member ID (staff directory unavailable to this role)"
                      />
                    )}
                  </label>
                  <button type="submit" className="btn-secondary btn-small" disabled={busy}>
                    Assign inspector
                  </button>
                </form>
              ) : null}
              {request.status === 'approved' ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!pickupAt) {
                      setActionError('Choose the pickup date and time.');
                      return;
                    }
                    void runAction(
                      () =>
                        api.scheduleReturnPickup(request.id, {
                          pickupAt: new Date(pickupAt).toISOString(),
                        }),
                      'Pickup schedule recorded.',
                    );
                  }}
                >
                  <label className="field">
                    Schedule pickup (date and time)
                    <input
                      className="input"
                      type="datetime-local"
                      value={pickupAt}
                      onChange={(event) => setPickupAt(event.target.value)}
                    />
                  </label>
                  <p className="note muted">
                    Scheduling records the pickup only. Courier pickup booking stays
                    not-configured without courier credentials, so no courier is booked by this
                    step. The pickup API accepts the date and time only, so there is no note
                    field to send.
                  </p>
                  <button type="submit" className="btn-secondary btn-small" disabled={busy}>
                    Schedule pickup
                  </button>
                </form>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {request.status === 'awaiting-pickup' ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        () => api.markReturnInTransit(request.id),
                        'Return marked in transit.',
                      )
                    }
                  >
                    Mark in transit
                  </button>
                ) : null}
                {request.status === 'approved' ||
                request.status === 'awaiting-pickup' ||
                request.status === 'in-transit' ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        () => api.recordReturnReceived(request.id),
                        'Items recorded as received. Nothing restocks before inspection.',
                      )
                    }
                  >
                    Record item received
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="note muted">
              Workflow actions need the orders.edit permission (the refund hand-off and Mark
              Refunded need payments.refund).
            </p>
          )}
          {actionMessage ? (
            <p className="note" role="status">
              {actionMessage}
            </p>
          ) : null}
          {actionError ? (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          ) : null}

          <h3>Timeline</h3>
          {events.length === 0 ? (
            <EmptyNote>No events recorded for this return yet.</EmptyNote>
          ) : (
            <ul className="timeline">
              {events.map((event) => (
                <li key={event.id}>
                  <div>
                    <span className="badge">{RETURN_STATUS_LABELS[event.status]}</span>{' '}
                    <span className="muted">by {staffName(event.actorId)}</span>
                  </div>
                  {event.note ? <div>{event.note}</div> : null}
                  <div className="when">{formatDateTime(event.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
