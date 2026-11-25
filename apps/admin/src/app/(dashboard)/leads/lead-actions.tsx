'use client';

import { useState, type FormEvent } from 'react';
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
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { expireSession } from '../../../lib/session';
import { useStaffDirectory } from '../../../lib/staff-directory';
import { Badge, EmptyNote } from '../../../components/ui';

/**
 * Legal next statuses, mirroring the API lead flow policy:
 * forward through the pipeline, back to Follow-up Required from
 * any active stage, or Lost from any active stage. Do Not Contact
 * is deliberately absent: it is reached only by recording an
 * opt-out. The API re-checks every move and stays the authority;
 * this list only decides which buttons render.
 */
export const LEAD_NEXT: Record<LeadStatus, LeadStatus[]> = {
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

export const LEAD_BASIS_LABELS: Record<string, string> = {
  account: 'Account (visitor signed in)',
  checkout: 'Checkout (details submitted at checkout)',
  'contact-form': 'Contact form (details submitted on a form)',
  'marketing-consent': 'Marketing consent granted',
};

export function useActionError(): [string | null, (caught: unknown) => void] {
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

export function AssignForm({
  lead,
  onDone,
}: {
  lead: Lead;
  onDone: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, handleError] = useActionError();
  const { staff, canRead } = useStaffDirectory();

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
        Sales agent
        {canRead && staff.length > 0 ? (
          <select
            className="select"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">Select a sales agent</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName} ({member.email})
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            placeholder="Admin user id of the sales agent"
          />
        )}
      </label>
      {canRead && staff.length > 0 ? null : (
        <p className="note muted">
          The staff directory is only readable with the staff.manage
          permission, so the assignee is entered by admin id here.
          The assignment is recorded in the audit log either way.
        </p>
      )}
      {lead.assigneeId ? (
        <p className="note muted">
          Currently assigned to {lead.assigneeId}.
        </p>
      ) : null}
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

export function StatusMoves({
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

export function FollowUpSection({
  lead,
  tasks,
  canEdit,
  onDone,
  defaultTitle,
}: {
  lead: Lead;
  tasks: FollowUpTask[];
  canEdit: boolean;
  onDone: () => void;
  defaultTitle?: string;
}) {
  const [title, setTitle] = useState(defaultTitle ?? '');
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

export function ContactSection({
  lead,
  attempts,
  canContact,
  onDone,
  defaultChannel,
  defaultPurpose,
}: {
  lead: Lead;
  attempts: LeadContactAttempt[];
  canContact: boolean;
  onDone: () => void;
  defaultChannel?: ContactChannel;
  defaultPurpose?: string;
}) {
  const [channel, setChannel] = useState<ContactChannel>(defaultChannel ?? 'phone');
  const [purpose, setPurpose] = useState(defaultPurpose ?? '');
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
