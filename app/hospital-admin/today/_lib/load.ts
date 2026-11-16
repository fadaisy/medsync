import "server-only";

import type { TodayInput } from "@/lib/hospital-admin/today";
import { and, count, eq, gte, lt, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { appointments } from "@/db/schema/scheduling";
import { fetchPendingRequests } from "@/lib/hospital-admin/pending";
import { availabilityNow, loadCapabilities } from "@/lib/services/data";
import { getHospitalPendingStaffCount } from "../../_lib/staff-pending-count";
import { loadCopyRequests } from "../../requests/_lib/copies";

/** Kampala keeps UTC+3 all year: today's bounds there, as instants. */
export function kampalaDay(now: number): { from: Date; to: Date } {
  const shifted = new Date(now + 3 * 3_600_000);
  const start =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 3 * 3_600_000;
  return { from: new Date(start), to: new Date(start + 86_400_000) };
}

const NOT_BOOKED = ["cancelled", "declined", "void", "rescheduled"];

const soft = async <T>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch {
    return null;
  }
};

/** Everything Today reads, at one instant. Each source falls back to null on its own (ADR 0517). */
export async function loadToday(
  hospitalId: string,
  userId: string,
  dueText: (isoDate: string) => string,
): Promise<TodayInput & { now: number }> {
  const now = Date.now();
  const day = kampalaDay(now);
  const [booked, pending, review, avail, caps, copies] = await Promise.all([
    soft(
      db
        .select({ n: count() })
        .from(appointments)
        .where(
          and(
            eq(appointments.hospitalId, hospitalId),
            gte(appointments.startsAt, day.from),
            lt(appointments.startsAt, day.to),
            notInArray(appointments.status, NOT_BOOKED),
          ),
        )
        .then((r) => r[0]?.n ?? 0),
    ),
    soft(fetchPendingRequests(hospitalId)),
    soft(getHospitalPendingStaffCount(hospitalId)),
    soft(availabilityNow(hospitalId)),
    soft(loadCapabilities(hospitalId)),
    soft(loadCopyRequests(hospitalId)),
  ]);
  return {
    now,
    booked,
    pending:
      pending?.map((p) => ({
        urgent: p.priority === "urgent",
        waitedMs: now - p.createdAt.getTime(),
      })) ?? null,
    review,
    unavailable: avail?.count ?? null,
    verify:
      caps
        ?.filter((c) => c.pending)
        .map((c) => ({ byName: c.pending!.byName, mine: c.pending!.byUserId === userId })) ?? null,
    copies: copies?.map((c) => ({ code: c.code, dueText: dueText(c.dueOn) })) ?? null,
  };
}
