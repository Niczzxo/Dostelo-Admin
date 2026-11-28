'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Play, ScanSearch, ShoppingCart } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, LoadingNote,
  ModuleHeader, StatCard, StatGrid, TextInput,
} from '../../../components/ui';
import { formatMinor } from '../../../lib/api';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../lib/types';

/* Cart Recovery: abandoned carts from GET /v1/cart-recovery, the
   stored recovery settings (PUT /v1/cart-recovery/settings), and
   the scan action. Running a step sends only through the channel
   the customer consented to; when the provider is not configured
   the API records that state and this page shows it as-is. Carts
   whose owner opted out are suppressed by the API and labelled. */
export default function CartRecoveryPage() {
  const carts = useData((c) => c.listAbandonedCarts({}));
  const settings = useData((c) => c.getRecoverySettings());
  const action = useAction();
  const [inactiveMinutes, setInactiveMinutes] = useState('');
  const [scanResult, setScanResult] = useState('');

  const items = itemsOf(carts.data);
  const settingsRec = asRec(settings.data);
  const active = items.filter((r) => ['detected', 'in-sequence', 'queued'].includes(str(r.status)));
  const recovered = items.filter((r) => str(r.status) === 'recovered');
  const suppressed = items.filter((r) => str(r.status) === 'suppressed' || r.suppressed === true);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { ...settingsRec };
    if (inactiveMinutes) dto.inactiveMinutes = Number(inactiveMinutes);
    if (await action.run((c) => c.updateRecoverySettings(dto))) settings.reload();
  }

  return (
    <>
      <ModuleHeader
        icon={ShoppingCart}
        title="Cart Recovery"
        description="Abandoned cart detection and consented recovery sequences. Messages go only to customers who agreed to the channel; opt-outs and frequency caps are enforced by the API."
      >
        <button
          type="button"
          className="btn"
          disabled={action.busy}
          onClick={async () => {
            const result = await action.run(async (c) => {
              const res = asRec(await c.runRecoveryScan());
              setScanResult(`Scan complete: ${num(res.detected)} detected, ${num(res.closed)} closed.`);
            });
            if (result) carts.reload();
          }}
        >
          <ScanSearch size={15} /> Run scan
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      {scanResult ? <p className="note" role="status">{scanResult}</p> : null}
      <StatGrid>
        <StatCard label="Abandoned carts" value={carts.loading ? '...' : String(items.length)} />
        <StatCard label="In sequence" value={String(active.length)} />
        <StatCard label="Recovered" value={String(recovered.length)} />
        <StatCard label="Suppressed" value={String(suppressed.length)} note="Opt-out, invalid contact or frequency cap" />
        <StatCard label="Cart value in list" value={formatMinor(items.reduce((s, r) => s + num(r.cartValueMinor ?? asRec(r.cart).totalMinor), 0))} />
      </StatGrid>

      <Card title="Abandoned carts">
        {carts.loading ? (
          <LoadingNote />
        ) : carts.error ? (
          <ErrorNote error={carts.error} onRetry={carts.reload} />
        ) : (
          <DataTable
            emptyText="No abandoned carts detected yet. Run a scan after the inactivity window passes."
            columns={[
              { key: 'id', label: 'Recovery', render: (r) => <Link href={`/cart-recovery/${str(r.id)}`}>{str(r.id).slice(0, 10)}...</Link> },
              { key: 'customerId', label: 'Customer', render: (r) => str(r.customerId) || 'Guest session' },
              { key: 'status', label: 'Status', render: (r) => <Badge>{str(r.status)}</Badge> },
              { key: 'step', label: 'Step', render: (r) => String(r.currentStep ?? r.step ?? '') },
              { key: 'cartValueMinor', label: 'Cart value', render: (r) => formatMinor(num(r.cartValueMinor ?? asRec(r.cart).totalMinor)) },
              { key: 'detectedAt', label: 'Detected', date: true },
              {
                key: 'run', label: 'Action',
                render: (r) => (
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={action.busy}
                    onClick={async () => {
                      if (await action.run((c) => c.runRecoveryStep(str(r.id)))) carts.reload();
                    }}
                  >
                    <Play size={13} /> Run next step
                  </button>
                ),
              },
            ]}
            rows={items}
          />
        )}
      </Card>

      <Card title="Recovery settings">
        {settings.loading ? (
          <LoadingNote />
        ) : settings.error ? (
          <ErrorNote error={settings.error} onRetry={settings.reload} />
        ) : (
          <form onSubmit={saveSettings}>
            <div className="form-grid">
              <Field label="Inactivity window (minutes)" hint={`(stored: ${str(settingsRec.inactiveMinutes) || 'default'})`}>
                <TextInput type="number" min={1} value={inactiveMinutes} onChange={(e) => setInactiveMinutes(e.target.value)} placeholder={str(settingsRec.inactiveMinutes)} />
              </Field>
              <Field label="Stored steps">
                <TextInput readOnly value={Array.isArray(settingsRec.steps) ? `${settingsRec.steps.length} steps stored` : 'As returned by the API'} />
              </Field>
              <Field label="Frequency cap">
                <TextInput readOnly value={str(settingsRec.frequencyCap ?? settingsRec.maxAttempts ?? '')} />
              </Field>
            </div>
            <p className="note">
              The full stored settings object is sent back unchanged apart from the inactivity
              window, so no stored step or suppression rule is lost by editing here.
            </p>
            <button type="submit" className="btn" disabled={action.busy}>Save settings</button>
          </form>
        )}
      </Card>
    </>
  );
}
