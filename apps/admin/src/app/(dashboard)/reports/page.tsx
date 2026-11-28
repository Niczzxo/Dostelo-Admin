'use client';

import { useState, type FormEvent } from 'react';
import { BarChart3, Download, Plus } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, Field, LoadingNote, Modal,
  ModuleHeader, SelectInput, StatCard, StatGrid, TextInput, Unavailable,
} from '../../../components/ui';
import { ValueBars } from '../../../components/charts';
import { downloadCsv, downloadJson } from '../../../lib/csv';
import { formatMinor } from '../../../lib/api';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../lib/types';

/* Reports & Analytics: the live summary from
   GET /v1/admin/reports/summary (sales by day, top products,
   delivery zone split, payment method split, recovery
   performance), profit computed from real cost and order data,
   and saved custom reports that can be created, scheduled, run
   and downloaded. Profit coverage is stated honestly: orders
   whose products carry no cost price are counted and named as
   uncovered, and profit is never estimated for them. */
export default function ReportsPage() {
  const summary = useData((c) => c.getReportsSummary());
  const profit = useData((c) => c.gap.getProfitReport());
  const saved = useData((c) => c.gap.listSavedReports());
  const action = useAction();
  const [showSave, setShowSave] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: '', type: 'sales', schedule: '' });

  const rec = asRec(summary.data);
  const salesByDay = itemsOf(rec.salesByDay ?? rec.dailySales);
  const topProducts = itemsOf(rec.topProducts);
  const zones = itemsOf(rec.zoneSplit ?? rec.deliveryZones);
  const methods = itemsOf(rec.paymentSplit ?? rec.paymentMethods);
  const recovery = asRec(rec.recovery ?? rec.cartRecovery);
  const profitRec = asRec(profit.data);
  const savedItems = saved.data ? itemsOf(saved.data) : [];

  const revenue = salesByDay.reduce((s, r) => s + num(r.totalMinor ?? r.revenueMinor ?? r.total), 0);
  const profitKnown = profit.data !== null && profit.data !== undefined;
  const costCoverage = num(profitRec.costCoveragePercent ?? profitRec.coveragePercent);

  async function saveReport(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { name: saveForm.name, type: saveForm.type };
    if (saveForm.schedule) dto.schedule = saveForm.schedule;
    if (await action.run((c) => c.gap.saveReport(dto))) {
      setShowSave(false);
      saved.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={BarChart3}
        title="Reports & Analytics"
        description="Live aggregates from orders, payments and recovery, profit from real cost data with its coverage stated, and saved custom reports."
      >
        <button
          type="button"
          className="btn secondary"
          disabled={salesByDay.length === 0}
          onClick={() => downloadCsv('dostelo-sales-by-day.csv', salesByDay, ['date', 'totalMinor', 'orderCount'])}
        >
          <Download size={15} /> Export sales CSV
        </button>
        <button type="button" className="btn" onClick={() => setShowSave(true)}>
          <Plus size={15} /> Save a report
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Revenue in loaded summary" value={summary.loading ? '...' : formatMinor(revenue)} note="Summed from the daily sales the API returned" />
        <StatCard
          label="Gross profit"
          value={profitKnown ? formatMinor(num(profitRec.grossProfitMinor ?? profitRec.profitMinor)) : 'Unavailable'}
          note={profitKnown ? `Cost coverage ${costCoverage}% of order value` : 'Needs GET /v1/admin/reports/profit on the running API'}
        />
        <StatCard
          label="Orders without cost data"
          value={profitKnown ? String(num(profitRec.ordersMissingCost ?? profitRec.uncoveredOrders)) : 'Unknown'}
          note="Profit is not estimated for these; add cost prices in Products"
        />
        <StatCard label="Saved reports" value={saved.data === null ? 'Unavailable' : String(savedItems.length)} />
      </StatGrid>

      <Card title="Profit from real cost and order data">
        {profit.loading ? (
          <LoadingNote />
        ) : !profitKnown ? (
          <Unavailable title="The profit report is not available on the running API yet.">
            This panel needs GET /v1/admin/reports/profit, computed server-side from order lines
            and the cost price stored on each product. This page does not compute a substitute
            profit figure from selling prices alone.
          </Unavailable>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-label">Revenue</div><div className="stat-value">{formatMinor(num(profitRec.revenueMinor))}</div></div>
              <div className="stat-card"><div className="stat-label">Cost of goods</div><div className="stat-value">{formatMinor(num(profitRec.costMinor))}</div></div>
              <div className="stat-card"><div className="stat-label">Gross profit</div><div className="stat-value">{formatMinor(num(profitRec.grossProfitMinor ?? profitRec.profitMinor))}</div></div>
              <div className="stat-card"><div className="stat-label">Cost coverage</div><div className="stat-value">{costCoverage}%</div><div className="stat-note">Share of order value whose products carry a cost price</div></div>
            </div>
            <p className="note">
              Coverage note: {num(profitRec.ordersMissingCost ?? profitRec.uncoveredOrders)} orders
              in this period include products with no cost price stored, so the profit above covers
              only the costed share. Add cost prices in Products to close the gap; the uncovered
              share is excluded, never guessed.
            </p>
          </>
        )}
      </Card>

      {summary.loading ? (
        <LoadingNote />
      ) : summary.error ? (
        <ErrorNote error={summary.error} onRetry={summary.reload} />
      ) : (
        <>
          <div className="section-grid">
            <Card title="Sales by day">
              <ValueBars
                rows={salesByDay.map((d) => ({ label: str(d.date ?? d.day), value: num(d.totalMinor ?? d.revenueMinor ?? d.total) }))}
                format={(v) => formatMinor(v)}
              />
            </Card>
            <Card title="Delivery zone split">
              <ValueBars rows={zones.map((z) => ({ label: str(z.key ?? z.zone), value: num(z.count ?? z.orders ?? z.totalMinor) }))} />
            </Card>
            <Card title="Payment method split">
              <ValueBars rows={methods.map((m) => ({ label: str(m.key ?? m.method), value: num(m.totalMinor ?? m.count) }))} format={(v) => formatMinor(v)} />
            </Card>
            <Card title="Cart recovery performance">
              <ValueBars
                rows={[
                  { label: 'Detected', value: num(recovery.detected) },
                  { label: 'Recovered', value: num(recovery.recovered) },
                  { label: 'Suppressed', value: num(recovery.suppressed) },
                ]}
              />
            </Card>
          </div>
          <Card title="Top products">
            <DataTable
              searchable={false}
              emptyText="No product sales in this period."
              columns={[
                { key: 'title', label: 'Product', render: (r) => str(r.title ?? r.name ?? r.productId) },
                { key: 'units', label: 'Units', render: (r) => String(num(r.units ?? r.quantity)) },
                { key: 'revenueMinor', label: 'Revenue', render: (r) => formatMinor(num(r.revenueMinor ?? r.totalMinor)) },
              ]}
              rows={topProducts}
            />
          </Card>
        </>
      )}

      <Card title="Saved custom reports">
        {saved.loading ? (
          <LoadingNote />
        ) : saved.data === null ? (
          <Unavailable title="Saved reports are not available on the running API yet.">
            Creating, scheduling and running saved reports needs GET and POST
            /v1/admin/reports/saved. The live summary above works without them.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No saved reports yet. Save the first one with the button above."
            columns={[
              { key: 'name', label: 'Report' },
              { key: 'type', label: 'Type' },
              { key: 'schedule', label: 'Schedule', render: (r) => str(r.schedule) || 'Manual only' },
              { key: 'lastRunAt', label: 'Last run', date: true },
              {
                key: 'run', label: 'Actions',
                render: (r) => (
                  <span className="btn-row">
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={action.busy}
                      onClick={async () => {
                        await action.run(async (c) => {
                          const result = await c.gap.runSavedReport(str(r.id));
                          if (result) downloadJson(`report-${str(r.id)}.json`, result);
                          saved.reload();
                        });
                      }}
                    >
                      Run and download
                    </button>
                  </span>
                ),
              },
            ]}
            rows={savedItems}
          />
        )}
      </Card>

      {showSave ? (
        <Modal title="Save a custom report" onClose={() => setShowSave(false)}>
          <form onSubmit={saveReport}>
            <ActionError error={action.error} />
            <Field label="Report name">
              <TextInput required value={saveForm.name} onChange={(e) => setSaveForm({ ...saveForm, name: e.target.value })} placeholder="Weekly zone sales" />
            </Field>
            <div className="form-grid">
              <Field label="Report type">
                <SelectInput value={saveForm.type} onChange={(e) => setSaveForm({ ...saveForm, type: e.target.value })}>
                  <option value="sales">Sales</option>
                  <option value="profit">Profit</option>
                  <option value="products">Products</option>
                  <option value="payments">Payments</option>
                  <option value="recovery">Cart recovery</option>
                </SelectInput>
              </Field>
              <Field label="Schedule (optional)">
                <SelectInput value={saveForm.schedule} onChange={(e) => setSaveForm({ ...saveForm, schedule: e.target.value })}>
                  <option value="">Manual only</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </SelectInput>
              </Field>
            </div>
            <p className="note">
              A scheduled report runs on the API scheduler and keeps its results for download here.
              The schedule is stored on the report; this browser does not run it.
            </p>
            <button type="submit" className="btn" disabled={action.busy}>Save report</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
