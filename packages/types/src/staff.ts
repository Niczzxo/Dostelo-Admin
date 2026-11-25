import type { AdminRole } from './admin';

/**
 * Staff account management view (admin master structure module
 * 21: Staff & Employee Management). This is the only shape of a
 * staff account that ever leaves the API: password hashes and
 * TOTP secrets stay server-side.
 */
export interface StaffMemberView {
  id: string;
  email: string;
  displayName: string;
  roles: AdminRole[];
  isActive: boolean;
  mfaEnabled: boolean;
  /** Refresh sessions neither revoked nor expired. */
  activeSessions: number;
  /** Most recent session creation or rotation time for this
   * account (logins and refreshes create session records), or
   * null when the account has never signed in. */
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}
