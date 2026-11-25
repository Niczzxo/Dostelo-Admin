'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  CheckCircle2,
  Eye,
  LayoutTemplate,
  ListChecks,
  MoreHorizontal,
  Pause,
  Play,
  ScrollText,
  Settings2,
  Zap,
} from 'lucide-react';
import type { AutomationExecution, AutomationInfo } from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { AreaChart } from '../../../components/charts';
import {
  Badge,
  CardHead,
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

type TabKey = 'all' | 'active' | 'paused' | 'not-configured' | 'templates';

const STATUS_LABELS: Record<AutomationInfo['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  'not-configured': 'Not Configured',
};

function flowName(flows: AutomationInfo[], key: string): string {
  return flows.find((flow) => flow.key === key)?.name ?? key;
}

function durationLabel(execution: AutomationExecution): string {
  const ms =
    new Date(execution.completedAt).getTime() -
    new Date(execution.startedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'Unavailable';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/* Flow configuration modal: read-only facts plus the real
 * settings link. Nothing here edits a flow inline, because each
 * flow's real settings live in its own module. */
function FlowConfigModal({
  flow,
  onClose,
}: {
  flow: AutomationInfo;
  onClose: () => void;
}) {
  const isRecovery = flow.key.startsWith('cart-recovery') || flow.key === 'order-recovery-marking';
  const isLead = flow.key === 'lead-candidate-evaluation';
  return (
    <Modal title={flow.name} onClose={onClose}>
      <dl className="kv">
        <dt>Status</dt>
        <dd><Badge>{STATUS_LABELS[flow.status]}</Badge></dd>
        <dt>Runs in</dt>
        <dd>{flow.runsIn}</dd>
        <dt>Trigger</dt>
        <dd>{flow.trigger}</dd>
        <dt>Can be paused here</dt>
        <dd>{flow.canPause ? 'Yes' : 'No'}</dd>
      </dl>
      <p style={{ marginTop: 12 }}>{flow.detail ?? 'No detail recorded for this flow.'}</p>
      {isLead ? (
        <p className="note muted">
          Scoring thresholds are read-only facts: the flow detail
          above states them as recorded by the API (hot 70, warm 40
          in the current build). They are code constants today, not
          stored settings, so they cannot be edited here.
        </p>
      ) : null}
      {isRecovery ? (
        <p className="note muted">
          The recovery sequence is configured in the Cart Recovery
          module, on its sequence tab.
        </p>
      ) : null}
      {flow.key === 'payment-order-sync' || flow.key === 'order-recovery-marking' ? (
        <p className="note muted">
          This is a correctness rule of the platform, shown here as a
          read-only description. It has no pause control.
        </p>
      ) : null}
      {flow.settingsHref ? (
        <p style={{ marginTop: 12 }}>
          <Link className="btn btn-secondary btn-small" href={flow.settingsHref}>
            Open real settings
          </Link>
        </p>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

/* Execution detail modal ------------------------------------------- */

function ExecutionDetailModal({
  execution,
  flows,
  onClose,
}: {
  execution: AutomationExecution;
  flows: AutomationInfo[];
  onClose: () => void;
}) {
  return (
    <Modal title="Execution Detail" onClose={onClose}>
      <dl className="kv">
        <dt>Workflow</dt>
        <dd>{flowName(flows, execution.workflowKey)}</dd>
        <dt>Status</dt>
        <dd><Badge>{execution.status === 'success' ? 'Success' : 'Failed'}</Badge></dd>
        <dt>Entity</dt>
        <dd>{execution.entityType}: {execution.entityId}</dd>
        <dt>Started</dt>
        <dd>{formatDateTime(execution.startedAt)}</dd>
        <dt>Completed</dt>
        <dd>{formatDateTime(execution.completedAt)}</dd>
        <dt>Duration</dt>
        <dd>{durationLabel(execution)}</dd>
      </dl>
      <div style={{ marginTop: 12 }}>
        <CardHead title="Recorded outcome" />
        <p style={{ marginTop: 0 }}>
          {execution.detail || 'No detail was recorded for this execution.'}
        </p>
        <p className="note muted">
          Payload summary as recorded: the log stores the entity
          type and id plus this outcome text only. It never stores
          secrets or customer contact details, and a failed
          execution cannot be retried from here because the API does
          not support retrying automation executions.
        </p>
      </div>
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        Close
      </button>
    </Modal>
  );
}

/* Page -------------------------------------------------------------- */

export default function AutomationPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [configFlow, setConfigFlow] = useState<AutomationInfo | null>(null);
  const [logSearch, setLogSearch] = useState('');
  const [logWorkflow, setLogWorkflow] = useState('');
  const [logStatus, setLogStatus] = useState<'' | 'success' | 'failed'>('');
  const [logPage, setLogPage] = useState(1);
  const [selectedExecution, setSelectedExecution] = useState<AutomationExecution | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const logsRef = useRef<HTMLDivElement | null>(null);

  const automations = useData((client) => client.listAutomations(), []);
  const executions = useData((client) => client.listAutomationExecutions(), []);

  const flows = useMemo(() => automations.data?.items ?? [], [automations.data]);
  const allExecutions = useMemo(
    () => executions.data?.items ?? [],
    [executions.data],
  );

  const executions30d = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return allExecutions.filter(
      (entry) => new Date(entry.startedAt).getTime() >= cutoff,
    );
  }, [allExecutions]);

  const successRate = useMemo(() => {
    if (executions30d.length === 0) return null;
    const succeeded = executions30d.filter((entry) => entry.status === 'success').length;
    return Math.round((succeeded / executions30d.length) * 1000) / 10;
  }, [executions30d]);

  const trendPoints = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const entry of executions30d) {
      const key = dayKey(entry.startedAt);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }));
  }, [executions30d]);

  const filteredFlows = useMemo(() => {
    if (tab === 'all' || tab === 'templates') return flows;
    return flows.filter((flow) => flow.status === tab);
  }, [flows, tab]);

  const filteredExecutions = useMemo(() => {
    const needle = logSearch.trim().toLowerCase();
    return allExecutions.filter((entry) => {
      if (logWorkflow && entry.workflowKey !== logWorkflow) return false;
      if (logStatus && entry.status !== logStatus) return false;
      if (
        needle &&
        !(
          entry.detail.toLowerCase().includes(needle) ||
          entry.entityId.toLowerCase().includes(needle) ||
          entry.workflowKey.toLowerCase().includes(needle) ||
          flowName(flows, entry.workflowKey).toLowerCase().includes(needle)
        )
      ) {
        return false;
      }
      return true;
    });
  }, [allExecutions, logSearch, logWorkflow, logStatus, flows]);
  const logPageCount = pageCountFor(filteredExecutions.length, PAGE_SIZE);
  const logPageItems = paginate(
    filteredExecutions,
    Math.min(logPage, logPageCount),
    PAGE_SIZE,
  );

  const flowPageCount = pageCountFor(filteredFlows.length, PAGE_SIZE);
  const flowPageItems = paginate(filteredFlows, Math.min(page, flowPageCount), PAGE_SIZE);

  function scrollToLogs(): void {
    logsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function toggleFlow(flow: AutomationInfo): Promise<void> {
    const enable = flow.status === 'paused';
    setBusyKey(flow.key);
    setRowError(null);
    try {
      await api.setAutomationEnabled(flow.key, enable);
      automations.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setRowError(uiError.message);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section>
      <ModuleHeader
        icon={Zap}
        title="Automation"
        description="The built-in automations that actually run in this platform, with their live status and recorded executions. There is no general workflow builder in this backend: each flow runs in its own module and is configured there."
      />

      <div className="kpi-grid">
        <KpiCard
          icon={Zap}
          label="Total Automations"
          value={automations.loading ? '...' : flows.length.toLocaleString('en-US')}
          note="Built-in flows reported by the API"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Active Automations"
          value={
            automations.loading
              ? '...'
              : flows.filter((flow) => flow.status === 'active').length.toLocaleString('en-US')
          }
          note="Flows whose status is active now"
          tone="green"
        />
        <KpiCard
          icon={Activity}
          label="Total Executions (30 days)"
          value={executions.loading ? '...' : executions30d.length.toLocaleString('en-US')}
          note={
            allExecutions.length === 0
              ? 'No executions recorded yet: logging starts from this deployment'
              : 'Recorded executions in the last 30 days'
          }
          tone="blue"
        />
        <KpiCard
          icon={ListChecks}
          label="Success Rate (30 days)"
          value={
            executions.loading
              ? '...'
              : successRate !== null
                ? `${successRate}%`
                : 'Unavailable'
          }
          note={
            successRate !== null
              ? 'Share of recorded executions that succeeded'
              : 'No executions recorded yet: logging starts from this deployment'
          }
          tone="orange"
        />
      </div>

      <StatusTabs
        tabs={[
          { key: 'all', label: 'All Automations', count: flows.length },
          { key: 'active', label: 'Active', count: flows.filter((flow) => flow.status === 'active').length },
          { key: 'paused', label: 'Paused', count: flows.filter((flow) => flow.status === 'paused').length },
          { key: 'not-configured', label: 'Not Configured', count: flows.filter((flow) => flow.status === 'not-configured').length },
          { key: 'templates', label: 'Templates', count: flows.length },
        ]}
        active={tab}
        onChange={(key) => {
          setTab(key as TabKey);
          setPage(1);
        }}
      />

      {rowError ? (
        <p className="form-error" role="alert">{rowError}</p>
      ) : null}

      {tab === 'templates' ? (
        <div className="card" style={{ marginTop: 16 }}>
          <CardHead icon={LayoutTemplate} title="Built-in Flow Templates" />
          <p className="note muted" style={{ marginTop: 0 }}>
            These are the only automation templates that exist: the
            built-in flows themselves. A general workflow builder,
            custom triggers and branching do not exist in this
            backend, so no create automation action is offered.
          </p>
          {automations.loading ? (
            <LoadingNote label="Loading automations..." />
          ) : automations.error ? (
            <ErrorNote error={automations.error} onRetry={automations.reload} />
          ) : flows.length === 0 ? (
            <EmptyNote>No automations are registered.</EmptyNote>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {flows.map((flow) => (
                <div key={flow.key} className="card" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong>{flow.name}</strong>
                      <p className="note muted" style={{ margin: '4px 0 0' }}>
                        {flow.detail ?? flow.trigger}
                      </p>
                      <p className="note muted" style={{ margin: '4px 0 0' }}>
                        Trigger: {flow.trigger}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <Badge>{STATUS_LABELS[flow.status]}</Badge>
                      <button type="button" className="btn btn-small btn-secondary" onClick={() => setConfigFlow(flow)}>
                        Configure
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <CardHead icon={Zap} title="Workflows" />
          {automations.loading ? (
            <LoadingNote label="Loading automations..." />
          ) : automations.error ? (
            <ErrorNote error={automations.error} onRetry={automations.reload} />
          ) : filteredFlows.length === 0 ? (
            <EmptyNote>
              {flows.length === 0
                ? 'No automations are registered.'
                : 'No automations match this tab.'}
            </EmptyNote>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Automation</th>
                      <th>Runs In</th>
                      <th>Trigger</th>
                      <th>Status</th>
                      <th className="num">Executions (30d)</th>
                      <th className="num">Success Rate</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flowPageItems.map((flow) => (
                      <tr key={flow.key}>
                        <td>
                          <strong>{flow.name}</strong>
                          {flow.detail ? (
                            <div className="muted" style={{ maxWidth: 340 }}>{flow.detail}</div>
                          ) : null}
                        </td>
                        <td><span className="badge">{flow.runsIn}</span></td>
                        <td>{flow.trigger}</td>
                        <td><Badge>{STATUS_LABELS[flow.status]}</Badge></td>
                        <td className="num">
                          {flow.executions30d !== null
                            ? flow.executions30d.toLocaleString('en-US')
                            : 'Unavailable'}
                        </td>
                        <td className="num">
                          {flow.successRate30d !== null
                            ? `${flow.successRate30d}%`
                            : 'Unavailable'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', position: 'relative' }}>
                            {flow.canPause && flow.status === 'active' ? (
                              <button
                                type="button"
                                className="btn btn-small btn-secondary"
                                disabled={busyKey === flow.key}
                                onClick={() => void toggleFlow(flow)}
                              >
                                <Pause size={14} /> Pause
                              </button>
                            ) : null}
                            {flow.canPause && flow.status === 'paused' ? (
                              <button
                                type="button"
                                className="btn btn-small"
                                disabled={busyKey === flow.key}
                                onClick={() => void toggleFlow(flow)}
                              >
                                <Play size={14} /> Activate
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              onClick={() => setConfigFlow(flow)}
                            >
                              <Settings2 size={14} /> Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-small btn-secondary"
                              aria-label={`More actions for ${flow.name}`}
                              onClick={() => setMenuKey(menuKey === flow.key ? null : flow.key)}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {menuKey === flow.key ? (
                              <div
                                className="card"
                                style={{ position: 'absolute', right: 0, top: '100%', zIndex: 5, margin: 0, padding: 8 }}
                              >
                                <button
                                  type="button"
                                  className="btn btn-small btn-secondary"
                                  onClick={() => {
                                    setMenuKey(null);
                                    setLogWorkflow(flow.key);
                                    setLogPage(1);
                                    scrollToLogs();
                                  }}
                                >
                                  <Eye size={14} /> View Executions
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-foot">
                <span className="muted">
                  {filteredFlows.length} automation{filteredFlows.length === 1 ? '' : 's'}
                </span>
                <Pagination page={Math.min(page, flowPageCount)} pageCount={flowPageCount} onChange={setPage} />
              </div>
            </>
          )}
          <p className="note muted">
            Executions and success rates are the API&apos;s recorded
            figures for the last 30 days. A flow with no logging yet
            shows unavailable rather than zero.
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <CardHead icon={Activity} title="Execution Trend (30 days)" />
        {executions.loading ? (
          <LoadingNote label="Loading executions..." />
        ) : executions.error ? (
          <ErrorNote error={executions.error} onRetry={executions.reload} />
        ) : trendPoints.length === 0 ? (
          <EmptyNote>
            No executions have been recorded yet. Logging starts from
            this deployment, and the trend appears once flows run.
          </EmptyNote>
        ) : (
          <AreaChart points={trendPoints} formatValue={(value) => `${value} executions`} />
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }} ref={logsRef} id="execution-logs">
        <CardHead icon={ScrollText} title="Execution Logs" />
        <div className="filter-row" style={{ marginBottom: 12 }}>
          <label className="field">
            Search
            <input
              className="input"
              type="search"
              placeholder="Detail, entity id or workflow"
              value={logSearch}
              onChange={(event) => {
                setLogSearch(event.target.value);
                setLogPage(1);
              }}
            />
          </label>
          <label className="field">
            Workflow
            <select
              className="select"
              value={logWorkflow}
              onChange={(event) => {
                setLogWorkflow(event.target.value);
                setLogPage(1);
              }}
            >
              <option value="">All workflows</option>
              {flows.map((flow) => (
                <option key={flow.key} value={flow.key}>
                  {flow.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Status
            <select
              className="select"
              value={logStatus}
              onChange={(event) => {
                setLogStatus(event.target.value as '' | 'success' | 'failed');
                setLogPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </label>
        </div>
        {executions.loading ? (
          <LoadingNote label="Loading execution logs..." />
        ) : executions.error ? (
          <ErrorNote error={executions.error} onRetry={executions.reload} />
        ) : filteredExecutions.length === 0 ? (
          <EmptyNote>
            {allExecutions.length === 0
              ? 'No executions have been recorded yet. Logging starts from this deployment.'
              : 'No executions match these filters.'}
          </EmptyNote>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Workflow</th>
                    <th>Entity</th>
                    <th>Status</th>
                    <th>Detail</th>
                    <th>Started</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {logPageItems.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedExecution(entry)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{flowName(flows, entry.workflowKey)}</td>
                      <td>{entry.entityType}: {entry.entityId}</td>
                      <td>
                        <Badge>{entry.status === 'success' ? 'Success' : 'Failed'}</Badge>
                      </td>
                      <td>{entry.detail}</td>
                      <td>{formatDateTime(entry.startedAt)}</td>
                      <td>{durationLabel(entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span className="muted">
                {filteredExecutions.length} execution{filteredExecutions.length === 1 ? '' : 's'}. Select a row for detail. Retry is not supported by the API, so no retry action is shown.
              </span>
              <Pagination page={Math.min(logPage, logPageCount)} pageCount={logPageCount} onChange={setLogPage} />
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <CardHead icon={Zap} title="Quick Actions" />
        <div className="quick-actions">
          <button type="button" className="quick-action" onClick={() => setTab('templates')}>
            <span className="quick-action-icon"><LayoutTemplate size={18} /></span>
            <span className="quick-action-title">Browse Templates</span>
            <span className="quick-action-sub">The built-in flow templates and their configure links</span>
          </button>
          <Link className="quick-action" href="/integrations">
            <span className="quick-action-icon"><Settings2 size={18} /></span>
            <span className="quick-action-title">Channel Settings</span>
            <span className="quick-action-sub">Provider configuration status in Integrations</span>
          </Link>
          <button type="button" className="quick-action" onClick={scrollToLogs}>
            <span className="quick-action-icon"><ScrollText size={18} /></span>
            <span className="quick-action-title">View Execution Logs</span>
            <span className="quick-action-sub">Recorded runs, outcomes and errors</span>
          </button>
        </div>
      </div>

      {configFlow ? (
        <FlowConfigModal flow={configFlow} onClose={() => setConfigFlow(null)} />
      ) : null}
      {selectedExecution ? (
        <ExecutionDetailModal
          execution={selectedExecution}
          flows={flows}
          onClose={() => setSelectedExecution(null)}
        />
      ) : null}
    </section>
  );
}
