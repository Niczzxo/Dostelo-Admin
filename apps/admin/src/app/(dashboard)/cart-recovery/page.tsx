'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ABANDONED_CART_STATUSES,
  COMMUNICATION_CHANNELS,
  type AbandonedCartStatus,
  type CommunicationChannel,
  type RecoverySettings,
  type RecoveryStep,
} from '@dostelo/types';
import {
  api,
  formatDateTime,
  formatMinor,
  toUiError,
} from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Abandoned Cart Recovery list (Phase 6). Rows are the
 * recoveries the API reports, filtered by status. Staff holding
 * recovery.edit can run a detection scan and edit the stored
 * sequence (channel and delay per step, inactivity threshold,
 * token lifetime). Edits apply to carts detected afterwards and
 * to steps not yet scheduled; the API stays the authority and
 * re-validates every field.
 */
export default function CartRecoveryPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canEdit = permissions.includes('recovery.edit');

  const [status, setStatus] = useState<AbandonedCartStatus | ''>('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const list = useData(
    (client) => client.listAbandonedCarts(status || undefined),
    [status],
  );
  const settings = useData((client) => client.getRecoverySettings(), []);

  async function runScan(): Promise<void> {
    setScanning(true);
    setScanNote(null);
    setScanError(null);
    try {
      const result = await api.runRecoveryScan();
      setScanNote(
        `Scan complete: ${result.detected} newly detected, ${result.closed} closed.`,
      );
      list.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setScanError(uiError.message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <section>
      <PageHeader title="Abandoned Cart Recovery" />
      <p className="note muted" style={{ marginTop: 0 }}>
        A recovery starts only for a cart with items, a contact
        path and a recorded contact basis. Suppressed contacts and
        visitors who denied marketing consent are refused at send
        time, and placing an order cancels every pending step.
      </p>

      <div className="toolbar">
        <label className="field">
          Status
          <select
            className="select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as AbandonedCartStatus | '')
            }
          >
            <option value="">All statuses</option>
            {ABANDONED_CART_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {canEdit ? (
          <button
            type="button"
            className="btn"
            disabled={scanning}
            onClick={runScan}
          >
            {scanning ? 'Scanning...' : 'Run detection scan'}
          </button>
        ) : null}
      </div>
      {scanNote ? <p className="note">{scanNote}</p> : null}
      {scanError ? (
        <p className="form-error" role="alert">
          {scanError}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="note muted">
          Your role can view recoveries; running scans and editing
          the sequence need the recovery.edit permission.
        </p>
      ) : null}

      {list.loading ? <LoadingNote label="Loading recoveries..." /> : null}
      {list.error ? (
        <ErrorNote error={list.error} onRetry={list.reload} />
      ) : null}
      {list.data && list.data.items.length === 0 ? (
        <EmptyNote>
          No abandoned carts match this filter. Carts appear here
          after a detection scan finds them inactive beyond the
          configured threshold.
        </EmptyNote>
      ) : null}
      {list.data && list.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Status</th>
                <th>Items</th>
                <th>Cart total</th>
                <th>Detected</th>
                <th>Last activity</th>
                <th>Recovered by</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((recovery) => (
                <tr key={recovery.id}>
                  <td>
                    <Link href={`/cart-recovery/${recovery.id}`}>
                      {recovery.contactName ??
                        recovery.contactPhone ??
                        recovery.contactEmail ??
                        'Unnamed contact'}
                    </Link>
                    <div className="muted">
                      {recovery.contactBasis ?? 'No contact basis'}
                    </div>
                  </td>
                  <td>
                    <Badge>{recovery.status}</Badge>
                    {recovery.closeReason ? (
                      <div className="muted">{recovery.closeReason}</div>
                    ) : null}
                  </td>
                  <td className="num">{recovery.itemCount}</td>
                  <td className="num">
                    {formatMinor(recovery.cartTotal.amountMinor)}
                  </td>
                  <td>{formatDateTime(recovery.detectedAt)}</td>
                  <td>{formatDateTime(recovery.lastActivityAt)}</td>
                  <td>{recovery.recoveredOrderNumber ?? 'Not yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="card section-gap">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Recovery sequence</h2>
        {settings.loading ? (
          <LoadingNote label="Loading settings..." />
        ) : null}
        {settings.error ? (
          <ErrorNote error={settings.error} onRetry={settings.reload} />
        ) : null}
        {settings.data ? (
          <SettingsEditor
            settings={settings.data}
            canEdit={canEdit}
            onSaved={settings.reload}
          />
        ) : null}
      </div>
    </section>
  );
}

function SettingsEditor({
  settings,
  canEdit,
  onSaved,
}: {
  settings: RecoverySettings;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [abandonedAfterMinutes, setAbandonedAfterMinutes] = useState(
    String(settings.abandonedAfterMinutes),
  );
  const [tokenTtlDays, setTokenTtlDays] = useState(
    String(settings.tokenTtlDays),
  );
  const [steps, setSteps] = useState<RecoveryStep[]>(
    settings.steps.map((step) => ({ ...step })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateStep(index: number, patch: Partial<RecoveryStep>): void {
    setSteps((current) =>
      current.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
    setSaved(false);
  }

  function addStep(): void {
    setSteps((current) => [
      ...current,
      {
        stepNumber: current.length + 1,
        delayMinutes: 60,
        channel: 'whatsapp',
        templateKey: 'recovery-whatsapp-1',
      },
    ]);
    setSaved(false);
  }

  function removeStep(index: number): void {
    setSteps((current) =>
      current
        .filter((_, i) => i !== index)
        .map((step, i) => ({ ...step, stepNumber: i + 1 })),
    );
    setSaved(false);
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const threshold = Number(abandonedAfterMinutes);
    const ttl = Number(tokenTtlDays);
    if (!Number.isFinite(threshold) || threshold < 1) {
      setError('The inactivity threshold must be at least 1 minute.');
      return;
    }
    if (!Number.isFinite(ttl) || ttl < 1) {
      setError('The token lifetime must be at least 1 day.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateRecoverySettings({
        abandonedAfterMinutes: Math.trunc(threshold),
        tokenTtlDays: Math.trunc(ttl),
        steps: steps.map((step, i) => ({
          stepNumber: i + 1,
          delayMinutes: Math.trunc(step.delayMinutes),
          channel: step.channel,
          templateKey: step.templateKey.trim(),
        })),
      });
      setSaved(true);
      onSaved();
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

  if (!canEdit) {
    return (
      <div>
        <dl className="kv">
          <dt>Inactivity threshold</dt>
          <dd>{settings.abandonedAfterMinutes} minutes</dd>
          <dt>Token lifetime</dt>
          <dd>{settings.tokenTtlDays} days</dd>
        </dl>
        <ul className="timeline" style={{ marginTop: 12 }}>
          {settings.steps.map((step) => (
            <li key={step.stepNumber}>
              <strong>Step {step.stepNumber}</strong>: {step.channel} after{' '}
              {step.delayMinutes} minutes, template {step.templateKey}
            </li>
          ))}
        </ul>
        <p className="note muted">
          Editing the sequence needs the recovery.edit permission.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <label className="field" style={{ marginTop: 0 }}>
          Inactivity threshold (minutes)
          <input
            className="input"
            type="number"
            min={1}
            value={abandonedAfterMinutes}
            onChange={(event) => {
              setAbandonedAfterMinutes(event.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label className="field" style={{ marginTop: 0 }}>
          Recovery token lifetime (days)
          <input
            className="input"
            type="number"
            min={1}
            value={tokenTtlDays}
            onChange={(event) => {
              setTokenTtlDays(event.target.value);
              setSaved(false);
            }}
          />
        </label>
      </div>

      {steps.map((step, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginTop: 12,
          }}
        >
          <strong>Step {index + 1}</strong>
          <label className="field" style={{ marginTop: 0 }}>
            Channel
            <select
              className="select"
              value={step.channel}
              onChange={(event) =>
                updateStep(index, {
                  channel: event.target.value as CommunicationChannel,
                })
              }
            >
              {COMMUNICATION_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ marginTop: 0 }}>
            Delay after previous step (minutes)
            <input
              className="input"
              type="number"
              min={0}
              value={step.delayMinutes}
              onChange={(event) =>
                updateStep(index, {
                  delayMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="field" style={{ marginTop: 0 }}>
            Template key
            <input
              className="input"
              value={step.templateKey}
              onChange={(event) =>
                updateStep(index, { templateKey: event.target.value })
              }
            />
          </label>
          <button
            type="button"
            className="btn btn-small btn-danger"
            disabled={steps.length <= 1}
            onClick={() => removeStep(index)}
          >
            Remove step
          </button>
        </div>
      ))}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-small"
          disabled={steps.length >= 10}
          onClick={addStep}
        >
          Add step
        </button>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Saving...' : 'Save sequence'}
        </button>
      </div>
      {saved ? <p className="note">Sequence saved.</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
