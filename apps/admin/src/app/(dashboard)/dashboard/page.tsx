'use client';

import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import {
  Card, DataTable, EmptyNote, ErrorNote, LoadingNote, ModuleHeader,
  StatCard, StatGrid, StatusBadge,
} from '../../../components/ui';
import { ValueBars } from '../../../components/charts';
import { formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../lib/types';

/* Dashboard: the live operating picture. Every number on this page
   is computed from an API response in the browser: the payments
   summary, the staff order list, the catalogue and the inventory
   list. Nothing is hardcoded; a widget that fails shows its own
   error and retry instead of a placeholder number. */
export default function DashboardPage() {
  const payments = useData((c) => c.getPaymentsSummary());
  const orders = useData((c) => c.listStaffOrders());
  const products = useData((c) => c.listAdminProducts());
  const inventory = useData((c) => c.listInventory());
  const reports = useData((c) => c.getReportsSummary());

  const orderItems = itemsOf(orders.data);
  const productItems = itemsOf(products.data);
  const stockItems = itemsOf(inventory.data);
  const lowStock = stockItems.filter((row) => num(row.available) > 0 && num(row.available) <= 5);
  const outOfStock = stockItems.filter((row) => num(row.available) <= 0);
  const pendingOrders = orderItems.filter((row) => str(row.status) === 'pending');

  const paySummary = asRec(payments.data);
  const byGateway = itemsOf(paySummary.byGateway);
  const reportRec = asRec(reports.data);
  const salesByDay = itemsOf(reportRec.salesByDay ?? reportRec.dailySales);

  return (
    <>
      <ModuleHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="The live operating picture, read from the API on every load. Figures below are computed from those responses only."
      />
      <StatGrid>
        {payments.loading ? (
          <StatCard label="Payments recorded" value="..." />
        ) : payments.error ? (
          <StatCard label="Payments recorded" value="Unavailable" note={payments.error.message} />
        ) : (
          <StatCard
            label="Payments recorded"
            value={String(num(paySummary.count))}
            note={`Total ${formatMinor(num(paySummary.totalMinor))} across recorded payments`}
          />
        )}
        <StatCard
          label="Orders"
          value={orders.loading ? '...' : String(orderItems.length)}
          note={`${pendingOrders.length} pending in the loaded list`}
        />
        <StatCard
          label="Products"
          value={products.loading ? '...' : String(productItems.length)}
          note="Catalogue records returned by the API"
        />
        <StatCard
          label="Low stock variants"
          value={inventory.loading ? '...' : String(lowStock.length)}
          note={`${outOfStock.length} variants out of stock in the loaded list`}
        />
      </StatGrid>

      <div className="section-grid">
        <Card title="Recent orders">
          {orders.loading ? (
            <LoadingNote />
          ) : orders.error ? (
            <ErrorNote error={orders.error} onRetry={orders.reload} />
          ) : (
            <DataTable
              pageSize={8}
              searchable={false}
              emptyText="No orders yet. Orders placed on the storefront will appear here."
              columns={[
                { key: 'orderNumber', label: 'Order', render: (r) => <Link href={`/orders/${str(r.orderNumber)}`}>{str(r.orderNumber)}</Link> },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'total', label: 'Total', money: true },
                { key: 'createdAt', label: 'Placed', date: true },
              ]}
              rows={[...orderItems].slice(0, 8)}
            />
          )}
        </Card>
        <Card title="Payments by gateway">
          {payments.loading ? (
            <LoadingNote />
          ) : payments.error ? (
            <ErrorNote error={payments.error} onRetry={payments.reload} />
          ) : byGateway.length === 0 ? (
            <EmptyNote>No payments recorded yet. Gateways report not-configured until the owner adds merchant credentials.</EmptyNote>
          ) : (
            <ValueBars
              rows={byGateway.map((g) => ({ label: str(g.key), value: num(g.totalMinor) }))}
              format={(v) => formatMinor(v)}
            />
          )}
        </Card>
      </div>

      <Card title="Sales by day (reports summary)">
        {reports.loading ? (
          <LoadingNote />
        ) : reports.error ? (
          <ErrorNote error={reports.error} onRetry={reports.reload} />
        ) : (
          <ValueBars
            rows={salesByDay.map((d) => ({
              label: str(d.date ?? d.day),
              value: num(d.totalMinor ?? d.total ?? d.revenueMinor),
            }))}
            format={(v) => formatMinor(v)}
          />
        )}
      </Card>
    </>
  );
}
