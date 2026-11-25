'use client';

import { useMemo, useState } from 'react';
import {
  Blocks,
  CheckCircle2,
  KeyRound,
  ListChecks,
  MoreHorizontal,
  PlugZap,
  XCircle,
} from 'lucide-react';
import {
  INTEGRATION_CATEGORY_LABELS,
  type IntegrationStatus,
  type IntegrationTestResult,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import {
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

/**
 * System Integrations (redesign): a read-only board of every
 * provider the platform integrates with. Status is computed by
 * the server from the API host environment at request time, and
 * this page never writes configuration. Credentials live in the
 * API host environment (in this deployment, the Railway service
 * variables); only variable names and their set or missing state
 * are ever shown. There is no credential form here, and custom
 * integrations cannot be created from this page: a new provider
 * needs a code adapter in the API first.
 *
 * The list endpoint returns only the MISSING variable names for
 * each integration, so for a configured integration this page
 * shows that all required variables are set rather than inventing
 * a full required list the API did not return.
 */

const PAGE_SIZE = 10;

type CategoryTab = 'all' | 'payments' | 'communications' | 'shipping';
type StatusFilter = 'all' | 'configured' | 'not-configured';

/**
 * Webhook paths verified in the API source: the gateway receiver
 * is POST /v1/webhooks/:gateway
 * (apps/api/src/modules/webhooks/webhooks.controller.ts) and the
 * courier receiver is POST /v1/webhooks/couriers/:courier
 * (apps/api/src/modules/shipping/courier-webhooks.controller.ts).
 * Cash on Delivery and manual mobile banking have no webhooks,
 * and no communications webhook route exists in the API, so those
 * integrations show no webhook endpoint here.
 */
function webhookPathFor(item: IntegrationStatus): string | null {
  if (item.category === 'payments') {
    if (item.key === 'cod' || item.key === 'manual-mobile-banking') {
      return null;
    }
    return 'POST /v1/webhooks/:gateway';
  }
  if (item.category === 'shipping') {
    return 'POST /v1/webhooks/couriers/:courier';
  }
  return null;
}

function markFor(item: IntegrationStatus): string {
  const words = item.name.replace(/[()]/g, '').split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

function StatusChip({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="band-chip green">Configured</span>
  ) : (
    <span className="band-chip hot">Not configured</span>
  );
}

export default function IntegrationsPage() {
  const integrations = useData((client) => client.listIntegrations(), []);
  const [tab, setTab] = useState<CategoryTab>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [results, setResults] = useState<
    Record<string, IntegrationTestResult>
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [testAllBusy, setTestAllBusy] = useState(false);
  const [testAllOpen, setTestAllOpen] = useState(false);
  const [testAllResults, setTestAllResults] = useState<
    IntegrationTestResult[]
  >([]);

  const items = integrations.data?.items ?? [];
  const configuredCount = items.filter((item) => item.configured).length;
  const notConfiguredCount = items.length - configuredCount;
  const missingTotal = items.reduce(
    (sum, item) => sum + item.missing.length,
    0,
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (tab !== 'all' && item.category !== tab) return false;
      if (statusFilter === 'configured' && !item.configured) return false;
      if (statusFilter === 'not-configured' && item.configured) return false;
      if (!query) return true;
      const haystack = [
        item.name,
        item.note ?? '',
        INTEGRATION_CATEGORY_LABELS[item.category],
        ...item.missing,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations.data, tab, statusFilter, search]);

  const pageRows = paginate(filtered, page, PAGE_SIZE);
  const selected =
    items.find((item) => item.key === selectedKey) ?? null;

  const countFor = (category: CategoryTab): number =>
    category === 'all'
      ? items.length
      : items.filter((item) => item.category === category).length;

  async function runTest(item: IntegrationStatus): Promise<void> {
    setBusyKey(item.key);
    setActionError(null);
    try {
      const result = await api.testIntegration(item.key);
      setResults((current) => ({ ...current, [item.key]: result }));
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setActionError(uiError.message);
    } finally {
      setBusyKey(null);
    }
  }

  async function runTestAll(): Promise<void> {
    setTestAllBusy(true);
    setActionError(null);
    const collected: IntegrationTestResult[] = [];
    try {
      for (const item of items) {
        const result = await api.testIntegration(item.key);
        collected.push(result);
        setResults((current) => ({ ...current, [item.key]: result }));
      }
      setTestAllResults(collected);
      setTestAllOpen(true);
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setActionError(uiError.message);
      if (collected.length > 0) {
        setTestAllResults(collected);
        setTestAllOpen(true);
      }
    } finally {
      setTestAllBusy(false);
    }
  }

  return (
    <section>
      <ModuleHeader
        icon={Blocks}
        title="System Integrations"
        description="Every provider the platform integrates with, with its configuration state as computed by the server from the API host environment."
      >
        <button
          type="button"
          className="btn"
          disabled={testAllBusy || items.length === 0}
          onClick={() => void runTestAll()}
        >
          <PlugZap size={15} />{' '}
          {testAllBusy ? 'Testing...' : 'Test All Integrations'}
        </button>
      </ModuleHeader>

      <p className="note muted" style={{ marginTop: 0, maxWidth: 820 }}>
        Custom integrations are not creatable from this page: a new
        provider needs a code adapter in the API first, and only then
        does it appear on this board.
      </p>

      {integrations.loading ? (
        <div className="kpi-grid">
          <KpiCard icon={Blocks} label="Total Integrations" value="..." tone="purple" />
          <KpiCard icon={CheckCircle2} label="Configured" value="..." tone="green" />
          <KpiCard icon={XCircle} label="Not Configured" value="..." tone="orange" />
          <KpiCard icon={KeyRound} label="Missing Variables" value="..." tone="blue" />
        </div>
      ) : integrations.error || !integrations.data ? (
        <div className="kpi-grid">
          <KpiCard icon={Blocks} label="Total Integrations" value="Unavailable" note="Could not load the integrations board." tone="purple" />
          <KpiCard icon={CheckCircle2} label="Configured" value="Unavailable" note="Could not load the integrations board." tone="green" />
          <KpiCard icon={XCircle} label="Not Configured" value="Unavailable" note="Could not load the integrations board." tone="orange" />
          <KpiCard icon={KeyRound} label="Missing Variables" value="Unavailable" note="Could not load the integrations board." tone="blue" />
        </div>
      ) : (
        <div className="kpi-grid">
          <KpiCard
            icon={Blocks}
            label="Total Integrations"
            value={items.length.toLocaleString('en-US')}
            note="Providers registered in the API"
            tone="purple"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Configured"
            value={configuredCount.toLocaleString('en-US')}
            note="All required variables are set on the API host"
            tone="green"
          />
          <KpiCard
            icon={XCircle}
            label="Not Configured"
            value={notConfiguredCount.toLocaleString('en-US')}
            note="At least one required variable is missing"
            tone="orange"
          />
          <KpiCard
            icon={KeyRound}
            label="Missing Variables"
            value={missingTotal.toLocaleString('en-US')}
            note="Missing variable names summed across all integrations"
            tone="blue"
          />
        </div>
      )}

      <StatusTabs
        tabs={[
          { key: 'all', label: 'All Integrations', count: countFor('all') },
          { key: 'payments', label: 'Payments', count: countFor('payments') },
          {
            key: 'communications',
            label: 'Communications',
            count: countFor('communications'),
          },
          {
            key: 'shipping',
            label: 'Shipping and Courier',
            count: countFor('shipping'),
          },
        ]}
        active={tab}
        onChange={(key) => {
          setTab(key as CategoryTab);
          setPage(1);
        }}
      />

      <div className="card filter-card">
        <div className="filter-row">
          <label className="field">
            Search
            <input
              className="input"
              placeholder="Name, variable name or note"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="field">
            Status
            <select
              className="select"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="configured">Configured</option>
              <option value="not-configured">Not Configured</option>
            </select>
          </label>
          <div className="filter-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setTab('all');
                setPage(1);
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <CardHead icon={ListChecks} title="Integrations">
          <span className="muted" style={{ fontSize: 12.5 }}>
            Status is computed by the server from the environment at
            request time
          </span>
        </CardHead>
        {integrations.loading ? (
          <LoadingNote label="Loading integrations..." />
        ) : null}
        {integrations.error ? (
          <ErrorNote error={integrations.error} onRetry={integrations.reload} />
        ) : null}
        {integrations.data && items.length === 0 ? (
          <EmptyNote>No integrations are registered.</EmptyNote>
        ) : null}
        {integrations.data && items.length > 0 && filtered.length === 0 ? (
          <EmptyNote>No integrations match this filter.</EmptyNote>
        ) : null}
        {filtered.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Integration</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Missing Variables</th>
                    <th>Note</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <span className="identity-cell">
                          <span className="thumb" aria-hidden="true">
                            <strong style={{ fontSize: 12.5 }}>
                              {markFor(item)}
                            </strong>
                          </span>
                          <span>
                            <span className="identity-main">{item.name}</span>
                            <span className="identity-sub">
                              {item.note ?? item.name}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="badge">
                          {INTEGRATION_CATEGORY_LABELS[item.category]}
                        </span>
                      </td>
                      <td>
                        <StatusChip configured={item.configured} />
                      </td>
                      <td>
                        {item.missing.length > 0
                          ? item.missing.join(', ')
                          : 'None'}
                      </td>
                      <td>{item.note ?? ''}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            gap: 6,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => setSelectedKey(item.key)}
                          >
                            {item.configured ? 'Manage' : 'Configure'}
                          </button>
                          <span className="menu-wrap">
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              aria-label={`More actions for ${item.name}`}
                              onClick={() =>
                                setMenuKey((current) =>
                                  current === item.key ? null : item.key,
                                )
                              }
                            >
                              <MoreHorizontal size={15} />
                            </button>
                            {menuKey === item.key ? (
                              <span className="topbar-menu">
                                <button
                                  type="button"
                                  className="topbar-menu-item"
                                  disabled={busyKey !== null}
                                  onClick={() => {
                                    setMenuKey(null);
                                    void runTest(item);
                                  }}
                                >
                                  <PlugZap size={14} />{' '}
                                  {busyKey === item.key
                                    ? 'Testing...'
                                    : 'Test Connection'}
                                </button>
                                {results[item.key] ? (
                                  <span className="topbar-menu-note">
                                    Last checked{' '}
                                    {formatDateTime(results[item.key].checkedAt)}
                                    : {results[item.key].detail}
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="muted">
                {filtered.length} integration{filtered.length === 1 ? '' : 's'}
              </span>
              <Pagination
                page={page}
                pageCount={pageCountFor(filtered.length, PAGE_SIZE)}
                onChange={setPage}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <CardHead icon={KeyRound} title="How configuration works" />
        <p className="note muted" style={{ marginTop: 0 }}>
          Status is computed by the server from the environment at
          request time; nothing on this page writes configuration.
          Variables are set in the API host environment (in this
          deployment, the Railway service variables). After changing
          variables on the host, reload this page or re-check with
          Test Connection to see the new state. Secret values are
          never returned by the API and never shown here; only
          variable names and their set or missing state appear.
        </p>
      </div>

      {selected ? (
        <Drawer
          title={selected.name}
          onClose={() => setSelectedKey(null)}
        >
          <span className="identity-cell" style={{ marginBottom: 12 }}>
            <span className="thumb" aria-hidden="true">
              <strong style={{ fontSize: 12.5 }}>{markFor(selected)}</strong>
            </span>
            <span>
              <span className="identity-main">{selected.name}</span>
              <span className="identity-sub">
                {INTEGRATION_CATEGORY_LABELS[selected.category]}
              </span>
            </span>
          </span>
          <dl className="kv">
            <dt>Status</dt>
            <dd>
              <StatusChip configured={selected.configured} />
            </dd>
            <dt>Category</dt>
            <dd>{INTEGRATION_CATEGORY_LABELS[selected.category]}</dd>
            {selected.note ? (
              <>
                <dt>Note</dt>
                <dd>{selected.note}</dd>
              </>
            ) : null}
            <dt>Required variables</dt>
            <dd>
              {selected.missing.length > 0 ? (
                <>
                  <span>
                    These required variables are missing on the API
                    host:
                  </span>
                  <ul className="timeline" style={{ marginTop: 8 }}>
                    {selected.missing.map((name) => (
                      <li key={name}>
                        <code>{name}</code>: missing
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                'All required variables are set. The API returns only the missing variable names, so no further variable list is available for a configured integration.'
              )}
            </dd>
            {webhookPathFor(selected) ? (
              <>
                <dt>Webhook endpoint</dt>
                <dd>
                  <code>{webhookPathFor(selected)}</code>
                </dd>
              </>
            ) : null}
            <dt>Last checked</dt>
            <dd>
              {results[selected.key]
                ? formatDateTime(results[selected.key].checkedAt)
                : 'Not tested yet in this session. Use Test Connection below.'}
            </dd>
          </dl>

          <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>
            Configuration instructions
          </h3>
          <p className="note muted" style={{ marginTop: 0 }}>
            Set the named variables in the API host environment (in
            this deployment, the Railway service variables for the
            API service), then reload this page or run Test
            Connection. Nothing on this page writes configuration,
            and there is no credential form here by design.
          </p>
          {webhookPathFor(selected) ? (
            <p className="note muted">
              Where the provider asks for a webhook or callback URL,
              register the API public base URL plus this path:{' '}
              <code>{webhookPathFor(selected)}</code>.
            </p>
          ) : null}

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              disabled={busyKey !== null}
              onClick={() => void runTest(selected)}
            >
              <PlugZap size={15} />{' '}
              {busyKey === selected.key ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
          {results[selected.key] ? (
            <p className="note" style={{ marginTop: 12 }}>
              {results[selected.key].detail}
            </p>
          ) : null}
          {actionError ? (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          ) : null}
        </Drawer>
      ) : null}

      {testAllOpen ? (
        <Modal title="Test All Integrations" onClose={() => setTestAllOpen(false)}>
          <p className="note muted" style={{ marginTop: 0 }}>
            One check per integration, run in order. Each line below
            is the API result in its own words.
          </p>
          {testAllResults.length === 0 ? (
            <EmptyNote>No results were returned.</EmptyNote>
          ) : (
            <ul className="timeline">
              {testAllResults.map((result) => {
                const item = items.find((entry) => entry.key === result.key);
                return (
                  <li key={result.key}>
                    <strong>{item?.name ?? result.key}</strong>:{' '}
                    {result.detail}{' '}
                    <span className="muted">
                      (checked {formatDateTime(result.checkedAt)})
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTestAllOpen(false)}
            >
              Close
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
