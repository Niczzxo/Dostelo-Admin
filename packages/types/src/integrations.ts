/**
 * Integration status board (admin master structure module 23:
 * System Settings & Integrations). Each entry is computed from
 * the API's own provider configuration checks, the same checks
 * the providers themselves run before attempting anything. Only
 * the names of missing environment variables are ever reported;
 * no secret value leaves the API.
 */
export type IntegrationCategory = 'payments' | 'communications' | 'shipping';

export const INTEGRATION_CATEGORY_LABELS: Record<
  IntegrationCategory,
  string
> = {
  payments: 'Payments',
  communications: 'Communications',
  shipping: 'Shipping & Courier',
};

/**
 * The result of one integration check (Integrations redesign).
 * The check is truthful by construction: an unconfigured
 * integration reports not-configured with its missing variable
 * names; an internal integration (COD, manual banking) reports
 * its internal flow state; a configured external integration
 * reports that its credentials are present. No live probe is
 * performed against a provider, and the result never claims one.
 */
export interface IntegrationTestResult {
  key: string;
  configured: boolean;
  checkedAt: string;
  detail: string;
  missing: string[];
}

export interface IntegrationStatus {
  key: string;
  name: string;
  category: IntegrationCategory;
  configured: boolean;
  /** Names of the environment variables still missing. Empty
   * when configured. */
  missing: string[];
  note: string | null;
}
