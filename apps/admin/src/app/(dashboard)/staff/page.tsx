'use client';

import { useState, type FormEvent } from 'react';
import { MailPlus, Plus, UsersRound } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, LoadingNote, Modal,
  ModuleHeader, SelectInput, TextInput,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { itemsOf, str } from '../../../lib/types';

/* Staff Management: accounts from GET /v1/admin/staff. Invite
   sends an invite the invitee accepts by setting their own
   password on /accept-invite; direct creation sets a temporary
   password the staff member changes after first sign in (the
   password is typed here by the manager and sent only to the
   API, never stored by this page). Roles are assigned from the
   roles matrix; the matrix itself is shown under Security &
   Access. Deactivation and session revocation are immediate. */
const ROLES = [
  'super-admin', 'store-manager', 'crm-manager', 'sales-agent', 'support-agent',
  'product-manager', 'accountant', 'delivery-manager', 'marketing-manager', 'analyst',
];

export default function StaffPage() {
  const staff = useData((c) => c.listStaff());
  const action = useAction();
  const [mode, setMode] = useState<'none' | 'create' | 'invite'>('none');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: ROLES[1] });
  const [roleEdit, setRoleEdit] = useState<{ id: string; role: string } | null>(null);

  const items = itemsOf(staff.data);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { name: form.name, email: form.email, roles: [form.role] };
    if (mode === 'create') dto.password = form.password;
    const ok = mode === 'invite'
      ? await action.run((c) => c.inviteStaff(dto))
      : await action.run((c) => c.createStaff(dto));
    if (ok) {
      setMode('none');
      staff.reload();
    }
  }

  async function saveRoles(event: FormEvent) {
    event.preventDefault();
    if (!roleEdit) return;
    if (await action.run((c) => c.setStaffRoles(roleEdit.id, { roles: [roleEdit.role] }))) {
      setRoleEdit(null);
      staff.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={UsersRound}
        title="Staff Management"
        description="Staff accounts and role assignment. Invites are accepted by the invitee setting their own password; nothing here can read a password back."
      >
        <button type="button" className="btn secondary" onClick={() => setMode('invite')}>
          <MailPlus size={15} /> Invite staff
        </button>
        <button type="button" className="btn" onClick={() => setMode('create')}>
          <Plus size={15} /> Create account
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <Card title="Staff accounts">
        {staff.loading ? (
          <LoadingNote />
        ) : staff.error ? (
          <ErrorNote error={staff.error} onRetry={staff.reload} />
        ) : (
          <DataTable
            emptyText="No staff accounts returned by the API."
            columns={[
              { key: 'name', label: 'Name', render: (r) => str(r.name ?? r.email) },
              { key: 'email', label: 'Email' },
              { key: 'roles', label: 'Roles', render: (r) => (Array.isArray(r.roles) ? r.roles.map((x) => str(x)).join(', ') : str(r.roles)) },
              { key: 'active', label: 'State', render: (r) => <Badge tone={r.active === false || str(r.status) === 'deactivated' ? 'warn' : 'ok'}>{r.active === false || str(r.status) === 'deactivated' ? 'Deactivated' : 'Active'}</Badge> },
              { key: 'mfaEnabled', label: 'MFA', render: (r) => (r.mfaEnabled === true ? 'Enabled' : 'Not enabled') },
              {
                key: 'actions', label: 'Actions',
                render: (r) => (
                  <span className="btn-row">
                    <button type="button" className="btn secondary small" onClick={() => setRoleEdit({ id: str(r.id), role: Array.isArray(r.roles) ? str(r.roles[0]) : ROLES[1] })}>Roles</button>
                    {r.active === false || str(r.status) === 'deactivated' ? (
                      <button type="button" className="btn secondary small" disabled={action.busy} onClick={async () => { if (await action.run((c) => c.activateStaff(str(r.id)))) staff.reload(); }}>Activate</button>
                    ) : (
                      <button type="button" className="btn secondary small" disabled={action.busy} onClick={async () => { if (await action.run((c) => c.deactivateStaff(str(r.id)))) staff.reload(); }}>Deactivate</button>
                    )}
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={action.busy}
                      onClick={async () => { await action.run((c) => c.revokeStaffSessions(str(r.id))); }}
                    >
                      Force logout
                    </button>
                  </span>
                ),
              },
            ]}
            rows={items}
          />
        )}
      </Card>

      {mode !== 'none' ? (
        <Modal title={mode === 'invite' ? 'Invite a staff member' : 'Create a staff account'} onClose={() => setMode('none')}>
          <form onSubmit={submit}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="Name">
                <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email">
                <TextInput type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Role">
                <SelectInput value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </SelectInput>
              </Field>
              {mode === 'create' ? (
                <Field label="Temporary password" hint="(share it privately; it is sent only to the API)">
                  <TextInput type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
                </Field>
              ) : null}
            </div>
            <p className="note">
              {mode === 'invite'
                ? 'The invitee receives an invite link and sets their own password on the accept-invite page.'
                : 'The account is active immediately with the temporary password above.'}
            </p>
            <button type="submit" className="btn" disabled={action.busy}>
              {mode === 'invite' ? 'Send invite' : 'Create account'}
            </button>
          </form>
        </Modal>
      ) : null}

      {roleEdit ? (
        <Modal title="Assign roles" onClose={() => setRoleEdit(null)}>
          <form onSubmit={saveRoles}>
            <ActionError error={action.error} />
            <Field label="Primary role">
              <SelectInput value={roleEdit.role} onChange={(e) => setRoleEdit({ ...roleEdit, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </SelectInput>
            </Field>
            <p className="note">Effective permissions follow the roles matrix under Security & Access and are enforced by the API on every request.</p>
            <button type="submit" className="btn" disabled={action.busy}>Save roles</button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
