/**
 * Automation inventory (admin master structure module 14:
 * Automation & Workflow Engine). This is a read-only inventory
 * of the automations that actually run in the platform, with
 * their triggers and current settings. There is no general
 * workflow engine in the platform and none is presented: each
 * entry names the subsystem that performs the work.
 */
export interface AutomationInfo {
  key: string;
  name: string;
  /** The subsystem that runs it, in plain words. */
  runsIn: string;
  trigger: string;
  /** 'active' when the subsystem runs it today; 'not-configured'
   * when a provider it depends on is missing. */
  status: 'active' | 'not-configured';
  detail: string | null;
  /** Admin route holding the editable settings, when it has any. */
  settingsHref: string | null;
}
