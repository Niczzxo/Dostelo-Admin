'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  COURIER_LABELS,
  SHIPMENT_STATUS_LABELS,
} from '@dostelo/types';
import {
  api,
  formatDateTime,
  formatMinor,
  toUiError,
} from '../../../../lib/api';
import { useData } from '../../../../lib/use-data';
import { expireSession } from '../../../../lib/session';
import { useAuth } from '../../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../../components/ui';

/**
 * Shipment detail (Phase 6, chunk 2): the booking record, the
 * recipient and COD snapshot taken from the order, and the full
 * status history with the courier's raw wording preserved.
 * Staff holding shipping.edit can refresh the status from the
 * courier; the refresh answer is shown honestly, including when
 * there is no tracking id to ask about or the courier is not
 * configured. Courier updates move the linked order only
 * through the orders service's legal transitions.
 */
export default function ShipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const shipmentId = params.id;
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('shipping.edit');

  const detail = useData((client) => client.getShipment(shipmentId), [
    shipmentId,
  ]);
  const shipment = detail.data?.shipment;
  const events = detail.data?.events ?? [];

  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    if (!shipment) return;
    setRefreshing(true);
    setError(null);
    setRefreshNote(null);
    try {
      const result = await api.refreshShipment(shipment.id);
      setRefreshNote(
        result.refreshed
          ? `Status updated: the courier now reports ${result.shipment.lastRawStatus ?? result.shipment.status}.`
          : (result.refreshNote ?? 'The courier reported no change.'),
      );
      detail.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section>
      <PageHeader
        title={shipment ? `Shipment for ${shipment.orderNumber}` : 'Shipment'}
      >
        <Link href="/shipping">Back to shipments</Link>
      </PageHeader>

      {detail.loading ? <LoadingNote label="Loading shipment..." /> : null}
      {detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : null}

      {shipment ? (
        <>
          {shipment.status === 'not-configured' ? (
            <p className="note error-note" role="alert">
              This courier is not configured in this environment.{' '}
              {shipment.notConfiguredReason ?? ''} The shipment was
              recorded for the audit trail only: no parcel was
              booked and no tracking id exists.
            </p>
          ) : null}

          <div className="detail-grid">
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Shipment</h2>
              <dl className="kv">
                <dt>Order</dt>
                <dd>
                  <Link href={`/orders/${shipment.orderNumber}`}>
                    {shipment.orderNumber}
                  </Link>
                </dd>
                <dt>Courier</dt>
                <dd>{COURIER_LABELS[shipment.courier]}</dd>
                <dt>Status</dt>
                <dd>
                  <Badge>{SHIPMENT_STATUS_LABELS[shipment.status]}</Badge>
                </dd>
                <dt>Tracking id</dt>
                <dd>{shipment.trackingId ?? 'None'}</dd>
                <dt>Last courier status</dt>
                <dd>{shipment.lastRawStatus ?? 'Not reported yet'}</dd>
                <dt>COD to collect</dt>
                <dd>{formatMinor(shipment.codAmount.amountMinor)}</dd>
                <dt>Weight</dt>
                <dd>{shipment.weightKg} kg</dd>
                <dt>Booked</dt>
                <dd>{formatDateTime(shipment.createdAt)}</dd>
                <dt>Updated</dt>
                <dd>{formatDateTime(shipment.updatedAt)}</dd>
              </dl>
            </div>

            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Recipient</h2>
              <dl className="kv">
                <dt>Name</dt>
                <dd>{shipment.recipientName}</dd>
                <dt>Phone</dt>
                <dd>{shipment.recipientPhone}</dd>
                <dt>Address</dt>
                <dd>{shipment.recipientAddress}</dd>
              </dl>

              <h2 style={{ fontSize: 16, marginTop: 16 }}>
                Refresh from courier
              </h2>
              {canEdit ? (
                <button
                  type="button"
                  className="btn"
                  disabled={refreshing}
                  onClick={refresh}
                >
                  {refreshing ? 'Asking the courier...' : 'Refresh status'}
                </button>
              ) : (
                <p className="note muted">
                  Refreshing a status needs the shipping.edit
                  permission.
                </p>
              )}
              {refreshNote ? <p className="note">{refreshNote}</p> : null}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          <div className="card section-gap">
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Status history</h2>
            {events.length === 0 ? (
              <EmptyNote>No status events recorded yet.</EmptyNote>
            ) : (
              <ul className="timeline">
                {events.map((event) => (
                  <li key={event.id}>
                    <div>
                      <Badge>{SHIPMENT_STATUS_LABELS[event.status]}</Badge>{' '}
                      <span className="muted">via {event.source}</span>
                    </div>
                    {event.rawStatus ? (
                      <div>Courier reported: {event.rawStatus}</div>
                    ) : null}
                    {event.note ? <div>{event.note}</div> : null}
                    <div className="when">
                      {formatDateTime(event.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
