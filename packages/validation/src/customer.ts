import { z } from 'zod';
import { bdPhoneSchema } from './cart';

export const customerRegistrationSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200).optional(),
    phone: bdPhoneSchema.optional(),
    password: z.string().min(8).max(128),
  })
  .refine((data) => Boolean(data.email || data.phone), {
    message: 'Either an email address or a phone number is required',
    path: ['email'],
  });
export type CustomerRegistration = z.infer<
  typeof customerRegistrationSchema
>;
