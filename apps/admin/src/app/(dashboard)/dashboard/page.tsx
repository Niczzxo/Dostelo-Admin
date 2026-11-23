'use client';

import Link from 'next/link';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_GATEWAY_LABELS,
} from '@dostelo/types';
import { formatDateTime, formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
  StatCard,
} from '../../../components/ui';

const LOW_STOCK_THRESHOLD = 5;

function PaymentsCard() {
  const { session } = useAuth();
  const allowed = session.principal?.permissions.includes('payments.read');
  const { data, error, loading, reload } = useData(
    (client) => client.getPaymentsSummary(),
    [],
  );
  if (!allowed) {
    return (
      <StatCard
        label="Payments"
        value="-"
        note="Your role cannot view payments."
      />
    );
  }
  if (loading) return <StatCard label="Payments" value="..." />;
  if (error || !data) {
    return (
      <div className="card">
        <div className="stat-label">Payments</div>
        {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      </div>
    );
  }
  const collectedMinor = data.byStatus
    .filter((group) => group.key === 'successful' || group.key === 'collected')
    .reduce((sum, group) => sum + group.totalMinor, 0);
  return (
    <StatCard
      label="Payments"
      value={String(data.count)}
      note={`${formatMinor(collectedMinor)} collected of ${formatMinor(data.totalMinor)} total`}
    />
  );
}

function OrdersCard() {
  const { session } = useAuth();
  const allowed = session.principal?.permissions.includes('orders.read');
  const { data, error, loading, reload } = useData(
    (client) => client.listStaffOrders(),
    [],
  );
  if (!allowed) {
    return (
      <StatCard label="Orders" value="-" note="Your role cannot view orders." />
    );
  }
  if (loading) return <StatCard label="Orders" value="..." />;
  if (error || !data) {
    return (
      <div className="card">
        <div className="stat-label">Orders</div>
        {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      </div>
    );
  }
  const open = data.items.filter(
    (order) =>
      order.status !== 'delivered' &&
      order.status !== 'cancelled' &&
      order.status !== 'returned',
  ).length;
  return (
    <StatCard
      label="Orders"
      value={String(data.items.length)}
      note={`${open} still in fulfilment`}
    />
  );
}

function CatalogCard() {
  const { data, error, loading, reload } = useData(async (client) => {
    const [products, categories] = await Promise.all([
      client.listProducts(),
      client.listCategories(),
    ]);
    return { products, categories };
  }, []);
  if (loading) return <StatCard label="Catalogue" value="..." />;
  if (error || !data) {
    return (
      <div className="card">
        <div className="stat-label">Catalogue</div>
        {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      </div>
    );
  }
  return (
    <StatCard
      label="Catalogue"
      value={String(data.products.total)}
      note={`${data.categories.items.length} categories`}
    />
  );
}

function RecentOrders() {
  const { session } = useAuth();
  const allowed = session.principal?.permissions.includes('orders.read');
  const { data, error, loading, reload } = useData(
    (client) => client.listStaffOrders(),
    [],
  );
  if (!allowed) return null;
  return (
    <section className="section-gap">
      <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Recent orders</h2>
      {loading ? <LoadingNote label="Loading orders..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyNote>No orders yet.</EmptyNote>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Order</th>
                <th>Placed</th>
                <th>Status</th>
                <th>Payment</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.slice(0, 8).map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/orders/${order.orderNumber}`}>
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>{ORDER_STATUS_LABELS[order.status]}</td>
                  <td>{order.paymentStatus}</td>
                  <td className="num">{formatMinor(order.total.amountMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function LowStock() {
  const { session } = useAuth();
  const allowed = session.principal?.permissions.includes('inventory.read');
  const { data, error, loading, reload } = useData(async (client) => {
    const [inventory, products] = await Promise.all([
      client.listInventory(),
      client.listProducts(),
    ]);
    const names = new Map(
      products.items.map((product) => [product.id, product.name]),
    );
    const variants = new Map(
      products.items.flatMap((product) =>
        product.variants.map(
          (variant) => [variant.id, variant.name] as const,
        ),
      ),
    );
    return inventory.items
      .filter((item) => item.available <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.available - b.available)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        productName: names.get(item.productId) ?? item.productId,
        variantName: variants.get(item.variantId) ?? item.variantId,
      }));
  }, []);
  if (!allowed) return null;
  return (
    <section className="section-gap">
      <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>
        Low stock (available {LOW_STOCK_THRESHOLD} or less)
      </h2>
      {loading ? <LoadingNote label="Loading stock..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data && data.length === 0 ? (
        <EmptyNote>Nothing is low on stock.</EmptyNote>
      ) : null}
      {data && data.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th className="num">On hand</th>
                <th className="num">Reserved</th>
                <th className="num">Available</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.variantId}>
                  <td>{item.productName}</td>
                  <td>{item.variantName}</td>
                  <td className="num">{item.onHand}</td>
                  <td className="num">{item.reserved}</td>
                  <td className="num">{item.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export default function DashboardPage() {
  return (
    <section>
      <PageHeader title="Dashboard" />
      <div className="grid">
        <PaymentsCard />
        <OrdersCard />
        <CatalogCard />
      </div>
      <RecentOrders />
      <LowStock />
      <p className="note muted" style={{ marginTop: 24 }}>
        Payment gateways in use include {PAYMENT_GATEWAY_LABELS.bkash} and{' '}
        {PAYMENT_GATEWAY_LABELS.cod}. All figures on this page are read
        live from the API.
      </p>
    </section>
  );
}
