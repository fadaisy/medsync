/**
 * Several hospitals at sign-up (ADR 0530). A clinician may name more hospitals after the first;
 * each becomes its own request, reviewed by that hospital's admin alone. Pure: no database.
 */

/** Hospitals beyond the first. Five in all covers the clinics a visiting doctor works across. */
export const MAX_EXTRA_WORKPLACES = 4;

export interface Workplace {
  hospitalId: string;
  departmentId: string;
  employmentType: string;
  /** A profession id (lib/onboarding/profession): the post held at this hospital. */
  profession: string;
}

/** The first hospital, then each extra; an extra without its own post takes the main profession. */
export function workplacesOf(v: {
  hospitalId: string;
  departmentId: string;
  employmentType: string;
  profession: string;
  moreWorkplaces?: readonly (Omit<Workplace, "profession"> & { profession?: string })[];
}): Workplace[] {
  const one = (w: Omit<Workplace, "profession"> & { profession?: string }): Workplace => ({
    hospitalId: w.hospitalId,
    departmentId: w.departmentId,
    employmentType: w.employmentType,
    profession: w.profession || v.profession,
  });
  return [one(v), ...(v.moreWorkplaces ?? []).map(one)];
}

const APPROVED = ["approved", "active"];
const REVIEWING = ["pending_approval", "under_review"];

/**
 * Which hospital's request the pending page leads with: an approved one (the person can start
 * there), else one still being reviewed, else the first given (every hospital refused).
 */
export function leadAffiliation<T extends { state: string }>(rows: readonly T[]): T | undefined {
  return (
    rows.find((r) => APPROVED.includes(r.state)) ??
    rows.find((r) => REVIEWING.includes(r.state)) ??
    rows[0]
  );
}

/** States that end a request: the person may ask that hospital again. */
const CLOSED = ["rejected", "deactivated"];

/**
 * Asking to join one more hospital from the profile (ADR 0530): why not, or null when it may go to
 * that hospital's admin. Same limit as sign-up: five hospitals still open.
 */
export function joinRefusal(
  mine: readonly { hospitalId: string; state: string }[],
  hospitalId: string,
): string | null {
  const open = mine.filter((r) => !CLOSED.includes(r.state));
  if (open.some((r) => r.hospitalId === hospitalId))
    return "You're already at this hospital, or your request is waiting.";
  if (new Set(open.map((r) => r.hospitalId)).size > MAX_EXTRA_WORKPLACES)
    return `You can be at up to ${MAX_EXTRA_WORKPLACES + 1} hospitals.`;
  return null;
}
