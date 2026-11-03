import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import type { PharmacyAccess, PharmacyPermission } from "@/lib/pharmacy/access";
import type { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";

import { ROSTER_REFUSAL } from "@/content/pharmacy-roster";
import { SETUP_REFUSAL } from "@/content/pharmacy-setup";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";

/**
 * The one shape every Pharmacy Phase 1 write takes (Section 8's house contract; PA2-4).
 *
 * Zod → the actor (who, where, which permissions, the acting point) → one transaction as the actor
 * (identity set for the audit triggers) → the point checked inside it (it belongs to the hospital,
 * and is live, set up or once-live as the action needs) → the write → `{ id, serverTime }`.
 * Permissions come from the dispensing map (map v2 outside production, v1 in it; D-PH1-03) plus
 * `pharmacy.manage` from a hub head assignment, read in SQL by `private.pharmacy_can_user` (0122).
 *
 * Pure of Next.js: the action files resolve the actor from the session and pass it in, so the PGlite
 * lane drives every write with an injected database and clock.
 */

export interface PharmacyActor {
  userId: string;
  hospitalId: string;
  cadreCode: string;
  /** The approved cadre's own name: what audit lines and screens show (Law 4). */
  cadreName: string;
  /** The acting dispensing point (D-PH1-45), stored on every event this actor writes. */
  pointId: string | null;
  access: PharmacyAccess;
}

export interface PharmacyPoint {
  id: string;
  hospitalId: string;
  name: string;
  serves: "window" | "wards" | "emergency" | "all";
  liveAt: Date | null;
  switchedOffAt: Date | null;
  labelMode: "printed" | "by_hand";
  countFreshnessDays: number | null;
  phone: string | null;
}

/** What an action needs of the acting point (PA2-4). */
export type PointNeed =
  /** a review, a supply decision, an outcome, a hand-over */
  | "live"
  /** stock set-up, receipts, counts, adjustments, transfers, products: pharmacyDispensing on */
  | "setup"
  /** closing an open line, confirming it filled, correcting a record: live now or once */
  | "live_or_was_live"
  /** sheets, back-entry, drills: pharmacyDowntime on */
  | "downtime"
  /** settings and reads that are not at a point */
  | "none";

export interface PharmacyNeed {
  /** Any one of these is enough. `pharmacy.manage` is checked in SQL, inside the transaction. */
  permission: PharmacyPermission | readonly PharmacyPermission[];
  point: PointNeed;
}

export interface PharmacyCtx {
  tx: EmrTx;
  actor: PharmacyActor;
  point: PharmacyPoint | null;
  now: Date;
  /** Held after the check: true when the actor also holds `pharmacy.manage`. */
  manages: boolean;
}

export const isLive = (p: PharmacyPoint) => p.liveAt !== null && p.switchedOffAt === null;

/** ADR 0265: every writer of a line takes this lock first, so one line is handed over once. */
export async function lockLine(tx: EmrTx, prescriptionId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-line:${prescriptionId}`}))`,
  );
}

export async function loadPoint(tx: EmrTx, hospitalId: string, pointId: string) {
  const [p] = await tx
    .select({
      id: pharmacyDispensingPoints.departmentId,
      hospitalId: pharmacyDispensingPoints.hospitalId,
      name: hospitalDepartments.name,
      serves: pharmacyDispensingPoints.serves,
      liveAt: pharmacyDispensingPoints.liveAt,
      switchedOffAt: pharmacyDispensingPoints.switchedOffAt,
      labelMode: pharmacyDispensingPoints.labelMode,
      countFreshnessDays: pharmacyDispensingPoints.countFreshnessDays,
      phone: pharmacyDispensingPoints.phone,
    })
    .from(pharmacyDispensingPoints)
    .innerJoin(
      hospitalDepartments,
      eq(hospitalDepartments.id, pharmacyDispensingPoints.departmentId),
    )
    .where(
      and(
        eq(pharmacyDispensingPoints.departmentId, pointId),
        eq(pharmacyDispensingPoints.hospitalId, hospitalId),
        isNull(hospitalDepartments.archivedAt),
      ),
    )
    .for("share", { of: pharmacyDispensingPoints });
  return (p as PharmacyPoint | undefined) ?? null;
}

async function holdsManage(tx: EmrTx, actor: PharmacyActor): Promise<boolean> {
  const rows = (await tx.execute(
    sql`SELECT private.pharmacy_can_user(${actor.userId}::uuid, ${actor.hospitalId}::uuid, 'pharmacy.manage') AS ok`,
  )) as unknown as { ok: boolean }[] | { rows: { ok: boolean }[] };
  const list = Array.isArray(rows) ? rows : rows.rows;
  return list[0]?.ok === true;
}

const forbid = (m: string) => new EmrWriteError("forbidden", m);

