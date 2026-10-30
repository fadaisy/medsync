import type { EmrDb } from "@/lib/emr/db";
import type { RosterRole, RosterShift } from "@/db/schema/pharmacy-rework";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { pharmacyAttestations } from "@/db/schema/pharmacy-dispensing";
import { pharmacyWitnessRequests } from "@/db/schema/pharmacy-rework";
import { users } from "@/db/schema/users";
import { witnessCandidates } from "@/lib/pharmacy/controlled-read";
import { EmrWriteError } from "@/lib/emr/write/context";

export { EmrWriteError as WitnessError };

/**
 * The witness on their own device (rework PRD §6.5, S3, S10). The actor picks a person on duty; the request appears on
 * the witness's screen; they approve inside their own signed-in session, which writes a `session` attestation for this
 * actor. The ledger guard then takes it once, within 10 minutes, at a place where the witness is on duty.
 */
export const REQUEST_LIFE_MS = 10 * 60_000;

export interface DutyPerson {
  userId: string;
  name: string;
  role: RosterRole | null;
  shift: RosterShift | null;
}

/**
 * Who may witness here now: people on the duty roster at this place (or the whole pharmacy). A hospital with no roster
 * yet falls back to the signed witness list, so nothing stops before the roster is set up; Going live lists it.
 */
export async function witnessesOnDuty(
  db: EmrDb,
  input: { hospitalId: string; actorUserId: string; locationId: string | null },
): Promise<{ roster: boolean; people: DutyPerson[] }> {
  const rows = (await db.execute(sql`
    SELECT r.user_id AS "userId", coalesce(u.full_name, u.email) AS name, r.role, r.shift
      FROM pharmacy_duty_roster r JOIN users u ON u.id = r.user_id
     WHERE r.hospital_id = ${input.hospitalId} AND r.ended_at IS NULL AND r.user_id <> ${input.actorUserId}
       AND (r.location_id IS NULL OR r.location_id = ${input.locationId})
       AND private.pharmacy_on_duty(r.hospital_id, r.user_id, ${input.locationId}, now())
     ORDER BY r.role, name`)) as unknown as DutyPerson[];
  const anyRoster = (await db.execute(sql`
    SELECT 1 FROM pharmacy_duty_roster WHERE hospital_id = ${input.hospitalId} AND ended_at IS NULL LIMIT 1`)) as unknown as unknown[];
  if (anyRoster.length) {
    const seen = new Set<string>();
    return { roster: true, people: rows.filter((r) => !seen.has(r.userId) && !!seen.add(r.userId)) };
  }
  const list = await witnessCandidates(db, input.hospitalId, input.actorUserId);
  return {
    roster: false,
    people: list.map((w) => ({ userId: w.userId, name: w.label, role: null, shift: null })),
  };
}

export async function requestWitness(
  db: EmrDb,
  input: {
    hospitalId: string;
    actorUserId: string;
    witnessUserId: string;
    locationId: string | null;
    purpose: string;
    summary: string;
  },
): Promise<{ id: string }> {
  if (input.witnessUserId === input.actorUserId)
    throw new EmrWriteError("forbidden", "You cannot witness your own entry.");
  const duty = await witnessesOnDuty(db, input);
  if (!duty.people.some((p) => p.userId === input.witnessUserId))
    throw new EmrWriteError("forbidden", "That person is not on duty here now. Choose someone on the roster.");
  const [row] = await db
    .insert(pharmacyWitnessRequests)
    .values({
      hospitalId: input.hospitalId,
      actorUserId: input.actorUserId,
      witnessUserId: input.witnessUserId,
      locationId: input.locationId,
      purpose: input.purpose,
      summary: input.summary,
    })
    .returning({ id: pharmacyWitnessRequests.id });
  return { id: row!.id };
}

/** The actor's screen asks until the witness answers: waiting, approved (with the approval's id) or declined. */
export async function witnessRequestState(db: EmrDb, requestId: string, actorUserId: string) {
  const [r] = await db
    .select({
      status: pharmacyWitnessRequests.status,
      attestationId: pharmacyWitnessRequests.attestationId,
      createdAt: pharmacyWitnessRequests.createdAt,
    })
    .from(pharmacyWitnessRequests)
    .where(and(eq(pharmacyWitnessRequests.id, requestId), eq(pharmacyWitnessRequests.actorUserId, actorUserId)));
  if (!r) return null;
  const expired = r.status === "waiting" && Date.now() - r.createdAt.getTime() > REQUEST_LIFE_MS;
  return { status: expired ? ("expired" as const) : r.status, attestationId: r.attestationId };
}

/** The witness's screen: requests waiting for them, newest first, still inside their life. */
export async function waitingForWitness(db: EmrDb, witnessUserId: string, now = new Date()) {
  return db
    .select({
      id: pharmacyWitnessRequests.id,
      purpose: pharmacyWitnessRequests.purpose,
      summary: pharmacyWitnessRequests.summary,
      createdAt: pharmacyWitnessRequests.createdAt,
      actorName: sql<string>`coalesce(${users.fullName}, ${users.email})`,
    })
    .from(pharmacyWitnessRequests)
    .innerJoin(users, eq(users.id, pharmacyWitnessRequests.actorUserId))
    .where(
      and(
        eq(pharmacyWitnessRequests.witnessUserId, witnessUserId),
        eq(pharmacyWitnessRequests.status, "waiting"),
        gte(pharmacyWitnessRequests.createdAt, new Date(now.getTime() - REQUEST_LIFE_MS)),
      ),
    )
    .orderBy(desc(pharmacyWitnessRequests.createdAt));
}

/** The witness answers in their own session. Approving writes the attestation the actor's entry will use once. */
export async function answerWitnessRequest(
  db: EmrDb,
  input: { requestId: string; witnessUserId: string; approve: boolean },
  now = new Date(),
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(pharmacyWitnessRequests)
      .where(eq(pharmacyWitnessRequests.id, input.requestId))
      .for("update");
    if (!r || r.witnessUserId !== input.witnessUserId)
      throw new EmrWriteError("not_found", "This request is not for you.");
    if (r.status !== "waiting") throw new EmrWriteError("conflict", "This request was already answered.");
    if (now.getTime() - r.createdAt.getTime() > REQUEST_LIFE_MS)
      throw new EmrWriteError("conflict", "This request is more than 10 minutes old. Ask them to send it again.");
    let attestationId: string | null = null;
    if (input.approve) {
      const [a] = await tx
        .insert(pharmacyAttestations)
        .values({
          hospitalId: r.hospitalId,
          actorUserId: r.actorUserId,
          attesterUserId: input.witnessUserId,
          purpose: "witness",
          action: r.purpose.slice(0, 80),
          method: "session",
          outcome: "passed",
          attestedAt: now,
        })
        .returning({ id: pharmacyAttestations.id });
      attestationId = a!.id;
    }
    await tx
      .update(pharmacyWitnessRequests)
      .set({ status: input.approve ? "approved" : "declined", attestationId, decidedAt: now })
      .where(eq(pharmacyWitnessRequests.id, r.id));
    return { id: attestationId ?? r.id };
  });
}
