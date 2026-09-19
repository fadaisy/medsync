import "server-only";

import type { LineOption } from "@/app/patient/book/_lib/booking";
import { inArray, sql } from "drizzle-orm";

import { firstOpenDay } from "@/app/patient/book/_lib/booking";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { visitRatings } from "@/db/schema/visit-ratings";
import { signedAvatarUrl } from "@/lib/avatars";
import { fetchLines } from "@/lib/scheduling/booking-options";
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

  const providers = await decorate(lines);
  return { lines: lines.map((l) => toLineCard(l, now)), providers };
}

function toLineCard(line: LineOption, now: Date): ServiceLineCard {
  return {
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
      .filter((s) => s.placesLeft > 0 && new Date(s.startsAtIso).getTime() > now.getTime())
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
