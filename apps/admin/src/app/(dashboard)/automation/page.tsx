'use client';

import { useState, type FormEvent } from 'react';
import { Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, LoadingNote, Modal,
  ModuleHeader, SelectInput, StatCard, StatGrid, StatusBadge, TextInput, Unavailable,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../lib/types';

interface StepDraft {
  type: string;
  condition: string;
  action: string;
  value: string;
}

const TRIGGERS = [
  'cart-abandoned', 'order-placed', 'order-delivered', 'payment-failed',
  'lead-created', 'lead-score-threshold', 'support-ticket-opened', 'stock-low', 'manual',
];
const STEP_TYPES = ['action', 'condition', 'delay', 'score-threshold'];
const STEP_ACTIONS = [
  'send-whatsapp', 'send-email', 'send-sms', 'create-follow-up', 'assign-lead',
  'add-tag', 'notify-staff', 'run-recovery-step', 'wait',
];

/* Automation: a real workflow builder plus the stored system
   automations. Workflows are created and edited here with a custom
   trigger, branching steps (a condition step branches to its
   action or the next step) and stored scoring thresholds, then
   saved through the workflow endpoints. The execution log lists
   real runs with a retry action. Two correctness rules are shown
   as non-pausable, as ordered: cart recovery completion and COD
   payment sync are never offered a pause switch. When the running
   API does not provide the workflow endpoints yet, the builder
   says so and saves nothing silently. */
const NON_PAUSABLE = [
  { key: 'recovery-completion', label: 'Cart recovery completion', note: 'Correctness rule: a recovery that completes must always close and attribute correctly.' },
  { key: 'cod-payment-sync', label: 'COD payment sync', note: 'Correctness rule: cash on delivery state must always sync into the order and payment records.' },
];

export default function AutomationPage() {
  const automations = useData((c) => c.listAutomations());
  const executions = useData((c) => c.listAutomationExecutions({}));
  const workflows = useData((c) => c.gap.listWorkflows());
  const action = useAction();
  const [building, setBuilding] = useState(false);
  const [workflowId, setWorkflowId] = useState('');
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState(TRIGGERS[0]);
  const [threshold, setThreshold] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([
    { type: 'condition', condition: 'leadScore >= threshold', action: 'send-whatsapp', value: '' },
  ]);

  const automationItems = itemsOf(automations.data);
  const executionItems = itemsOf(executions.data);
  const workflowItems = workflows.data ? itemsOf(workflows.data) : [];

  function openWorkflow(row?: Record<string, unknown>) {
    if (row) {
      setWorkflowId(str(row.id));
      setName(str(row.name));
      setTrigger(str(row.trigger) || TRIGGERS[0]);
      setThreshold(String(row.threshold ?? ''));
      const stored = Array.isArray(row.steps) ? row.steps : [];
      setSteps(
        stored.length
          ? stored.map((s) => {
              const rec = asRec(s);
              return {
                type: str(rec.type) || 'action',
                condition: str(rec.condition),
                action: str(rec.action),
                value: str(rec.value),
              };
            })
          : [{ type: 'action', condition: '', action: 'send-whatsapp', value: '' }],
      );
    } else {
      setWorkflowId('');
      setName('');
      setTrigger(TRIGGERS[0]);
      setThreshold('');
      setSteps([{ type: 'condition', condition: 'leadScore >= threshold', action: 'send-whatsapp', value: '' }]);
    }
    setBuilding(true);
  }

  async function saveWorkflow(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = {
      name, trigger, steps,
    };
    if (threshold) dto.threshold = Number(threshold);
    const ok = workflowId
      ? await action.run((c) => c.gap.updateWorkflow(workflowId, dto))
      : await action.run((c) => c.gap.saveWorkflow(dto));
    if (ok) {
      setBuilding(false);
      workflows.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Zap}
        title="Automation"
        description="Workflow builder with custom triggers, branching steps and stored scoring thresholds, the system automations, and the execution log with retry."
      >
        <button type="button" className="btn" onClick={() => openWorkflow()}>
          <Plus size={15} /> New workflow
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="System automations" value={automations.loading ? '...' : String(automationItems.length)} />
        <StatCard label="Custom workflows" value={workflows.data === null ? 'Unavailable' : String(workflowItems.length)} />
        <StatCard label="Executions (loaded)" value={executions.loading ? '...' : String(executionItems.length)} />
        <StatCard label="Failed executions" value={String(executionItems.filter((r) => str(r.status) === 'failed').length)} />
      </StatGrid>

      <Card title="Custom workflows">
        {workflows.loading ? (
          <LoadingNote />
        ) : workflows.data === null ? (
          <Unavailable title="Workflow endpoints are not available on the running API yet.">
            The builder needs GET, POST and PUT /v1/admin/automation/workflows. The builder form
            still opens so the workflow can be designed, but saving reports the missing contract
            instead of pretending the workflow was stored.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No custom workflows yet. Create the first one with the builder."
            columns={[
              { key: 'name', label: 'Workflow' },
              { key: 'trigger', label: 'Trigger' },
              { key: 'steps', label: 'Steps', render: (r) => String(Array.isArray(r.steps) ? r.steps.length : 0) },
              { key: 'threshold', label: 'Score threshold' },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status ?? (r.enabled === false ? 'paused' : 'active')} /> },
              {
                key: 'edit', label: 'Action',
                render: (r) => (
                  <button type="button" className="btn secondary small" onClick={() => openWorkflow(r)}>Edit in builder</button>
                ),
              },
            ]}
            rows={workflowItems}
          />
        )}
      </Card>

      <Card title="System automations">
        {automations.loading ? (
          <LoadingNote />
        ) : automations.error ? (
          <ErrorNote error={automations.error} onRetry={automations.reload} />
        ) : (
          <>
            <DataTable
              searchable={false}
              emptyText="No system automations returned by the API."
              columns={[
                { key: 'key', label: 'Automation' },
                { key: 'name', label: 'Name', render: (r) => str(r.name ?? r.label ?? r.key) },
                { key: 'enabled', label: 'State', render: (r) => <Badge tone={r.enabled === false ? 'warn' : 'ok'}>{r.enabled === false ? 'Paused' : 'Active'}</Badge> },
                {
                  key: 'toggle', label: 'Action',
                  render: (r) => (
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={action.busy}
                      onClick={async () => {
                        if (await action.run((c) => c.setAutomationEnabled(str(r.key), r.enabled === false))) automations.reload();
                      }}
                    >
                      {r.enabled === false ? 'Activate' : 'Pause'}
                    </button>
                  ),
                },
              ]}
              rows={automationItems}
            />
            <h3 style={{ marginTop: 16 }}>Non-pausable correctness rules</h3>
            <ul className="timeline">
              {NON_PAUSABLE.map((rule) => (
                <li key={rule.key}>
                  <div>
                    <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{rule.label} <Badge tone="dark">Always on</Badge></div>
                    <div className="note">{rule.note}</div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card title="Execution log">
        {executions.loading ? (
          <LoadingNote />
        ) : executions.error ? (
          <ErrorNote error={executions.error} onRetry={executions.reload} />
        ) : (
          <DataTable
            emptyText="No automation executions recorded yet."
            columns={[
              { key: 'id', label: 'Execution', render: (r) => str(r.id).slice(0, 10) },
              { key: 'automationKey', label: 'Automation', render: (r) => str(r.automationKey ?? r.workflowName ?? r.key) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'error', label: 'Error', render: (r) => str(r.error ?? r.message) },
              { key: 'startedAt', label: 'Started', date: true },
              {
                key: 'retry', label: 'Action',
                render: (r) => str(r.status) === 'failed' ? (
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={action.busy}
                    onClick={async () => {
                      const res = await action.run((c) => c.gap.retryExecution(str(r.id)));
                      if (res) executions.reload();
                    }}
                  >
                    <RotateCcw size={13} /> Retry
                  </button>
                ) : <span className="note">No retry needed</span>,
              },
            ]}
            rows={executionItems}
          />
        )}
        <p className="note">
          Retry posts to the execution retry endpoint. When the running API does not provide it,
          the error is shown above instead of a fake success.
        </p>
      </Card>

      {building ? (
        <Modal title={workflowId ? 'Edit workflow' : 'Workflow builder'} onClose={() => setBuilding(false)} wide>
          <form onSubmit={saveWorkflow}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="Workflow name">
                <TextInput required value={name} onChange={(e) => setName(e.target.value)} placeholder="Hot lead fast follow-up" />
              </Field>
              <Field label="Trigger">
                <SelectInput value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                  {TRIGGERS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Scoring threshold (optional)" hint="(stored on the workflow, used by condition steps)">
                <TextInput type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="70" />
              </Field>
            </div>
            <h3>Steps</h3>
            <div className="workflow-canvas">
              <div className="workflow-node">
                <strong>Trigger:</strong> {trigger}
                {threshold ? <span className="note"> with stored threshold {threshold}</span> : null}
              </div>
              {steps.map((step, index) => (
                <div key={index}>
                  <div className="workflow-arrow">then</div>
                  <div className="workflow-node">
                    <div className="form-grid">
                      <Field label={`Step ${index + 1} type`}>
                        <SelectInput value={step.type} onChange={(e) => setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, type: e.target.value } : s)))}>
                          {STEP_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label="Condition (for branching steps)">
                        <TextInput value={step.condition} onChange={(e) => setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, condition: e.target.value } : s)))} placeholder="leadScore >= threshold" />
                      </Field>
                      <Field label="Action">
                        <SelectInput value={step.action} onChange={(e) => setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, action: e.target.value } : s)))}>
                          {STEP_ACTIONS.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label="Value (template key, minutes, tag)">
                        <TextInput value={step.value} onChange={(e) => setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, value: e.target.value } : s)))} />
                      </Field>
                    </div>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={13} /> Remove step
                    </button>
                    {step.type === 'condition' ? (
                      <p className="note">
                        Branching: when the condition is true this step action runs; when false the
                        workflow continues to the next step without it.
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setSteps((prev) => [...prev, { type: 'action', condition: '', action: 'notify-staff', value: '' }])}
              >
                <Plus size={14} /> Add step
              </button>
              <button type="submit" className="btn" disabled={action.busy}>
                {workflowId ? 'Save workflow changes' : 'Create workflow'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
