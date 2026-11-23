import { z } from 'zod';

/** Legal document update: a title and the full body text. */
export const legalDocumentUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().max(100000),
  })
  .strict();
export type LegalDocumentUpdate = z.infer<typeof legalDocumentUpdateSchema>;

/** Notification read marking: the keys the staff member has seen. */
export const notificationMarkReadSchema = z
  .object({
    keys: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
  })
  .strict();
export type NotificationMarkRead = z.infer<typeof notificationMarkReadSchema>;
