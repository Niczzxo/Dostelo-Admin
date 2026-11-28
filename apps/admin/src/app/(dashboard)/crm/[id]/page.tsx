'use client';

import { use, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, KeyValues,
  LoadingNote, ModuleHeader, StatusBadge, TextInput, Timeline,
} from '../../../../components/ui';
import { formatMinor } from '../../../../lib/api';
import { useAction, useData } from '../../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../../lib/types';

/* Customer profile: GET /v1/crm/customers/:id/timeline returns the
   customer, their orders, visitor summary, notes and tags. Notes
   and tags are written through the CRM endpoints and re-read after
   every change, so what is shown is what the API stored. */
export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useData((c) => c.getCustomerTimeline(id), [id]);
  const action = useAction();
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');

  const data = asRec(detail.data);
  const customer = asRec(data.customer);
  const visitor = asRec(data.visitor);
  const orders = itemsOf(data.orders);
  const notes = itemsOf(data.notes);
  const tags = Array.isArray(data.tags) ? data.tags.map((t) => str(t)) : [];

  async function addNote(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run((c) => c.addCustomerNote(id, { body: note }));
    if (ok) {
      setNote('');
      detail.reload();
    }
  }

  async function addTag(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run((c) => c.addCustomerTag(id, { tag }));
    if (ok) {
      setTag('');
      detail.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Users}
        title={str(customer.name) || 'Customer'}
        description="Customer profile, orders, visitor summary, notes and tags from the CRM timeline endpoint."
      >
        <Link className="btn secondary" href="/crm">Back to customers</Link>
      </ModuleHeader>
      {detail.loading ? (
        <LoadingNote />
      ) : detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : (
        <>
          <ActionError error={action.error} />
          <Card title="Profile">
            <KeyValues
              entries={[
                ['Customer ID', str(customer.id)],
                ['Email', str(customer.email)],
                ['Phone', str(customer.phone)],
                ['Orders on timeline', String(orders.length)],
                ['Visitor sessions', String(num(visitor.sessionCount))],
                ['Visitor events', String(num(visitor.eventCount))],
                ['Best lead score', String(num(visitor.bestLeadScore))],
                ['Last activity', str(visitor.lastActivityAt)],
              ]}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tags.map((t) => (
                <span key={t} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <Badge>{t}</Badge>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={async () => {
                      if (await action.run((c) => c.removeCustomerTag(id, t))) detail.reload();
                    }}
                  >
                    Remove
                  </button>
                </span>
              ))}
              {tags.length === 0 ? <span className="note">No tags.</span> : null}
            </div>
            <form onSubmit={addTag} style={{ marginTop: 12, display: 'flex', gap: 8, maxWidth: 420 }}>
              <TextInput placeholder="New tag" value={tag} onChange={(e) => setTag(e.target.value)} required />
              <button type="submit" className="btn secondary" disabled={action.busy}>Add tag</button>
            </form>
          </Card>

          <Card title="Orders">
            <DataTable
              searchable={false}
              emptyText="This customer has no orders on the timeline."
              columns={[
                { key: 'orderNumber', label: 'Order', render: (r) => <Link href={`/orders/${str(r.orderNumber)}`}>{str(r.orderNumber)}</Link> },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'total', label: 'Total', money: true },
                { key: 'createdAt', label: 'Placed', date: true },
              ]}
              rows={orders}
            />
          </Card>

          <div className="section-grid">
            <Card title="Notes">
              <Timeline items={notes.map((n) => ({ ...n, status: str(n.authorId ?? 'Staff note'), note: str(n.body ?? n.note) }))} />
              <form onSubmit={addNote} style={{ marginTop: 10 }}>
                <Field label="Add a note">
                  <TextInput value={note} onChange={(e) => setNote(e.target.value)} required placeholder="What happened, what was agreed" />
                </Field>
                <button type="submit" className="btn" disabled={action.busy}>Save note</button>
              </form>
            </Card>
            <Card title="Visitor summary">
              <KeyValues
                entries={[
                  ['Identity statuses', (Array.isArray(visitor.identityStatuses) ? visitor.identityStatuses : []).map((s) => str(s)).join(', ') || 'None recorded'],
                  ['Lifetime value (orders above)', formatMinor(orders.reduce((sum, o) => sum + num(asRec(o.total).amountMinor ?? o.totalMinor), 0))],
                ]}
              />
              <p className="note">
                Visitor figures come from the timeline endpoint. Anonymous activity is summarised
                here only after the API linked it to this customer.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
