import type { PermissionKey } from '@dostelo/types';

/**
 * The 25 admin modules from the admin master structure, in the
 * structure's sidebar order. `permission` is the view permission
 * for the module: the sidebar hides items the signed-in role
 * cannot view, and the API enforces the same keys server-side.
 * `functional` marks the modules wired to the live API; all 25
 * modules are wired. A module whose page performs only honest
 * structure rendering would stay false here.
 */
export interface AdminModule {
  label: string;
  href: string;
  /** Path segment used by the structure-page catch-all route. */
  slug: string;
  permission: PermissionKey;
  functional: boolean;
  purpose: string;
  phase: string;
}

export const ADMIN_MODULES: AdminModule[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    slug: 'dashboard',
    permission: 'dashboard.read',
    functional: true,
    purpose:
      'Live operating picture: payment totals, recent orders, catalogue size and low stock.',
    phase: 'Phase 4',
  },
  {
    label: 'Buyer Intelligence',
    href: '/buyer-intelligence',
    slug: 'buyer-intelligence',
    permission: 'buyers.read',
    functional: true,
    purpose:
      'Consent-aware visitor and buyer insight: sessions, identity confidence and transparent lead scoring. Anonymous visitors are never presented as known buyers.',
    phase: 'Phase 5',
  },
  {
    label: 'CRM',
    href: '/crm',
    slug: 'crm',
    permission: 'customers.read',
    functional: true,
    purpose:
      'Customer records and profiles: contact details, addresses, order counts and lifetime value.',
    phase: 'Phase 4',
  },
  {
    label: 'Lead Management',
    href: '/leads',
    slug: 'leads',
    permission: 'leads.read',
    functional: true,
    purpose:
      'Lead pipeline: capture, scoring, assignment to sales agents and follow-up tasks.',
    phase: 'Phase 5',
  },
  {
    label: 'Cart Recovery',
    href: '/cart-recovery',
    slug: 'cart-recovery',
    permission: 'recovery.read',
    functional: true,
    purpose:
      'Abandoned cart recovery: inactive cart detection, stored recovery sequences, suppression lists and consented recovery messages.',
    phase: 'Phase 6',
  },
  {
    label: 'Communication Center',
    href: '/communication',
    slug: 'communication',
    permission: 'communications.read',
    functional: true,
    purpose:
      'WhatsApp, email, SMS and call history in one place, with manual call logging and every contact attempt recorded.',
    phase: 'Phase 6',
  },
  {
    label: 'Orders',
    href: '/orders',
    slug: 'orders',
    permission: 'orders.read',
    functional: true,
    purpose:
      'Order list and fulfilment: status flow, addresses, totals and payment state for every order.',
    phase: 'Phase 4',
  },
  {
    label: 'Products',
    href: '/products',
    slug: 'products',
    permission: 'products.read',
    functional: true,
    purpose:
      'Catalogue browsing with variants and live stock, including guarded inventory adjustments.',
    phase: 'Phase 4',
  },
  {
    label: 'Inventory & Warehouse',
    href: '/inventory',
    slug: 'inventory',
    permission: 'inventory.read',
    functional: true,
    purpose:
      'Stock levels per variant with on-hand, reserved and available counts, a low-stock view, and audited stock adjustments.',
    phase: 'Phase 4',
  },
  {
    label: 'Payments & Finance',
    href: '/payments',
    slug: 'payments',
    permission: 'payments.read',
    functional: true,
    purpose:
      'Payment reconciliation: gateway and status filters, manual payment verification and refunds.',
    phase: 'Phase 4',
  },
  {
    label: 'Shipping & Courier',
    href: '/shipping',
    slug: 'shipping',
    permission: 'shipping.read',
    functional: true,
    purpose:
      'Courier booking and tracking with Pathao, Steadfast and RedX, plus delivery status sync into the order flow.',
    phase: 'Phase 6',
  },
  {
    label: 'Returns & Refunds',
    href: '/returns',
    slug: 'returns',
    permission: 'orders.read',
    functional: true,
    purpose:
      'Returns and exchange intake, inspection outcomes and refund hand-off to Payments.',
    phase: 'Phase 4',
  },
  {
    label: 'Marketing',
    href: '/marketing',
    slug: 'marketing',
    permission: 'marketing.read',
    functional: true,
    purpose:
      'Campaign records with draft and scheduled states. Sending follows each channel provider configuration and is reported honestly per campaign.',
    phase: 'Phase 4',
  },
  {
    label: 'Automation',
    href: '/automation',
    slug: 'automation',
    permission: 'settings.manage',
    functional: true,
    purpose:
      'Background automations: recovery workers, notification triggers and scheduled jobs.',
    phase: 'Phase 6',
  },
  {
    label: 'Customer Support',
    href: '/support',
    slug: 'support',
    permission: 'customers.read',
    functional: true,
    purpose:
      'Support inbox and case handling tied to customer and order records.',
    phase: 'Phase 5',
  },
  {
    label: 'Reviews & Reputation',
    href: '/reviews',
    slug: 'reviews',
    permission: 'marketing.read',
    functional: true,
    purpose: 'Product reviews, moderation and store reputation signals.',
    phase: 'Phase 4',
  },
  {
    label: 'Loyalty & Rewards',
    href: '/loyalty',
    slug: 'loyalty',
    permission: 'marketing.read',
    functional: true,
    purpose:
      'Loyalty points: the earn rules, per-customer balances derived from delivered orders, and audited manual adjustments.',
    phase: 'Phase 6',
  },
  {
    label: 'Reports & Analytics',
    href: '/reports',
    slug: 'reports',
    permission: 'reports.read',
    functional: true,
    purpose:
      'Sales by day, top products, delivery zone split, payment method split and cart recovery performance, aggregated live from the orders, payments and recovery stores.',
    phase: 'Phase 4',
  },
  {
    label: 'Website Management',
    href: '/website',
    slug: 'website',
    permission: 'settings.manage',
    functional: true,
    purpose:
      'Store settings: store name and contact details, the delivery fee table checkout charges, the free delivery offer switch, and manual payment instructions.',
    phase: 'Phase 4',
  },
  {
    label: 'Notifications',
    href: '/notifications',
    slug: 'notifications',
    permission: 'settings.manage',
    functional: true,
    purpose:
      'Staff notification feed derived from pending orders, low stock and abandoned cart detections, with per-staff read state.',
    phase: 'Phase 6',
  },
  {
    label: 'Staff Management',
    href: '/staff',
    slug: 'staff',
    permission: 'staff.manage',
    functional: true,
    purpose:
      'Staff accounts and role assignment: invite by creating an account with a temporary password, deactivate accounts and force logout by revoking sessions. The roles matrix itself is live under Security & Access.',
    phase: 'Phase 4',
  },
  {
    label: 'Security & Access',
    href: '/security',
    slug: 'security',
    permission: 'audit.read',
    functional: true,
    purpose:
      'The live roles and permissions matrix, the audit log viewer, and MFA self-service for the signed-in admin.',
    phase: 'Phase 4',
  },
  {
    label: 'System Integrations',
    href: '/integrations',
    slug: 'integrations',
    permission: 'settings.manage',
    functional: true,
    purpose:
      'Connected services: payment gateways, couriers, WhatsApp and email providers, with credential status.',
    phase: 'Phase 6',
  },
  {
    label: 'Legal & Compliance',
    href: '/legal',
    slug: 'legal',
    permission: 'settings.manage',
    functional: true,
    purpose:
      'Editable legal documents (privacy, terms, returns, refund, shipping, warranty) stored in the API. The storefront still serves its ported policy text; wiring it to these documents is pending.',
    phase: 'Phase 7',
  },
  {
    label: 'Backup & Maintenance',
    href: '/backup',
    slug: 'backup',
    permission: 'settings.manage',
    functional: true,
    purpose:
      'On-demand JSON data exports of the platform core stores, with a recorded export history. No external backup storage is connected.',
    phase: 'Phase 7',
  },
];

export function moduleBySlug(slug: string): AdminModule | null {
  return ADMIN_MODULES.find((module_) => module_.slug === slug) ?? null;
}
