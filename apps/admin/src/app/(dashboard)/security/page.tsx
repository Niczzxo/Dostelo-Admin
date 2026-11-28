'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  ALL_PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  type AdminRole,
  type AuditActorType,
} from '@dostelo/types';
import {
  BarChart3,
  Calculator,
  Crown,
  Download,
  HeartHandshake,
  KeyRound,
  LifeBuoy,
  ListChecks,
  Megaphone,
  MonitorSmartphone,
  Package,
  ScrollText,
  Settings2,
  ShieldCheck,
  Store,
  TrendingUp,
  Truck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { toCsv, downloadCsv } from '../../../lib/csv';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  ModuleHeader,
  Pagination,
  pageCountFor,
  paginate,
} from '../../../components/ui';

/**
 * Security and Access: the enforced ROLE_PERMISSIONS matrix from
 * the shared types package rendered read-only, the signed-in
 * admin's own TOTP enrolment (enrollAdminMfa, enableAdminMfa,
 * disableAdminMfa), their own session families (listOwnSessions,
 * revokeOwnSessionFamily, revokeOtherSessionFamilies), the
 * server-reported security configuration (getSecuritySettings),
 * and the append-only audit log (listAuditLog). Values the API
 * does not enforce or capture are shown as unavailable, never as
 * invented numbers or working toggles.
 */

const ROLE_ICONS: Record<AdminRole, LucideIcon> = {
  'super-admin': Crown,
  'store-manager': Store,
  'crm-manager': HeartHandshake,
  'sales-agent': TrendingUp,
  'support-agent': LifeBuoy,
  'product-manager': Package,
  accountant: Calculator,
  'delivery-manager': Truck,
  'marketing-manager': Megaphone,
  analyst: BarChart3,
};

