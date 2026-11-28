'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Plus, Target } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, LoadingNote, Modal,
  ModuleHeader, SelectInput, StatCard, StatGrid, StatusTabs, TextInput,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { itemsOf, num, str } from '../../../lib/types';

/* Lead Management: the pipeline from GET /v1/leads with status
   tabs, plus lead capture through POST /v1/leads. Do Not Contact
   leads are labelled and excluded from contact actions; the API
   enforces the same rule with 403 on contact attempts. */
const TABS = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
  { value: 'do-not-contact', label: 'Do Not Contact' },
];

export default function LeadsPage() {
  const [tab, setTab] = useState('');
  const leads = useData((c) => c.listLeads(tab ? { status: tab } : {}), [tab]);
  const all = useData((c) => c.listLeads({}));
  const [creating, setCreating] = useState(false);
  const action = useAction();
  const [form, setForm] = useState({ name: '', phone: '', email: '', source: 'manual' });

  const items = itemsOf(leads.data);
  const allItems = itemsOf(all.data);
  const dnc = allItems.filter((r) => str(r.status) === 'do-not-contact' || r.doNotContact === true);

  async function create(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { source: form.source };
    if (form.name) dto.name = form.name;
    if (form.phone) dto.phone = form.phone;
    if (form.email) dto.email = form.email;
    if (await action.run((c) => c.createLead(dto))) {
      setCreating(false);
      leads.reload();
      all.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Target}
        title="Lead Management"
        description="Lead pipeline: capture, scoring, assignment and follow-up. Do Not Contact leads are excluded from marketing and contact actions."
      >
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          <Plus size={15} /> New lead
        </button>
      </ModuleHeader>
      <StatGrid>
        <StatCard label="Leads (loaded view)" value={leads.loading ? '...' : String(items.length)} />
        <StatCard label="All leads" value={all.loading ? '...' : String(allItems.length)} />
        <StatCard label="Do Not Contact" value={String(dnc.length)} note="Excluded from marketing sends by the API" />
        <StatCard
          label="Average score"
          value={allItems.length ? String(Math.round(allItems.reduce((s, r) => s + num(r.score ?? r.leadScore), 0) / allItems.length)) : '0'}
          note="Computed from the loaded leads"
        />
      </StatGrid>
      <Card title="Pipeline">
        <StatusTabs options={TABS} value={tab} onChange={setTab} />
        {leads.loading ? (
          <LoadingNote />
        ) : leads.error ? (
          <ErrorNote error={leads.error} onRetry={leads.reload} />
        ) : (
          <DataTable
            emptyText="No leads in this state."
            columns={[
              { key: 'name', label: 'Lead', render: (r) => <Link href={`/leads/${str(r.id)}`}>{str(r.name) || str(r.phone) || str(r.email) || str(r.id)}</Link> },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email' },
              { key: 'source', label: 'Source' },
              { key: 'score', label: 'Score', render: (r) => String(num(r.score ?? r.leadScore)) },
              { key: 'status', label: 'Status', render: (r) => (str(r.status) === 'do-not-contact' || r.doNotContact === true ? <Badge tone="bad">Do Not Contact</Badge> : <Badge>{str(r.status)}</Badge>) },
              { key: 'assigneeId', label: 'Assignee' },
              { key: 'createdAt', label: 'Created', date: true },
            ]}
            rows={items}
          />
        )}
      </Card>
      {creating ? (
        <Modal title="New lead" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <ActionError error={action.error} />
            <p className="note">Only add contact details the person actually provided.</p>
            <div className="form-grid">
              <Field label="Name">
                <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Phone">
                <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Source">
                <SelectInput value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  <option value="manual">Manual entry</option>
                  <option value="storefront">Storefront</option>
                  <option value="facebook">Facebook</option>
                  <option value="phone">Phone</option>
                </SelectInput>
              </Field>
            </div>
            <button type="submit" className="btn" disabled={action.busy}>Create lead</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
