'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  Clock,
  Download,
  Globe,
  Hourglass,
  LifeBuoy,
  Loader,
  Mail,
  MessageCircle,
  MonitorSmartphone,
  Phone,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Settings2,
  Timer,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import {
  COMMUNICATION_CHANNELS,
  SUPPORT_CHANNELS,
  SUPPORT_CHANNEL_LABELS,
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_STATUS_LABELS,
  SUPPORT_TICKET_TRANSITIONS,
  type CommunicationChannel,
  type SlaTargets,
  type SupportChannel,
  type SupportPriority,
  type SupportTicket,
  type SupportTicketStatus,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useStaffDirectory } from '../../../lib/staff-directory';
import { useAuth } from '../../../components/auth-provider';
import { AreaChart, DonutChart } from '../../../components/charts';
import { downloadCsv, toCsv } from '../../../lib/csv';
import {
  Badge,
  CardHead,
  Drawer,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
  Pagination,
  StatusTabs,
  pageCountFor,
  paginate,
} from '../../../components/ui';

const PAGE_SIZE = 10;

const CHANNEL_COLORS: Record<SupportChannel, string> = {
  admin: '#1C1B17',
  phone: '#1E6B34',
  website: '#45423B',
  whatsapp: '#6E695D',
  email: '#8A5A00',
  messenger: '#55524A',
  'in-person': '#6E695D',
};

const CHANNEL_ICONS: Record<SupportChannel, typeof Phone> = {
  admin: MonitorSmartphone,
  phone: Phone,
  website: Globe,
  whatsapp: MessageCircle,
  email: Mail,
  messenger: MessageCircle,
  'in-person': User,
};

type TabKey = 'all' | 'open' | 'in-progress' | 'pending' | 'resolved' | 'closed';
type SortKey = 'updatedAt' | 'createdAt' | 'priority' | 'status' | 'subject';

const PRIORITY_ORDER: Record<SupportPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const CANNED_CATEGORIES = ['general', 'delivery', 'payment', 'returns', 'sizing', 'other'] as const;

function isPendingStatus(status: SupportTicketStatus): boolean {
  return status === 'pending' || status === 'waiting-customer' || status === 'waiting-staff';
}

function tabMatches(tab: TabKey, ticket: SupportTicket): boolean {
  if (tab === 'all') return true;
  if (tab === 'pending') return isPendingStatus(ticket.status);
  return ticket.status === tab;
}

function resolutionDeadline(ticket: SupportTicket, sla: SlaTargets | null): Date | null {
  if (!sla) return null;
  const hours = sla[ticket.priority].resolutionHours;
  return new Date(new Date(ticket.createdAt).getTime() + hours * 3600_000);
}

function isOverdue(ticket: SupportTicket, sla: SlaTargets | null, now: number): boolean {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return false;
  const deadline = resolutionDeadline(ticket, sla);
  return deadline !== null && deadline.getTime() < now;
}

function perDaySeries(items: SupportTicket[], days: number): { label: string; value: number }[] {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    buckets.set(day.toISOString().slice(0, 10), 0);
  }
  for (const item of items) {
    const key = item.createdAt.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([key, value]) => ({
    label: new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    value,
  }));
}

function cannedCategory(key: string): string {
  const parts = key.split('-');
  return parts.length > 2 ? parts[1]! : 'general';
}

function cannedName(key: string): string {
  const parts = key.split('-');
  return parts.length > 2 ? parts.slice(2).join('-') : key.replace(/^canned-/, '');
}

/**
 * Customer Support: the staff ticket inbox. No public intake is
 * wired: the storefront does not submit tickets, so every ticket
 * here is created or logged by staff and labelled with the true
 * channel the contact arrived through. SLA targets come from the
 * store settings (slaTargets) and use elapsed time only.
 */
