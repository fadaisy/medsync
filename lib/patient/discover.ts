import "server-only";

import type { LineOption } from "@/app/patient/book/_lib/booking";
import type { FeeInputs } from "@/supabase/functions/_shared/fees";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { firstOpenDay, sessionTakeable } from "@/app/patient/book/_lib/booking";
import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { cadres } from "@/db/schema/reference-data";
import { appointments } from "@/db/schema/scheduling";
import { serviceLineFees, serviceLines } from "@/db/schema/service-lines";
import { users } from "@/db/schema/users";
import { visitRatings } from "@/db/schema/visit-ratings";
import { signedAvatarUrl } from "@/lib/avatars";
import { fetchLines } from "@/lib/scheduling/booking-options";
import { feeRange, rangeLine } from "@/supabase/functions/_shared/fees";
import { DEFAULT_TIME_ZONE, localDateKey } from "@/supabase/functions/_shared/slots";

/**
 * What the patient home shows to someone who has not booked yet: the clinics
 * their hospital runs, and the clinicians they could pick — the web's half of
 * ADR 0085's presentation, which the phone has had since Gate C and which that
 * ADR records as the outstanding follow-up for `app/patient/book`.
 *
 * Every number here is one the tables hold. ADR 0085 is explicit that a
 * reference design's fullness ("8 years' experience", "3.5k patients") is
 * earned over time, not printed: a clinician with no ratings says "No ratings
 * yet", and a line with nothing open says so rather than implying a day.
 *
 * ponytail: this rides `fetchLines`, which already ships the whole hospital on
 * first paint for the booking wizard — the home asks for the same data one
 * screen earlier. Ceiling: a Mulago-sized roster rendered twice per session.
 * Upgrade path: cache `fetchLines` per (hospital, day) — both callers would
 * take the same entry.
 */

/** A clinician as the home presents them: a face, a name, and what is true about them. */
export interface ProviderCard {
  userId: string;
  fullName: string;
  departmentName: string;
  /** Signed URL, or null → the card draws a monogram. Never a stock face (ADR 0085). */
  photoUrl: string | null;
  /** `null` when nobody has rated them yet — the card says "No ratings yet". */
  rating: { average: number; count: number } | null;
  /** PRD §2.7 continuity: this clinician last saw this patient in this department. */
  seenBefore: boolean;
  /** "YYYY-MM-DD" of their first open day, or null when they have none in the window. */
  firstOpenDate: string | null;
  /** The service line the card books into. */
  lineId: string;
}

/** A service line as a category card — the reference's "General Visits" tile. */
export interface ServiceLineCard {
  id: string;
  name: string;
  departmentName: string;
  capacityMode: string;
  /** Days the facility itself promises (PRD §2.4). */
  timeToCareDays: number;
  /** The soonest thing actually open inside this line, or null. */
  soonest: { dateKey: string; placesLeft: number | null } | null;
  /** How many clinicians a patient could pick here (slot mode); 0 in session mode. */
  clinicianCount: number;
  /**
   * What the clinic charges, as a plain current amount or a range over its
   * cadre overrides (ADR 0092) — null when the line is free. Stated on the
   * tile because MoH §3.4.2 obliges a displayed price list, never as a lure.
   */
  feeLine: string | null;
}

export interface Discovery {
  lines: ServiceLineCard[];
  providers: ProviderCard[];
}

/**
 * Confidential lines never appear on a browse surface (PRD §2.9): a shared
 * handset must not show that this hospital runs one, let alone that the
 * patient is looking at it.
 */
export async function fetchDiscovery(
  hospitalId: string,
  patientUserId: string,
  now: Date = new Date(),
): Promise<Discovery> {
  const all = await fetchLines(hospitalId, patientUserId, now);
  const lines = all.filter((l) => !l.confidential);
  if (lines.length === 0) return { lines: [], providers: [] };

  const [providers, feeByLine] = await Promise.all([
    decorate(lines),
    feeLinesFor(lines.map((l) => l.id)),
  ]);
  return {
    lines: lines.map((l) => toLineCard(l, now, feeByLine.get(l.id) ?? null)),
    providers,
  };
}

/**
 * The fee line per service line: posture + base + every cadre override,
 * resolved by the shared `feeRange`. One read for the lines, one for the
 * overrides; a free line costs nothing beyond the first.
 */
