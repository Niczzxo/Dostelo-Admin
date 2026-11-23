'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  CONTACT_ATTEMPT_RESULTS,
  CONTACT_CHANNELS,
  LEAD_STATUS_LABELS,
  type ContactAttemptResult,
  type ContactChannel,
  type FollowUpTask,
  type Lead,
  type LeadContactAttempt,
  type LeadStatus,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../../lib/api';
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
 * Legal next statuses, mirroring the API's lead flow policy
 * (apps/api/src/modules/leads/policies/lead-flow.ts): forward
 * through the pipeline, back to Follow-up Required from any
 * active stage, or Lost from any active stage. Do Not Contact
 * is deliberately absent: it is reached only by recording an
 * opt-out. The API re-checks every move and stays the authority;
 * this list only decides which buttons render.
 */
const LEAD_NEXT: Record<LeadStatus, LeadStatus[]> = {
  new: ['qualified', 'contacted', 'follow-up-required', 'lost'],
  qualified: ['contacted', 'interested', 'follow-up-required', 'lost'],
  contacted: [
    'interested',
    'follow-up-required',
    'negotiation',
    'converted',
    'lost',
  ],
  interested: ['negotiation', 'follow-up-required', 'converted', 'lost'],
  'follow-up-required': [
    'contacted',
    'interested',
    'negotiation',
    'converted',
    'lost',
  ],
  negotiation: ['converted', 'follow-up-required', 'lost'],
  converted: [],
  lost: [],
  'do-not-contact': [],
};

const BASIS_LABELS: Record<string, string> = {
  account: 'Account (visitor signed in)',
  checkout: 'Checkout (details submitted at checkout)',
  'contact-form': 'Contact form (details submitted on a form)',
  'marketing-consent': 'Marketing consent granted',
};

function useActionError(): [string | null, (caught: unknown) => void] {
  const [error, setError] = useState<string | null>(null);
  function handle(caught: unknown): void {
    const uiError = toUiError(caught);
    if (uiError.kind === 'unauthorized') {
      expireSession();
      return;
    }
    setError(uiError.message);
  }
  return [error, handle];
}

