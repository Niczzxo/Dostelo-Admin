'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IDENTITY_STATUSES,
  IDENTITY_STATUS_LABELS,
  type IdentityStatus,
} from '@dostelo/types';
import { formatDateTime, formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Buyer Intelligence session list (Phase 5). Every row is one
 * tracked storefront session, exactly as the API reports it:
 * the recorded identity status (never inferred from behaviour),
 * the transparent lead score with its band, event counts, the
 * latest cart value and last activity. A session whose visitor
 * denied marketing consent is flagged operational-only. Clicking
 * a row opens the session detail with the event timeline and
 * the score breakdown.
 */
export default function BuyerIntelligencePage() {
  const router = useRouter();
  const [status, setStatus] = useState<IdentityStatus | ''>('');
  const [minScoreText, setMinScoreText] = useState('');
  const parsedMin = minScoreText.trim() === '' ? NaN : Number(minScoreText);
  const minScore =
    Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : undefined;

  const { data, error, loading, reload } = useData(
    (client) =>
      client.listBuyerSessions({
        status: status || undefined,
        minScore,
      }),
    [status, minScore],
  );

  return (
    <section>
      <PageHeader title="Buyer Intelligence" />
      <p className="note muted" style={{ marginTop: 0 }}>
        Identity is shown exactly as recorded through an
        authenticated or consented flow. A high score never turns
        an anonymous session into a known buyer.
      </p>
      <div className="toolbar">
        <label className="field">
          Identity status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as IdentityStatus | '')
            }
          >
            <option value="">All statuses</option>
            {IDENTITY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {IDENTITY_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Minimum lead score
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={minScoreText}
            onChange={(event) => setMinScoreText(event.target.value)}
            placeholder="Any"
            style={{ width: 110 }}
          />
        </label>
      </div>

      {loading ? <LoadingNote label="Loading sessions..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyNote>
          No tracked sessions match these filters yet. Sessions
          appear here once the storefront tracker records visitor
          activity.
        </EmptyNote>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Identity</th>
                <th>Lead score</th>
                <th className="num">Events</th>
                <th className="num">Product views</th>
                <th className="num">Cart value</th>
                <th>Last activity</th>
                <th>Marketing</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((session) => (
                <tr
                  key={session.sessionId}
                  onClick={() =>
                    router.push(
                      `/buyer-intelligence/${encodeURIComponent(session.sessionId)}`,
                    )
                  }
                  style={{ cursor: 'pointer' }}
                  title="Open session detail"
                >
                  <td>
                    <Badge>
                      {IDENTITY_STATUS_LABELS[session.identityStatus]}
                    </Badge>
                  </td>
                  <td>
                    <strong>{session.leadScore}</strong>{' '}
                    <Badge>{session.leadBand}</Badge>
                  </td>
                  <td className="num">{session.eventCount}</td>
                  <td className="num">{session.productViews}</td>
                  <td className="num">
                    {session.cartValueMinor > 0
                      ? formatMinor(session.cartValueMinor)
                      : '-'}
                  </td>
                  <td>{formatDateTime(session.lastSeenAt)}</td>
                  <td>{session.marketingUsable ? 'Usable' : 'Operational only'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
