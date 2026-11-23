/**
 * Admin roles from the admin master structure roles matrix,
 * in matrix order.
 */
export const ADMIN_ROLES = [
  'super-admin',
  'store-manager',
  'crm-manager',
  'sales-agent',
  'support-agent',
  'product-manager',
  'accountant',
  'delivery-manager',
  'marketing-manager',
  'analyst',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  'super-admin': 'Super Admin',
  'store-manager': 'Store Manager',
  'crm-manager': 'CRM Manager',
  'sales-agent': 'Sales Agent',
  'support-agent': 'Support Agent',
  'product-manager': 'Product Manager',
  accountant: 'Accountant',
  'delivery-manager': 'Delivery Manager',
  'marketing-manager': 'Marketing Manager',
  analyst: 'Analyst',
};

/**
 * Permission keys use the module.action form. The action set follows
 * the admin master structure: View, Create, Edit, Delete, Export,
 * Approve, Refund, Contact and Assign, expressed in key form.
 */
export type PermissionKey =
  | 'dashboard.read'
  | 'buyers.read'
  | 'buyers.contact'
  | 'customers.read'
  | 'customers.create'
  | 'customers.edit'
  | 'customers.export'
  | 'leads.read'
  | 'leads.create'
  | 'leads.edit'
  | 'leads.assign'
  | 'leads.contact'
  | 'recovery.read'
  | 'recovery.edit'
  | 'communications.read'
  | 'orders.read'
  | 'orders.create'
  | 'orders.edit'
  | 'orders.export'
  | 'products.read'
  | 'products.create'
  | 'products.edit'
  | 'products.delete'
  | 'inventory.read'
  | 'inventory.adjust'
  | 'payments.read'
  | 'payments.verify'
  | 'payments.refund'
  | 'payments.export'
  | 'shipping.read'
  | 'shipping.edit'
  | 'marketing.read'
  | 'marketing.edit'
  | 'reports.read'
  | 'reports.export'
  | 'staff.manage'
  | 'roles.manage'
  | 'settings.manage'
  | 'audit.read';

export type AuditActorType = 'admin' | 'customer' | 'system';

/** Every permission key, for the Super Admin grant and for tests
 * that assert the matrix stays within the known key set. */
export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  'dashboard.read',
  'buyers.read',
  'buyers.contact',
  'customers.read',
  'customers.create',
  'customers.edit',
  'customers.export',
  'leads.read',
  'leads.create',
  'leads.edit',
  'leads.assign',
  'leads.contact',
  'recovery.read',
  'recovery.edit',
  'communications.read',
  'orders.read',
  'orders.create',
  'orders.edit',
  'orders.export',
  'products.read',
  'products.create',
  'products.edit',
  'products.delete',
  'inventory.read',
  'inventory.adjust',
  'payments.read',
  'payments.verify',
  'payments.refund',
  'payments.export',
  'shipping.read',
  'shipping.edit',
  'marketing.read',
  'marketing.edit',
  'reports.read',
  'reports.export',
  'staff.manage',
  'roles.manage',
  'settings.manage',
  'audit.read',
];

/**
 * Role to permission keys, derived from the Admin Roles and Access
 * Matrix in the admin master structure (the same matrix the admin
 * portal renders). Module actions map to keys as follows: View is
 * read, the inventory Edit grant is inventory.adjust, the payments
 * Approve grant is payments.verify, the payments Refund grant is
 * payments.refund, and the Security module View grant is
 * audit.read. Super Admin holds every key. Server-side guards read
 * this matrix; the portal matrix is presentation only.
 *
 * Phase 6 adds the Cart Recovery and Communication Center keys:
 * recovery.read and recovery.edit for the recovery workflow (the
 * Communication Center's call logging rides on recovery.edit,
 * since logging a call is a recovery and CRM action), and
 * communications.read for the communication log. They sit with
 * the roles that already work the buyer pipeline: Store Manager,
 * CRM Manager and Sales Agent hold all three; Marketing Manager
 * and Analyst read both areas without editing them.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, PermissionKey[]> = {
  'super-admin': ALL_PERMISSION_KEYS,
  'store-manager': [
    'dashboard.read',
    'customers.read',
    'customers.export',
    'orders.read',
    'orders.create',
    'orders.edit',
    'orders.export',
    'products.read',
    'products.edit',
    'inventory.read',
    'inventory.adjust',
    'payments.read',
    'shipping.read',
    'shipping.edit',
    'recovery.read',
    'recovery.edit',
    'communications.read',
    'reports.read',
    'reports.export',
    'audit.read',
  ],
  'crm-manager': [
    'dashboard.read',
    'buyers.read',
    'buyers.contact',
    'customers.read',
    'customers.create',
    'customers.edit',
    'customers.export',
    'leads.read',
    'leads.create',
    'leads.edit',
    'leads.assign',
    'leads.contact',
    'recovery.read',
    'recovery.edit',
    'communications.read',
    'orders.read',
    'reports.read',
    'reports.export',
  ],
  'sales-agent': [
    'dashboard.read',
    'buyers.read',
    'customers.read',
    'leads.read',
    'leads.create',
    'leads.edit',
    'leads.assign',
    'leads.contact',
    'recovery.read',
    'recovery.edit',
    'communications.read',
    'orders.read',
    'orders.create',
  ],
  'support-agent': ['dashboard.read', 'customers.read', 'orders.read'],
  'product-manager': [
    'dashboard.read',
    'products.read',
    'products.create',
    'products.edit',
    'products.delete',
    'inventory.read',
    'inventory.adjust',
    'reports.read',
  ],
  accountant: [
    'dashboard.read',
    'orders.read',
    'payments.read',
    'payments.verify',
    'payments.refund',
    'payments.export',
    'reports.read',
    'reports.export',
  ],
  'delivery-manager': [
    'dashboard.read',
    'orders.read',
    'orders.edit',
    'inventory.read',
    'shipping.read',
    'shipping.edit',
  ],
  'marketing-manager': [
    'dashboard.read',
    'customers.read',
    'customers.export',
    'recovery.read',
    'communications.read',
    'marketing.read',
    'marketing.edit',
    'reports.read',
    'reports.export',
  ],
  analyst: [
    'dashboard.read',
    'buyers.read',
    'customers.read',
    'leads.read',
    'recovery.read',
    'communications.read',
    'orders.read',
    'products.read',
    'payments.read',
    'reports.read',
    'reports.export',
  ],
};

/** Permissions granted to a role, in matrix order. */
export function permissionsForRole(role: AdminRole): PermissionKey[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Union of permissions across several roles (an admin user can
 * hold more than one role). */
export function permissionsForRoles(roles: AdminRole[]): PermissionKey[] {
  const granted = new Set<PermissionKey>();
  for (const role of roles) {
    for (const key of permissionsForRole(role)) granted.add(key);
  }
  return [...granted];
}

export function roleHasPermission(
  role: AdminRole,
  key: PermissionKey,
): boolean {
  return permissionsForRole(role).includes(key);
}

export interface AuditLogEntry {
  id: string;
  actorType: AuditActorType;
  /** Admin user id or customer id. Null for system events. */
  actorId: string | null;
  actorRole: AdminRole | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}
