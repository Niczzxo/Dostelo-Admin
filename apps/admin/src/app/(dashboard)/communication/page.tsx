'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  CALL_OUTCOMES,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_LOG_STATUSES,
  type CallOutcome,
  type CommunicationChannel,
  type CommunicationLogStatus,
} from '@dostelo/types';
import {
  api,
  formatDateTime,
  toUiError,
} from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Communication Center (Phase 6): the append-only communication
 * log, filtered by channel and status, plus the manual call log
 * form. The log is honest by construction: an entry reads 'sent'
 * only when a configured provider confirmed the send, and
 * refusals (suppressed, consent denied, no address) and
 * not-configured providers are entries in their own right. A
 * call a staff member placed themselves is logged after the
 * fact; recording the outcome 'opted-out' writes a suppression
 * record for the number.
 */
export default function CommunicationPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canLogCall = permissions.includes('recovery.edit');

  const [channel, setChannel] = useState<CommunicationChannel | ''>('');
  const [status, setStatus] = useState<CommunicationLogStatus | ''>('');

  const log = useData(
    (client) =>
      client.listCommunicationLog({
        channel: channel || undefined,
        status: status || undefined,
      }),
    [channel, status],
  );

  return (
    <section>
      <PageHeader title="Communication Center" />
      <p className="note muted" style={{ marginTop: 0 }}>
        Every automated send and every staff-logged call lands
        here. Nothing reads as sent unless a configured provider
        confirmed it; channels without credentials record
        not-configured instead.
      </p>

      <div className="toolbar">
        <label className="field">
          Channel
          <select
            className="select"
            value={channel}
            onChange={(event) =>
              setChannel(event.target.value as CommunicationChannel | '')
            }
          >
            <option value="">All channels</option>
            {COMMUNICATION_CHANNELS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as CommunicationLogStatus | '')
            }
          >
            <option value="">All statuses</option>
            {COMMUNICATION_LOG_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {log.loading ? <LoadingNote label="Loading communication log..." /> : null}
      {log.error ? <ErrorNote error={log.error} onRetry={log.reload} /> : null}
      {log.data && log.data.items.length === 0 ? (
        <EmptyNote>
          No communication entries match this filter yet. Recovery
          steps, refusals and logged calls appear here as they
          happen.
        </EmptyNote>
      ) : null}
      {log.data && log.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Channel</th>
                <th>Status</th>
                <th>To</th>
                <th>Message</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {log.data.items.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.createdAt)}</td>
                  <td>
                    <Badge>{entry.channel}</Badge>{' '}
                    <span className="muted">{entry.kind}</span>
                  </td>
                  <td>
                    <Badge>{entry.status}</Badge>
                    {entry.callOutcome ? (
                      <div className="muted">{entry.callOutcome}</div>
                    ) : null}
                  </td>
                  <td>{entry.toAddress ?? 'No address'}</td>
                  <td>
                    {entry.subject ? <strong>{entry.subject}</strong> : null}
                    <div>{entry.body}</div>
                    {entry.detail ? (
                      <div className="muted">{entry.detail}</div>
                    ) : null}
                  </td>
                  <td>
                    {entry.abandonedCartId ? (
                      <Link href={`/cart-recovery/${entry.abandonedCartId}`}>
                        Recovery
                      </Link>
                    ) : null}
                    {entry.customerId ? (
                      <>
                        {' '}
                        <Link href={`/crm/${entry.customerId}`}>Customer</Link>
                      </>
                    ) : null}
                    {entry.leadId ? (
                      <>
                        {' '}
                        <Link href={`/leads/${entry.leadId}`}>Lead</Link>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="card section-gap">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Log a call you placed</h2>
        {canLogCall ? (
          <ManualCallForm onLogged={log.reload} />
        ) : (
          <p className="note muted">
            Logging a call needs the recovery.edit permission.
          </p>
        )}
      </div>
    </section>
  );
}

function ManualCallForm({ onLogged }: { onLogged: () => void }) {
  const [phone, setPhone] = useState('');
  const [outcome, setOutcome] = useState<CallOutcome>('answered');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!phone.trim()) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.logManualCall({
        phone: phone.trim(),
        outcome,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      setPhone('');
      setNotes('');
      setOutcome('answered');
      setSaved(true);
      onLogged();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="field" style={{ marginTop: 0 }}>
        Phone number called
        <input
          className="input"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="01XXXXXXXXX"
        />
      </label>
      <label className="field">
        Outcome
        <select
          className="select"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as CallOutcome)}
        >
          {CALL_OUTCOMES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Notes (optional)
        <input
          className="input"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What was discussed or agreed"
        />
      </label>
      <p className="note muted">
        Recording the outcome opted-out writes a suppression
        record for this number, and later contact is refused.
      </p>
      <button type="submit" className="btn" disabled={busy || !phone.trim()}>
        {busy ? 'Logging...' : 'Log call'}
      </button>
      {saved ? <p className="note">Call logged.</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