export default function SupportPage() {
  const { session } = useAuth();
  const canEdit = session.principal?.permissions.includes('customers.edit') ?? false;
  const myId = session.principal?.id ?? '';
  const { staff } = useStaffDirectory();
  const staffName = (id: string | null): string => {
    if (!id) return 'Unassigned';
    if (id === myId) return 'You';
    return staff.find((member) => member.id === id)?.displayName ?? id;
  };

  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<SupportPriority | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkStatus, setBulkStatus] = useState<SupportTicketStatus | ''>('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [showSla, setShowSla] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tickets = useData((client) => client.listSupportTickets(), []);
  const settings = useData((client) => client.getStoreSettings(), []);
  const templates = useData((client) => client.listMessageTemplates(), []);
  const detail = useData(
    (client) => (selectedId ? client.getSupportTicket(selectedId) : Promise.resolve(null)),
    [selectedId],
  );
  const sla: SlaTargets | null = settings.data?.slaTargets ?? null;
  const now = Date.now();
  const all = useMemo(() => tickets.data?.items ?? [], [tickets.data]);

  const counts = useMemo(() => ({
    all: all.length,
    open: all.filter((t) => t.status === 'open').length,
    inProgress: all.filter((t) => t.status === 'in-progress').length,
    pending: all.filter((t) => isPendingStatus(t.status)).length,
    resolved: all.filter((t) => t.status === 'resolved').length,
    closed: all.filter((t) => t.status === 'closed').length,
    overdue: all.filter((t) => isOverdue(t, sla, now)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [all, sla]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = all.filter((ticket) => {
      if (!tabMatches(tab, ticket)) return false;
      if (statusFilter && ticket.status !== statusFilter) return false;
      if (priorityFilter && ticket.priority !== priorityFilter) return false;
      if (query) {
        const haystack = `${ticket.id} ${ticket.subject} ${ticket.customerName} ${ticket.customerPhone} ${ticket.customerEmail ?? ''} ${ticket.orderNumber ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      if (sortKey === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (sortKey === 'subject') return a.subject.localeCompare(b.subject);
      if (sortKey === 'status') return a.status.localeCompare(b.status);
      if (sortKey === 'createdAt') return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return rows;
  }, [all, tab, statusFilter, priorityFilter, search, sortKey]);

  const pageRows = paginate(filtered, page, PAGE_SIZE);
  const channelSlices = SUPPORT_CHANNELS
    .map((channel) => ({
      label: SUPPORT_CHANNEL_LABELS[channel],
      value: all.filter((t) => t.channel === channel).length,
      color: CHANNEL_COLORS[channel],
    }))
    .filter((slice) => slice.value > 0);
  const trend = useMemo(() => perDaySeries(all, 14), [all]);
  const canned = (templates.data?.items ?? []).filter((t) => t.key.startsWith('canned-'));

  function toggleSelected(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runBulk(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setBulkError(null);
    try {
      await action();
      setSelected(new Set());
      tickets.reload();
      detail.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setBulkError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  const selectedTickets = all.filter((t) => selected.has(t.id));
  const legalBulkStatuses = bulkStatus
    ? selectedTickets.length > 0 && selectedTickets.every((t) => SUPPORT_TICKET_TRANSITIONS[t.status].includes(bulkStatus))
    : false;

  function exportCsv(): void {
    downloadCsv('support-tickets.csv', toCsv(
      ['Ticket ID', 'Customer', 'Phone', 'Email', 'Subject', 'Channel', 'Priority', 'Status', 'Assigned To', 'Order', 'Created At', 'Updated At'],
      filtered.map((t) => [t.id, t.customerName, t.customerPhone, t.customerEmail, t.subject, SUPPORT_CHANNEL_LABELS[t.channel], SUPPORT_PRIORITY_LABELS[t.priority], SUPPORT_TICKET_STATUS_LABELS[t.status], staffName(t.assignedToId), t.orderNumber, t.createdAt, t.updatedAt]),
    ));
  }

  const ticket = detail.data;

  return (
    <section>
      <ModuleHeader icon={LifeBuoy} title="Customer Support" description="Staff logged tickets from every contact channel, with SLA targets, canned replies and a full conversation history per ticket.">
        <button type="button" className="btn-secondary" onClick={() => setShowSla(true)}><Settings2 size={16} /> SLA Settings</button>
        <button type="button" className="btn-secondary" onClick={() => setShowCanned(true)}><BookOpenText size={16} /> Canned Replies</button>
        <button type="button" className="btn-secondary" onClick={() => setShowChannels(true)}><Radio size={16} /> Support Channels</button>
        {canEdit ? <button type="button" className="btn" onClick={() => setShowCreate(true)}><Plus size={16} /> Create Ticket</button> : null}
      </ModuleHeader>

      {tickets.loading ? <LoadingNote label="Loading tickets..." /> : null}
      {tickets.error ? <ErrorNote error={tickets.error} onRetry={tickets.reload} /> : null}

      {tickets.data ? (
        <>
          <div className="kpi-grid">
            <KpiCard icon={LifeBuoy} label="Total Tickets" value={String(counts.all)} tone="purple" />
            <KpiCard icon={CheckCircle2} label="Resolved" value={String(counts.resolved)} tone="green" />
            <KpiCard icon={Clock} label="Open" value={String(counts.open)} tone="blue" />
            <KpiCard icon={Loader} label="In Progress" value={String(counts.inProgress)} tone="orange" />
            <KpiCard icon={Hourglass} label="Pending" value={String(counts.pending)} note="Waiting states" tone="purple" />
            <KpiCard icon={XCircle} label="Closed" value={String(counts.closed)} tone="blue" />
            <KpiCard icon={AlertTriangle} label="Overdue" value={sla ? String(counts.overdue) : 'Unavailable'} note={sla ? 'Past the resolution target' : 'SLA targets could not be loaded'} tone="orange" />
          </div>

          <StatusTabs
            active={tab}
            onChange={(key) => { setTab(key as TabKey); setPage(1); }}
            tabs={[
              { key: 'all', label: 'All Tickets', count: counts.all },
              { key: 'open', label: 'Open', count: counts.open },
              { key: 'in-progress', label: 'In Progress', count: counts.inProgress },
              { key: 'pending', label: 'Pending', count: counts.pending },
              { key: 'resolved', label: 'Resolved', count: counts.resolved },
              { key: 'closed', label: 'Closed', count: counts.closed },
            ]}
          />

          <div className="grid-cards" style={{ marginTop: 16 }}>
            <div className="card">
              <CardHead icon={Radio} title="Tickets by Channel" />
              {channelSlices.length === 0 ? <EmptyNote>No tickets yet, so no channel split to show.</EmptyNote> : (
                <DonutChart slices={channelSlices} centreLabel="Tickets" centreValue={String(counts.all)} />
              )}
            </div>
            <div className="card">
              <CardHead icon={Timer} title="Ticket Trend (last 14 days)" />
              {all.length === 0 ? <EmptyNote>No tickets yet.</EmptyNote> : <AreaChart points={trend} />}
            </div>
          </div>

          <div className="card filter-card" style={{ marginTop: 16 }}>
            <div className="filter-row">
              <label className="field">Search <span style={{ position: 'relative', display: 'block' }}><Search size={15} style={{ position: 'absolute', left: 9, top: 11 }} /><input className="input" style={{ paddingLeft: 30 }} placeholder="Ticket, customer, subject, order" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></span></label>
              <label className="field">Status
                <select className="select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as SupportTicketStatus | ''); setPage(1); }}>
                  <option value="">All statuses</option>
                  {SUPPORT_TICKET_STATUSES.map((value) => <option key={value} value={value}>{SUPPORT_TICKET_STATUS_LABELS[value]}</option>)}
                </select>
              </label>
              <label className="field">Priority
                <select className="select" value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as SupportPriority | ''); setPage(1); }}>
                  <option value="">All priorities</option>
                  {SUPPORT_PRIORITIES.map((value) => <option key={value} value={value}>{SUPPORT_PRIORITY_LABELS[value]}</option>)}
                </select>
              </label>
              <label className="field">Sort by
                <select className="select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                  <option value="updatedAt">Recently updated</option>
                  <option value="createdAt">Recently created</option>
                  <option value="priority">Priority</option>
                  <option value="status">Status</option>
                  <option value="subject">Subject</option>
                </select>
              </label>
              <div className="filter-actions">
                <button type="button" className="btn-secondary" onClick={() => { setSearch(''); setStatusFilter(''); setPriorityFilter(''); setSortKey('updatedAt'); setPage(1); }}><RotateCcw size={15} /> Reset</button>
                <button type="button" className="btn-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>
              </div>
            </div>
          </div>

          {canEdit && selected.size > 0 ? (
            <div className="card" style={{ marginTop: 16 }}>
              <CardHead icon={Users} title={`Bulk actions (${selected.size} selected)`} />
              <div className="filter-row">
                <label className="field">Assign all to
                  <select className="select" value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
                    <option value="">Choose staff</option>
                    {staff.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
                  </select>
                </label>
                <button type="button" className="btn btn-small" disabled={busy || !bulkAssignee} onClick={() => void runBulk(async () => { for (const t of selectedTickets) await api.assignSupportTicket(t.id, { assignedToId: bulkAssignee }); })}>Apply assignment</button>
                <label className="field">Set status for all
                  <select className="select" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as SupportTicketStatus | '')}>
                    <option value="">Choose status</option>
                    {SUPPORT_TICKET_STATUSES.map((value) => <option key={value} value={value}>{SUPPORT_TICKET_STATUS_LABELS[value]}</option>)}
                  </select>
                </label>
                <button type="button" className="btn btn-small" disabled={busy || !bulkStatus || !legalBulkStatuses} onClick={() => void runBulk(async () => { for (const t of selectedTickets) await api.setSupportTicketStatus(t.id, { status: bulkStatus as SupportTicketStatus }); })}>Apply status</button>
              </div>
              {bulkStatus && !legalBulkStatuses ? <p className="note muted">That status move is not legal for every selected ticket, so it cannot be applied in bulk.</p> : null}
              {bulkError ? <p className="form-error" role="alert">{bulkError}</p> : null}
            </div>
          ) : null}

          <div className="card" style={{ marginTop: 16 }}>
            <CardHead icon={LifeBuoy} title="Tickets" />
            {filtered.length === 0 ? <EmptyNote>No tickets match the current filters.</EmptyNote> : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      {canEdit ? <th aria-label="Select" /> : null}
                      <th>Ticket ID</th><th>Customer</th><th>Subject</th><th>Channel</th><th>Priority</th><th>Status</th><th>Assigned To</th><th>Updated At</th><th>Actions</th>
                    </tr></thead>
                    <tbody>
                      {pageRows.map((item) => {
                        const ChannelIcon = CHANNEL_ICONS[item.channel];
                        return (
                          <tr key={item.id} className="clickable" onClick={() => setSelectedId(item.id)}>
                            {canEdit ? <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ticket ${item.id}`} /></td> : null}
                            <td>{item.id.slice(0, 8)}</td>
                            <td><div className="identity-cell"><span className="avatar-initials">{item.customerName.split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?'}</span><span><span className="identity-main">{item.customerName}</span><span className="identity-sub">{item.customerId ? item.customerPhone : 'Guest contact'}</span></span></div></td>
                            <td>{item.subject}{isOverdue(item, sla, now) ? <span className="badge"> Overdue</span> : null}</td>
                            <td><ChannelIcon size={16} /> {SUPPORT_CHANNEL_LABELS[item.channel]}</td>
                            <td><span className="badge">{SUPPORT_PRIORITY_LABELS[item.priority]}</span></td>
                            <td><Badge>{SUPPORT_TICKET_STATUS_LABELS[item.status]}</Badge></td>
                            <td>{staffName(item.assignedToId)}</td>
                            <td>{formatDateTime(item.updatedAt)}</td>
                            <td><button type="button" className="btn btn-small btn-secondary" onClick={(e) => { e.stopPropagation(); setSelectedId(item.id); }}>Open</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="table-foot"><span className="muted">{filtered.length} ticket(s)</span><Pagination page={page} pageCount={pageCountFor(filtered.length, PAGE_SIZE)} onChange={setPage} /></div>
              </>
            )}
          </div>
        </>
      ) : null}

      {showChannels ? <ChannelsModal onClose={() => setShowChannels(false)} /> : null}
      {showSla ? <SlaModal sla={sla} loading={settings.loading} error={settings.error} canEdit={canEdit} onClose={() => setShowSla(false)} onSaved={() => { settings.reload(); tickets.reload(); }} /> : null}
      {showCanned ? <CannedModal templates={canned} loading={templates.loading} error={templates.error} canEdit={canEdit} onClose={() => setShowCanned(false)} onChanged={templates.reload} /> : null}
      {showCreate ? <CreateTicketModal staff={staff} staffName={staffName} onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); tickets.reload(); setSelectedId(id); }} /> : null}
      {selectedId && ticket ? (
        <TicketDrawer
          ticket={ticket}
          sla={sla}
          canEdit={canEdit}
          staff={staff}
          staffName={staffName}
          canned={canned}
          onClose={() => setSelectedId(null)}
          onChanged={() => { detail.reload(); tickets.reload(); }}
        />
      ) : null}
      {selectedId && detail.loading ? <Drawer title="Ticket" onClose={() => setSelectedId(null)}><LoadingNote label="Loading ticket..." /></Drawer> : null}
      {selectedId && detail.error ? <Drawer title="Ticket" onClose={() => setSelectedId(null)}><ErrorNote error={detail.error} onRetry={detail.reload} /></Drawer> : null}
    </section>
  );
}

function ChannelsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Support Channels" onClose={onClose}>
      <p className="note muted">No public intake is wired. The storefront does not submit tickets, so every ticket here is created or logged by staff and labelled with its true channel.</p>
      <div className="table-wrap"><table><thead><tr><th>Channel</th><th>Availability</th><th>How it works</th></tr></thead>
        <tbody>
          <tr><td>Admin created</td><td><span className="badge">Available</span></td><td>Staff create the ticket directly in this portal.</td></tr>
          <tr><td>Phone</td><td><span className="badge">Available, staff logged</span></td><td>Staff log the call as a ticket after speaking with the customer.</td></tr>
          {(['website', 'whatsapp', 'email', 'messenger', 'in-person'] as SupportChannel[]).map((channel) => (
            <tr key={channel}><td>{SUPPORT_CHANNEL_LABELS[channel]}</td><td><span className="badge">Staff logged only</span></td><td>Available only as a staff logged channel. No automatic intake from this channel is connected.</td></tr>
          ))}
        </tbody></table></div>
    </Modal>
  );
}

function SlaModal({ sla, loading, error, canEdit, onClose, onSaved }: {
  sla: SlaTargets | null; loading: boolean; error: { message: string } | null; canEdit: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SlaTargets | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const values = draft ?? sla;
  function setField(priority: SupportPriority, field: 'firstResponseHours' | 'resolutionHours', raw: string): void {
    if (!values) return;
    const num = Number(raw);
    setDraft({ ...values, [priority]: { ...values[priority], [field]: Number.isFinite(num) ? num : 0 } });
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!values) return;
    setBusy(true); setSaveError(null);
    try {
      await api.updateStoreSettings({ slaTargets: values });
      onSaved(); onClose();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setSaveError(uiError.message);
    } finally { setBusy(false); }
  }
  return (
    <Modal title="SLA Settings" onClose={onClose}>
      <p className="note muted">SLA math is elapsed time. Business hours and holiday calendars are not applied.</p>
      {loading ? <LoadingNote label="Loading SLA targets..." /> : null}
      {error ? <p className="form-error" role="alert">{error.message}</p> : null}
      {values ? (
        <form onSubmit={save}>
          <div className="table-wrap"><table><thead><tr><th>Priority</th><th>First response (hours)</th><th>Resolution (hours)</th></tr></thead>
            <tbody>{SUPPORT_PRIORITIES.map((priority) => (
              <tr key={priority}><td>{SUPPORT_PRIORITY_LABELS[priority]}</td>
                <td><input className="input" type="number" min={0} step="0.5" value={values[priority].firstResponseHours} disabled={!canEdit} onChange={(e) => setField(priority, 'firstResponseHours', e.target.value)} /></td>
                <td><input className="input" type="number" min={0} step="0.5" value={values[priority].resolutionHours} disabled={!canEdit} onChange={(e) => setField(priority, 'resolutionHours', e.target.value)} /></td>
              </tr>))}
            </tbody></table></div>
          {canEdit ? <button type="submit" className="btn" disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Saving...' : 'Save SLA targets'}</button> : <p className="note muted">Your role can view these targets but cannot change them.</p>}
          {saveError ? <p className="form-error" role="alert">{saveError}</p> : null}
        </form>
      ) : null}
    </Modal>
  );
}

type TemplateView = { key: string; channel: CommunicationChannel; subject: string | null; body: string; source: string };

function CannedModal({ templates, loading, error, canEdit, onClose, onChanged }: {
  templates: TemplateView[]; loading: boolean; error: { message: string } | null; canEdit: boolean;
  onClose: () => void; onChanged: () => void;
}) {
  const [category, setCategory] = useState<string>('general');
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CommunicationChannel>('whatsapp');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => {
    const map = new Map<string, TemplateView[]>();
    for (const t of templates) {
      const group = cannedCategory(t.key);
      map.set(group, [...(map.get(group) ?? []), t]);
    }
    return [...map.entries()];
  }, [templates]);
  const preview = body
    .replaceAll('{{customerName}}', 'Sample Customer')
    .replaceAll('{{orderNumber}}', 'DST-1001')
    .replaceAll('{{name}}', 'Sample Customer');

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const key = editingKey ?? `canned-${category}-${slug}`;
    if (!key.startsWith('canned-') || (!editingKey && !slug)) { setFormError('Give the reply a name so its key can be built.'); return; }
    setBusy(true); setFormError(null);
    try {
      await api.upsertMessageTemplate(key, { channel, subject: subject.trim() ? subject.trim() : null, body: body.trim() });
      setName(''); setSubject(''); setBody(''); setEditingKey(null);
      onChanged();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setFormError(uiError.message);
    } finally { setBusy(false); }
  }

  async function remove(key: string): Promise<void> {
    if (!window.confirm(`Delete the canned reply ${key}?`)) return;
    try { await api.deleteMessageTemplate(key); onChanged(); }
    catch (caught) { setFormError(toUiError(caught).message); }
  }

  return (
    <Modal title="Canned Replies" onClose={onClose}>
      <p className="note muted">Canned replies are message templates whose key starts with canned-. Variables such as {'{{customerName}}'} and {'{{orderNumber}}'} are filled in by the send flows. The preview below uses sample values and is labelled as a sample.</p>
      {loading ? <LoadingNote label="Loading canned replies..." /> : null}
      {error ? <p className="form-error" role="alert">{error.message}</p> : null}
      {templates.length === 0 && !loading ? <EmptyNote>No canned replies stored yet.</EmptyNote> : null}
      {groups.map(([group, items]) => (
        <div key={group} style={{ marginTop: 12 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>{group}</h3>
          {items.map((t) => (
            <div key={t.key} className="card" style={{ marginBottom: 8 }}>
              <strong>{cannedName(t.key)}</strong> <span className="muted">({t.key}, {t.channel}{t.subject ? `, subject: ${t.subject}` : ''})</span>
              <p style={{ margin: '6px 0' }}>{t.body}</p>
              {canEdit ? <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-small btn-secondary" onClick={() => { setEditingKey(t.key); setCategory(cannedCategory(t.key)); setName(cannedName(t.key)); setChannel(t.channel); setSubject(t.subject ?? ''); setBody(t.body); }}>Edit</button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => void remove(t.key)}>Delete</button>
              </span> : null}
            </div>
          ))}
        </div>
      ))}
      {canEdit ? (
        <form onSubmit={submit} style={{ marginTop: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{editingKey ? `Edit ${editingKey}` : 'New canned reply'}</h3>
          <div className="filter-row">
            <label className="field">Category
              <select className="select" value={category} disabled={Boolean(editingKey)} onChange={(e) => setCategory(e.target.value)}>
                {CANNED_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="field">Name <input className="input" value={name} disabled={Boolean(editingKey)} onChange={(e) => setName(e.target.value)} required={!editingKey} /></label>
            <label className="field">Channel
              <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as CommunicationChannel)}>
                {COMMUNICATION_CHANNELS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <label className="field" style={{ marginTop: 10 }}>Subject (optional) <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="field" style={{ marginTop: 10 }}>Reply text <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} required /></label>
          {body ? <div className="preview-bubble" style={{ marginTop: 10 }}><span className="muted">Preview with sample values: </span>{preview}</div> : null}
          <button type="submit" className="btn" disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Saving...' : editingKey ? 'Save changes' : 'Create canned reply'}</button>
          {editingKey ? <button type="button" className="btn-secondary" style={{ marginLeft: 8 }} onClick={() => { setEditingKey(null); setBody(''); setSubject(''); setName(''); }}>Cancel edit</button> : null}
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        </form>
      ) : null}
    </Modal>
  );
}

function CreateTicketModal({ staff, onClose, onCreated }: {
  staff: { id: string; displayName: string }[];
  staffName: (id: string | null) => string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [email, setEmail] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderChecked, setOrderChecked] = useState(false);
  const [subject, setSubject] = useState('');
  const [channel, setChannel] = useState<SupportChannel>('phone');
  const [priority, setPriority] = useState<SupportPriority>('normal');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customers = useData(
    (client) => (customerSearch.trim() ? client.listCustomers({ search: customerSearch.trim(), limit: 8 }) : Promise.resolve({ items: [] })),
    [customerSearch],
  );

  async function validateOrder(): Promise<boolean> {
    if (!orderNumber.trim()) { setOrderError(null); setOrderChecked(false); return true; }
    try {
      await api.getStaffOrder(orderNumber.trim());
      setOrderError(null); setOrderChecked(true); return true;
    } catch {
      setOrderError(`Order ${orderNumber.trim()} was not found. Check the number or clear it before creating the ticket.`);
      setOrderChecked(false); return false;
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!(await validateOrder())) return;
    setBusy(true); setFormError(null);
    try {
      const phone = phoneLocal.trim().startsWith('+880') ? phoneLocal.trim() : `+880${phoneLocal.trim().replace(/^0+/, '')}`;
      const created = await api.createSupportTicket({
        customerId: customerId || undefined,
        customerName: customerName.trim(),
        customerPhone: phone,
        customerEmail: email.trim() ? email.trim() : undefined,
        subject: subject.trim(),
        message: message.trim(),
        priority,
        channel,
        category: category.trim() ? category.trim() : undefined,
        orderNumber: orderNumber.trim() ? orderNumber.trim() : undefined,
      });
      let ticketId = created.id;
      if (assignedToId) {
        const assigned = await api.assignSupportTicket(created.id, { assignedToId });
        ticketId = assigned.id;
      }
      if (internalNote.trim()) {
        await api.replySupportTicket(created.id, { body: internalNote.trim(), internal: true });
      }
      onCreated(ticketId);
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setFormError(uiError.message);
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Create Ticket" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">Find an existing customer (optional)
          <input className="input" placeholder="Search by name, phone or email" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
        </label>
        {(customers.data?.items ?? []).length > 0 ? (
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {(customers.data?.items ?? []).map((customer) => (
              <button type="button" key={customer.id} className="btn-secondary" onClick={() => { setCustomerId(customer.id); setCustomerName(customer.fullName); setPhoneLocal(customer.phone.replace(/^\+880/, '')); setEmail(customer.email ?? ''); }}>
                {customer.fullName} ({customer.phone})
              </button>
            ))}
          </div>
        ) : null}
        <div className="filter-row" style={{ marginTop: 12 }}>
          <label className="field">Customer name <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></label>
          <label className="field">Phone (starts with +880) <input className="input" placeholder="+880 1XXX XXXXXX" value={phoneLocal} onChange={(e) => setPhoneLocal(e.target.value)} required /></label>
          <label className="field">Email (optional) <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        </div>
        <div className="filter-row" style={{ marginTop: 10 }}>
          <label className="field">Order number (optional)
            <input className="input" value={orderNumber} onChange={(e) => { setOrderNumber(e.target.value); setOrderChecked(false); setOrderError(null); }} onBlur={() => void validateOrder()} />
          </label>
          <label className="field">Channel
            <select className="select" value={channel} onChange={(e) => setChannel(e.target.value as SupportChannel)}>
              {SUPPORT_CHANNELS.map((value) => <option key={value} value={value}>{SUPPORT_CHANNEL_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="field">Priority
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as SupportPriority)}>
              {SUPPORT_PRIORITIES.map((value) => <option key={value} value={value}>{SUPPORT_PRIORITY_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="field">Category (optional) <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></label>
        </div>
        {orderError ? <p className="form-error" role="alert">{orderError}</p> : null}
        {orderChecked ? <p className="note muted">Order found and will be linked.</p> : null}
        <label className="field" style={{ marginTop: 10 }}>Subject <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required /></label>
        <label className="field" style={{ marginTop: 10 }}>Customer message (their own words) <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} required /></label>
        <div className="filter-row" style={{ marginTop: 10 }}>
          <label className="field">Assigned staff (optional)
            <select className="select" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
            </select>
          </label>
        </div>
        <label className="field" style={{ marginTop: 10 }}>Internal note (optional, staff only) <textarea className="input" rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} /></label>
        <button type="submit" className="btn" disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Creating...' : 'Create ticket'}</button>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
      </form>
    </Modal>
  );
}

type TicketDetail = Awaited<ReturnType<typeof api.getSupportTicket>>;

function TicketDrawer({ ticket, sla, canEdit, staff, staffName, canned, onClose, onChanged }: {
  ticket: TicketDetail;
  sla: SlaTargets | null;
  canEdit: boolean;
  staff: { id: string; displayName: string }[];
  staffName: (id: string | null) => string;
  canned: TemplateView[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [replyBody, setReplyBody] = useState('');
  const [replyInternal, setReplyInternal] = useState(false);
  const [assignTo, setAssignTo] = useState(ticket.assignedToId ?? '');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customer = useData(
    (client) => (ticket.customerId ? client.getCustomer(ticket.customerId) : Promise.resolve(null)),
    [ticket.customerId],
  );
  const customerOrders = useData(
    (client) => (ticket.customerId ? client.listCustomerOrders(ticket.customerId) : Promise.resolve({ items: [] })),
    [ticket.customerId],
  );

  const deadline = resolutionDeadline(ticket, sla);
  const overdue = isOverdue(ticket, sla, Date.now());
  const firstResponseTarget = sla ? new Date(new Date(ticket.createdAt).getTime() + sla[ticket.priority].firstResponseHours * 3600_000) : null;
  const nextStatuses = SUPPORT_TICKET_TRANSITIONS[ticket.status];

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true); setActionError(null);
    try { await action(); onChanged(); }
    catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setActionError(uiError.message);
    } finally { setBusy(false); }
  }

  return (
    <Drawer title={ticket.subject} onClose={onClose}>
      <h3 style={{ margin: '4px 0 8px', fontSize: 15 }}>Customer information</h3>
      <dl className="kv">
        <dt>Name</dt><dd>{ticket.customerName}</dd>
        <dt>Phone</dt><dd>{ticket.customerPhone}</dd>
        <dt>Email</dt><dd>{ticket.customerEmail ?? 'Not recorded'}</dd>
        <dt>Record</dt><dd>{ticket.customerId ? 'Linked customer record' : 'Guest contact, no customer record'}</dd>
        {customer.data ? (<>
          <dt>Customer since</dt><dd>{formatDateTime(customer.data.createdAt)}</dd>
          <dt>Total orders</dt><dd>{customerOrders.data ? customerOrders.data.items.length : customer.data.orderCount}</dd>
        </>) : null}
      </dl>
      <h3 style={{ margin: '16px 0 8px', fontSize: 15 }}>Ticket information</h3>
      <dl className="kv">
        <dt>Ticket ID</dt><dd>{ticket.id}</dd>
        <dt>Channel</dt><dd>{SUPPORT_CHANNEL_LABELS[ticket.channel]}</dd>
        <dt>Category</dt><dd>{ticket.category ?? 'Not set'}</dd>
        <dt>Priority</dt><dd>{SUPPORT_PRIORITY_LABELS[ticket.priority]}</dd>
        <dt>Status</dt><dd>{SUPPORT_TICKET_STATUS_LABELS[ticket.status]}</dd>
        <dt>Order</dt><dd>{ticket.orderNumber ?? 'Not linked'}</dd>
        <dt>Assigned to</dt><dd>{staffName(ticket.assignedToId)}</dd>
        <dt>Created</dt><dd>{formatDateTime(ticket.createdAt)}</dd>
        <dt>Updated</dt><dd>{formatDateTime(ticket.updatedAt)}</dd>
      </dl>
      <h3 style={{ margin: '16px 0 8px', fontSize: 15 }}>SLA</h3>
      {sla ? (
        <dl className="kv">
          <dt>First response</dt>
          <dd>{ticket.firstRespondedAt ? `Responded at ${formatDateTime(ticket.firstRespondedAt)}` : `Not yet responded${firstResponseTarget ? `, target ${formatDateTime(firstResponseTarget.toISOString())}` : ''}`}</dd>
          <dt>Resolution deadline</dt>
          <dd>{deadline ? formatDateTime(deadline.toISOString()) : 'Unavailable'}{overdue ? ' (Overdue)' : ''}</dd>
          <dt>Resolved at</dt><dd>{ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : 'Not resolved'}</dd>
        </dl>
      ) : <p className="note muted">SLA targets could not be loaded, so deadlines are unavailable.</p>}

      <h3 style={{ margin: '16px 0 8px', fontSize: 15 }}>Conversation</h3>
      <div className="timeline">
        {ticket.messages.map((entry) => (
          <div key={entry.id} style={{ marginBottom: 12 }}>
            <div className="note muted" style={{ margin: 0 }}>
              {entry.authorName} ({entry.authorType}), {formatDateTime(entry.createdAt)}
              {entry.internal ? <span className="badge"> Internal note, not visible to the customer</span> : null}
            </div>
            <p style={{ margin: '4px 0 0', lineHeight: 1.6 }}>{entry.body}</p>
          </div>
        ))}
      </div>

      {canEdit ? (
        <>
          <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api.replySupportTicket(ticket.id, { body: replyBody.trim(), internal: replyInternal }); setReplyBody(''); setReplyInternal(false); }); }}>
            <label className="field">Insert a canned reply
              <select className="select" defaultValue="" onChange={(e) => { const found = canned.find((t) => t.key === e.target.value); if (found) setReplyBody(found.body); e.target.value = ''; }}>
                <option value="">Choose a canned reply</option>
                {canned.map((t) => <option key={t.key} value={t.key}>{cannedCategory(t.key)}: {cannedName(t.key)}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginTop: 10 }}>Reply or internal note
              <textarea className="input" rows={3} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} required />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input type="checkbox" checked={replyInternal} onChange={(e) => setReplyInternal(e.target.checked)} />
              Internal note, not visible to the customer
            </label>
            <button type="submit" className="btn btn-small" disabled={busy || ticket.status === 'closed'} style={{ marginTop: 10 }}>{busy ? 'Saving...' : 'Add to ticket'}</button>
          </form>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'flex-end' }}>
            <label className="field">Set status
              <select className="select" defaultValue="" disabled={nextStatuses.length === 0} onChange={(e) => { if (e.target.value) void run(() => api.setSupportTicketStatus(ticket.id, { status: e.target.value as SupportTicketStatus })); }}>
                <option value="">{SUPPORT_TICKET_STATUS_LABELS[ticket.status]} (current)</option>
                {nextStatuses.map((value) => <option key={value} value={value}>{SUPPORT_TICKET_STATUS_LABELS[value]}</option>)}
              </select>
            </label>
            {nextStatuses.length === 0 ? <span className="note muted">Closed is terminal. Create a new ticket instead of reopening.</span> : null}
            <label className="field">Assign to
              <select className="select" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-small btn-secondary" disabled={busy} onClick={() => void run(() => api.assignSupportTicket(ticket.id, { assignedToId: assignTo ? assignTo : null }))}>Apply assignment</button>
          </div>
        </>
      ) : (
        <p className="note muted">Your role can view tickets but cannot reply or change them (the customers.edit permission is required).</p>
      )}
      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
    </Drawer>
  );
}