export async function feeLinesFor(lineIds: string[]): Promise<Map<string, string | null>> {
  const inputs = await feeInputsFor(lineIds);
  return new Map([...inputs].map(([id, i]) => [id, rangeLine(feeRange(i))]));
}

/** The raw pricing per line — posture, base, every cadre override — for callers that know the cadre. */
export async function feeInputsFor(lineIds: string[]): Promise<Map<string, FeeInputs>> {
  const out = new Map<string, FeeInputs>();
  if (lineIds.length === 0) return out;
  const [rows, overrides] = await Promise.all([
    db
      .select({
        id: serviceLines.id,
        name: serviceLines.name,
        posture: serviceLines.paymentPosture,
        baseFeeUgx: serviceLines.feeUgx,
      })
      .from(serviceLines)
      .where(inArray(serviceLines.id, lineIds)),
    db
      .select({
        serviceLineId: serviceLineFees.serviceLineId,
        cadreId: serviceLineFees.cadreId,
        cadreName: cadres.name,
        feeUgx: serviceLineFees.feeUgx,
      })
      .from(serviceLineFees)
      .innerJoin(cadres, eq(cadres.id, serviceLineFees.cadreId))
      .where(inArray(serviceLineFees.serviceLineId, lineIds)),
  ]);
  for (const r of rows) {
    out.set(r.id, {
      posture: r.posture,
      baseFeeUgx: r.baseFeeUgx,
      lineName: r.name,
      cadreFees: overrides.filter((o) => o.serviceLineId === r.id),
    });
  }
  return out;
}

function toLineCard(line: LineOption, now: Date, feeLine: string | null): ServiceLineCard {
  return {
    feeLine,
    id: line.id,
    name: line.name,
    departmentName: line.departmentName,
    capacityMode: line.capacityMode,
    timeToCareDays: line.timeToCareDays,
    soonest: soonestIn(line, now),
    clinicianCount: line.clinicians.length,
  };
}

/**
 * The first thing a patient could actually take in this line — a published
 * clinic day with a place left, or a clinician's first open slot. Null when
 * the line has nothing open, which the card states plainly rather than
 * dressing up.
 */
function soonestIn(line: LineOption, now: Date): ServiceLineCard["soonest"] {
  if (line.capacityMode === "session") {
    const open = line.sessions
      .filter((s) => sessionTakeable(s) && new Date(s.startsAtIso).getTime() > now.getTime())
      .sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso))[0];
    return open
      ? {
          dateKey: localDateKey(new Date(open.startsAtIso), DEFAULT_TIME_ZONE),
          placesLeft: open.placesLeft,
        }
      : null;
  }
  const days = line.clinicians
    .map((c) => firstOpenDay(c))
    .filter((d): d is string => !!d)
    .sort();
  return days[0] ? { dateKey: days[0], placesLeft: null } : null;
}

/** Photos and ratings for every clinician a patient could pick, one read each. */
async function decorate(lines: LineOption[]): Promise<ProviderCard[]> {
  const byUser = new Map<string, ProviderCard>();
  for (const line of lines) {
    for (const c of line.clinicians) {
      // A clinician can cover more than one line; the card names the first,
      // and continuity wins if any of them saw this patient.
      const existing = byUser.get(c.userId);
      if (existing) {
        existing.seenBefore ||= c.seenBefore;
        continue;
      }
      byUser.set(c.userId, {
        userId: c.userId,
        fullName: c.fullName,
        departmentName: line.departmentName,
        photoUrl: null,
        rating: null,
        seenBefore: c.seenBefore,
        firstOpenDate: firstOpenDay(c) ?? null,
        lineId: line.id,
      });
    }
  }
  const ids = [...byUser.keys()];
  if (ids.length === 0) return [];

  const [avatars, ratings] = await Promise.all([
    db
      .select({ id: users.id, avatarPath: users.avatarPath })
      .from(users)
      .where(inArray(users.id, ids)),
    // The `clinician_rating_summary` view aggregates the same rows; reading
    // the table directly keeps this one query away from a GATED view that a
    // dev database may not carry yet (migration 0056).
    db
      .select({
        clinicianUserId: visitRatings.clinicianUserId,
        average: sql<number>`avg(${visitRatings.stars})::float`,
        count: sql<number>`count(*)::int`,
      })
      .from(visitRatings)
      .where(inArray(visitRatings.clinicianUserId, ids))
      .groupBy(visitRatings.clinicianUserId),
  ]);

  for (const r of ratings) {
    const card = byUser.get(r.clinicianUserId);
    if (card && r.count > 0) card.rating = { average: r.average, count: r.count };
  }
  await Promise.all(
    avatars.map(async (a) => {
      const card = byUser.get(a.id);
      if (card) card.photoUrl = await signedAvatarUrl(a.avatarPath);
    }),
  );

  // Continuity first (PRD §2.7), then whoever has a day soonest, then by name.
  return [...byUser.values()].sort(
    (a, b) =>
      Number(b.seenBefore) - Number(a.seenBefore) ||
      (a.firstOpenDate ?? "9999").localeCompare(b.firstOpenDate ?? "9999") ||
      a.fullName.localeCompare(b.fullName),
  );
}

