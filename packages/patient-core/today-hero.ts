/**
 * The Today priority ladder (patient app v2 §5.6, M6; ADR "The Today priority ladder"). One hero card is
 * chosen by the first rung that applies, in this order:
 *   1. an active danger alert; 2. a care team message or request that needs an answer; 3. a dose or check due
 *   now; 4. a visit today; 5. the next plan item; 6. "Nothing due until …".
 * Pure and shared by the phone and the web; every combination is tested. The time-of-day states on Today come
 * from what is due, so they come out of this ladder too.
 */

export interface TodayState {
  danger: { kind: "low_sugar" | "high_sugar" | "very_high_bp" | "low_bp" | "pulse"; at: string } | null;
  teamAsks: { id: string; from: string; at: string } | null;
  dueNow: { kind: "dose" | "check"; key: string; label: string; dueAt: string } | null;
  visitToday: { appointmentId: string; window: string } | null;
  nextItem: { kind: "dose" | "check" | "walk" | "visit"; label: string; at: string } | null;
  /** When nothing is due, the next time anything is. */
  nothingUntil: string | null;
}

export type Hero =
  | { rung: 1; kind: "danger"; danger: NonNullable<TodayState["danger"]> }
  | { rung: 2; kind: "team"; ask: NonNullable<TodayState["teamAsks"]> }
  | { rung: 3; kind: "due"; due: NonNullable<TodayState["dueNow"]> }
  | { rung: 4; kind: "visit"; visit: NonNullable<TodayState["visitToday"]> }
  | { rung: 5; kind: "next"; next: NonNullable<TodayState["nextItem"]> }
  | { rung: 6; kind: "rest"; until: string | null };

export function heroFor(s: TodayState): Hero {
  if (s.danger) return { rung: 1, kind: "danger", danger: s.danger };
  if (s.teamAsks) return { rung: 2, kind: "team", ask: s.teamAsks };
  if (s.dueNow) return { rung: 3, kind: "due", due: s.dueNow };
  if (s.visitToday) return { rung: 4, kind: "visit", visit: s.visitToday };
  if (s.nextItem) return { rung: 5, kind: "next", next: s.nextItem };
  return { rung: 6, kind: "rest", until: s.nothingUntil };
}

/** Only the danger hero may be red (MR5); the rest use the accent or neutral tones. */
export function heroTone(h: Hero): "emergency" | "accent" | "neutral" {
  if (h.kind === "danger") return "emergency";
  if (h.kind === "team" || h.kind === "due") return "accent";
  return "neutral";
}
