'use client';

import { useState, type FormEvent } from 'react';
import {
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_STATUS_LABELS,
  type SupportPriority,
  type SupportTicketStatus,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Customer Support: the ticket inbox. The storefront has no
 * ticket intake endpoint, so tickets are created by staff from
 * contacts that arrived by phone, Messenger or in person, and
 * the opening message records the customer's own words. Replies,
 * internal notes, assignment and status all write to the API
 * and are audited server-side.
 */
export default function SupportPage() {
  const { session } = useAuth();
  const canEdit =
    session.principal?.permissions.includes('customers.edit') ?? false;
  const myId = session.principal?.id ?? '';

  const [status, setStatus] = useState<SupportTicketStatus | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyInternal, setReplyInternal] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create form state.
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<SupportPriority>('normal');
  const [ticketOrderNumber, setTicketOrderNumber] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const tickets = useData(
    (client) =>
      client.listSupportTickets(status ? { status } : undefined),
    [status],
  );
  const detail = useData(
    (client) =>
      selectedId
        ? client.getSupportTicket(selectedId)
        : Promise.resolve(null),
    [selectedId],
  );

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      detail.reload();
      tickets.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setActionError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createTicket(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setCreateError(null);
    try {
      const created = await api.createSupportTicket({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        subject: subject.trim(),
        message: message.trim(),
        priority,
        orderNumber: ticketOrderNumber.trim()
          ? ticketOrderNumber.trim()
          : undefined,
      });
      setSelectedId(created.id);
      setCustomerName('');
      setCustomerPhone('');
      setSubject('');
      setMessage('');
      setTicketOrderNumber('');
      tickets.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setCreateError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  const ticket = detail.data;

  return (
    <section>
      <PageHeader title="Customer Support" />
      <p className="note muted" style={{ marginTop: 0, maxWidth: 760 }}>
        Tickets are created by staff from phone, Messenger and in-person
        contacts: the storefront contact page does not open tickets, so
        nothing here pretends a customer submitted it online. The
        opening message records what the customer said.
      </p>
      <div className="toolbar">
        <label className="field">
          Status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as SupportTicketStatus | '')
            }
          >
            <option value="">All statuses</option>
            {SUPPORT_TICKET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_TICKET_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tickets.loading ? <LoadingNote label="Loading tickets..." /> : null}
      {tickets.error ? (
        <ErrorNote error={tickets.error} onRetry={tickets.reload} />
      ) : null}
      {tickets.data && tickets.data.items.length === 0 ? (
        <EmptyNote>No support tickets yet.</EmptyNote>
      ) : null}
      {tickets.data && tickets.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Customer</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.data.items.map((item) => (
                <tr
                  key={item.id}
                  className="clickable"
                  onClick={() => {
                    setSelectedId(item.id);
                    setActionError(null);
                  }}
                >
                  <td>{item.subject}</td>
                  <td>
                    {item.customerName} ({item.customerPhone})
                  </td>
                  <td>{SUPPORT_PRIORITY_LABELS[item.priority]}</td>
                  <td>
                    <Badge>
                      {SUPPORT_TICKET_STATUS_LABELS[item.status]}
                    </Badge>
                  </td>
                  <td>
                    {item.assignedToId
                      ? item.assignedToId === myId
                        ? 'You'
                        : item.assignedToId
                      : 'Unassigned'}
                  </td>
                  <td>{formatDateTime(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {ticket ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 17, marginTop: 0 }}>{ticket.subject}</h2>
          <dl className="kv">
            <dt>Customer</dt>
            <dd>
              {ticket.customerName}, {ticket.customerPhone}
              {ticket.customerEmail ? `, ${ticket.customerEmail}` : ''}
            </dd>
            <dt>Status</dt>
            <dd>{SUPPORT_TICKET_STATUS_LABELS[ticket.status]}</dd>
            <dt>Priority</dt>
            <dd>{SUPPORT_PRIORITY_LABELS[ticket.priority]}</dd>
            <dt>Order</dt>
            <dd>{ticket.orderNumber ?? 'Not linked'}</dd>
          </dl>
          <div className="timeline">
            {ticket.messages.map((entry) => (
              <div key={entry.id} style={{ marginBottom: 12 }}>
                <div className="note muted" style={{ margin: 0 }}>
                  {entry.authorName} ({entry.authorType}
                  {entry.internal ? ', internal note' : ''}),{' '}
                  {formatDateTime(entry.createdAt)}
                </div>
                <p style={{ margin: '4px 0 0', lineHeight: 1.6 }}>
                  {entry.body}
                </p>
              </div>
            ))}
          </div>

          {canEdit ? (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(async () => {
                    await api.replySupportTicket(ticket.id, {
                      body: replyBody.trim(),
                      internal: replyInternal,
                    });
                    setReplyBody('');
                    setReplyInternal(false);
                  });
                }}
              >
                <label className="field">
                  Reply or internal note
                  <textarea
                    className="input"
                    rows={3}
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    required
                  />
                </label>
                <label
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginTop: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={replyInternal}
                    onChange={(event) =>
                      setReplyInternal(event.target.checked)
                    }
                  />
                  Internal note (staff only, not a customer reply)
                </label>
                <button
                  type="submit"
                  className="btn btn-small"
                  disabled={busy || ticket.status === 'closed'}
                  style={{ marginTop: 10 }}
                >
                  {busy ? 'Saving...' : 'Add to ticket'}
                </button>
              </form>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 14,
                  alignItems: 'flex-end',
                }}
              >
                <label className="field">
                  Set status
                  <select
                    className="select"
                    value={ticket.status}
                    onChange={(event) =>
                      void runAction(() =>
                        api.setSupportTicketStatus(ticket.id, {
                          status: event.target
                            .value as SupportTicketStatus,
                        }),
                      )
                    }
                  >
                    {SUPPORT_TICKET_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {SUPPORT_TICKET_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Assign to staff id
                  <input
                    className="input"
                    style={{ marginTop: 0 }}
                    placeholder="Staff user id"
                    value={assignTo}
                    onChange={(event) => setAssignTo(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  disabled={busy || !assignTo.trim()}
                  onClick={() =>
                    void runAction(() =>
                      api.assignSupportTicket(ticket.id, {
                        assignedToId: assignTo.trim(),
                      }),
                    )
                  }
                >
                  Assign
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void runAction(() =>
                      api.assignSupportTicket(ticket.id, {
                        assignedToId: null,
                      }),
                    )
                  }
                >
                  Unassign
                </button>
              </div>
            </>
          ) : (
            <p className="note muted">
              Your role can view tickets but cannot reply or change them
              (the customers.edit permission is required).
            </p>
          )}
          {actionError ? (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        <div className="card" style={{ marginTop: 20, maxWidth: 760 }}>
          <h2 style={{ fontSize: 17, marginTop: 0 }}>New ticket</h2>
          <form onSubmit={createTicket}>
            <div className="toolbar">
              <label className="field" style={{ flex: 1, minWidth: 180 }}>
                Customer name
                <input
                  className="input"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  required
                />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 160 }}>
                Customer phone
                <input
                  className="input"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                Priority
                <select
                  className="select"
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as SupportPriority)
                  }
                >
                  {SUPPORT_PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {SUPPORT_PRIORITY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field" style={{ marginTop: 10 }}>
              Subject
              <input
                className="input"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
              />
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              Order number (optional)
              <input
                className="input"
                value={ticketOrderNumber}
                onChange={(event) =>
                  setTicketOrderNumber(event.target.value)
                }
              />
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              What the customer said
              <textarea
                className="input"
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className="btn btn-small"
              disabled={busy}
              style={{ marginTop: 12 }}
            >
              {busy ? 'Saving...' : 'Create ticket'}
            </button>
            {createError ? (
              <p className="form-error" role="alert">
                {createError}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}
    </section>
  );
}
