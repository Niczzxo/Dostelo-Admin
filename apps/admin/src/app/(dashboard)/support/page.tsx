'use client';

import { useState, type FormEvent } from 'react';
import { Clock, LifeBuoy, Plus } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, KeyValues, LoadingNote,
  Modal, ModuleHeader, SelectInput, StatCard, StatGrid, StatusBadge, StatusTabs,
  TextArea, TextInput, Timeline, Unavailable,
} from '../../../components/ui';
import { staffOptions } from '../../../lib/staff-directory';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../lib/types';

/* Customer Support: tickets from GET /v1/admin/support-tickets.
   Public intake submissions arrive through the same queue with
   their source shown, so a website contact form case and a staff
   created case are distinguishable. Ticket detail shows replies,
   attachments, business-hours SLA state, and reopening: when a
   customer replies to a closed ticket the API reopens it, and the
   state change plus its history entry are shown here as recorded.
   SLA indicators use the due time and business-hours flag the API
   returns; this page never computes a promise the API did not set. */
const TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'reopened', label: 'Reopened' },
];

function slaTone(ticket: Record<string, unknown>): { label: string; tone: 'ok' | 'warn' | 'bad' | undefined } {
  const sla = asRec(ticket.sla);
  const state = str(ticket.slaStatus ?? sla.status ?? sla.state);
  if (state) {
    if (state.toLowerCase().includes('breach') || state.toLowerCase().includes('overdue')) return { label: state, tone: 'bad' };
    if (state.toLowerCase().includes('risk') || state.toLowerCase().includes('due')) return { label: state, tone: 'warn' };
    return { label: state, tone: 'ok' };
  }
  const due = str(ticket.slaDueAt ?? sla.dueAt);
  if (!due) return { label: 'No SLA set', tone: undefined };
  const past = new Date(due).getTime() < Date.now() && !['resolved', 'closed'].includes(str(ticket.status));
  return { label: past ? `Overdue since ${due}` : `Due ${due}`, tone: past ? 'bad' : 'warn' };
}

