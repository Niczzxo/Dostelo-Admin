'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Archive,
  Database,
  Download,
  FileJson,
  HardDrive,
  HeartPulse,
  History,
  Settings,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { MaintenanceResult, StoredBackup } from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import { downloadText } from '../../../lib/csv';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
} from '../../../components/ui';

/**
 * Backup and Maintenance (redesign): data exports, stored
 * backups and the two real maintenance operations. An export is
 * a single JSON document assembled by the API from the core
 * stores (customer password hashes are stripped during
 * assembly) and recorded server-side. Stored backups are the
 * same snapshot kept in the application database on the API
 * host; no external backup storage is connected. Restore is not
 * implemented in this pass and is shown unavailable with the
 * API reason, never as a working action.
 */

const COLLECTIONS: { key: string; label: string }[] = [
  { key: 'categories', label: 'Categories' },
  { key: 'products', label: 'Products' },
  { key: 'customers', label: 'Customers' },
  { key: 'orders', label: 'Orders' },
  { key: 'payments', label: 'Payments' },
  { key: 'leads', label: 'Leads' },
  { key: 'abandonedCarts', label: 'Abandoned carts' },
  { key: 'shipments', label: 'Shipments' },
  { key: 'settings', label: 'Settings' },
];

const INCLUDED: string[] = [
  'Catalogue (products, categories, brands)',
  'Customers (password hashes stripped)',
  'Orders and order items',
  'Payments and transactions',
  'Leads and recovery records',
  'Shipments and courier data',
  'Store settings and configurations',
];

type TabKey = 'export' | 'backups' | 'maintenance';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function actionError(caught: unknown): string | null {
  const uiError = toUiError(caught);
  if (uiError.kind === 'unauthorized') {
    expireSession();
    return null;
  }
  return uiError.message;
}

