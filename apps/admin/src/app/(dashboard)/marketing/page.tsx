'use client';

import { useState, type FormEvent } from 'react';
import { Megaphone, Plus, Send } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, Field, KeyValues, LoadingNote, Modal,
  ModuleHeader, SelectInput, StatCard, StatGrid, StatusBadge, TextArea, TextInput, Unavailable,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../lib/types';

/* Marketing: campaigns from GET /v1/admin/campaigns with segment
   sizes, create and edit, scheduled dispatch (a campaign saved
   with a future send time stays in its scheduled state until the
   API dispatches it), send, and per-campaign delivery, read and
   click tracking plus attribution. Sending follows each channel
   provider configuration: with no provider configured the API
   records not-configured and the campaign keeps that honest state.
   Do Not Contact customers are suppressed by the API (403 on
   direct sends, excluded from segments). */
export default function MarketingPage() {
  const campaigns = useData((c) => c.listCampaigns({}));
  const segments = useData((c) => c.listCampaignSegments());
  const action = useAction();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '', channel: 'whatsapp', segment: '', subject: '', body: '', scheduledAt: '',
  });
  const [selectedId, setSelectedId] = useState('');
  const stats = useData((c) => (selectedId ? c.getCampaignStats(selectedId) : Promise.resolve(null)), [selectedId]);
  const tracking = useData((c) => (selectedId ? c.gap.getCampaignTracking(selectedId) : Promise.resolve(null)), [selectedId]);
  const attribution = useData((c) => (selectedId ? c.gap.getCampaignAttribution(selectedId) : Promise.resolve(null)), [selectedId]);

  const items = itemsOf(campaigns.data);
  const segmentItems = itemsOf(segments.data);
  const statsRec = asRec(stats.data);
  const trackingRec = asRec(tracking.data);
  const attributionItems = attribution.data ? itemsOf(attribution.data) : [];

  async function create(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = {
      name: form.name, channel: form.channel, body: form.body,
    };
    if (form.segment) dto.segment = form.segment;
    if (form.subject) dto.subject = form.subject;
    if (form.scheduledAt) dto.scheduledAt = new Date(form.scheduledAt).toISOString();
    if (await action.run((c) => c.createCampaign(dto))) {
      setCreating(false);
      campaigns.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Megaphone}
        title="Marketing"
        description="Campaigns with draft, scheduled and sent states, delivery, read and click tracking, and attribution. Dispatch state is whatever the API records, never an assumption."
      >
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          <Plus size={15} /> New campaign
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Campaigns" value={campaigns.loading ? '...' : String(items.length)} />
        <StatCard label="Scheduled" value={String(items.filter((r) => str(r.status) === 'scheduled').length)} note="Dispatch happens through the API scheduler" />
        <StatCard label="Sent" value={String(items.filter((r) => str(r.status) === 'sent').length)} />
        <StatCard
          label="Audience reachable"
          value={String(segmentItems.reduce((s, r) => s + num(r.size), 0))}
          note="Sum of the segment sizes the API returned; Do Not Contact excluded there"
        />
      </StatGrid>

      <Card title="Segments">
        {segments.loading ? (
          <LoadingNote />
        ) : segments.error ? (
          <ErrorNote error={segments.error} onRetry={segments.reload} />
        ) : (
          <DataTable
            searchable={false}
            emptyText="No segments returned by the API."
            columns={[
              { key: 'key', label: 'Segment' },
              { key: 'size', label: 'Size (consented, contactable)' },
            ]}
            rows={segmentItems}
          />
        )}
      </Card>

      <Card title="Campaigns">
        {campaigns.loading ? (
          <LoadingNote />
        ) : campaigns.error ? (
          <ErrorNote error={campaigns.error} onRetry={campaigns.reload} />
        ) : (
          <DataTable
            emptyText="No campaigns yet."
            columns={[
              { key: 'name', label: 'Campaign', render: (r) => <button type="button" className="btn secondary small" onClick={() => setSelectedId(str(r.id))}>{str(r.name)}</button> },
              { key: 'channel', label: 'Channel' },
              { key: 'segment', label: 'Segment' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'scheduledAt', label: 'Scheduled for', date: true },
              { key: 'sentAt', label: 'Sent', date: true },
              {
                key: 'send', label: 'Action',
                render: (r) => str(r.status) === 'draft' || str(r.status) === 'scheduled' ? (
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={action.busy}
                    onClick={async () => {
                      if (await action.run((c) => c.sendCampaign(str(r.id)))) campaigns.reload();
                    }}
                  >
                    <Send size={13} /> Send now
                  </button>
                ) : <span className="note">Dispatched</span>,
              },
            ]}
            rows={items}
          />
        )}
      </Card>

      {selectedId ? (
        <>
          <Card title="Delivery, read and click tracking">
            {stats.loading || tracking.loading ? (
              <LoadingNote />
            ) : tracking.data === null && !stats.data ? (
              <Unavailable title="Tracking endpoints are not available on the running API yet.">
                This panel needs GET /v1/admin/campaigns/:id/tracking (with /stats as the aggregate
                fallback). No delivery, open or click number is estimated here.
              </Unavailable>
            ) : (
              <KeyValues
                entries={[
                  ['Recipients', String(num(trackingRec.recipients ?? statsRec.recipients ?? statsRec.sent))],
                  ['Delivered', String(num(trackingRec.delivered ?? statsRec.delivered))],
                  ['Read or opened', String(num(trackingRec.read ?? trackingRec.opened ?? statsRec.opened))],
                  ['Clicked', String(num(trackingRec.clicked ?? statsRec.clicked))],
                  ['Failed', String(num(trackingRec.failed ?? statsRec.failed))],
                  ['Not configured', String(num(trackingRec.notConfigured ?? statsRec.notConfigured))],
                  ['Suppressed (Do Not Contact)', String(num(trackingRec.suppressed ?? statsRec.suppressed))],
                ]}
              />
            )}
            <p className="note">
              Counts are provider-confirmed events recorded by the API. A message the provider did
              not confirm stays out of the delivered, read and clicked counts.
            </p>
          </Card>
          <Card title="Attribution">
            {attribution.loading ? (
              <LoadingNote />
            ) : attribution.data === null ? (
              <Unavailable title="Attribution is not available on the running API yet.">
                This panel needs GET /v1/admin/campaigns/:id/attribution. Orders are attributed only
                from the recovery and campaign links the API issued, without double counting.
              </Unavailable>
            ) : (
              <DataTable
                searchable={false}
                emptyText="No orders attributed to this campaign yet."
                columns={[
                  { key: 'orderNumber', label: 'Order' },
                  { key: 'source', label: 'Source' },
                  { key: 'total', label: 'Order total', money: true },
                  { key: 'attributedAt', label: 'Attributed', date: true },
                ]}
                rows={attributionItems}
              />
            )}
          </Card>
        </>
      ) : null}

      {creating ? (
        <Modal title="New campaign" onClose={() => setCreating(false)} wide>
          <form onSubmit={create}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="Name">
                <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Channel">
                <SelectInput value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </SelectInput>
              </Field>
              <Field label="Segment">
                <SelectInput value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>
                  <option value="">Select a segment</option>
                  {segmentItems.map((s) => (
                    <option key={str(s.key)} value={str(s.key)}>{str(s.key)} ({num(s.size)})</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Schedule dispatch (optional)" hint="(leave empty to keep as draft)">
                <TextInput type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
              </Field>
            </div>
            <Field label="Subject (email)">
              <TextInput value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Message body">
              <TextArea required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>
              {form.scheduledAt ? 'Save and schedule' : 'Save as draft'}
            </button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
