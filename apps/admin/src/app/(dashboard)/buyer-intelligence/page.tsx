'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  Filter,
  Flame,
  LayoutGrid,
  LogIn,
  Mail,
  MessageCircle,
  PhoneCall,
  Route,
  Search,
  ShoppingCart,
  StickyNote,
  UserPlus,
  UserSearch,
  Users,
  XCircle,
} from 'lucide-react';
import {
  IDENTITY_STATUSES,
  IDENTITY_STATUS_LABELS,
  VISITOR_EVENT_TYPES,
  type IdentityStatus,
  type Lead,
  type VisitorEventType,
} from '@dostelo/types';
import type {
  BuyerSessionDetail,
  BuyerSessionSummary,
} from '@dostelo/api-client';
import { api, formatDateTime, formatMinor, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import { useStaffDirectory } from '../../../lib/staff-directory';
import { downloadCsv, toCsv } from '../../../lib/csv';
import { expireSession } from '../../../lib/session';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  ModuleHeader,
  Pagination,
  ScoreBand,
  deltaFor,
  pageCountFor,
  paginate,
} from '../../../components/ui';

/**
 * Buyer Intelligence (redesign): tracked storefront sessions with
 * their recorded identity status, transparent lead score, event
 * counts and latest reported cart value, all from the API.
 *
 * Range note: listBuyerSessions has no date range parameter, so
 * the page loads the full session list once and applies the
 * 7, 30 and 90 day ranges client-side against each session's
 * lastSeenAt timestamp. The same applies to the previous period
 * used for KPI deltas: deltas render only when both periods hold
 * timestamped sessions, otherwise they are omitted.
 *
 * Lead link note: BuyerSessionSummary carries no leadId field.
 * The linked lead for a session is found by loading the leads
 * list and matching Lead.sessionId (falling back to visitorId),
 * which is the link the API itself records on the lead.
 *
 * Product interest note: session summaries carry no product
 * identifiers. Products live in event payloads (payload.productId
 * on product-view and add-to-cart events), so the page loads each
 * listed session's detail to build the product filter options and
 * to power the selected buyer's journey timeline.
 */

type RangeDays = 7 | 30 | 90;
type Band = 'hot' | 'warm' | 'cold';
type SortKey = 'leadScore' | 'lastSeenAt' | 'eventCount';

