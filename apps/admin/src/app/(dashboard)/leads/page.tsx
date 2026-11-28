'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  CheckCheck,
  Download,
  Eye,
  Filter,
  Mail,
  MessageCircle,
  NotebookPen,
  PhoneCall,
  PieChart,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Target,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type ContactChannel,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from '@dostelo/types';
import { api, formatDateTime, formatMinor, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useStaffDirectory } from '../../../lib/staff-directory';
import { useAuth } from '../../../components/auth-provider';
import { DonutChart } from '../../../components/charts';
import { downloadCsv, toCsv } from '../../../lib/csv';
import {
  Badge,
  BandChip,
  CardHead,
  Drawer,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
  Pagination,
  ScoreBand,
  StatusTabs,
  pageCountFor,
  paginate,
} from '../../../components/ui';
import {
  AssignForm,
  ContactSection,
  FollowUpSection,
  LEAD_BASIS_LABELS,
  LEAD_NEXT,
  StatusMoves,
} from './lead-actions';

const PAGE_SIZE = 10;

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: '#1C1B17',
  qualified: '#45423B',
  contacted: '#6E695D',
  interested: '#8A5A00',
  'follow-up-required': '#55524A',
  negotiation: '#8A5A00',
  converted: '#1E6B34',
  lost: '#6E695D',
  'do-not-contact': '#B42318',
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  'buyer-intelligence': 'Buyer Intelligence',
  'guest-checkout': 'Guest Checkout',
  'contact-form': 'Contact Form',
  manual: 'Manual',
};

type RangeKey = '7' | '30' | '90' | 'all';
type ScoreBandFilter = 'all' | 'hot' | 'warm' | 'cold' | 'unscored';
type SortKey = 'identity' | 'score' | 'source' | 'status' | 'updatedAt' | 'assignee';
type DrawerIntent =
  | { kind: 'contact'; channel: ContactChannel; purpose: string; nonce: number }
  | { kind: 'followup'; title: string; nonce: number }
  | { kind: 'assign'; nonce: number }
  | null;

function leadIdentity(lead: Lead): string {
  return lead.fullName ?? lead.email ?? lead.phone ?? `Anonymous lead ${lead.id}`;
}

