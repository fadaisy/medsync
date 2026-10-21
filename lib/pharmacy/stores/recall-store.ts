import type { EmrDb } from "@/lib/emr/db";
import type { SmsSender } from "@/lib/notifications/sink";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { RECALL, SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import { smsOptOuts } from "@/db/schema/channels";
import { consentRecords } from "@/db/schema/consent-records";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";
import {
  pharmacyHospitalSettings,
  pharmacyProducts,
  pharmacyStockMovements,
} from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyRecallEvents,
  pharmacyRecalls,
  pharmacyRecallWardNotices,
} from "@/db/schema/pharmacy-stores";
import { blindIndex, decrypt } from "@/lib/encryption";
import { isGsmSafe, SMS_MAX_BODY_CHARS } from "@/lib/notifications/sink";
import { isControlledMedicine } from "@/lib/pharmacy/controlled-read";
import { bannedTermsScan } from "@/lib/pharmacy/messages";
import { messageNameOf } from "@/lib/pharmacy/patient-list";
import { quarantineOf } from "./expiry-store";
import { allows } from "./locations";
import { signedPack } from "./packs";
import { closeRefusals } from "./recall";
import { finishTrace, loadTraceBase } from "./recall-read";
import { batchRef, fail, loadLocation, movePair, requireAttestation, storeNeed } from "./write";

/**
 * Recall, written (Pharmacy Phase 2, 5.7; RC-1 to RC-6; Law 8, Law 12; D-PH2-17). Starting a recall blocks the
 * batch at once: the database guard reads open `pharmacy_recalls` (0180 `pharmacy_batch_recalled`). Each write is
 * `(ctx, input) => {id}` for `runPharmacyWrite`. Messages go only by a person's press, only to list 2 (and list 4
 * once the CSO approves it for this recall), through the hospital's SMS seam when live SMS is on; every other
 * patient stays on the printed list and that is recorded.
 */

export const MANAGE_NEED = storeNeed("pharmacy.manage");
export const CONTACT_NEED = storeNeed("pharmacy.stock");

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, SUPPLY_COMMON.dateHint);

export const StartRecallInput = z.object({
  clientKey: z.uuid(),
  productId: z.uuid(),
  batchNumber: z.string().trim().min(1).max(60).nullish(),
  source: z.enum(["nda", "supplier", "manufacturer", "hospital"]),
  noticeRef: z.string().trim().min(1).max(120),
  noticeDate: isoDay,
  statedClass: z.enum(["A", "B", "C", "not_stated"]),
  level: z.string().trim().min(2).max(200),
  instructions: z.string().trim().min(2).max(2000),
});

async function loadOpenRecall(ctx: PharmacyCtx, recallId: string) {
  const [r] = await ctx.tx
    .select()
    .from(pharmacyRecalls)
    .where(
      and(eq(pharmacyRecalls.id, recallId), eq(pharmacyRecalls.hospitalId, ctx.actor.hospitalId)),
    )
    .for("update");
  if (!r) throw fail("not_found", SUPPLY_COMMON.notHere);
  return r;
}

async function traceOf(ctx: PharmacyCtx, recallId: string) {
  const base = await loadTraceBase(ctx.tx, ctx.actor.hospitalId, recallId);
  if (!base) throw fail("not_found", SUPPLY_COMMON.notHere);
  return finishTrace(base, ctx.tx, ctx.actor.hospitalId);
}

/** List 3's places: every ward and cart that received the batch. */
const list3 = (t: Awaited<ReturnType<typeof traceOf>>) => [
  ...new Set(t.issued.map((i) => i.locationId)),
];

async function notify(ctx: PharmacyCtx, recallId: string, locationIds: readonly string[]) {
  if (!locationIds.length) return;
  await ctx.tx
    .insert(pharmacyRecallWardNotices)
    .values(
      locationIds.map((locationId) => ({
        recallId,
        hospitalId: ctx.actor.hospitalId,
        locationId,
        postedBy: ctx.actor.userId,
        postedAt: ctx.now,
      })),
    )
    .onConflictDoNothing();
}