function AssignForm({
  lead,
  onDone,
}: {
  lead: Lead;
  onDone: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, handleError] = useActionError();

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const value = assigneeId.trim();
    if (!value) return;
    setBusy(true);
    try {
      await api.assignLead(lead.id, { assigneeId: value });
      setAssigneeId('');
      onDone();
    } catch (caught) {
      handleError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="field" style={{ marginTop: 0 }}>
        Sales agent admin id
        <input
          className="input"
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
          placeholder="Admin user id of the sales agent"
        />
      </label>
      <p className="note muted">
        There is no staff directory endpoint yet, so the assignee
        is entered by admin id. The assignment is recorded in the
        audit log either way.
      </p>
      <button type="submit" className="btn" disabled={busy || !assigneeId.trim()}>
        {busy ? 'Assigning...' : 'Assign lead'}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function StatusMoves({
  lead,
  onDone,
}: {
  lead: Lead;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<LeadStatus | null>(null);
  const [error, handleError] = useActionError();
  const next = LEAD_NEXT[lead.status];

  async function move(to: LeadStatus): Promise<void> {
    setBusy(to);
    try {
      await api.changeLeadStatus(lead.id, { status: to });
      onDone();
    } catch (caught) {
      handleError(caught);
    } finally {
      setBusy(null);
    }
  }

  if (next.length === 0) {
    return (
      <p className="note muted">
        This lead is in a terminal status; no further pipeline
        moves are available.
      </p>
    );
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {next.map((to) => (
          <button
            key={to}
            type="button"
            className={to === 'lost' ? 'btn btn-danger' : 'btn'}
            disabled={busy !== null}
            onClick={() => move(to)}
          >
            {busy === to ? 'Moving...' : `Move to ${LEAD_STATUS_LABELS[to]}`}
          </button>
        ))}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FollowUpSection({
  lead,
  tasks,
  canEdit,
  onDone,
}: {
  lead: Lead;
  tasks: FollowUpTask[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [error, handleError] = useActionError();

  async function create(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.createFollowUpTask(lead.id, {
        title: title.trim(),
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      setTitle('');
      setDueAt('');
      onDone();
    } catch (caught) {
      handleError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function complete(taskId: string): Promise<void> {
    setCompleting(taskId);
    try {
      await api.completeFollowUpTask(lead.id, taskId);
      onDone();
    } catch (caught) {
      handleError(caught);
    } finally {
      setCompleting(null);
    }
  }

  return (
    <div>
      {tasks.length === 0 ? (
        <EmptyNote>No follow-up tasks yet.</EmptyNote>
      ) : (
        <ul className="timeline">
          {tasks.map((task) => (
            <li key={task.id}>
              <div>
                <strong>{task.title}</strong>{' '}
                <Badge>{task.status}</Badge>
              </div>
              <div className="when">
                {task.dueAt
                  ? `Due ${formatDateTime(task.dueAt)} · `
                  : ''}
                Created {formatDateTime(task.createdAt)}
                {task.completedAt
                  ? ` · Completed ${formatDateTime(task.completedAt)}`
                  : ''}
              </div>
              {canEdit && task.status === 'open' ? (
                <button
                  type="button"
                  className="btn btn-small"
                  style={{ marginTop: 6 }}
                  disabled={completing !== null}
                  onClick={() => complete(task.id)}
                >
                  {completing === task.id ? 'Completing...' : 'Mark complete'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form onSubmit={create} style={{ marginTop: 12 }}>
          <label className="field" style={{ marginTop: 0 }}>
            New follow-up task
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Call back about the running shoes"
            />
          </label>
          <label className="field">
            Due (optional)
            <input
              className="input"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn"
            disabled={busy || !title.trim()}
          >
            {busy ? 'Adding...' : 'Add task'}
          </button>
        </form>
      ) : (
        <p className="note muted">
          Your role cannot manage follow-up tasks (the leads.edit
          permission is required).
        </p>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ContactSection({
  lead,
  attempts,
  canContact,
  onDone,
}: {
  lead: Lead;
  attempts: LeadContactAttempt[];
  canContact: boolean;
  onDone: () => void;
}) {
  const [channel, setChannel] = useState<ContactChannel>('phone');
  const [purpose, setPurpose] = useState('');
  const [result, setResult] = useState<ContactAttemptResult>('answered');
  const [note, setNote] = useState('');
  const [optOut, setOptOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, handleError] = useActionError();

  const suppressed = lead.optedOut || lead.status === 'do-not-contact';

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!purpose.trim()) return;
    setBusy(true);
    try {
      await api.recordContactAttempt(lead.id, {
        channel,
        purpose: purpose.trim(),
        result,
        note: note.trim() ? note.trim() : undefined,
        optOut: optOut || undefined,
      });
      setPurpose('');
      setNote('');
      setOptOut(false);
      onDone();
    } catch (caught) {
      handleError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {attempts.length === 0 ? (
        <EmptyNote>No contact attempts recorded yet.</EmptyNote>
      ) : (
        <ul className="timeline">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <div>
                <Badge>{attempt.channel}</Badge>{' '}
                <strong>{attempt.result}</strong>
                {attempt.optedOut ? (
                  <>
                    {' '}
                    <Badge>Opt-out recorded</Badge>
                  </>
                ) : null}
              </div>
              <div>{attempt.purpose}</div>
              {attempt.note ? <div>{attempt.note}</div> : null}
              <div className="when">
                {formatDateTime(attempt.createdAt)} · by {attempt.staffId}
              </div>
            </li>
          ))}
        </ul>
      )}

      {suppressed ? (
        <p className="note error-note" role="alert">
          This lead has opted out. Contact is disabled here, and
          the API refuses any further attempt.
        </p>
      ) : canContact ? (
        <form onSubmit={submit} style={{ marginTop: 12 }}>
          <label className="field" style={{ marginTop: 0 }}>
            Channel
            <select
              className="select"
              value={channel}
              onChange={(event) =>
                setChannel(event.target.value as ContactChannel)
              }
            >
              {CONTACT_CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Purpose
            <input
              className="input"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Why this contact is being made"
            />
          </label>
          <label className="field">
            Result
            <select
              className="select"
              value={result}
              onChange={(event) =>
                setResult(event.target.value as ContactAttemptResult)
              }
            >
              {CONTACT_ATTEMPT_RESULTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Note (optional)
            <input
              className="input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <label
            className="field"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <input
              type="checkbox"
              checked={optOut}
              onChange={(event) => setOptOut(event.target.checked)}
            />
            The lead asked not to be contacted again (records an opt-out)
          </label>
          <button
            type="submit"
            className="btn"
            disabled={busy || !purpose.trim()}
          >
            {busy ? 'Recording...' : 'Record contact attempt'}
          </button>
        </form>
      ) : (
        <p className="note muted">
          Your role cannot record contact attempts (the
          leads.contact permission is required).
        </p>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const leadId = params.id;
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canAssign = permissions.includes('leads.assign');
  const canEdit = permissions.includes('leads.edit');
  const canContact = permissions.includes('leads.contact');

  const detail = useData((client) => client.getLead(leadId), [leadId]);
  const lead = detail.data?.lead;
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
      <PageHeader
        title={lead ? (lead.fullName ?? 'Lead detail') : 'Lead detail'}
      >
        <Link href="/leads">Back to leads</Link>
      </PageHeader>

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
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Lead</h2>
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
                    ? (BASIS_LABELS[lead.contactBasis] ?? lead.contactBasis)
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
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Pipeline</h2>
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
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Assignment</h2>
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
              <h2 style={{ fontSize: 16, marginTop: 0 }}>
                Follow-up tasks
              </h2>
              <FollowUpSection
                lead={lead}
                tasks={detail.data?.followUpTasks ?? []}
                canEdit={canEdit}
                onDone={detail.reload}
              />
            </div>
            <div className="card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>
                Contact attempts
              </h2>
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
