import { randomInt } from "node:crypto";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  pharmacyReactionEvents,
  pharmacyReactionMedicines,
  pharmacyReactionReports,
} from "@/db/schema/pharmacy-clinical";
import { EmrWriteError } from "@/lib/emr/write/context";
import { insertSuspectedAllergy } from "@/lib/emr/write/reactions";
import { KINDS, SERIOUSNESS } from "./reactions";

/** Pharmacy Phase 3, Step 8: recording a suspected reaction and its report's events (AR-1, AR-2, AR-6). */

const fail = (m: string) => new EmrWriteError("invalid", m);
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const reference = () =>
  `R-${Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;

export const RecordInput = z.object({
  clientKey: z.uuid(),
  patientUserId: z.uuid(),
  kind: z.enum(KINDS),
  medicines: z
    .array(
      z.object({
        medicineId: z
          .string()
          .regex(/^[a-z0-9_]{2,80}$/)
          .nullable(),
        name: z.string().trim().min(2).max(160),
        productId: z.uuid().nullable(),
        batchId: z.uuid().nullable(),
        main: z.boolean(),
      }),
    )
    .max(10),
  reactionText: z.string().trim().min(2).max(2000),
  manifestation: z
    .enum([
      "rash",
      "urticaria",
      "angioedema",
      "anaphylaxis",
      "bronchospasm",
      "sjs_ten",
      "gastrointestinal",
      "other",
    ])
    .nullable(),
  startedOn: z.iso.date().nullable(),
  seriousness: z.array(z.enum(SERIOUSNESS)).min(1),
  outcome: z.enum([
    "recovered",
    "recovering",
    "not_recovered",
    "recovered_with_effects",
    "died",
    "unknown",
  ]),
  actionTaken: z.enum([
    "stopped_by_patient",
    "stopped_by_clinician",
    "dose_changed_by_clinician",
    "continued",
    "unknown",
  ]),
  rechallenge: z.enum(["yes", "no", "not_given_again", "unknown"]),
  reporter: z.enum(["patient", "relative", "staff"]),
});

/**
 * AR-2: one transaction writes the report, its medicines and, for a suspected reaction only, one unconfirmed
 * allergy entry per suspected medicine. The report starts "to submit" (no event yet).
 */
export async function recordReaction(ctx: PharmacyCtx, input: z.infer<typeof RecordInput>) {
  if (input.medicines.filter((m) => m.main).length > 1)
    throw fail("Mark one medicine as the main suspect.");
  if (input.seriousness.includes("not_serious") && input.seriousness.length > 1)
    throw fail("Choose not serious, or the criteria that apply, not both.");
  const [report] = await ctx.tx
    .insert(pharmacyReactionReports)
    .values({
      id: input.clientKey,
      hospitalId: ctx.actor.hospitalId,
      patientUserId: input.patientUserId,
      reference: reference(),
      kind: input.kind,
      reactionText: input.reactionText,
      manifestation: input.manifestation,
      startedOn: input.startedOn,
      seriousness: input.seriousness,
      outcome: input.outcome,
      actionTaken: input.actionTaken,
      rechallenge: input.rechallenge,
      reporter: input.reporter,
      recordedBy: ctx.actor.userId,
      recorderCadre: ctx.actor.cadreName,
      recordedAt: ctx.now,
      clientKey: input.clientKey,
    })
    .returning({ id: pharmacyReactionReports.id });
  for (const [i, m] of input.medicines.entries()) {
    const allergyId =
      input.kind === "suspected_reaction"
        ? await insertSuspectedAllergy(ctx.tx, {
            hospitalId: ctx.actor.hospitalId,
            patientUserId: input.patientUserId,
            actorUserId: ctx.actor.userId,
            actorCadre: ctx.actor.cadreCode,
            medicineId: m.medicineId,
            text: m.name,
            manifestation: input.manifestation,
            now: ctx.now,
            clientKey: `${input.clientKey}:allergy:${i}`,
          })
        : null;
    await ctx.tx.insert(pharmacyReactionMedicines).values({
      reportId: report!.id,
      hospitalId: ctx.actor.hospitalId,
      medicineId: m.medicineId,
      productId: m.productId,
      batchId: m.batchId,
      uncodedText: m.medicineId ? null : m.name,
      main: m.main,
      allergyId,
    });
  }
  return { id: report!.id };
}

export const EventInput = z.discriminatedUnion("kind", [
  z.object({
    clientKey: z.uuid(),
    reportId: z.uuid(),
    kind: z.literal("causality"),
    causality: z.enum([
      "certain",
      "probable",
      "possible",
      "unlikely",
      "conditional",
      "unassessable",
    ]),
  }),
  z.object({
    clientKey: z.uuid(),
    reportId: z.uuid(),
    kind: z.literal("submitted"),
    route: z.string().trim().min(2).max(120),
    submittedOn: z.iso.date(),
    reference: z.string().trim().max(120).nullable(),
  }),
  z.object({
    clientKey: z.uuid(),
    reportId: z.uuid(),
    kind: z.literal("closed_not_submitted"),
    note: z.string().trim().min(3).max(1000),
  }),
  z.object({ clientKey: z.uuid(), reportId: z.uuid(), kind: z.enum(["printed", "copied"]) }),
]);

/** AR-6: causality, submission (route and date required, Law 5), close with a reason, or a logged print or copy. */
export async function reportEvent(ctx: PharmacyCtx, input: z.infer<typeof EventInput>) {
  const [r] = await ctx.tx
    .select({ id: pharmacyReactionReports.id })
    .from(pharmacyReactionReports)
    .where(
      and(
        eq(pharmacyReactionReports.id, input.reportId),
        eq(pharmacyReactionReports.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!r) throw new EmrWriteError("not_found", "That report is not at this hospital.");
  const [e] = await ctx.tx
    .insert(pharmacyReactionEvents)
    .values({
      id: input.clientKey,
      reportId: r.id,
      hospitalId: ctx.actor.hospitalId,
      kind: input.kind,
      causality: input.kind === "causality" ? input.causality : null,
      route: input.kind === "submitted" ? input.route : null,
      submittedOn: input.kind === "submitted" ? input.submittedOn : null,
      reference: input.kind === "submitted" ? input.reference : null,
      note: input.kind === "closed_not_submitted" ? input.note : null,
      actorUserId: ctx.actor.userId,
      at: ctx.now,
    })
    .returning({ id: pharmacyReactionEvents.id });
  return { id: e!.id };
}
