'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Package,
  PackageCheck,
  RotateCcw,
  Settings,
  Truck,
} from 'lucide-react';
import {
  COURIERS,
  COURIER_LABELS,
  SHIPMENT_STATUSES,
  SHIPMENT_STATUS_LABELS,
  type Courier,
  type Order,
  type Shipment,
  type ShipmentStatus,
} from '@dostelo/types';
import { api, formatDateTime, formatMinor, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import {
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  ModuleHeader,
  Pagination,
  StatusTabs,
  pageCountFor,
  paginate,
} from '../../../components/ui';
import { BarChart } from '../../../components/charts';
import { downloadCsv, toCsv } from '../../../lib/csv';

/**
 * Shipping and Courier (redesign). Every figure comes from the
 * loaded shipments and the integration status board. There is
 * no sync endpoint: the Sync Status panel reports recorded
 * activity only (the latest shipment update and the latest
 * recorded shipment time), never a courier sync that did not
 * happen. Booking is honest: a courier without merchant
 * credentials records the shipment as not configured, with the
 * missing variables named and no tracking id.
 *
 * Note on the canonical vocabulary: the model has no pending
 * or booked statuses. Pending bookings below means the
 * not-configured and created shipments, the two states a
 * shipment sits in before it is moving.
 */
const PAGE_SIZE = 10;

type SortKey = 'createdAt' | 'cod' | 'courier' | 'status';

export default function ShippingPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('shipping.edit');

  const list = useData((client) => client.listShipments({}), []);
  const integrations = useData((client) => client.listIntegrations(), []);
  const shipments = useMemo(() => list.data?.items ?? [], [list.data]);

  const [tab, setTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [courierFilter, setCourierFilter] = useState<Courier | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showSync, setShowSync] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<ShipmentStatus, number>();
    for (const shipment of shipments) {
      map.set(shipment.status, (map.get(shipment.status) ?? 0) + 1);
    }
    return map;
  }, [shipments]);

  const kpis = useMemo(
    () => ({
      total: shipments.length,
      inTransit: counts.get('in-transit') ?? 0,
      delivered: counts.get('delivered') ?? 0,
      exceptions: counts.get('failed') ?? 0,
      pendingBookings:
        (counts.get('not-configured') ?? 0) + (counts.get('created') ?? 0),
      returned: counts.get('returned') ?? 0,
    }),
    [shipments, counts],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = shipments.filter((shipment) => {
      if (tab !== 'all' && shipment.status !== tab) return false;
      if (courierFilter && shipment.courier !== courierFilter) return false;
      if (!needle) return true;
      return (
        (shipment.trackingId ?? '').toLowerCase().includes(needle) ||
        shipment.orderNumber.toLowerCase().includes(needle) ||
        shipment.orderId.toLowerCase().includes(needle) ||
        shipment.recipientName.toLowerCase().includes(needle) ||
        shipment.recipientPhone.toLowerCase().includes(needle)
      );
    });
    const direction = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === 'cod')
        return (a.codAmount.amountMinor - b.codAmount.amountMinor) * direction;
      if (sortKey === 'courier')
        return a.courier.localeCompare(b.courier) * direction;
      if (sortKey === 'status')
        return a.status.localeCompare(b.status) * direction;
      return a.createdAt.localeCompare(b.createdAt) * direction;
    });
    return rows;
  }, [shipments, tab, courierFilter, search, sortKey, sortDir]);

  const pageCount = pageCountFor(filtered.length, PAGE_SIZE);
  const safePage = Math.min(page, pageCount);
  const pageRows = paginate(filtered, safePage, PAGE_SIZE);

  const trend = useMemo(() => {
    const days: { label: string; key: string; value: number }[] = [];
    const byDay = new Map<string, number>();
    for (const shipment of shipments) {
      const key = shipment.createdAt.slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 86400000);
      const key = date.toISOString().slice(0, 10);
      days.push({
        key,
        label: key.slice(5),
        value: byDay.get(key) ?? 0,
      });
    }
    return days;
  }, [shipments]);

  const performance = useMemo(
    () =>
      COURIERS.map((courier) => {
        const rows = shipments.filter((s) => s.courier === courier);
        const delivered = rows.filter((s) => s.status === 'delivered').length;
        return {
          courier,
          total: rows.length,
          delivered,
          failed: rows.filter((s) => s.status === 'failed').length,
          returned: rows.filter((s) => s.status === 'returned').length,
          successShare:
            rows.length > 0 ? Math.round((delivered / rows.length) * 100) : null,
        };
      }),
    [shipments],
  );

  // Average delivery time needs the delivered event time, which
  // lives on the shipment detail, so it is loaded for delivered
  // shipments only and omitted when none have both timestamps.
  const deliveredIds = useMemo(
    () =>
      shipments
        .filter((s) => s.status === 'delivered')
        .map((s) => s.id)
        .join(','),
    [shipments],
  );
  const deliveryTime = useData(
    async (client) => {
      if (!deliveredIds) return null;
      const details = await Promise.all(
        deliveredIds
          .split(',')
          .map((id) => client.getShipment(id).catch(() => null)),
      );
      const hours: number[] = [];
      for (const detail of details) {
        if (!detail) continue;
        const deliveredEvent = [...detail.events]
          .reverse()
          .find((event) => event.status === 'delivered');
        if (!deliveredEvent) continue;
        const booked = new Date(detail.shipment.createdAt).getTime();
        const deliveredAt = new Date(deliveredEvent.createdAt).getTime();
        if (Number.isFinite(booked) && Number.isFinite(deliveredAt)) {
          hours.push((deliveredAt - booked) / 3600000);
        }
      }
      if (hours.length === 0) return null;
      return {
        averageHours: hours.reduce((sum, h) => sum + h, 0) / hours.length,
        sample: hours.length,
      };
    },
    [deliveredIds],
  );

  const syncInfo = useMemo(() => {
    if (shipments.length === 0) return null;
    const latestUpdate = shipments
      .map((s) => s.updatedAt)
      .sort()
      .at(-1)!;
    const latestActivity = shipments
      .flatMap((s) => [s.createdAt, s.updatedAt])
      .sort()
      .at(-1)!;
    return { latestUpdate, latestActivity };
  }, [shipments]);

  const shippingIntegrations = useMemo(
    () =>
      (integrations.data?.items ?? []).filter(
        (item) => item.category === 'shipping',
      ),
    [integrations.data],
  );

  function exportCsv(): void {
    downloadCsv(
      'shipments.csv',
      toCsv(
        ['Tracking ID', 'Order Number', 'Order ID', 'Courier', 'Status', 'COD Amount (minor)', 'Recipient', 'Phone', 'Booked At'],
        filtered.map((s) => [
          s.trackingId ?? '',
          s.orderNumber,
          s.orderId,
          COURIER_LABELS[s.courier],
          SHIPMENT_STATUS_LABELS[s.status],
          s.codAmount.amountMinor,
          s.recipientName,
          s.recipientPhone,
          s.createdAt,
        ]),
      ),
    );
  }

  function scrollToSettings(): void {
    document
      .getElementById('courier-settings')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section>
      <ModuleHeader
        icon={Truck}
        title="Shipping and Courier"
        description="Courier bookings, tracking and delivery performance from the real shipment records. A booking is only shown as booked when the courier confirmed it."
      >
        <button type="button" className="btn-secondary" onClick={scrollToSettings}>
          <Settings size={16} /> Courier Settings
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowSync((value) => !value)}
        >
          <Clock size={16} /> Sync Status
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            document
              .getElementById('book-shipment')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          <Package size={16} /> Book Shipment
        </button>
      </ModuleHeader>

      {showSync ? (
        <div className="card section-gap">
          <CardHead icon={Clock} title="Recorded activity" />
          <p className="note muted">
            There is no courier sync endpoint, so this panel does not claim a
            sync ran. It shows recorded activity from the loaded shipments
            only. Courier webhooks and refreshes are recorded per shipment and
            are visible on each shipment detail page.
          </p>
          {list.loading ? <LoadingNote label="Loading shipments..." /> : null}
          {syncInfo ? (
            <dl className="kv">
              <dt>Latest shipment update</dt>
              <dd>{formatDateTime(syncInfo.latestUpdate)}</dd>
              <dt>Latest recorded activity</dt>
              <dd>{formatDateTime(syncInfo.latestActivity)}</dd>
              <dt>Shipments loaded</dt>
              <dd>{shipments.length}</dd>
            </dl>
          ) : list.data ? (
            <EmptyNote>No shipments recorded yet, so there is no recorded activity to show.</EmptyNote>
          ) : null}
        </div>
      ) : null}

      {list.loading ? <LoadingNote label="Loading shipments..." /> : null}
      {list.error ? <ErrorNote error={list.error} onRetry={list.reload} /> : null}

      {list.data ? (
        <div className="kpi-grid">
          <KpiCard icon={Package} label="Total Shipments" value={String(kpis.total)} tone="purple" />
          <KpiCard icon={Truck} label="In Transit" value={String(kpis.inTransit)} tone="blue" />
          <KpiCard icon={PackageCheck} label="Delivered" value={String(kpis.delivered)} tone="green" />
          <KpiCard icon={AlertTriangle} label="Exceptions (Failed)" value={String(kpis.exceptions)} tone="orange" />
          <KpiCard icon={Clock} label="Pending Bookings" value={String(kpis.pendingBookings)} note="Not configured plus created" tone="purple" />
          <KpiCard icon={RotateCcw} label="Returned" value={String(kpis.returned)} tone="orange" />
        </div>
      ) : null}

      <StatusTabs
        tabs={[
          { key: 'all', label: 'All Shipments', count: shipments.length },
          ...SHIPMENT_STATUSES.map((status) => ({
            key: status,
            label: SHIPMENT_STATUS_LABELS[status],
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
              placeholder="Tracking id, order, recipient, phone"
            />
          </label>
          <label className="field">
            Courier
            <select
              className="select"
              value={courierFilter}
              onChange={(event) => {
                setCourierFilter(event.target.value as Courier | '');
                setPage(1);
              }}
            >
              <option value="">All couriers</option>
              {COURIERS.map((value) => (
                <option key={value} value={value}>
                  {COURIER_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Sort by
            <select
              className="select"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="createdAt">Booked at</option>
              <option value="cod">COD amount</option>
              <option value="courier">Courier</option>
              <option value="status">Status</option>
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
                setCourierFilter('');
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
        <CardHead icon={Truck} title="Shipments" />
        {list.data && filtered.length === 0 ? (
          <EmptyNote>No shipments match these filters yet.</EmptyNote>
        ) : null}
        {pageRows.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tracking ID</th>
                    <th>Order ID</th>
                    <th>Courier</th>
                    <th>Status</th>
                    <th className="num">COD Amount</th>
                    <th>Booked At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((shipment) => (
                    <tr key={shipment.id}>
                      <td>{shipment.trackingId ?? 'Not booked'}</td>
                      <td>
                        <Link href={`/shipping/${shipment.id}`}>{shipment.orderNumber}</Link>
                        <div className="muted">{shipment.orderId}</div>
                      </td>
                      <td>{COURIER_LABELS[shipment.courier]}</td>
                      <td>
                        <span className="badge">{SHIPMENT_STATUS_LABELS[shipment.status]}</span>
                        {shipment.status === 'not-configured' && shipment.notConfiguredReason ? (
                          <div className="muted">{shipment.notConfiguredReason}</div>
                        ) : null}
                      </td>
                      <td className="num">{formatMinor(shipment.codAmount.amountMinor)}</td>
                      <td>{formatDateTime(shipment.createdAt)}</td>
                      <td>
                        <Link className="btn-secondary btn-small" href={`/shipping/${shipment.id}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="muted">
                {filtered.length} shipment{filtered.length === 1 ? '' : 's'}
              </span>
              <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
            </div>
          </>
        ) : null}
      </div>

      <div className="detail-grid section-gap">
        <div className="card">
          <CardHead icon={CheckCircle2} title="Courier Performance" />
          {list.data ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Courier</th>
                      <th className="num">Total</th>
                      <th className="num">Delivered</th>
                      <th className="num">Failed</th>
                      <th className="num">Returned</th>
                      <th className="num">Success share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performance.map((row) => (
                      <tr key={row.courier}>
                        <td>{COURIER_LABELS[row.courier]}</td>
                        <td className="num">{row.total}</td>
                        <td className="num">{row.delivered}</td>
                        <td className="num">{row.failed}</td>
                        <td className="num">{row.returned}</td>
                        <td className="num">
                          {row.successShare === null ? 'No shipments' : `${row.successShare}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {deliveryTime.loading ? (
                <p className="note muted">Loading delivery times from shipment details...</p>
              ) : deliveryTime.data ? (
                <p className="note muted">
                  Average delivery time: {deliveryTime.data.averageHours.toFixed(1)} hours,
                  from {deliveryTime.data.sample} delivered shipment
                  {deliveryTime.data.sample === 1 ? '' : 's'} having both a booking time and a
                  delivered event time.
                </p>
              ) : (
                <p className="note muted">
                  Average delivery time is unavailable: no delivered shipment has both a booking
                  time and a delivered event time loaded.
                </p>
              )}
            </>
          ) : (
            <EmptyNote>Courier performance appears once shipments load.</EmptyNote>
          )}
        </div>

        <div className="card">
          <CardHead icon={Package} title="Shipment Trend" />
          <p className="note muted">Bookings per day, last 14 days, from the loaded shipments.</p>
          {list.data ? (
            shipments.length > 0 ? (
              <BarChart points={trend} />
            ) : (
              <EmptyNote>No bookings in the loaded shipments yet.</EmptyNote>
            )
          ) : (
            <EmptyNote>Shipment trend appears once shipments load.</EmptyNote>
          )}
        </div>
      </div>

      <div className="card section-gap" id="book-shipment">
        <CardHead icon={Package} title="Book a Shipment" />
        {canEdit ? (
          <BookShipmentForm onCreated={list.reload} />
        ) : (
          <p className="note muted">Booking a shipment needs the shipping.edit permission.</p>
        )}
      </div>

      <div className="card section-gap" id="courier-settings">
        <CardHead icon={Settings} title="Courier Settings" />
        <p className="note muted">
          Configuration state comes from the integrations board. Credentials are set as server
          environment variables and are never entered or shown here.
        </p>
        {integrations.loading ? <LoadingNote label="Loading courier configuration..." /> : null}
        {integrations.error ? (
          <ErrorNote error={integrations.error} onRetry={integrations.reload} />
        ) : null}
        {integrations.data && shippingIntegrations.length === 0 ? (
          <EmptyNote>No shipping integrations were reported by the API.</EmptyNote>
        ) : null}
        {shippingIntegrations.map((integration) => (
          <div key={integration.key} style={{ padding: '10px 0', borderTop: '1px solid var(--adm-border, #eceaf3)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{integration.name}</strong>
              {integration.configured ? (
                <span className="band-chip green">Configured</span>
              ) : (
                <span className="band-chip grey">Not configured</span>
              )}
            </div>
            {integration.missing.length > 0 ? (
              <p className="note muted">
                Missing variables: {integration.missing.join(', ')}
              </p>
            ) : null}
            {integration.note ? <p className="note muted">{integration.note}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function BookShipmentForm({ onCreated }: { onCreated: () => void }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [courier, setCourier] = useState<Courier>('pathao');
  const [weightKg, setWeightKg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Shipment | null>(null);

  async function loadOrder(event: FormEvent): Promise<void> {
    event.preventDefault();
    const number = orderNumber.trim();
    if (!number) return;
    setLoadingOrder(true);
    setError(null);
    setResult(null);
    setOrder(null);
    try {
      const detail = await api.getStaffOrder(number);
      setOrder(detail.order);
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setLoadingOrder(false);
    }
  }

  async function book(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!order) return;
    const weight = weightKg.trim() === '' ? NaN : Number(weightKg);
    if (weightKg.trim() !== '' && (!Number.isFinite(weight) || weight <= 0 || weight > 30)) {
      setError('Weight must be a positive number of kilograms, up to 30.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // The booking DTO accepts only orderNumber, courier and an
      // optional weightKg: recipient, address and COD all come
      // from the order on the server.
      const shipment = await api.createShipment({
        orderNumber: order.orderNumber,
        courier,
        weightKg: Number.isFinite(weight) ? weight : undefined,
      });
      setResult(shipment);
      onCreated();
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

  const address = order
    ? [order.address.addressLine, order.address.area, order.address.city, order.address.district]
        .filter(Boolean)
        .join(', ')
    : '';

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
              placeholder="Order number, for example BP-000000"
            />
          </label>
          <button type="submit" className="btn-secondary" disabled={loadingOrder || !orderNumber.trim()}>
            {loadingOrder ? 'Loading...' : 'Load order'}
          </button>
        </div>
      </form>

      {order ? (
        <form onSubmit={book} style={{ marginTop: 14 }}>
          <dl className="kv">
            <dt>Recipient name</dt>
            <dd>{order.address.fullName}</dd>
            <dt>Recipient phone</dt>
            <dd>{order.address.phone}</dd>
            <dt>Recipient address</dt>
            <dd>{address}</dd>
            <dt>Order total</dt>
            <dd>{formatMinor(order.total.amountMinor)}</dd>
            <dt>Payment status</dt>
            <dd>{order.paymentStatus}</dd>
            <dt>COD amount</dt>
            <dd>
              Set by the server from the order at booking: the order total for an unpaid COD
              order, zero for a prepaid order.
            </dd>
          </dl>
          <div className="filter-row" style={{ marginTop: 12 }}>
            <label className="field">
              Courier
              <select
                className="select"
                value={courier}
                onChange={(event) => setCourier(event.target.value as Courier)}
              >
                {COURIERS.map((value) => (
                  <option key={value} value={value}>
                    {COURIER_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Weight in kg (optional)
              <input
                className="input"
                type="number"
                min={0}
                step="0.1"
                value={weightKg}
                onChange={(event) => setWeightKg(event.target.value)}
                placeholder="Defaults to 0.5 on the server"
              />
            </label>
          </div>
          <p className="note muted">
            Only confirmed, processing, packed or ready-to-ship orders can be booked. The
            recipient name, phone, address and COD amount are taken from the order and cannot be
            edited here.
          </p>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Booking...' : 'Book shipment'}
          </button>
        </form>
      ) : null}

      {result ? (
        <div className="note" role="status" style={{ marginTop: 12 }}>
          {result.status === 'not-configured' ? (
            <>
              <strong>Not configured.</strong> The API recorded this shipment as not configured
              {result.notConfiguredReason ? `: ${result.notConfiguredReason}` : '.'} Tracking id:{' '}
              {result.trackingId ?? 'null'}. No parcel was booked.
            </>
          ) : (
            <>
              API state: <strong>{SHIPMENT_STATUS_LABELS[result.status]}</strong> with{' '}
              {COURIER_LABELS[result.courier]}. Tracking id: {result.trackingId ?? 'null'}.
            </>
          )}{' '}
          <Link href={`/shipping/${result.id}`}>View shipment</Link>
        </div>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
