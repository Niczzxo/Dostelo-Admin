'use client';

import { useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  Download,
  FilePlus2,
  Lightbulb,
  Package,
  PieChart,
  RefreshCcw,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUS_LABELS,
  COURIER_LABELS,
  DELIVERY_ZONE_LABELS,
  ORDER_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
  type CampaignStats,
  type CampaignView,
  type DeliveryZone,
  type Order,
  type ReportsSummary,
} from '@dostelo/types';
import { formatDateTime, formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { downloadCsv, toCsv } from '../../../lib/csv';
import { AreaChart, DonutChart } from '../../../components/charts';
import {
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
  deltaFor,
} from '../../../components/ui';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'sales', label: 'Sales and Revenue' },
  { key: 'products', label: 'Products' },
  { key: 'customers', label: 'Customers' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'operations', label: 'Operations' },
  { key: 'financial', label: 'Financial' },
  { key: 'custom', label: 'Custom Reports' },
] as const;

type TabKey = (typeof TABS)[number]['key'];
type Preset =
  | 'today'
  | 'yesterday'
  | '7'
  | '30'
  | '90'
  | 'month'
  | 'last-month'
  | 'year'
  | 'custom';

const ZONES: DeliveryZone[] = ['dhaka-city', 'dhaka-sub-city', 'outside-dhaka'];
const DONUT_COLORS = ['#1C1B17', '#45423B', '#6E695D', '#8A8578', '#B3AC9D', '#D8D3C6'];

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** Calendar day (YYYY-MM-DD) in Asia/Dhaka, the Reports day boundary. */
function dhakaDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function rangeFor(
  preset: Preset,
  customFrom: string,
  customTo: string,
): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: now };
    case 'yesterday': {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case '7':
    case '30':
    case '90': {
      const days = Number(preset);
      const from = startOfDay(
        new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000),
      );
      return { from, to: now };
    }
    case 'month':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: now,
      };
    case 'last-month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { from, to };
    }
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    case 'custom': {
      const from = customFrom ? startOfDay(new Date(customFrom)) : startOfDay(now);
      const to = customTo ? endOfDay(new Date(customTo)) : now;
      return { from, to };
    }
  }
}

