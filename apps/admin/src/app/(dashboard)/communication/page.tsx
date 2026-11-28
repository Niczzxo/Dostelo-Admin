'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  Download,
  Mail,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Phone,
  Reply,
  Search,
} from 'lucide-react';
import {
  COMMUNICATION_LOG_STATUSES,
  CONTACT_ATTEMPT_RESULTS,
  type CallOutcome,
  type CommunicationChannel,
  type CommunicationLog,
  type CommunicationLogStatus,
  type ContactAttemptResult,
  type Customer,
  type Lead,
} from '@dostelo/types';
import type { MessageTemplateView } from '@dostelo/api-client';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import { useStaffDirectory } from '../../../lib/staff-directory';
import { downloadCsv, toCsv } from '../../../lib/csv';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  ModuleHeader,
  Pagination,
  StatusTabs,
  pageCountFor,
  paginate,
} from '../../../components/ui';

/**
 * Communication Center (redesign): the append-only communication
 * log as a conversation inbox plus an action center. Honesty
 * rules are the point of this page: an entry reads sent only
 * when a configured provider confirmed the send, providers are
 * not configured on this deployment so staff sends record
 * not-configured and the UI says so, refusals (suppressed or no
 * consent) surface the API message in place, and nothing is ever
 * marked delivered locally. There is no inbound reply data in
 * the log, so no response rate is shown. Calls are placed by
 * staff on their own phones and logged after the fact.
 */

type RangeKey = '7' | '30' | '90' | 'all';
type ChannelTab = 'all' | CommunicationChannel;
type ActionTab = 'call' | 'whatsapp' | 'email' | 'sms' | 'followup';
type SortKey = 'newest' | 'oldest' | 'channel' | 'status';

const PAGE_SIZE = 10;

const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  whatsapp: 'WhatsApp',
  call: 'Call',
  email: 'Email',
  sms: 'SMS',
};

const ACTION_TABS: { key: ActionTab; label: string }[] = [
  { key: 'call', label: 'Log a Call' },
  { key: 'whatsapp', label: 'Send WhatsApp' },
  { key: 'email', label: 'Send Email' },
  { key: 'sms', label: 'Send SMS' },
  { key: 'followup', label: 'Schedule Follow-up' },
];

/** Identity an entry belongs to: the address when one is known,
 * otherwise the guest or record id the log carries. */
function identityKey(entry: CommunicationLog): string {
  if (entry.toAddress) return `addr:${entry.toAddress.toLowerCase()}`;
  if (entry.visitorId) return `guest:${entry.visitorId}`;
  if (entry.customerId) return `customer:${entry.customerId}`;
  if (entry.leadId) return `lead:${entry.leadId}`;
  return `entry:${entry.id}`;
}

function identityLabel(entry: CommunicationLog): string {
  if (entry.toAddress) return entry.toAddress;
  if (entry.visitorId) return `Guest ${entry.visitorId}`;
  if (entry.customerId) return `Customer ${entry.customerId}`;
  if (entry.leadId) return `Lead ${entry.leadId}`;
  return 'No address recorded';
}

