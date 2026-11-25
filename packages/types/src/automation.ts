/**
 * Automation inventory (admin master structure module 14:
 * Automation & Workflow Engine). This is an inventory of the
 * automations that actually run in the platform, with their
 * triggers and current settings. There is no general workflow
 * engine in the platform and none is presented: each entry
 * names the subsystem that performs the work.
 */
export interface AutomationInfo {
  key: string;
  name: string;
  /** The subsystem that runs it, in plain words. */
  runsIn: string;
  trigger: string;
  /** 'active' when the subsystem runs it today; 'paused' when
   * its persisted enable flag is off; 'not-configured' when a
   * provider it depends on is missing. */
  status: 'active' | 'paused' | 'not-configured';
  detail: string | null;
  /** Admin route holding the editable settings, when it has any. */
  settingsHref: string | null;
  /** Whether this flow can be paused from the portal. Flows
   * whose pause would break a correctness rule (recovery
   * completion on purchase, COD payment sync) are not pausable
   * and say so in their detail text. */
  canPause: boolean;
  /** Executions recorded in the last 30 days, from the
   * execution log the flows themselves write. Null when the
   * flow has no logging yet: unavailable, never shown as zero. */
  executions30d: number | null;
  /** Share of recorded executions that succeeded, last 30
   * days. Null when there are no records to rate. */
  successRate30d: number | null;
}

/**
 * One recorded automation execution, written by the flow itself
 * as it runs (Automation redesign). The log starts at the
 * deployment that introduces it; nothing is backfilled, and the
 * portal shows history only from that point. Payloads are
 * summaries: no secrets and no customer contact details are
 * ever written here.
 */
export interface AutomationExecution {
  id: string;
  workflowKey: string;
  /** The entity the run acted on, as a type and id pair (an
   * abandoned cart, a lead, an order), never contact data. */
  entityType: string;
  entityId: string;
  status: 'success' | 'failed';
  /** What happened, in plain words (an outcome or an error). */
  detail: string;
  startedAt: string;
  completedAt: string;
}
