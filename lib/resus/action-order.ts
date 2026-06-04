/**
 * Shared resus actions urgency-ordering (whole-surface — A/B/C/D/E + any future
 * cross-step actions view). PRESENTATION/ORDERING ONLY — the findings→action
 * engine, the action-state lifecycle, the clinical mappings, and escalation-on-
 * failure are all unchanged. This re-ranks the already-computed action list at
 * RENDER time so the team's eye lands on the most time-critical action first.
 *
 * The composite (deterministic, transparent): the STATE band first, then the
 * engine's time-criticality (`priority`, lower = more urgent) within the band,
 * stable (equal keys keep input order). One reusable function so every step
 * orders identically — not a per-step reinvention.
 *
 * SAFETY GUARDRAIL — surfacing ≠ filtering: this SORTS, it never removes. Every
 * action passed in comes back out; callers must not drop pending actions.
 */

/** The action-state vocabulary (identical across all ABCDE steps). */
export const RESUS_ACTION_STATES = [
  "indicated",
  "in_progress",
  "performed",
  "not_indicated",
  "deferred",
  "failed",
] as const;
export type ResusActionState = (typeof RESUS_ACTION_STATES)[number];

/**
 * State → list rank (lower = higher in the list). §1.2 of the kickoff:
 *  failed (escalate) → indicated (the backlog) → in_progress (underway, keep in
 *  view) → deferred (parked, marked) → performed (done, recedes) →
 *  not_indicated (N/A, bottom). An unrecorded action is treated as `indicated`.
 */
export const RESUS_ACTION_STATE_RANK: Record<ResusActionState, number> = {
  failed: 0,
  indicated: 1,
  in_progress: 2,
  deferred: 3,
  performed: 4,
  not_indicated: 5,
};

/** Recorded-only actions carry no engine priority → they sort AFTER triggered
 *  ones within the same state band (a triggered indicated action outranks a
 *  recorded-only one of the same state). */
const PRIORITY_DEFAULT = Number.MAX_SAFE_INTEGER;

export interface OrderableResusAction {
  code: string;
  /** Engine time-criticality (lower = more urgent). Undefined for recorded-only. */
  priority?: number;
  /** Recorded state; undefined ⇒ an unrecorded `indicated` action. */
  state?: ResusActionState;
}

/** The states that still need the team's attention (the "outstanding" backlog). */
const OUTSTANDING_STATES: ReadonlySet<ResusActionState> = new Set([
  "failed",
  "indicated",
  "in_progress",
]);

function rankOf(a: OrderableResusAction): number {
  return RESUS_ACTION_STATE_RANK[a.state ?? "indicated"];
}

/**
 * Order an action list by the composite (state band, then time-criticality),
 * stable + pure (does not mutate the input). Same input → same output.
 */
export function orderResusActions<T extends OrderableResusAction>(actions: readonly T[]): T[] {
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const rb = rankOf(x.a) - rankOf(y.a);
      if (rb !== 0) return rb;
      const pb = (x.a.priority ?? PRIORITY_DEFAULT) - (y.a.priority ?? PRIORITY_DEFAULT);
      if (pb !== 0) return pb;
      return x.i - y.i; // stable
    })
    .map((w) => w.a);
}

/** The count of still-actionable actions (failed + indicated + in_progress) —
 *  the persistent "N outstanding" indicator so nothing time-critical is missed
 *  on scroll. `performed` / `deferred` / `not_indicated` are not outstanding. */
export function outstandingActionCount(actions: readonly OrderableResusAction[]): number {
  return actions.filter((a) => OUTSTANDING_STATES.has(a.state ?? "indicated")).length;
}

/** The most-urgent outstanding action (top of the ordered, outstanding subset),
 *  or null when nothing is outstanding — drives the live-region announcement. */
export function mostUrgentAction<T extends OrderableResusAction>(actions: readonly T[]): T | null {
  const ordered = orderResusActions(actions);
  return ordered.find((a) => OUTSTANDING_STATES.has(a.state ?? "indicated")) ?? null;
}