/** RC-1: the recall, and with it the block; each ward and cart in list 3 is told at once. */
export async function startRecall(ctx: PharmacyCtx, input: z.infer<typeof StartRecallInput>) {
  const [done] = await ctx.tx
    .select({ id: pharmacyRecalls.id })
    .from(pharmacyRecalls)
    .where(eq(pharmacyRecalls.id, input.clientKey));
  if (done) return { id: done.id };
  const [p] = await ctx.tx
    .select({ id: pharmacyProducts.id })
    .from(pharmacyProducts)
    .where(
      and(
        eq(pharmacyProducts.id, input.productId),
        eq(pharmacyProducts.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!p) throw fail("not_found", SUPPLY_COMMON.notHere);
  await ctx.tx.insert(pharmacyRecalls).values({
    id: input.clientKey,
    hospitalId: ctx.actor.hospitalId,
    productId: p.id,
    batchNumber: input.batchNumber ?? null,
    source: input.source,
    noticeRef: input.noticeRef,
    noticeDate: input.noticeDate,
    statedClass: input.statedClass,
    level: input.level,
    instructions: input.instructions,
    startedBy: ctx.actor.userId,
    startedAt: ctx.now,
  });
  await notify(ctx, input.clientKey, list3(await traceOf(ctx, input.clientKey)));
  return { id: input.clientKey };
}

export const WardNoticeInput = z.object({
  clientKey: z.uuid(),
  recallId: z.uuid(),
  locationId: z.uuid(),
});

/** A notice to one ward or cart in list 3 (posted once; a repeat is the same notice). */
export async function postWardRecallNotice(
  ctx: PharmacyCtx,
  input: z.infer<typeof WardNoticeInput>,
) {
  const r = await loadOpenRecall(ctx, input.recallId);
  if (r.closedAt) throw fail("conflict", "This recall is closed.");
  if (!list3(await traceOf(ctx, r.id)).includes(input.locationId))
    throw fail("invalid", "That place did not receive the batch.");
  await notify(ctx, r.id, [input.locationId]);
  return { id: r.id };
}

export const QuarantineRecallInput = z.object({
  clientKey: z.uuid(),
  recallId: z.uuid(),
  witnessAttestationId: z.uuid().nullish(),
});

/** 5.7 Quarantine everything: every balance of the batch outside quarantine, in one transaction. */
export async function quarantineRecall(
  ctx: PharmacyCtx,
  input: z.infer<typeof QuarantineRecallInput>,
) {
  const hospitalId = ctx.actor.hospitalId;
  const [again] = await ctx.tx
    .select({ id: pharmacyStockMovements.id })
    .from(pharmacyStockMovements)
    .where(
      and(
        eq(pharmacyStockMovements.hospitalId, hospitalId),
        eq(pharmacyStockMovements.sourceKind, "quarantine"),
        eq(pharmacyStockMovements.sourceId, input.clientKey),
      ),
    )
    .limit(1);
  if (again) return { id: input.recallId };
  const r = await loadOpenRecall(ctx, input.recallId);
  if (r.closedAt) throw fail("conflict", "This recall is closed.");
  const t = await traceOf(ctx, r.id);
  const shelves = t.shelves.filter((s) => {
    const l = t.locations.get(s.locationId);
    return l && allows(l.kind, l.model, "quarantined_out", "out");
  });
  if (!shelves.length) throw fail("conflict", RECALL.quarantineNone);
  let witness: string | null = null;
  if (await isControlledMedicine(ctx.tx, hospitalId, t.medicineId)) {
    if (!ctx.actor.access.permissions.has("pharmacy.controlled") || !input.witnessAttestationId)
      throw fail(
        "forbidden",
        "A controlled medicine needs the controlled-drugs permission and its witness.",
      );
    witness = await requireAttestation(ctx.tx, {
      id: input.witnessAttestationId,
      hospitalId,
      actorUserId: ctx.actor.userId,
      now: ctx.now,
    }).then(() => input.witnessAttestationId!);
  }
  const to = await quarantineOf(ctx);
  for (const s of shelves) {
    const from = await loadLocation(ctx.tx, hospitalId, s.locationId);
    const batch = await batchRef(ctx.tx, hospitalId, s.batchId, from.id);
    await movePair(ctx.tx, {
      pair: "quarantine",
      hospitalId,
      from,
      to,
      batch,
      quantity: s.quantity,
      sourceId: input.clientKey,
      actorUserId: ctx.actor.userId,
      effectiveAt: ctx.now,
      reasonCode: "recalled",
      reasonNote: `Recall ${r.noticeRef}`,
      witnessAttestationId: witness,
    });
  }
  return { id: r.id };
}

export const ContactInput = z.object({
  clientKey: z.uuid(),
  recallId: z.uuid(),
  patientUserId: z.uuid(),
  list: z.enum(["exact", "may_have"]),
  outcome: z.enum(["told_by_message", "reached_by_phone", "reached_at_visit", "could_not_reach"]),
  note: z.string().trim().max(300).nullish(),
});

const listed = (
  t: Awaited<ReturnType<typeof traceOf>>,
  patientId: string,
  list: "exact" | "may_have",
) => (list === "exact" ? t.exact : t.mayHave).some((p) => p.patientId === patientId);

/** RC-5: one contact event, recorded by a person (`pharmacy.stock`), for a patient on that list. */
export async function recordRecallContact(ctx: PharmacyCtx, input: z.infer<typeof ContactInput>) {
  const [done] = await ctx.tx
    .select({ id: pharmacyRecallEvents.id })
    .from(pharmacyRecallEvents)
    .where(eq(pharmacyRecallEvents.id, input.clientKey));
  if (done) return { id: done.id };
  const r = await loadOpenRecall(ctx, input.recallId);
  if (!listed(await traceOf(ctx, r.id), input.patientUserId, input.list))
    throw fail("invalid", "That patient is not on this list.");
  await ctx.tx.insert(pharmacyRecallEvents).values({
    id: input.clientKey,
    recallId: r.id,
    hospitalId: ctx.actor.hospitalId,
    patientUserId: input.patientUserId,
    list: input.list,
    outcome: input.outcome,
    note: input.note ?? null,
    actorUserId: ctx.actor.userId,
    at: ctx.now,
  });
  return { id: input.clientKey };
}

export const ApproveMayHaveInput = z.object({ clientKey: z.uuid(), recallId: z.uuid() });

/**
 * D-PH2-17: the CSO approves messages to list 4 for this recall. D-PH2-22: the CSO signs as the hospital's
 * `pharmacy.manage` holder for now; the approver is recorded.
 */
export async function approveMayHaveMessages(
  ctx: PharmacyCtx,
  input: z.infer<typeof ApproveMayHaveInput>,
) {
  const r = await loadOpenRecall(ctx, input.recallId);
  if (r.closedAt) throw fail("conflict", "This recall is closed.");
  if (r.mayHaveMessageApprovedBy) return { id: r.id };
  await ctx.tx
    .update(pharmacyRecalls)
    .set({ mayHaveMessageApprovedBy: ctx.actor.userId, mayHaveMessageApprovedAt: ctx.now })
    .where(eq(pharmacyRecalls.id, r.id));
  return { id: r.id };
}

export const SendInput = z.object({
  clientKey: z.uuid(),
  recallId: z.uuid(),
  patientUserIds: z.array(z.uuid()).min(1).max(500),
  list: z.enum(["exact", "may_have"]),
});

export type SendOutcome = "sent" | "printed";

const safe = (c: string | null | undefined) => {
  if (!c) return "";
  try {
    return decrypt(c).trim();
  } catch {
    return "";
  }
};

/** The recall message's text (Appendix B through the signed template), or why there is none. */
export async function recallMessage(ctx: PharmacyCtx, production: boolean) {
  const hospitalId = ctx.actor.hospitalId;
  const template = await signedPack(ctx.tx, hospitalId, "recall_template");
  if (!template) return { text: null, reason: "no_template" as const };
  const name = (await messageNameOf(ctx.tx as unknown as EmrDb, hospitalId, production)).name;
  // The pharmacy's phone: Phase 1 keeps it on the dispensing point.
  const [phone] = await ctx.tx
    .select({ phone: pharmacyDispensingPoints.phone })
    .from(pharmacyDispensingPoints)
    .where(
      and(
        eq(pharmacyDispensingPoints.hospitalId, hospitalId),
        isNotNull(pharmacyDispensingPoints.phone),
      ),
    )
    .limit(1);
  if (!name || !phone?.phone) return { text: null, reason: "no_message_name" as const };
  const text = template.content.body.replace("{messageName}", name).replace("{phone}", phone.phone);
  const places = await ctx.tx
    .select({ name: hospitalDepartments.name })
    .from(hospitalDepartments)
    .where(eq(hospitalDepartments.hospitalId, hospitalId));
  const products = await ctx.tx
    .select({ name: pharmacyProducts.name })
    .from(pharmacyProducts)
    .where(eq(pharmacyProducts.hospitalId, hospitalId));
  const banned = bannedTermsScan(text, {
    places: places.map((p) => p.name).filter((n) => n.trim().toLowerCase() !== "pharmacy"),
    products: products.map((p) => p.name),
  });
  if (banned.length) return { text: null, reason: "banned_term" as const };
  if (!isGsmSafe(text) || text.length > SMS_MAX_BODY_CHARS)
    return { text: null, reason: "too_long" as const };
  return { text, reason: null };
}

/**
 * 5.7 Tell the patients: by a person's press, for patients on list 2 (list 4 only with the CSO's approval). A patient
 * whose message went gets `told_by_message`. A patient it could not go to gets no event: they stay on the printed
 * list for follow-up, and only a person records how they were reached (RC-5); "could not reach" is never inferred. The text names no medicine, batch, condition, clinic or prescriber (Law 12).
 */
export async function sendRecallMessage(
  ctx: PharmacyCtx,
  input: z.infer<typeof SendInput>,
  deps: { sender: SmsSender | null; production: boolean },
) {
  const r = await loadOpenRecall(ctx, input.recallId);
  if (r.closedAt) throw fail("conflict", "This recall is closed.");
  if (input.list === "may_have" && !r.mayHaveMessageApprovedBy)
    throw fail("forbidden", RECALL.mayHaveNotApproved);
  const t = await traceOf(ctx, r.id);
  for (const p of input.patientUserIds)
    if (!listed(t, p, input.list)) throw fail("invalid", "That patient is not on this list.");
  const msg = await recallMessage(ctx, deps.production);
  if (!msg.text && msg.reason === "no_template") throw fail("config", RECALL.noTemplate);
  const [settings] = await ctx.tx
    .select({ liveSms: pharmacyHospitalSettings.liveSms })
    .from(pharmacyHospitalSettings)
    .where(eq(pharmacyHospitalSettings.hospitalId, ctx.actor.hospitalId));
  let sent = 0;
  const notSent: { patientUserId: string; why: string }[] = [];
  for (const patientId of input.patientUserIds) {
    let why: string | null = msg.reason;
    if (!why && !settings?.liveSms) why = "sms_off";
    if (!why && !deps.sender) why = "no_transport";
    let to = "";
    if (!why) {
      const [profile] = await ctx.tx
        .select({ phone: patientProfiles.phoneEncrypted })
        .from(patientProfiles)
        .where(eq(patientProfiles.id, patientId));
      to = safe(profile?.phone);
      if (!to) why = "no_phone";
    }
    if (!why) {
      const [consent] = await ctx.tx
        .select({ id: consentRecords.id })
        .from(consentRecords)
        .where(
          and(
            eq(consentRecords.userId, patientId),
            eq(consentRecords.consentType, "sms_communication"),
            isNull(consentRecords.revokedAt),
          ),
        )
        .limit(1);
      const [stopped] = await ctx.tx
        .select({ h: smsOptOuts.phoneHmac })
        .from(smsOptOuts)
        .where(eq(smsOptOuts.phoneHmac, blindIndex(to)));
      if (!consent) why = "no_consent";
      else if (stopped) why = "opted_out";
    }
    if (!why) {
      const ok = await deps
        .sender!.send({ toE164: to, body: msg.text! })
        .catch(() => ({ ok: false as const }));
      if (!ok.ok) why = "send_failed";
    }
    if (why) {
      notSent.push({ patientUserId: patientId, why });
      continue;
    }
    sent++;
    await ctx.tx.insert(pharmacyRecallEvents).values({
      recallId: r.id,
      hospitalId: ctx.actor.hospitalId,
      patientUserId: patientId,
      list: input.list,
      outcome: "told_by_message",
      note: null,
      actorUserId: ctx.actor.userId,
      at: ctx.now,
    });
  }
  return { id: r.id, sent, printed: notSent.length, notSent };
}

export const CloseRecallInput = z.object({
  clientKey: z.uuid(),
  recallId: z.uuid(),
  returnedQuantity: z.number().int().min(0),
  destroyedQuantity: z.number().int().min(0),
  note: z.string().trim().max(1000).nullish(),
});

/** RC-6: the returned and destroyed quantities and the outcome note; a closed recall never changes. */
export async function closeRecall(ctx: PharmacyCtx, input: z.infer<typeof CloseRecallInput>) {
  const r = await loadOpenRecall(ctx, input.recallId);
  if (r.closedAt) return { id: r.id };
  const refusals = closeRefusals({
    closedAt: r.closedAt,
    returnedQuantity: input.returnedQuantity,
    destroyedQuantity: input.destroyedQuantity,
  });
  if (refusals.length) throw fail("invalid", "Give the returned and destroyed quantities.");
  await ctx.tx
    .update(pharmacyRecalls)
    .set({
      closedAt: ctx.now,
      closedBy: ctx.actor.userId,
      returnedQuantity: input.returnedQuantity,
      destroyedQuantity: input.destroyedQuantity,
      closeNote: input.note ?? null,
    })
    .where(eq(pharmacyRecalls.id, r.id));
  return { id: r.id };
}
