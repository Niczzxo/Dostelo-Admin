'use client';

import { useState, type FormEvent } from 'react';
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  type AdminRole,
  type StaffMemberView,
} from '@dostelo/types';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Staff Management: admin accounts over the API's admins and
 * sessions stores. Inviting means creating the account here with
 * a temporary password the creating admin sets and hands over
 * out of band; the API stores only its hash and no view ever
 * shows one. Deactivation blocks new sign-ins, and force logout
 * revokes every live session. The roles matrix itself lives
 * under Security & Access.
 */
export default function StaffPage() {
  const { session } = useAuth();
  const myId = session.principal?.id ?? '';
  const staff = useData((client) => client.listStaff(), []);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [newRoles, setNewRoles] = useState<AdminRole[]>(['sales-agent']);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleRole(
    roles: AdminRole[],
    role: AdminRole,
    apply: (next: AdminRole[]) => void,
  ): void {
    apply(
      roles.includes(role)
        ? roles.filter((entry) => entry !== role)
        : [...roles, role],
    );
  }

  async function createStaff(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (newRoles.length === 0) {
      setCreateError('Give the account at least one role.');
      return;
    }
    setBusy(true);
    setCreateError(null);
    setCreateMessage(null);
    try {
      const created = await api.createStaff({
        email: email.trim(),
        displayName: displayName.trim(),
        roles: newRoles,
        temporaryPassword,
      });
      setCreateMessage(
        `Account created for ${created.email}. Hand the temporary password to them directly; it is not stored anywhere readable.`,
      );
      setEmail('');
      setDisplayName('');
      setTemporaryPassword('');
      staff.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setCreateError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function runRowAction(
    member: StaffMemberView,
    action: () => Promise<unknown>,
  ): Promise<void> {
    setBusy(true);
    setRowError(null);
    try {
      await action();
      staff.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setRowError(`${member.email}: ${uiError.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader title="Staff Management" />
      {staff.loading ? <LoadingNote label="Loading staff..." /> : null}
      {staff.error ? (
        <ErrorNote error={staff.error} onRetry={staff.reload} />
      ) : null}
      {staff.data && staff.data.items.length === 0 ? (
        <EmptyNote>No staff accounts exist yet.</EmptyNote>
      ) : null}
      {rowError ? (
        <p className="form-error" role="alert">
          {rowError}
        </p>
      ) : null}
      {staff.data && staff.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Roles</th>
                <th>Status</th>
                <th>MFA</th>
                <th className="num">Live sessions</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.data.items.map((member) => (
                <tr key={member.id}>
                  <td>
                    {member.displayName}
                    <div className="muted">
                      {member.email}
                      {member.id === myId ? ' (you)' : ''}
                    </div>
                  </td>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      {ADMIN_ROLES.map((role) => (
                        <label
                          key={role}
                          style={{
                            display: 'inline-flex',
                            gap: 4,
                            alignItems: 'center',
                            fontSize: 12,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={member.roles.includes(role)}
                            disabled={busy}
                            onChange={() => {
                              const next = member.roles.includes(role)
                                ? member.roles.filter(
                                    (entry) => entry !== role,
                                  )
                                : [...member.roles, role];
                              if (next.length === 0) {
                                setRowError(
                                  `${member.email}: an account needs at least one role.`,
                                );
                                return;
                              }
                              void runRowAction(member, () =>
                                api.setStaffRoles(member.id, {
                                  roles: next,
                                }),
                              );
                            }}
                          />
                          {ADMIN_ROLE_LABELS[role]}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <Badge>{member.isActive ? 'Active' : 'Deactivated'}</Badge>
                  </td>
                  <td>{member.mfaEnabled ? 'On' : 'Off'}</td>
                  <td className="num">{member.activeSessions}</td>
                  <td>{formatDateTime(member.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {member.isActive ? (
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          disabled={busy || member.id === myId}
                          title={
                            member.id === myId
                              ? 'You cannot deactivate your own account'
                              : undefined
                          }
                          onClick={() =>
                            void runRowAction(member, () =>
                              api.deactivateStaff(member.id),
                            )
                          }
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-small"
                          disabled={busy}
                          onClick={() =>
                            void runRowAction(member, () =>
                              api.activateStaff(member.id),
                            )
                          }
                        >
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-small btn-secondary"
                        disabled={busy || member.activeSessions === 0}
                        onClick={() =>
                          void runRowAction(member, () =>
                            api.revokeStaffSessions(member.id),
                          )
                        }
                      >
                        Force logout
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 20, maxWidth: 760 }}>
        <h2 style={{ fontSize: 17, marginTop: 0 }}>Invite a staff member</h2>
        <p className="note muted" style={{ marginTop: 0 }}>
          This creates the account immediately with the temporary
          password you set. Share that password with the person
          directly; they sign in with it and can enrol MFA under
          Security & Access.
        </p>
        <form onSubmit={createStaff}>
          <div className="toolbar">
            <label className="field" style={{ flex: 1, minWidth: 200 }}>
              Email
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              Display name
              <input
                className="input"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
          </div>
          <label className="field" style={{ marginTop: 10 }}>
            Temporary password (at least 8 characters)
            <input
              className="input"
              type="password"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          <div style={{ marginTop: 12 }}>
            <div className="note muted" style={{ margin: 0 }}>
              Roles
            </div>
            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                marginTop: 6,
              }}
            >
              {ADMIN_ROLES.map((role) => (
                <label
                  key={role}
                  style={{
                    display: 'inline-flex',
                    gap: 4,
                    alignItems: 'center',
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newRoles.includes(role)}
                    onChange={() =>
                      toggleRole(newRoles, role, setNewRoles)
                    }
                  />
                  {ADMIN_ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-small"
            disabled={busy}
            style={{ marginTop: 14 }}
          >
            {busy ? 'Creating...' : 'Create account'}
          </button>
          {createMessage ? (
            <p className="note" style={{ margin: '8px 0 0' }}>
              {createMessage}
            </p>
          ) : null}
          {createError ? (
            <p className="form-error" role="alert">
              {createError}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
