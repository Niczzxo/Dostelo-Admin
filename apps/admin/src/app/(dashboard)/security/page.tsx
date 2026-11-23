'use client';

import { useState, type FormEvent } from 'react';
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  ALL_PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  type AuditActorType,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
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

function RolesMatrix() {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Permission</th>
            {ADMIN_ROLES.map((role) => (
              <th key={role}>{ADMIN_ROLE_LABELS[role]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_PERMISSION_KEYS.map((key) => (
            <tr key={key}>
              <td style={{ whiteSpace: 'nowrap' }}>{key}</td>
              {ADMIN_ROLES.map((role) => (
                <td key={role} style={{ textAlign: 'center' }}>
                  {ROLE_PERMISSIONS[role].includes(key) ? 'Yes' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditViewer() {
  const [action, setAction] = useState('');
  const [actorType, setActorType] = useState<AuditActorType | ''>('');
  const [limit, setLimit] = useState(50);
  const { data, error, loading, reload } = useData(
    (client) =>
      client.listAuditLog({
        action: action.trim() || undefined,
        actorType: actorType || undefined,
        limit,
      }),
    [action, actorType, limit],
  );

  return (
    <>
      <div className="toolbar" style={{ marginTop: 24 }}>
        <label className="field">
          Action contains
          <input
            className="input"
            placeholder="e.g. order.status"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          />
        </label>
        <label className="field">
          Actor type
          <select
            className="select"
            value={actorType}
            onChange={(event) =>
              setActorType(event.target.value as AuditActorType | '')
            }
          >
            <option value="">All</option>
            <option value="admin">Admin</option>
            <option value="customer">Customer</option>
            <option value="system">System</option>
          </select>
        </label>
        <label className="field">
          Limit
          <select
            className="select"
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
      </div>
      {loading ? <LoadingNote label="Loading audit log..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyNote>No audit entries match these filters.</EmptyNote>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td>{entry.action}</td>
                  <td>
                    {entry.actorType}
                    {entry.actorRole ? ` (${entry.actorRole})` : ''}
                    <br />
                    <span className="muted">{entry.actorId ?? 'system'}</span>
                  </td>
                  <td>
                    {entry.entityType}
                    {entry.entityId ? (
                      <>
                        <br />
                        <span className="muted">{entry.entityId}</span>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function MfaCard() {
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function fail(caught: unknown): void {
    const uiError = toUiError(caught);
    if (uiError.kind === 'unauthorized') {
      expireSession();
      return;
    }
    setError(uiError.message);
  }

  async function handleEnroll(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.enrollAdminMfa();
      setSecret(result.secret);
      setOtpauthUrl(result.otpauthUrl);
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnable(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.enableAdminMfa({ code });
      setMessage('Two-factor authentication is now enabled on your account.');
      setSecret(null);
      setOtpauthUrl(null);
      setCode('');
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(event: FormEvent): Promise<void> {
    event.preventDefault();
    const confirmed = window.confirm(
      'Disable two-factor authentication on your account?',
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.disableAdminMfa({ code: disableCode });
      setMessage('Two-factor authentication is now disabled on your account.');
      setDisableCode('');
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card section-gap">
      <h2 style={{ fontSize: 16, marginTop: 0 }}>
        Two-factor authentication (your account)
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        Enrol an authenticator app (TOTP). After enabling, sign in will
        ask for a six-digit code after your password.
      </p>
      {secret ? (
        <form onSubmit={handleEnable}>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Add this secret to your authenticator app, then enter the
            current code to confirm.
          </p>
          <dl className="kv">
            <dt>Secret</dt>
            <dd>
              <code>{secret}</code>
            </dd>
            <dt>otpauth URL</dt>
            <dd>
              <code style={{ overflowWrap: 'anywhere' }}>{otpauthUrl}</code>
            </dd>
          </dl>
          <label className="field">
            Code
            <input
              className="input"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="btn"
            style={{ marginTop: 14 }}
            disabled={busy}
          >
            {busy ? 'Saving...' : 'Enable two-factor'}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={handleEnroll}
        >
          {busy ? 'Starting...' : 'Start enrolment'}
        </button>
      )}
      <form onSubmit={handleDisable} style={{ marginTop: 20 }}>
        <label className="field">
          Disable with a current code
          <input
            className="input"
            inputMode="numeric"
            value={disableCode}
            onChange={(event) => setDisableCode(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="btn btn-secondary"
          style={{ marginTop: 14 }}
          disabled={busy || disableCode.length !== 6}
        >
          Disable two-factor
        </button>
      </form>
      {message ? (
        <p className="note" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function SecurityPage() {
  const { session } = useAuth();
  const canReadAudit =
    session.principal?.permissions.includes('audit.read') ?? false;

  return (
    <section>
      <PageHeader title="Security & Access">
        <Badge>Live from the roles matrix</Badge>
      </PageHeader>
      <p style={{ lineHeight: 1.6, maxWidth: 720 }}>
        This matrix is the same ROLE_PERMISSIONS data the API guards
        enforce server-side, rendered here for review. Changing it is a
        code change in the shared types package, never a runtime edit.
      </p>
      <RolesMatrix />
      <MfaCard />
      <h2 className="section-gap" style={{ fontSize: 18 }}>
        Audit log
      </h2>
      {canReadAudit ? (
        <AuditViewer />
      ) : (
        <p className="note muted">
          Your role cannot read the audit log (the audit.read permission
          is required).
        </p>
      )}
    </section>
  );
}
