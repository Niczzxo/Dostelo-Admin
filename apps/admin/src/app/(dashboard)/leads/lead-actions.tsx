'use client';

import { useState, type FormEvent } from 'react';
import { ActionError, Field, SelectInput, TextInput } from '../../../components/ui';
import { useAction } from '../../../lib/use-data';
import type { StaffOption } from '../../../lib/staff-directory';

/* Lead action forms shared by the lead list and the lead detail
   page: assign, status change, follow-up task and contact attempt.
   Every form posts to the leads API and reports the API answer;
   a contact attempt against a Do Not Contact lead is refused by
   the API with 403 and that refusal is shown, never hidden. */

export function AssignLeadForm({
  leadId,
  staff,
  onDone,
}: {
  leadId: string;
  staff: StaffOption[];
  onDone: () => void;
}) {
  const action = useAction();
  const [assigneeId, setAssigneeId] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.assignLead(leadId, { assigneeId }))) onDone();
  }
  return (
    <form onSubmit={submit}>
      <ActionError error={action.error} />
      <Field label="Assign to">
        {staff.length > 0 ? (
          <SelectInput required value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Select a staff member</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </SelectInput>
        ) : (
          <TextInput required value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} placeholder="Staff ID from Staff Management" />
        )}
      </Field>
      <button type="submit" className="btn" disabled={action.busy}>Assign lead</button>
    </form>
  );
}

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost', 'do-not-contact'];

export function LeadStatusForm({ leadId, current, onDone }: { leadId: string; current: string; onDone: () => void }) {
  const action = useAction();
  const [status, setStatus] = useState(current);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.changeLeadStatus(leadId, { status }))) onDone();
  }
  return (
    <form onSubmit={submit}>
      <ActionError error={action.error} />
      <Field label="Status">
        <SelectInput value={status} onChange={(e) => setStatus(e.target.value)}>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </SelectInput>
      </Field>
      <button type="submit" className="btn" disabled={action.busy}>Save status</button>
    </form>
  );
}

export function FollowUpForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const action = useAction();
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = { title };
    if (dueAt) dto.dueAt = new Date(dueAt).toISOString();
    if (await action.run((c) => c.createFollowUpTask(leadId, dto))) onDone();
  }
  return (
    <form onSubmit={submit}>
      <ActionError error={action.error} />
      <Field label="Task">
        <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call back about the viewed product" />
      </Field>
      <Field label="Due (optional)">
        <TextInput type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </Field>
      <button type="submit" className="btn" disabled={action.busy}>Add follow-up</button>
    </form>
  );
}

export function ContactAttemptForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const action = useAction();
  const [channel, setChannel] = useState('call');
  const [result, setResult] = useState('');
  const [purpose, setPurpose] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run((c) =>
      c.recordContactAttempt(leadId, { channel, result, purpose }),
    );
    if (ok) onDone();
  }
  return (
    <form onSubmit={submit}>
      <ActionError error={action.error} />
      <p className="note">
        Attempts are recorded with staff, time, channel, purpose and result. If this lead is marked
        Do Not Contact, the API refuses the attempt and the refusal is shown here.
      </p>
      <div className="form-grid">
        <Field label="Channel">
          <SelectInput value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="call">Call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </SelectInput>
        </Field>
        <Field label="Result">
          <TextInput required value={result} onChange={(e) => setResult(e.target.value)} placeholder="Reached, no answer, asked to stop" />
        </Field>
      </div>
      <Field label="Purpose">
        <TextInput required value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Order help, cart follow-up, product question" />
      </Field>
      <button type="submit" className="btn" disabled={action.busy}>Record attempt</button>
    </form>
  );
}
