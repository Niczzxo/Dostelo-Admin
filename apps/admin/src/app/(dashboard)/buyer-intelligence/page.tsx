'use client';

import Link from 'next/link';
import { UserSearch } from 'lucide-react';
import {
  Badge, Card, DataTable, ErrorNote, LoadingNote, ModuleHeader, StatCard, StatGrid,
} from '../../../components/ui';
import { formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { itemsOf, num, str } from '../../../lib/types';

/* Buyer Intelligence: consent-aware visitor sessions from
   GET /v1/admin/buyer-intelligence/sessions. Identity status is
   shown exactly as the API reports it. Anonymous sessions are
   labelled anonymous and are never presented as known buyers, and
   no contact detail is shown for a session the API did not
   identify. Lead score and band are the API transparent score. */
export default function BuyerIntelligencePage() {
  const sessions = useData((c) => c.listBuyerSessions({}));
  const items = itemsOf(sessions.data);
  const anonymous = items.filter((r) => str(r.identityStatus) === 'anonymous');
  const identified = items.length - anonymous.length;
  const marketingUsable = items.filter((r) => r.marketingUsable === true);
  const hot = items.filter((r) => str(r.leadBand) === 'hot');

  return (
    <>
      <ModuleHeader
        icon={UserSearch}
        title="Buyer Intelligence"
        description="Visitor sessions with identity confidence and transparent lead scoring. Anonymous visitors stay anonymous here: they are never shown as verified buyers and carry no contact details."
      />
      <StatGrid>
        <StatCard label="Sessions" value={sessions.loading ? '...' : String(items.length)} />
        <StatCard label="Anonymous sessions" value={String(anonymous.length)} note="Not buyers; no identity is claimed for these" />
        <StatCard label="Identified sessions" value={String(identified)} note="Known customer, guest checkout or unverified contact, as the API labels them" />
        <StatCard label="Marketing usable" value={String(marketingUsable.length)} note="Consent and contact permission recorded" />
        <StatCard label="Hot lead band" value={String(hot.length)} />
      </StatGrid>
      <Card title="Sessions">
        {sessions.loading ? (
          <LoadingNote />
        ) : sessions.error ? (
          <ErrorNote error={sessions.error} onRetry={sessions.reload} />
        ) : (
          <DataTable
            emptyText="No visitor sessions recorded yet."
            columns={[
              { key: 'sessionId', label: 'Session', render: (r) => <Link href={`/buyer-intelligence/${str(r.sessionId)}`}>{str(r.sessionId).slice(0, 12)}...</Link> },
              { key: 'identityStatus', label: 'Identity', render: (r) => <Badge tone={str(r.identityStatus) === 'anonymous' ? undefined : 'dark'}>{str(r.identityStatus)}</Badge> },
              { key: 'eventCount', label: 'Events' },
              { key: 'productViews', label: 'Product views' },
              { key: 'cartValueMinor', label: 'Cart value', render: (r) => formatMinor(num(r.cartValueMinor)) },
              { key: 'leadScore', label: 'Lead score' },
              { key: 'leadBand', label: 'Band', render: (r) => <Badge tone={str(r.leadBand) === 'hot' ? 'bad' : str(r.leadBand) === 'warm' ? 'warn' : undefined}>{str(r.leadBand)}</Badge> },
              { key: 'lastSeenAt', label: 'Last seen', date: true },
            ]}
            rows={items}
          />
        )}
      </Card>
    </>
  );
}
