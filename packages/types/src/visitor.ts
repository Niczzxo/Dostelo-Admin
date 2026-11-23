/**
 * Visitor, consent and identity types for Buyer Intelligence
 * (Phase 5). Privacy rules from docs/ADMIN_PORTAL.md and the admin
 * master structure are load-bearing here:
 *
 * - Anonymous visitors are identified only by random first-party
 *   visitor and session ids generated on the client. Identity is
 *   never derived from an IP address, a device fingerprint or any
 *   other covert signal, and no type in this file carries such a
 *   field.
 * - Events link to a customer only through an authenticated or
 *   consented flow: account login, checkout, or a submitted
 *   contact form.
 * - Identity status never overclaims: an anonymous session stays
 *   'anonymous' no matter how high its lead score is.
 */

export const VISITOR_EVENT_TYPES = [
  'page-view',
  'product-view',
  'search',
  'add-to-cart',
  'remove-from-cart',
  'wishlist-add',
  'checkout-start',
  'checkout-step',
  'purchase',
] as const;

export type VisitorEventType = (typeof VISITOR_EVENT_TYPES)[number];

/**
 * A first-party storefront event. Anonymous visitors are identified
 * only by random first-party visitor and session ids, never by device
 * fingerprinting. customerId is set only after the visitor identifies
 * themselves through an authenticated or consented flow.
 */
export interface VisitorEvent {
  id: string;
  visitorId: string;
  sessionId: string;
  type: VisitorEventType;
  customerId: string | null;
  path: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

/**
 * How much the store may claim to know about a session's owner.
 * Mirrors the admin portal's identity confidence labels:
 * Anonymous, Known Customer, Guest Checkout, Unverified Contact.
 */
export const IDENTITY_STATUSES = [
  'anonymous',
  'known-customer',
  'guest-checkout',
  'unverified-contact',
] as const;

export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export const IDENTITY_STATUS_LABELS: Record<IdentityStatus, string> = {
  anonymous: 'Anonymous',
  'known-customer': 'Known Customer',
  'guest-checkout': 'Guest Checkout',
  'unverified-contact': 'Unverified Contact',
};

/**
 * One browser session of one visitor, as tracked by the storefront.
 * A visitor can hold many sessions over time; repeat sessions are a
 * lead-scoring signal, never an identity signal.
 */
export interface VisitorSession {
  /** The client-generated random session id. */
  id: string;
  /** The client-generated random visitor id (first-party cookie). */
  visitorId: string;
  identityStatus: IdentityStatus;
  /** Set only through an authenticated or consented link. */
  customerId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export const CONSENT_SCOPES = ['analytics', 'marketing'] as const;

export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export type ConsentStatus = 'granted' | 'denied';

/**
 * One consent decision by one visitor for one scope. The latest
 * record for a (visitorId, scope) pair is the effective one.
 * Events from a visitor who denied the marketing scope are still
 * stored as operational events, but flagged so every marketing
 * use (lead contact, campaigns, recovery) excludes them.
 */
export interface ConsentRecord {
  id: string;
  visitorId: string;
  scope: ConsentScope;
  status: ConsentStatus;
  createdAt: string;
}

/** The lawful flow through which a visitor became linked. */
export const IDENTITY_LINK_BASES = [
  'authenticated',
  'guest-checkout',
  'contact-form',
] as const;

export type IdentityLinkBasis = (typeof IDENTITY_LINK_BASES)[number];

/**
 * The recorded link between a visitor id and a customer, created
 * only by an authenticated request (basis 'authenticated'), by a
 * guest order placement (basis 'guest-checkout'), or by staff
 * recording a submitted contact form against the visitor (basis
 * 'contact-form', which yields 'unverified-contact' status until
 * the customer authenticates).
 */
export interface IdentityLink {
  id: string;
  visitorId: string;
  customerId: string;
  basis: IdentityLinkBasis;
  createdAt: string;
}
