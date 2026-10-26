/**
 * Patient-facing word for every status the CHECK constraint allows. Never
 * colour alone for state — a screen pairs the tone with one of these.
 * Lifted from `lib/patient/appointments.ts` so the phone and the web cannot
 * name the same appointment differently.
 */
export const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  pending_approval: "Awaiting approval",
  confirmed: "Confirmed",
  arrived: "You've arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Missed",
  rescheduled: "Rescheduled",
  declined: "Declined",
};

/** What `cancel-appointment` will accept. Gate the control on this, not on a guess. */
export const CANCELLABLE: ReadonlySet<string> = new Set([
  "requested",
  "pending_approval",
  "confirmed",
  "arrived",
]);

/** What `reschedule-appointment` will accept. Note `arrived` is NOT in it. */
export const RESCHEDULABLE: ReadonlySet<string> = new Set([
  "requested",
  "pending_approval",
  "confirmed",
]);
