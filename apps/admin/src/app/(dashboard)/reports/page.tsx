'use client';

import { useState } from 'react';
import { formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import {
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
  StatCard,
} from '../../../components/ui';

const ZONE_LABELS: Record<string, string> = {
  'dhaka-city': 'Dhaka city',
  'dhaka-sub-city': 'Dhaka sub city',
  'outside-dhaka': 'Outside Dhaka',
};

/**
 * Reports & Analytics: read-only aggregation served by the API
 * from the orders, payments and cart recovery stores. Cancelled
 * orders are excluded from revenue. Nothing is computed in the
 * browser beyond choosing the window.
 */
export default function ReportsPage() {
  const [days, setDays] = useState(30);
  const summary = useData((client) => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return client.getReportsSummary({
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }, [days]);

  const data = summary.data;

  return (
    <section>
      <PageHeader title="Reports & Analytics">
        <label className="field">
          Window
          <select
            className="select"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </PageHeader>

      {summary.loading ? <LoadingNote label="Loading report..." /> : null}
      {summary.error ? (
        <ErrorNote error={summary.error} onRetry={summary.reload} />
      ) : null}
      {data ? (
        <>
          <div className="grid" style={{ marginBottom: 20 }}>
            <StatCard label="Orders (not cancelled)" value={String(data.orderCount)} />
            <StatCard label="Revenue" value={formatMinor(data.revenueMinor)} />
            <StatCard
              label="Carts detected abandoned"
              value={String(data.recovery.detected)}
            />
            <StatCard
              label="Recovery rate"
              value={`${data.recovery.recoveryRatePercent}%`}
              note={`${data.recovery.recovered} recovered, worth ${formatMinor(data.recovery.recoveredValueMinor)}`}
            />
          </div>

          <div className="detail-grid">
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Sales by day</h2>
              {data.salesByDay.length === 0 ? (
                <EmptyNote>No sales in this window.</EmptyNote>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th className="num">Orders</th>
                        <th className="num">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salesByDay.map((row) => (
                        <tr key={row.date}>
                          <td>{row.date}</td>
                          <td className="num">{row.orders}</td>
                          <td className="num">
                            {formatMinor(row.revenueMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Top products</h2>
              {data.topProducts.length === 0 ? (
                <EmptyNote>No product sales in this window.</EmptyNote>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="num">Qty</th>
                        <th className="num">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((row) => (
                        <tr key={row.productId}>
                          <td>{row.productName}</td>
                          <td className="num">{row.quantity}</td>
                          <td className="num">
                            {formatMinor(row.revenueMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>
                Delivery zone split
              </h2>
              {data.zoneSplit.length === 0 ? (
                <EmptyNote>No orders in this window.</EmptyNote>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Zone</th>
                        <th className="num">Orders</th>
                        <th className="num">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.zoneSplit.map((row) => (
                        <tr key={row.zone}>
                          <td>{ZONE_LABELS[row.zone] ?? row.zone}</td>
                          <td className="num">{row.orders}</td>
                          <td className="num">
                            {formatMinor(row.revenueMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>
                Payment method split
              </h2>
              {data.paymentSplit.length === 0 ? (
                <EmptyNote>No payments in this window.</EmptyNote>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th className="num">Payments</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.paymentSplit.map((row) => (
                        <tr key={row.method}>
                          <td>{row.method}</td>
                          <td className="num">{row.payments}</td>
                          <td className="num">
                            {formatMinor(row.amountMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>
              Cart recovery performance
            </h2>
            <dl className="kv">
              <dt>Detected</dt>
              <dd>{data.recovery.detected}</dd>
              <dt>Recovered</dt>
              <dd>
                {data.recovery.recovered} (
                {formatMinor(data.recovery.recoveredValueMinor)})
              </dd>
              <dt>Cancelled</dt>
              <dd>{data.recovery.cancelled}</dd>
              <dt>Still in progress</dt>
              <dd>{data.recovery.inProgress}</dd>
            </dl>
          </div>
        </>
      ) : null}
    </section>
  );
}
