"use server";

import type { WriteCtx } from "@/lib/emr/write/context";
import type { WriteResult } from "@/lib/emr/write/orders";
import { z } from "zod";

import { EmrWriteError } from "@/lib/emr/write/context";
import { runEmrWrite } from "@/lib/emr/write/orders";
import * as store from "@/lib/emr/write/pharmacy-answers";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";

/**
 * The prescriber's answers to the pharmacy (Pharmacy Phase 1, Section 8 "Queries, prescriber";
 * D-PH1-41, D-PH1-49). Zod with a client key → requireEmrActor("doctor") → EMR_V1 →
 * pharmacyDispensing for the hospital → one transaction with the access rule →
 * lib/emr/write/pharmacy-answers.ts, which checks the prescribing policy (D-PH1-08).
 * Audited by the table triggers; `{ id, serverTime }` back.
 */

const uuid = z.uuid();
const key = z.string().trim().min(8).max(120);
const code = z.string().trim().min(2).max(60);
const note = z.string().trim().max(1000).optional();
const base = { surface: z.literal("doctor"), patientUserId: uuid };

const OFF = "Pharmacy dispensing is not switched on here.";
const live =
  <I, R extends WriteResult>(write: (ctx: WriteCtx, input: I) => Promise<R>) =>
  (ctx: WriteCtx, input: I) => {
    if (!pharmacyDispensingLiveFor(ctx.actor.hospitalId)) throw new EmrWriteError("config", OFF);
    return write(ctx, input);
  };

const Answer = z.discriminatedUnion("answer", [
  z.object({
    ...base,
    queryId: uuid,
    clientKey: key,
    note,
    answer: z.literal("keep"),
    reasonCode: code,
  }),
  z.object({
    ...base,
    queryId: uuid,
    clientKey: key,
    note,
    answer: z.literal("stopped"),
    reasonCode: code,
  }),
  z.object({
    ...base,
    queryId: uuid,
    clientKey: key,
    note,
    answer: z.literal("changed"),
    lineId: uuid.optional(),
    replacedByClientKey: key,
  }),
]);

export async function answerQuery(raw: unknown) {
  return runEmrWrite(Answer, raw, live(store.answerQuery));
}

const QueryRef = z.object({ ...base, queryId: uuid, clientKey: key });

export async function confirmChangesMade(raw: unknown) {
  return runEmrWrite(QueryRef, raw, live(store.confirmChangesMade));
}

export async function disputePhoneAnswer(raw: unknown) {
  return runEmrWrite(QueryRef.extend({ note }), raw, live(store.disputePhoneAnswer));
}

const Seen = z.object({ ...base, queryId: uuid });

export async function recordQuerySeen(raw: unknown) {
  return runEmrWrite(Seen, raw, live(store.recordQuerySeen));
}

const Notice = z.object({ ...base, lineEventId: uuid });

export async function acknowledgeNotSupplied(raw: unknown) {
  return runEmrWrite(Notice, raw, live(store.acknowledgeNotSupplied));
}

/** "Choose an alternative" on a not-supplied notice, once the new line is placed. */
export async function chooseAlternative(raw: unknown) {
  return runEmrWrite(
    Notice.extend({ replacedByClientKey: key }),
    raw,
    live(store.chooseAlternative),
  );
}

/** D-PH1-41 directly: stop, or change outside a query (H4). */
const Cancel = z.object({
  ...base,
  prescriptionId: uuid,
  reasonCode: code,
  note,
  replacedByClientKey: key.optional(),
});

export async function cancelPrescriptionLine(raw: unknown) {
  return runEmrWrite(Cancel, raw, live(store.cancelPrescriptionLine));
}

/** D-PH1-49: the doctor's print page, on `beforeprint`. */
const Printed = z.object({
  ...base,
  encounterId: uuid,
  prescriptionIds: z.array(uuid).min(1).max(100),
});

export async function recordPrescriptionPrint(raw: unknown) {
  return runEmrWrite(Printed, raw, live(store.recordPrescriptionPrint));
}
