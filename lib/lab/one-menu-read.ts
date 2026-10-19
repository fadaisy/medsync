import "server-only";

import type { Availability } from "./one-menu";
import type { SectionKey } from "./test-menu";
import type { EmrDb } from "@/lib/emr/db";
import type { AvailabilityEvent, OpenProblem } from "@/supabase/functions/_shared/services-hub";
import { and, eq, gte, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { LAB2 } from "@/content/lab-phase-2";
import {
  availabilityEvents,
  diagnosticOfferings,
  hospitalDepartments,
  hospitals,
  testCatalogue,
} from "@/db/schema";
import { projectAvailability } from "@/supabase/functions/_shared/services-hub";
import { availabilityFor, orderable } from "./one-menu";
import { hubSectionCode, sectionFor } from "./test-menu";

/**
 * One menu (Lab Phase 2 §5.1, §6.6; OM-1..OM-6; E-LAB2-01): what each test is at this hospital today, read
 * from the hub at query time and never copied into the catalogue. One read per menu, then a pure lookup per
 * test (OM-8). A hub that cannot be read makes every test "Not known today" and orderable (OM-3).
 * Lab test menu v2 (TM-3): the offering is keyed by the test itself, so `offering_code` is the test id and no
 * linking step remains; a test with no row is not on this hospital's menu.
 */
const parent = alias(hospitalDepartments, "parent");

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
  const [offerings, [h], tests, units] = await Promise.all([
    tx
      .select()
      .from(diagnosticOfferings)
      .where(
        and(eq(diagnosticOfferings.hospitalId, hospitalId), eq(diagnosticOfferings.kind, "lab")),
      ),
    tx.select({ name: hospitals.name }).from(hospitals).where(eq(hospitals.id, hospitalId)),
    tx
      .select({ code: testCatalogue.code, section: testCatalogue.section })
      .from(testCatalogue)
      .where(and(isNull(testCatalogue.hospitalId), eq(testCatalogue.kind, "lab"))),
    tx
      .select({ id: hospitalDepartments.id, code: hospitalDepartments.catalogueCode })
      .from(hospitalDepartments)
      .innerJoin(parent, eq(parent.id, hospitalDepartments.parentId))
      .where(
        and(
          eq(hospitalDepartments.hospitalId, hospitalId),
          eq(parent.catalogueCode, "LABORATORY"),
          isNull(hospitalDepartments.archivedAt),
        ),
      ),
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
  const sectionOf = new Map(tests.map((t) => [t.code, t.section as SectionKey | null]));
  const byCode = new Map(offerings.map((o) => [o.code, o]));
  return (testCode) => {
    const o = byCode.get(testCode);
    const code = o ? testCode : null;
    // TM-4: the hub unit for the test's effective section, so a section outage reaches it (LW-3 for legacy rows).
    const section = sectionFor(
      o ? { sectionOverride: o.sectionOverride as SectionKey | null } : null,
      { section: sectionOf.get(testCode) ?? null },
    );
    const unit = section ? units.find((u) => u.code === hubSectionCode(section))?.id : undefined;
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
            sectionId: o.sectionId ?? unit ?? null,
          }
        : null,
      problems,
    });
    return { ...a, orderable: orderable(a), words: todayWords(a, h?.name ?? "this hospital") };
  };
}
