/**
 * My care (patient app v2 §5.8): the care team and the checks this year, the same on the phone and the web.
 * Pure. Names only with consent (S20): the database already returns no person for a member who has not
 * consented (0301 `care_team_view`), and this keeps the role whatever happens to the name. Roles always show.
 * Checks: Due, Overdue (amber in the screens, with Book it) or Done, from the plan's check intervals and the
 * last time each was done. A check never recorded is Due, never Done.
 */
export type TeamRole =
  | "nurse"
  | "medical_officer"
  | "specialist"
  | "doctor"
  | "clinical_officer"
  | "nutritionist"
  | "counsellor"
  | "physiotherapist"
  | "pharmacist"
  | "vht";

export const ROLE_WORDS: Record<TeamRole, string> = {
  nurse: "Nurse",
  medical_officer: "Medical officer",
  specialist: "Specialist",
  doctor: "Doctor",
  clinical_officer: "Clinical officer",
  nutritionist: "Nutritionist",
  counsellor: "Counsellor",
  physiotherapist: "Physiotherapist",
  pharmacist: "Pharmacist",
  vht: "Village health team",
};

export interface TeamRow {
  id: string;
  role: TeamRole;
  firstContact: boolean;
  nextStep: string | null;
  /** Only when the member consented (the view's `member_user_id`). */
  memberUserId: string | null;
}

export interface TeamCard {
  id: string;
  role: string;
  /** Null: the role is the name. */
  name: string | null;
  firstContact: boolean;
  nextStep: string | null;
}

/** The team grid: the first contact first, then by role; a name only where consent gave a person. */
export function teamCards(rows: TeamRow[], names: ReadonlyMap<string, string>): TeamCard[] {
  return [...rows]
    .sort((a, b) => Number(b.firstContact) - Number(a.firstContact) || a.role.localeCompare(b.role))
    .map((r) => ({
      id: r.id,
      role: ROLE_WORDS[r.role],
      name: r.memberUserId ? (names.get(r.memberUserId) ?? null) : null,
      firstContact: r.firstContact,
      nextStep: r.nextStep,
    }));
}

export type CheckState = "due" | "overdue" | "done";

export interface CheckLine {
  key: string;
  state: CheckState;
  /** The last time it was done, ISO, or null. */
  lastIso: string | null;
  /** When it is next due, ISO. */
  dueIso: string;
}

/**
 * Checks this year from `check_intervals` ({ "hba1c": 3, "eyes": 12 }: months) and the last time each was done.
 * Done: within its interval. Due: the interval has run out within the last month, or it was never recorded.
 * Overdue: more than a month past due.
 */
export function checksThisYear(
  intervals: Record<string, number>,
  lastDone: ReadonlyMap<string, string>,
  now: Date,
): CheckLine[] {
  const MONTH = 30.44 * 86_400_000;
  return Object.entries(intervals)
    .filter(([, m]) => Number.isFinite(m) && m > 0)
    .map(([key, months]) => {
      const last = lastDone.get(key) ?? null;
      if (!last) return { key, state: "due" as const, lastIso: null, dueIso: now.toISOString() };
      const due = new Date(new Date(last).getTime() + months * MONTH);
      const past = now.getTime() - due.getTime();
      const state: CheckState = past < 0 ? "done" : past <= MONTH ? "due" : "overdue";
      return { key, state, lastIso: last, dueIso: due.toISOString() };
    })
    .sort(
      (a, b) =>
        ["overdue", "due", "done"].indexOf(a.state) - ["overdue", "due", "done"].indexOf(b.state),
    );
}

/** Weekdays 08:00 to 17:00 in Kampala: when the team answers messages (the server's `inTeamHours`). */
export function inTeamHours(now: Date): boolean {
  const k = new Date(now.getTime() + 3 * 3600_000);
  const day = k.getUTCDay();
  const h = k.getUTCHours();
  return day >= 1 && day <= 5 && h >= 8 && h < 17;
}
