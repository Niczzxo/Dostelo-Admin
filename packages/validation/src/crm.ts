import { z } from 'zod';

/** CRM schemas (Phase 5): staff notes and tags on a customer. */
export const customerNoteCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
  })
  .strict();
export type CustomerNoteCreate = z.infer<
  typeof customerNoteCreateSchema
>;

export const customerTagSchema = z
  .object({
    tag: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9 -]*$/,
        'Tags use letters, numbers, spaces and dashes',
      ),
  })
  .strict();
export type CustomerTagInput = z.infer<typeof customerTagSchema>;
