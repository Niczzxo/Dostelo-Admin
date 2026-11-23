import { z } from 'zod';

/** Bangladeshi phone numbers: optional +880, digits, spaces or dashes. */
export const bdPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 -]{9,16}$/, 'Enter a valid phone number');

export const cartLineCreateSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
});
export type CartLineCreate = z.infer<typeof cartLineCreateSchema>;

/** Quantity 0 removes the line from the cart. */
export const cartLineUpdateSchema = z.object({
  quantity: z.number().int().min(0).max(99),
});
export type CartLineUpdate = z.infer<typeof cartLineUpdateSchema>;

export const cartCreateSchema = z.object({
  customerId: z.string().min(1).optional(),
  sessionToken: z.string().min(1).max(200).optional(),
});
export type CartCreate = z.infer<typeof cartCreateSchema>;
