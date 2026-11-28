'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Plus, Truck } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, Field, LoadingNote, Modal,
  ModuleHeader, SelectInput, StatCard, StatGrid, StatusBadge, TextInput, Unavailable,
} from '../../../components/ui';
import { formatMinor } from '../../../lib/api';
import { useAction, useData } from '../../../lib/use-data';
import { itemsOf, num, str } from '../../../lib/types';

/* Shipping & Courier: shipments from GET /v1/shipping for Pathao,
   Steadfast and RedX, creation, automatic booking, the exception
   task queue and courier COD settlements. Booking and tracking
   answers come from the courier through the API; with no courier
   account configured the API records not-configured and this page
   shows that state instead of a fake tracking result. */
export default function ShippingPage() {
  const shipments = useData((c) => c.listShipments({}));
  const exceptions = useData((c) => c.gap.listShipmentExceptions());
  const cod = useData((c) => c.gap.listCodSettlements());
  const action = useAction();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ orderNumber: '', courier: 'pathao', recipientName: '', recipientPhone: '', address: '' });

  const items = itemsOf(shipments.data);
  const exceptionItems = exceptions.data ? itemsOf(exceptions.data) : [];
  const codItems = cod.data ? itemsOf(cod.data) : [];

  async function create(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.createShipment(form))) {
      setCreating(false);
      shipments.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Truck}
        title="Shipping & Courier"
        description="Courier shipments, automatic booking, delivery exceptions and courier COD settlements. Courier answers are shown exactly as the API records them."
      >
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          <Plus size={15} /> New shipment
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Shipments" value={shipments.loading ? '...' : String(items.length)} />
        <StatCard label="In transit" value={String(items.filter((r) => ['in-transit', 'in_transit', 'shipped'].includes(str(r.status))).length)} />
        <StatCard label="Delivered" value={String(items.filter((r) => str(r.status) === 'delivered').length)} />
        <StatCard label="Exceptions open" value={exceptions.data === null ? 'Unavailable' : String(exceptionItems.length)} />
      </StatGrid>

      <Card title="Exception task queue">
        {exceptions.loading ? (
          <LoadingNote />
        ) : exceptions.data === null ? (
          <Unavailable title="The exception queue is not available on the running API yet.">
            This panel needs GET /v1/shipping/exceptions. Failed deliveries and address problems
            will land here as tasks when the API provides them; nothing is queued by hand.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No open delivery exceptions."
            columns={[
              { key: 'shipmentId', label: 'Shipment' },
              { key: 'reason', label: 'Reason' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'assigneeId', label: 'Assignee' },
              { key: 'createdAt', label: 'Raised', date: true },
            ]}
            rows={exceptionItems}
          />
        )}
      </Card>

      <Card title="Shipments">
        {shipments.loading ? (
          <LoadingNote />
        ) : shipments.error ? (
          <ErrorNote error={shipments.error} onRetry={shipments.reload} />
        ) : (
          <DataTable
            emptyText="No shipments yet. Create one for a confirmed order."
            columns={[
              { key: 'id', label: 'Shipment', render: (r) => <Link href={`/shipping/${str(r.id)}`}>{str(r.id).slice(0, 12)}...</Link> },
              { key: 'orderNumber', label: 'Order', render: (r) => <Link href={`/orders/${str(r.orderNumber)}`}>{str(r.orderNumber)}</Link> },
              { key: 'courier', label: 'Courier' },
              { key: 'trackingId', label: 'Tracking', render: (r) => str(r.trackingId ?? r.consignmentId) || 'Not issued yet' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'book', label: 'Booking',
                render: (r) => (
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={action.busy}
                    onClick={async () => {
                      const res = await action.run((c) => c.gap.bookShipment(str(r.id)));
                      if (res) shipments.reload();
                    }}
                  >
                    Book with courier
                  </button>
                ),
              },
              { key: 'createdAt', label: 'Created', date: true },
            ]}
            rows={items}
          />
        )}
        <p className="note">
          Book with courier asks the API to place the booking automatically. Until a courier
          account exists, the API answers not-configured and the shipment keeps that honest state.
        </p>
      </Card>

      <Card title="Courier COD settlements">
        {cod.loading ? (
          <LoadingNote />
        ) : cod.data === null ? (
          <Unavailable title="Courier COD settlements are not available on the running API yet.">
            This panel needs GET /v1/shipping/cod-settlements. Cash collected by couriers is only
            shown when the API has a settlement record for it.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No courier COD settlements recorded yet."
            columns={[
              { key: 'courier', label: 'Courier' },
              { key: 'period', label: 'Period' },
              { key: 'collectedMinor', label: 'Collected', render: (r) => formatMinor(num(r.collectedMinor)) },
              { key: 'feeMinor', label: 'Courier fee', render: (r) => formatMinor(num(r.feeMinor)) },
              { key: 'payableMinor', label: 'Payable', render: (r) => formatMinor(num(r.payableMinor)) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            rows={codItems}
          />
        )}
      </Card>

      {creating ? (
        <Modal title="New shipment" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="Order number">
                <TextInput required value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} />
              </Field>
              <Field label="Courier">
                <SelectInput value={form.courier} onChange={(e) => setForm({ ...form, courier: e.target.value })}>
                  <option value="pathao">Pathao</option>
                  <option value="steadfast">Steadfast</option>
                  <option value="redx">RedX</option>
                </SelectInput>
              </Field>
              <Field label="Recipient name">
                <TextInput required value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
              </Field>
              <Field label="Recipient phone">
                <TextInput required value={form.recipientPhone} onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })} />
              </Field>
            </div>
            <Field label="Address">
              <TextInput required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Create shipment</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