function dayLabel(isoDay: string): string {
  return isoDay.slice(5);
}

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [preset, setPreset] = useState<Preset>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [compare, setCompare] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<'all' | DeliveryZone>('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [modal, setModal] = useState<'schedule' | 'custom' | null>(null);
  const [salesMetric, setSalesMetric] = useState<'revenue' | 'orders'>('revenue');
  const [topBy, setTopBy] = useState<'revenue' | 'units'>('revenue');

  const { from, to } = useMemo(
    () => rangeFor(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const durationMs = Math.max(to.getTime() - from.getTime(), 0);
  const prevFromIso = new Date(from.getTime() - durationMs).toISOString();
  const prevToIso = fromIso;
  const periodLabel = `${from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} to ${to.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const summary = useData(
    (client) => client.getReportsSummary({ from: fromIso, to: toIso }),
    [fromIso, toIso],
  );
  const prevSummary = useData<ReportsSummary | null>(
    (client) =>
      compare
        ? client.getReportsSummary({ from: prevFromIso, to: prevToIso })
        : Promise.resolve(null),
    [compare, prevFromIso, prevToIso],
  );
  const orders = useData((client) => client.listStaffOrders(), []);
  const payments = useData((client) => client.listPayments(), []);
  const products = useData((client) => client.listProducts(), []);
  const categories = useData((client) => client.listCategories(), []);
  const customersList = useData((client) => client.listCustomers(), []);
  const shipments = useData((client) => client.listShipments(), []);
  const returns = useData((client) => client.listReturns(), []);
  const buyerSessions = useData((client) => client.listBuyerSessions(), []);
  const campaignsFull = useData(async (client) => {
    const list = await client.listCampaigns();
    const stats: (CampaignStats | null)[] = await Promise.all(
      list.items.map(async (campaign) => {
        try {
          return await client.getCampaignStats(campaign.id);
        } catch {
          return null;
        }
      }),
    );
    return { items: list.items as CampaignView[], stats };
  }, []);

  const inRange = (iso: string): boolean => {
    const time = new Date(iso).getTime();
    return time >= from.getTime() && time <= to.getTime();
  };

  const paymentByOrder = useMemo(() => {
    const map = new Map<string, string>();
    for (const payment of payments.data?.items ?? []) {
      if (!map.has(payment.orderId)) map.set(payment.orderId, payment.gateway);
    }
    return map;
  }, [payments.data]);

  const allOrders = useMemo(() => orders.data?.items ?? [], [orders.data]);

  const rangeOrders = useMemo(
    () => allOrders.filter((order) => inRange(order.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allOrders, fromIso, toIso],
  );

  const filteredOrders = useMemo(
    () =>
      rangeOrders.filter((order) => {
        if (zoneFilter !== 'all' && order.address.deliveryZone !== zoneFilter) {
          return false;
        }
        if (
          methodFilter !== 'all' &&
          paymentByOrder.get(order.id) !== methodFilter
        ) {
          return false;
        }
        return true;
      }),
    [rangeOrders, zoneFilter, methodFilter, paymentByOrder],
  );

  const filtersActive = zoneFilter !== 'all' || methodFilter !== 'all';
  const nonCancelled = useMemo(
    () => filteredOrders.filter((order) => order.status !== 'cancelled'),
    [filteredOrders],
  );

  const data = summary.data;
  const prev = prevSummary.data;

  const kpiOrders = filtersActive
    ? nonCancelled.length
    : (data?.orderCount ?? 0);
  const kpiRevenue = filtersActive
    ? nonCancelled.reduce((sum, order) => sum + order.total.amountMinor, 0)
    : (data?.revenueMinor ?? 0);

  const dailySeries = useMemo(() => {
    if (!filtersActive && data) {
      return data.salesByDay.map((row) => ({
        date: row.date,
        orders: row.orders,
        revenueMinor: row.revenueMinor,
      }));
    }
    const byDay = new Map<string, { orders: number; revenueMinor: number }>();
    for (const order of nonCancelled) {
      const day = dhakaDay(order.createdAt);
      const entry = byDay.get(day) ?? { orders: 0, revenueMinor: 0 };
      entry.orders += 1;
      entry.revenueMinor += order.total.amountMinor;
      byDay.set(day, entry);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, ...value }));
  }, [filtersActive, data, nonCancelled]);

  interface ProductAgg {
    productId: string;
    productName: string;
    quantity: number;
    revenueMinor: number;
    orderIds: Set<string>;
  }

  const productAgg = useMemo(() => {
    const map = new Map<string, ProductAgg>();
    for (const order of nonCancelled) {
      for (const item of order.items) {
        const entry = map.get(item.productId) ?? {
          productId: item.productId,
          productName: item.productName,
          quantity: 0,
          revenueMinor: 0,
          orderIds: new Set<string>(),
        };
        entry.quantity += item.quantity;
        entry.revenueMinor += item.lineTotal.amountMinor;
        entry.orderIds.add(order.id);
        map.set(item.productId, entry);
      }
    }
    return [...map.values()];
  }, [nonCancelled]);

  const topProducts = useMemo(() => {
    const rows = filtersActive
      ? productAgg.map((entry) => ({
          productId: entry.productId,
          productName: entry.productName,
          quantity: entry.quantity,
          revenueMinor: entry.revenueMinor,
        }))
      : (data?.topProducts ?? []);
    return [...rows].sort((a, b) =>
      topBy === 'revenue'
        ? b.revenueMinor - a.revenueMinor
        : b.quantity - a.quantity,
    );
  }, [filtersActive, productAgg, data, topBy]);

  const productById = useMemo(() => {
    const map = new Map<string, (typeof products.data) extends null ? never : NonNullable<typeof products.data>['items'][number]>();
    for (const product of products.data?.items ?? []) map.set(product.id, product);
    return map;
  }, [products.data]);

  const zoneSlices = useMemo(() => {
    const rows = filtersActive
      ? ZONES.map((zone) => {
          const zoneOrders = nonCancelled.filter(
            (order) => order.address.deliveryZone === zone,
          );
          return {
            zone,
            orders: zoneOrders.length,
            revenueMinor: zoneOrders.reduce(
              (sum, order) => sum + order.total.amountMinor,
              0,
            ),
          };
        })
      : (data?.zoneSplit ?? []);
    return rows
      .filter((row) => row.orders > 0)
      .map((row, index) => ({
        label: DELIVERY_ZONE_LABELS[row.zone] ?? row.zone,
        value: row.orders,
        color: DONUT_COLORS[index % DONUT_COLORS.length]!,
      }));
  }, [filtersActive, nonCancelled, data]);

  const paymentSlices = useMemo(() => {
    let rows: { method: string; payments: number; amountMinor: number }[];
    if (zoneFilter === 'all') {
      rows = data?.paymentSplit ?? [];
    } else {
      const orderIds = new Set(
        rangeOrders
          .filter((order) => order.address.deliveryZone === zoneFilter)
          .map((order) => order.id),
      );
      const map = new Map<string, { payments: number; amountMinor: number }>();
      for (const payment of payments.data?.items ?? []) {
        if (!orderIds.has(payment.orderId) || !inRange(payment.createdAt)) continue;
        const entry = map.get(payment.gateway) ?? { payments: 0, amountMinor: 0 };
        entry.payments += 1;
        entry.amountMinor += payment.amount.amountMinor;
        map.set(payment.gateway, entry);
      }
      rows = [...map.entries()].map(([method, value]) => ({ method, ...value }));
    }
    return rows
      .filter((row) => row.payments > 0)
      .map((row, index) => ({
        label: row.method,
        value: row.payments,
        color: DONUT_COLORS[index % DONUT_COLORS.length]!,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneFilter, data, rangeOrders, payments.data, fromIso, toIso]);

  const rangeReturns = useMemo(
    () => (returns.data?.items ?? []).filter((entry) => inRange(entry.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [returns.data, fromIso, toIso],
  );
  const refundedReturns = useMemo(
    () => rangeReturns.filter((entry) => entry.status === 'refunded'),
    [rangeReturns],
  );
  const refundedAmount = refundedReturns.reduce(
    (sum, entry) => sum + entry.total.amountMinor,
    0,
  );

  const insights = useMemo<string[]>(() => {
    const statements: string[] = [];
    if (!data) return statements;
    if (compare && prev) {
      const delta = deltaFor(data.revenueMinor, prev.revenueMinor);
      if (delta) {
        statements.push(
          `Revenue ${delta.direction === 'up' ? 'rose' : 'fell'} ${delta.text.replace(' vs previous period', '')} in ${periodLabel} compared with the previous equal period (metric: revenue, non-cancelled order totals).`,
        );
      }
      const orderDelta = deltaFor(data.orderCount, prev.orderCount);
      if (orderDelta) {
        statements.push(
          `Orders (not cancelled) ${orderDelta.direction === 'up' ? 'rose' : 'fell'} ${orderDelta.text.replace(' vs previous period', '')} in ${periodLabel} compared with the previous equal period.`,
        );
      }
    }
    if (data.recovery.detected > 0) {
      statements.push(
        `Cart recovery rate was ${data.recovery.recoveryRatePercent}% in ${periodLabel}: ${data.recovery.recovered} of ${data.recovery.detected} detected abandoned carts were recovered.`,
      );
    }
    const topZone = [...(data.zoneSplit ?? [])].sort(
      (a, b) => b.orders - a.orders,
    )[0];
    const zoneTotal = (data.zoneSplit ?? []).reduce(
      (sum, row) => sum + row.orders,
      0,
    );
    if (topZone && zoneTotal > 0) {
      statements.push(
        `${DELIVERY_ZONE_LABELS[topZone.zone] ?? topZone.zone} was the largest delivery zone in ${periodLabel} with ${Math.round((topZone.orders / zoneTotal) * 100)}% of orders (metric: orders by delivery zone).`,
      );
    }
    const topMethod = [...(data.paymentSplit ?? [])].sort(
      (a, b) => b.payments - a.payments,
    )[0];
    if (topMethod) {
      statements.push(
        `${topMethod.method} was the most used payment method in ${periodLabel} with ${topMethod.payments} payments (metric: payments by method).`,
      );
    }
    const topProduct = data.topProducts[0];
    if (topProduct && data.revenueMinor > 0) {
      statements.push(
        `${topProduct.productName} was the top product in ${periodLabel}, contributing ${Math.round((topProduct.revenueMinor / data.revenueMinor) * 100)}% of revenue (metric: product revenue share).`,
      );
    }
    return statements;
  }, [data, prev, compare, periodLabel]);

  function resetFilters(): void {
    setPreset('30');
    setCustomFrom('');
    setCustomTo('');
    setCompare(false);
    setZoneFilter('all');
    setMethodFilter('all');
  }

  function exportCurrentTab(): void {
    const stamp = `${fromIso.slice(0, 10)}-to-${toIso.slice(0, 10)}`;
    if (tab === 'sales') {
      downloadCsv(
        `reports-sales-${stamp}.csv`,
        toCsv(
          ['Date', 'Orders', 'Revenue (BDT minor)', 'Revenue'],
          dailySeries.map((row) => [row.date, row.orders, row.revenueMinor, formatMinor(row.revenueMinor)]),
        ),
      );
    } else if (tab === 'products') {
      downloadCsv(
        `reports-products-${stamp}.csv`,
        toCsv(
          ['Product', 'Units', 'Orders', 'Revenue'],
          [...productAgg]
            .sort((a, b) => b.revenueMinor - a.revenueMinor)
            .map((entry) => [entry.productName, entry.quantity, entry.orderIds.size, formatMinor(entry.revenueMinor)]),
        ),
      );
    } else if (tab === 'customers') {
      downloadCsv(
        `reports-customers-${stamp}.csv`,
        toCsv(
          ['Customer', 'Orders in period', 'Spend in period', 'Type'],
          customerRows.map((row) => [row.name, row.orders, formatMinor(row.spendMinor), row.kind]),
        ),
      );
    } else if (tab === 'marketing') {
      downloadCsv(
        `reports-marketing-${stamp}.csv`,
        toCsv(
          ['Campaign', 'Channel', 'Status', 'Sent (provider confirmed)', 'Sent at'],
          (campaignsFull.data?.items ?? []).map((campaign, index) => [
            campaign.name,
            CAMPAIGN_CHANNEL_LABELS[campaign.channel],
            CAMPAIGN_STATUS_LABELS[campaign.status],
            campaignsFull.data?.stats[index]?.sent ?? 'Unavailable',
            campaign.sentAt ? formatDateTime(campaign.sentAt) : '',
          ]),
        ),
      );
    } else if (tab === 'operations') {
      downloadCsv(
        `reports-operations-${stamp}.csv`,
        toCsv(
          ['Shipment', 'Order', 'Courier', 'Status', 'Created'],
          rangeShipments.map((shipment) => [
            shipment.id,
            shipment.orderNumber,
            COURIER_LABELS[shipment.courier],
            SHIPMENT_STATUS_LABELS[shipment.status],
            formatDateTime(shipment.createdAt),
          ]),
        ),
      );
    } else if (tab === 'financial') {
      downloadCsv(
        `reports-financial-${stamp}.csv`,
        toCsv(
          ['Payment status', 'Payments', 'Amount'],
          paymentStatusRows.map((row) => [row.status, row.count, formatMinor(row.amountMinor)]),
        ),
      );
    } else {
      downloadCsv(
        `reports-overview-${stamp}.csv`,
        toCsv(
          ['Date', 'Orders', 'Revenue'],
          dailySeries.map((row) => [row.date, row.orders, formatMinor(row.revenueMinor)]),
        ),
      );
    }
  }

  // Customers tab aggregation (also used by the CSV export above).
  const customerRows = useMemo(() => {
    const firstOrderAt = new Map<string, number>();
    for (const order of allOrders) {
      const time = new Date(order.createdAt).getTime();
      const current = firstOrderAt.get(order.customerId);
      if (current === undefined || time < current) {
        firstOrderAt.set(order.customerId, time);
      }
    }
    const nameById = new Map(
      (customersList.data?.items ?? []).map((customer) => [
        customer.id,
        customer.fullName,
      ]),
    );
    const rows = new Map<
      string,
      { customerId: string; name: string; orders: number; spendMinor: number; kind: string }
    >();
    for (const order of nonCancelled) {
      const row = rows.get(order.customerId) ?? {
        customerId: order.customerId,
        name: nameById.get(order.customerId) ?? order.customerId,
        orders: 0,
        spendMinor: 0,
        kind:
          (firstOrderAt.get(order.customerId) ?? 0) >= from.getTime()
            ? 'New'
            : 'Returning',
      };
      row.orders += 1;
      row.spendMinor += order.total.amountMinor;
      rows.set(order.customerId, row);
    }
    return [...rows.values()].sort((a, b) => b.spendMinor - a.spendMinor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrders, nonCancelled, customersList.data, fromIso]);

  const newCustomers = customerRows.filter((row) => row.kind === 'New').length;
  const returningCustomers = customerRows.length - newCustomers;
  const repeatCustomers = customerRows.filter((row) => row.orders >= 2).length;
  const repeatRate =
    customerRows.length > 0
      ? Math.round((repeatCustomers / customerRows.length) * 1000) / 10
      : 0;
  const lifetimeCustomers = (customersList.data?.items ?? []).filter(
    (customer) => customer.lifetimeValueMinor > 0,
  );
  const avgLifetimeValue =
    lifetimeCustomers.length > 0
      ? Math.round(
          lifetimeCustomers.reduce(
            (sum, customer) => sum + customer.lifetimeValueMinor,
            0,
          ) / lifetimeCustomers.length,
        )
      : 0;

  // Operations aggregation.
  const orderByNumber = useMemo(() => {
    const map = new Map<string, Order>();
    for (const order of allOrders) map.set(order.orderNumber, order);
    return map;
  }, [allOrders]);

  const rangeShipments = useMemo(
    () =>
      (shipments.data?.items ?? []).filter((shipment) => {
        if (!inRange(shipment.createdAt)) return false;
        if (zoneFilter === 'all') return true;
        const order = orderByNumber.get(shipment.orderNumber);
        return order?.address.deliveryZone === zoneFilter;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shipments.data, fromIso, toIso, zoneFilter, orderByNumber],
  );

  const deliveredShipments = rangeShipments.filter(
    (shipment) => shipment.status === 'delivered',
  ).length;
  const pendingShipments = rangeShipments.filter((shipment) =>
    ['created', 'picked-up', 'in-transit', 'not-configured'].includes(
      shipment.status,
    ),
  ).length;
  const failedShipments = rangeShipments.filter((shipment) =>
    ['failed', 'returned', 'cancelled'].includes(shipment.status),
  ).length;
  const closedShipments = deliveredShipments + failedShipments;
  const deliverySuccessRate =
    closedShipments > 0
      ? Math.round((deliveredShipments / closedShipments) * 1000) / 10
      : null;

  // Financial aggregation.
  const rangePayments = useMemo(
    () =>
      (payments.data?.items ?? []).filter((payment) =>
        inRange(payment.createdAt),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments.data, fromIso, toIso],
  );
  const paymentStatusRows = useMemo(() => {
    const map = new Map<string, { count: number; amountMinor: number }>();
    for (const payment of rangePayments) {
      const entry = map.get(payment.status) ?? { count: 0, amountMinor: 0 };
      entry.count += 1;
      entry.amountMinor += payment.amount.amountMinor;
      map.set(payment.status, entry);
    }
    return [...map.entries()].map(([status, value]) => ({ status, ...value }));
  }, [rangePayments]);

  const netRevenue = data ? data.revenueMinor - refundedAmount : 0;
  const shippingRevenue = nonCancelled.reduce(
    (sum, order) => sum + order.deliveryFee.amountMinor,
    0,
  );
  const discountTotal = nonCancelled.reduce(
    (sum, order) => sum + order.discount.amountMinor,
    0,
  );
  const aov = kpiOrders > 0 ? Math.round(kpiRevenue / kpiOrders) : 0;

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of filteredOrders) {
      map.set(order.status, (map.get(order.status) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [filteredOrders]);

  const honestModalText =
    'Saved and scheduled reports are not stored by the API in this pass, so this action cannot save a configuration or a schedule yet. The working path is the Export Report button: it downloads a CSV of the current tab, with the current filters applied.';

  return (
    <section>
      <ModuleHeader
        icon={BarChart3}
        title="Reports and Analytics"
        description="Read-only reporting over orders, payments, products, customers and operations for the selected period."
      >
        <button type="button" className="btn" onClick={exportCurrentTab}>
          <Download size={15} /> Export Report
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setModal('schedule')}
        >
          <CalendarClock size={15} /> Schedule Report
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setModal('custom')}
        >
          <FilePlus2 size={15} /> Custom Report
        </button>
      </ModuleHeader>

      <p className="note" style={{ marginTop: 0 }}>
        Revenue means order totals for non-cancelled orders. Net revenue is
        revenue minus completed refunds. Collected money is a payments
        figure and is never mixed with revenue. Day boundaries use
        Asia/Dhaka.
      </p>

      <div className="card filter-card">
        <div className="filter-row">
          <label className="field">
            Date range
            <select
              className="select"
              value={preset}
              onChange={(event) => setPreset(event.target.value as Preset)}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {preset === 'custom' ? (
            <>
              <label className="field">
                From
                <input
                  className="input"
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </label>
              <label className="field">
                To
                <input
                  className="input"
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </label>
            </>
          ) : null}
          <label className="field">
            Delivery zone
            <select
              className="select"
              value={zoneFilter}
              onChange={(event) =>
                setZoneFilter(event.target.value as 'all' | DeliveryZone)
              }
            >
              <option value="all">All zones</option>
              {ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {DELIVERY_ZONE_LABELS[zone]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Payment method
            <select
              className="select"
              value={methodFilter}
              onChange={(event) => setMethodFilter(event.target.value)}
            >
              <option value="all">All methods</option>
              {[...new Set((payments.data?.items ?? []).map((p) => p.gateway))]
                .sort()
                .map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Compare to Previous Period
            <span>
              <input
                type="checkbox"
                checked={compare}
                onChange={(event) => setCompare(event.target.checked)}
              />{' '}
              {compare ? 'On' : 'Off'}
            </span>
          </label>
          <div className="filter-actions">
            <button type="button" className="btn-secondary" onClick={resetFilters}>
              <RefreshCcw size={14} /> Reset
            </button>
          </div>
        </div>
        <p className="note muted" style={{ marginBottom: 0 }}>
          Period: {periodLabel}. Zone and payment filters apply to the
          order based figures computed on this page. Cart recovery has no
          zone or payment dimension, so its figures stay period wide.
        </p>
      </div>

      <div className="page-tabs" role="tablist" aria-label="Report sections">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            className={`page-tab${tab === entry.key ? ' active' : ''}`}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {summary.loading ? <LoadingNote label="Loading report..." /> : null}
      {summary.error ? (
        <ErrorNote error={summary.error} onRetry={summary.reload} />
      ) : null}
      {orders.error ? (
        <ErrorNote error={orders.error} onRetry={orders.reload} />
      ) : null}

      {tab === 'overview' && data ? (
        <>
          <div className="kpi-grid">
            <KpiCard
              icon={ShoppingCart}
              label="Orders (Not Cancelled)"
              value={String(kpiOrders)}
              delta={
                compare && prev && !filtersActive
                  ? deltaFor(data.orderCount, prev.orderCount)
                  : null
              }
            />
            <KpiCard
              icon={Wallet}
              label="Revenue"
              value={formatMinor(kpiRevenue)}
              delta={
                compare && prev && !filtersActive
                  ? deltaFor(data.revenueMinor, prev.revenueMinor)
                  : null
              }
              tone="green"
            />
            <KpiCard
              icon={RefreshCcw}
              label="Carts Detected Abandoned"
              value={String(data.recovery.detected)}
              tone="blue"
            />
            <KpiCard
              icon={PieChart}
              label="Recovery Rate"
              value={`${data.recovery.recoveryRatePercent}%`}
              note={`${data.recovery.recovered} recovered, worth ${formatMinor(data.recovery.recoveredValueMinor)}`}
              tone="orange"
            />
          </div>

          <div className="detail-grid">
            <div className="card">
              <CardHead icon={BarChart3} title="Sales by Day">
                <span>
                  <button
                    type="button"
                    className={`btn-small ${salesMetric === 'revenue' ? 'btn' : 'btn-secondary'}`}
                    onClick={() => setSalesMetric('revenue')}
                  >
                    Revenue
                  </button>{' '}
                  <button
                    type="button"
                    className={`btn-small ${salesMetric === 'orders' ? 'btn' : 'btn-secondary'}`}
                    onClick={() => setSalesMetric('orders')}
                  >
                    Orders
                  </button>
                </span>
              </CardHead>
              {dailySeries.length === 0 ? (
                <EmptyNote>No sales in this period.</EmptyNote>
              ) : (
                <AreaChart
                  points={dailySeries.map((row) => ({
                    label: dayLabel(row.date),
                    value:
                      salesMetric === 'revenue' ? row.revenueMinor : row.orders,
                  }))}
                  formatValue={(value) =>
                    salesMetric === 'revenue' ? formatMinor(value) : String(value)
                  }
                />
              )}
            </div>

            <div className="card">
              <CardHead icon={Package} title="Top Products">
                <span>
                  <button
                    type="button"
                    className={`btn-small ${topBy === 'revenue' ? 'btn' : 'btn-secondary'}`}
                    onClick={() => setTopBy('revenue')}
                  >
                    By Revenue
                  </button>{' '}
                  <button
                    type="button"
                    className={`btn-small ${topBy === 'units' ? 'btn' : 'btn-secondary'}`}
                    onClick={() => setTopBy('units')}
                  >
                    By Units
                  </button>
                </span>
              </CardHead>
              {topProducts.length === 0 ? (
                <EmptyNote>No product sales in this period.</EmptyNote>
              ) : (
                <div>
                  {topProducts.slice(0, 8).map((row) => {
                    const product = productById.get(row.productId);
                    const image = product?.media
                      .filter((media) => media.type === 'image')
                      .sort((a, b) => a.position - b.position)[0];
                    const maxValue =
                      topBy === 'revenue'
                        ? Math.max(...topProducts.map((entry) => entry.revenueMinor), 1)
                        : Math.max(...topProducts.map((entry) => entry.quantity), 1);
                    const value = topBy === 'revenue' ? row.revenueMinor : row.quantity;
                    return (
                      <div className="source-row" key={row.productId}>
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="thumb" src={image.url} alt={image.alt || row.productName} />
                        ) : null}
                        <span style={{ flex: 1 }}>
                          {row.productName}
                          <span className="funnel-track" style={{ display: 'block' }}>
                            <span
                              className="funnel-fill"
                              style={{ width: `${Math.round((value / maxValue) * 100)}%` }}
                            />
                          </span>
                        </span>
                        <span className="num">
                          {row.quantity} units, {formatMinor(row.revenueMinor)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <CardHead icon={Truck} title="Delivery Zone Split" />
              {zoneSlices.length === 0 ? (
                <EmptyNote>No orders in this period.</EmptyNote>
              ) : (
                <DonutChart
                  slices={zoneSlices}
                  centreLabel="Orders"
                  centreValue={String(
                    zoneSlices.reduce((sum, slice) => sum + slice.value, 0),
                  )}
                />
              )}
            </div>

            <div className="card">
              <CardHead icon={Wallet} title="Payment Method Split" />
              {paymentSlices.length === 0 ? (
                <EmptyNote>No payments in this period.</EmptyNote>
              ) : (
                <DonutChart
                  slices={paymentSlices}
                  centreLabel="Payments"
                  centreValue={String(
                    paymentSlices.reduce((sum, slice) => sum + slice.value, 0),
                  )}
                />
              )}
            </div>

            <div className="card">
              <CardHead icon={RefreshCcw} title="Cart Recovery Performance" />
              <dl className="kv">
                <dt>Detected</dt>
                <dd>{data.recovery.detected}</dd>
                <dt>Recovered</dt>
                <dd>
                  {data.recovery.recovered} ({formatMinor(data.recovery.recoveredValueMinor)})
                </dd>
                <dt>Cancelled</dt>
                <dd>{data.recovery.cancelled}</dd>
                <dt>Still in Progress</dt>
                <dd>{data.recovery.inProgress}</dd>
                <dt>Recovery rate</dt>
                <dd>{data.recovery.recoveryRatePercent}%</dd>
              </dl>
            </div>

            <div className="card">
              <CardHead icon={Lightbulb} title="Key Insights" />
              {insights.length === 0 ? (
                <EmptyNote>
                  Not enough data in this period to generate insights.
                </EmptyNote>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  {insights.map((statement) => (
                    <li key={statement}>{statement}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}

      {tab === 'sales' ? (
        <>
          <div className="kpi-grid">
            <KpiCard icon={Wallet} label="Revenue" value={formatMinor(kpiRevenue)} tone="green" />
            <KpiCard icon={ShoppingCart} label="Average Order Value" value={formatMinor(aov)} note="Revenue over orders (not cancelled)" />
            <KpiCard icon={ShoppingCart} label="Cancelled Orders" value={String(filteredOrders.filter((order) => order.status === 'cancelled').length)} tone="orange" />
            <KpiCard
              icon={RefreshCcw}
              label="Refunded (returns data)"
              value={String(refundedReturns.length)}
              note={`${formatMinor(refundedAmount)} from returns records with status refunded. Source: returns data, because the payments list does not expose refund records.`}
              tone="blue"
            />
          </div>
          <div className="detail-grid">
            <div className="card">
              <CardHead icon={BarChart3} title="Daily Sales" />
              {dailySeries.length === 0 ? (
                <EmptyNote>No sales in this period.</EmptyNote>
              ) : (
                <AreaChart
                  points={dailySeries.map((row) => ({
                    label: dayLabel(row.date),
                    value: row.revenueMinor,
                  }))}
                  formatValue={(value) => formatMinor(value)}
                />
              )}
            </div>
            <div className="card">
              <CardHead icon={ShoppingCart} title="Orders by Status" />
              {statusCounts.length === 0 ? (
                <EmptyNote>No orders in this period.</EmptyNote>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th className="num">Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusCounts.map(([status, count]) => (
                        <tr key={status}>
                          <td>
                            {ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status}
                          </td>
                          <td className="num">{count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <CardHead icon={BarChart3} title="Daily Series" />
            {dailySeries.length === 0 ? (
              <EmptyNote>No sales in this period.</EmptyNote>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th className="num">Orders</th>
                      <th className="num">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySeries.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td className="num">{row.orders}</td>
                        <td className="num">{formatMinor(row.revenueMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {tab === 'products' ? (
        <ProductsTab
          agg={productAgg}
          returns={rangeReturns}
          categories={categories.data?.items ?? []}
          productById={productById}
          sessionsError={buyerSessions.error !== null}
          sessionsLoading={buyerSessions.loading}
          productViews={(buyerSessions.data?.items ?? []).reduce(
            (sum, session) => sum + session.productViews,
            0,
          )}
          addToCart={(buyerSessions.data?.items ?? []).reduce(
            (sum, session) => sum + (session.eventCounts['add-to-cart'] ?? 0),
            0,
          )}
        />
      ) : null}

      {tab === 'customers' ? (
        <div className="detail-grid">
          <div className="card">
            <CardHead icon={Users} title="New versus Returning" />
            <dl className="kv">
              <dt>New customers</dt>
              <dd>{newCustomers}</dd>
              <dt>Returning customers</dt>
              <dd>{returningCustomers}</dd>
              <dt>Repeat purchase rate</dt>
              <dd>
                {repeatRate}% (customers with 2 or more orders in the period,
                out of customers who ordered in the period)
              </dd>
              <dt>Average lifetime value</dt>
              <dd>
                {lifetimeCustomers.length > 0
                  ? formatMinor(avgLifetimeValue)
                  : 'Unavailable'}
              </dd>
              <dt>Average spend per order</dt>
              <dd>{formatMinor(aov)}</dd>
            </dl>
            <p className="note muted">
              New means the customer&apos;s first recorded order falls in
              the period; returning means an earlier order exists. Figures
              come from orders joined to the customer list.
            </p>
          </div>
          <div className="card">
            <CardHead icon={Users} title="Top Customers in Period" />
            {customersList.loading ? (
              <LoadingNote label="Loading customers..." />
            ) : customerRows.length === 0 ? (
              <EmptyNote>No customer orders in this period.</EmptyNote>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Type</th>
                      <th className="num">Orders</th>
                      <th className="num">Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerRows.slice(0, 15).map((row) => (
                      <tr key={row.customerId}>
                        <td>{row.name}</td>
                        <td>
                          <span className="badge">{row.kind}</span>
                        </td>
                        <td className="num">{row.orders}</td>
                        <td className="num">{formatMinor(row.spendMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'marketing' ? (
        <div className="card">
          <CardHead icon={BarChart3} title="Campaigns" />
          <p className="note" style={{ marginTop: 0 }}>
            Sent counts only include provider-confirmed sends (status
            sent). Delivered and engagement figures are unavailable: the
            providers do not report them back into this portal, so they
            are never estimated.
          </p>
          {campaignsFull.loading ? (
            <LoadingNote label="Loading campaigns..." />
          ) : campaignsFull.error ? (
            <ErrorNote error={campaignsFull.error} onRetry={campaignsFull.reload} />
          ) : (campaignsFull.data?.items.length ?? 0) === 0 ? (
            <EmptyNote>No campaigns recorded.</EmptyNote>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th className="num">Recipients</th>
                    <th className="num">Sent (confirmed)</th>
                    <th>Provider</th>
                    <th>Sent at</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignsFull.data!.items.map((campaign, index) => {
                    const stats = campaignsFull.data!.stats[index];
                    return (
                      <tr key={campaign.id}>
                        <td>{campaign.name}</td>
                        <td>{CAMPAIGN_CHANNEL_LABELS[campaign.channel]}</td>
                        <td>
                          <span className="badge">
                            {CAMPAIGN_STATUS_LABELS[campaign.status]}
                          </span>
                        </td>
                        <td className="num">{stats ? stats.recipients : 'Unavailable'}</td>
                        <td className="num">{stats ? stats.sent : 'Unavailable'}</td>
                        <td>
                          {campaign.sending.configured
                            ? 'Configured'
                            : `Not configured (missing ${campaign.sending.missing.join(', ')})`}
                        </td>
                        <td>
                          {campaign.sentAt ? formatDateTime(campaign.sentAt) : 'Not sent'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'operations' ? (
        <>
          <div className="kpi-grid">
            <KpiCard icon={Truck} label="Shipments" value={String(rangeShipments.length)} />
            <KpiCard icon={Truck} label="Delivered" value={String(deliveredShipments)} tone="green" />
            <KpiCard icon={Truck} label="Pending Deliveries" value={String(pendingShipments)} note="Created, picked up, in transit or not configured" tone="blue" />
            <KpiCard icon={Truck} label="Failed Deliveries" value={String(failedShipments)} note="Failed, returned or cancelled" tone="orange" />
            <KpiCard
              icon={PieChart}
              label="Delivery Success Rate"
              value={deliverySuccessRate !== null ? `${deliverySuccessRate}%` : 'Unavailable'}
              note="Delivered out of closed shipments (delivered plus failed, returned, cancelled)"
            />
          </div>
          <div className="detail-grid">
            <div className="card">
              <CardHead icon={Truck} title="Shipments by Courier" />
              {rangeShipments.length === 0 ? (
                <EmptyNote>No shipments in this period.</EmptyNote>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Courier</th>
                        <th className="num">Shipments</th>
                        <th className="num">Delivered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(rangeShipments.map((s) => s.courier))].map(
                        (courier) => (
                          <tr key={courier}>
                            <td>{COURIER_LABELS[courier]}</td>
                            <td className="num">
                              {rangeShipments.filter((s) => s.courier === courier).length}
                            </td>
                            <td className="num">
                              {
                                rangeShipments.filter(
                                  (s) => s.courier === courier && s.status === 'delivered',
                                ).length
                              }
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card">
              <CardHead icon={Truck} title="Orders by Zone (shipments joined)" />
              {rangeShipments.length === 0 ? (
                <EmptyNote>No shipments in this period.</EmptyNote>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Zone</th>
                        <th className="num">Shipments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ZONES.map((zone) => (
                        <tr key={zone}>
                          <td>{DELIVERY_ZONE_LABELS[zone]}</td>
                          <td className="num">
                            {
                              rangeShipments.filter(
                                (shipment) =>
                                  orderByNumber.get(shipment.orderNumber)?.address
                                    .deliveryZone === zone,
                              ).length
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="note muted">
                Average delivery time is unavailable: shipment list records
                do not carry a delivered timestamp, so no honest duration
                can be computed from them.
              </p>
            </div>
          </div>
        </>
      ) : null}

      {tab === 'financial' ? (
        <div className="detail-grid">
          <div className="card">
            <CardHead icon={Wallet} title="Revenue and Refunds" />
            {!data ? (
              <LoadingNote label="Loading summary..." />
            ) : (
              <dl className="kv">
                <dt>Gross revenue</dt>
                <dd>{formatMinor(data.revenueMinor)}</dd>
                <dt>Refunds (completed)</dt>
                <dd>
                  {formatMinor(refundedAmount)} (source: returns records
                  with status refunded, {refundedReturns.length} return(s))
                </dd>
                <dt>Net revenue</dt>
                <dd>{formatMinor(netRevenue)}</dd>
                <dt>Shipping revenue</dt>
                <dd>
                  {formatMinor(shippingRevenue)} (delivery fees over
                  non-cancelled orders in the period)
                </dd>
                <dt>Discounts recorded</dt>
                <dd>{formatMinor(discountTotal)}</dd>
              </dl>
            )}
          </div>
          <div className="card">
            <CardHead icon={Wallet} title="Payments by Status" />
            <p className="note muted" style={{ marginTop: 0 }}>
              Collected money is a payments figure. It is reported here
              separately and is never mixed with revenue above.
            </p>
            {payments.loading ? (
              <LoadingNote label="Loading payments..." />
            ) : paymentStatusRows.length === 0 ? (
              <EmptyNote>No payments in this period.</EmptyNote>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th className="num">Payments</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentStatusRows.map((row) => (
                      <tr key={row.status}>
                        <td>{row.status}</td>
                        <td className="num">{row.count}</td>
                        <td className="num">{formatMinor(row.amountMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <CardHead icon={Wallet} title="Costs and Profit" />
            <p className="note" style={{ marginTop: 0 }}>
              COGS, gross profit and margin are unavailable: the product
              catalogue carries no cost data, so no cost figure can be
              computed honestly.
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'custom' ? (
        <div className="card">
          <CardHead icon={FilePlus2} title="Custom Reports" />
          <p className="note" style={{ marginTop: 0 }}>
            {honestModalText}
          </p>
          <button type="button" className="btn" onClick={exportCurrentTab}>
            <Download size={15} /> Export Report
          </button>
        </div>
      ) : null}

      {modal ? (
        <Modal
          title={modal === 'schedule' ? 'Schedule Report' : 'Custom Report'}
          onClose={() => setModal(null)}
        >
          <p className="note" style={{ marginTop: 0 }}>
            {honestModalText}
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setModal(null);
              exportCurrentTab();
            }}
          >
            <Download size={15} /> Export Report instead
          </button>
        </Modal>
      ) : null}
    </section>
  );
}

function ProductsTab({
  agg,
  returns,
  categories,
  productById,
  sessionsError,
  sessionsLoading,
  productViews,
  addToCart,
}: {
  agg: {
    productId: string;
    productName: string;
    quantity: number;
    revenueMinor: number;
    orderIds: Set<string>;
  }[];
  returns: ReturnType<typeof useData> extends never
    ? never
    : import('@dostelo/types').ReturnRequest[];
  categories: { id: string; name: string }[];
  productById: Map<string, import('@dostelo/types').Product>;
  sessionsError: boolean;
  sessionsLoading: boolean;
  productViews: number;
  addToCart: number;
}) {
  const returnedByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of returns) {
      for (const line of entry.items) {
        map.set(line.productName, (map.get(line.productName) ?? 0) + line.quantity);
      }
    }
    return map;
  }, [returns]);

  const sortedDesc = [...agg].sort((a, b) => b.revenueMinor - a.revenueMinor);
  const sortedAsc = [...agg].sort((a, b) => a.revenueMinor - b.revenueMinor);

  const categoryRows = useMemo(() => {
    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    const map = new Map<string, { units: number; revenueMinor: number }>();
    for (const entry of agg) {
      const product = productById.get(entry.productId);
      const label = product
        ? (nameById.get(product.categoryId) ?? 'Uncategorised')
        : 'Unknown product';
      const row = map.get(label) ?? { units: 0, revenueMinor: 0 };
      row.units += entry.quantity;
      row.revenueMinor += entry.revenueMinor;
      map.set(label, row);
    }
    return [...map.entries()].sort((a, b) => b[1].revenueMinor - a[1].revenueMinor);
  }, [agg, categories, productById]);

  const renderTable = (
    rows: typeof agg,
    title: string,
  ) => (
    <div className="card">
      <CardHead icon={Package} title={title} />
      {rows.length === 0 ? (
        <EmptyNote>No product sales in this period.</EmptyNote>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Units</th>
                <th className="num">Orders</th>
                <th className="num">Revenue</th>
                <th className="num">Return rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((entry) => {
                const returned = returnedByName.get(entry.productName) ?? 0;
                const rate =
                  entry.quantity > 0
                    ? `${Math.round((returned / entry.quantity) * 1000) / 10}%`
                    : 'Unavailable';
                return (
                  <tr key={entry.productId}>
                    <td>{entry.productName}</td>
                    <td className="num">{entry.quantity}</td>
                    <td className="num">{entry.orderIds.size}</td>
                    <td className="num">{formatMinor(entry.revenueMinor)}</td>
                    <td className="num">{rate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="detail-grid">
        {renderTable(sortedDesc, 'Top Sellers')}
        {renderTable(sortedAsc, 'Lowest Sellers')}
      </div>
      <div className="detail-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <CardHead icon={Package} title="Category Performance" />
          {categoryRows.length === 0 ? (
            <EmptyNote>No category sales in this period.</EmptyNote>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Units</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map(([label, row]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className="num">{row.units}</td>
                      <td className="num">{formatMinor(row.revenueMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <CardHead icon={PieChart} title="Product Views and Add to Cart" />
          {sessionsLoading ? (
            <LoadingNote label="Loading visitor sessions..." />
          ) : sessionsError ? (
            <p className="note">
              Product view and add-to-cart figures are unavailable: buyer
              session data could not be loaded for this account.
            </p>
          ) : (
            <dl className="kv">
              <dt>Product views</dt>
              <dd>{productViews}</dd>
              <dt>Add to cart events</dt>
              <dd>{addToCart}</dd>
              <dt>Add-to-cart rate</dt>
              <dd>
                {productViews > 0
                  ? `${Math.round((addToCart / productViews) * 1000) / 10}%`
                  : 'Unavailable'}
              </dd>
            </dl>
          )}
          <p className="note muted">
            From buyer intelligence sessions (all recorded sessions, not
            limited to the selected period, because sessions carry no
            report range filter in this pass).
          </p>
        </div>
      </div>
    </>
  );
}
