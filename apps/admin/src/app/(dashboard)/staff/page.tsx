'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  ALL_PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  type AdminRole,
  type StaffMemberView,
} from '@dostelo/types';
import {
  BarChart3,
  Calculator,
  Crown,
  HeartHandshake,
  LifeBuoy,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Package,
  ShieldCheck,
  Store,
  TrendingUp,
  Truck,
  UserCheck,
  UserPlus,
  UsersRound,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
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
 * Staff Management: the real admin accounts from listStaff,
 * including the seeded super admin. Nothing here is demo data.
 * Activation state changes go through activateStaff and
 * deactivateStaff (the client has no single setStaffActive
 * method); deactivation revokes every live session server-side.
 * Force logout uses revokeStaffSessions. Invites use inviteStaff:
 * the API returns a one-time token, the invitee sets their own
 * password on the accept-invite page, and nothing is emailed
 * because no email provider is configured. There is no password
 * reset endpoint, so no reset action is offered.
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

const ADMIN_LEVEL_ROLES: AdminRole[] = ['super-admin', 'store-manager'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function RoleChips({ roles }: { roles: AdminRole[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {roles.map((role) => {
        const Icon = ROLE_ICONS[role];
        return (
          <span key={role} className="badge" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
            <Icon size={12} />
            {ADMIN_ROLE_LABELS[role]}
          </span>
        );
      })}
    </span>
  );
}

function RoleCheckboxes({
  value,
  onChange,
  disabled,
}: {
  value: AdminRole[];
  onChange: (next: AdminRole[]) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {ADMIN_ROLES.map((role) => {
        const Icon = ROLE_ICONS[role];
        return (
          <label
            key={role}
            style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 13 }}
          >
            <input
              type="checkbox"
              checked={value.includes(role)}
              disabled={disabled}
              onChange={() =>
                onChange(
                  value.includes(role)
                    ? value.filter((entry) => entry !== role)
                    : [...value, role],
                )
              }
            />
            <Icon size={13} />
            {ADMIN_ROLE_LABELS[role]}
          </label>
        );
      })}
    </div>
  );
}

/** Read-only roles matrix, the same markup the Security page
 * renders: checked state comes straight from ROLE_PERMISSIONS. */
function RolesMatrixTable() {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Permission</th>
            {ADMIN_ROLES.map((role) => {
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
          {ALL_PERMISSION_KEYS.map((key) => (
            <tr key={key}>
              <td style={{ whiteSpace: 'nowrap' }}>{key}</td>
              {ADMIN_ROLES.map((role) => (
                <td key={role} style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={ROLE_PERMISSIONS[role].includes(key)}
                    disabled
                    style={{ accentColor: '#7C5CFF' }}
                    aria-label={`${ADMIN_ROLE_LABELS[role]}: ${key}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffAuditActivity({ actorId }: { actorId: string }) {
  const audit = useData(
    (client) => client.listAuditLog({ actorId, limit: 50 }),
    [actorId],
  );
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Recent audit activity</h3>
      {audit.loading ? <LoadingNote label="Loading audit activity..." /> : null}
      {audit.error ? <ErrorNote error={audit.error} onRetry={audit.reload} /> : null}
      {audit.data && audit.data.items.length === 0 ? (
        <EmptyNote>No audit entries for this account yet.</EmptyNote>
      ) : null}
      {audit.data && audit.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.items.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.createdAt)}</td>
                  <td>{entry.action}</td>
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
    </div>
  );
}

export default function StaffPage() {
  const { session } = useAuth();
  const myId = session.principal?.id ?? '';
  const staff = useData((client) => client.listStaff(), []);
  const items = staff.data?.items ?? [];

  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AdminRole | ''>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [matrixOpen, setMatrixOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileFor, setProfileFor] = useState<StaffMemberView | null>(null);
  const [editFor, setEditFor] = useState<StaffMemberView | null>(null);
  const [editName, setEditName] = useState('');
  const [rolesFor, setRolesFor] = useState<StaffMemberView | null>(null);
  const [rolesDraft, setRolesDraft] = useState<AdminRole[]>([]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRoles, setInviteRoles] = useState<AdminRole[]>(['sales-agent']);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [tab, search, roleFilter]);

  const activeCount = items.filter((member) => member.isActive).length;
  const inactiveCount = items.length - activeCount;
  const adminCount = items.filter((member) =>
    member.roles.some((role) => ADMIN_LEVEL_ROLES.includes(role)),
  ).length;

  const query = search.trim().toLowerCase();
  const filtered = items.filter((member) => {
    if (tab === 'active' && !member.isActive) return false;
    if (tab === 'inactive' && member.isActive) return false;
    if (roleFilter && !member.roles.includes(roleFilter)) return false;
    if (query) {
      const haystack = [
        member.displayName,
        member.email,
        ...member.roles.map((role) => ADMIN_ROLE_LABELS[role]),
        ...member.roles,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  const pageCount = pageCountFor(filtered.length, 10);
  const pageRows = paginate(filtered, Math.min(page, pageCount), 10);

  function fail(caught: unknown, prefix?: string): void {
    const uiError = toUiError(caught);
    if (uiError.kind === 'unauthorized') {
      expireSession();
      return;
    }
    setRowError(prefix ? `${prefix}: ${uiError.message}` : uiError.message);
  }

  async function runAction(
    member: StaffMemberView,
    action: () => Promise<unknown>,
    doneMessage?: string,
  ): Promise<void> {
    setBusy(true);
    setRowError(null);
    setNotice(null);
    try {
      await action();
      if (doneMessage) setNotice(doneMessage);
      staff.reload();
    } catch (caught) {
      fail(caught, member.email);
    } finally {
      setBusy(false);
      setMenuFor(null);
    }
  }

  function toggleSelected(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitInvite(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (inviteRoles.length === 0) {
      setInviteError('Give the account at least one role.');
      return;
    }
    setBusy(true);
    setInviteError(null);
    try {
      const result = await api.inviteStaff({
        email: inviteEmail.trim(),
        displayName: inviteName.trim(),
        roles: inviteRoles,
      });
      setInviteLink(
        `${window.location.origin}/accept-invite?token=${encodeURIComponent(result.inviteToken)}`,
      );
      setInviteExpiresAt(result.expiresAt);
      staff.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setInviteError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  function closeInvite(): void {
    setInviteOpen(false);
    setInviteLink(null);
    setInviteExpiresAt(null);
    setInviteError(null);
    setInviteEmail('');
    setInviteName('');
    setInviteRoles(['sales-agent']);
  }

  async function submitEdit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!editFor) return;
    setBusy(true);
    setRowError(null);
    try {
      await api.updateStaffProfile(editFor.id, { displayName: editName.trim() });
      setNotice(`Display name updated for ${editFor.email}.`);
      setEditFor(null);
      staff.reload();
    } catch (caught) {
      fail(caught, editFor.email);
    } finally {
      setBusy(false);
    }
  }

  async function submitRoles(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!rolesFor) return;
    if (rolesDraft.length === 0) {
      setRowError(`${rolesFor.email}: an account needs at least one role.`);
      return;
    }
    setBusy(true);
    setRowError(null);
    try {
      await api.setStaffRoles(rolesFor.id, { roles: rolesDraft });
      setNotice(`Roles updated for ${rolesFor.email}.`);
      setRolesFor(null);
      staff.reload();
    } catch (caught) {
      fail(caught, rolesFor.email);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <ModuleHeader
        icon={UsersRound}
        title="Staff Management"
        description="Real admin accounts for the Dostelo portal, with their roles, MFA state and live sessions. Only accounts returned by the API are shown."
      >
        <button type="button" className="btn-secondary" onClick={() => setMatrixOpen(true)}>
          <ShieldCheck size={15} /> Roles and Permissions
        </button>
        <button type="button" className="btn" onClick={() => setInviteOpen(true)}>
          <UserPlus size={15} /> Invite Staff Member
        </button>
      </ModuleHeader>

      <div className="kpi-grid">
        <KpiCard icon={UsersRound} label="Total Staff" value={staff.data ? String(items.length) : '...'} note="Accounts returned by the API" tone="purple" />
        <KpiCard icon={UserCheck} label="Active Staff" value={staff.data ? String(activeCount) : '...'} note="Can sign in now" tone="green" />
        <KpiCard icon={UserX} label="Inactive Staff" value={staff.data ? String(inactiveCount) : '...'} note="Deactivated or awaiting invite acceptance" tone="orange" />
        <KpiCard icon={Crown} label="Admin Users" value={staff.data ? String(adminCount) : '...'} note="Admin-level roles per the matrix: Super Admin or Store Manager" tone="blue" />
      </div>

      <StatusTabs
        tabs={[
          { key: 'all', label: 'All Staff', count: items.length },
          { key: 'active', label: 'Active', count: activeCount },
          { key: 'inactive', label: 'Inactive', count: inactiveCount },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="card filter-card">
        <div className="filter-row">
          <label className="field">
            Search
            <input
              className="input"
              placeholder="Name, email or role"
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
          <div className="filter-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearch('');
                setRoleFilter('');
                setTab('all');
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {rowError ? (
        <p className="form-error" role="alert">
          {rowError}
        </p>
      ) : null}
      {notice ? (
        <p className="note" role="status">
          {notice}
        </p>
      ) : null}

      <div className="card">
        <CardHead icon={UsersRound} title="Staff Directory" />
        {staff.loading ? <LoadingNote label="Loading staff..." /> : null}
        {staff.error ? <ErrorNote error={staff.error} onRetry={staff.reload} /> : null}
        {staff.data && filtered.length === 0 ? (
          <EmptyNote>No staff accounts match these filters.</EmptyNote>
        ) : null}
        {staff.data && filtered.length > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={pageRows.length > 0 && pageRows.every((member) => selected.has(member.id))}
                        onChange={(event) => {
                          setSelected((current) => {
                            const next = new Set(current);
                            for (const member of pageRows) {
                              if (event.target.checked) next.add(member.id);
                              else next.delete(member.id);
                            }
                            return next;
                          });
                        }}
                      />
                    </th>
                    <th>Staff member</th>
                    <th>Email</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>MFA</th>
                    <th>Last Active</th>
                    <th className="num">Sessions</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${member.displayName}`}
                          checked={selected.has(member.id)}
                          onChange={() => toggleSelected(member.id)}
                        />
                      </td>
                      <td>
                        <span className="identity-cell">
                          <span className="avatar-initials">{initials(member.displayName)}</span>
                          <span>
                            <span className="identity-main">
                              {member.displayName}
                              {member.id === myId ? (
                                <>
                                  {' '}
                                  <Badge>You</Badge>
                                </>
                              ) : null}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>{member.email}</td>
                      <td>
                        <RoleChips roles={member.roles} />
                      </td>
                      <td>
                        <span className={`band-chip ${member.isActive ? 'green' : 'grey'}`}>
                          {member.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        {member.mfaEnabled ? (
                          <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                            <ShieldCheck size={14} /> On
                          </span>
                        ) : (
                          'Off'
                        )}
                      </td>
                      <td>{member.lastActiveAt ? formatDateTime(member.lastActiveAt) : '-'}</td>
                      <td className="num">{member.activeSessions}</td>
                      <td>{formatDateTime(member.createdAt)}</td>
                      <td>
                        <div style={{ position: 'relative' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            aria-label={`Actions for ${member.displayName}`}
                            onClick={() => setMenuFor(menuFor === member.id ? null : member.id)}
                          >
                            <MoreHorizontal size={15} />
                          </button>
                          {menuFor === member.id ? (
                            <div
                              className="card"
                              style={{ position: 'absolute', right: 0, top: '110%', zIndex: 5, minWidth: 220, padding: 10 }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-small"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setProfileFor(member);
                                  }}
                                >
                                  View Profile
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-small"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setEditName(member.displayName);
                                    setEditFor(member);
                                  }}
                                >
                                  Edit Details
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-small"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setRolesDraft(member.roles);
                                    setRolesFor(member);
                                  }}
                                >
                                  Change Roles
                                </button>
                                {member.isActive ? (
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-small"
                                    disabled={busy || member.id === myId}
                                    title={member.id === myId ? 'You cannot deactivate your own account' : undefined}
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          `Deactivate ${member.displayName}? Deactivation revokes all of their sessions immediately and blocks new sign-ins.`,
                                        )
                                      )
                                        return;
                                      void runAction(member, () => api.deactivateStaff(member.id));
                                    }}
                                  >
                                    Deactivate
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-small"
                                    disabled={busy}
                                    onClick={() =>
                                      void runAction(member, () => api.activateStaff(member.id))
                                    }
                                  >
                                    Activate
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-small"
                                  disabled={busy || member.activeSessions === 0}
                                  onClick={() => {
                                    if (
                                      !window.confirm(
                                        `Force logout ${member.displayName}? Every live session for this account will be revoked.`,
                                      )
                                    )
                                      return;
                                    void runAction(
                                      member,
                                      () => api.revokeStaffSessions(member.id),
                                      `All sessions revoked for ${member.email}.`,
                                    );
                                  }}
                                >
                                  <LogOut size={13} /> Force Logout
                                </button>
                              </div>
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
                Showing {pageRows.length} of {filtered.length} staff
                {selected.size > 0 ? `, ${selected.size} selected` : ''}
              </span>
              <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={setPage} />
            </div>
          </>
        ) : null}
      </div>

      {profileFor ? (
        <Drawer title={profileFor.displayName} onClose={() => setProfileFor(null)}>
          <span className="identity-cell" style={{ marginBottom: 14 }}>
            <span className="avatar-initials">{initials(profileFor.displayName)}</span>
            <span>
              <span className="identity-main">
                {profileFor.displayName}
                {profileFor.id === myId ? (
                  <>
                    {' '}
                    <Badge>You</Badge>
                  </>
                ) : null}
              </span>
              <span className="identity-sub" style={{ display: 'block' }}>
                {profileFor.email}
              </span>
            </span>
          </span>
          <dl className="kv">
            <dt>Roles</dt>
            <dd>
              <RoleChips roles={profileFor.roles} />
            </dd>
            <dt>Status</dt>
            <dd>{profileFor.isActive ? 'Active' : 'Inactive'}</dd>
            <dt>MFA</dt>
            <dd>
              {profileFor.mfaEnabled ? (
                <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  <ShieldCheck size={14} /> On
                </span>
              ) : (
                'Off'
              )}
            </dd>
            <dt>Live sessions</dt>
            <dd>{profileFor.activeSessions}</dd>
            <dt>Last active</dt>
            <dd>{profileFor.lastActiveAt ? formatDateTime(profileFor.lastActiveAt) : '-'}</dd>
            <dt>Created</dt>
            <dd>{formatDateTime(profileFor.createdAt)}</dd>
            <dt>Updated</dt>
            <dd>{formatDateTime(profileFor.updatedAt)}</dd>
          </dl>
          <p className="note muted">
            Password reset is not available: the API has no reset endpoint for staff
            accounts. New accounts set their own password through the one-time invite
            link instead.
          </p>
          <StaffAuditActivity actorId={profileFor.id} />
        </Drawer>
      ) : null}

      {editFor ? (
        <Modal title="Edit Details" onClose={() => setEditFor(null)}>
          <form onSubmit={submitEdit}>
            <p className="note muted" style={{ marginTop: 0 }}>
              {editFor.email}
            </p>
            <label className="field">
              Display name
              <input
                className="input"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn" style={{ marginTop: 14 }} disabled={busy || !editName.trim()}>
              {busy ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </Modal>
      ) : null}

      {rolesFor ? (
        <Modal title="Change Roles" onClose={() => setRolesFor(null)}>
          <form onSubmit={submitRoles}>
            <p className="note muted" style={{ marginTop: 0 }}>
              Roles for {rolesFor.email}. Assigning Super Admin requires a super admin
              actor, and the API enforces that server-side even if this form is used by
              someone else.
            </p>
            <RoleCheckboxes value={rolesDraft} onChange={setRolesDraft} disabled={busy} />
            <button type="submit" className="btn" style={{ marginTop: 14 }} disabled={busy || rolesDraft.length === 0}>
              {busy ? 'Saving...' : 'Save roles'}
            </button>
          </form>
        </Modal>
      ) : null}

      {matrixOpen ? (
        <Modal title="Roles and Permissions" onClose={() => setMatrixOpen(false)}>
          <p className="note muted" style={{ marginTop: 0 }}>
            This matrix is read-only. It renders the enforced code matrix from
            ROLE_PERMISSIONS in the shared types package, exactly as the Security page
            does. Making the matrix editable stored configuration was not shipped in
            this pass. The Super Admin row is locked: it always holds every permission.
          </p>
          <RolesMatrixTable />
        </Modal>
      ) : null}

      {inviteOpen ? (
        <Modal title="Invite Staff Member" onClose={closeInvite}>
          {inviteLink ? (
            <div>
              <p style={{ lineHeight: 1.6 }}>
                Invite created. Copy this one-time link now and hand it to the invitee
                directly: it is shown only once here and nothing is emailed, because no
                email provider is configured.
              </p>
              <dl className="kv">
                <dt>Invite link</dt>
                <dd>
                  <code style={{ overflowWrap: 'anywhere' }}>{inviteLink}</code>
                </dd>
                <dt>Expires</dt>
                <dd>{inviteExpiresAt ? formatDateTime(inviteExpiresAt) : '72 hours after creation'}</dd>
              </dl>
              <p className="note muted">
                The account cannot sign in until the password is set through this link.
                The token expires in 72 hours and is single-use.
              </p>
              <button type="button" className="btn" onClick={closeInvite}>
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submitInvite}>
              <p className="note muted" style={{ marginTop: 0 }}>
                The account is created inactive. The invitee sets their own password
                through a one-time link; the account cannot sign in until then. The
                token expires in 72 hours, is single-use, and nothing is emailed
                because no email provider is configured.
              </p>
              <label className="field">
                Email
                <input
                  className="input"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  required
                />
              </label>
              <label className="field" style={{ marginTop: 10 }}>
                Display name
                <input
                  className="input"
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                  required
                />
              </label>
              <div style={{ marginTop: 12 }}>
                <div className="note muted" style={{ margin: '0 0 6px' }}>
                  Roles
                </div>
                <RoleCheckboxes value={inviteRoles} onChange={setInviteRoles} disabled={busy} />
              </div>
              {inviteError ? (
                <p className="form-error" role="alert">
                  {inviteError}
                </p>
              ) : null}
              <button type="submit" className="btn" style={{ marginTop: 14 }} disabled={busy}>
                {busy ? 'Sending invite...' : 'Create invite'}
              </button>
            </form>
          )}
        </Modal>
      ) : null}
    </section>
  );
}
