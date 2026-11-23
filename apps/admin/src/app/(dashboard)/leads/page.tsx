'use client';

import { useRouter } from 'next/navigation';
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type Lead,
  type LeadStatus,
} from '@dostelo/types';
import { formatDateTime } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Lead Management pipeline (Phase 5): every lead grouped by its
 * pipeline status, in the master structure's pipeline order,
 * with a count per status. Leads and customers stay distinct:
 * a lead is a potential buyer with recorded buying intent, and
 * contact details appear here only because the person provided
 * them through an account, checkout or contact form flow, or
 * granted marketing consent. Clicking a row opens the lead
 * detail with assignment, status moves, follow-up tasks and
 * contact attempts.
 */
export default function LeadsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useData(
    (client) => client.listLeads({}),
    [],
  );

  const leads = data?.items ?? [];
  const byStatus = new Map<LeadStatus, Lead[]>();
  for (const status of LEAD_STATUSES) byStatus.set(status, []);
  for (const lead of leads) byStatus.get(lead.status)?.push(lead);

  return (
    <section>
      <PageHeader title="Lead Management" />
      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}
      >
        {LEAD_STATUSES.map((status) => (
          <Badge key={status}>
            {LEAD_STATUS_LABELS[status]}: {byStatus.get(status)?.length ?? 0}
          </Badge>
        ))}
      </div>

      {loading ? <LoadingNote label="Loading leads..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data && leads.length === 0 ? (
        <EmptyNote>
          No leads yet. Leads appear when an identified visitor
          shows buying intent (a checkout started without an
          order, or a hot lead score with contact details on
          file), or when staff record a submitted contact form or
          an offline enquiry.
        </EmptyNote>
      ) : null}

      {LEAD_STATUSES.map((status) => {
        const group = byStatus.get(status) ?? [];
        if (group.length === 0) return null;
        return (
          <div key={status}>
            <h2 className="section-gap" style={{ fontSize: 18 }}>
              {LEAD_STATUS_LABELS[status]} ({group.length})
            </h2>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Contact</th>
                    <th>Source</th>
                    <th className="num">Score</th>
                    <th>Assigned to</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                      style={{ cursor: 'pointer' }}
                      title="Open lead detail"
                    >
                      <td>
                        <strong>
                          {lead.fullName ?? lead.email ?? lead.phone ?? lead.id}
                        </strong>
                        {lead.optedOut ? (
                          <>
                            {' '}
                            <Badge>Do not contact</Badge>
                          </>
                        ) : null}
                      </td>
                      <td>
                        {lead.phone ?? lead.email ?? 'No details recorded'}
                      </td>
                      <td>{lead.source}</td>
                      <td className="num">{lead.score ?? '-'}</td>
                      <td>{lead.assigneeId ?? 'Unassigned'}</td>
                      <td>{formatDateTime(lead.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}
