/* Local wire types for the admin portal, fresh rebuild 2026-11-28.
   These mirror the shared @dostelo/types contracts documented in
   git history (packages/types at the previous build) so the portal
   compiles and typechecks on its own while the shared packages are
   rebuilt in parallel. Field shapes follow the API responses; the
   portal treats every record as a typed record plus unknown extra
   fields rather than inventing data the API did not send. */

export type PermissionKey =
  | 'dashboard.read' | 'buyers.read' | 'buyers.contact'
  | 'customers.read' | 'customers.create' | 'customers.edit' | 'customers.export'
  | 'leads.read' | 'leads.create' | 'leads.edit' | 'leads.assign' | 'leads.contact'
  | 'recovery.read' | 'recovery.edit' | 'communications.read'
  | 'orders.read' | 'orders.create' | 'orders.edit' | 'orders.export'
  | 'products.read' | 'products.create' | 'products.edit' | 'products.delete'
  | 'inventory.read' | 'inventory.adjust'
  | 'payments.read' | 'payments.verify' | 'payments.refund' | 'payments.export'
  | 'shipping.read' | 'shipping.edit'
  | 'marketing.read' | 'marketing.edit'
  | 'reports.read' | 'reports.export'
  | 'staff.manage' | 'roles.manage' | 'settings.manage' | 'audit.read';

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface AuthPrincipalView {
  type: 'customer' | 'admin';
  id: string;
  roles: string[];
  permissions: PermissionKey[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  principal: AuthPrincipalView;
}

export interface MfaChallenge {
  mfaRequired: true;
  challengeId: string;
  expiresAt: string;
}

export type AdminLoginResult = AuthTokens | MfaChallenge;

export function isMfaChallenge(result: AdminLoginResult): result is MfaChallenge {
  return 'mfaRequired' in result && result.mfaRequired === true;
}

/** A record as the API returns it. Pages read only the fields the
 * API contract documents and render missing fields as blank. */
export type Rec = Record<string, unknown>;

export function asRec(value: unknown): Rec {
  return value && typeof value === 'object' ? (value as Rec) : {};
}

export function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function itemsOf(value: unknown): Rec[] {
  if (Array.isArray(value)) return value.map(asRec);
  const rec = asRec(value);
  if (Array.isArray(rec.items)) return rec.items.map(asRec);
  return [];
}
