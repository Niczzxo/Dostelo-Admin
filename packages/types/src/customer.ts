import type { DeliveryZone } from './order';

export interface CustomerAddress {
  id: string;
  customerId: string;
  label: string | null;
  fullName: string;
  phone: string;
  addressLine: string;
  area: string | null;
  city: string;
  district: string;
  deliveryZone: DeliveryZone;
  isDefault: boolean;
}

export interface Customer {
  id: string;
  /** Linked auth identity, when the customer has a registered account. */
  userId: string | null;
  fullName: string;
  email: string | null;
  phone: string;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  addresses: CustomerAddress[];
  tags: string[];
  orderCount: number;
  lifetimeValueMinor: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One staff note on a customer profile (CRM, Phase 5). Notes are
 * append-only: author and time are recorded, and a note is never
 * edited in place. Maps to the CustomerNote model in the Prisma
 * schema; customer tags stay on Customer.tags (the CustomerTag
 * model is the relational form of the same list).
 */
export interface CustomerNote {
  id: string;
  customerId: string;
  body: string;
  /** Admin user id of the staff member who wrote the note. */
  authorId: string;
  createdAt: string;
}
