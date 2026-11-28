import type { Rec } from './types';
import { itemsOf, str } from './types';

/* Staff directory helpers, fresh rebuild 2026-11-28. Assignment
   dropdowns are built only from the staff list the API returned;
   when the list is empty the forms fall back to a free text staff
   id field, so no name is ever invented. */

export interface StaffOption {
  id: string;
  label: string;
}

export function staffOptions(staffResponse: unknown): StaffOption[] {
  return itemsOf(staffResponse)
    .map((member: Rec) => ({
      id: str(member.id ?? member.userId),
      label: str(member.name ?? member.email ?? member.id),
    }))
    .filter((option) => option.id !== '');
}
