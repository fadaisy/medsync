import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { SmsSender } from "@/lib/notifications/sink";
import type { MessageKind } from "@/lib/pharmacy/messages";
import type { PharmacyActor, PharmacyCtx } from "@/lib/pharmacy/write";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { REVIEW } from "@/content/pharmacy-review";
import { smsOptOuts } from "@/db/schema/channels";
import { consentRecords } from "@/db/schema/consent-records";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { ncdSmsTemplate } from "@/db/schema/ncd-registry";
import { patientProfiles } from "@/db/schema/patient-profiles";
import {
  pharmacyHospitalSettings,
  pharmacyLineEvents,
  pharmacyPatientNotices,
  pharmacyProducts,
} from "@/db/schema/pharmacy-dispensing";
import { asClinicalWriter } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";
import { blindIndex, decrypt } from "@/lib/encryption";
import { isGsmSafe, SMS_MAX_BODY_CHARS } from "@/lib/notifications/sink";
import { bannedTermsScan, renderMessage } from "@/lib/pharmacy/messages";
import { messageNameOf, patientSurfaces } from "@/lib/pharmacy/patient-list";
import { loadGroupOfLine, loadHospitalContext, loadShelf } from "@/lib/pharmacy/review/load";
import { shelfAnswer } from "@/lib/pharmacy/review/read";

/**
 * Messages to the patient (Pharmacy Phase 1, 5.11, MS-1 to MS-5, Law 11, Law 12; ADR 0270).
 *
 * One guarded path, `sendPatientSms`: it sends only when the hospital's live SMS is on, everything a patient
 * reads is signed (RD-4), the hospital has a message name, an approved pharmacy template exists for the kind
 * (`ncd_sms_template`, workspace 'pharmacy', two approvers; D-PH1-48), the rendered text passes the banned-term
 * scan (MS-2) and fits one GSM-7 part, and the patient has a number on file, SMS consent and no opt-out. Every
 * attempt writes one `pharmacy_patient_notices` row (one per line event, MS-3) and comes back in words. It never
 * throws (MS-5): a failure is a `not_sent` or `failed` row and a sentence for the pharmacy.
 *
 * The transport is injected (`SmsSender`); the store never reads the environment, and no test reaches Africa's
 * Talking. Push is specified, not built.
 */

export type NoticeReason = keyof typeof REVIEW.message.why;
export interface NoticeResult {
  outcome: "sent" | "failed" | "not_sent";
  reason: NoticeReason | null;
  words: string;
}

const M = REVIEW.message;
const asDb = (tx: EmrTx) => tx as unknown as EmrDb;
const PURPOSE: Record<MessageKind, string> = {
  owed: "pharmacy_owed",
  buying_outside: "pharmacy_buying_outside",
  in_stock: "pharmacy_in_stock",
};

export const noticeWords = (outcome: NoticeResult["outcome"], reason: NoticeReason | null) =>
  outcome === "sent"
    ? M.sent
    : reason === "sms_off"
      ? M.why.sms_off
      : `${M.why[reason ?? "failed"]} ${M.next}`;

const result = (outcome: NoticeResult["outcome"], reason: NoticeReason | null): NoticeResult => ({
  outcome,
  reason,
  words: noticeWords(outcome, reason),
});

const safeDecrypt = (c: string | null | undefined) => {
  if (!c) return null;
  try {
    return decrypt(c);
  } catch {
    return null;
  }
};

export interface SmsRequest {
  hospitalId: string;
  pointId: string;
  lineId: string;
  patientUserId: string;
  kind: MessageKind;
  /** The outcome event an owed or buying-outside message answers; null for "in stock" (a press). */
  lineEventId: string | null;
  actorUserId: string;
  /** The notice row's id: the client key of a press, so a repeat returns the first. */
  noticeId?: string;
  now: Date;
}

