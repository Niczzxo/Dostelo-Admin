import { z } from 'zod';
import {
  CONSENT_SCOPES,
  VISITOR_EVENT_TYPES,
} from '@dostelo/types';

/**
 * Visitor tracking schemas (Phase 5). The privacy rules are
 * enforced here, at the boundary:
 *
 * - visitorId and sessionId are client-generated random ids
 *   (first-party cookie values). Nothing in these schemas accepts
 *   an IP address, a fingerprint, a user agent or any other covert
 *   identifier.
 * - Every object is strict: a personal-data field (email, phone,
 *   name, address) sent with an event is rejected outright, not
 *   silently stored. The only fields an event may carry are the
 *   ones defined below.
 */

const visitorIdSchema = z.string().trim().min(8).max(100);
const sessionIdSchema = z.string().trim().min(8).max(100);

/**
 * The closed set of payload fields an event may carry. Product ids
 * and slugs, the search query text, cart value in integer minor
 * units, cart size and the checkout step name. No personal data.
 */
export const visitorEventPayloadSchema = z
  .object({
    productId: z.string().min(1).max(120).optional(),
    productIds: z.array(z.string().min(1).max(120)).max(20).optional(),
    query: z.string().trim().max(200).optional(),
    cartValueMinor: z.number().int().min(0).max(100_000_000).optional(),
    cartItemCount: z.number().int().min(0).max(999).optional(),
    step: z.string().trim().min(1).max(60).optional(),
  })
  .strict();
export type VisitorEventPayload = z.infer<
  typeof visitorEventPayloadSchema
>;

export const visitorEventSchema = z
  .object({
    visitorId: visitorIdSchema,
    sessionId: sessionIdSchema,
    type: z.enum(VISITOR_EVENT_TYPES),
    path: z.string().trim().max(300).optional(),
    payload: visitorEventPayloadSchema.optional(),
    occurredAt: z.string().datetime().optional(),
  })
  .strict();
export type VisitorEventIngest = z.infer<typeof visitorEventSchema>;

export const consentRecordSchema = z
  .object({
    visitorId: visitorIdSchema,
    scope: z.enum(CONSENT_SCOPES),
    status: z.enum(['granted', 'denied']),
  })
  .strict();
export type ConsentRecordInput = z.infer<typeof consentRecordSchema>;

/**
 * Body of POST /v1/visitors/link. The customer id never comes from
 * the body: it is the authenticated principal from the token, so a
 * visitor id can only ever be linked to the caller themselves.
 */
export const visitorLinkSchema = z
  .object({
    visitorId: visitorIdSchema,
  })
  .strict();
export type VisitorLinkInput = z.infer<typeof visitorLinkSchema>;
