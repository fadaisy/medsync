import "server-only";

import type { Availability } from "./one-menu";
import type { EmrDb } from "@/lib/emr/db";
import type { AvailabilityEvent, OpenProblem } from "@/supabase/functions/_shared/services-hub";
import { and, eq, gte } from "drizzle-orm";

import { LAB2 } from "@/content/lab-phase-2";
import { availabilityEvents, diagnosticOfferings, hospitals, labTestServices } from "@/db/schema";
import { projectAvailability } from "@/supabase/functions/_shared/services-hub";
import { availabilityFor, orderable } from "./one-menu";

/**
 * One menu (Lab Phase 2 §5.1, §6.6; OM-1..OM-6; E-LAB2-01): what each test is at this hospital today, read
 * from the hub at query time and never copied into the catalogue. One read per menu, then a pure lookup per
 * test (OM-8). A hub that cannot be read makes every test "Not known today" and orderable (OM-3).
 */

export interface Today extends Availability {
  orderable: boolean;
  /** The ordering line in words (Appendix A), or null when there is nothing to say. */
  words: string | null;
}

const hhmm = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

export function todayWords(a: Availability, hospitalName: string): string | null {
  switch (a.state) {
    case "in_house":
      return a.hours ? LAB2.availability.inHouse(a.hours, a.turnaround) : null;
    case "referred":
      return LAB2.availability.referred(a.turnaround);
    case "down_referred":
      return LAB2.availability.down(
        a.since ? hhmm.format(new Date(a.since)) : "today",
        a.turnaround,
      );
    case "not_offered":
      return LAB2.availability.notOffered(hospitalName);
    case "not_linked":
      return LAB2.availability.notLinked;
    case "unknown":
      return LAB2.availability.unknown;
  }
}

export async function menuToday(
  tx: Pick<EmrDb, "select">,
  hospitalId: string,
  now = new Date(),
): Promise<(testCode: string) => Today> {
  const [links, offerings, [h]] = await Promise.all([
    tx.select().from(labTestServices).where(eq(labTestServices.hospitalId, hospitalId)),
    tx.select().from(diagnosticOfferings).where(eq(diagnosticOfferings.hospitalId, hospitalId)),
    tx.select({ name: hospitals.name }).from(hospitals).where(eq(hospitals.id, hospitalId)),
  ]);
  let problems: OpenProblem[] | null;
  try {
    const since = new Date(now.getTime() - 365 * 86_400_000);
    const events = await tx
      .select()
      .from(availabilityEvents)
      .where(and(eq(availabilityEvents.hospitalId, hospitalId), gte(availabilityEvents.at, since)));
    problems = projectAvailability(
      events
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .map(
          (e): AvailabilityEvent => ({
            problemId: e.problemId,
            subjectKind: e.subjectKind,
            subjectRef: e.subjectRef,
            subjectLabel: e.subjectLabel,
            event: e.event as AvailabilityEvent["event"],
            state: e.state as AvailabilityEvent["state"],
            reason: e.reason,
            note: e.note,
            expectedBackAt: e.expectedBackAt?.toISOString() ?? null,
            actorUserId: e.actorUserId,
            at: e.at.toISOString(),
          }),
        ),
      now,
    );
  } catch {
    problems = null; // OM-3, Law 8: fail loud, never "available"
  }
  const link = new Map(links.map((l) => [l.testCode, l.offeringCode]));
  return (testCode) => {
    const code = link.get(testCode) ?? null;
    const o = code ? offerings.find((x) => x.code === code) : undefined;
    const a = availabilityFor({
      offeringCode: code,
      offering: o
        ? {
            kind: o.kind as "lab" | "imaging",
            code: o.code,
            provision: o.provision as "in_house" | "referred" | "not_offered",
            hours: o.hours as "24h" | "scheduled" | null,
            hoursNote: o.hoursNote,
            statedTat: o.statedTat,
            referredTo: o.referredTo,
            confirmedAt: o.confirmedAt?.toISOString() ?? null,
            sectionId: o.sectionId,
          }
        : null,
      problems,
    });
    return { ...a, orderable: orderable(a), words: todayWords(a, h?.name ?? "this hospital") };
  };
}