/** Decide, send (or not), record. Runs inside the caller's transaction; never throws for a message failure. */
export async function sendPatientSms(
  tx: EmrTx,
  m: SmsRequest,
  sender: SmsSender | null,
  production: boolean,
): Promise<NoticeResult> {
  const database = asDb(tx);
  const decide = async (): Promise<NoticeResult> => {
    const [settings] = await tx
      .select({ liveSms: pharmacyHospitalSettings.liveSms })
      .from(pharmacyHospitalSettings)
      .where(eq(pharmacyHospitalSettings.hospitalId, m.hospitalId));
    if (!settings?.liveSms) return result("not_sent", "sms_off");
    if (!(await patientSurfaces(database, m.hospitalId, production)).allowed)
      return result("not_sent", "not_signed");
    const name = (await messageNameOf(database, m.hospitalId, production)).name;
    if (!name) return result("not_sent", "no_message_name");
    const [template] = await tx
      .select({ body: ncdSmsTemplate.body })
      .from(ncdSmsTemplate)
      .where(
        and(
          eq(ncdSmsTemplate.facilityId, m.hospitalId),
          eq(ncdSmsTemplate.workspace, "pharmacy"),
          eq(ncdSmsTemplate.purpose, PURPOSE[m.kind]),
          eq(ncdSmsTemplate.status, "approved"),
          eq(ncdSmsTemplate.language, "en"),
        ),
      )
      .orderBy(desc(ncdSmsTemplate.version))
      .limit(1);
    if (!template?.body.trim()) return result("not_sent", "no_template");
    const h = await loadHospitalContext(database, m.hospitalId);
    const phone = h.points.find((p) => p.id === m.pointId)?.phone ?? null;
    const rendered = renderMessage(m.kind, { messageName: name, phone }, "sms", template.body);
    if (!rendered.ok) return result("not_sent", rendered.reason);
    const [places, products] = await Promise.all([
      tx
        .select({ name: hospitalDepartments.name })
        .from(hospitalDepartments)
        .where(eq(hospitalDepartments.hospitalId, m.hospitalId)),
      tx
        .select({ name: pharmacyProducts.name })
        .from(pharmacyProducts)
        .where(eq(pharmacyProducts.hospitalId, m.hospitalId)),
    ]);
    const banned = bannedTermsScan(rendered.text, {
      // The pharmacy department's own bare name is the template's word ("Call the pharmacy"), not a
      // place that reveals a condition; every other department, clinic and point name is banned.
      places: places.map((p) => p.name).filter((n) => n.trim().toLowerCase() !== "pharmacy"),
      products: products.map((p) => p.name),
    });
    if (banned.length) return result("not_sent", "banned_term");
    if (!isGsmSafe(rendered.text) || rendered.text.length > SMS_MAX_BODY_CHARS)
      return result("not_sent", "too_long");
    const [profile] = await tx
      .select({ phone: patientProfiles.phoneEncrypted })
      .from(patientProfiles)
      .where(eq(patientProfiles.id, m.patientUserId));
    const to = safeDecrypt(profile?.phone)?.trim() ?? "";
    if (!to) return result("not_sent", "no_phone");
    const [consent] = await tx
      .select({ id: consentRecords.id })
      .from(consentRecords)
      .where(
        and(
          eq(consentRecords.userId, m.patientUserId),
          eq(consentRecords.consentType, "sms_communication"),
          isNull(consentRecords.revokedAt),
        ),
      )
      .limit(1);
    if (!consent) return result("not_sent", "no_consent");
    const [stopped] = await tx
      .select({ h: smsOptOuts.phoneHmac })
      .from(smsOptOuts)
      .where(eq(smsOptOuts.phoneHmac, blindIndex(to)));
    if (stopped) return result("not_sent", "opted_out");
    if (!sender) return result("not_sent", "no_transport");
    const sent = await sender
      .send({ toE164: to, body: rendered.text })
      .catch(() => ({ ok: false as const, reason: "send failed" }));
    return sent.ok ? result("sent", null) : result("failed", "send_failed");
  };
  let r: NoticeResult;
  try {
    r = await tx.transaction(decide);
  } catch {
    r = result("failed", "failed");
  }
  await tx
    .transaction(async (sp) => {
      await sp.insert(pharmacyPatientNotices).values({
        ...(m.noticeId ? { id: m.noticeId } : {}),
        hospitalId: m.hospitalId,
        dispensingPointId: m.pointId,
        prescriptionId: m.lineId,
        patientUserId: m.patientUserId,
        kind: m.kind,
        channel: "sms",
        outcome: r.outcome,
        reason: r.reason,
        lineEventId: m.lineEventId,
        sentBy: m.actorUserId,
        sentAt: m.now,
      });
    })
    .catch(() => undefined);
  return r;
}

/* ─── notifyOwedInStock (5.7, MS-4): a person's press, while it is on the shelf ─── */

export const InStockInput = z.object({ clientKey: z.uuid(), lineId: z.uuid() });