export async function withPharmacyWrite<T>(
  actor: PharmacyActor,
  need: PharmacyNeed,
  fn: (ctx: PharmacyCtx) => Promise<T>,
  options?: { database?: EmrDb; now?: Date },
): Promise<T> {
  return asClinicalWriter(
    { userId: actor.userId, hospitalId: actor.hospitalId },
    async (tx) => {
      const wanted = typeof need.permission === "string" ? [need.permission] : need.permission;
      const manages = await holdsManage(tx, actor);
      const holds = (p: PharmacyPermission) =>
        p === "pharmacy.manage" ? manages : actor.access.permissions.has(p);
      if (!wanted.some(holds)) throw forbid("You do not have permission to do this.");

      let point: PharmacyPoint | null = null;
      if (need.point !== "none") {
        if (!actor.pointId)
          throw new EmrWriteError("invalid", "Choose the dispensing point you are working at.");
        point = await loadPoint(tx, actor.hospitalId, actor.pointId);
        if (!point) throw forbid("That dispensing point is not at your hospital.");
        if (need.point === "live" && !isLive(point))
          throw new EmrWriteError("config", `${point.name} is not live for dispensing.`);
        if (need.point === "live_or_was_live" && point.liveAt === null)
          throw new EmrWriteError("config", `${point.name} has never been live for dispensing.`);
      }
      return fn({ tx, actor, point, now: options?.now ?? new Date(), manages });
    },
    options?.database,
  );
}

const isUniqueViolation = (e: unknown): boolean =>
  !!e &&
  typeof e === "object" &&
  (("code" in e && (e as { code: unknown }).code === "23505") ||
    ("cause" in e && isUniqueViolation((e as { cause: unknown }).cause)));

/**
 * Zod → the actor → the write in one transaction. A unique-key race on a client key is retried once:
 * the retry finds the committed row and the write returns it (SU-10). Errors the database raises
 * on purpose (the stock guard, Law 3 at commit) come back as a refusal in words, never a throw.
 */
export async function runPharmacyWrite<I, R extends { id: string }>(
  schema: z.ZodType<I>,
  raw: unknown,
  actor: PharmacyActor,
  need: PharmacyNeed,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
  options?: { database?: EmrDb; now?: Date },
): Promise<ActionResult<R>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  const attempt = () => withPharmacyWrite(actor, need, (ctx) => write(ctx, parsed.data), options);
  try {
    let result: R;
    try {
      result = await attempt();
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      result = await attempt();
    }
    return { ok: true, id: result.id, serverTime: new Date().toISOString(), data: result };
  } catch (e) {
    const guard = databaseRefusal(e);
    if (guard) return { ok: false, code: "conflict", error: guard };
    return actionError(e);
  }
}

/** The stock guard's and Law 3's own words, when the database refused (0124, 0126). */
export function databaseRefusal(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m =
    msg.match(/pharmacy_stock: batch (\S+) holds (-?\d+)/) ??
    msg.match(/pharmacy_stock: batch (\S+) expired on (\S+)/);
  if (m && msg.includes("holds")) return `Batch ${m[1]} now holds ${m[2]}. Choose again.`;
  if (m) return `Batch ${m[1]} expired on ${m[2]}. Remove it from the shelf.`;
  if (msg.includes("(Law 3)"))
    return "The supply and its stock movement did not match. Nothing was recorded.";
  // Rework 0265: the witness and back-entry rules, in words.
  const words: [string, string][] = [
    [
      "leaves only with a witness",
      "A controlled medicine needs a witness. Ask someone on duty to approve it.",
    ],
    [
      "approval was already used",
      "That witness approval was already used. Ask the witness to approve this one.",
    ],
    ["more than 10 minutes old", "The witness approval is more than 10 minutes old. Ask again."],
    ["not on duty here now", "That witness is not on duty here now. Choose someone on the roster."],
    ["does not stand for this person", "That witness approval was for someone else. Ask again."],
    [
      "mirrors one movement exactly",
      "A correction must mirror the original line exactly. Nothing was recorded.",
    ],
    // 0273: the roster's guard.
    ["not making the roster", ROSTER_REFUSAL.viewOnly],
    ["this week is published", ROSTER_REFUSAL.locked],
    ["pharmacy_duty_roster: on leave", ROSTER_REFUSAL.onLeave],
    ["licence expired or not recorded", ROSTER_REFUSAL.licence],
    ["the shift is full", ROSTER_REFUSAL.full],
    ["not listed at this place", ROSTER_REFUSAL.notHere],
    ["one duty is one date", ROSTER_REFUSAL.oneDuty],
    ["only pharmacy places are rostered", ROSTER_REFUSAL.pharmacyOnly],
    ["pharmacy_roster_requests:", ROSTER_REFUSAL.requestMoved],
    ["a delegate who can publish", ROSTER_REFUSAL.publishOnly],
    ["only the in-charge hands", ROSTER_REFUSAL.inChargeOnly],
    ["the proposer cannot be the second signer", ROSTER_REFUSAL.proposerNotSecond],
    ["pharmacy_roster_delegations: the end date", ROSTER_REFUSAL.endPassed],
    ["pharmacy_roster_week_events: the week is already", ROSTER_REFUSAL.weekState],
    // 0274: the set-up tabs' guards.
    ...SETUP_REFUSAL,
  ];
  const lines = msg.match(/pharmacy_locations: (\d+) lines are still here/);
  if (lines) return `Move or issue out its stock first: ${lines[1]} lines are still here.`;
  const w = words.find(([k]) => msg.includes(k));
  if (w) return w[1];
  const count = msg.match(/pharmacy_stock: batch (\S+) needs a count/);
  if (count)
    return `Batch ${count[1]} was entered from paper after a network cut. Count it before giving more.`;
  const cause = e && typeof e === "object" && "cause" in e ? (e as { cause: unknown }).cause : null;
  return cause ? databaseRefusal(cause) : null;
}