const TABS = [
  { key: 'roles', label: 'Role and Permissions' },
  { key: '2fa', label: 'Two-Factor Authentication' },
  { key: 'sessions', label: 'Session Management' },
  { key: 'login', label: 'Login Security' },
  { key: 'audit', label: 'Audit Logs' },
  { key: 'settings', label: 'Security Settings' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function MatrixCard() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AdminRole | ''>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  const query = search.trim().toLowerCase();
  const rows = ALL_PERMISSION_KEYS.filter(
    (key) => !query || key.toLowerCase().includes(query),
  );
  const roles = roleFilter ? [roleFilter] : ADMIN_ROLES;
  const pageCount = pageCountFor(rows.length, 8);
  const pageRows = paginate(rows, Math.min(page, pageCount), 8);

  return (
    <div className="card">
      <CardHead icon={ListChecks} title="Roles and Permissions Matrix">
        <Link href="/staff" className="btn btn-small">
          <UsersRound size={14} /> Manage Roles
        </Link>
      </CardHead>
      <p className="note muted" style={{ marginTop: 0 }}>
        Read-only. The checkboxes are disabled and reflect ROLE_PERMISSIONS in the
        shared types package exactly, which is the same matrix the API guards enforce
        server-side. There is no edit action: changing the matrix is a code change,
        and making it editable stored configuration was not shipped in this pass. The
        Super Admin row is locked and always holds every permission.
      </p>
      <div className="filter-row" style={{ marginBottom: 12 }}>
        <label className="field">
          Search permissions
          <input
            className="input"
            placeholder="e.g. orders.edit"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="field">
          Role
          <select
            className="select"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as AdminRole | '')}
          >
            <option value="">All roles</option>
            {ADMIN_ROLES.map((role) => (
              <option key={role} value={role}>
                {ADMIN_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pageRows.length === 0 ? (
        <EmptyNote>No permission keys match this search.</EmptyNote>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Permission</th>
                {roles.map((role) => {
                  const Icon = ROLE_ICONS[role];
                  return (
                    <th key={role}>
                      <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                        <Icon size={13} />
                        {ADMIN_ROLE_LABELS[role]}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((key) => (
                <tr key={key}>
                  <td style={{ whiteSpace: 'nowrap' }}>{key}</td>
                  {roles.map((role) => (
                    <td key={role} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={ROLE_PERMISSIONS[role].includes(key)}
                        disabled
                        style={{ accentColor: '#1C1B17' }}
                        aria-label={`${ADMIN_ROLE_LABELS[role]}: ${key}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="table-foot">
        <span className="muted">
          Showing {pageRows.length} of {rows.length} permission keys
        </span>
        <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={setPage} />
      </div>
    </div>
  );
}

function MfaCard({ mfaEnabled, onChanged }: { mfaEnabled: boolean | null; onChanged: () => void }) {
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
      onChanged();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!window.confirm('Disable two-factor authentication on your account?')) return;
    setBusy(true);
    setError(null);
    try {
      await api.disableAdminMfa({ code: disableCode });
      setMessage('Two-factor authentication is now disabled on your account.');
      setDisableCode('');
      onChanged();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <CardHead icon={KeyRound} title="Two-Factor Authentication (Your Account)" />
      <p style={{ lineHeight: 1.6 }}>
        Enrolment state for your account:{' '}
        <strong>
          {mfaEnabled === null ? 'Unavailable from the staff directory' : mfaEnabled ? 'Enabled' : 'Not enabled'}
        </strong>
        . Enrol an authenticator app (TOTP). After enabling, sign in asks for a
        six-digit code after your password.
      </p>
      {secret ? (
        <form onSubmit={handleEnable}>
          <p style={{ lineHeight: 1.6 }}>
            Add this secret to your authenticator app, or open the otpauth URL in it,
            then enter the current six-digit code to confirm.
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
            Six-digit code
            <input
              className="input"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn" style={{ marginTop: 14 }} disabled={busy || code.length !== 6}>
            {busy ? 'Saving...' : 'Enable two-factor'}
          </button>
        </form>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={handleEnroll}>
          {busy ? 'Starting...' : 'Start Enrolment'}
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
      <p className="note muted">
        Recovery codes: the auth module does not issue backup recovery codes, so none
        can be shown here. If you lose your authenticator, another admin with staff
        access must help you re-enrol.
      </p>
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

function SessionsCard() {
  const sessions = useData((client) => client.listOwnSessions(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = [...(sessions.data?.items ?? [])].sort((a, b) =>
    b.lastActiveAt.localeCompare(a.lastActiveAt),
  );
  const current = sorted.find((entry) => entry.active) ?? null;
  const activeCount = sorted.filter((entry) => entry.active).length;

  async function run(action: () => Promise<unknown>, done: string): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      sessions.reload();
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
    <div className="card">
      <CardHead icon={MonitorSmartphone} title="Session Management (Your Sessions)">
        {current && activeCount > 1 ? (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('Revoke every other session family? Those devices will be signed out.')) return;
              void run(
                () => api.revokeOtherSessionFamilies(current.familyId),
                'All other session families revoked.',
              );
            }}
          >
            Revoke All Others
          </button>
        ) : null}
      </CardHead>
      <p className="note muted" style={{ marginTop: 0 }}>
        Session records carry timestamps only: the auth flow does not capture device,
        browser or IP, so those columns are not shown. The current session is the most
        recent active family, because the client cannot read its own family id from
        the stored refresh token.
      </p>
      {sessions.loading ? <LoadingNote label="Loading sessions..." /> : null}
      {sessions.error ? <ErrorNote error={sessions.error} onRetry={sessions.reload} /> : null}
      {sessions.data && sorted.length === 0 ? (
        <EmptyNote>No session families were returned for your account.</EmptyNote>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="note" role="status">
          {notice}
        </p>
      ) : null}
      {sessions.data && sorted.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Family</th>
                <th>Created</th>
                <th>Last Active</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => {
                const isCurrent = current !== null && entry.familyId === current.familyId;
                return (
                  <tr key={entry.familyId}>
                    <td>
                      <span className="muted">{entry.familyId}</span>
                      {isCurrent ? (
                        <>
                          {' '}
                          <Badge>Current</Badge>
                        </>
                      ) : null}
                    </td>
                    <td>{formatDateTime(entry.createdAt)}</td>
                    <td>{formatDateTime(entry.lastActiveAt)}</td>
                    <td>{formatDateTime(entry.expiresAt)}</td>
                    <td>
                      <span className={`band-chip ${entry.active ? 'green' : 'grey'}`}>
                        {entry.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-small"
                        disabled={busy || !entry.active}
                        onClick={() => {
                          const warning = isCurrent
                            ? 'Revoke the current session family? You will be signed out on the next refresh.'
                            : 'Revoke this session family? That device will be signed out.';
                          if (!window.confirm(warning)) return;
                          void run(
                            () => api.revokeOwnSessionFamily(entry.familyId),
                            'Session family revoked.',
                          );
                        }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function LoginSecurityCard() {
  const settings = useData((client) => client.getSecuritySettings(), []);
  const data = settings.data;
  return (
    <div className="card">
      <CardHead icon={ShieldCheck} title="Login Security" />
      <p className="note muted" style={{ marginTop: 0 }}>
        Read-only facts reported by the API from the server configuration. Nothing
        here is editable from the portal.
      </p>
      {settings.loading ? <LoadingNote label="Loading login security..." /> : null}
      {settings.error ? <ErrorNote error={settings.error} onRetry={settings.reload} /> : null}
      {data ? (
        <dl className="kv">
          <dt>Login rate limit</dt>
          <dd>{data.loginRateLimitPerMinute} attempts per minute</dd>
          <dt>Access token TTL</dt>
          <dd>{data.accessTokenTtlSeconds} seconds</dd>
          <dt>Refresh token TTL</dt>
          <dd>{data.refreshTokenTtlDays} days</dd>
          <dt>Password minimum length</dt>
          <dd>{data.passwordMinLength} characters</dd>
          <dt>MFA challenge TTL</dt>
          <dd>{data.mfaChallengeTtlMinutes} minutes</dd>
          <dt>Require MFA for admins</dt>
          <dd>Not enforced (the API reports this flag, but no enforcement is wired to it)</dd>
          <dt>Account lockout</dt>
          <dd>Not enforced (the API reports this flag, but no enforcement is wired to it)</dd>
          <dt>Login notifications</dt>
          <dd>{data.loginNotifications || 'Not configured (no email provider)'}</dd>
        </dl>
      ) : null}
    </div>
  );
}

function SecuritySettingsCard() {
  const settings = useData((client) => client.getSecuritySettings(), []);
  const data = settings.data;
  return (
    <div className="card">
      <CardHead icon={Settings2} title="Security Settings (Server Configuration)" />
      <p className="note muted" style={{ marginTop: 0 }}>
        Read-only server configuration from getSecuritySettings. Values come from the
        API only and cannot be changed from the portal.
      </p>
      {settings.loading ? <LoadingNote label="Loading security settings..." /> : null}
      {settings.error ? <ErrorNote error={settings.error} onRetry={settings.reload} /> : null}
      {data ? (
        <dl className="kv">
          <dt>CORS allowlist</dt>
          <dd>
            {data.corsAllowlist.length > 0 ? data.corsAllowlist.join(', ') : 'Empty (no origins allowlisted)'}
          </dd>
          <dt>CORS credentials</dt>
          <dd>{data.corsCredentials ? 'Allowed' : 'Not allowed'}</dd>
          <dt>Security headers</dt>
          <dd>
            {data.securityHeaders.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.securityHeaders.map((header) => (
                  <li key={header}>{header}</li>
                ))}
              </ul>
            ) : (
              'None reported'
            )}
          </dd>
          <dt>Body limit</dt>
          <dd>{data.bodyLimit}</dd>
          <dt>Login rate limit</dt>
          <dd>{data.loginRateLimitPerMinute} attempts per minute</dd>
          <dt>Access token TTL</dt>
          <dd>{data.accessTokenTtlSeconds} seconds</dd>
          <dt>Refresh token TTL</dt>
          <dd>{data.refreshTokenTtlDays} days</dd>
        </dl>
      ) : null}
    </div>
  );
}

function AuditViewer() {
  const [action, setAction] = useState('');
  const [actorType, setActorType] = useState<AuditActorType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [action, actorType, from, to, limit]);

  const { data, error, loading, reload } = useData(
    (client) =>
      client.listAuditLog({
        action: action.trim() || undefined,
        actorType: actorType || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        limit,
      }),
    [action, actorType, from, to, limit],
  );

  const items = data?.items ?? [];
  const pageCount = pageCountFor(items.length, 10);
  const pageRows = paginate(items, Math.min(page, pageCount), 10);

  function exportCsv(): void {
    const csv = toCsv(
      ['When', 'Action', 'Actor Type', 'Actor ID', 'Actor Role', 'Entity Type', 'Entity ID'],
      items.map((entry) => [
        entry.createdAt,
        entry.action,
        entry.actorType,
        entry.actorId ?? '',
        entry.actorRole ?? '',
        entry.entityType,
        entry.entityId ?? '',
      ]),
    );
    downloadCsv('audit-log.csv', csv);
  }

  return (
    <div className="card">
      <CardHead icon={ScrollText} title="Audit Logs">
        <button
          type="button"
          className="btn btn-secondary btn-small"
          disabled={items.length === 0}
          onClick={exportCsv}
        >
          <Download size={14} /> Export CSV
        </button>
      </CardHead>
      <p className="note muted" style={{ marginTop: 0 }}>
        The audit log is append-only: entries are written by the API and cannot be
        edited or deleted from the portal. Export downloads the currently filtered
        set.
      </p>
      <div className="filter-row" style={{ marginBottom: 12 }}>
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
            onChange={(event) => setActorType(event.target.value as AuditActorType | '')}
          >
            <option value="">All</option>
            <option value="admin">Admin</option>
            <option value="customer">Customer</option>
            <option value="system">System</option>
          </select>
        </label>
        <label className="field">
          From
          <input
            className="input"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="field">
          To
          <input
            className="input"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
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
        <div className="filter-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setAction('');
              setActorType('');
              setFrom('');
              setTo('');
              setLimit(50);
            }}
          >
            Reset
          </button>
        </div>
      </div>
      {loading ? <LoadingNote label="Loading audit log..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data && items.length === 0 ? (
        <EmptyNote>No audit entries match these filters.</EmptyNote>
      ) : null}
      {data && items.length > 0 ? (
        <>
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
                {pageRows.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.createdAt)}</td>
                    <td>{entry.action}</td>
                    <td>
                      {entry.actorType}
                      {entry.actorRole ? ` (${ADMIN_ROLE_LABELS[entry.actorRole] ?? entry.actorRole})` : ''}
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
          <div className="table-foot">
            <span className="muted">
              Showing {pageRows.length} of {items.length} entries
            </span>
            <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={setPage} />
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function SecurityPage() {
  const { session } = useAuth();
  const myId = session.principal?.id ?? '';
  const canReadAudit =
    session.principal?.permissions.includes('audit.read') ?? false;
  const [tab, setTab] = useState<TabKey>('roles');

  const staff = useData((client) => client.listStaff(), []);
  const sessions = useData((client) => client.listOwnSessions(), []);

  const staffItems = staff.data?.items ?? [];
  const mfaCount = staff.data
    ? staffItems.filter((member) => member.mfaEnabled).length
    : null;
  const ownRecord = staff.data
    ? (staffItems.find((member) => member.id === myId) ?? null)
    : null;
  const ownMfaEnabled = ownRecord ? ownRecord.mfaEnabled : null;
  const yourActiveSessions = sessions.data
    ? sessions.data.items.filter((entry) => entry.active).length
    : null;

  return (
    <section>
      <ModuleHeader
        icon={ShieldCheck}
        title="Security and Access"
        description="The enforced roles matrix, your two-factor enrolment, your sessions, login security facts and the append-only audit log, all read live from the API."
      >
        <Badge>Live from the roles matrix</Badge>
      </ModuleHeader>

      <div className="kpi-grid">
        <KpiCard icon={UsersRound} label="Total Roles" value="10" note="Roles in the enforced matrix" tone="purple" />
        <KpiCard icon={ListChecks} label="Total Permissions" value={String(ALL_PERMISSION_KEYS.length)} note="Permission keys in the matrix" tone="blue" />
        <KpiCard
          icon={KeyRound}
          label="MFA Enabled Users"
          value={mfaCount === null ? 'Unavailable' : String(mfaCount)}
          note={staff.error ? 'Staff directory could not be loaded' : 'Staff accounts with MFA on'}
          tone="green"
        />
        <KpiCard
          icon={MonitorSmartphone}
          label="Active Sessions"
          value={yourActiveSessions === null ? 'Unavailable' : String(yourActiveSessions)}
          note="Your active sessions only; a global count does not exist in the API"
          tone="orange"
        />
      </div>

      <div className="page-tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            className={`page-tab${tab === entry.key ? ' active' : ''}`}
            onClick={() => setTab(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'roles' ? <MatrixCard /> : null}
      {tab === '2fa' ? (
        <MfaCard
          mfaEnabled={ownMfaEnabled}
          onChanged={() => {
            staff.reload();
          }}
        />
      ) : null}
      {tab === 'sessions' ? <SessionsCard /> : null}
      {tab === 'login' ? <LoginSecurityCard /> : null}
      {tab === 'audit' ? (
        canReadAudit ? (
          <AuditViewer />
        ) : (
          <div className="card">
            <CardHead icon={ScrollText} title="Audit Logs" />
            <p className="note muted">
              Your role cannot read the audit log (the audit.read permission is
              required).
            </p>
          </div>
        )
      ) : null}
      {tab === 'settings' ? <SecuritySettingsCard /> : null}
    </section>
  );
}
