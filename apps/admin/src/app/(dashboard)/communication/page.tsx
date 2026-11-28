'use client';

import { useState, type FormEvent } from 'react';
import { MessageSquare, PhoneCall, Send } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, Field, LoadingNote, Modal,
  ModuleHeader, SelectInput, StatCard, StatGrid, StatusBadge, StatusTabs, TextArea, TextInput,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { itemsOf, str } from '../../../lib/types';

/* Communication Center: the unified log from
   GET /v1/communications/log, manual call logging, staff sends and
   message templates. A message is shown as sent or delivered only
   when the provider confirmed it to the API. Providers are not
   configured on this deployment yet, so sends honestly record
   not-configured until the owner adds credentials in System
   Integrations. Do Not Contact recipients are refused by the API
   with 403, and that refusal is displayed. */
const CHANNEL_TABS = [
  { value: '', label: 'All channels' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'call', label: 'Calls' },
];

export default function CommunicationPage() {
  const [channel, setChannel] = useState('');
  const log = useData((c) => c.listCommunicationLog(channel ? { channel } : {}), [channel]);
  const templates = useData((c) => c.listMessageTemplates());
  const action = useAction();
  const [showCall, setShowCall] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [call, setCall] = useState({ to: '', result: '', purpose: '', customerId: '' });
  const [send, setSend] = useState({ channel: 'whatsapp', to: '', body: '', customerId: '' });
  const [template, setTemplate] = useState({ key: '', body: '', channel: 'whatsapp' });

  const items = itemsOf(log.data);
  const failed = items.filter((r) => ['failed', 'not-configured'].includes(str(r.status)));
  const templateItems = itemsOf(templates.data);

  async function logCall(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { to: call.to, result: call.result, purpose: call.purpose };
    if (call.customerId) dto.customerId = call.customerId;
    if (await action.run((c) => c.logManualCall(dto))) {
      setShowCall(false);
      log.reload();
    }
  }

  async function sendNow(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { channel: send.channel, to: send.to, body: send.body };
    if (send.customerId) dto.customerId = send.customerId;
    if (await action.run((c) => c.sendMessage(dto))) {
      setShowSend(false);
      log.reload();
    }
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.upsertMessageTemplate(template.key, { body: template.body, channel: template.channel }))) {
      setShowTemplate(false);
      templates.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={MessageSquare}
        title="Communication Center"
        description="WhatsApp, email, SMS and calls in one log. Statuses are the provider outcomes the API recorded; nothing is marked sent without provider confirmation."
      >
        <button type="button" className="btn secondary" onClick={() => setShowCall(true)}>
          <PhoneCall size={15} /> Log a call
        </button>
        <button type="button" className="btn" onClick={() => setShowSend(true)}>
          <Send size={15} /> Send message
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Log entries (view)" value={log.loading ? '...' : String(items.length)} />
        <StatCard label="Failed or not configured" value={String(failed.length)} note="Providers answer not-configured until credentials are added" />
        <StatCard label="Templates" value={templates.loading ? '...' : String(templateItems.length)} />
      </StatGrid>

      <Card title="Communication log">
        <StatusTabs options={CHANNEL_TABS} value={channel} onChange={setChannel} />
        {log.loading ? (
          <LoadingNote />
        ) : log.error ? (
          <ErrorNote error={log.error} onRetry={log.reload} />
        ) : (
          <DataTable
            emptyText="No communication recorded on this channel yet."
            columns={[
              { key: 'channel', label: 'Channel' },
              { key: 'to', label: 'To' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'purpose', label: 'Purpose' },
              { key: 'staffId', label: 'Staff' },
              { key: 'createdAt', label: 'When', date: true },
            ]}
            rows={items}
          />
        )}
      </Card>

      <Card
        title="Message templates"
        actions={<button type="button" className="btn secondary small" onClick={() => setShowTemplate(true)}>Add or update template</button>}
      >
        {templates.loading ? (
          <LoadingNote />
        ) : templates.error ? (
          <ErrorNote error={templates.error} onRetry={templates.reload} />
        ) : (
          <DataTable
            searchable={false}
            emptyText="No templates stored yet. Built-in templates still apply where the API provides them."
            columns={[
              { key: 'key', label: 'Key' },
              { key: 'channel', label: 'Channel' },
              { key: 'source', label: 'Source' },
              { key: 'body', label: 'Body', render: (r) => str(r.body).slice(0, 90) },
              {
                key: 'del', label: 'Action',
                render: (r) => str(r.source) === 'stored' ? (
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={async () => {
                      if (await action.run((c) => c.deleteMessageTemplate(str(r.key)))) templates.reload();
                    }}
                  >
                    Delete
                  </button>
                ) : <span className="note">Built-in</span>,
              },
            ]}
            rows={templateItems}
          />
        )}
      </Card>

      {showCall ? (
        <Modal title="Log a manual call" onClose={() => setShowCall(false)}>
          <form onSubmit={logCall}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="Number called">
                <TextInput required value={call.to} onChange={(e) => setCall({ ...call, to: e.target.value })} />
              </Field>
              <Field label="Customer ID (optional)">
                <TextInput value={call.customerId} onChange={(e) => setCall({ ...call, customerId: e.target.value })} />
              </Field>
            </div>
            <Field label="Result">
              <TextInput required value={call.result} onChange={(e) => setCall({ ...call, result: e.target.value })} placeholder="Reached and confirmed the order" />
            </Field>
            <Field label="Purpose">
              <TextInput required value={call.purpose} onChange={(e) => setCall({ ...call, purpose: e.target.value })} placeholder="Order confirmation" />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Save call log</button>
          </form>
        </Modal>
      ) : null}

      {showSend ? (
        <Modal title="Send a message" onClose={() => setShowSend(false)}>
          <form onSubmit={sendNow}>
            <ActionError error={action.error} />
            <p className="note">
              The API checks consent and Do Not Contact status first. With no provider configured,
              the attempt is recorded as not-configured, not as sent.
            </p>
            <div className="form-grid">
              <Field label="Channel">
                <SelectInput value={send.channel} onChange={(e) => setSend({ ...send, channel: e.target.value })}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </SelectInput>
              </Field>
              <Field label="To">
                <TextInput required value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })} />
              </Field>
            </div>
            <Field label="Message">
              <TextArea required value={send.body} onChange={(e) => setSend({ ...send, body: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Send</button>
          </form>
        </Modal>
      ) : null}

      {showTemplate ? (
        <Modal title="Message template" onClose={() => setShowTemplate(false)}>
          <form onSubmit={saveTemplate}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="Key">
                <TextInput required value={template.key} onChange={(e) => setTemplate({ ...template, key: e.target.value })} placeholder="cart-recovery-1" />
              </Field>
              <Field label="Channel">
                <SelectInput value={template.channel} onChange={(e) => setTemplate({ ...template, channel: e.target.value })}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </SelectInput>
              </Field>
            </div>
            <Field label="Body">
              <TextArea required value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Save template</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