function leadInitials(lead: Lead): string {
  if (lead.fullName) {
    return lead.fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
  if (lead.email) return lead.email.charAt(0).toUpperCase();
  if (lead.phone) return lead.phone.replace(/\D/g, '').charAt(0) || '?';
  return '?';
}

function bandOf(lead: Lead): 'hot' | 'warm' | 'cold' | 'unscored' {
  if (lead.score === null) return 'unscored';
  if (lead.score >= 70) return 'hot';
  if (lead.score >= 40) return 'warm';
  return 'cold';
}

function rangeStart(key: RangeKey): string | null {
  if (key === 'all') return null;
  const days = Number(key);
  return new Date(Date.now() - (days - 1) * 24 * 60 * 60_000).toISOString();
}

function csvRows(rows: Lead[]): string {
  return toCsv(
    ['Lead ID', 'Name', 'Email', 'Phone', 'Status', 'Source', 'Score', 'Contact basis', 'Assigned to', 'Opted out', 'Created', 'Last activity'],
    rows.map((lead) => [
      lead.id,
      lead.fullName,
      lead.email,
      lead.phone,
      LEAD_STATUS_LABELS[lead.status],
      SOURCE_LABELS[lead.source],
      lead.score,
      lead.contactBasis ?? '',
      lead.assigneeId ?? '',
      lead.optedOut ? 'yes' : 'no',
      lead.createdAt,
      lead.updatedAt,
    ]),
  );
}

/** Add Lead modal: a manual enquiry recorded through POST /v1/leads.
 * Only the fields LeadCreate accepts are offered, and the API rule
 * that at least one identifier is required is shown up front. */
function AddLeadModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<LeadSource>('manual');
  const [visitorId, setVisitorId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createLead({
        fullName: fullName.trim() ? fullName.trim() : undefined,
        email: email.trim() ? email.trim() : undefined,
        phone: phone.trim() ? phone.trim() : undefined,
        source,
        visitorId: visitorId.trim() ? visitorId.trim() : undefined,
        sessionId: sessionId.trim() ? sessionId.trim() : undefined,
        customerId: customerId.trim() ? customerId.trim() : undefined,
        note: note.trim() ? note.trim() : undefined,
      });
      onDone();
      onClose();
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
    <Modal title="Add Lead" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="note muted" style={{ marginTop: 0 }}>
          Records a submitted contact form or an offline enquiry. At
          least one identifier is required: an email, a phone number,
          a visitor id or a customer id.
        </p>
        <label className="field">
          Full name
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="field">
          Email
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Phone (Bangladesh format)
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
        </label>
        <label className="field">
          Lead source
          <select className="select" value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
            {LEAD_SOURCES.map((value) => (
              <option key={value} value={value}>
                {SOURCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Visitor id (optional)
          <input className="input" value={visitorId} onChange={(e) => setVisitorId(e.target.value)} />
        </label>
        <label className="field">
          Session id (optional)
          <input className="input" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
        </label>
        <label className="field">
          Customer id (optional)
          <input className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
        </label>
        <label className="field">
          Note (optional)
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Adding...' : 'Add lead'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Lead details drawer: identity, pipeline, assignment, buyer
 * activity for a linked session, contact history and follow-ups,
 * all from the lead detail, contact attempts and buyer session
 * endpoints. */
function LeadDrawer({
  leadId,
  intent,
  onClose,
  onChanged,
}: {
  leadId: string;
  intent: DrawerIntent;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canAssign = permissions.includes('leads.assign');
  const canEdit = permissions.includes('leads.edit');
  const canContact = permissions.includes('leads.contact');

  const detail = useData((client) => client.getLead(leadId), [leadId]);
  const attempts = useData(
    (client) => client.listContactAttempts(leadId),
    [leadId],
  );
  const lead = detail.data?.lead;
  const sessionId = lead?.sessionId ?? null;
  const buyer = useData(
    (client) =>
      sessionId
        ? client.getBuyerSession(sessionId)
        : Promise.resolve(null),
    [sessionId],
  );

  function changed(): void {
    detail.reload();
    attempts.reload();
    onChanged();
  }

  const suppressed =
    lead !== undefined && (lead.optedOut || lead.status === 'do-not-contact');
  const contactKey =
    intent?.kind === 'contact' ? `contact-${intent.nonce}` : 'contact';
  const followKey =
    intent?.kind === 'followup' ? `follow-${intent.nonce}` : 'follow';

  return (
    <Drawer title={lead ? leadIdentity(lead) : 'Lead details'} onClose={onClose}>
      {detail.loading ? <LoadingNote label="Loading lead..." /> : null}
      {detail.error ? (
        <ErrorNote error={detail.error} onRetry={detail.reload} />
      ) : null}
      {lead ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {suppressed ? (
            <p className="note error-note" role="alert">
              Do not contact. This lead opted out
              {lead.optedOutAt ? ` on ${formatDateTime(lead.optedOutAt)}` : ''}.
              Contact actions are disabled and the API refuses further attempts.
            </p>
          ) : null}

          <div>
            <CardHead title="Identity" />
            <dl className="kv">
              <dt>Status</dt>
              <dd>
                <Badge>{LEAD_STATUS_LABELS[lead.status]}</Badge>
              </dd>
              <dt>Name</dt>
              <dd>{lead.fullName ?? 'Not recorded'}</dd>
              <dt>Email</dt>
              <dd>{lead.email ?? 'Not recorded'}</dd>
              <dt>Phone</dt>
              <dd>{lead.phone ?? 'Not recorded'}</dd>
              <dt>Identity verification</dt>
              <dd>
                {lead.contactBasis
                  ? (LEAD_BASIS_LABELS[lead.contactBasis] ?? lead.contactBasis)
                  : 'No contact basis recorded: this lead is not contactable'}
              </dd>
              <dt>Lead score</dt>
              <dd>
                <ScoreBand score={lead.score} />
              </dd>
              <dt>Source</dt>
              <dd>{SOURCE_LABELS[lead.source]}</dd>
              <dt>Contact permissions</dt>
              <dd>
                {suppressed
                  ? 'Do not contact'
                  : lead.contactBasis
                    ? `Contactable (${LEAD_BASIS_LABELS[lead.contactBasis] ?? lead.contactBasis})`
                    : 'Not contactable: no basis recorded'}
              </dd>
              <dt>Assigned to</dt>
              <dd>{lead.assigneeId ?? 'Unassigned'}</dd>
              <dt>Customer</dt>
              <dd>
                {lead.customerId ? (
                  <Link href={`/crm/${lead.customerId}`}>View CRM profile</Link>
                ) : (
                  'Not linked'
                )}
              </dd>
              <dt>Created</dt>
              <dd>{formatDateTime(lead.createdAt)}</dd>
              <dt>Last activity</dt>
              <dd>{formatDateTime(lead.updatedAt)}</dd>
              {lead.note ? (
                <>
                  <dt>Note</dt>
                  <dd>{lead.note}</dd>
                </>
              ) : null}
            </dl>
            <p style={{ marginTop: 10 }}>
              <Link className="btn btn-secondary btn-small" href={`/leads/${lead.id}`}>
                Open full lead page
              </Link>
            </p>
          </div>

          {lead.sessionId ? (
            <div>
              <CardHead title="Buyer activity" />
              {buyer.loading ? (
                <LoadingNote label="Loading buyer session..." />
              ) : buyer.error ? (
                <ErrorNote error={buyer.error} onRetry={buyer.reload} />
              ) : buyer.data ? (
                <dl className="kv">
                  <dt>Session score</dt>
                  <dd>
                    <ScoreBand score={buyer.data.leadScore} /> ({buyer.data.leadBand})
                  </dd>
                  <dt>Events recorded</dt>
                  <dd>{buyer.data.eventCount}</dd>
                  <dt>Product views</dt>
                  <dd>{buyer.data.productViews}</dd>
                  <dt>Cart value</dt>
                  <dd>{formatMinor(buyer.data.cartValueMinor)}</dd>
                  <dt>First seen</dt>
                  <dd>{formatDateTime(buyer.data.firstSeenAt)}</dd>
                  <dt>Last seen</dt>
                  <dd>{formatDateTime(buyer.data.lastSeenAt)}</dd>
                </dl>
              ) : (
                <EmptyNote>No buyer session is linked to this lead.</EmptyNote>
              )}
            </div>
          ) : null}

          <div>
            <CardHead title="Pipeline" />
            {canEdit ? (
              <StatusMoves lead={lead} onDone={changed} />
            ) : (
              <p className="note muted">
                Your role cannot move leads (the leads.edit permission is required).
              </p>
            )}
            <p className="note muted" style={{ marginTop: 10 }}>
              Status history is recorded in the audit log.{' '}
              <Link href="/security">Open Security and Audit Log</Link>
            </p>
          </div>

          <div>
            <CardHead title="Assignment" />
            {canAssign ? (
              <AssignForm lead={lead} onDone={changed} />
            ) : (
              <p className="note muted">
                Your role cannot assign leads (the leads.assign permission is required).
              </p>
            )}
          </div>

          <div>
            <CardHead title="Follow-up tasks" />
            <FollowUpSection
              key={followKey}
              lead={lead}
              tasks={detail.data?.followUpTasks ?? []}
              canEdit={canEdit}
              onDone={changed}
              defaultTitle={intent?.kind === 'followup' ? intent.title : undefined}
            />
          </div>

          <div>
            <CardHead title="Communication history and notes" />
            {attempts.loading ? (
              <LoadingNote label="Loading contact attempts..." />
            ) : attempts.error ? (
              <ErrorNote error={attempts.error} onRetry={attempts.reload} />
            ) : (
              <ContactSection
                key={contactKey}
                lead={lead}
                attempts={attempts.data?.items ?? detail.data?.attempts ?? []}
                canContact={canContact}
                onDone={changed}
                defaultChannel={intent?.kind === 'contact' ? intent.channel : undefined}
                defaultPurpose={intent?.kind === 'contact' ? intent.purpose : undefined}
              />
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

export default function LeadsPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canCreate = permissions.includes('leads.create');
  const canAssign = permissions.includes('leads.assign');
  const canEdit = permissions.includes('leads.edit');
  const { staff, canRead: canReadStaff } = useStaffDirectory();

  const { data, error, loading, reload } = useData(
    (client) => client.listLeads({}),
    [],
  );
  const leads = useMemo(() => data?.items ?? [], [data]);

  const [rangeKey, setRangeKey] = useState<RangeKey>('30');
  const [tab, setTab] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);

  // Filter card: draft values, copied to the applied set on Apply.
  const [draftSearch, setDraftSearch] = useState('');
  const [draftBand, setDraftBand] = useState<ScoreBandFilter>('all');
  const [draftSource, setDraftSource] = useState<string>('all');
  const [draftAssignee, setDraftAssignee] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [band, setBand] = useState<ScoreBandFilter>('all');
  const [source, setSource] = useState<string>('all');
  const [assignee, setAssignee] = useState<string>('all');

  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuBusy, setMenuBusy] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState({
    verification: true,
    score: true,
    source: true,
    status: true,
    activity: true,
    assignee: true,
    permissions: true,
  });

  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);
  const [intent, setIntent] = useState<DrawerIntent>(null);
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);

  const staffName = (id: string | null): string => {
    if (!id) return 'Unassigned';
    const member = staff.find((item) => item.id === id);
    return member ? member.displayName : id;
  };

  const start = rangeStart(rangeKey);
  const inRange = useMemo(
    () =>
      start
        ? leads.filter((lead) => lead.createdAt >= start)
        : leads,
    [leads, start],
  );

  const counts = useMemo(() => {
    const map = new Map<LeadStatus, number>();
    for (const status of LEAD_STATUSES) map.set(status, 0);
    for (const lead of inRange) map.set(lead.status, (map.get(lead.status) ?? 0) + 1);
    return map;
  }, [inRange]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = inRange.filter((lead) => {
      if (tab !== 'all' && lead.status !== tab) return false;
      if (band !== 'all' && bandOf(lead) !== band) return false;
      if (source !== 'all' && lead.source !== source) return false;
      if (assignee === 'unassigned' && lead.assigneeId !== null) return false;
      if (assignee !== 'all' && assignee !== 'unassigned' && lead.assigneeId !== assignee) return false;
      if (query) {
        const haystack = [lead.id, lead.visitorId ?? '', lead.fullName ?? '', lead.email ?? '', lead.phone ?? '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    const direction = sortDir;
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'identity':
          return direction * leadIdentity(a).localeCompare(leadIdentity(b));
        case 'score':
          return direction * ((a.score ?? -1) - (b.score ?? -1));
        case 'source':
          return direction * a.source.localeCompare(b.source);
        case 'status':
          return direction * a.status.localeCompare(b.status);
        case 'assignee':
          return direction * staffName(a.assigneeId).localeCompare(staffName(b.assigneeId));
        case 'updatedAt':
        default:
          return direction * a.updatedAt.localeCompare(b.updatedAt);
      }
    });
    return rows;
    // staffName is derived from the staff directory state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRange, tab, band, source, assignee, search, sortKey, sortDir, staff]);

  const pageRows = paginate(filtered, page, PAGE_SIZE);
  const pageCount = pageCountFor(filtered.length, PAGE_SIZE);
  const focusLead = focusLeadId
    ? (leads.find((lead) => lead.id === focusLeadId) ?? null)
    : null;
  const focusSuppressed =
    focusLead !== null && (focusLead.optedOut || focusLead.status === 'do-not-contact');
  const focusContactable = focusLead !== null && !focusSuppressed && focusLead.contactBasis !== null;

  const sourceRows = useMemo(() => {
    const map = new Map<LeadSource, number>();
    for (const value of LEAD_SOURCES) map.set(value, 0);
    for (const lead of inRange) map.set(lead.source, (map.get(lead.source) ?? 0) + 1);
    return LEAD_SOURCES.map((value) => ({ source: value, count: map.get(value) ?? 0 }));
  }, [inRange]);
  const maxSource = Math.max(1, ...sourceRows.map((row) => row.count));
  const recent = useMemo(
    () => [...inRange].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8),
    [inRange],
  );

  function applyFilters(): void {
    setSearch(draftSearch);
    setBand(draftBand);
    setSource(draftSource);
    setAssignee(draftAssignee);
    setPage(1);
  }

  function resetFilters(): void {
    setDraftSearch('');
    setDraftBand('all');
    setDraftSource('all');
    setDraftAssignee('all');
    setSearch('');
    setBand('all');
    setSource('all');
    setAssignee('all');
    setTab('all');
    setPage(1);
  }

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((value) => (value === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === 'identity' || key === 'source' || key === 'status' ? 1 : -1);
    }
    setPage(1);
  }

  function toggleSelected(id: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openDrawer(lead: Lead, nextIntent: DrawerIntent): void {
    setFocusLeadId(lead.id);
    setIntent(nextIntent);
    setDrawerLeadId(lead.id);
  }

  async function quickMove(lead: Lead, to: LeadStatus): Promise<void> {
    setMenuBusy(to);
    setMenuError(null);
    try {
      await api.changeLeadStatus(lead.id, { status: to });
      setMenuFor(null);
      reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setMenuError(uiError.message);
    } finally {
      setMenuBusy(null);
    }
  }

  async function bulkAssign(): Promise<void> {
    const target = bulkAssignee.trim();
    if (!target || selected.size === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      for (const id of selected) {
        await api.assignLead(id, { assigneeId: target });
      }
      setSelected(new Set());
      reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setBulkError(uiError.message);
      reload();
    } finally {
      setBulkBusy(false);
    }
  }

  function exportRows(rows: Lead[], filename: string): void {
    downloadCsv(filename, csvRows(rows));
  }

  const sortMark = (key: SortKey): string =>
    sortKey === key ? (sortDir === 1 ? ' ↑' : ' ↓') : '';

  return (
    <section>
      <ModuleHeader
        icon={Target}
        title="Lead Management"
        description="Potential buyers with recorded buying intent, their pipeline status, scores, assignment and consented contact history."
      >
        <label className="range-select">
          <CalendarDays size={15} />
          <select
            value={rangeKey}
            onChange={(event) => {
              setRangeKey(event.target.value as RangeKey);
              setPage(1);
            }}
            aria-label="Date range"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="all">All time</option>
          </select>
        </label>
        {canCreate ? (
          <button type="button" className="btn" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add Lead
          </button>
        ) : null}
      </ModuleHeader>

      {showAdd ? (
        <AddLeadModal onClose={() => setShowAdd(false)} onDone={reload} />
      ) : null}

      <div className="kpi-grid">
        <KpiCard icon={UserPlus} label="New Leads" value={loading ? '...' : (counts.get('new') ?? 0).toLocaleString('en-US')} note="Leads at the New stage in the selected range" tone="purple" />
        <KpiCard icon={CheckCheck} label="Qualified" value={loading ? '...' : (counts.get('qualified') ?? 0).toLocaleString('en-US')} note="Leads marked Qualified in the selected range" tone="blue" />
        <KpiCard icon={PhoneCall} label="Contacted" value={loading ? '...' : (counts.get('contacted') ?? 0).toLocaleString('en-US')} note="Leads at the Contacted stage in the selected range" tone="blue" />
        <KpiCard icon={MessageCircle} label="Interested" value={loading ? '...' : (counts.get('interested') ?? 0).toLocaleString('en-US')} note="Leads showing interest in the selected range" tone="orange" />
        <KpiCard icon={SlidersHorizontal} label="Negotiation" value={loading ? '...' : (counts.get('negotiation') ?? 0).toLocaleString('en-US')} note="Leads in negotiation in the selected range" tone="orange" />
        <KpiCard icon={Target} label="Converted" value={loading ? '...' : (counts.get('converted') ?? 0).toLocaleString('en-US')} note="Leads converted in the selected range" tone="green" />
      </div>

      <StatusTabs
        active={tab}
        onChange={(key) => {
          setTab(key);
          setPage(1);
        }}
        tabs={[
          { key: 'all', label: 'All Leads', count: inRange.length },
          ...LEAD_STATUSES.map((status) => ({
            key: status,
            label: LEAD_STATUS_LABELS[status],
            count: counts.get(status) ?? 0,
          })),
        ]}
      />

      <div className="card filter-card">
        <div className="filter-row">
          <label className="field">
            Search
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Search size={14} />
              <input
                className="input"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="Name, email, phone or lead id"
              />
            </span>
          </label>
          <label className="field">
            Lead Score
            <select className="select" value={draftBand} onChange={(event) => setDraftBand(event.target.value as ScoreBandFilter)}>
              <option value="all">All scores</option>
              <option value="hot">Hot (70+)</option>
              <option value="warm">Warm (40 to 69)</option>
              <option value="cold">Cold (below 40)</option>
              <option value="unscored">Not scored</option>
            </select>
          </label>
          <label className="field">
            Lead Source
            <select className="select" value={draftSource} onChange={(event) => setDraftSource(event.target.value)}>
              <option value="all">All sources</option>
              {LEAD_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {SOURCE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Lead Status
            <select
              className="select"
              value={tab}
              onChange={(event) => {
                setTab(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Assigned Sales Agent
            <select className="select" value={draftAssignee} onChange={(event) => setDraftAssignee(event.target.value)}>
              <option value="all">All agents</option>
              <option value="unassigned">Unassigned</option>
              {canReadStaff
                ? staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))
                : null}
            </select>
          </label>
          <label className="field">
            Date Range
            <select
              className="select"
              value={rangeKey}
              onChange={(event) => {
                setRangeKey(event.target.value as RangeKey);
                setPage(1);
              }}
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="all">All time</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="button" className="btn btn-secondary" onClick={resetFilters}>
              <RotateCcw size={14} /> Reset
            </button>
            <button type="button" className="btn" onClick={applyFilters}>
              <Filter size={14} /> Apply Filters
            </button>
          </div>
        </div>
        {canReadStaff ? null : (
          <p className="note muted">
            The agent filter lists named agents only with the staff.manage permission; Unassigned still works.
          </p>
        )}
      </div>

      {loading ? <LoadingNote label="Loading leads..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}

      {selected.size > 0 ? (
        <div className="bulk-bar">
          <strong>{selected.size} selected</strong>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() =>
              exportRows(
                leads.filter((lead) => selected.has(lead.id)),
                'leads-selected.csv',
              )
            }
          >
            <Download size={14} /> Export selected
          </button>
          {canAssign ? (
            <>
              {canReadStaff && staff.length > 0 ? (
                <select className="select" value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)} aria-label="Bulk assignee">
                  <option value="">Select agent</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  value={bulkAssignee}
                  onChange={(event) => setBulkAssignee(event.target.value)}
                  placeholder="Agent admin id"
                  aria-label="Bulk assignee admin id"
                />
              )}
              <button type="button" className="btn btn-small" disabled={bulkBusy || !bulkAssignee.trim()} onClick={bulkAssign}>
                {bulkBusy ? 'Assigning...' : 'Assign selected'}
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
          {bulkError ? (
            <span className="form-error" role="alert">
              {bulkError}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="dash-row">
        <div className="card">
          <CardHead icon={Users} title="Leads">
            <div className="table-tools">
              <span className="count-chip">{filtered.length} leads</span>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => exportRows(filtered, 'leads.csv')}>
                <Download size={14} /> Export CSV
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowColumns((value) => !value)}>
                <Eye size={14} /> Columns
              </button>
            </div>
          </CardHead>
          {showColumns ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              {(Object.keys(columns) as (keyof typeof columns)[]).map((key) => (
                <label key={key} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={columns[key]}
                    onChange={(event) =>
                      setColumns((prev) => ({ ...prev, [key]: event.target.checked }))
                    }
                  />
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </label>
              ))}
            </div>
          ) : null}
          {!loading && !error && filtered.length === 0 ? (
            <EmptyNote>
              {leads.length === 0
                ? 'No leads yet. Leads appear when an identified visitor shows buying intent, or when staff record a submitted contact form or an offline enquiry.'
                : 'No leads match the current tab, filters and date range.'}
            </EmptyNote>
          ) : null}
          {filtered.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Select page"
                          checked={pageRows.length > 0 && pageRows.every((lead) => selected.has(lead.id))}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelected((prev) => {
                              const next = new Set(prev);
                              for (const lead of pageRows) {
                                if (checked) next.add(lead.id);
                                else next.delete(lead.id);
                              }
                              return next;
                            });
                          }}
                        />
                      </th>
                      <th>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => toggleSort('identity')}>
                          Lead{sortMark('identity')}
                        </button>
                      </th>
                      {columns.verification ? <th>Identity Verification</th> : null}
                      {columns.score ? (
                        <th>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => toggleSort('score')}>
                            Lead Score{sortMark('score')}
                          </button>
                        </th>
                      ) : null}
                      {columns.source ? (
                        <th>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => toggleSort('source')}>
                            Source{sortMark('source')}
                          </button>
                        </th>
                      ) : null}
                      {columns.status ? (
                        <th>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => toggleSort('status')}>
                            Status{sortMark('status')}
                          </button>
                        </th>
                      ) : null}
                      {columns.activity ? (
                        <th>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => toggleSort('updatedAt')}>
                            Last Activity{sortMark('updatedAt')}
                          </button>
                        </th>
                      ) : null}
                      {columns.assignee ? (
                        <th>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => toggleSort('assignee')}>
                            Assigned Agent{sortMark('assignee')}
                          </button>
                        </th>
                      ) : null}
                      {columns.permissions ? <th>Contact Permissions</th> : null}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((lead) => {
                      const suppressedLead = lead.optedOut || lead.status === 'do-not-contact';
                      return (
                        <tr
                          key={lead.id}
                          onClick={() => openDrawer(lead, null)}
                          style={{ cursor: 'pointer' }}
                          title="Open lead details"
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${leadIdentity(lead)}`}
                              checked={selected.has(lead.id)}
                              onChange={(event) => toggleSelected(lead.id, event.target.checked)}
                            />
                          </td>
                          <td>
                            <span className="identity-cell">
                              <span className="avatar-initials">{leadInitials(lead)}</span>
                              <span>
                                <span className="identity-main">{leadIdentity(lead)}</span>
                                <span className="identity-sub">
                                  {lead.email ?? lead.phone ?? lead.id}
                                  {lead.fullName && lead.email ? ` · ${lead.email}` : ''}
                                </span>
                              </span>
                            </span>
                          </td>
                          {columns.verification ? (
                            <td>
                              {lead.contactBasis ? (
                                <Badge>{LEAD_BASIS_LABELS[lead.contactBasis] ?? lead.contactBasis}</Badge>
                              ) : (
                                <span className="muted">No basis recorded</span>
                              )}
                            </td>
                          ) : null}
                          {columns.score ? (
                            <td>
                              <ScoreBand score={lead.score} />
                            </td>
                          ) : null}
                          {columns.source ? <td>{SOURCE_LABELS[lead.source]}</td> : null}
                          {columns.status ? (
                            <td>
                              <Badge>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                              {lead.optedOut ? (
                                <>
                                  {' '}
                                  <Badge>Opted out</Badge>
                                </>
                              ) : null}
                            </td>
                          ) : null}
                          {columns.activity ? <td>{formatDateTime(lead.updatedAt)}</td> : null}
                          {columns.assignee ? <td>{staffName(lead.assigneeId)}</td> : null}
                          {columns.permissions ? (
                            <td>
                              {suppressedLead ? (
                                <BandChip band="grey" />
                              ) : lead.contactBasis ? (
                                <BandChip band="green" />
                              ) : (
                                <BandChip band="grey" />
                              )}{' '}
                              <span className="muted">
                                {suppressedLead
                                  ? 'Do not contact'
                                  : lead.contactBasis
                                    ? 'Contactable'
                                    : 'No basis'}
                              </span>
                            </td>
                          ) : null}
                          <td onClick={(event) => event.stopPropagation()}>
                            <div style={{ position: 'relative' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() => {
                                  setMenuFor(menuFor === lead.id ? null : lead.id);
                                  setMenuError(null);
                                }}
                              >
                                Actions
                              </button>
                              {menuFor === lead.id ? (
                                <div
                                  className="card"
                                  style={{ position: 'absolute', right: 0, top: '110%', zIndex: 5, minWidth: 210, padding: 10 }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <Link className="btn btn-secondary btn-small" href={`/leads/${lead.id}`}>
                                      View lead page
                                    </Link>
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-small"
                                      onClick={() => {
                                        setMenuFor(null);
                                        openDrawer(lead, null);
                                      }}
                                    >
                                      View in drawer
                                    </button>
                                    {canEdit
                                      ? LEAD_NEXT[lead.status].map((to) => (
                                          <button
                                            key={to}
                                            type="button"
                                            className={to === 'lost' ? 'btn btn-danger btn-small' : 'btn btn-small'}
                                            disabled={menuBusy !== null}
                                            onClick={() => quickMove(lead, to)}
                                          >
                                            {menuBusy === to ? 'Moving...' : `Move to ${LEAD_STATUS_LABELS[to]}`}
                                          </button>
                                        ))
                                      : null}
                                    {menuError ? (
                                      <span className="form-error" role="alert">
                                        {menuError}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="table-foot">
                <span className="muted">
                  Showing {pageRows.length} of {filtered.length} leads
                </span>
                <Pagination page={page} pageCount={pageCount} onChange={setPage} />
              </div>
            </>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <CardHead icon={PieChart} title="Lead Funnel" />
            {loading ? (
              <LoadingNote label="Loading funnel..." />
            ) : error ? (
              <ErrorNote error={error} onRetry={reload} />
            ) : inRange.length === 0 ? (
              <EmptyNote>No leads in the selected range.</EmptyNote>
            ) : (
              <DonutChart
                centreValue={inRange.length.toLocaleString('en-US')}
                centreLabel="Leads"
                slices={LEAD_STATUSES.map((status) => ({
                  label: LEAD_STATUS_LABELS[status],
                  value: counts.get(status) ?? 0,
                  color: STATUS_COLORS[status],
                }))}
              />
            )}
          </div>

          <div className="card">
            <CardHead icon={Filter} title="Lead Sources" />
            {loading ? (
              <LoadingNote label="Loading sources..." />
            ) : inRange.length === 0 ? (
              <EmptyNote>No leads in the selected range.</EmptyNote>
            ) : (
              sourceRows.map((row) => (
                <div className="source-row" key={row.source}>
                  <span>{SOURCE_LABELS[row.source]}</span>
                  <span className="funnel-track">
                    <span
                      className="funnel-fill"
                      style={{ display: 'block', width: `${Math.round((row.count / maxSource) * 100)}%`, background: '#1C1B17' }}
                    />
                  </span>
                  <span className="num">{row.count}</span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <CardHead icon={CalendarDays} title="Recent Lead Activities" />
            {loading ? (
              <LoadingNote label="Loading activities..." />
            ) : recent.length === 0 ? (
              <EmptyNote>No lead activity in the selected range.</EmptyNote>
            ) : (
              <ul className="timeline">
                {recent.map((lead) => (
                  <li key={lead.id}>
                    <div>
                      <strong>{leadIdentity(lead)}</strong>{' '}
                      <Badge>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                    </div>
                    <div className="when">
                      {SOURCE_LABELS[lead.source]} · Updated {formatDateTime(lead.updatedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {focusLead ? (
        <div className="card section-gap">
          <CardHead icon={Target} title={`Quick Actions: ${leadIdentity(focusLead)}`}>
            <span className="muted" style={{ fontSize: 13 }}>
              {focusSuppressed
                ? 'This lead has opted out: contact actions are disabled and the API refuses them.'
                : focusContactable
                  ? 'Contact actions record an attempt through the leads API.'
                  : 'No contact basis is recorded for this lead, so contact attempts will be refused by the API and the error is shown in the drawer.'}
            </span>
          </CardHead>
          <div className="quick-actions">
            <button
              type="button"
              className="quick-action"
              disabled={focusSuppressed}
              onClick={() => openDrawer(focusLead, { kind: 'contact', channel: 'whatsapp', purpose: 'WhatsApp follow-up', nonce: Date.now() })}
            >
              <span className="quick-action-icon"><MessageCircle size={18} /></span>
              <span>
                <span className="quick-action-title">WhatsApp Follow-up</span>
                <span className="quick-action-sub">Record a WhatsApp contact attempt</span>
              </span>
            </button>
            <button
              type="button"
              className="quick-action"
              disabled={!canEdit}
              onClick={() => openDrawer(focusLead, { kind: 'followup', title: 'Call task', nonce: Date.now() })}
            >
              <span className="quick-action-icon"><PhoneCall size={18} /></span>
              <span>
                <span className="quick-action-title">Create Call Task</span>
                <span className="quick-action-sub">Add a follow-up task in the drawer</span>
              </span>
            </button>
            <button
              type="button"
              className="quick-action"
              disabled={focusSuppressed}
              onClick={() => openDrawer(focusLead, { kind: 'contact', channel: 'email', purpose: 'Email follow-up', nonce: Date.now() })}
            >
              <span className="quick-action-icon"><Mail size={18} /></span>
              <span>
                <span className="quick-action-title">Send Email</span>
                <span className="quick-action-sub">Record an email contact attempt</span>
              </span>
            </button>
            <button
              type="button"
              className="quick-action"
              disabled={!canAssign}
              onClick={() => openDrawer(focusLead, { kind: 'assign', nonce: Date.now() })}
            >
              <span className="quick-action-icon"><UserPlus size={18} /></span>
              <span>
                <span className="quick-action-title">Assign Lead</span>
                <span className="quick-action-sub">Assign a sales agent in the drawer</span>
              </span>
            </button>
            <button
              type="button"
              className="quick-action"
              disabled={focusSuppressed}
              onClick={() => openDrawer(focusLead, { kind: 'contact', channel: 'phone', purpose: 'CRM note', nonce: Date.now() })}
            >
              <span className="quick-action-icon"><NotebookPen size={18} /></span>
              <span>
                <span className="quick-action-title">Add CRM Note</span>
                <span className="quick-action-sub">Record a note on a contact attempt</span>
              </span>
            </button>
            <button
              type="button"
              className="quick-action"
              disabled={!canEdit}
              onClick={() => openDrawer(focusLead, { kind: 'followup', title: 'Scheduled follow-up', nonce: Date.now() })}
            >
              <span className="quick-action-icon"><CalendarDays size={18} /></span>
              <span>
                <span className="quick-action-title">Schedule Follow-up</span>
                <span className="quick-action-sub">Add a dated follow-up task</span>
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {drawerLeadId ? (
        <LeadDrawer
          key={`${drawerLeadId}-${intent?.kind ?? 'view'}-${intent && 'nonce' in intent ? intent.nonce : 0}`}
          leadId={drawerLeadId}
          intent={intent}
          onClose={() => setDrawerLeadId(null)}
          onChanged={reload}
        />
      ) : null}
    </section>
  );
}
