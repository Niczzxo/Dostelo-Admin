'use client';

import { useState } from 'react';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Backup & Maintenance: on-demand data exports. The API
 * assembles one JSON document from the platform's core stores
 * (customer password hashes are stripped during assembly),
 * records the export with per-store counts, and this page
 * downloads the document. No external backup storage is
 * configured or claimed: the file exists only where the person
 * who downloaded it keeps it.
 */
export default function BackupPage() {
  const { session } = useAuth();
  const canManage =
    session.principal?.permissions.includes('settings.manage') ?? false;
  const backups = useData((client) => client.listBackups(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createExport(): Promise<void> {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await api.createBackup();
      const blob = new Blob([JSON.stringify(result.export, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `dostelo-export-${result.record.id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      const total = Object.values(result.record.counts).reduce(
        (sum, count) => sum + count,
        0,
      );
      setMessage(
        `Export downloaded: ${total} records across ${Object.keys(result.record.counts).length} stores.`,
      );
      backups.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader title="Backup & Maintenance">
        {canManage ? (
          <button
            type="button"
            className="btn btn-small"
            disabled={busy}
            onClick={() => void createExport()}
          >
            {busy ? 'Preparing export...' : 'Export data now (JSON)'}
          </button>
        ) : null}
      </PageHeader>
      <p className="note muted" style={{ marginTop: 0, maxWidth: 760 }}>
        An export is a single JSON file with the catalogue, customers
        (password hashes stripped), orders, payments, leads, recovery
        records, shipments and store settings. There is no external
        backup storage connected, so keep the downloaded file
        somewhere safe yourself. Every export is written to the audit
        log.
      </p>
      {message ? (
        <p className="note" style={{ margin: '8px 0 0' }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {backups.loading ? (
        <LoadingNote label="Loading export history..." />
      ) : null}
      {backups.error ? (
        <ErrorNote error={backups.error} onRetry={backups.reload} />
      ) : null}
      {backups.data && backups.data.items.length === 0 ? (
        <EmptyNote>No exports have been taken yet.</EmptyNote>
      ) : null}
      {backups.data && backups.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Exported at</th>
                <th>Requested by</th>
                <th>Contents</th>
              </tr>
            </thead>
            <tbody>
              {backups.data.items.map((record) => (
                <tr key={record.id}>
                  <td>{formatDateTime(record.createdAt)}</td>
                  <td>{record.requestedById ?? 'Unknown'}</td>
                  <td>
                    {Object.entries(record.counts)
                      .map(([store, count]) => `${store}: ${count}`)
                      .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