export default function SupportPage() {
  const [tab, setTab] = useState('');
  const tickets = useData((c) => c.listSupportTickets(tab ? { status: tab } : {}), [tab]);
  const staff = useData((c) => c.listStaff());
  const action = useAction();
  const [selectedId, setSelectedId] = useState('');
  const detail = useData((c) => (selectedId ? c.getSupportTicket(selectedId) : Promise.resolve(null)), [selectedId]);
  const attachments = useData((c) => (selectedId ? c.gap.listTicketAttachments(selectedId) : Promise.resolve(null)), [selectedId]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', customerId: '', orderNumber: '', message: '', priority: 'normal' });
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  const items = itemsOf(tickets.data);
  const detailRec = asRec(detail.data);
  const ticket = asRec(detailRec.ticket ?? detail.data);
  const replies = itemsOf(detailRec.replies ?? detailRec.messages);
  const attachmentItems = attachments.data ? itemsOf(attachments.data) : [];
  const intake = items.filter((r) => ['public', 'website', 'storefront', 'intake'].includes(str(r.source)));
  const reopened = items.filter((r) => str(r.status) === 'reopened');
  const sla = ticket.id ? slaTone(ticket) : { label: '', tone: undefined as 'ok' | 'warn' | 'bad' | undefined };

  async function create(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { subject: form.subject, message: form.message, priority: form.priority };
    if (form.customerId) dto.customerId = form.customerId;
    if (form.orderNumber) dto.orderNumber = form.orderNumber;
    if (await action.run((c) => c.createSupportTicket(dto))) {
      setCreating(false);
      tickets.reload();
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.replySupportTicket(selectedId, { body: reply }))) {
      setReply('');
      detail.reload();
      tickets.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={LifeBuoy}
        title="Customer Support"
        description="Support inbox tied to customer and order records. Public intake submissions flow into this same queue with their source shown."
      >
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          <Plus size={15} /> New ticket
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Tickets in view" value={tickets.loading ? '...' : String(items.length)} />
        <StatCard label="From public intake" value={String(intake.length)} note="Submitted through the storefront intake, queued here" />
        <StatCard label="Reopened" value={String(reopened.length)} note="Reopened by an inbound customer reply, as recorded" />
        <StatCard label="Open" value={String(items.filter((r) => str(r.status) === 'open').length)} />
      </StatGrid>

      <Card title="Ticket queue">
        <StatusTabs options={TABS} value={tab} onChange={setTab} />
        {tickets.loading ? (
          <LoadingNote />
        ) : tickets.error ? (
          <ErrorNote error={tickets.error} onRetry={tickets.reload} />
        ) : (
          <DataTable
            emptyText="No tickets in this state."
            columns={[
              { key: 'subject', label: 'Subject', render: (r) => <button type="button" className="btn secondary small" onClick={() => setSelectedId(str(r.id))}>{str(r.subject)}</button> },
              { key: 'source', label: 'Source', render: (r) => <Badge>{str(r.source ?? 'staff')}</Badge> },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'priority', label: 'Priority' },
              { key: 'sla', label: 'SLA', render: (r) => { const s = slaTone(r); return <Badge tone={s.tone}>{s.label}</Badge>; } },
              { key: 'assigneeId', label: 'Assignee', render: (r) => str(r.assigneeId) || 'Unassigned' },
              { key: 'updatedAt', label: 'Updated', date: true },
            ]}
            rows={items}
          />
        )}
      </Card>

      {selectedId ? (
        <>
          <Card title="Ticket detail">
            {detail.loading ? (
              <LoadingNote />
            ) : detail.error ? (
              <ErrorNote error={detail.error} onRetry={detail.reload} />
            ) : (
              <>
                <KeyValues
                  entries={[
                    ['Ticket ID', str(ticket.id)],
                    ['Subject', str(ticket.subject)],
                    ['Status', <StatusBadge key="s" status={ticket.status} />],
                    ['Source', str(ticket.source ?? 'staff')],
                    ['Customer', str(ticket.customerId)],
                    ['Order', str(ticket.orderNumber)],
                    ['Priority', str(ticket.priority)],
                    ['SLA (business hours)', <Badge key="sla" tone={sla.tone}><Clock size={12} /> {sla.label}</Badge>],
                    ['Reopened count', String(ticket.reopenCount ?? (str(ticket.status) === 'reopened' ? 1 : 0))],
                    ['Assignee', str(ticket.assigneeId) || 'Unassigned'],
                  ]}
                />
                <p className="note" style={{ marginTop: 10 }}>
                  SLA timing follows the business hours the API applies. If a customer replies to a
                  resolved or closed ticket, the API reopens it and the new state and history appear
                  here on reload.
                </p>
                <div className="section-grid" style={{ marginTop: 12 }}>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await action.run((c) => c.setSupportTicketStatus(selectedId, { status }))) {
                        detail.reload();
                        tickets.reload();
                      }
                    }}
                  >
                    <Field label="Set status">
                      <SelectInput required value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">Select a status</option>
                        <option value="open">Open</option>
                        <option value="pending">Pending</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </SelectInput>
                    </Field>
                    <button type="submit" className="btn secondary" disabled={action.busy}>Save status</button>
                  </form>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await action.run((c) => c.assignSupportTicket(selectedId, { assigneeId }))) detail.reload();
                    }}
                  >
                    <Field label="Assign to">
                      {staffOptions(staff.data).length > 0 ? (
                        <SelectInput required value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                          <option value="">Select a staff member</option>
                          {staffOptions(staff.data).map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </SelectInput>
                      ) : (
                        <TextInput required value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} placeholder="Staff ID" />
                      )}
                    </Field>
                    <button type="submit" className="btn secondary" disabled={action.busy}>Assign</button>
                  </form>
                </div>
              </>
            )}
          </Card>

          <div className="section-grid">
            <Card title="Conversation">
              <Timeline items={replies.map((r) => ({ ...r, status: str(r.authorType ?? r.authorId ?? 'Reply'), note: str(r.body ?? r.message) }))} />
              <form onSubmit={sendReply} style={{ marginTop: 10 }}>
                <Field label="Reply to the customer">
                  <TextArea required value={reply} onChange={(e) => setReply(e.target.value)} />
                </Field>
                <button type="submit" className="btn" disabled={action.busy}>Send reply</button>
              </form>
            </Card>
            <Card title="Attachments">
              {attachments.loading ? (
                <LoadingNote />
              ) : attachments.data === null ? (
                <Unavailable title="Attachment viewing is not available on the running API yet.">
                  This panel needs GET /v1/admin/support-tickets/:id/attachments. Attachments sent
                  with a ticket are not claimed to be stored until that endpoint answers.
                </Unavailable>
              ) : attachmentItems.length === 0 ? (
                <p className="note">No attachments on this ticket.</p>
              ) : (
                <ul className="timeline">
                  {attachmentItems.map((item, index) => (
                    <li key={str(item.id ?? index)}>
                      <div>
                        <a href={str(item.url)} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                          {str(item.name ?? item.filename ?? 'Attachment')}
                        </a>
                        <div className="note">{str(item.contentType ?? item.type)} {str(item.uploadedAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      ) : null}

      {creating ? (
        <Modal title="New support ticket" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <ActionError error={action.error} />
            <Field label="Subject">
              <TextInput required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <div className="form-grid">
              <Field label="Customer ID (optional)">
                <TextInput value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} />
              </Field>
              <Field label="Order number (optional)">
                <TextInput value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} />
              </Field>
              <Field label="Priority">
                <SelectInput value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </SelectInput>
              </Field>
            </div>
            <Field label="First message">
              <TextArea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Create ticket</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
