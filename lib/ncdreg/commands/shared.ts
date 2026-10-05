/**
 * Helpers shared by the command handlers: record versions (G2), consistency queries (G3),
 * appointments and their reminders (E3), enabled conditions (I4), and the duplicate search (A1, A2).
 */
import "server-only";

import type { NcdContext } from "../context";
import type { NcdTx } from "../db";
import type { Candidate, IdentityFacts, TieredCandidate } from "../identity";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  ncdAppointment,
  ncdConditionSetting,
  ncdDefinitionVersion,
  ncdEvent,
  ncdFacilitySettings,
  ncdNameIndex,
  ncdPerson,
  ncdQuery,
  ncdRecordVersion,
  ncdRegistration,
  ncdReminder,
  ncdVisit,
} from "@/db/schema";
import { blindIndex } from "@/lib/encryption";
import { NcdError } from "../context";
import { dec, hospitalNumberHmac, nameTokenHmacs, nationalIdHmac, phoneHmac } from "../crypto";
import { tierCandidates } from "../identity";
import { medicineByCode } from "../standard/code-lists";
import { consistencyFindings } from "../standard/validation";

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** G2: keep the row as it was, with who, when and why, before changing it. */
export async function snapshotVersion(
  tx: NcdTx,
  ctx: NcdContext,
  table: "ncd_person" | "ncd_visit" | "ncd_registration" | "ncd_review" | "ncd_event",
  row: { id: string; personId?: string; version: number } & Record<string, unknown>,
  reason: string,
) {
  await tx.insert(ncdRecordVersion).values({
    facilityId: ctx.facilityId,
    personId: (row.personId as string | undefined) ?? row.id,
    recordTable: table,
    recordId: row.id,
    version: row.version,
    data: row as Record<string, unknown>,
    reason,
    changedBy: ctx.userId,
    changedAt: ctx.enteredAt,
  });
}

export type FacilitySettings = typeof ncdFacilitySettings.$inferSelect;
export async function facilitySettings(tx: NcdTx, ctx: NcdContext): Promise<FacilitySettings> {
  const [s] = await tx
    .select()
    .from(ncdFacilitySettings)
    .where(eq(ncdFacilitySettings.facilityId, ctx.facilityId));
  return (
    s ?? {
      facilityId: ctx.facilityId,
      timeZone: "Africa/Kampala",
      glucoseUnit: "mmol",
      creatinineUnit: "umol",
      reminderBeforeDays: 2,
      reminderAfterDays: 3,
      reminderMaxMissed: 2,
      sendWindowStart: "08:00:00",
      sendWindowEnd: "18:00:00",
      defaultIntervalWeeks: [4, 8, 12],
      liveSmsEnabled: false,
      hospitalDisplayName: null,
      clinicPhone: null,
      version: 0,
      updatedBy: null,
      updatedAt: new Date(0),
    }
  );
}

/** The condition codes enabled at the facility: the latest setting per module, else its default. */
export async function enabledConditions(tx: NcdTx, ctx: NcdContext): Promise<Set<string>> {
  const rows = await tx
    .selectDistinctOn([ncdConditionSetting.conditionCode], {
      code: ncdConditionSetting.conditionCode,
      enabled: ncdConditionSetting.enabled,
    })
    .from(ncdConditionSetting)
    .where(eq(ncdConditionSetting.facilityId, ctx.facilityId))
    .orderBy(ncdConditionSetting.conditionCode, desc(ncdConditionSetting.version));
  const set = new Map(rows.map((r) => [r.code, r.enabled]));
  return new Set(
    ctx.catalogue.filter((m) => set.get(m.code) ?? m.enabled_by_default).map((m) => m.code),
  );
}

/** G3: raise every consistency finding the person now has as an open query (one per rule). */
export async function refreshQueries(tx: NcdTx, ctx: NcdContext, personId: string) {
  const [p] = await tx.select().from(ncdPerson).where(eq(ncdPerson.id, personId));
  if (!p) return;
  const regs = await tx
    .select()
    .from(ncdRegistration)
    .where(and(eq(ncdRegistration.personId, personId), isNull(ncdRegistration.supersededById)));
  const visits = await tx
    .select({
      date: ncdVisit.visitDate,
      weightKg: ncdVisit.weightKg,
      status: ncdVisit.status,
      medicines: ncdVisit.medicines,
    })
    .from(ncdVisit)
    .where(and(eq(ncdVisit.personId, personId), eq(ncdVisit.isInvalid, false)));
  const events = await tx
    .select({ type: ncdEvent.eventType })
    .from(ncdEvent)
    .where(and(eq(ncdEvent.personId, personId), eq(ncdEvent.isInvalid, false)));
  const closed = visits
    .filter((v) => v.status === "closed")
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = closed.at(-1);
  const findings = consistencyFindings({
    sex: p.sex as "female" | "male",
    birthYear: p.birthYear,
    registrations: regs.map((r) => ({
      condition: r.conditionCode,
      subtype: r.subtype,
      diagnosisYear: r.diagnosisYear,
    })),
    latestMedicineAtc: latest
      ? latest.medicines.map((m) => medicineByCode.get(m)?.atc ?? "")
      : null,
    eventTypes: events.map((e) => e.type),
    visits: visits.map((v) => ({ date: v.date, weightKg: v.weightKg })),
  });
  for (const rule of findings) {
    await tx
      .insert(ncdQuery)
      .values({ facilityId: ctx.facilityId, personId, ruleId: rule, createdAt: ctx.enteredAt })
      .onConflictDoNothing();
  }
}

