'use client';

import { use } from 'react';
import Link from 'next/link';
import { Target } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, KeyValues, LoadingNote,
  ModuleHeader,
} from '../../../../components/ui';
import { staffOptions } from '../../../../lib/staff-directory';
import { useAction, useData } from '../../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../../lib/types';
import {
  AssignLeadForm, ContactAttemptForm, FollowUpForm, LeadStatusForm,
} from '../lead-actions';

/* Lead detail: GET /v1/leads/:id returns the lead, its contact
   attempts and its follow-up tasks. All four action forms post to
   the leads API. Opt out is a first-class action here and in the
   API; once set, contact attempts are refused. */
export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useData((c) => c.getLead(id), [id]);
  const staff = useData((c) => c.listStaff());
  const action = useAction();

  const data = asRec(detail.data);
  const lead = asRec(data.lead ?? detail.data);
  const attempts = itemsOf(data.attempts ?? data.contactAttempts);
  const tasks = itemsOf(data.followUpTasks ?? data.followUps);
  const dnc = str(lead.status) === 'do-not-contact' || lead.doNotContact === true;

  function done() {
    detail.reload();
  }

  return (
    <>
      <ModuleHeader
        icon={Target}
        title={str(lead.name) || 'Lead'}
        description="Lead record, contact history and follow-up tasks from the API."
      >
        <Link className="btn secondary" href="/leads">Back to leads</Link>
        {!dnc ? (
          <button
            type="button"
            className="btn danger"
            disabled={action.busy}
            onClick={async () => {
              if (await action.run((c) => c.optOutLead(id))) done();
            }}
          >
            Mark Do Not Contact
          </button>
        ) : null}
      </ModuleHeader>
      {detail.loading ? (
        <LoadingNote />
      ) : detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : (
        <>
          <ActionError error={action.error} />
          <Card title="Lead">
            <KeyValues
              entries={[
                ['Lead ID', str(lead.id)],
                ['Phone', str(lead.phone)],
                ['Email', str(lead.email)],
                ['Source', str(lead.source)],
                ['Status', dnc ? <Badge key="s" tone="bad">Do Not Contact</Badge> : <Badge key="s">{str(lead.status)}</Badge>],
                ['Score', String(lead.score ?? lead.leadScore ?? '')],
                ['Assignee', str(lead.assigneeId) || 'Unassigned'],
                ['Created', str(lead.createdAt)],
              ]}
            />
          </Card>
          <div className="section-grid">
            <Card title="Assign">
              <AssignLeadForm leadId={id} staff={staffOptions(staff.data)} onDone={done} />
            </Card>
            <Card title="Status">
              <LeadStatusForm leadId={id} current={str(lead.status)} onDone={done} />
            </Card>
            <Card title="Follow-up task">
              <FollowUpForm leadId={id} onDone={done} />
            </Card>
            <Card title="Contact attempt">
              {dnc ? (
                <p className="note">
                  This lead is Do Not Contact. Contact attempts are refused by the API and are not
                  offered here.
                </p>
              ) : (
                <ContactAttemptForm leadId={id} onDone={done} />
              )}
            </Card>
          </div>
          <Card title="Follow-up tasks">
            <DataTable
              searchable={false}
              emptyText="No follow-up tasks yet."
              columns={[
                { key: 'title', label: 'Task' },
                { key: 'dueAt', label: 'Due', date: true },
                { key: 'status', label: 'State', render: (r) => <Badge>{str(r.status ?? (r.completedAt ? 'complete' : 'open'))}</Badge> },
                {
                  key: 'id', label: 'Action',
                  render: (r) => (
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={async () => {
                        if (await action.run((c) => c.completeFollowUpTask(id, str(r.id)))) done();
                      }}
                    >
                      Complete
                    </button>
                  ),
                },
              ]}
              rows={tasks}
            />
          </Card>
          <Card title="Contact attempts">
            <DataTable
              searchable={false}
              emptyText="No contact attempts recorded."
              columns={[
                { key: 'channel', label: 'Channel' },
                { key: 'purpose', label: 'Purpose' },
                { key: 'result', label: 'Result' },
                { key: 'staffId', label: 'Staff' },
                { key: 'createdAt', label: 'When', date: true },
              ]}
              rows={attempts}
            />
          </Card>
        </>
      )}
    </>
  );
}
