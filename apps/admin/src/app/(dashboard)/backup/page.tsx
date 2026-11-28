'use client';

import { useState, type FormEvent } from 'react';
import { Database, ShieldAlert } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, KeyValues, LoadingNote,
  Modal, ModuleHeader, SelectInput, StatCard, StatGrid, TextInput, Unavailable,
} from '../../../components/ui';
import { useAuth } from '../../../components/auth-provider';
import { downloadJson } from '../../../lib/csv';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../lib/types';

/* Backup & Maintenance: data exports, stored backups, maintenance
   actions and restore. Restore is deliberately guarded, per the
   owner's latest instruction: pick a stored backup, run checksum
   verification and see its result BEFORE any restore can be
   requested, then complete a multi-step confirmation (review,
   acknowledge the safety backup, type the confirmation phrase).
   Restore is super admin only, in the UI and enforced by the API.
   There is no one-click restore anywhere on this page. A safety
   backup is taken first, and the restore job status is reported
   from the API job list. */
const CONFIRM_PHRASE = 'RESTORE DOSTELO';

export default function BackupPage() {
  const { session } = useAuth();
  const isSuperAdmin = (session.principal?.roles ?? []).includes('super-admin');
  const exportsList = useData((c) => c.listBackups());
  const summary = useData((c) => c.getBackupSummary());
  const stored = useData((c) => c.listStoredBackups());
  const restoreJobs = useData((c) => c.gap.listRestoreJobs());
  const action = useAction();

  const [restoreId, setRestoreId] = useState('');
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null);
  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'passed' | 'failed' | 'unavailable'>('idle');
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState('');
  const [safetyAck, setSafetyAck] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');

  const exportItems = itemsOf(exportsList.data);
  const storedItems = itemsOf(stored.data);
  const summaryRec = asRec(summary.data);
  const jobItems = restoreJobs.data ? itemsOf(restoreJobs.data) : [];
  const selectedBackup = storedItems.find((b) => str(b.id) === restoreId);
  const checksumOk =
    verifyState === 'passed' &&
    verifyResult !== null &&
    (verifyResult.valid === true || verifyResult.verified === true || str(verifyResult.checksumStatus) === 'match');

  async function verify() {
    if (!restoreId) return;
    setVerifyState('checking');
    setVerifyResult(null);
    const result = await action.run(async (c) => {
      const res = await c.gap.verifyBackup(restoreId);
      if (res === null) {
        setVerifyState('unavailable');
        return;
      }
      const rec = asRec(res);
      setVerifyResult(rec);
      setVerifyState(
        rec.valid === true || rec.verified === true || str(rec.checksumStatus) === 'match'
          ? 'passed'
          : 'failed',
      );
    });
    if (!result && verifyState === 'checking') setVerifyState('failed');
  }

  async function submitRestore(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run(async (c) => {
      const res = await c.gap.requestRestore({
        backupId: restoreId,
        confirmation: typed,
        safetyBackupFirst: true,
      });
      if (res === null) {
        setRestoreMessage('The restore endpoint is not available on the running API yet. Nothing was restored.');
        return;
      }
      const rec = asRec(res);
      setRestoreMessage(
        `Restore job recorded by the API: ${str(rec.id ?? rec.jobId ?? 'see the job list below')}. Status: ${str(rec.status ?? 'queued')}.`,
      );
    });
    if (ok) {
      setStep(0);
      restoreJobs.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Database}
        title="Backup & Maintenance"
        description="Data exports, stored backups with checksum verification, a guarded multi-step restore for super admins, and maintenance actions."
      />
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Exports recorded" value={exportsList.loading ? '...' : String(exportItems.length)} />
        <StatCard label="Stored backups" value={stored.loading ? '...' : String(storedItems.length)} />
        <StatCard label="Collections covered" value={String(num(summaryRec.collectionCount ?? summaryRec.collections))} />
        <StatCard label="Restore jobs" value={restoreJobs.data === null ? 'Unavailable' : String(jobItems.length)} />
      </StatGrid>

      <Card
        title="Data exports"
        actions={
          <button
            type="button"
            className="btn"
            disabled={action.busy}
            onClick={async () => {
              await action.run(async (c) => {
                const result = await c.createExport();
                downloadJson('dostelo-export.json', result);
              });
              exportsList.reload();
            }}
          >
            Create export now
          </button>
        }
      >
        {exportsList.loading ? (
          <LoadingNote />
        ) : exportsList.error ? (
          <ErrorNote error={exportsList.error} onRetry={exportsList.reload} />
        ) : (
          <DataTable
            emptyText="No exports recorded yet."
            columns={[
              { key: 'id', label: 'Export', render: (r) => str(r.id).slice(0, 12) },
              { key: 'createdAt', label: 'Created', date: true },
              { key: 'createdBy', label: 'By', render: (r) => str(r.createdBy ?? r.actorId) },
              { key: 'collections', label: 'Collections', render: (r) => (Array.isArray(r.collections) ? r.collections.map((x) => str(x)).join(', ') : str(r.collections)) },
            ]}
            rows={exportItems}
          />
        )}
        <p className="note">
          No external backup storage is connected. Exports download from the API; stored backups
          below live where the API keeps them.
        </p>
      </Card>

      <Card
        title="Stored backups"
        actions={
          <button
            type="button"
            className="btn secondary"
            disabled={action.busy}
            onClick={async () => {
              if (await action.run((c) => c.createStoredBackup())) stored.reload();
            }}
          >
            Take a stored backup
          </button>
        }
      >
        {stored.loading ? (
          <LoadingNote />
        ) : stored.error ? (
          <ErrorNote error={stored.error} onRetry={stored.reload} />
        ) : (
          <DataTable
            emptyText="No stored backups yet."
            columns={[
              { key: 'id', label: 'Backup', render: (r) => str(r.id).slice(0, 12) },
              { key: 'createdAt', label: 'Created', date: true },
              { key: 'sizeBytes', label: 'Size (bytes)' },
              { key: 'checksum', label: 'Checksum', render: (r) => str(r.checksum).slice(0, 16) || 'Not recorded' },
              {
                key: 'actions', label: 'Actions',
                render: (r) => (
                  <span className="btn-row">
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={async () => {
                        await action.run(async (c) => {
                          const data = await c.downloadStoredBackup(str(r.id));
                          downloadJson(`backup-${str(r.id)}.json`, data);
                        });
                      }}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={action.busy}
                      onClick={async () => {
                        if (await action.run((c) => c.deleteStoredBackup(str(r.id)))) stored.reload();
                      }}
                    >
                      Delete
                    </button>
                  </span>
                ),
              },
            ]}
            rows={storedItems}
          />
        )}
      </Card>

      <Card title="Restore a backup (guarded)">
        {!isSuperAdmin ? (
          <Unavailable title="Restore is restricted to super admins.">
            Your current roles are {(session.principal?.roles ?? []).join(', ') || 'none reported'}.
            The restore flow is not offered here, and the API refuses restore requests without the
            super admin role in any case.
          </Unavailable>
        ) : (
          <>
            <p className="note" style={{ marginTop: 0 }}>
              <ShieldAlert size={14} /> Restoring replaces current data with the backup contents.
              The flow is: pick a backup, verify its checksum and read the result, then confirm in
              three steps. A safety backup of the current state is taken first, automatically,
              before any restore job starts.
            </p>
            <Field label="Step 1: pick a stored backup">
              <SelectInput
                value={restoreId}
                onChange={(e) => {
                  setRestoreId(e.target.value);
                  setVerifyState('idle');
                  setVerifyResult(null);
                  setStep(0);
                }}
              >
                <option value="">Select a backup</option>
                {storedItems.map((b) => (
                  <option key={str(b.id)} value={str(b.id)}>
                    {str(b.id).slice(0, 12)} taken {str(b.createdAt)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {selectedBackup ? (
              <KeyValues
                entries={[
                  ['Backup ID', str(selectedBackup.id)],
                  ['Created', str(selectedBackup.createdAt)],
                  ['Recorded checksum', str(selectedBackup.checksum) || 'Not recorded'],
                  ['Size (bytes)', String(selectedBackup.sizeBytes ?? '')],
                ]}
              />
            ) : null}
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn secondary" disabled={!restoreId || verifyState === 'checking'} onClick={() => void verify()}>
                Step 2: verify checksum
              </button>
              {verifyState === 'passed' ? <Badge tone="ok">Checksum verified: match</Badge> : null}
              {verifyState === 'failed' ? <Badge tone="bad">Checksum verification failed. Restore stays blocked.</Badge> : null}
              {verifyState === 'checking' ? <Badge>Verifying...</Badge> : null}
            </div>
            {verifyState === 'unavailable' ? (
              <Unavailable title="Checksum verification is not available on the running API yet.">
                Verification needs POST /v1/admin/backups/stored/:id/verify. Restore cannot proceed
                past this step without a passing verification, so the flow stops here honestly.
              </Unavailable>
            ) : null}
            {verifyResult ? (
              <p className="note">
                Verification result from the API: expected {str(verifyResult.expected ?? verifyResult.checksum) || 'as recorded'},
                computed {str(verifyResult.computed ?? verifyResult.actual) || 'as returned'}, status{' '}
                {str(verifyResult.checksumStatus ?? (checksumOk ? 'match' : 'mismatch'))}.
              </p>
            ) : null}

            {checksumOk ? (
              <form onSubmit={submitRestore} style={{ marginTop: 14 }}>
                <h3>Step 3: confirmation</h3>
                <ol className="step-list">
                  <li>
                    <label className="check-row">
                      <input type="checkbox" checked={step >= 1} onChange={(e) => setStep(e.target.checked ? 1 : 0)} />
                      I reviewed the backup above and understand current data will be replaced by it.
                    </label>
                  </li>
                  <li>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={safetyAck}
                        disabled={step < 1}
                        onChange={(e) => {
                          setSafetyAck(e.target.checked);
                          setStep(e.target.checked ? 2 : 1);
                        }}
                      />
                      I understand a safety backup of the current state is taken first, and the
                      restore runs as a tracked job whose status appears below.
                    </label>
                  </li>
                  <li>
                    <Field label={`Type ${CONFIRM_PHRASE} to confirm`}>
                      <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} disabled={step < 2} autoComplete="off" />
                    </Field>
                  </li>
                </ol>
                <button
                  type="submit"
                  className="btn danger"
                  disabled={action.busy || step < 2 || typed !== CONFIRM_PHRASE}
                >
                  Request restore (safety backup first)
                </button>
              </form>
            ) : null}
            {restoreMessage ? <p className="note" role="status">{restoreMessage}</p> : null}
          </>
        )}
      </Card>

      <Card title="Restore jobs">
        {restoreJobs.loading ? (
          <LoadingNote />
        ) : restoreJobs.data === null ? (
          <Unavailable title="Restore job reporting is not available on the running API yet.">
            This panel needs GET /v1/admin/backups/restore-jobs and POST /v1/admin/backups/restore.
            Until the API provides them, no restore can be started from this portal at all.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No restore jobs recorded."
            columns={[
              { key: 'id', label: 'Job', render: (r) => str(r.id ?? r.jobId).slice(0, 12) },
              { key: 'backupId', label: 'Backup' },
              { key: 'safetyBackupId', label: 'Safety backup', render: (r) => str(r.safetyBackupId) || 'Pending' },
              { key: 'status', label: 'Status' },
              { key: 'createdAt', label: 'Started', date: true },
            ]}
            rows={jobItems}
          />
        )}
      </Card>

      <Card title="Maintenance">
        <p className="note" style={{ marginTop: 0 }}>
          Maintenance actions run on the API and record their result. Cache clearing only reloads
          server-side caches; it never asks customers or staff to reinstall anything.
        </p>
        <div className="btn-row">
          {['clear-cache', 'rebuild-indexes', 'health-check'].map((item) => (
            <button
              key={item}
              type="button"
              className="btn secondary"
              disabled={action.busy}
              onClick={async () => {
                await action.run((c) => c.runMaintenance(item));
              }}
            >
              {item.replace(/-/g, ' ')}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}