const PAGE_SIZE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const EVENT_LABELS: Record<VisitorEventType, string> = {
  'page-view': 'Page view',
  'product-view': 'Product view',
  search: 'Search',
  'add-to-cart': 'Add to cart',
  'remove-from-cart': 'Remove from cart',
  'wishlist-add': 'Wishlist add',
  'checkout-start': 'Checkout started',
  'checkout-step': 'Checkout step',
  purchase: 'Purchase',
};

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}...` : id;
}

function bandOf(session: BuyerSessionSummary): Band {
  return session.leadBand;
}

function countEvents(
  sessions: BuyerSessionSummary[],
  type: VisitorEventType,
): number {
  return sessions.reduce(
    (total, session) => total + (session.eventCounts[type] ?? 0),
    0,
  );
}

function sessionsWith(
  sessions: BuyerSessionSummary[],
  type: VisitorEventType,
): number {
  return sessions.filter((session) => (session.eventCounts[type] ?? 0) > 0)
    .length;
}

function productIdsOf(detail: BuyerSessionDetail): string[] {
  const ids = new Set<string>();
  for (const event of detail.events) {
    const productId = event.payload?.['productId'];
    if (typeof productId === 'string' && productId) ids.add(productId);
  }
  return [...ids];
}

interface JourneyStep {
  key: string;
  title: string;
  sub: string;
  time: string;
  terminal?: boolean;
  icon: typeof LogIn;
}

function journeySteps(detail: BuyerSessionDetail): JourneyStep[] {
  const steps: JourneyStep[] = [];
  const events = detail.events;
  const firstOf = (types: VisitorEventType[]) =>
    events.find((event) => types.includes(event.type));
  const productSub = (event: BuyerSessionDetail['events'][number]) => {
    const productId = event.payload?.['productId'];
    return typeof productId === 'string' && productId
      ? `Product ${productId}`
      : (event.path ?? 'Recorded in the event stream');
  };

  steps.push({
    key: 'started',
    title: 'Session Started',
    sub: `First seen ${formatDateTime(detail.firstSeenAt)}`,
    time: detail.firstSeenAt,
    icon: LogIn,
  });

  const category = events.find(
    (event) =>
      event.type === 'page-view' &&
      ((typeof event.payload?.['category'] === 'string' &&
        event.payload['category'] !== '') ||
        (event.path?.includes('categor') ?? false)),
  );
  if (category) {
    const categoryName = category.payload?.['category'];
    steps.push({
      key: 'category',
      title: 'Category Viewed',
      sub:
        typeof categoryName === 'string' && categoryName
          ? categoryName
          : (category.path ?? 'Category page view recorded'),
      time: category.occurredAt,
      icon: LayoutGrid,
    });
  }

  const product = firstOf(['product-view']);
  if (product) {
    steps.push({
      key: 'product',
      title: 'Product Viewed',
      sub: productSub(product),
      time: product.occurredAt,
      icon: Eye,
    });
  }

  const cart = firstOf(['add-to-cart']);
  if (cart) {
    steps.push({
      key: 'cart',
      title: 'Added to Cart',
      sub: productSub(cart),
      time: cart.occurredAt,
      icon: ShoppingCart,
    });
  }

  const checkout = firstOf(['checkout-start', 'checkout-step']);
  if (checkout) {
    steps.push({
      key: 'checkout',
      title: 'Checkout Started',
      sub: checkout.path ?? 'Checkout progress recorded',
      time: checkout.occurredAt,
      icon: CreditCard,
    });
  }

  const purchase = firstOf(['purchase']);
  if (purchase) {
    steps.push({
      key: 'purchase',
      title: 'Purchase',
      sub: 'Purchase event recorded for this session',
      time: purchase.occurredAt,
      terminal: true,
      icon: CheckCircle2,
    });
  } else if (cart || checkout) {
    steps.push({
      key: 'abandoned',
      title: 'Abandoned',
      sub: 'Cart or checkout activity with no purchase recorded',
      time: detail.lastSeenAt,
      terminal: true,
      icon: XCircle,
    });
  }

  return steps;
}

function FunnelCard({ sessions }: { sessions: BuyerSessionSummary[] }) {
  const rows = [
    { label: 'Product Views', count: countEvents(sessions, 'product-view') },
    { label: 'Add to Cart', count: countEvents(sessions, 'add-to-cart') },
    {
      label: 'Checkout Started',
      count: countEvents(sessions, 'checkout-start'),
    },
    { label: 'Purchase', count: countEvents(sessions, 'purchase') },
  ];
  const first = rows[0]!.count;
  return (
    <div className="card">
      <CardHead icon={Filter} title="Conversion Funnel" />
      {sessions.length === 0 ? (
        <EmptyNote>No sessions in the current view yet.</EmptyNote>
      ) : (
        rows.map((row) => {
          const pct = first > 0 ? (row.count / first) * 100 : 0;
          return (
            <div className="funnel-row" key={row.label}>
              <span>{row.label}</span>
              <span className="funnel-track">
                <span
                  className="funnel-fill"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: 'var(--adm-grad)',
                    display: 'block',
                  }}
                />
              </span>
              <span className="num">
                {row.count} ({first > 0 ? pct.toFixed(1) : '0.0'}%)
              </span>
            </div>
          );
        })
      )}
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        Event totals across the sessions in the current view, with
        percentages of the first step.
      </p>
    </div>
  );
}

function SegmentsCard({ sessions }: { sessions: BuyerSessionSummary[] }) {
  const total = sessions.length;
  const rows: Array<{ band: Band; label: string; color: string }> = [
    { band: 'hot', label: 'Hot (score 70+)', color: '#E4572E' },
    { band: 'warm', label: 'Warm (score 40 to 69)', color: '#E9A13B' },
    { band: 'cold', label: 'Cold (below 40)', color: '#7A76A8' },
  ];
  return (
    <div className="card">
      <CardHead icon={Users} title="Buyer Segments" />
      {total === 0 ? (
        <EmptyNote>No sessions in the current view yet.</EmptyNote>
      ) : (
        rows.map((row) => {
          const count = sessions.filter(
            (session) => bandOf(session) === row.band,
          ).length;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div className="funnel-row" key={row.band}>
              <span>{row.label}</span>
              <span className="funnel-track">
                <span
                  className="funnel-fill"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: row.color,
                    display: 'block',
                  }}
                />
              </span>
              <span className="num">
                {count} ({pct.toFixed(1)}%)
              </span>
            </div>
          );
        })
      )}
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        Segments come from the lead band the API computed for each
        session in the current view.
      </p>
    </div>
  );
}

/**
 * Next Action panel for the selected session. Every action runs
 * against the linked lead (found through Lead.sessionId or
 * Lead.visitorId), never against the anonymous session itself.
 * Actions disable with an explanation when identity or consent
 * does not allow them, and API refusals (including 403
 * suppression answers) surface in place.
 */
function NextActionPanel({
  session,
  lead,
  leadsLoading,
}: {
  session: BuyerSessionSummary;
  lead: Lead | null;
  leadsLoading: boolean;
}) {
  const { session: authSession } = useAuth();
  const permissions = authSession.principal?.permissions ?? [];
  const { staff } = useStaffDirectory();
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const customerId = session.customerId ?? lead?.customerId ?? null;
  const suppressed =
    lead !== null && (lead.optedOut || lead.status === 'do-not-contact');
  const contactBlockedReason: string | null = !lead
    ? null
    : suppressed
      ? 'This lead is on the Do Not Contact list. Contact is refused by the API.'
      : !session.marketingUsable
        ? 'This visitor denied marketing consent, so this session is operational only.'
        : !lead.contactBasis
          ? 'No contact basis is recorded for this lead, so it is not contactable.'
          : null;

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setResult(null);
    setActionError(null);
    try {
      const text = await action();
      setResult(text);
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setActionError(uiError.message);
    } finally {
      setBusy(null);
    }
  }

  async function sendVia(channel: 'whatsapp' | 'email') {
    if (!lead) return;
    const to = channel === 'whatsapp' ? lead.phone : lead.email;
    if (!to || !message.trim()) return;
    await run(channel, async () => {
      const log = await api.sendMessage({
        channel,
        to,
        leadId: lead.id,
        customerId: customerId ?? undefined,
        body: message.trim(),
        purpose: 'Buyer Intelligence follow-up',
      });
      setMessage('');
      return log.status === 'sent'
        ? `Message sent through the ${channel} provider and confirmed (log status: sent).`
        : `The provider path answered with status "${log.status}", so the message is not marked as sent. See the Communication Center log for the record.`;
    });
  }

  async function createCallTask() {
    if (!lead) return;
    await run('call-task', async () => {
      const task = await api.createFollowUpTask(lead.id, {
        title: `Call follow-up for Buyer Intelligence session ${shortId(session.sessionId)} (lead score ${session.leadScore})`,
      });
      return `Call task created: "${task.title}" (status: ${task.status}).`;
    });
  }

  async function addNote() {
    if (!customerId || !note.trim()) return;
    await run('crm-note', async () => {
      await api.addCustomerNote(customerId, { body: note.trim() });
      setNote('');
      return 'CRM note added to the linked customer profile.';
    });
  }

  async function assignAgent() {
    if (!lead || !assigneeId) return;
    await run('assign', async () => {
      const updated = await api.assignLead(lead.id, { assigneeId });
      return `Lead assigned to ${updated.assigneeId ?? assigneeId}.`;
    });
  }

  const whatsappDisabled =
    !lead ||
    contactBlockedReason !== null ||
    !lead.phone ||
    !message.trim() ||
    busy !== null;
  const emailDisabled =
    !lead ||
    contactBlockedReason !== null ||
    !lead.email ||
    !message.trim() ||
    busy !== null;
  const callDisabled =
    !lead || suppressed || !lead.phone || busy !== null;
  const noteDisabled = !customerId || !note.trim() || busy !== null;
  const assignDisabled =
    !lead || !assigneeId || busy !== null || !permissions.includes('leads.assign');

  return (
    <div className="card">
      <CardHead icon={Route} title="Next Action" />
      {leadsLoading ? (
        <LoadingNote label="Checking for a linked lead..." />
      ) : null}
      {!leadsLoading && !lead ? (
        <p className="note muted" style={{ marginTop: 0 }}>
          This session has no linked lead yet. Contact actions
          unlock once the visitor is identified through an
          authenticated or consented flow and a lead exists for
          the session. An anonymous session is never contacted
          directly.{' '}
          <Link
            href={`/buyer-intelligence/${encodeURIComponent(session.sessionId)}`}
          >
            Open the session detail
          </Link>
          .
        </p>
      ) : null}
      {lead ? (
        <p className="note muted" style={{ marginTop: 0 }}>
          Actions apply to the linked lead
          {lead.fullName ? ` (${lead.fullName})` : ''}, status{' '}
          {lead.status}
          {lead.contactBasis
            ? `, contact basis: ${lead.contactBasis}`
            : ', no contact basis recorded'}
          .
        </p>
      ) : null}
      {suppressed ? (
        <p className="note" role="alert" style={{ marginTop: 0 }}>
          <Ban size={14} /> Do Not Contact: this lead opted out.
          Contact actions are disabled and the API refuses them.
        </p>
      ) : null}
      {contactBlockedReason && !suppressed ? (
        <p className="note muted" style={{ marginTop: 0 }}>
          {contactBlockedReason}
        </p>
      ) : null}

      <label className="field">
        Follow-up message (WhatsApp or email)
        <textarea
          className="input"
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Write the follow-up message to send through the provider"
          disabled={!lead || contactBlockedReason !== null}
        />
      </label>
      <label className="field">
        CRM note (linked customer only)
        <textarea
          className="input"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            customerId
              ? 'Note saved on the linked customer profile'
              : 'No customer is linked to this session'
          }
          disabled={!customerId}
        />
      </label>
      <label className="field">
        Sales agent
        {staff.length > 0 ? (
          <select
            className="select"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            disabled={!lead}
          >
            <option value="">Select a sales agent</option>
            {staff
              .filter((member) => member.isActive)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName} ({member.email})
                </option>
              ))}
          </select>
        ) : (
          <input
            className="input"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            placeholder="Admin user id of the sales agent"
            disabled={!lead}
          />
        )}
      </label>

      <div className="quick-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="quick-action"
          disabled={whatsappDisabled}
          onClick={() => void sendVia('whatsapp')}
          title={
            !lead
              ? 'Unlocks once a lead is linked to this session'
              : contactBlockedReason ??
                (!lead.phone
                  ? 'No phone number is recorded for this lead'
                  : !message.trim()
                    ? 'Write a follow-up message first'
                    : 'Send a WhatsApp follow-up through the provider')
          }
        >
          <span className="quick-action-icon">
            <MessageCircle size={19} />
          </span>
          <span>
            <span className="quick-action-title">WhatsApp Follow-up</span>
            <br />
            <span className="quick-action-sub">
              {busy === 'whatsapp'
                ? 'Sending...'
                : lead?.phone
                  ? `To ${lead.phone} via the provider`
                  : 'No phone recorded for this lead'}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="quick-action"
          disabled={callDisabled}
          onClick={() => void createCallTask()}
          title={
            !lead
              ? 'Unlocks once a lead is linked to this session'
              : suppressed
                ? 'This lead is on the Do Not Contact list'
                : !lead.phone
                  ? 'No phone number is recorded for this lead'
                  : 'Create a call follow-up task on the lead'
          }
        >
          <span className="quick-action-icon">
            <PhoneCall size={19} />
          </span>
          <span>
            <span className="quick-action-title">Create Call Task</span>
            <br />
            <span className="quick-action-sub">
              {busy === 'call-task'
                ? 'Creating...'
                : 'Adds a follow-up task to the lead'}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="quick-action"
          disabled={emailDisabled}
          onClick={() => void sendVia('email')}
          title={
            !lead
              ? 'Unlocks once a lead is linked to this session'
              : contactBlockedReason ??
                (!lead.email
                  ? 'No email address is recorded for this lead'
                  : !message.trim()
                    ? 'Write a follow-up message first'
                    : 'Send an email through the provider')
          }
        >
          <span className="quick-action-icon">
            <Mail size={19} />
          </span>
          <span>
            <span className="quick-action-title">Send Email</span>
            <br />
            <span className="quick-action-sub">
              {busy === 'email'
                ? 'Sending...'
                : lead?.email
                  ? `To ${lead.email} via the provider`
                  : 'No email recorded for this lead'}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="quick-action"
          disabled={noteDisabled}
          onClick={() => void addNote()}
          title={
            !customerId
              ? 'Available only when a customer is linked to this session'
              : !note.trim()
                ? 'Write a CRM note first'
                : 'Save the note on the linked customer profile'
          }
        >
          <span className="quick-action-icon">
            <StickyNote size={19} />
          </span>
          <span>
            <span className="quick-action-title">Add CRM Note</span>
            <br />
            <span className="quick-action-sub">
              {busy === 'crm-note'
                ? 'Saving...'
                : customerId
                  ? 'Saved on the linked customer profile'
                  : 'No customer linked to this session'}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="quick-action"
          disabled={assignDisabled}
          onClick={() => void assignAgent()}
          title={
            !lead
              ? 'Unlocks once a lead is linked to this session'
              : !permissions.includes('leads.assign')
                ? 'Your role does not hold the leads.assign permission'
                : !assigneeId
                  ? 'Choose a sales agent first'
                  : 'Assign the linked lead to the chosen agent'
          }
        >
          <span className="quick-action-icon">
            <UserPlus size={19} />
          </span>
          <span>
            <span className="quick-action-title">Assign Sales Agent</span>
            <br />
            <span className="quick-action-sub">
              {busy === 'assign'
                ? 'Assigning...'
                : lead?.assigneeId
                  ? `Currently assigned to ${lead.assigneeId}`
                  : 'Currently unassigned'}
            </span>
          </span>
        </button>
      </div>

      {result ? (
        <p className="note" role="status" style={{ marginBottom: 0 }}>
          {result}
        </p>
      ) : null}
      {actionError ? (
        <p className="form-error" role="alert" style={{ marginBottom: 0 }}>
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

export default function BuyerIntelligencePage() {
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [draftStatus, setDraftStatus] = useState<IdentityStatus | ''>('');
  const [draftBand, setDraftBand] = useState<Band | ''>('');
  const [draftActivity, setDraftActivity] = useState<VisitorEventType | ''>('');
  const [draftProduct, setDraftProduct] = useState('');
  const [draftRange, setDraftRange] = useState<RangeDays>(30);
  const [applied, setApplied] = useState<{
    status: IdentityStatus | '';
    band: Band | '';
    activity: VisitorEventType | '';
    product: string;
  }>({ status: '', band: '', activity: '', product: '' });
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastSeenAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState({
    identityType: true,
    productViews: true,
    cartValue: true,
    marketing: true,
  });

  const sessionsState = useData((client) => client.listBuyerSessions(), []);
  const leadsState = useData((client) => client.listLeads(), []);
  const allSessions = sessionsState.data?.items ?? [];
  const sessionIdsKey = allSessions.map((s) => s.sessionId).join(',');

  // Session details power the product interest filter and the
  // selected buyer's journey. A detail that fails to load is
  // skipped, so one bad session never blanks the page.
  const detailsState = useData(
    async (client) => {
      const map: Record<string, BuyerSessionDetail> = {};
      if (!sessionIdsKey) return map;
      const results = await Promise.all(
        sessionIdsKey
          .split(',')
          .map((id) =>
            client.getBuyerSession(id).catch(() => null),
          ),
      );
      for (const detail of results) {
        if (detail) map[detail.sessionId] = detail;
      }
      return map;
    },
    [sessionIdsKey],
  );
  const detailsMap = detailsState.data ?? {};

  const productOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const detail of Object.values(detailsMap)) {
      for (const id of productIdsOf(detail)) ids.add(id);
    }
    return [...ids].sort();
  }, [detailsMap]);

  const now = Date.now();
  const rangeStart = now - rangeDays * DAY_MS;
  const prevStart = now - 2 * rangeDays * DAY_MS;
  const inCurrent = allSessions.filter(
    (s) => new Date(s.lastSeenAt).getTime() >= rangeStart,
  );
  const inPrevious = allSessions.filter((s) => {
    const t = new Date(s.lastSeenAt).getTime();
    return t >= prevStart && t < rangeStart;
  });
  // Deltas only when both periods hold timestamped sessions.
  const canDelta = inCurrent.length > 0 && inPrevious.length > 0;

  const analysisSet = inCurrent.filter((s) => {
    if (applied.status && s.identityStatus !== applied.status) return false;
    if (applied.band && bandOf(s) !== applied.band) return false;
    if (applied.activity && (s.eventCounts[applied.activity] ?? 0) === 0)
      return false;
    if (applied.product) {
      const detail = detailsMap[s.sessionId];
      if (!detail || !productIdsOf(detail).includes(applied.product))
        return false;
    }
    return true;
  });

  const query = search.trim().toLowerCase();
  const filtered = analysisSet.filter((s) => {
    if (!query) return true;
    const detail = detailsMap[s.sessionId];
    const products = detail ? productIdsOf(detail).join(' ') : '';
    return (
      s.sessionId.toLowerCase().includes(query) ||
      s.visitorId.toLowerCase().includes(query) ||
      IDENTITY_STATUS_LABELS[s.identityStatus].toLowerCase().includes(query) ||
      products.toLowerCase().includes(query)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = sortKey === 'lastSeenAt' ? new Date(a.lastSeenAt).getTime() : a[sortKey];
    const bv = sortKey === 'lastSeenAt' ? new Date(b.lastSeenAt).getTime() : b[sortKey];
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const pageCount = pageCountFor(sorted.length, PAGE_SIZE);
  const safePage = Math.min(page, pageCount);
  const pageItems = paginate(sorted, safePage, PAGE_SIZE);

  const selectedSession =
    sorted.find((s) => s.sessionId === selectedId) ??
    inCurrent.find((s) => s.sessionId === selectedId) ??
    sorted[0] ??
    null;
  const selectedDetail = selectedSession
    ? (detailsMap[selectedSession.sessionId] ?? null)
    : null;
  const selectedLead = selectedSession
    ? (leadsState.data?.items.find(
        (lead) => lead.sessionId === selectedSession.sessionId,
      ) ??
      leadsState.data?.items.find(
        (lead) => lead.visitorId === selectedSession.visitorId,
      ) ??
      null)
    : null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  function sortMark(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' (ascending)' : ' (descending)';
  }

  function applyFilters() {
    setApplied({
      status: draftStatus,
      band: draftBand,
      activity: draftActivity,
      product: draftProduct,
    });
    setRangeDays(draftRange);
    setPage(1);
  }

  function resetFilters() {
    setDraftStatus('');
    setDraftBand('');
    setDraftActivity('');
    setDraftProduct('');
    setDraftRange(30);
    setApplied({ status: '', band: '', activity: '', product: '' });
    setRangeDays(30);
    setSearch('');
    setPage(1);
  }

  function exportCsv() {
    const csv = toCsv(
      [
        'Session ID',
        'Visitor ID',
        'Identity Status',
        'Lead Score',
        'Lead Band',
        'Events',
        'Product Views',
        'Cart Value',
        'Last Activity',
        'Marketing Permission',
      ],
      sorted.map((s) => [
        s.sessionId,
        s.visitorId,
        IDENTITY_STATUS_LABELS[s.identityStatus],
        s.leadScore,
        s.leadBand,
        s.eventCount,
        s.productViews,
        s.cartValueMinor > 0 ? formatMinor(s.cartValueMinor) : '',
        s.lastSeenAt,
        s.marketingUsable ? 'Usable' : 'Operational only',
      ]),
    );
    downloadCsv('buyer-intelligence.csv', csv);
  }

  const uniqueCurrent = new Set(inCurrent.map((s) => s.visitorId)).size;
  const uniquePrevious = new Set(inPrevious.map((s) => s.visitorId)).size;

  return (
    <section>
      <ModuleHeader
        icon={UserSearch}
        title="Buyer Intelligence"
        description="Tracked sessions with recorded identity, lead scores and buying intent, exactly as the API reports them."
      >
        <label className="range-select">
          <CalendarDays size={15} />
          <select
            value={rangeDays}
            onChange={(event) => {
              const value = Number(event.target.value) as RangeDays;
              setRangeDays(value);
              setDraftRange(value);
              setPage(1);
            }}
            aria-label="Date range"
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
        </label>
      </ModuleHeader>

      {sessionsState.loading ? (
        <LoadingNote label="Loading sessions..." />
      ) : null}
      {sessionsState.error ? (
        <ErrorNote error={sessionsState.error} onRetry={sessionsState.reload} />
      ) : null}

      {sessionsState.data ? (
        <>
          <div className="kpi-grid">
            <KpiCard
              icon={Users}
              label="Unique Visitors"
              value={String(uniqueCurrent)}
              note={`Visitors active in the last ${rangeDays} days`}
              delta={
                canDelta ? deltaFor(uniqueCurrent, uniquePrevious) : null
              }
              tone="purple"
            />
            <KpiCard
              icon={ShoppingCart}
              label="Add to Cart"
              value={String(sessionsWith(inCurrent, 'add-to-cart'))}
              note="Sessions with at least one add to cart event"
              delta={
                canDelta
                  ? deltaFor(
                      sessionsWith(inCurrent, 'add-to-cart'),
                      sessionsWith(inPrevious, 'add-to-cart'),
                    )
                  : null
              }
              tone="blue"
            />
            <KpiCard
              icon={CreditCard}
              label="Checkout Started"
              value={String(sessionsWith(inCurrent, 'checkout-start'))}
              note="Sessions that reached checkout"
              delta={
                canDelta
                  ? deltaFor(
                      sessionsWith(inCurrent, 'checkout-start'),
                      sessionsWith(inPrevious, 'checkout-start'),
                    )
                  : null
              }
              tone="green"
            />
            <KpiCard
              icon={Flame}
              label="High-Intent Leads"
              value={String(
                inCurrent.filter((s) => s.leadBand === 'hot').length,
              )}
              note="Sessions in the hot band (score 70 or more)"
              delta={
                canDelta
                  ? deltaFor(
                      inCurrent.filter((s) => s.leadBand === 'hot').length,
                      inPrevious.filter((s) => s.leadBand === 'hot').length,
                    )
                  : null
              }
              tone="orange"
            />
          </div>

          <div className="card filter-card">
            <div className="filter-row">
              <label className="field">
                Identity Status
                <select
                  className="select"
                  value={draftStatus}
                  onChange={(event) =>
                    setDraftStatus(event.target.value as IdentityStatus | '')
                  }
                >
                  <option value="">All statuses</option>
                  {IDENTITY_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {IDENTITY_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Lead Score
                <select
                  className="select"
                  value={draftBand}
                  onChange={(event) =>
                    setDraftBand(event.target.value as Band | '')
                  }
                >
                  <option value="">All score bands</option>
                  <option value="hot">Hot (70+)</option>
                  <option value="warm">Warm (40 to 69)</option>
                  <option value="cold">Cold (below 40)</option>
                </select>
              </label>
              <label className="field">
                Activity Type
                <select
                  className="select"
                  value={draftActivity}
                  onChange={(event) =>
                    setDraftActivity(
                      event.target.value as VisitorEventType | '',
                    )
                  }
                >
                  <option value="">Any activity</option>
                  {VISITOR_EVENT_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {EVENT_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Product Interest
                <select
                  className="select"
                  value={draftProduct}
                  onChange={(event) => setDraftProduct(event.target.value)}
                  disabled={detailsState.loading}
                >
                  <option value="">
                    {detailsState.loading
                      ? 'Loading products...'
                      : 'Any product'}
                  </option>
                  {productOptions.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Date Range
                <select
                  className="select"
                  value={draftRange}
                  onChange={(event) =>
                    setDraftRange(Number(event.target.value) as RangeDays)
                  }
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                </select>
              </label>
              <div className="filter-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={resetFilters}
                >
                  Reset
                </button>
                <button type="button" className="btn" onClick={applyFilters}>
                  Apply
                </button>
              </div>
            </div>
            {detailsState.error ? (
              <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                Session details could not be loaded, so product
                interest options and journeys are unavailable right
                now. The session list itself is unaffected.
              </p>
            ) : null}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px 0' }}>
              <CardHead icon={UserSearch} title="Tracked Sessions">
                <span className="count-chip">{sorted.length} records</span>
                <span className="table-tools">
                  <label className="field" style={{ marginTop: 0 }}>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <Search size={14} /> Search
                    </span>
                    <input
                      className="input"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                      placeholder="Session, visitor or product"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={exportCsv}
                    disabled={sorted.length === 0}
                  >
                    <Download size={14} /> Export
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => setShowColumns((v) => !v)}
                    aria-expanded={showColumns}
                  >
                    <Eye size={14} /> Columns
                  </button>
                </span>
              </CardHead>
              {showColumns ? (
                <div
                  className="filter-row"
                  style={{ paddingBottom: 12 }}
                  aria-label="Toggle columns"
                >
                  {(
                    [
                      ['identityType', 'Identity Type'],
                      ['productViews', 'Product Views'],
                      ['cartValue', 'Cart Value'],
                      ['marketing', 'Marketing Permission'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="field"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 7,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={columns[key]}
                        onChange={(event) =>
                          setColumns((prev) => ({
                            ...prev,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
            {sorted.length === 0 ? (
              <div style={{ padding: '0 18px 16px' }}>
                <EmptyNote>
                  No tracked sessions match the current range and
                  filters. Sessions appear here once the storefront
                  tracker records visitor activity.
                </EmptyNote>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Buyer Identity</th>
                        {columns.identityType ? <th>Identity Type</th> : null}
                        <th>
                          <button
                            type="button"
                            className="btn-secondary btn-small"
                            onClick={() => toggleSort('leadScore')}
                          >
                            Lead Score{sortMark('leadScore')}
                          </button>
                        </th>
                        <th className="num">
                          <button
                            type="button"
                            className="btn-secondary btn-small"
                            onClick={() => toggleSort('eventCount')}
                          >
                            Events{sortMark('eventCount')}
                          </button>
                        </th>
                        {columns.productViews ? (
                          <th className="num">Product Views</th>
                        ) : null}
                        {columns.cartValue ? (
                          <th className="num">Cart Value</th>
                        ) : null}
                        <th>
                          <button
                            type="button"
                            className="btn-secondary btn-small"
                            onClick={() => toggleSort('lastSeenAt')}
                          >
                            Last Activity{sortMark('lastSeenAt')}
                          </button>
                        </th>
                        {columns.marketing ? (
                          <th>Marketing Permission</th>
                        ) : null}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((s) => {
                        const anonymous =
                          s.identityStatus === 'anonymous';
                        const selected =
                          selectedSession?.sessionId === s.sessionId;
                        return (
                          <tr
                            key={s.sessionId}
                            onClick={() => setSelectedId(s.sessionId)}
                            style={{
                              cursor: 'pointer',
                              background: selected
                                ? 'var(--chip)'
                                : undefined,
                            }}
                            title="Select this buyer to see the journey and next actions"
                          >
                            <td>
                              <span className="identity-cell">
                                <span className="avatar-initials">
                                  {anonymous ? 'AN' : 'ID'}
                                </span>
                                <span>
                                  <span className="identity-main">
                                    {anonymous
                                      ? 'Anonymous visitor'
                                      : 'Identified visitor'}
                                  </span>
                                  <br />
                                  <span className="identity-sub">
                                    Session {shortId(s.sessionId)}
                                  </span>
                                </span>
                              </span>
                            </td>
                            {columns.identityType ? (
                              <td>
                                <Badge>
                                  {IDENTITY_STATUS_LABELS[s.identityStatus]}
                                </Badge>
                              </td>
                            ) : null}
                            <td>
                              <ScoreBand score={s.leadScore} />
                            </td>
                            <td className="num">{s.eventCount}</td>
                            {columns.productViews ? (
                              <td className="num">{s.productViews}</td>
                            ) : null}
                            {columns.cartValue ? (
                              <td className="num">
                                {s.cartValueMinor > 0
                                  ? formatMinor(s.cartValueMinor)
                                  : '-'}
                              </td>
                            ) : null}
                            <td>{formatDateTime(s.lastSeenAt)}</td>
                            {columns.marketing ? (
                              <td>
                                {s.marketingUsable
                                  ? 'Usable'
                                  : 'Operational only'}
                              </td>
                            ) : null}
                            <td>
                              <Link
                                href={`/buyer-intelligence/${encodeURIComponent(s.sessionId)}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="table-foot">
                  <span className="muted">
                    Showing {pageItems.length} of {sorted.length}{' '}
                    sessions in the last {rangeDays} days
                  </span>
                  <Pagination
                    page={safePage}
                    pageCount={pageCount}
                    onChange={setPage}
                  />
                </div>
              </>
            )}
          </div>

          <div className="dash-row section-gap">
            <FunnelCard sessions={analysisSet} />
            <SegmentsCard sessions={analysisSet} />
          </div>

          {selectedSession ? (
            <div className="dash-row">
              <div className="card">
                <CardHead icon={Route} title="Buyer Journey">
                  <Link
                    className="btn-secondary btn-small"
                    href={`/buyer-intelligence/${encodeURIComponent(selectedSession.sessionId)}`}
                  >
                    Session detail
                  </Link>
                </CardHead>
                <p className="note muted" style={{ marginTop: 0 }}>
                  {selectedSession.identityStatus === 'anonymous'
                    ? 'Anonymous visitor'
                    : 'Identified visitor'}{' '}
                  · Session {shortId(selectedSession.sessionId)} ·
                  Score {selectedSession.leadScore} (
                  {selectedSession.leadBand})
                </p>
                {detailsState.loading && !selectedDetail ? (
                  <LoadingNote label="Loading the session journey..." />
                ) : null}
                {!detailsState.loading && !selectedDetail ? (
                  <EmptyNote>
                    The event timeline for this session could not
                    be loaded, so no journey can be shown.
                  </EmptyNote>
                ) : null}
                {selectedDetail ? (
                  selectedDetail.events.length === 0 ? (
                    <EmptyNote>
                      No events recorded for this session yet.
                    </EmptyNote>
                  ) : (
                    <div className="journey">
                      {journeySteps(selectedDetail).map((step) => {
                        const StepIcon = step.icon;
                        return (
                          <div
                            key={step.key}
                            className={`journey-step${step.terminal ? ' terminal' : ''}`}
                          >
                            <span className="journey-step-icon">
                              <StepIcon size={17} />
                            </span>
                            <div className="journey-step-title">
                              {step.title}
                            </div>
                            <div className="journey-step-sub">
                              {step.sub}
                            </div>
                            <div className="journey-step-sub">
                              {formatDateTime(step.time)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : null}
              </div>
              <NextActionPanel
                session={selectedSession}
                lead={selectedLead}
                leadsLoading={leadsState.loading}
              />
            </div>
          ) : (
            <div className="card">
              <CardHead icon={Route} title="Buyer Journey" />
              <EmptyNote>
                No session is selected. Sessions appear here once
                the storefront tracker records visitor activity in
                the chosen range.
              </EmptyNote>
            </div>
          )}
          {leadsState.error ? (
            <p className="muted" style={{ fontSize: 12 }}>
              The leads list could not be loaded, so linked lead
              actions are unavailable right now. The session data
              above is unaffected.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
