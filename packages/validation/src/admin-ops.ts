import { z } from 'zod';

/** Legal document update: a title and the full body text. */
export const legalDocumentUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().max(100000),
  })
  .strict();
export type LegalDocumentUpdate = z.infer<typeof legalDocumentUpdateSchema>;

export const legalDocumentCreateSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must be lowercase letters, numbers and single hyphens',
      )
      .min(2)
      .max(60),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(300).optional(),
  })
  .strict();
export type LegalDocumentCreate = z.infer<
  typeof legalDocumentCreateSchema
>;

/** Notification read marking: the keys the staff member has seen. */
export const notificationMarkReadSchema = z
  .object({
    keys: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
  })
  .strict();
export type NotificationMarkRead = z.infer<typeof notificationMarkReadSchema>;

/** Per-admin notification preferences (Notifications redesign). */
export const notificationPreferencesSchema = z
  .object({
    categories: z
      .array(
        z.enum(['inventory', 'orders', 'customers', 'marketing', 'system']),
      )
      .max(5),
    emailEnabled: z.boolean(),
  })
  .strict();
export type NotificationPreferencesUpdate = z.infer<
  typeof notificationPreferencesSchema
>;
