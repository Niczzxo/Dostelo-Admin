'use client';

import { use } from 'react';
import Link from 'next/link';
import { RefreshCw, Truck } from 'lucide-react';
import {
  ActionError, Card, ErrorNote, KeyValues, LoadingNote, ModuleHeader, StatusBadge, Timeline,
} from '../../../../components/ui';
import { useAction, useData } from '../../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../../lib/types';

/* Shipment detail: GET /v1/shipping/:id returns the shipment and
   its recorded status history. Refresh asks the courier through
   the API and reports whether anything changed; a not-configured
   courier is shown as such, never as a tracking success. */
export default function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useData((c) => c.getShipment(id), [id]);
  const action = useAction();
  const data = asRec(detail.data);
  const shipment = asRec(data.shipment ?? detail.data);
  const history = itemsOf(data.history ?? data.events);

  return (
    <>
      <ModuleHeader
        icon={Truck}
        title="Shipment detail"
        description="One shipment: courier, tracking identity, status and the recorded status history."
      >
        <Link className="btn secondary" href="/shipping">Back to shipments</Link>
        <button
          type="button"
          className="btn"
          disabled={action.busy}
          onClick={async () => {
            if (await action.run((c) => c.refreshShipment(id))) detail.reload();
          }}
        >
          <RefreshCw size={15} /> Refresh from courier
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={action.busy}
          onClick={async () => {
            if (await action.run((c) => c.gap.bookShipment(id))) detail.reload();
          }}
        >
          Book with courier
        </button>
      </ModuleHeader>
      {detail.loading ? (
        <LoadingNote />
      ) : detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : (
        <>
          <ActionError error={action.error} />
          {data.refreshNote ? <p className="note" role="status">{str(data.refreshNote)}</p> : null}
          <Card title="Shipment">
            <KeyValues
              entries={[
                ['Shipment ID', str(shipment.id)],
                ['Order', str(shipment.orderNumber)],
                ['Courier', str(shipment.courier)],
                ['Tracking ID', str(shipment.trackingId ?? shipment.consignmentId) || 'Not issued yet'],
                ['Status', <StatusBadge key="s" status={shipment.status} />],
                ['Recipient', str(shipment.recipientName)],
                ['Phone', str(shipment.recipientPhone)],
                ['Address', str(shipment.address)],
                ['Created', str(shipment.createdAt)],
              ]}
            />
          </Card>
          <Card title="Status history">
            <Timeline items={history} />
          </Card>
        </>
      )}
    </>
  );
}
