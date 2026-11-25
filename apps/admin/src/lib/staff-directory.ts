'use client';

import type { StaffMemberView } from '@dostelo/types';
import { useAuth } from '../components/auth-provider';
import { useData } from './use-data';

/**
 * The staff directory for assignment pickers (leads, support,
 * returns inspection, follow-ups). Only roles holding
 * staff.manage can read the directory endpoint; for everyone
 * else this returns an empty list and the pickers fall back to
 * free-text or unassigned states, exactly as the API enforces.
 */
export function useStaffDirectory(): {
  staff: StaffMemberView[];
  canRead: boolean;
} {
  const { session } = useAuth();
  const canRead =
    session.principal?.permissions.includes('staff.manage') ?? false;
  const { data } = useData(
    (client) =>
      canRead ? client.listStaff() : Promise.resolve({ items: [] }),
    [canRead],
  );
  return { staff: data?.items ?? [], canRead };
}