/** E3: an appointment and its reminders (one before, up to N after a miss). */
export async function createAppointment(
  tx: NcdTx,
  ctx: NcdContext,
  personId: string,
  date: string,
  source: { visitId?: string; callId?: string },
) {
  // A new appointment supersedes the person's other pending ones.
  const pending = await tx
    .select({ id: ncdAppointment.id })
    .from(ncdAppointment)
    .where(and(eq(ncdAppointment.personId, personId), eq(ncdAppointment.status, "pending")));
  if (pending.length)
    await cancelAppointments(
      tx,
      ctx,
      pending.map((p) => p.id),
      "superseded",
      "superseded",
    );
  const [a] = await tx
    .insert(ncdAppointment)
    .values({
      facilityId: ctx.facilityId,
      personId,
      appointmentDate: date,
      sourceVisitId: source.visitId ?? null,
      sourceCallId: source.callId ?? null,
      enteredAt: ctx.enteredAt,
      updatedAt: ctx.enteredAt,
    })
    .returning({ id: ncdAppointment.id });
  const s = await facilitySettings(tx, ctx);
  const reminders = [{ kind: "before", seq: 1, dueOn: addDays(date, -s.reminderBeforeDays) }];
  for (let i = 1; i <= s.reminderMaxMissed; i++)
    reminders.push({ kind: "missed", seq: i, dueOn: addDays(date, s.reminderAfterDays * i) });
  await tx.insert(ncdReminder).values(
    reminders.map((r) => ({
      facilityId: ctx.facilityId,
      personId,
      appointmentId: a!.id,
      ...r,
      createdAt: ctx.enteredAt,
    })),
  );
  return a!.id;
}

export async function cancelAppointments(
  tx: NcdTx,
  ctx: NcdContext,
  ids: string[],
  status: "cancelled" | "superseded" | "attended",
  reason: string,
) {
  if (!ids.length) return;
  await tx
    .update(ncdAppointment)
    .set({ status, statusReason: reason, updatedAt: ctx.enteredAt })
    .where(inArray(ncdAppointment.id, ids));
  await tx
    .update(ncdReminder)
    .set({ status: "cancelled", statusReason: reason, decidedAt: ctx.enteredAt })
    .where(and(inArray(ncdReminder.appointmentId, ids), eq(ncdReminder.status, "pending")));
}

/** D1: death, transfer or withdrawal cancels every pending appointment and reminder at once. */
export async function cancelAllPending(
  tx: NcdTx,
  ctx: NcdContext,
  personId: string,
  reason: string,
) {
  const pending = await tx
    .select({ id: ncdAppointment.id })
    .from(ncdAppointment)
    .where(and(eq(ncdAppointment.personId, personId), eq(ncdAppointment.status, "pending")));
  await cancelAppointments(
    tx,
    ctx,
    pending.map((p) => p.id),
    "cancelled",
    reason,
  );
  await tx
    .update(ncdReminder)
    .set({ status: "cancelled", statusReason: reason, decidedAt: ctx.enteredAt })
    .where(and(eq(ncdReminder.personId, personId), eq(ncdReminder.status, "pending")));
}

/** The visit fulfils the person's pending appointments due on or before its date. */
export async function attendAppointments(
  tx: NcdTx,
  ctx: NcdContext,
  personId: string,
  visitDate: string,
) {
  const due = await tx
    .select({ id: ncdAppointment.id })
    .from(ncdAppointment)
    .where(
      and(
        eq(ncdAppointment.personId, personId),
        eq(ncdAppointment.status, "pending"),
        lte(ncdAppointment.appointmentDate, visitDate),
      ),
    );
  await cancelAppointments(
    tx,
    ctx,
    due.map((d) => d.id),
    "attended",
    "visit",
  );
}

export async function assertPersonAlive(tx: NcdTx, personId: string, onDate: string) {
  const [d] = await tx
    .select({ date: ncdEvent.eventDate })
    .from(ncdEvent)
    .where(
      and(
        eq(ncdEvent.personId, personId),
        eq(ncdEvent.eventType, "death"),
        eq(ncdEvent.isInvalid, false),
      ),
    );
  if (d && d.date < onDate)
    throw new NcdError("invalid", "A visit cannot be dated after a recorded death.");
}

