import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";
import {
  pharmacyBriefings,
  pharmacyGolive,
  pharmacyHospitalSettings,
  pharmacyLegalAnswers,
  pharmacyPilotNotes,
  pharmacySignedSets,
} from "@/db/schema/pharmacy-dispensing";
import { EmrWriteError } from "@/lib/emr/write/context";
import { MESSAGE_COPY, PATIENT_COPY } from "@/lib/pharmacy/messages";
import { canSwitchOff, canSwitchOn, patientSurfacesAllowed } from "@/lib/pharmacy/readiness";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { isLive, loadPoint } from "@/lib/pharmacy/write";
import { getPharmacyReadiness, hospitalSettings } from "./read";

/**
 * Going live at a dispensing point, and the hospital's pharmacy settings (Pharmacy Phase 1, 5.13,
 * RD-1 to RD-5, D-PH1-05, Section 8 "Going live"). Each write runs inside the caller's transaction as
 * the hospital admin (`asClinicalWriter`, identity set for the audit triggers). Modelled on the lab's
 * one result path (lib/lab/cutover-store.ts): a request snapshots the conditions; a different admin
 * approves, with the conditions read again at that moment; 0129's trigger stamps the point in the
 * same transaction. The database holds the same lines: `approved_by <> requested_by`, a reason on a
 * switch-off, legal question 1 before "supply without a pharmacist".
 */

export type Admin = { userId: string; hospitalId: string };

const refuse = (code: "invalid" | "conflict" | "forbidden" | "not_found", m: string) =>
  new EmrWriteError(code, m);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date.");
const notAfter = (d: string, now: Date) => d <= localDate(now);

export const PointInput = z.object({ pointId: z.uuid() });
export const RequestInput = z.object({ requestId: z.uuid() });
export const SwitchOffInput = z.object({
  pointId: z.uuid(),
  reason: z.string().trim().min(10, "Say in a sentence why the point is switched off.").max(500),
});

async function pointOr404(tx: EmrTx, admin: Admin, pointId: string) {
  const point = await loadPoint(tx, admin.hospitalId, pointId);
  if (!point) throw refuse("not_found", "That dispensing point is not at this hospital.");
  return point;
}

async function readinessOr404(tx: EmrTx, admin: Admin, pointId: string, now: Date) {
  const r = await getPharmacyReadiness(tx, admin.hospitalId, pointId, now);
  if (!r) throw refuse("not_found", "That dispensing point is not at this hospital.");
  return r;
}

/** RD-5: a note written by someone other than this person, if any; else theirs, if any. */
const pilotNoteBy = (writers: readonly string[], requester: string) =>
  writers.find((w) => w !== requester) ?? writers[0] ?? null;

/** RD-1, RD-2: all six (and, for a later point, a pilot note by someone else) before the request. */
export async function requestGoLive(tx: EmrTx, admin: Admin, pointId: string, now: Date) {
  const r = await readinessOr404(tx, admin, pointId, now);
  if (isLive(r.point)) throw refuse("conflict", `${r.point.name} is already live.`);
  if (r.request) throw refuse("conflict", "A request is already waiting for a second approver.");
  if (!r.readiness.ready)
    throw refuse("conflict", "Every condition must be met first. See the list.");
  if (r.readiness.pilotNote && pilotNoteBy(r.pilotNoteWriters, admin.userId) === admin.userId)
    throw refuse(
      "conflict",
      "The note on the first point's pilot must be written by someone other than you.",
    );
  const [row] = await tx
    .insert(pharmacyGolive)
    .values({
      hospitalId: admin.hospitalId,
      dispensingPointId: pointId,
      action: "switch_on",
      conditions: { conditions: r.readiness.conditions, pilotNote: r.readiness.pilotNote },
      requestedBy: admin.userId,
      requestedAt: now,
    })
    .returning({ id: pharmacyGolive.id });
  return row!.id;
}

async function openRow(tx: EmrTx, admin: Admin, requestId: string) {
  const [row] = await tx
    .select()
    .from(pharmacyGolive)
    .where(and(eq(pharmacyGolive.id, requestId), eq(pharmacyGolive.hospitalId, admin.hospitalId)))
    .for("update");
  if (!row || row.approvedAt || row.withdrawnAt)
    throw refuse("not_found", "That request is no longer waiting.");
  return row;
}

