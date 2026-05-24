/**
 * Shared row type for the People table. Server fetches + normalises;
 * client renders. Only primitives + plain objects cross the boundary.
 */

export interface PeopleRole {
  role: string;
  /** null for non-scoped roles (e.g. superadmin, patient). */
  hospitalId: string | null;
}

export interface PeopleItem {
  id: string;
  email: string;
  fullName: string;
  state: string;
  createdAtIso: string;
  roles: ReadonlyArray<PeopleRole>;
}
