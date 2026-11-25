'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Gauge, ListOrdered, UserSearch } from 'lucide-react';
import { IDENTITY_STATUS_LABELS } from '@dostelo/types';
import { formatDateTime, formatMinor } from '../../../../lib/api';
import { useData } from '../../../../lib/use-data';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  ModuleHeader,
  ScoreBand,
} from '../../../../components/ui';

/**
 * Buyer Intelligence session detail (Phase 5): the full event
 * timeline for one session and the lead score breakdown, signal
 * by signal, exactly as the API computed them. The breakdown is
 * the transparency rule in the UI: staff can always see why a
 * session scored what it scored. No contact details exist at
 * this level by design; contact happens through a lead, where
 * the basis is recorded.
 *
 * Redesign note: this page keeps its original logic and data;
 * only the presentation moved into the shared card language
 * (ModuleHeader, cards with CardHead, ScoreBand).
 */

const BREAKDOWN_LABELS: Array<{
  key: 'recency' | 'productViews' | 'repeatSessions' | 'cartValue' | 'checkoutProgress';
  label: string;
  hint: string;
}> = [
  {
    key: 'recency',
    label: 'Recency of last activity',
    hint: 'Within 24 hours +25, within 7 days +15, within 30 days +5.',
  },
  {
    key: 'productViews',
    label: 'Product views',
    hint: '+4 per product view, up to +20.',
  },
  {
    key: 'repeatSessions',
    label: 'Repeat sessions',
    hint: '+5 per session of this visitor beyond the first, up to +10.',
  },
  {
    key: 'cartValue',
    label: 'Cart value',
    hint: 'Highest cart value seen: 2000 taka or more +25, 1000 or more +18, 500 or more +10, any +5.',
  },
  {
    key: 'checkoutProgress',
    label: 'Checkout progress',
    hint: 'Checkout started +15, checkout step reached +10.',
  },
];

function payloadText(payload: Record<string, unknown> | null): string | null {
  if (!payload || Object.keys(payload).length === 0) return null;
  return Object.entries(payload)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

export default function BuyerSessionDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = decodeURIComponent(params.sessionId);

  const detail = useData((client) => client.getBuyerSession(sessionId), [
    sessionId,
  ]);
  const session = detail.data;

  return (
    <section>
      <ModuleHeader
        icon={UserSearch}
        title="Session detail"
        description="One tracked session: its recorded identity, score breakdown and full event timeline."
      >
        <Link className="btn-secondary btn-small" href="/buyer-intelligence">
          Back to sessions
        </Link>
      </ModuleHeader>

      {detail.loading ? <LoadingNote label="Loading session..." /> : null}
      {detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : null}

      {session ? (
        <>
          <div className="detail-grid">
            <div className="card">
              <CardHead icon={UserSearch} title="Session" />
              <dl className="kv">
                <dt>Identity status</dt>
                <dd>
                  <Badge>
                    {IDENTITY_STATUS_LABELS[session.identityStatus]}
                  </Badge>
                </dd>
                <dt>Visitor id</dt>
                <dd>{session.visitorId}</dd>
                <dt>Session id</dt>
                <dd>{session.sessionId}</dd>
                <dt>Customer</dt>
                <dd>
                  {session.customerId ? (
                    <Link href={`/crm/${session.customerId}`}>
                      View CRM profile
                    </Link>
                  ) : (
                    'Not linked'
                  )}
                </dd>
                <dt>First seen</dt>
                <dd>{formatDateTime(session.firstSeenAt)}</dd>
                <dt>Last activity</dt>
                <dd>{formatDateTime(session.lastSeenAt)}</dd>
                <dt>Events</dt>
                <dd>{session.eventCount}</dd>
                <dt>Latest cart value</dt>
                <dd>
                  {session.cartValueMinor > 0
                    ? formatMinor(session.cartValueMinor)
                    : 'None recorded'}
                </dd>
                <dt>Marketing use</dt>
                <dd>
                  {session.marketingUsable
                    ? 'Usable (marketing consent not denied)'
                    : 'Operational only (marketing consent denied)'}
                </dd>
              </dl>
            </div>
            <div className="card">
              <CardHead
                icon={Gauge}
                title={`Lead score: ${session.leadScore} (${session.leadBand})`}
              />
              <div style={{ marginBottom: 10 }}>
                <ScoreBand score={session.leadScore} />
              </div>
              <dl className="kv">
                {BREAKDOWN_LABELS.map(({ key, label, hint }) => (
                  <div key={key} style={{ display: 'contents' }}>
                    <dt>{label}</dt>
                    <dd>
                      <strong>+{session.scoreBreakdown[key]}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {hint}
                      </div>
                    </dd>
                  </div>
                ))}
                <dt>Total</dt>
                <dd>
                  <strong>{session.leadScore}</strong> of 100 (capped)
                </dd>
              </dl>
            </div>
          </div>

          <div className="card section-gap">
            <CardHead icon={ListOrdered} title="Event timeline" />
            {session.events.length === 0 ? (
              <EmptyNote>No events recorded for this session.</EmptyNote>
            ) : (
              <ul className="timeline">
                {session.events.map((event) => {
                  const payload = payloadText(event.payload);
                  return (
                    <li key={event.id}>
                      <div>
                        <Badge>{event.type}</Badge>
                      </div>
                      {event.path ? <div>{event.path}</div> : null}
                      {payload ? <div>{payload}</div> : null}
                      <div className="when">
                        {formatDateTime(event.occurredAt)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
