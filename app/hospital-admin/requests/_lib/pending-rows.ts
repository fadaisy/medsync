import "server-only";

import type { PendingRequest } from "@/lib/hospital-admin/pending";

import { CS } from "@/content/clinics-schedule/copy";
import { REQUESTS } from "@/content/hospital-admin/admin-nav";
import { fetchPendingRequests, PENDING_LIMIT } from "@/lib/hospital-admin/pending";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

/** This hospital's requests waiting for a clinician, aged at one instant; `cut` when the list hit its limit. */
export async function loadPendingRows(
  hospitalId: string,
): Promise<{ rows: PendingRow[]; cut: boolean }> {
  const pending = await fetchPendingRequests(hospitalId);
  return { rows: pendingRows(pending, Date.now()), cut: pending.length >= PENDING_LIMIT };
}

/** One request as the page prints it: the patient by code only, the clinician named (staff). */
export interface PendingRow {
  id: string;
  title: string;
  sub: string;
  urgent: boolean;
  stale: boolean;
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: DEFAULT_TIME_ZONE,
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: DEFAULT_TIME_ZONE,
});

/** A request nobody has answered in two days is the clinic's signal, not the patient's. */
export const STALE_MS = 48 * 3_600_000;

/** "40 min" / "5 h" / "2 d": the coarsest unit that is still honest. */
export function waitingLabel(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/**
 * Rows in the order they came (oldest request first; nothing re-sorts them). Age is measured from `createdAt`,
 * the clinic's clock, at one instant for the whole list.
 */
export function pendingRows(rows: readonly PendingRequest[], now: number): PendingRow[] {
  const C = REQUESTS.clinician;
  return rows.map((r) => {
    const age = now - r.createdAt.getTime();
    const where = r.serviceLineName ?? r.departmentName;
    const reason =
      CS.ed.more.reasonLabel[r.reason as keyof typeof CS.ed.more.reasonLabel] ?? r.reason;
    return {
      id: r.id,
      title: `${DAY.format(r.startsAt)} · ${TIME.format(r.startsAt)} · ${where}${r.type === "virtual" ? ` · ${C.virtual}` : ""}`,
      sub: [
        r.patientCode ?? C.provisional,
        r.clinicianName,
        reason,
        C.waiting.replace("{t}", waitingLabel(age)),
      ].join(" · "),
      urgent: r.priority === "urgent",
      stale: age >= STALE_MS,
    };
  });
}