/** I2: medicines a second person approved for this facility's list ({ add: [{ code, label }] } proposals). */
export async function medicineAdditions(
  tx: NcdTx,
  ctx: NcdContext,
): Promise<{ code: string; label: string }[]> {
  const approved = await tx
    .select({ payload: ncdDefinitionVersion.payload })
    .from(ncdDefinitionVersion)
    .where(
      and(
        eq(ncdDefinitionVersion.facilityId, ctx.facilityId),
        eq(ncdDefinitionVersion.definitionId, "medicine"),
        eq(ncdDefinitionVersion.status, "approved"),
      ),
    );
  const out = new Map<string, string>();
  for (const { payload } of approved) {
    const add = (payload as { add?: unknown }).add;
    if (!Array.isArray(add)) continue;
    for (const x of add as { code?: unknown; label?: unknown }[])
      if (typeof x.code === "string" && typeof x.label === "string" && !medicineByCode.has(x.code))
        out.set(x.code, x.label);
  }
  return [...out].map(([code, label]) => ({ code, label }));
}

/* ─── A1/A2: search before create ─────────────────────────────────────── */

const TOKEN_TTL_MS = 24 * 3600 * 1000;
/**
 * A search token: proof that a search ran for this user at this facility in the last 24 hours, for
 * these names. It unlocks enrolling only the names that were searched (finding 15).
 */
type Names = { givenName: string; familyName: string };
const nameKey = (n: Names) =>
  [...new Set(nameTokenHmacs(n.givenName, n.familyName))].sort().join(",");
const tokenMac = (ctx: NcdContext, ts: number, n: Names) =>
  blindIndex(`ncd-search:${ctx.userId}:${ctx.facilityId}:${ctx.principal}:${ts}:${nameKey(n)}`);
export function issueSearchToken(ctx: NcdContext, names: Names): string {
  const ts = ctx.enteredAt.getTime();
  return `${ts}.${tokenMac(ctx, ts, names)}`;
}
export function verifySearchToken(ctx: NcdContext, token: string, names: Names): boolean {
  const [ts, mac] = token.split(".");
  const t = Number(ts);
  if (!Number.isFinite(t) || !mac) return false;
  if (ctx.enteredAt.getTime() - t > TOKEN_TTL_MS || t - ctx.enteredAt.getTime() > 60_000)
    return false;
  return tokenMac(ctx, t, names) === mac;
}

export async function findCandidates(
  tx: NcdTx,
  ctx: NcdContext,
  typed: IdentityFacts,
): Promise<TieredCandidate[]> {
  const tokens = nameTokenHmacs(typed.givenName, typed.familyName);
  const phones = typed.phones.map(phoneHmac).filter((x): x is string => !!x);
  const hosp = hospitalNumberHmac(typed.hospitalNumber);
  const nin = nationalIdHmac(typed.nationalId);
  const byName = tokens.length
    ? tx
        .select({ id: ncdNameIndex.personId })
        .from(ncdNameIndex)
        .where(
          and(eq(ncdNameIndex.facilityId, ctx.facilityId), inArray(ncdNameIndex.tokenHmac, tokens)),
        )
    : null;
  const ors = [
    byName ? inArray(ncdPerson.id, byName) : undefined,
    phones.length ? inArray(ncdPerson.phone1Hmac, phones) : undefined,
    phones.length ? inArray(ncdPerson.phone2Hmac, phones) : undefined,
    hosp ? eq(ncdPerson.hospitalNumberHmac, hosp) : undefined,
    nin ? eq(ncdPerson.nationalIdHmac, nin) : undefined,
  ].filter(Boolean);
  if (!ors.length) return [];
  const found = await tx
    .select()
    .from(ncdPerson)
    .where(
      and(eq(ncdPerson.facilityId, ctx.facilityId), isNull(ncdPerson.mergedIntoId), or(...ors)),
    )
    .limit(200);
  const candidates: Candidate[] = found.map((p) => ({
    personId: p.id,
    givenName: dec(p.givenNameCiphertext) ?? "",
    familyName: dec(p.familyNameCiphertext) ?? "",
    sex: p.sex as "female" | "male",
    birthYear: p.birthYear,
    phones: [dec(p.phone1Ciphertext), dec(p.phone2Ciphertext)],
    hospitalNumber: dec(p.hospitalNumberCiphertext),
    nationalId: dec(p.nationalIdCiphertext),
  }));
  return tierCandidates(typed, candidates);
}

export const sqlNow = (ctx: NcdContext) => sql`${ctx.enteredAt.toISOString()}::timestamptz`;
