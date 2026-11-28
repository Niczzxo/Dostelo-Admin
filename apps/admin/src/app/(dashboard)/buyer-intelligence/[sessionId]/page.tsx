'use client';

import { use } from 'react';
import Link from 'next/link';
import { UserSearch } from 'lucide-react';
import {
  Badge, Card, ErrorNote, KeyValues, LoadingNote, ModuleHeader, Timeline,
} from '../../../../components/ui';
import { formatMinor } from '../../../../lib/api';
import { useData } from '../../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../../lib/types';

/* Buyer session detail: the summary, the transparent score
   breakdown and the full event timeline for one session, exactly
   as GET /v1/admin/buyer-intelligence/sessions/:sessionId returns
   them. */
export default function BuyerSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const detail = useData((c) => c.getBuyerSession(sessionId), [sessionId]);
  const data = asRec(detail.data);
  const breakdown = asRec(data.scoreBreakdown);
  const events = itemsOf(data.events);

  return (
    <>
      <ModuleHeader
        icon={UserSearch}
        title="Session detail"
        description="One visitor session: identity status, score breakdown and event timeline from the API."
      >
        <Link className="btn secondary" href="/buyer-intelligence">Back to sessions</Link>
      </ModuleHeader>
      {detail.loading ? (
        <LoadingNote />
      ) : detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : (
        <>
          <Card title="Session">
            <KeyValues
              entries={[
                ['Session', str(data.sessionId)],
                ['Visitor', str(data.visitorId)],
                ['Identity status', <Badge key="i">{str(data.identityStatus)}</Badge>],
                ['Customer', str(data.customerId) || 'Not identified'],
                ['Lead score', String(num(data.leadScore))],
                ['Lead band', str(data.leadBand)],
                ['Cart value', formatMinor(num(data.cartValueMinor))],
                ['Marketing usable', data.marketingUsable === true ? 'Yes, consent recorded' : 'No'],
                ['First seen', str(data.firstSeenAt)],
                ['Last seen', str(data.lastSeenAt)],
              ]}
            />
          </Card>
          <Card title="Score breakdown">
            <KeyValues
              entries={[
                ['Recency', String(num(breakdown.recency))],
                ['Product views', String(num(breakdown.productViews))],
                ['Repeat sessions', String(num(breakdown.repeatSessions))],
                ['Cart value', String(num(breakdown.cartValue))],
                ['Checkout progress', String(num(breakdown.checkoutProgress))],
              ]}
            />
            <p className="note">
              The score uses only these transparent business signals. It never turns an anonymous
              session into a named buyer.
            </p>
          </Card>
          <Card title="Event timeline">
            <Timeline items={events} />
          </Card>
        </>
      )}
    </>
  );
}