const SAME_PERSON = "You made this request: a second hospital admin approves it.";

/** RD-2: a different admin approves; the conditions are read again now. 0129 stamps `live_at`. */
export async function approveGoLive(tx: EmrTx, admin: Admin, requestId: string, now: Date) {
  const row = await openRow(tx, admin, requestId);
  if (row.action !== "switch_on") throw refuse("conflict", "That request is not to switch on.");
  const r = await readinessOr404(tx, admin, row.dispensingPointId, now);
  const decision = canSwitchOn(r.readiness, {
    requestedBy: row.requestedBy,
    approvedBy: admin.userId,
    pilotNoteBy: pilotNoteBy(r.pilotNoteWriters, row.requestedBy),
  });
  if (!decision.ok)
    throw refuse(
      decision.reason === "same_person" ? "forbidden" : "conflict",
      decision.reason === "same_person"
        ? SAME_PERSON
        : decision.reason === "pilot_note_by_requester"
          ? "The note on the first point's pilot must be written by someone other than the requester."
          : "A condition is no longer met. See the list.",
    );
  await tx
    .update(pharmacyGolive)
    .set({ approvedBy: admin.userId, approvedAt: now })
    .where(eq(pharmacyGolive.id, row.id));
  return row.id;
}

/** RD-3: a reason (10 characters or more); the point must be live. */
export async function requestSwitchOff(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof SwitchOffInput>,
  now: Date,
) {
  const r = await readinessOr404(tx, admin, input.pointId, now);
  if (!isLive(r.point)) throw refuse("conflict", `${r.point.name} is not live.`);
  if (r.request) throw refuse("conflict", "A request is already waiting for a second approver.");
  const [row] = await tx
    .insert(pharmacyGolive)
    .values({
      hospitalId: admin.hospitalId,
      dispensingPointId: input.pointId,
      action: "switch_off",
      conditions: { conditions: r.readiness.conditions, pilotNote: r.readiness.pilotNote },
      reason: input.reason,
      requestedBy: admin.userId,
      requestedAt: now,
    })
    .returning({ id: pharmacyGolive.id });
  return row!.id;
}

/** RD-3: a different admin approves. 0129 stamps `switched_off_at`. */
export async function approveSwitchOff(tx: EmrTx, admin: Admin, requestId: string, now: Date) {
  const row = await openRow(tx, admin, requestId);
  if (row.action !== "switch_off") throw refuse("conflict", "That request is not to switch off.");
  const decision = canSwitchOff({
    requestedBy: row.requestedBy,
    approvedBy: admin.userId,
    reason: row.reason ?? "",
  });
  if (!decision.ok)
    throw refuse(
      decision.reason === "same_person" ? "forbidden" : "invalid",
      decision.reason === "same_person" ? SAME_PERSON : "The request has no reason.",
    );
  await tx
    .update(pharmacyGolive)
    .set({ approvedBy: admin.userId, approvedAt: now })
    .where(eq(pharmacyGolive.id, row.id));
  return row.id;
}

/** Any admin of the hospital may withdraw a waiting request; it stays on record. */
export async function withdrawRequest(tx: EmrTx, admin: Admin, requestId: string, now: Date) {
  const row = await openRow(tx, admin, requestId);
  await tx.update(pharmacyGolive).set({ withdrawnAt: now }).where(eq(pharmacyGolive.id, row.id));
  return row.id;
}

/* ─── Records: briefings, legal answers, pilot notes (append-only) ───── */

export const BriefingInput = z.object({
  pointId: z.uuid().nullable(),
  audience: z.enum(["pharmacy", "prescribers"]),
  heldOn: day,
  notes: z.string().trim().max(1000).nullable(),
});

export async function recordBriefing(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof BriefingInput>,
  now: Date,
) {
  if (!notAfter(input.heldOn, now))
    throw refuse("invalid", "A briefing is recorded after it is held.");
  if (input.pointId) await pointOr404(tx, admin, input.pointId);
  const [row] = await tx
    .insert(pharmacyBriefings)
    .values({
      hospitalId: admin.hospitalId,
      dispensingPointId: input.pointId,
      audience: input.audience,
      heldOn: input.heldOn,
      notes: input.notes || null,
      recordedBy: admin.userId,
      recordedAt: now,
    })
    .returning({ id: pharmacyBriefings.id });
  return row!.id;
}

