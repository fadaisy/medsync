/**
 * Nonconformities (Lab Phase 3 §6.8, NC-1..NC-5; GATE A P7, §3.2 0114, §5.4; D-LAB3-14, E-LAB3-07). Pure.
 *
 * Generic: `source` and subject are open keys so later phases reuse it. Actions are events
 * (`lab_nc_events`), folded here. Nothing auto-closes: `closed` is only ever the lead's signed event.
 */
import type { LookBackItem } from "@/lib/lab/lookback";

import { lookBackProgress } from "@/lib/lab/lookback";
import { dayOf } from "@/lib/lab/stock";

export type NcSource =
  | "qc_reject"
  | "kit_qc_fail"
  | "eqa_unacceptable"
  | "temperature"
  | "lot_rejected"
  | "equipment"
  | "complaint"
  | "specimen"
  | "other";

/** NC-1: the sources MedSync opens by itself, with the laboratory lead as owner. */
export const AUTOMATIC_SOURCES: readonly NcSource[] = [
  "qc_reject",
  "kit_qc_fail",
  "eqa_unacceptable",
  "temperature",
  "lot_rejected",
];

/** NC-2: `NC-2026-007`. */
export const ncNumber = (year: number, seq: number) => `NC-${year}-${String(seq).padStart(3, "0")}`;

/**
 * NC-1, NC-2, GATE A §5.4: the opening fields of an automatic nonconformity. Only a QC reject halts testing
 * (its hold); the others do not.
 */
export function openAutomatic(source: NcSource, leadUserId: string) {
  if (!AUTOMATIC_SOURCES.includes(source)) throw new Error(`not an automatic source: ${source}`);
  return {
    source,
    owner: leadUserId,
    openedBy: null,
    testingHalted: source === "qc_reject",
    state: "open" as const,
  };
}

export type NcEvent =
  | { kind: "action_added"; actionId: string; what: string; who: string; by: string }
  | {
      kind: "action_updated";
      actionId: string;
      state: "open" | "done" | "cancelled";
      reason?: string;
    }
  | { kind: "resumed" }
  | { kind: "closed" }
  | { kind: "linked" | "notified" | "note" };

export interface NcAction {
  id: string;
  what: string;
  who: string;
  /** Due date key. */
  by: string;
  state: "open" | "done" | "cancelled";
  cancelReason: string | null;
}

/** NC-2: the actions and flags as the events have left them. */
export function foldNc(events: readonly NcEvent[]): {
  actions: NcAction[];
  resumed: boolean;
  closed: boolean;
} {
  const actions = new Map<string, NcAction>();
  let resumed = false;
  let closed = false;
  for (const e of events) {
    if (e.kind === "action_added")
      actions.set(e.actionId, {
        id: e.actionId,
        what: e.what,
        who: e.who,
        by: e.by,
        state: "open",
        cancelReason: null,
      });
    else if (e.kind === "action_updated") {
      const a = actions.get(e.actionId);
      if (a)
        actions.set(e.actionId, {
          ...a,
          state: e.state,
          cancelReason: e.state === "cancelled" ? (e.reason?.trim() ?? null) : a.cancelReason,
        });
    } else if (e.kind === "resumed") resumed = true;
    else if (e.kind === "closed") closed = true;
  }
  return { actions: [...actions.values()], resumed, closed };
}

/**
 * NC-3: lifting a QC hold (or the halt of any nonconformity) needs its conditions met and the lead's
 * authorisation: a passing run after the rejected one, and the look-back finished.
 */
export function resumptionErrors(input: {
  actorIsLead: boolean;
  passingRunAfterReject: boolean;
  lookBack: readonly Pick<LookBackItem, "decision">[];
}): string[] {
  const e: string[] = [];
  if (!input.actorIsLead) e.push("not_lead");
  if (!input.passingRunAfterReject) e.push("no_passing_run");
  if (!lookBackProgress(input.lookBack).complete) e.push("lookback_undecided");
  return e;
}

/**
 * NC-4: closing needs the cause category, every look-back result decided, every action done or cancelled with a
 * reason, the effectiveness check recorded as met, and the laboratory lead.
 */
export function closeErrors(input: {
  actorIsLead: boolean;
  causeCategory: string | null;
  effectivenessMet: boolean | null;
  events: readonly NcEvent[];
  lookBack: readonly Pick<LookBackItem, "decision">[];
}): string[] {
  const e: string[] = [];
  const { actions, closed } = foldNc(input.events);
  if (closed) return ["already_closed"];
  if (!input.actorIsLead) e.push("not_lead");
  if (!input.causeCategory?.trim()) e.push("no_cause");
  if (!lookBackProgress(input.lookBack).complete) e.push("lookback_undecided");
  if (actions.some((a) => a.state === "open")) e.push("actions_open");
  if (actions.some((a) => a.state === "cancelled" && !a.cancelReason))
    e.push("cancel_without_reason");
  if (input.effectivenessMet !== true) e.push("effectiveness_not_met");
  return e;
}

/** NC-5: open actions past their date (hospital-local), amber on Quality today. */
export const overdueActions = (events: readonly NcEvent[], now: Date, timeZone: string) =>
  foldNc(events).actions.filter((a) => a.state === "open" && a.by < dayOf(now, timeZone));