export async function notifyOwedInStock(
  ctx: PharmacyCtx,
  input: z.infer<typeof InStockInput>,
  sender: SmsSender | null,
  production: boolean,
): Promise<{ id: string; notice: NoticeResult }> {
  const [done] = await ctx.tx
    .select({ outcome: pharmacyPatientNotices.outcome, reason: pharmacyPatientNotices.reason })
    .from(pharmacyPatientNotices)
    .where(eq(pharmacyPatientNotices.id, input.clientKey));
  if (done) {
    const outcome = done.outcome as NoticeResult["outcome"];
    const reason = (done.reason as NoticeReason | null) ?? null;
    return { id: input.clientKey, notice: result(outcome, reason) };
  }
  const point = ctx.point!;
  const h = await loadHospitalContext(asDb(ctx.tx), ctx.actor.hospitalId);
  const found = await loadGroupOfLine(asDb(ctx.tx), h, input.lineId);
  if (!found) throw new EmrWriteError("not_found", "That prescription is not at your hospital.");
  const s = found.line.status;
  if (s?.kind !== "open" || s.outcome !== "owed") throw new EmrWriteError("conflict", M.notOwed);
  const shelf = await loadShelf(asDb(ctx.tx), ctx.actor.hospitalId, [found.line.row.drugId]);
  if (shelfAnswer(shelf, point.id, found.line.row.drugId, ctx.now).state !== "on_shelf")
    throw new EmrWriteError("conflict", M.notOnShelf);
  const notice = await sendPatientSms(
    ctx.tx,
    {
      hospitalId: ctx.actor.hospitalId,
      pointId: point.id,
      lineId: found.line.row.id,
      patientUserId: found.group.patientUserId,
      kind: "in_stock",
      lineEventId: null,
      actorUserId: ctx.actor.userId,
      noticeId: input.clientKey,
      now: ctx.now,
    },
    sender,
    production,
  );
  return { id: input.clientKey, notice };
}

/* ─── After recordNotSupplied commits (5.11): the owed or buying-outside message ─── */

/**
 * The second step after the outcome committed. With the hospital's live SMS off, nothing (the pharmacy's
 * "Who is told" already says so) and null. On, the guarded path, once per event. Never throws.
 */
export async function notifyNotSupplied(
  actor: Pick<PharmacyActor, "userId" | "hospitalId">,
  lineEventId: string,
  sender: SmsSender | null,
  options: { database?: EmrDb; now?: Date; production?: boolean } = {},
): Promise<NoticeResult | null> {
  const now = options.now ?? new Date();
  try {
    return await asClinicalWriter(
      { userId: actor.userId, hospitalId: actor.hospitalId },
      async (tx) => {
        const [e] = await tx
          .select({
            kind: pharmacyLineEvents.kind,
            lineId: pharmacyLineEvents.prescriptionId,
            patientUserId: pharmacyLineEvents.patientUserId,
            pointId: pharmacyLineEvents.dispensingPointId,
          })
          .from(pharmacyLineEvents)
          .where(
            and(
              eq(pharmacyLineEvents.id, lineEventId),
              eq(pharmacyLineEvents.hospitalId, actor.hospitalId),
            ),
          );
        if (!e || !e.pointId || (e.kind !== "owed" && e.kind !== "buying_outside")) return null;
        const [settings] = await tx
          .select({ liveSms: pharmacyHospitalSettings.liveSms })
          .from(pharmacyHospitalSettings)
          .where(eq(pharmacyHospitalSettings.hospitalId, actor.hospitalId));
        if (!settings?.liveSms) return null;
        const [already] = await tx
          .select({
            outcome: pharmacyPatientNotices.outcome,
            reason: pharmacyPatientNotices.reason,
          })
          .from(pharmacyPatientNotices)
          .where(
            and(
              eq(pharmacyPatientNotices.lineEventId, lineEventId),
              eq(pharmacyPatientNotices.channel, "sms"),
            ),
          );
        if (already)
          return result(
            already.outcome as NoticeResult["outcome"],
            (already.reason as NoticeReason | null) ?? null,
          );
        return sendPatientSms(
          tx,
          {
            hospitalId: actor.hospitalId,
            pointId: e.pointId,
            lineId: e.lineId,
            patientUserId: e.patientUserId,
            kind: e.kind as MessageKind,
            lineEventId,
            actorUserId: actor.userId,
            now,
          },
          sender,
          options.production ?? process.env.VERCEL_ENV === "production",
        );
      },
      options.database,
    );
  } catch {
    return result("failed", "failed");
  }
}