export const LegalAnswerInput = z.object({
  question: z.number().int().min(1).max(8),
  answer: z.string().trim().min(3, "Type the answer as given.").max(4000),
  sourceRef: z.string().trim().min(3, "Give the document reference.").max(500),
  givenBy: z.string().trim().min(2, "Who gave the answer?").max(200),
  givenOn: day,
  interim: z.boolean(),
});

/** RD-1 condition 2: an answer recorded for this hospital, with its source, who gave it and when. */
export async function recordLegalAnswer(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof LegalAnswerInput>,
  now: Date,
) {
  if (!notAfter(input.givenOn, now)) throw refuse("invalid", "The answer's date is in the future.");
  const [row] = await tx
    .insert(pharmacyLegalAnswers)
    .values({ hospitalId: admin.hospitalId, ...input, recordedBy: admin.userId, recordedAt: now })
    .returning({ id: pharmacyLegalAnswers.id });
  return row!.id;
}

export const PilotNoteInput = z.object({
  pointId: z.uuid(),
  note: z.string().trim().min(20, "Write at least a sentence on how the pilot went.").max(4000),
});

/** RD-5: a note on how a point's pilot went, on that point (which must have been live). */
export async function recordPilotNote(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof PilotNoteInput>,
  now: Date,
) {
  const point = await pointOr404(tx, admin, input.pointId);
  if (!point.liveAt)
    throw refuse("conflict", `${point.name} has not been live: there is no pilot.`);
  const [row] = await tx
    .insert(pharmacyPilotNotes)
    .values({
      hospitalId: admin.hospitalId,
      dispensingPointId: input.pointId,
      note: input.note,
      writtenBy: admin.userId,
      writtenAt: now,
    })
    .returning({ id: pharmacyPilotNotes.id });
  return row!.id;
}

/* ─── Settings ──────────────────────────────────────────────────────── */

export const PointSettingsInput = z.object({
  pointId: z.uuid(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ]{6,19}$/, "Type the phone number in digits, with + for a country code.")
    .nullable(),
  labelMode: z.enum(["printed", "by_hand"]),
  countFreshnessDays: z.number().int().min(1).max(365).nullable(),
});

/** The point's phone (W1, condition 6), label mode and count freshness. */
export async function updatePointSettings(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof PointSettingsInput>,
) {
  await pointOr404(tx, admin, input.pointId);
  await tx
    .update(pharmacyDispensingPoints)
    .set({
      phone: input.phone,
      labelMode: input.labelMode,
      countFreshnessDays: input.countFreshnessDays,
      updatedAt: new Date(),
      updatedByUserId: admin.userId,
    })
    .where(
      and(
        eq(pharmacyDispensingPoints.departmentId, input.pointId),
        eq(pharmacyDispensingPoints.hospitalId, admin.hospitalId),
      ),
    );
  return input.pointId;
}

export const HospitalSettingsInput = z.object({
  individualInpatientSupply: z.boolean(),
  paymentStatusRequired: z.boolean(),
  expiryLookaheadDays: z.number().int().min(1).max(730).nullable(),
  liveSms: z.boolean(),
});

async function signedKinds(tx: EmrTx, hospitalId: string) {
  const rows = await tx
    .select({ kind: pharmacySignedSets.kind })
    .from(pharmacySignedSets)
    .where(
      and(eq(pharmacySignedSets.hospitalId, hospitalId), eq(pharmacySignedSets.status, "signed")),
    );
  return new Set(rows.map((r) => r.kind));
}

/** RD-4: live SMS only while everything a patient reads is signed (always allowed outside production). */
export async function liveSmsAllowed(tx: EmrTx, hospitalId: string, production: boolean) {
  const kinds = await signedKinds(tx, hospitalId);
  const signed = (c: { status: string }) => c.status === "signed";
  return patientSurfacesAllowed({
    production,
    patientCopySigned: signed(PATIENT_COPY),
    templatesApproved: signed(MESSAGE_COPY),
    messageNameSigned: kinds.has("message_name"),
  });
}

