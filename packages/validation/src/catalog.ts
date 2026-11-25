import { z } from 'zod';

/**
 * Catalogue administration schemas (Products redesign). Prices
 * cross the wire as integer minor units (paisa), the same money
 * convention as the rest of the API. The variant list is the
 * full desired set on update: existing variants carry their id,
 * new variants omit it, and variants are never deleted through
 * this shape (deactivate with isActive instead), because order
 * and cart history references them.
 */
export const productVariantInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    size: z.string().trim().max(40).nullable().optional(),
    colour: z.string().trim().max(40).nullable().optional(),
    priceMinor: z.number().int().min(0).max(100_000_000),
    compareAtPriceMinor: z
      .number()
      .int()
      .min(0)
      .max(100_000_000)
      .nullable()
      .optional(),
    stock: z.number().int().min(0).max(1_000_000),
    isActive: z.boolean().optional(),
  })
  .strict();
export type ProductVariantInput = z.infer<
  typeof productVariantInputSchema
>;

export const productMediaInputSchema = z
  .object({
    url: z.string().trim().min(1).max(2000),
    alt: z.string().trim().max(200).optional(),
  })
  .strict();
export type ProductMediaInput = z.infer<typeof productMediaInputSchema>;

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case');

export const productCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: slugSchema,
    categoryId: z.string().min(1),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
    isFeatured: z.boolean().optional(),
    isBestSeller: z.boolean().optional(),
    isNewArrival: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    media: z.array(productMediaInputSchema).max(12).optional(),
    variants: z.array(productVariantInputSchema).min(1).max(60),
  })
  .strict();
export type ProductCreate = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    categoryId: z.string().min(1).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
    isFeatured: z.boolean().optional(),
    isBestSeller: z.boolean().optional(),
    isNewArrival: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
    media: z.array(productMediaInputSchema).max(12).optional(),
    variants: z.array(productVariantInputSchema).min(1).max(60).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