function initialsFor(label: string): string {
  const cleaned = label.replace(/^Guest\s+/, '');
  const parts = cleaned.split(/[\s@.]+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '?';
  const second = parts[1]?.charAt(0) ?? '';
  return `${first}${second}`.toUpperCase();
}

function statusCounts(entries: CommunicationLog[]): string {
  const sent = entries.filter((entry) => entry.status === 'sent').length;
  const failed = entries.filter((entry) => entry.status === 'failed').length;
  const pending = entries.filter(
    (entry) => entry.status === 'awaiting-staff' || entry.status === 'logged',
  ).length;
  return `Delivered (sent) ${sent}, Failed ${failed}, Pending ${pending}`;
}

/** Maps a contact attempt result onto the manual call outcomes
 * the communication log accepts. */
function toCallOutcome(
  result: ContactAttemptResult,
  doNotContact: boolean,
): CallOutcome {
  if (doNotContact || result === 'opted-out') return 'opted-out';
  if (result === 'no-answer') return 'no-answer';
  return 'answered';
}

/** Renders a template body with sample values for preview only.
 * The server renders the real message at send time. */
function renderPreview(body: string, sampleName: string): string {
  return body.replace(/\{\{\s*[\w.]+\s*\}\}/g, sampleName);
}

interface ContactOption {
  key: string;
  kind: 'customer' | 'lead';
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

function buildContacts(
  customers: Customer[],
  leads: Lead[],
): ContactOption[] {
  const options: ContactOption[] = [];
  for (const customer of customers) {
    options.push({
      key: `customer:${customer.id}`,
      kind: 'customer',
      id: customer.id,
      name: customer.fullName,
      phone: customer.phone,
      email: customer.email,
    });
  }
  for (const lead of leads) {
    options.push({
      key: `lead:${lead.id}`,
      kind: 'lead',
      id: lead.id,
      name: lead.fullName ?? lead.email ?? lead.phone ?? `Lead ${lead.id}`,
      phone: lead.phone,
      email: lead.email,
    });
  }
  return options;
}

export default function CommunicationPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canLogCall =
    permissions.includes('recovery.edit') ||
    permissions.includes('leads.contact');
  const { staff } = useStaffDirectory();

  const [rangeKey, setRangeKey] = useState<RangeKey>('30');
  const [channelTab, setChannelTab] = useState<ChannelTab>('all');
  const [actionTab, setActionTab] = useState<ActionTab>('call');
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(
    null,
  );
  const [inboxSearch, setInboxSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    CommunicationLogStatus | ''
  >('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const actionRef = useRef<HTMLDivElement | null>(null);
  const inboxRef = useRef<HTMLDivElement | null>(null);

  const log = useData((client) => client.listCommunicationLog({}), []);
  const templates = useData((client) => client.listMessageTemplates(), []);
  const customers = useData((client) => client.listCustomers({}), []);
  const leads = useData((client) => client.listLeads({}), []);

  const allEntries = useMemo(() => log.data?.items ?? [], [log.data]);
  const contacts = useMemo(
    () =>
      buildContacts(customers.data?.items ?? [], leads.data?.items ?? []),
    [customers.data, leads.data],
  );

  const rangeEntries = useMemo(() => {
    if (rangeKey === 'all') return allEntries;
    const cutoff = Date.now() - Number(rangeKey) * 24 * 60 * 60_000;
    return allEntries.filter(
      (entry) => new Date(entry.createdAt).getTime() >= cutoff,
    );
  }, [allEntries, rangeKey]);

  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rangeEntries.length };
    for (const channel of Object.keys(CHANNEL_LABELS)) {
      counts[channel] = rangeEntries.filter(
        (entry) => entry.channel === channel,
      ).length;
    }
    return counts;
  }, [rangeEntries]);

  const channelEntries = useMemo(
    () =>
      channelTab === 'all'
        ? rangeEntries
        : rangeEntries.filter((entry) => entry.channel === channelTab),
    [rangeEntries, channelTab],
  );

  interface ConvoGroup {
    key: string;
    label: string;
    latest: CommunicationLog;
    channels: CommunicationChannel[];
    count: number;
  }

  const convoGroups = useMemo<ConvoGroup[]>(() => {
    const sorted = [...channelEntries].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const groups = new Map<string, ConvoGroup>();
    for (const entry of sorted) {
      const key = identityKey(entry);
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.channels.includes(entry.channel)) {
          existing.channels.push(entry.channel);
        }
      } else {
        groups.set(key, {
          key,
          label: identityLabel(entry),
          latest: entry,
          channels: [entry.channel],
          count: 1,
        });
      }
    }
    return [...groups.values()];
  }, [channelEntries]);

  const visibleGroups = useMemo(() => {
    const query = inboxSearch.trim().toLowerCase();
    if (!query) return convoGroups;
    return convoGroups.filter(
      (group) =>
        group.label.toLowerCase().includes(query) ||
        group.latest.body.toLowerCase().includes(query),
    );
  }, [convoGroups, inboxSearch]);

  const selectedEntries = useMemo(() => {
    if (!selectedIdentity) return [];
    return rangeEntries
      .filter((entry) => identityKey(entry) === selectedIdentity)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rangeEntries, selectedIdentity]);

  const tableEntries = useMemo(() => {
    let rows = channelEntries;
    if (selectedIdentity) {
      rows = rows.filter(
        (entry) => identityKey(entry) === selectedIdentity,
      );
    }
    if (statusFilter) {
      rows = rows.filter((entry) => entry.status === statusFilter);
    }
    const query = tableSearch.trim().toLowerCase();
    if (query) {
      rows = rows.filter((entry) =>
        [
          identityLabel(entry),
          entry.toAddress ?? '',
          entry.body,
          entry.subject ?? '',
          entry.detail ?? '',
          entry.status,
          entry.kind,
          entry.staffId ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(query),
      );
    }
    const sorted = [...rows];
    if (sortKey === 'newest') {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sortKey === 'oldest') {
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else if (sortKey === 'channel') {
      sorted.sort(
        (a, b) =>
          a.channel.localeCompare(b.channel) ||
          b.createdAt.localeCompare(a.createdAt),
      );
    } else {
      sorted.sort(
        (a, b) =>
          a.status.localeCompare(b.status) ||
          b.createdAt.localeCompare(a.createdAt),
      );
    }
    return sorted;
  }, [channelEntries, selectedIdentity, statusFilter, tableSearch, sortKey]);

  useEffect(() => {
    setPage(1);
  }, [channelTab, statusFilter, tableSearch, selectedIdentity, rangeKey, sortKey]);

  const pageRows = paginate(tableEntries, page, PAGE_SIZE);

  const kpiFor = (channel: CommunicationChannel) =>
    statusCounts(rangeEntries.filter((entry) => entry.channel === channel));

  function focusActionCenter(tab: ActionTab): void {
    setActionTab(tab);
    actionRef.current?.scrollIntoView({ behavior: 'smooth' });
    actionRef.current?.focus({ preventScroll: true });
  }

  function exportCsv(): void {
    downloadCsv(
      'communications.csv',
      toCsv(
        [
          'Date and Time',
          'Customer or Identity',
          'Channel',
          'Type',
          'Status',
          'Call Outcome',
          'Assigned To',
          'To',
          'Subject',
          'Notes',
          'Detail',
        ],
        tableEntries.map((entry) => [
          formatDateTime(entry.createdAt),
          identityLabel(entry),
          entry.channel,
          entry.kind,
          entry.status,
          entry.callOutcome ?? '',
          entry.staffId ?? '',
          entry.toAddress ?? '',
          entry.subject ?? '',
          entry.body,
          entry.detail ?? '',
        ]),
      ),
    );
  }

  return (
    <section>
      <ModuleHeader
        icon={MessageSquare}
        title="Communication Center"
        description="Every automated send, refusal and staff logged call in one place. Nothing reads as sent unless a configured provider confirmed it: providers are not configured here, so staff sends record not-configured."
      >
        <label className="range-select">
          <CalendarClock size={15} />
          <select
            value={rangeKey}
            onChange={(event) => setRangeKey(event.target.value as RangeKey)}
            aria-label="Date range"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => focusActionCenter('whatsapp')}
        >
          New Message
        </button>
      </ModuleHeader>

      {log.loading ? (
        <div className="kpi-grid">
          <KpiCard icon={MessagesSquare} label="Total Communications" value="..." tone="purple" />
          <KpiCard icon={MessageCircle} label="WhatsApp Messages" value="..." tone="green" />
          <KpiCard icon={Phone} label="Call Activities" value="..." tone="blue" />
          <KpiCard icon={Mail} label="Email Messages" value="..." tone="orange" />
          <KpiCard icon={Reply} label="Response Rate" value="..." tone="purple" />
        </div>
      ) : log.error ? (
        <ErrorNote error={log.error} onRetry={log.reload} />
      ) : (
        <div className="kpi-grid">
          <KpiCard
            icon={MessagesSquare}
            label="Total Communications"
            value={rangeEntries.length.toLocaleString('en-US')}
            note={statusCounts(rangeEntries)}
            tone="purple"
          />
          <KpiCard
            icon={MessageCircle}
            label="WhatsApp Messages"
            value={(channelCounts['whatsapp'] ?? 0).toLocaleString('en-US')}
            note={kpiFor('whatsapp')}
            tone="green"
          />
          <KpiCard
            icon={Phone}
            label="Call Activities"
            value={(channelCounts['call'] ?? 0).toLocaleString('en-US')}
            note={kpiFor('call')}
            tone="blue"
          />
          <KpiCard
            icon={Mail}
            label="Email Messages"
            value={(channelCounts['email'] ?? 0).toLocaleString('en-US')}
            note={kpiFor('email')}
            tone="orange"
          />
          <KpiCard
            icon={Reply}
            label="Response Rate"
            value="Unavailable"
            note="No inbound reply data is recorded in the communication log, so a response rate cannot be computed."
            tone="purple"
          />
        </div>
      )}

      <StatusTabs
        tabs={[
          { key: 'all', label: 'All', count: channelCounts['all'] ?? 0 },
          { key: 'whatsapp', label: 'WhatsApp', count: channelCounts['whatsapp'] ?? 0 },
          { key: 'call', label: 'Call', count: channelCounts['call'] ?? 0 },
          { key: 'email', label: 'Email', count: channelCounts['email'] ?? 0 },
          { key: 'sms', label: 'SMS', count: channelCounts['sms'] ?? 0 },
        ]}
        active={channelTab}
        onChange={(key) => setChannelTab(key as ChannelTab)}
      />

      <div className="comm-layout">
        <div className="card" ref={inboxRef} tabIndex={-1}>
          <CardHead icon={MessagesSquare} title="Conversation Inbox">
            {selectedIdentity ? (
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => setSelectedIdentity(null)}
              >
                Clear selection
              </button>
            ) : null}
          </CardHead>
          <label className="field" style={{ marginTop: 0 }}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Search size={14} /> Search conversations
            </span>
            <input
              className="input"
              value={inboxSearch}
              onChange={(event) => setInboxSearch(event.target.value)}
              placeholder="Name, address or message text"
            />
          </label>
          {log.loading ? (
            <LoadingNote label="Loading conversations..." />
          ) : log.error ? (
            <ErrorNote error={log.error} onRetry={log.reload} />
          ) : visibleGroups.length === 0 ? (
            <EmptyNote>
              No conversations match yet. Sends, refusals and logged
              calls appear here as they happen.
            </EmptyNote>
          ) : (
            <div className="convo-list">
              {visibleGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  className={`convo-item${selectedIdentity === group.key ? ' active' : ''}`}
                  onClick={() =>
                    setSelectedIdentity(
                      selectedIdentity === group.key ? null : group.key,
                    )
                  }
                >
                  <span className="avatar-initials">
                    {initialsFor(group.label)}
                  </span>
                  <span className="convo-main">
                    <span className="convo-head">
                      <span className="convo-name">{group.label}</span>
                      <span className="convo-time">
                        {formatDateTime(group.latest.createdAt)}
                      </span>
                    </span>
                    <span className="convo-preview">
                      {group.latest.subject
                        ? `${group.latest.subject}: `
                        : ''}
                      {group.latest.body}
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        gap: 6,
                        flexWrap: 'wrap',
                        marginTop: 5,
                      }}
                    >
                      {group.channels.map((channel) => (
                        <Badge key={channel}>
                          {CHANNEL_LABELS[channel]}
                        </Badge>
                      ))}
                      <span className="muted" style={{ fontSize: 12 }}>
                        {group.count} entr{group.count === 1 ? 'y' : 'ies'}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedIdentity && selectedEntries.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>
                Unified history: {identityLabel(selectedEntries[0]!)}
              </h3>
              <div className="convo-list" style={{ maxHeight: 320 }}>
                {selectedEntries.map((entry) => (
                  <div key={entry.id} className="convo-item">
                    <span className="convo-main">
                      <span className="convo-head">
                        <span className="convo-name">
                          {CHANNEL_LABELS[entry.channel]} ({entry.kind})
                        </span>
                        <span className="convo-time">
                          {formatDateTime(entry.createdAt)}
                        </span>
                      </span>
                      <span className="convo-preview" style={{ whiteSpace: 'normal' }}>
                        {entry.subject ? `${entry.subject}: ` : ''}
                        {entry.body}
                      </span>
                      <span style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                        <Badge>{entry.status}</Badge>
                        {entry.callOutcome ? (
                          <span className="muted" style={{ fontSize: 12 }}>
                            {entry.callOutcome}
                          </span>
                        ) : null}
                      </span>
                      {entry.detail ? (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {entry.detail}
                        </div>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="card" ref={actionRef} tabIndex={-1}>
          <CardHead icon={MessageSquare} title="Action Center" />
          <div className="action-tabs" role="tablist">
            {ACTION_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={actionTab === tab.key}
                className={`action-tab${actionTab === tab.key ? ' active' : ''}`}
                onClick={() => setActionTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {actionTab === 'call' ? (
            canLogCall ? (
              <CallPanel
                customers={customers.data?.items ?? []}
                leads={leads.data?.items ?? []}
                onDone={log.reload}
              />
            ) : (
              <p className="note muted">
                Logging a call needs the recovery.edit or leads.contact
                permission.
              </p>
            )
          ) : null}
          {actionTab === 'whatsapp' ? (
            <SendPanel
              channel="whatsapp"
              contacts={contacts}
              templates={(templates.data?.items ?? []).filter(
                (template) => template.channel === 'whatsapp',
              )}
              templatesLoading={templates.loading}
              templatesError={templates.error}
              onTemplatesRetry={templates.reload}
              onDone={log.reload}
            />
          ) : null}
          {actionTab === 'email' ? (
            <SendPanel
              channel="email"
              contacts={contacts}
              templates={(templates.data?.items ?? []).filter(
                (template) => template.channel === 'email',
              )}
              templatesLoading={templates.loading}
              templatesError={templates.error}
              onTemplatesRetry={templates.reload}
              onDone={log.reload}
            />
          ) : null}
          {actionTab === 'sms' ? (
            <SendPanel
              channel="sms"
              contacts={contacts}
              templates={(templates.data?.items ?? []).filter(
                (template) => template.channel === 'sms',
              )}
              templatesLoading={templates.loading}
              templatesError={templates.error}
              onTemplatesRetry={templates.reload}
              onDone={log.reload}
            />
          ) : null}
          {actionTab === 'followup' ? (
            <FollowUpPanel
              customers={customers.data?.items ?? []}
              leads={leads.data?.items ?? []}
              staff={staff}
              onDone={log.reload}
            />
          ) : null}
        </div>
      </div>

      <div className="card section-gap">
        <CardHead icon={MessagesSquare} title="Recent Communications">
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={exportCsv}
            disabled={tableEntries.length === 0}
          >
            <Download size={14} /> Export CSV
          </button>
        </CardHead>

        <div className="filter-row" style={{ marginBottom: 14 }}>
          <label className="field">
            Search
            <input
              className="input"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              placeholder="Identity, message, detail or staff id"
            />
          </label>
          <label className="field">
            Status
            <select
              className="select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as CommunicationLogStatus | '',
                )
              }
            >
              <option value="">All statuses</option>
              {COMMUNICATION_LOG_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Sort
            <select
              className="select"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="channel">Channel</option>
              <option value="status">Status</option>
            </select>
          </label>
          <div className="filter-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setTableSearch('');
                setStatusFilter('');
                setSelectedIdentity(null);
                setChannelTab('all');
              }}
            >
              Reset
            </button>
          </div>
        </div>
        <p className="note muted" style={{ marginTop: 0 }}>
          Channel, date range and conversation selection filters above
          also apply to this table.
          {selectedIdentity
            ? ' Showing only the selected conversation.'
            : ''}
        </p>

        {log.loading ? (
          <LoadingNote label="Loading communication log..." />
        ) : log.error ? (
          <ErrorNote error={log.error} onRetry={log.reload} />
        ) : tableEntries.length === 0 ? (
          <EmptyNote>
            No communication entries match these filters yet.
          </EmptyNote>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date and Time</th>
                    <th>Customer or Identity</th>
                    <th>Channel</th>
                    <th>Type or Direction</th>
                    <th>Outcome or Status</th>
                    <th>Assigned To</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.createdAt)}</td>
                      <td>
                        <span className="identity-cell">
                          <span className="avatar-initials">
                            {initialsFor(identityLabel(entry))}
                          </span>
                          <span>
                            <span className="identity-main">
                              {identityLabel(entry)}
                            </span>
                            <span className="identity-sub">
                              {entry.customerId ? (
                                <Link href={`/crm/${entry.customerId}`}>
                                  Customer
                                </Link>
                              ) : null}
                              {entry.leadId ? (
                                <>
                                  {' '}
                                  <Link href={`/leads/${entry.leadId}`}>
                                    Lead
                                  </Link>
                                </>
                              ) : null}
                              {entry.abandonedCartId ? (
                                <>
                                  {' '}
                                  <Link
                                    href={`/cart-recovery/${entry.abandonedCartId}`}
                                  >
                                    Recovery
                                  </Link>
                                </>
                              ) : null}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <Badge>{CHANNEL_LABELS[entry.channel]}</Badge>
                      </td>
                      <td>{entry.kind}</td>
                      <td>
                        <Badge>{entry.status}</Badge>
                        {entry.callOutcome ? (
                          <div className="muted">{entry.callOutcome}</div>
                        ) : null}
                      </td>
                      <td>{entry.staffId ?? '–'}</td>
                      <td>
                        {entry.subject ? (
                          <strong>{entry.subject}</strong>
                        ) : null}
                        <div>{entry.body}</div>
                        {entry.detail ? (
                          <div className="muted">{entry.detail}</div>
                        ) : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          onClick={() => {
                            setSelectedIdentity(identityKey(entry));
                            inboxRef.current?.scrollIntoView({
                              behavior: 'smooth',
                            });
                          }}
                        >
                          View in inbox
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="muted">
                {tableEntries.length} entr
                {tableEntries.length === 1 ? 'y' : 'ies'}
              </span>
              <Pagination
                page={page}
                pageCount={pageCountFor(tableEntries.length, PAGE_SIZE)}
                onChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* Log a Call panel */

function CallPanel({
  customers,
  leads,
  onDone,
}: {
  customers: Customer[];
  leads: Lead[];
  onDone: () => void;
}) {
  const [leadKey, setLeadKey] = useState('');
  const [customerKey, setCustomerKey] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [outcome, setOutcome] = useState<ContactAttemptResult>('answered');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [addToCrm, setAddToCrm] = useState(false);
  const [doNotContact, setDoNotContact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const selectedLead = leads.find((lead) => lead.id === leadKey) ?? null;

  function pickLead(id: string): void {
    setLeadKey(id);
    const lead = leads.find((item) => item.id === id);
    if (lead?.phone) {
      setLocalPhone(
        lead.phone.replace(/^\+?880/, '').replace(/^0/, ''),
      );
    }
    if (lead?.customerId) setCustomerKey(lead.customerId);
  }

  async function submit(withFollowUp: boolean): Promise<void> {
    const digits = localPhone.replace(/\D/g, '').replace(/^880/, '').replace(/^0/, '');
    if (!digits) {
      setError('Enter the phone number that was called.');
      return;
    }
    const phone = `+880${digits}`;
    setBusy(true);
    setError(null);
    setSaved(null);
    const warnings: string[] = [];
    const noteParts = [notes.trim()];
    if (duration.trim()) {
      noteParts.push(`Duration: ${duration.trim()} minutes.`);
    }
    const composedNotes = noteParts.filter(Boolean).join(' ');
    try {
      await api.logManualCall({
        phone,
        outcome: toCallOutcome(outcome, doNotContact),
        notes: composedNotes ? composedNotes : undefined,
        customerId: customerKey || undefined,
        leadId: leadKey || undefined,
      });
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
      setBusy(false);
      return;
    }
    if (selectedLead) {
      try {
        await api.recordContactAttempt(selectedLead.id, {
          channel: 'phone',
          purpose: 'Manual call logged in Communication Center',
          result: doNotContact ? 'opted-out' : outcome,
          note: composedNotes ? composedNotes : undefined,
          optOut: doNotContact || outcome === 'opted-out',
        });
      } catch (caught) {
        const uiError = toUiError(caught);
        if (uiError.kind === 'unauthorized') {
          expireSession();
          return;
        }
        warnings.push(`Contact attempt record: ${uiError.message}`);
      }
    }
    if (addToCrm && customerKey && composedNotes) {
      try {
        await api.addCustomerNote(customerKey, { body: composedNotes });
      } catch (caught) {
        const uiError = toUiError(caught);
        warnings.push(`CRM note: ${uiError.message}`);
      }
    } else if (addToCrm && !customerKey) {
      warnings.push('CRM note skipped: no customer was selected.');
    }
    if (withFollowUp || followUpRequired) {
      if (selectedLead) {
        try {
          await api.createFollowUpTask(selectedLead.id, {
            title: `Follow up call with ${phone}`,
          });
        } catch (caught) {
          const uiError = toUiError(caught);
          warnings.push(`Follow-up task: ${uiError.message}`);
        }
      } else {
        warnings.push(
          'Follow-up task skipped: follow-ups are lead tasks in the API, so select a lead to create one.',
        );
      }
    }
    setBusy(false);
    setSaved(
      warnings.length > 0
        ? `Call logged. ${warnings.join(' ')}`
        : 'Call logged.',
    );
    setLocalPhone('');
    setNotes('');
    setDuration('');
    setOutcome('answered');
    setFollowUpRequired(false);
    setAddToCrm(false);
    setDoNotContact(false);
    onDone();
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <p className="note muted" style={{ marginTop: 0 }}>
        Manually logged call. No call is placed by the system.
        Recording an opt-out writes a suppression record for this
        number, and later contact is refused.
      </p>
      <label className="field">
        Linked lead (optional, enables the contact attempt record and
        follow-up tasks)
        <select
          className="select"
          value={leadKey}
          onChange={(event) => pickLead(event.target.value)}
        >
          <option value="">No lead linked</option>
          {leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.fullName ?? lead.email ?? lead.phone ?? lead.id}
              {lead.phone ? ` (${lead.phone})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Linked customer (optional)
        <select
          className="select"
          value={customerKey}
          onChange={(event) => setCustomerKey(event.target.value)}
        >
          <option value="">No customer linked</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.fullName} ({customer.phone})
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Phone number called
        <span style={{ display: 'flex', gap: 8 }}>
          <select className="select" value="+880" onChange={() => undefined} aria-label="Country prefix" style={{ maxWidth: 110 }}>
            <option value="+880">+880</option>
          </select>
          <input
            className="input"
            value={localPhone}
            onChange={(event) => setLocalPhone(event.target.value)}
            placeholder="1XXXXXXXXX"
          />
        </span>
      </label>
      <label className="field">
        Outcome
        <select
          className="select"
          value={outcome}
          onChange={(event) =>
            setOutcome(event.target.value as ContactAttemptResult)
          }
        >
          {CONTACT_ATTEMPT_RESULTS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Duration (minutes, optional)
        <input
          className="input"
          type="number"
          min="0"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
          placeholder="5"
        />
      </label>
      <label className="field">
        Notes
        <textarea
          className="input"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What was discussed or agreed"
          maxLength={1000}
        />
        <span className="char-count">{notes.length} / 1000</span>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
        <input
          type="checkbox"
          checked={followUpRequired}
          onChange={(event) => setFollowUpRequired(event.target.checked)}
        />
        Follow-up required
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <input
          type="checkbox"
          checked={addToCrm}
          onChange={(event) => setAddToCrm(event.target.checked)}
        />
        Add to CRM note (needs a linked customer and notes)
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <input
          type="checkbox"
          checked={doNotContact}
          onChange={(event) => setDoNotContact(event.target.checked)}
        />
        Do Not Contact opt-out for this number
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => void submit(true)}
        >
          Save and Create Follow-up
        </button>
      </div>
      {saved ? <p className="note">{saved}</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* Send panels for WhatsApp, Email and SMS */

function SendPanel({
  channel,
  contacts,
  templates,
  templatesLoading,
  templatesError,
  onTemplatesRetry,
  onDone,
}: {
  channel: 'whatsapp' | 'email' | 'sms';
  contacts: ContactOption[];
  templates: MessageTemplateView[];
  templatesLoading: boolean;
  templatesError: { message: string } | null;
  onTemplatesRetry: () => void;
  onDone: () => void;
}) {
  const [contactKey, setContactKey] = useState('');
  const [manualTo, setManualTo] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommunicationLog | null>(null);

  const contact = contacts.find((item) => item.key === contactKey) ?? null;
  const channelAddress =
    channel === 'email' ? contact?.email : contact?.phone;
  const to = contact ? (channelAddress ?? '') : manualTo.trim();
  const template =
    templates.find((item) => item.key === templateKey) ?? null;
  const previewBody = body.trim()
    ? body
    : template
      ? renderPreview(template.body, contact?.name ?? 'Sample name')
      : '';
  const previewSubject = subject.trim()
    ? subject
    : (template?.subject ?? '');

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!to) {
      setError(
        channel === 'email'
          ? 'Choose a contact with an email address or enter a recipient.'
          : 'Choose a contact with a phone number or enter a recipient.',
      );
      return;
    }
    if (!templateKey && !body.trim()) {
      setError('Pick a template or write a message body.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const sent = await api.sendMessage({
        channel,
        to,
        customerId: contact?.kind === 'customer' ? contact.id : undefined,
        leadId: contact?.kind === 'lead' ? contact.id : undefined,
        templateKey: templateKey || undefined,
        subject:
          channel === 'email' && subject.trim()
            ? subject.trim()
            : undefined,
        body: body.trim() ? body.trim() : undefined,
        purpose: 'Communication Center staff message',
      });
      setResult(sent);
      onDone();
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

  const label = CHANNEL_LABELS[channel];

  return (
    <form onSubmit={submit}>
      <p className="note muted" style={{ marginTop: 0 }}>
        Providers are not configured for {label} on this deployment,
        so a send is recorded with the status the API returns
        (not-configured) and is never shown as delivered here.
      </p>
      <label className="field">
        Customer or lead
        <select
          className="select"
          value={contactKey}
          onChange={(event) => setContactKey(event.target.value)}
        >
          <option value="">Enter the recipient manually below</option>
          {contacts
            .filter((item) =>
              channel === 'email' ? item.email : item.phone,
            )
            .map((item) => (
              <option key={item.key} value={item.key}>
                {item.name} ({item.kind},{' '}
                {channel === 'email' ? item.email : item.phone})
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Recipient {channel === 'email' ? '(email address)' : '(phone number)'}
        <input
          className="input"
          value={contact ? to : manualTo}
          disabled={Boolean(contact)}
          onChange={(event) => setManualTo(event.target.value)}
          placeholder={
            channel === 'email' ? 'name@example.com' : '+8801XXXXXXXXX'
          }
        />
      </label>
      <label className="field">
        Template (optional when a body is written)
        {templatesLoading ? (
          <span className="muted">Loading templates...</span>
        ) : templatesError ? (
          <span>
            <span className="form-error">{templatesError.message}</span>{' '}
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={onTemplatesRetry}
            >
              Retry
            </button>
          </span>
        ) : (
          <select
            className="select"
            value={templateKey}
            onChange={(event) => setTemplateKey(event.target.value)}
          >
            <option value="">No template</option>
            {templates.map((item) => (
              <option key={item.key} value={item.key}>
                {item.key}
              </option>
            ))}
          </select>
        )}
      </label>
      {channel === 'email' ? (
        <label className="field">
          Subject
          <input
            className="input"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Message subject"
            maxLength={200}
          />
        </label>
      ) : null}
      <label className="field">
        {channel === 'email' ? 'Body' : 'Message body'}
        <textarea
          className="input"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={
            template
              ? 'Leave empty to send the selected template'
              : 'Write the message'
          }
          maxLength={4000}
        />
        <span className="char-count">{body.length} / 4000 characters</span>
      </label>

      {previewBody ? (
        <div style={{ marginTop: 12 }}>
          <p className="note muted" style={{ margin: '0 0 6px' }}>
            Preview with sample values. The server renders the final
            message at send time.
          </p>
          {channel === 'email' ? (
            <div className="preview-email">
              {previewSubject ? (
                <strong>{previewSubject}</strong>
              ) : null}
              {previewSubject ? '\n' : ''}
              {previewBody}
            </div>
          ) : (
            <div className="preview-bubble">{previewBody}</div>
          )}
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Sending...' : `Send ${label}`}
        </button>
      </div>
      {result ? (
        <p className="note" role="status">
          Recorded status: {result.status}
          {result.detail ? `. ${result.detail}` : ''}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* Schedule Follow-up panel */

function FollowUpPanel({
  customers,
  leads,
  staff,
  onDone,
}: {
  customers: Customer[];
  leads: Lead[];
  staff: { id: string; displayName: string; email: string }[];
  onDone: () => void;
}) {
  const [selection, setSelection] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [staffId, setStaffId] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaved(false);
    let lead: Lead | null = null;
    if (selection.startsWith('lead:')) {
      lead = leads.find((item) => item.id === selection.slice(5)) ?? null;
    } else if (selection.startsWith('customer:')) {
      const customerId = selection.slice(9);
      lead =
        leads.find((item) => item.customerId === customerId) ?? null;
      if (!lead) {
        setError(
          'Follow-up tasks are lead records in the API and this customer has no linked lead. Pick a lead instead.',
        );
        return;
      }
    }
    if (!lead) {
      setError('Select a customer or lead first.');
      return;
    }
    const staffMember = staff.find((item) => item.id === staffId) ?? null;
    const detail = reminderNote.trim() || notes.trim() || 'Contact them';
    const title = [
      `Follow-up via ${channel}`,
      staffMember ? `assigned to ${staffMember.displayName}` : 'unassigned',
      detail,
      reminderNote.trim() && notes.trim() ? notes.trim() : '',
    ]
      .filter(Boolean)
      .join(': ')
      .slice(0, 200);
    const dueAt = date
      ? new Date(`${date}T${time || '09:00'}`).toISOString()
      : undefined;
    setBusy(true);
    try {
      await api.createFollowUpTask(lead.id, { title, dueAt });
      setSaved(true);
      onDone();
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
    <form onSubmit={submit}>
      <p className="note muted" style={{ marginTop: 0 }}>
        Follow-up tasks are stored on the lead record. The channel,
        assigned staff member and notes are written into the task
        title because the API has no separate fields for them.
      </p>
      <label className="field">
        Customer or lead
        <select
          className="select"
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
        >
          <option value="">Select a customer or lead</option>
          <optgroup label="Leads">
            {leads.map((lead) => (
              <option key={lead.id} value={`lead:${lead.id}`}>
                {lead.fullName ?? lead.email ?? lead.phone ?? lead.id}
              </option>
            ))}
          </optgroup>
          <optgroup label="Customers">
            {customers.map((customer) => (
              <option key={customer.id} value={`customer:${customer.id}`}>
                {customer.fullName} ({customer.phone})
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className="field">
        Channel
        <select
          className="select"
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="phone">Phone call</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
      </label>
      <label className="field">
        Date
        <input
          className="input"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label className="field">
        Time
        <input
          className="input"
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />
      </label>
      <label className="field">
        Assigned staff
        <select
          className="select"
          value={staffId}
          onChange={(event) => setStaffId(event.target.value)}
        >
          <option value="">Unassigned</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName} ({member.email})
            </option>
          ))}
        </select>
        {staff.length === 0 ? (
          <span className="muted" style={{ fontSize: 12 }}>
            Staff directory is unavailable for your role, so the task
            is saved unassigned.
          </span>
        ) : null}
      </label>
      <label className="field">
        Reminder note
        <input
          className="input"
          value={reminderNote}
          onChange={(event) => setReminderNote(event.target.value)}
          placeholder="What to remind them about"
          maxLength={200}
        />
      </label>
      <label className="field">
        Notes
        <textarea
          className="input"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Any extra context for the follow-up"
          maxLength={1000}
        />
        <span className="char-count">{notes.length} / 1000</span>
      </label>
      <div style={{ marginTop: 14 }}>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving...' : 'Schedule Follow-up'}
        </button>
      </div>
      {saved ? <p className="note">Follow-up scheduled.</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
