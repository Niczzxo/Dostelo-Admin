'use client';

import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, KeyValues, LoadingNote,
  ModuleHeader, TextInput,
} from '../../../components/ui';
import { useAuth } from '../../../components/auth-provider';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../lib/types';

/* Security & Access: the audit log viewer, the security settings
   the API reports, own sessions with revocation, and MFA
   self-service for the signed-in admin. Roles and permissions are
   read from the signed-in principal and from the staff records;
   the API is the enforcement point, this page is the window. The
   MFA secret is shown once at enrolment so it can be scanned into
   an authenticator; it is never stored by this page. */
export default function SecurityPage() {
  const { session } = useAuth();
  const audit = useData((c) => c.listAuditLog({}));
  const settings = useData((c) => c.getSecuritySettings());
  const sessions = useData((c) => c.listOwnSessions());
  const action = useAction();
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaState, setMfaState] = useState('');

  const auditItems = itemsOf(audit.data);
  const settingsRec = asRec(settings.data);
  const sessionItems = itemsOf(sessions.data);
  const permissions = session.principal?.permissions ?? [];

  async function enroll(event: FormEvent) {
    event.preventDefault();
    await action.run(async (c) => {
      const res = asRec(await c.enrollAdminMfa());
      setMfaSecret(str(res.otpauthUrl ?? res.secret));
      setMfaState('Enrolment started. Add the secret to your authenticator, then enable with a code.');
    });
  }

  async function enable(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.enableAdminMfa({ code: mfaCode }))) {
      setMfaState('MFA is enabled on your account.');
      setMfaSecret('');
    }
  }

  async function disable(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.disableAdminMfa({ code: mfaCode }))) {
      setMfaState('MFA is disabled on your account.');
    }
  }

  return (
    <>
      <ModuleHeader
        icon={ShieldCheck}
        title="Security & Access"
        description="Audit log, security settings, your sessions and MFA. Authorization is enforced by the API on every request; this page only displays and manages your own access."
      />
      <ActionError error={action.error} />
      <div className="section-grid">
        <Card title="Your roles and permissions">
          <p className="note" style={{ marginTop: 0 }}>
            Roles: {(session.principal?.roles ?? []).join(', ') || 'None reported'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {permissions.map((p) => (
              <Badge key={p}>{p}</Badge>
            ))}
            {permissions.length === 0 ? <span className="note">No permissions reported by the API.</span> : null}
          </div>
        </Card>
        <Card title="Security settings (as the API reports them)">
          {settings.loading ? (
            <LoadingNote />
          ) : settings.error ? (
            <ErrorNote error={settings.error} onRetry={settings.reload} />
          ) : (
            <KeyValues
              entries={[
                ['Access token lifetime (seconds)', String(settingsRec.accessTokenTtlSeconds ?? '')],
                ['Refresh token lifetime (days)', String(settingsRec.refreshTokenTtlDays ?? '')],
                ['Login rate limit per minute', String(settingsRec.loginRateLimitPerMinute ?? '')],
                ['Minimum password length', String(settingsRec.passwordMinLength ?? '')],
                ['MFA required for admins', settingsRec.requireMfaForAdmins === true ? 'Yes' : 'No'],
                ['Account lockout', settingsRec.accountLockout === true ? 'On' : 'Off'],
                ['CORS credentials', settingsRec.corsCredentials === true ? 'Allowed for the allowlist' : 'Off'],
                ['Body limit', str(settingsRec.bodyLimit)],
              ]}
            />
          )}
        </Card>
      </div>

      <Card title="Your sessions">
        {sessions.loading ? (
          <LoadingNote />
        ) : sessions.error ? (
          <ErrorNote error={sessions.error} onRetry={sessions.reload} />
        ) : (
          <>
            <DataTable
              searchable={false}
              emptyText="No sessions returned by the API."
              columns={[
                { key: 'familyId', label: 'Session family', render: (r) => str(r.familyId).slice(0, 12) },
                { key: 'createdAt', label: 'Created', date: true },
                { key: 'lastActiveAt', label: 'Last active', date: true },
                { key: 'active', label: 'State', render: (r) => <Badge tone={r.active === true ? 'ok' : undefined}>{r.active === true ? 'Active' : 'Ended'}</Badge> },
                {
                  key: 'revoke', label: 'Action',
                  render: (r) => (
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={action.busy}
                      onClick={async () => {
                        if (await action.run((c) => c.revokeOwnSessionFamily(str(r.familyId)))) sessions.reload();
                      }}
                    >
                      Revoke
                    </button>
                  ),
                },
              ]}
              rows={sessionItems}
            />
            <button
              type="button"
              className="btn secondary"
              disabled={action.busy}
              onClick={async () => {
                if (await action.run((c) => c.revokeOtherSessionFamilies())) sessions.reload();
              }}
            >
              Revoke all other sessions
            </button>
          </>
        )}
      </Card>

      <Card title="Multi-factor authentication (your account)">
        {mfaState ? <p className="note" role="status">{mfaState}</p> : null}
        <form onSubmit={enroll}>
          <button type="submit" className="btn secondary" disabled={action.busy}>Start MFA enrolment</button>
        </form>
        {mfaSecret ? (
          <Field label="Authenticator secret (shown once)">
            <TextInput readOnly value={mfaSecret} />
          </Field>
        ) : null}
        <form onSubmit={enable} style={{ marginTop: 10 }}>
          <Field label="Authenticator code">
            <TextInput inputMode="numeric" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Six digit code" />
          </Field>
          <span className="btn-row">
            <button type="submit" className="btn" disabled={action.busy || !mfaCode}>Enable MFA</button>
            <button type="button" className="btn secondary" disabled={action.busy || !mfaCode} onClick={(e) => void disable(e as unknown as FormEvent)}>
              Disable MFA
            </button>
          </span>
        </form>
      </Card>

      <Card title="Audit log">
        {audit.loading ? (
          <LoadingNote />
        ) : audit.error ? (
          <ErrorNote error={audit.error} onRetry={audit.reload} />
        ) : (
          <DataTable
            emptyText="No audit entries yet. Sensitive staff actions are written here by the API."
            columns={[
              { key: 'createdAt', label: 'When', date: true },
              { key: 'actorId', label: 'Actor' },
              { key: 'action', label: 'Action' },
              { key: 'entity', label: 'Entity', render: (r) => str(r.entity ?? r.resource ?? r.target) },
              { key: 'entityId', label: 'Entity ID', render: (r) => str(r.entityId ?? r.targetId) },
            ]}
            rows={auditItems}
          />
        )}
      </Card>
    </>
  );
}
