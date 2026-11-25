'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChartLine,
  CreditCard,
  Info,
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react';
import { formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import { AreaChart, DonutChart } from '../../../components/charts';
import {
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  ModuleHeader,
  Pagination,
  pageCountFor,
  paginate,
} from '../../../components/ui';

const LOW_STOCK_THRESHOLD = 5;
const PAGE_SIZE = 5;

type RangeKey = '7' | '30' | '90';

function rangeFor(key: RangeKey): { from: string; to: string; label: string } {
  const days = Number(key);
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60_000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: `Last ${days} Days`,
  };
}

/**
 * The redesigned dashboard: welcome row with a working range
 * selector, four KPI cards, the Sales Overview chart with
 * Orders, Revenue and AOV series from the reports summary, the
 * inventory status donut, the low stock table and the gateway
 * info bar. Every figure comes from the API; cards the signed-in
 * role cannot read say so instead of showing a number.
 */
export default function DashboardPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const [rangeKey, setRangeKey] = useState<RangeKey>('30');
  const [metric, setMetric] = useState<'revenue' | 'orders' | 'aov'>(
    'revenue',
  );
  const [lowPage, setLowPage] = useState(1);
  const range = useMemo(() => rangeFor(rangeKey), [rangeKey]);

  const canPayments = permissions.includes('payments.read');
  const canReports = permissions.includes('reports.read');
  const canInventory = permissions.includes('inventory.read');
  const canCustomers = permissions.includes('customers.read');
  const canProducts = permissions.includes('products.read');

  const payments = useData(
    (client) =>
      canPayments
        ? client.getPaymentsSummary()
        : Promise.resolve(null),
    [canPayments],
  );
  const reports = useData(
    (client) =>
      canReports
        ? client.getReportsSummary({ from: range.from, to: range.to })
        : Promise.resolve(null),
    [canReports, range.from, range.to],
  );
  const inventory = useData(
    (client) =>
      canInventory ? client.listInventory() : Promise.resolve(null),
    [canInventory],
  );
  const products = useData(
    (client) =>
      canProducts ? client.listProducts() : Promise.resolve(null),
    [canProducts],
  );
  const customers = useData(
    (client) =>
      canCustomers
        ? client.listCustomers({ limit: 500 })
        : Promise.resolve(null),
    [canCustomers],
  );
  const integrations = useData(
    (client) =>
      permissions.includes('settings.manage')
        ? client.listIntegrations()
        : Promise.resolve(null),
    [permissions.join(',')],
  );

  const collectedMinor =
    payments.data?.byStatus
      .filter(
        (group) => group.key === 'successful' || group.key === 'collected',
      )
      .reduce((sum, group) => sum + group.totalMinor, 0) ?? 0;
  const pendingPayments =
    payments.data?.byStatus
      .filter((group) => group.key === 'pending' || group.key === 'processing')
      .reduce((sum, group) => sum + group.count, 0) ?? 0;

  const productById = new Map(
    (products.data?.items ?? []).map((product) => [product.id, product]),
  );
  const variantById = new Map(
    (products.data?.items ?? []).flatMap((product) =>
      product.variants.map((variant) => [variant.id, variant] as const),
    ),
  );

  const stockRows = inventory.data?.items ?? [];
  const inStock = stockRows.filter((row) => row.available > LOW_STOCK_THRESHOLD).length;
  const lowStock = stockRows.filter(
    (row) => row.available > 0 && row.available <= LOW_STOCK_THRESHOLD,
  ).length;
  const outOfStock = stockRows.filter((row) => row.available <= 0).length;
  const lowRows = stockRows
    .filter((row) => row.available <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.available - b.available);
  const lowPageRows = paginate(lowRows, lowPage, PAGE_SIZE);

  const series = (reports.data?.salesByDay ?? []).map((day) => ({
    label: day.date.slice(5),
    value:
      metric === 'revenue'
        ? day.revenueMinor / 100
        : metric === 'orders'
          ? day.orders
          : day.orders === 0
            ? 0
            : Math.round(day.revenueMinor / 100 / day.orders),
  }));
  const configuredGateways =
    integrations.data?.items.filter((item) => item.configured).length ?? 0;
  const totalGateways = integrations.data?.items.length ?? 0;

  const firstName =
    (session.displayName ?? 'Admin').split(/\s+/)[0] ?? 'Admin';

  return (
    <section>
      <div className="welcome-row">
        <div>
          <h1>Welcome back, {firstName}</h1>
          <p className="welcome-sub">
            Here is what is happening at Dostelo today: live figures
            from orders, payments, catalogue and inventory.
          </p>
        </div>
        <label className="range-select">
          <CalendarDays size={15} />
          <select
            value={rangeKey}
            onChange={(event) => setRangeKey(event.target.value as RangeKey)}
            aria-label="Date range"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </label>
      </div>

      <div className="kpi-grid">
        {canPayments ? (
          payments.loading ? (
            <KpiCard icon={Wallet} label="Payments" value="..." tone="purple" />
          ) : payments.error || !payments.data ? (
            <KpiCard
              icon={Wallet}
              label="Payments"
              value="Unavailable"
              note="Could not load the payments summary."
              tone="purple"
            />
          ) : (
            <KpiCard
              icon={Wallet}
              label="Payments"
              value={formatMinor(collectedMinor)}
              note={`${pendingPayments} payment${pendingPayments === 1 ? '' : 's'} awaiting completion, ${payments.data.count} attempts recorded`}
              tone="purple"
            />
          )
        ) : (
          <KpiCard
            icon={Wallet}
            label="Payments"
            value="Restricted"
            note="Your role cannot view payments."
            tone="purple"
          />
        )}

        {canReports ? (
          reports.loading ? (
            <KpiCard icon={ShoppingBag} label="Orders" value="..." tone="green" />
          ) : reports.error || !reports.data ? (
            <KpiCard
              icon={ShoppingBag}
              label="Orders"
              value="Unavailable"
              note="Could not load the reports summary."
              tone="green"
            />
          ) : (
            <KpiCard
              icon={ShoppingBag}
              label="Orders"
              value={reports.data.orderCount.toLocaleString('en-US')}
              note={`${formatMinor(reports.data.revenueMinor)} revenue in ${range.label.toLowerCase()}, cancelled orders excluded`}
              tone="green"
            />
          )
        ) : (
          <KpiCard
            icon={ShoppingBag}
            label="Orders"
            value="Restricted"
            note="Your role cannot view reports."
            tone="green"
          />
        )}

        {canProducts ? (
          products.loading ? (
            <KpiCard icon={Package} label="Catalogue" value="..." tone="blue" />
          ) : products.error || !products.data ? (
            <KpiCard
              icon={Package}
              label="Catalogue"
              value="Unavailable"
              note="Could not load the catalogue."
              tone="blue"
            />
          ) : (
            <KpiCard
              icon={Package}
              label="Catalogue"
              value={products.data.total.toLocaleString('en-US')}
              note={`${lowRows.length} variant${lowRows.length === 1 ? '' : 's'} at or below the low stock threshold of ${LOW_STOCK_THRESHOLD}`}
              tone="blue"
            />
          )
        ) : (
          <KpiCard
            icon={Package}
            label="Catalogue"
            value="Restricted"
            note="Your role cannot view products."
            tone="blue"
          />
        )}

        {canCustomers ? (
          customers.loading ? (
            <KpiCard icon={Users} label="Customers" value="..." tone="orange" />
          ) : customers.error || !customers.data ? (
            <KpiCard
              icon={Users}
              label="Customers"
              value="Unavailable"
              note="Could not load customers."
              tone="orange"
            />
          ) : (
            <KpiCard
              icon={Users}
              label="Customers"
              value={customers.data.items.length.toLocaleString('en-US')}
              note="Registered customer accounts on record"
              tone="orange"
            />
          )
        ) : (
          <KpiCard
            icon={Users}
            label="Customers"
            value="Restricted"
            note="Your role cannot view customers."
            tone="orange"
          />
        )}
      </div>

      <div className="dash-row">
        <div className="card">
          <CardHead icon={ChartLine} title="Sales Overview">
            <div className="toggle-pills" role="tablist" aria-label="Chart metric">
              {(
                [
                  ['revenue', 'Revenue'],
                  ['orders', 'Orders'],
                  ['aov', 'Avg. Order Value'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={metric === key}
                  className={metric === key ? 'active' : ''}
                  onClick={() => setMetric(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardHead>
          {!canReports ? (
            <EmptyNote>Your role cannot view reports.</EmptyNote>
          ) : reports.loading ? (
            <LoadingNote label="Loading sales..." />
          ) : reports.error ? (
            <ErrorNote error={reports.error} onRetry={reports.reload} />
          ) : series.length === 0 ? (
            <EmptyNote>
              No orders in {range.label.toLowerCase()} yet. The chart
              draws itself as soon as orders land in the range.
            </EmptyNote>
          ) : (
            <AreaChart
              points={series}
              formatValue={(value) =>
                metric === 'orders'
                  ? `${value} orders`
                  : formatMinor(Math.round(value * 100))
              }
            />
          )}
        </div>

        <div className="card">
          <CardHead icon={Package} title="Inventory Status" />
          {!canInventory ? (
            <EmptyNote>Your role cannot view inventory.</EmptyNote>
          ) : inventory.loading ? (
            <LoadingNote label="Loading inventory..." />
          ) : inventory.error ? (
            <ErrorNote error={inventory.error} onRetry={inventory.reload} />
          ) : stockRows.length === 0 ? (
            <EmptyNote>No stock records yet.</EmptyNote>
          ) : (
            <DonutChart
              centreValue={stockRows.length.toLocaleString('en-US')}
              centreLabel="Variants"
              slices={[
                { label: 'In Stock', value: inStock, color: '#1FA855' },
                { label: 'Low Stock', value: lowStock, color: '#E8930C' },
                { label: 'Out of Stock', value: outOfStock, color: '#E5484D' },
              ]}
            />
          )}
        </div>
      </div>

      <div className="card section-gap">
        <CardHead icon={Package} title={`Low Stock (available ${LOW_STOCK_THRESHOLD} or less)`}>
          <Link className="btn btn-secondary btn-small" href="/inventory">
            View All Inventory
          </Link>
        </CardHead>
        {!canInventory ? (
          <EmptyNote>Your role cannot view inventory.</EmptyNote>
        ) : inventory.loading ? (
          <LoadingNote label="Loading stock..." />
        ) : inventory.error ? (
          <ErrorNote error={inventory.error} onRetry={inventory.reload} />
        ) : lowRows.length === 0 ? (
          <EmptyNote>
            Nothing is at or below the low stock threshold right now.
          </EmptyNote>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Variant</th>
                    <th className="num">On Hand</th>
                    <th className="num">Reserved</th>
                    <th className="num">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {lowPageRows.map((row) => {
                    const product = productById.get(row.productId);
                    const variant = variantById.get(row.variantId);
                    const media = product?.media
                      .slice()
                      .sort((a, b) => a.position - b.position)[0];
                    return (
                      <tr key={row.variantId}>
                        <td>
                          <span className="identity-cell">
                            <span className="thumb">
                              {media ? (
                                <img src={media.url} alt={media.alt} />
                              ) : (
                                <Package size={16} />
                              )}
                            </span>
                            <span className="identity-main">
                              {product?.name ?? row.productId}
                            </span>
                          </span>
                        </td>
                        <td>{variant?.name ?? row.variantId}</td>
                        <td className="num">{row.onHand}</td>
                        <td className="num">{row.reserved}</td>
                        <td className="num">
                          <strong>{row.available}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="muted">
                {lowRows.length} low stock variant
                {lowRows.length === 1 ? '' : 's'}
              </span>
              <Pagination
                page={lowPage}
                pageCount={pageCountFor(lowRows.length, PAGE_SIZE)}
                onChange={setLowPage}
              />
            </div>
          </>
        )}
      </div>

      {integrations.data ? (
        <div className="info-bar section-gap">
          <Info size={17} />
          <span>
            Payment gateways: {configuredGateways} of {totalGateways}{' '}
            integrations are configured on the server. Unconfigured
            gateways refuse payments honestly and never mark an order
            paid. See System Integrations for the per-provider status.
          </span>
        </div>
      ) : null}

      <p className="muted" style={{ marginTop: 18, fontSize: 12.5 }}>
        <LayoutDashboard size={13} style={{ verticalAlign: -2 }} />{' '}
        <CreditCard size={13} style={{ verticalAlign: -2 }} /> All
        figures on this page are read live from the API for the
        signed-in role.
      </p>
    </section>
  );
}