/** `updatePharmacySettings`: the hospital's own switches. "Supply without a pharmacist" is not here. */
export async function updateHospitalSettings(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof HospitalSettingsInput>,
  now: Date,
  production: boolean = process.env.VERCEL_ENV === "production",
) {
  const current = await hospitalSettings(tx, admin.hospitalId);
  if (
    input.liveSms &&
    !current?.liveSms &&
    !(await liveSmsAllowed(tx, admin.hospitalId, production)).allowed
  )
    throw refuse(
      "conflict",
      "Live SMS stays off until the patient wording, the message templates and the message name are signed.",
    );
  // HZ-PH1-48: stopping an admission medicine does not yet stop its prescription, so a ward line could
  // stay active after the doctor stopped it. Individual inpatient supply stays off until prescribing
  // fixes that (gate-a-proposal §1 H7); reviewing ward lines is unaffected.
  if (input.individualInpatientSupply && !current?.individualInpatientSupply)
    throw refuse(
      "conflict",
      "Individual inpatient supply stays off for now: stopping a medicine on the admission list does not yet stop its prescription.",
    );
  await tx
    .insert(pharmacyHospitalSettings)
    .values({ hospitalId: admin.hospitalId, ...input, updatedBy: admin.userId, updatedAt: now })
    .onConflictDoUpdate({
      target: pharmacyHospitalSettings.hospitalId,
      set: { ...input, updatedBy: admin.userId, updatedAt: now },
    });
  return admin.hospitalId;
}

export const WithoutPharmacistInput = z.object({ step: z.enum(["request", "approve", "off"]) });

/**
 * D-PH1-05, RQ-12: "supply without a pharmacist". One admin requests, a different admin approves;
 * the database refuses it without an answer to legal question 1 on record. Switching it off needs
 * one person (the safer direction).
 */
export async function setSupplyWithoutPharmacist(
  tx: EmrTx,
  admin: Admin,
  step: z.infer<typeof WithoutPharmacistInput>["step"],
  now: Date,
) {
  const current = await hospitalSettings(tx, admin.hospitalId);
  const base = { updatedBy: admin.userId, updatedAt: now };
  if (step === "request") {
    if (current?.supplyWithoutPharmacist) throw refuse("conflict", "It is already on.");
    await tx
      .insert(pharmacyHospitalSettings)
      .values({
        hospitalId: admin.hospitalId,
        supplyWithoutPharmacistRequestedBy: admin.userId,
        ...base,
      })
      .onConflictDoUpdate({
        target: pharmacyHospitalSettings.hospitalId,
        set: { supplyWithoutPharmacistRequestedBy: admin.userId, ...base },
      });
  } else if (step === "approve") {
    const by = current?.supplyWithoutPharmacistRequestedBy;
    if (!current || !by || current.supplyWithoutPharmacist)
      throw refuse("conflict", "Nobody has asked for this setting.");
    if (by === admin.userId) throw refuse("forbidden", SAME_PERSON);
    await tx
      .update(pharmacyHospitalSettings)
      .set({
        supplyWithoutPharmacist: true,
        supplyWithoutPharmacistApprovedBy: admin.userId,
        ...base,
      })
      .where(
        and(
          eq(pharmacyHospitalSettings.hospitalId, admin.hospitalId),
          eq(pharmacyHospitalSettings.supplyWithoutPharmacist, false),
        ),
      );
  } else {
    if (!current) return admin.hospitalId;
    await tx
      .update(pharmacyHospitalSettings)
      .set({
        supplyWithoutPharmacist: false,
        supplyWithoutPharmacistRequestedBy: null,
        supplyWithoutPharmacistApprovedBy: null,
        ...base,
      })
      .where(eq(pharmacyHospitalSettings.hospitalId, admin.hospitalId));
  }
  return admin.hospitalId;
}

/** The database's RQ-12 refusal, in words. */
export function settingsRefusal(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("legal question 1"))
    return "Supply without a pharmacist needs an answer to legal question 1 on record first.";
  const cause = e && typeof e === "object" && "cause" in e ? (e as { cause: unknown }).cause : null;
  return cause ? settingsRefusal(cause) : null;
}