export default function BackupPage() {
  const { session } = useAuth();
  const canManage =
    session.principal?.permissions.includes('settings.manage') ?? false;

  const summary = useData((client) => client.getBackupSummary(), []);
  const exportsList = useData((client) => client.listBackups(), []);
  const stored = useData((client) => client.listStoredBackups(), []);
  const audit = useData(
    (client) => client.listAuditLog({ limit: 100 }),
    [],
  );

  const [tab, setTab] = useState<TabKey>('export');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [exportMode, setExportMode] = useState<'all' | 'selective'>('all');
  const [selected, setSelected] = useState<Set<string>>(
    new Set(COLLECTIONS.map((item) => item.key)),
  );
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [backupBusy, setBackupBusy] = useState(false);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoredBackup | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const [maintenanceBusy, setMaintenanceBusy] = useState<string | null>(null);
  const [maintenanceResults, setMaintenanceResults] = useState<
    Record<string, MaintenanceResult>
  >({});
  const [maintenanceError, setMaintenanceError] = useState<string | null>(
    null,
  );

  const recentActivity = useMemo(
    () =>
      (audit.data?.items ?? []).filter((entry) =>
        entry.action.startsWith('backup.'),
      ),
    [audit.data],
  );

  async function runExport(): Promise<void> {
    const collections =
      exportMode === 'all' ? undefined : [...selected];
    if (exportMode === 'selective' && (collections?.length ?? 0) === 0) {
      setExportError('Select at least one collection to export.');
      return;
    }
    setExportBusy(true);
    setExportMessage(null);
    setExportError(null);
    try {
      const result = await api.createExport(collections);
      downloadText(
        `dostelo-export-${result.record.id}.json`,
        JSON.stringify(result.export, null, 2),
      );
      const total = Object.values(result.record.counts).reduce(
        (sum, count) => sum + count,
        0,
      );
      setExportMessage(
        `Export downloaded: ${total} records across ${Object.keys(result.record.counts).length} stores.`,
      );
      exportsList.reload();
      summary.reload();
      audit.reload();
    } catch (caught) {
      setExportError(actionError(caught));
    } finally {
      setExportBusy(false);
    }
  }

  async function createBackupNow(): Promise<void> {
    setBackupBusy(true);
    setBackupError(null);
    setBackupMessage(null);
    try {
      await api.createStoredBackup();
      setBackupMessage('Backup created and stored.');
      stored.reload();
      summary.reload();
      audit.reload();
    } catch (caught) {
      setBackupError(actionError(caught));
    } finally {
      setBackupBusy(false);
    }
  }

  async function downloadBackup(backup: StoredBackup): Promise<void> {
    setDownloadBusyId(backup.id);
    setBackupError(null);
    try {
      const result = await api.downloadStoredBackup(backup.id);
      downloadText(result.filename, result.content);
      audit.reload();
    } catch (caught) {
      setBackupError(actionError(caught));
    } finally {
      setDownloadBusyId(null);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setBackupError(null);
    try {
      await api.deleteStoredBackup(deleteTarget.id);
      setDeleteTarget(null);
      setBackupMessage('Backup deleted.');
      stored.reload();
      summary.reload();
      audit.reload();
    } catch (caught) {
      setBackupError(actionError(caught));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function runMaintenanceAction(action: string): Promise<void> {
    setMaintenanceBusy(action);
    setMaintenanceError(null);
    try {
      const result = await api.runMaintenance(action);
      setMaintenanceResults((prev) => ({ ...prev, [action]: result }));
      audit.reload();
    } catch (caught) {
      setMaintenanceError(actionError(caught));
    } finally {
      setMaintenanceBusy(null);
    }
  }

  function toggleCollection(key: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const summaryData = summary.data;

  return (
    <section>
      <ModuleHeader
        icon={Database}
        title="Backup and Maintenance"
        description="Export store data as JSON, keep stored backups in the application database, and run the maintenance operations the API actually supports."
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={15} /> Settings
        </button>
        {canManage ? (
          <button
            type="button"
            className="btn"
            disabled={exportBusy}
            onClick={() => {
              setTab('export');
              void runExport();
            }}
          >
            <Download size={15} />
            {exportBusy ? 'Preparing export...' : 'Export Data (JSON)'}
          </button>
        ) : null}
      </ModuleHeader>

      {settingsOpen ? (
        <Modal title="Backup settings" onClose={() => setSettingsOpen(false)}>
          {summary.loading ? (
            <LoadingNote label="Loading backup settings..." />
          ) : summary.error ? (
            <ErrorNote error={summary.error} onRetry={summary.reload} />
          ) : summaryData ? (
            <dl className="kv">
              <dt>Retention policy</dt>
              <dd>
                Keep the newest {summaryData.retentionKeep} backups. Older
                backups are pruned when a new backup is created, and the
                pruning is written to the audit log.
              </dd>
              <dt>Storage</dt>
              <dd>{summaryData.storageNote}</dd>
              <dt>Restore</dt>
              <dd>{summaryData.restoreNote}</dd>
            </dl>
          ) : null}
          <p className="note muted">
            Retention is a server constant in this pass, so this panel is
            read-only: the value cannot be changed from the portal.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSettingsOpen(false)}
            >
              Close
            </button>
          </div>
        </Modal>
      ) : null}

      {summary.loading ? (
        <LoadingNote label="Loading backup summary..." />
      ) : summary.error ? (
        <ErrorNote error={summary.error} onRetry={summary.reload} />
      ) : summaryData ? (
        <div className="kpi-grid">
          <KpiCard
            icon={Archive}
            label="Total Backups"
            value={summaryData.totalBackups.toLocaleString('en-US')}
            note="Stored backups kept in the application database"
            tone="purple"
          />
          <KpiCard
            icon={FileJson}
            label="Total Exports"
            value={summaryData.totalExports.toLocaleString('en-US')}
            note="Data exports recorded by the API"
            tone="blue"
          />
          <KpiCard
            icon={History}
            label="Last Backup"
            value={
              summaryData.lastBackupAt
                ? formatDateTime(summaryData.lastBackupAt)
                : '-'
            }
            note="Most recent stored backup"
            tone="green"
          />
          <KpiCard
            icon={HardDrive}
            label="Data Size (Est.)"
            value={
              summaryData.lastArtifactBytes !== null
                ? formatBytes(summaryData.lastArtifactBytes)
                : '-'
            }
            note="Size of the most recent backup or export"
            tone="orange"
          />
        </div>
      ) : null}

      <div className="page-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'export'}
          className={`page-tab${tab === 'export' ? ' active' : ''}`}
          onClick={() => setTab('export')}
        >
          Data Export
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'backups'}
          className={`page-tab${tab === 'backups' ? ' active' : ''}`}
          onClick={() => setTab('backups')}
        >
          Backups
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'maintenance'}
          className={`page-tab${tab === 'maintenance' ? ' active' : ''}`}
          onClick={() => setTab('maintenance')}
        >
          Maintenance
        </button>
      </div>

      <div className="dash-row">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'export' ? (
            <div className="card">
              <CardHead icon={FileJson} title="Export Store Data" />
              <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>
                What&apos;s Included
              </h3>
              <ul style={{ margin: '0 0 16px', paddingLeft: 18, lineHeight: 1.7 }}>
                {INCLUDED.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>
                Export Options
              </h3>
              <label className="field" style={{ maxWidth: 360 }}>
                Export scope
                <select
                  className="select"
                  value={exportMode}
                  onChange={(event) =>
                    setExportMode(event.target.value as 'all' | 'selective')
                  }
                >
                  <option value="all">All Store Data (Recommended)</option>
                  <option value="selective">Selective</option>
                </select>
              </label>
              {exportMode === 'selective' ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    margin: '4px 0 8px',
                  }}
                >
                  {COLLECTIONS.map((item) => (
                    <label
                      key={item.key}
                      style={{
                        alignItems: 'center',
                        display: 'inline-flex',
                        fontSize: 13,
                        gap: 6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(item.key)}
                        onChange={(event) =>
                          toggleCollection(item.key, event.target.checked)
                        }
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              ) : null}
              <p className="note muted">
                A single JSON file will be generated with all selected data.
                Large stores may take a few minutes to export.
              </p>
              {canManage ? (
                <button
                  type="button"
                  className="btn"
                  disabled={exportBusy}
                  onClick={() => void runExport()}
                >
                  <Download size={15} />
                  {exportBusy ? 'Preparing export...' : 'Export Data (JSON)'}
                </button>
              ) : (
                <p className="note muted">
                  Your role cannot export data (the settings.manage
                  permission is required).
                </p>
              )}
              {exportMessage ? (
                <p className="note" style={{ margin: '10px 0 0' }}>
                  {exportMessage}
                </p>
              ) : null}
              {exportError ? (
                <p className="form-error" role="alert">
                  {exportError}
                </p>
              ) : null}

              <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>
                Past Exports
              </h3>
              {exportsList.loading ? (
                <LoadingNote label="Loading export history..." />
              ) : exportsList.error ? (
                <ErrorNote
                  error={exportsList.error}
                  onRetry={exportsList.reload}
                />
              ) : exportsList.data &&
                exportsList.data.items.length === 0 ? (
                <EmptyNote>No exports have been taken yet.</EmptyNote>
              ) : exportsList.data ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Requested by</th>
                        <th>Contents</th>
                        <th className="num">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportsList.data.items.map((record) => (
                        <tr key={record.id}>
                          <td>{formatDateTime(record.createdAt)}</td>
                          <td>{record.requestedById ?? 'Unknown'}</td>
                          <td>
                            {Object.entries(record.counts)
                              .map(
                                ([store, count]) => `${store}: ${count}`,
                              )
                              .join(', ')}
                          </td>
                          <td className="num">
                            {formatBytes(record.byteSize)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'backups' ? (
            <div className="card">
              <CardHead icon={Archive} title="Backup Management">
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={backupBusy}
                    onClick={() => void createBackupNow()}
                  >
                    {backupBusy ? 'Creating backup...' : 'Create Backup Now'}
                  </button>
                ) : null}
              </CardHead>
              <p className="note muted" style={{ marginTop: 0 }}>
                Storage location: backups live in the application database
                on the API host; no external storage is connected.
              </p>
              {backupMessage ? (
                <p className="note" style={{ margin: '8px 0 0' }}>
                  {backupMessage}
                </p>
              ) : null}
              {backupError ? (
                <p className="form-error" role="alert">
                  {backupError}
                </p>
              ) : null}
              {stored.loading ? (
                <LoadingNote label="Loading backups..." />
              ) : stored.error ? (
                <ErrorNote error={stored.error} onRetry={stored.reload} />
              ) : stored.data && stored.data.items.length === 0 ? (
                <div>
                  <EmptyNote>
                    No backups yet. Backups will appear here after the first
                    run.
                  </EmptyNote>
                  {canManage ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={backupBusy}
                      onClick={() => void createBackupNow()}
                    >
                      {backupBusy
                        ? 'Creating backup...'
                        : 'Create Backup Now'}
                    </button>
                  ) : (
                    <p className="note muted">
                      Your role cannot create backups (the settings.manage
                      permission is required).
                    </p>
                  )}
                </div>
              ) : stored.data ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="num">Size</th>
                        <th>Checksum</th>
                        <th className="num">Collections</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stored.data.items.map((backup) => (
                        <tr key={backup.id}>
                          <td>{formatDateTime(backup.createdAt)}</td>
                          <td className="num">
                            {formatBytes(backup.byteSize)}
                          </td>
                          <td>
                            <code>{backup.checksum.slice(0, 8)}</code>
                          </td>
                          <td className="num">
                            {backup.collections.length}
                          </td>
                          <td>
                            <Badge>{backup.status}</Badge>
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-flex',
                                flexWrap: 'wrap',
                                gap: 6,
                              }}
                            >
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                disabled={downloadBusyId === backup.id}
                                onClick={() => void downloadBackup(backup)}
                              >
                                <Download size={13} />
                                {downloadBusyId === backup.id
                                  ? 'Downloading...'
                                  : 'Download'}
                              </button>
                              {canManage ? (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-small"
                                  onClick={() => setDeleteTarget(backup)}
                                >
                                  <Trash2 size={13} /> Delete
                                </button>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div style={{ marginTop: 18 }}>
                <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Restore</h3>
                {summaryData ? (
                  <p className="note muted" style={{ marginTop: 0 }}>
                    Restore is unavailable in this pass.{' '}
                    {summaryData.restoreNote}
                  </p>
                ) : (
                  <p className="note muted" style={{ marginTop: 0 }}>
                    Restore is unavailable in this pass.
                  </p>
                )}
                <button type="button" className="btn btn-secondary" disabled>
                  Restore Backup (Unavailable)
                </button>
              </div>
            </div>
          ) : null}

          {tab === 'maintenance' ? (
            <div className="card">
              <CardHead icon={Wrench} title="System Maintenance" />
              {maintenanceError ? (
                <p className="form-error" role="alert">
                  {maintenanceError}
                </p>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      alignItems: 'center',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      <strong>Check System Health</strong>
                      <span
                        className="muted"
                        style={{ display: 'block', fontSize: 13 }}
                      >
                        Database connectivity, configuration and uptime
                        reported by the API.
                      </span>
                    </span>
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={maintenanceBusy !== null}
                        onClick={() =>
                          void runMaintenanceAction('health')
                        }
                      >
                        <HeartPulse size={14} />
                        {maintenanceBusy === 'health'
                          ? 'Checking...'
                          : 'Check System Health'}
                      </button>
                    ) : null}
                  </div>
                  {maintenanceResults['health'] ? (
                    <p className="note" style={{ margin: '8px 0 0' }}>
                      <Badge>{maintenanceResults['health'].status}</Badge>{' '}
                      {maintenanceResults['health'].detail} (
                      {formatDateTime(maintenanceResults['health'].ranAt)})
                    </p>
                  ) : null}
                </div>

                <div>
                  <div
                    style={{
                      alignItems: 'center',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      <strong>Optimize Database</strong>
                      <span
                        className="muted"
                        style={{ display: 'block', fontSize: 13 }}
                      >
                        Runs the database optimize operation the API
                        provides.
                      </span>
                    </span>
                    {canManage ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={maintenanceBusy !== null}
                        onClick={() =>
                          void runMaintenanceAction('optimize-database')
                        }
                      >
                        <Database size={14} />
                        {maintenanceBusy === 'optimize-database'
                          ? 'Optimizing...'
                          : 'Optimize Database'}
                      </button>
                    ) : null}
                  </div>
                  {maintenanceResults['optimize-database'] ? (
                    <p className="note" style={{ margin: '8px 0 0' }}>
                      <Badge>
                        {maintenanceResults['optimize-database'].status}
                      </Badge>{' '}
                      {maintenanceResults['optimize-database'].detail} (
                      {formatDateTime(
                        maintenanceResults['optimize-database'].ranAt,
                      )}
                      )
                    </p>
                  ) : null}
                </div>

                {canManage ? null : (
                  <p className="note muted">
                    Your role cannot run maintenance (the settings.manage
                    permission is required).
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <CardHead icon={Activity} title="Recent Activity">
              <Link className="btn btn-secondary btn-small" href="/security">
                View Full Audit Log
              </Link>
            </CardHead>
            {audit.loading ? (
              <LoadingNote label="Loading recent activity..." />
            ) : audit.error ? (
              <ErrorNote error={audit.error} onRetry={audit.reload} />
            ) : recentActivity.length === 0 ? (
              <EmptyNote>
                No backup or maintenance activity recorded yet.
              </EmptyNote>
            ) : (
              <ul className="timeline">
                {recentActivity.slice(0, 10).map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <Badge>{entry.action}</Badge>
                    </div>
                    <div className="when">
                      {formatDateTime(entry.createdAt)}
                      {entry.actorId ? ` · by ${entry.actorId}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <CardHead icon={ShieldCheck} title="Storage and Safety" />
            <ul style={{ lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
              <li>Exports are written to the audit log.</li>
              <li>No external backup storage is connected.</li>
              <li>Keep downloaded files in a secure location.</li>
              <li>Customer passwords are never included.</li>
            </ul>
          </div>
        </div>
      </div>

      {deleteTarget ? (
        <Modal
          title="Delete backup"
          onClose={() => (deleteBusy ? undefined : setDeleteTarget(null))}
        >
          <p className="note" style={{ marginTop: 0 }}>
            Delete the backup created on{' '}
            {formatDateTime(deleteTarget.createdAt)} (
            {formatBytes(deleteTarget.byteSize)})? This removes the stored
            snapshot from the application database and cannot be undone.
          </p>
          {backupError ? (
            <p className="form-error" role="alert">
              {backupError}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-danger"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? 'Deleting...' : 'Delete backup'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
