import { z } from 'zod';
import { ADMIN_ROLES } from '@dostelo/types';

/**
 * Staff management schemas. A staff account is created with a
 * temporary password the creating admin sets and hands over out
 * of band; the account holder changes it through the normal
 * flows. Roles must be real matrix roles.
 */
export const createStaffSchema = z
  .object({
    email: z.string().trim().email().max(160),
    displayName: z.string().trim().min(1).max(120),
    roles: z.array(z.enum(ADMIN_ROLES)).min(1).max(10),
    temporaryPassword: z.string().min(8).max(200),
  })
  .strict();
export type CreateStaff = z.infer<typeof createStaffSchema>;

/** Staff invitation (Staff redesign): no password is set by the
 * inviter. The invitee sets their own through a one-time token
 * link; the account stays inactive until then. */
export const inviteStaffSchema = z
  .object({
    email: z.string().trim().email().max(160),
    displayName: z.string().trim().min(1).max(120),
    roles: z.array(z.enum(ADMIN_ROLES)).min(1).max(10),
  })
  .strict();
export type InviteStaff = z.infer<typeof inviteStaffSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().trim().min(16).max(400),
    password: z.string().min(8).max(200),
  })
  .strict();
export type AcceptInvite = z.infer<typeof acceptInviteSchema>;

export const staffProfileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
  })
  .strict();
export type StaffProfileUpdate = z.infer<typeof staffProfileUpdateSchema>;

export const staffRolesSchema = z
  .object({
    roles: z.array(z.enum(ADMIN_ROLES)).min(1).max(10),
  })
  .strict();
export type StaffRolesUpdate = z.infer<typeof staffRolesSchema>;
