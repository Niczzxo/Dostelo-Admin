'use client';

import { useState, type FormEvent } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, Field, KeyValues, LoadingNote, Modal,
  ModuleHeader, SelectInput, StatCard, StatGrid, StatusBadge, TextInput, Timeline, Unavailable,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../lib/types';

/* Returns & Refunds: return requests from GET /v1/admin/returns
   with the full working flow the API exposes: review, request
   info, assign inspector, schedule pickup, in transit, received,
   inspection start and complete, approve, reject, refund hand-off
   to Payments, complete, plus evidence viewing and the exchange
   flow. An approved exchange shows the linked replacement order
   the API created; no replacement order is claimed before that.
   Refund money movement itself stays in Payments & Finance. */
const FLOW_ACTIONS: Array<{ action: string; label: string }> = [
  { action: 'review', label: 'Start review' },
  { action: 'request-info', label: 'Request info' },
  { action: 'schedule-pickup', label: 'Schedule pickup' },
  { action: 'in-transit', label: 'Mark in transit' },
  { action: 'received', label: 'Mark received' },
  { action: 'inspection/start', label: 'Start inspection' },
  { action: 'approve', label: 'Approve' },
  { action: 'reject', label: 'Reject' },
  { action: 'refund', label: 'Hand off refund' },
  { action: 'complete', label: 'Complete' },
];

