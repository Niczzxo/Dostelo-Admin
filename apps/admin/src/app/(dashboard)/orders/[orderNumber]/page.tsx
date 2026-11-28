'use client';

import { use, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, Field, KeyValues, LoadingNote,
  ModuleHeader, SelectInput, StatusBadge, TextInput, Timeline,
} from '../../../../components/ui';
import { moneyOf } from '../../../../lib/api';
import { useAction, useData } from '../../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../../lib/types';

/* Order detail: GET /v1/admin/orders/:orderNumber returns the
   order, its status history and the legal next states from the
   API flow policy. The transition form offers only those allowed
   transitions and posts to POST /v1/orders/:orderNumber/status.
   Totals and payment state are read from the order record; this
   page never marks an order paid, because payment verification
   lives in Payments & Finance against a real payment record. */
export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = use(params);
  const detail = useData((c) => c.getStaffOrder(orderNumber), [orderNumber]);
  const action = useAction();
  const [nextStatus, setNextStatus] = useState('');
  const [note, setNote] = useState('');

  const data = asRec(detail.data);
  const order = asRec(data.order ?? detail.data);
  const events = itemsOf(data.events);
  const allowed = Array.isArray(data.allowedTransitions) ? data.allowedTransitions.map((s) => str(s)) : [];
  const lines = itemsOf(order.lines ?? order.items);
  const address = asRec(order.address ?? order.shippingAddress);

  async function transition(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { status: nextStatus };
    if (note) dto.note = note;
    if (await action.run((c) => c.transitionOrderStatus(orderNumber, dto))) detail.reload();
  }

  return (
    <>
      <ModuleHeader
        icon={ClipboardList}
        title={`Order ${orderNumber}`}
        description="Order detail, lines, address, status history and the transitions the API flow policy allows."
      >
        <Link className="btn secondary" href="/orders">Back to orders</Link>
      </ModuleHeader>
      {detail.loading ? (
        <LoadingNote />
      ) : detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : (
        <>
          <ActionError error={action.error} />
          <Card title="Order">
            <KeyValues
              entries={[
                ['Order number', str(order.orderNumber)],
                ['Status', <StatusBadge key="s" status={order.status} />],
                ['Payment state', <StatusBadge key="p" status={order.paymentStatus ?? asRec(order.payment).status} />],
                ['Payment method', str(order.paymentMethod ?? asRec(order.payment).method)],
                ['Subtotal', moneyOf(order.subtotal)],
                ['Delivery fee', moneyOf(order.deliveryFee)],
                ['Discount', moneyOf(order.discount)],
                ['Total (server)', moneyOf(order.total)],
                ['Delivery zone', str(order.deliveryZone ?? order.zone)],
                ['Placed', str(order.createdAt)],
              ]}
            />
          </Card>
          <div className="section-grid">
            <Card title="Delivery address">
              <KeyValues
                entries={[
                  ['Name', str(address.name ?? order.customerName)],
                  ['Phone', str(address.phone)],
                  ['Address', str(address.line ?? address.address ?? address.street)],
                  ['Area', str(address.area)],
                  ['City', str(address.city)],
                  ['Note', str(order.note ?? address.note)],
                ]}
              />
            </Card>
            <Card title="Move the order">
              {allowed.length === 0 ? (
                <p className="note">The API allows no further transitions for this order state.</p>
              ) : (
                <form onSubmit={transition}>
                  <Field label="Next status (allowed by the API flow policy)">
                    <SelectInput required value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                      <option value="">Select a status</option>
                      {allowed.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Note (optional)">
                    <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                  <button type="submit" className="btn" disabled={action.busy}>Apply transition</button>
                </form>
              )}
            </Card>
          </div>
          <Card title="Lines">
            <DataTable
              searchable={false}
              emptyText="No lines recorded on this order."
              columns={[
                { key: 'title', label: 'Product', render: (r) => str(r.title ?? r.name ?? r.productId) },
                { key: 'variant', label: 'Variant', render: (r) => str(r.variantLabel ?? r.size ?? r.variantId) },
                { key: 'quantity', label: 'Qty' },
                { key: 'unitPrice', label: 'Unit price', money: true },
                { key: 'lineTotal', label: 'Line total', money: true },
              ]}
              rows={lines}
            />
          </Card>
          <Card title="Status history">
            <Timeline items={events} />
          </Card>
        </>
      )}
    </>
  );
}
