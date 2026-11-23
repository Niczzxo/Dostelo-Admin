import type { AdminRole, PermissionKey } from './admin';

/**
 * Auth wire types shared by the API and its clients. Access tokens
 * are short-lived JWTs; refresh tokens are opaque, rotate on every
 * use, and are stored server-side only as hashes.
 */

export type AuthSubjectType = 'customer' | 'admin';

/** The authenticated principal as the API exposes it to clients. */
export interface AuthPrincipalView {
  type: AuthSubjectType;
  /** Customer id for customers, admin user id for staff. */
  id: string;
  /** Admin roles; empty for customers. */
  roles: AdminRole[];
  /** Effective permissions across the admin roles; empty for
   * customers. */
  permissions: PermissionKey[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
  principal: AuthPrincipalView;
}

/** Admin password login outcome when MFA is enabled on the
 * account: no tokens yet, a short-lived challenge instead. */
export interface MfaChallenge {
  mfaRequired: true;
  challengeId: string;
  /** ISO timestamp when the challenge stops being exchangeable. */
  expiresAt: string;
}

export type AdminLoginResult = AuthTokens | MfaChallenge;

export function isMfaChallenge(
  result: AdminLoginResult,
): result is MfaChallenge {
  return 'mfaRequired' in result && result.mfaRequired === true;
}
