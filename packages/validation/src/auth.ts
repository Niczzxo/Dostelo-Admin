import { z } from 'zod';
import { bdPhoneSchema } from './cart';

/**
 * Auth payloads (Phase 4). Identifiers are an email address or a
 * Bangladeshi phone number, matching how customers register.
 */

const identifierSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .refine(
    (value) => value.includes('@') || bdPhoneSchema.safeParse(value).success,
    { message: 'Identifier must be an email address or a phone number' },
  );

export const customerLoginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1).max(128),
});
export type CustomerLogin = z.infer<typeof customerLoginSchema>;

export const adminLoginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(128),
});
export type AdminLogin = z.infer<typeof adminLoginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});
export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});
export type LogoutRequest = z.infer<typeof logoutSchema>;

/** A six-digit TOTP code, as typed from an authenticator app. */
export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code must be six digits'),
});
export type TotpCode = z.infer<typeof totpCodeSchema>;

export const mfaExchangeSchema = z.object({
  challengeId: z.string().min(10).max(128),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code must be six digits'),
});
export type MfaExchange = z.infer<typeof mfaExchangeSchema>;