export default function ReturnsPage() {
  const returns = useData((c) => c.listReturns({}));
  const action = useAction();
  const [selectedId, setSelectedId] = useState('');
  const detail = useData(
    (c) => (selectedId ? c.getReturnDetail(selectedId) : Promise.resolve(null)),
    [selectedId],
  );
  const evidence = useData(
    (c) => (selectedId ? c.gap.listReturnEvidence(selectedId) : Promise.resolve(null)),
    [selectedId],
  );
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ orderNumber: '', reason: '', type: 'return' });
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [exchangeNote, setExchangeNote] = useState('');

  const items = itemsOf(returns.data);
  const detailRec = asRec(detail.data);
  const request = asRec(detailRec.request ?? detail.data);
  const events = itemsOf(detailRec.events);
  const evidenceItems = evidence.data ? itemsOf(evidence.data) : [];
  const exchangeOrder = asRec(request.exchangeOrder ?? request.replacementOrder);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.createReturn(form))) {
      setCreating(false);
      returns.reload();
    }
  }

  async function flow(actionName: string) {
    if (!selectedId) return;
    if (await action.run((c) => c.returnAction(selectedId, actionName))) {
      returns.reload();
      detail.reload();
    }
  }

  async function addEvidence(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.gap.addReturnEvidence(selectedId, { url: evidenceUrl }))) {
      setEvidenceUrl('');
      evidence.reload();
    }
  }

  async function createExchange(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.gap.createExchange(selectedId, { note: exchangeNote }))) {
      detail.reload();
      returns.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={RotateCcw}
        title="Returns & Refunds"
        description="Return and exchange intake, evidence, inspection and the refund hand-off to Payments. Select a request to work it."
      >
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          <Plus size={15} /> New return request
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Requests" value={returns.loading ? '...' : String(items.length)} />
        <StatCard label="Awaiting review" value={String(items.filter((r) => ['requested', 'pending'].includes(str(r.status))).length)} />
        <StatCard label="Approved" value={String(items.filter((r) => str(r.status) === 'approved').length)} />
        <StatCard label="Refunded" value={String(items.filter((r) => str(r.status) === 'refunded').length)} />
      </StatGrid>

      <Card title="Requests">
        {returns.loading ? (
          <LoadingNote />
        ) : returns.error ? (
          <ErrorNote error={returns.error} onRetry={returns.reload} />
        ) : (
          <DataTable
            emptyText="No return requests yet."
            columns={[
              { key: 'id', label: 'Request', render: (r) => <button type="button" className="btn secondary small" onClick={() => setSelectedId(str(r.id))}>{str(r.id).slice(0, 10)}...</button> },
              { key: 'orderNumber', label: 'Order' },
              { key: 'type', label: 'Type' },
              { key: 'reason', label: 'Reason' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'createdAt', label: 'Requested', date: true },
            ]}
            rows={items}
          />
        )}
      </Card>

      {selectedId ? (
        <>
          <Card title="Selected request">
            {detail.loading ? (
              <LoadingNote />
            ) : detail.error ? (
              <ErrorNote error={detail.error} onRetry={detail.reload} />
            ) : (
              <>
                <KeyValues
                  entries={[
                    ['Request ID', str(request.id)],
                    ['Order', str(request.orderNumber)],
                    ['Type', str(request.type)],
                    ['Reason', str(request.reason)],
                    ['Status', <StatusBadge key="s" status={request.status} />],
                    ['Inspector', str(request.inspectorId ?? request.assigneeId) || 'Unassigned'],
                    ['Refund hand-off', str(request.refundId) || 'Not handed off yet'],
                  ]}
                />
                <div className="btn-row" style={{ marginTop: 14 }}>
                  {FLOW_ACTIONS.map((item) => (
                    <button key={item.action} type="button" className="btn secondary small" disabled={action.busy} onClick={() => void flow(item.action)}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="note" style={{ marginTop: 10 }}>
                  The API accepts only the transitions that are legal for the current state and
                  answers with an error for the rest; that error is shown above, not hidden.
                  Inspection completion takes its outcome from the API flow on the stored request.
                </p>
              </>
            )}
          </Card>

          <div className="section-grid">
            <Card title="Evidence">
              {evidence.loading ? (
                <LoadingNote />
              ) : evidence.data === null ? (
                <Unavailable title="Evidence endpoints are not available on the running API yet.">
                  Viewing and adding evidence needs GET and POST /v1/admin/returns/:id/evidence.
                  Until then, evidence files are not claimed to be stored anywhere.
                </Unavailable>
              ) : (
                <>
                  <div className="thumb-row">
                    {evidenceItems.map((item, index) => (
                      <a key={str(item.id ?? index)} href={str(item.url)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="thumb" src={str(item.url)} alt={str(item.name ?? 'Return evidence')} />
                      </a>
                    ))}
                    {evidenceItems.length === 0 ? <span className="note">No evidence attached yet.</span> : null}
                  </div>
                  <form onSubmit={addEvidence} style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <TextInput placeholder="Evidence file URL" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} required />
                    <button type="submit" className="btn secondary" disabled={action.busy}>Attach</button>
                  </form>
                </>
              )}
            </Card>
            <Card title="Exchange">
              {str(exchangeOrder.orderNumber ?? request.exchangeOrderNumber) ? (
                <KeyValues
                  entries={[
                    ['Replacement order', str(exchangeOrder.orderNumber ?? request.exchangeOrderNumber)],
                    ['Status', str(exchangeOrder.status)],
                  ]}
                />
              ) : (
                <form onSubmit={createExchange}>
                  <p className="note">
                    Approving an exchange asks the API to create the linked replacement order. The
                    replacement order number appears here only after the API returns it.
                  </p>
                  <Field label="Exchange note">
                    <TextInput value={exchangeNote} onChange={(e) => setExchangeNote(e.target.value)} placeholder="Size exchange, same product" />
                  </Field>
                  <button type="submit" className="btn" disabled={action.busy}>Approve exchange and create replacement order</button>
                </form>
              )}
            </Card>
          </div>

          <Card title="History">
            <Timeline items={events} />
          </Card>
        </>
      ) : null}

      {creating ? (
        <Modal title="New return request" onClose={() => setCreating(false)}>
          <form onSubmit={create}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="Order number">
                <TextInput required value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} />
              </Field>
              <Field label="Type">
                <SelectInput value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="return">Return</option>
                  <option value="exchange">Exchange</option>
                </SelectInput>
              </Field>
            </div>
            <Field label="Reason">
              <TextInput required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Create request</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
