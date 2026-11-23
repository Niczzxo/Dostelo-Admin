'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  COURIERS,
  COURIER_LABELS,
  SHIPMENT_STATUSES,
  SHIPMENT_STATUS_LABELS,
  type Courier,
  type ShipmentStatus,
} from '@dostelo/types';
import {
  api,
  formatDateTime,
  formatMinor,
  toUiError,
} from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Shipping and Courier list (Phase 6, chunk 2). Shipments are
 * booked from an order number; the recipient and the COD amount
 * come from the order itself. A courier without merchant
 * credentials records the shipment as not-configured with the
 * missing variables named and no tracking id: nothing is shown
 * as booked that was not booked.
 */
export default function ShippingPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('shipping.edit');

  const [courier, setCourier] = useState<Courier | ''>('');
  const [status, setStatus] = useState<ShipmentStatus | ''>('');

  const list = useData(
    (client) =>
      client.listShipments({
        courier: courier || undefined,
        status: status || undefined,
      }),
    [courier, status],
  );

  return (
    <section>
      <PageHeader title="Shipping & Courier" />
      <p className="note muted" style={{ marginTop: 0 }}>
        Booking is honest: a shipment reaches a courier status
        only when the courier confirmed it. Without the courier's
        merchant credentials the shipment is recorded as not
        configured, with no tracking id.
      </p>

      <div className="toolbar">
        <label className="field">
          Courier
          <select
            className="select"
            value={courier}
            onChange={(event) => setCourier(event.target.value as Courier | '')}
          >
            <option value="">All couriers</option>
            {COURIERS.map((value) => (
              <option key={value} value={value}>
                {COURIER_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ShipmentStatus | '')
            }
          >
            <option value="">All statuses</option>
            {SHIPMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SHIPMENT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.loading ? <LoadingNote label="Loading shipments..." /> : null}
      {list.error ? (
        <ErrorNote error={list.error} onRetry={list.reload} />
      ) : null}
      {list.data && list.data.items.length === 0 ? (
        <EmptyNote>
          No shipments match this filter yet. Book the first one
          from an order number below.
        </EmptyNote>
      ) : null}
      {list.data && list.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Order</th>
                <th>Courier</th>
                <th>Status</th>
                <th>Tracking id</th>
                <th>Recipient</th>
                <th>COD to collect</th>
                <th>Booked</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((shipment) => (
                <tr key={shipment.id}>
                  <td>
                    <Link href={`/shipping/${shipment.id}`}>
                      {shipment.orderNumber}
                    </Link>
                  </td>
                  <td>{COURIER_LABELS[shipment.courier]}</td>
                  <td>
                    <Badge>
                      {SHIPMENT_STATUS_LABELS[shipment.status]}
                    </Badge>
                    {shipment.status === 'not-configured' &&
                    shipment.notConfiguredReason ? (
                      <div className="muted">
                        {shipment.notConfiguredReason}
                      </div>
                    ) : null}
                  </td>
                  <td>{shipment.trackingId ?? 'None'}</td>
                  <td>
                    {shipment.recipientName}
                    <div className="muted">{shipment.recipientPhone}</div>
                  </td>
                  <td className="num">
                    {formatMinor(shipment.codAmount.amountMinor)}
                  </td>
                  <td>{formatDateTime(shipment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="card section-gap">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Book a shipment</h2>
        {canEdit ? (
          <CreateShipmentForm onCreated={list.reload} />
        ) : (
          <p className="note muted">
            Booking a shipment needs the shipping.edit permission.
          </p>
        )}
      </div>
    </section>
  );
}

function CreateShipmentForm({ onCreated }: { onCreated: () => void }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [courier, setCourier] = useState<Courier>('pathao');
  const [weightKg, setWeightKg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const number = orderNumber.trim();
    if (!number) return;
    const weight = weightKg.trim() === '' ? NaN : Number(weightKg);
    if (weightKg.trim() !== '' && (!Number.isFinite(weight) || weight <= 0)) {
      setError('Weight must be a positive number of kilograms.');
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const shipment = await api.createShipment({
        orderNumber: number,
        courier,
        weightKg: Number.isFinite(weight) ? weight : undefined,
      });
      if (shipment.status === 'not-configured') {
        setNote(
          `Recorded as not configured: ${shipment.notConfiguredReason ?? 'the courier has no credentials in this environment.'} No tracking id was created.`,
        );
      } else if (shipment.status === 'failed') {
        setNote(
          'The courier did not confirm this booking. The shipment is recorded as failed with the courier answer in its history.',
        );
      } else {
        setNote(
          `Booked with ${COURIER_LABELS[shipment.courier]}, tracking id ${shipment.trackingId}.`,
        );
      }
      setOrderNumber('');
      setWeightKg('');
      onCreated();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="field" style={{ marginTop: 0 }}>
        Order number
        <input
          className="input"
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          placeholder="BP-000000"
        />
      </label>
      <label className="field">
        Courier
        <select
          className="select"
          value={courier}
          onChange={(event) => setCourier(event.target.value as Courier)}
        >
          {COURIERS.map((value) => (
            <option key={value} value={value}>
              {COURIER_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Weight in kg (optional, defaults to 0.5)
        <input
          className="input"
          type="number"
          min={0}
          step="0.1"
          value={weightKg}
          onChange={(event) => setWeightKg(event.target.value)}
        />
      </label>
      <p className="note muted">
        Only confirmed, processing, packed or ready-to-ship
        orders can be booked. The recipient name, phone, address
        and COD amount are taken from the order.
      </p>
      <button
        type="submit"
        className="btn"
        disabled={busy || !orderNumber.trim()}
      >
        {busy ? 'Booking...' : 'Book shipment'}
      </button>
      {note ? <p className="note">{note}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
