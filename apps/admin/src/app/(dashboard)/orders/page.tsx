'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Download } from 'lucide-react';
import {
  Card, DataTable, ErrorNote, LoadingNote, ModuleHeader, StatCard, StatGrid, StatusBadge, StatusTabs,
} from '../../../components/ui';
import { downloadCsv } from '../../../lib/csv';
import { formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../lib/types';

/* Orders: the staff order list from GET /v1/admin/orders with a
   status filter. Totals shown are the server totals stored on the
   order; the browser never recomputes or trusts a client total.
   Payment state is shown as the API reports it, and an order is
   never shown as paid without a verified payment behind it. */
const TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function OrdersPage() {
  const [tab, setTab] = useState('');
  const orders = useData((c) => c.listStaffOrders(tab || undefined), [tab]);
  const items = itemsOf(orders.data);
  const totalMinor = items.reduce((s, r) => s + num(asRec(r.total).amountMinor ?? r.totalMinor), 0);

  return (
    <>
      <ModuleHeader
        icon={ClipboardList}
        title="Orders"
        description="Every order with its server total and payment state. Open an order to move it through the fulfilment flow the API allows."
      >
        <button
          type="button"
          className="btn secondary"
          disabled={items.length === 0}
          onClick={() => downloadCsv('dostelo-orders.csv', items, ['orderNumber', 'status', 'paymentStatus', 'createdAt'])}
        >
          <Download size={15} /> Export CSV
        </button>
      </ModuleHeader>
      <StatGrid>
        <StatCard label="Orders in view" value={orders.loading ? '...' : String(items.length)} />
        <StatCard label="Server totals in view" value={formatMinor(totalMinor)} note="Summed from the totals the API stored on each order" />
        <StatCard label="Pending" value={String(items.filter((r) => str(r.status) === 'pending').length)} />
        <StatCard label="Delivered" value={String(items.filter((r) => str(r.status) === 'delivered').length)} />
      </StatGrid>
      <Card title="Order list">
        <StatusTabs options={TABS} value={tab} onChange={setTab} />
        {orders.loading ? (
          <LoadingNote />
        ) : orders.error ? (
          <ErrorNote error={orders.error} onRetry={orders.reload} />
        ) : (
          <DataTable
            emptyText="No orders in this state yet."
            columns={[
              { key: 'orderNumber', label: 'Order', render: (r) => <Link href={`/orders/${str(r.orderNumber)}`}>{str(r.orderNumber)}</Link> },
              { key: 'customer', label: 'Customer', render: (r) => str(asRec(r.customer).name ?? r.customerName ?? r.customerId) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'paymentStatus', label: 'Payment', render: (r) => <StatusBadge status={r.paymentStatus ?? asRec(r.payment).status} /> },
              { key: 'total', label: 'Total', money: true },
              { key: 'zone', label: 'Zone', render: (r) => str(r.deliveryZone ?? r.zone) },
              { key: 'createdAt', label: 'Placed', date: true },
            ]}
            rows={items}
          />
        )}
      </Card>
    </>
  );
}
