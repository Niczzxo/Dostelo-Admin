'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LEAD_STATUS_LABELS, type Lead } from '@dostelo/types';
import { api, formatDateTime } from '../../../../lib/api';
import { useData } from '../../../../lib/use-data';
import { useAuth } from '../../../../components/auth-provider';
import {
  Badge,
  CardHead,
  ErrorNote,
  LoadingNote,
} from '../../../../components/ui';
import {
  AssignForm,
  ContactSection,
  FollowUpSection,
  LEAD_BASIS_LABELS,
  StatusMoves,
  useActionError,
} from '../lead-actions';

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const leadId = params.id;
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canAssign = permissions.includes('leads.assign');
  const canEdit = permissions.includes('leads.edit');
  const canContact = permissions.includes('leads.contact');

  const detail = useData((client) => client.getLead(leadId), [leadId]);
  const lead: Lead | undefined = detail.data?.lead;
  const [optingOut, setOptingOut] = useState(false);
  const [optOutError, handleOptOutError] = useActionError();

  async function recordOptOut(): Promise<void> {
    if (!lead) return;
    const confirmed = window.confirm(
      'Record an opt-out for this lead? The lead moves to Do Not Contact and all further contact is refused.',
    );
    if (!confirmed) return;
    setOptingOut(true);
    try {
      await api.optOutLead(lead.id);
      detail.reload();
    } catch (caught) {
      handleOptOutError(caught);
    } finally {
      setOptingOut(false);
    }
  }

  const suppressed =
    lead !== undefined &&
    (lead.optedOut || lead.status === 'do-not-contact');

  return (
    <section>
      <div className="module-head">
        <div className="module-head-main">
          <div>
            <h1>{lead ? (lead.fullName ?? 'Lead detail') : 'Lead detail'}</h1>
            <p className="module-desc">
              Assignment, pipeline moves, follow-up tasks and contact attempts for this lead.
            </p>
          </div>
        </div>
        <div className="module-head-actions">
          <Link className="btn btn-secondary" href="/leads">
            Back to leads
          </Link>
        </div>
      </div>

      {detail.loading ? <LoadingNote label="Loading lead..." /> : null}
      {detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : null}

      {lead ? (
        <>
          {suppressed ? (
            <p className="note error-note" role="alert">
              Do not contact. This lead opted out
              {lead.optedOutAt
                ? ` on ${formatDateTime(lead.optedOutAt)}`
                : ''}
              . Contact actions are disabled and the API refuses
              further attempts.
            </p>
          ) : null}

          <div className="detail-grid">
            <div className="card">
              <CardHead title="Lead" />
              <dl className="kv">
                <dt>Status</dt>
                <dd>
                  <Badge>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                </dd>
                <dt>Name</dt>
                <dd>{lead.fullName ?? 'Not recorded'}</dd>
                <dt>Email</dt>
                <dd>{lead.email ?? 'Not recorded'}</dd>
                <dt>Phone</dt>
                <dd>{lead.phone ?? 'Not recorded'}</dd>
                <dt>Contact basis</dt>
                <dd>
                  {lead.contactBasis
                    ? (LEAD_BASIS_LABELS[lead.contactBasis] ?? lead.contactBasis)
                    : 'None recorded: this lead is not contactable'}
                </dd>
                <dt>Source</dt>
                <dd>{lead.source}</dd>
                <dt>Lead score</dt>
                <dd>{lead.score ?? 'Not scored'}</dd>
                <dt>Assigned to</dt>
                <dd>{lead.assigneeId ?? 'Unassigned'}</dd>
                <dt>Customer</dt>
                <dd>
                  {lead.customerId ? (
                    <Link href={`/crm/${lead.customerId}`}>
                      View CRM profile
                    </Link>
                  ) : (
                    'Not linked'
                  )}
                </dd>
                <dt>Created</dt>
                <dd>{formatDateTime(lead.createdAt)}</dd>
                <dt>Updated</dt>
                <dd>{formatDateTime(lead.updatedAt)}</dd>
                {lead.note ? (
                  <>
                    <dt>Note</dt>
                    <dd>{lead.note}</dd>
                  </>
                ) : null}
              </dl>
            </div>

            <div className="card">
              <CardHead title="Pipeline" />
              {canEdit ? (
                <StatusMoves lead={lead} onDone={detail.reload} />
              ) : (
                <p className="note muted">
                  Your role cannot move leads (the leads.edit
                  permission is required).
                </p>
              )}
              {!suppressed && canEdit ? (
                <div style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={optingOut}
                    onClick={recordOptOut}
                  >
                    {optingOut ? 'Recording...' : 'Record opt-out'}
                  </button>
                  {optOutError ? (
                    <p className="form-error" role="alert">
                      {optOutError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="card">
              <CardHead title="Assignment" />
              {canAssign ? (
                <AssignForm lead={lead} onDone={detail.reload} />
              ) : (
                <p className="note muted">
                  Your role cannot assign leads (the leads.assign
                  permission is required).
                </p>
              )}
            </div>
          </div>

          <div className="detail-grid section-gap">
            <div className="card">
              <CardHead title="Follow-up tasks" />
              <FollowUpSection
                lead={lead}
                tasks={detail.data?.followUpTasks ?? []}
                canEdit={canEdit}
                onDone={detail.reload}
              />
            </div>
            <div className="card">
              <CardHead title="Contact attempts" />
              <ContactSection
                lead={lead}
                attempts={detail.data?.attempts ?? []}
                canContact={canContact}
                onDone={detail.reload}
              />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
