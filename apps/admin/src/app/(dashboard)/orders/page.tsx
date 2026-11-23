'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@dostelo/types';
import { formatDateTime, formatMoney } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

export default function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const { data, error, loading, reload } = useData(
    (client) => client.listStaffOrders(status || undefined),
    [status],
  );

  return (
    <section>
      <PageHeader title="Orders" />
      <div className="toolbar">
        <label className="field">
          Status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as OrderStatus | '')
            }
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <LoadingNote label="Loading orders..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyNote>No orders in this state.</EmptyNote>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Order</th>
                <th>Placed</th>
                <th>Customer</th>
                <th className="num">Items</th>
                <th>Status</th>
                <th>Payment</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/orders/${order.orderNumber}`}>
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td>{formatDateTime(order.createdAt)}</td>
                  <td>{order.address.fullName}</td>
                  <td className="num">
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)}
                  </td>
                  <td>
                    <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
                  </td>
                  <td>{order.paymentStatus}</td>
                  <td className="num">{formatMoney(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