/* ─── One clinician, in full — the reference design's first screen ── */

/**
 * Everything the provider screen shows. Each number is one the tables hold:
 * `visit_ratings` for the stars and the review count, attended appointments
 * for the patients seen, `staff_affiliations.created_at` for how long they
 * have been on MedSync at this hospital. The reference's "8 Years Experience"
 * is not among them — nothing records a career — so the slot states what we
 * do know and labels it accurately (ADR 0085: never a number the table does
 * not contain).
 */
export interface ProviderDetail extends ProviderCard {
  /** The registered cadre — the reference's "MBBS, MD · Medicine Specialist" line. */
  cadreName: string | null;
  /** Its id, so the fee shown on this screen is THIS clinician's quote, never the line's range. */
  cadreId: string | null;
  /** Distinct patients with an attended visit. Zero on day one, and says so. */
  patientsSeen: number;
  /** When this clinician joined this hospital on MedSync, ISO — null if unknown. */
  withUsSinceIso: string | null;
  /** A video visit is a real affordance only when the clinician allows one. */
  allowVirtual: boolean;
  /** Open slots by "YYYY-MM-DD", the day strip's source. */
  slotsByDate: Record<string, ReadonlyArray<{ startsAtIso: string; endsAtIso: string }>>;
  lineName: string;
  departmentId: string;
}

/** Attended: the patient was actually there (the same set `pt-rate-visit` accepts). */
const ATTENDED_STATUSES = ["arrived", "in_progress", "completed"] as const;

export async function fetchProviderDetail(
  hospitalId: string,
  patientUserId: string,
  clinicianUserId: string,
  now: Date = new Date(),
): Promise<ProviderDetail | null> {
  const lines = (await fetchLines(hospitalId, patientUserId, now)).filter((l) => !l.confidential);
  // The line this clinician covers — the one whose slots the screen books into.
  const line = lines.find((l) => l.clinicians.some((c) => c.userId === clinicianUserId));
  const clinician = line?.clinicians.find((c) => c.userId === clinicianUserId);
  if (!line || !clinician) return null;

  const [card] = await decorate([{ ...line, clinicians: [clinician] } as LineOption]);
  if (!card) return null;

  const [affiliationRows, seen] = await Promise.all([
    db
      .select({
        createdAt: staffAffiliations.createdAt,
        cadreName: cadres.name,
        cadreId: cadres.id,
      })
      .from(staffAffiliations)
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          eq(staffAffiliations.userId, clinicianUserId),
          eq(staffAffiliations.hospitalId, hospitalId),
          inArray(staffAffiliations.state, ["active", "approved"]),
        ),
      )
      .orderBy(asc(staffAffiliations.createdAt))
      .limit(1),
    db
      .select({ n: sql<number>`count(distinct ${appointments.patientUserId})::int` })
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicianUserId, clinicianUserId),
          eq(appointments.hospitalId, hospitalId),
          inArray(appointments.status, [...ATTENDED_STATUSES]),
        ),
      ),
  ]);

  const affiliation = affiliationRows[0] ?? null;
  return {
    ...card,
    cadreName: affiliation?.cadreName ?? null,
    cadreId: affiliation?.cadreId ?? null,
    patientsSeen: seen[0]?.n ?? 0,
    withUsSinceIso: affiliation?.createdAt?.toISOString() ?? null,
    allowVirtual: clinician.allowVirtual,
    slotsByDate: clinician.slotsByDate,
    lineName: line.name,
    departmentId: line.departmentId,
  };
}
