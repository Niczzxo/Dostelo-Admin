'use client';

import { use } from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, KeyValues, LoadingNote,
  ModuleHeader, StatusBadge, Timeline,
} from '../../../../components/ui';
import { formatMinor } from '../../../../lib/api';
import { useAction, useData } from '../../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../../lib/types';

/* Abandoned cart detail: GET /v1/cart-recovery/:id returns the
   recovery, its step attempts and the communication log entries
   those steps produced. A step is marked sent only when the
   provider confirmed it; not-configured attempts stay labelled. */
export default function CartRecoveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useData((c) => c.getAbandonedCart(id), [id]);
  const action = useAction();
  const data = asRec(detail.data);
  const recovery = asRec(data.recovery ?? detail.data);
  const attempts = itemsOf(data.attempts);
  const communications = itemsOf(data.communications);

  return (
    <>
      <ModuleHeader
        icon={ShoppingCart}
        title="Recovery detail"
        description="One abandoned cart: its sequence attempts and the messages the API actually recorded."
      >
        <Link className="btn secondary" href="/cart-recovery">Back to recovery list</Link>
        <button
          type="button"
          className="btn"
          disabled={action.busy}
          onClick={async () => {
            if (await action.run((c) => c.runRecoveryStep(id))) detail.reload();
          }}
        >
          Run next step
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={action.busy}
          onClick={async () => {
            if (await action.run((c) => c.cancelRecovery(id))) detail.reload();
          }}
        >
          Cancel recovery
        </button>
      </ModuleHeader>
      {detail.loading ? (
        <LoadingNote />
      ) : detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : (
        <>
          <ActionError error={action.error} />
          <Card title="Recovery">
            <KeyValues
              entries={[
                ['Recovery ID', str(recovery.id)],
                ['Customer', str(recovery.customerId) || 'Guest session'],
                ['Status', <StatusBadge key="s" status={recovery.status} />],
                ['Cart value', formatMinor(num(recovery.cartValueMinor ?? asRec(recovery.cart).totalMinor))],
                ['Current step', String(recovery.currentStep ?? recovery.step ?? '')],
                ['Detected', str(recovery.detectedAt)],
                ['Recovery token link', recovery.token ? 'Issued by the API (not shown in full)' : 'Not issued'],
              ]}
            />
            <p className="note">
              The recovery link uses the unguessable token the API issued. The token itself is not
              printed here, so cart and customer data cannot leak from this screen.
            </p>
          </Card>
          <Card title="Step attempts">
            <Timeline items={attempts} />
          </Card>
          <Card title="Communications from this recovery">
            <DataTable
              searchable={false}
              emptyText="No messages recorded for this recovery yet."
              columns={[
                { key: 'channel', label: 'Channel' },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'to', label: 'To' },
                { key: 'createdAt', label: 'When', date: true },
              ]}
              rows={communications}
            />
          </Card>
        </>
      )}
    </>
  );
}
