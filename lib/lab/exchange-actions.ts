"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { secondFactorFresh } from "@/lib/auth-fresh";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError, withPatientWrite } from "@/lib/emr/write/context";
import { pairingCode } from "@/lib/exchange/jwt";
import {
  createSender,
  enableSender,
  fileElectronicResult,
  openRaw,
  retryOrSetAside,
  revokeSender,
  rowsOf,
} from "@/lib/exchange/store";
import { labExchangeLiveFor } from "./feature";

/**
 * Connections (Lab Phase 4 §5.6; EX-4, EX-9, AB-6, B3, RB-10). The house contract: Zod → the lab actor (AAL2) →
 * `labExchange` → permission → one transaction as the clinical writer. Pairing, enabling, revoking, retrying and
 * the raw view need `lab.exchange.manage`; making a pairing code and
 * enabling a machine also need a fresh second factor. Filing a partner's
 * result needs result entry, exactly as paper.
 */

type A = { userId: string; hospitalId: string };
const uuid = z.uuid();
const reason = z.string().trim().min(3, "Say why.").max(500);
const bad = (e: z.ZodError): ActionResult<never> => ({
  ok: false,
  code: "invalid",
  error: e.issues[0]?.message ?? "Check the form.",
});

async function manage<T>(fn: (tx: EmrTx, a: A, now: Date) => Promise<T>): Promise<T> {
  const actor = await requireEmrActor("lab");
  if (!labExchangeLiveFor(actor.hospitalId))
    throw new EmrWriteError("config", "Connections are not switched on here.");
  if (!(actor.labPermissions ?? []).includes("lab.exchange.manage"))
    throw new EmrWriteError("forbidden", "Only the laboratory lead manages connections.");
  const a = { userId: actor.userId, hospitalId: actor.hospitalId };
  return asClinicalWriter(a, (tx) => fn(tx, a, new Date()));
}
const ok = <T>(id: string, data?: T): ActionResult<T> => ({
  ok: true,
  id,
  serverTime: new Date().toISOString(),
  ...(data === undefined ? {} : { data }),
});

const NewSender = z.object({
  kind: z.enum(["partner", "bridge"]),
  partnerId: uuid.nullable(),
  name: z.string().trim().min(2).max(120),
});
/** AB-6: a one-time code, shown once (only its hash is kept); it expires and locks after repeated failures. */
export async function createPairingCodeAction(
  raw: unknown,
): Promise<ActionResult<{ code: string }>> {
  const p = NewSender.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (p.data.kind === "partner" && !p.data.partnerId)
    return { ok: false, code: "invalid", error: "Choose the partner." };
  if (!(await secondFactorFresh()))
    return {
      ok: false,
      code: "forbidden",
      error: "reauth: enter your authenticator code to make a code.",
    };
  try {
    const code = pairingCode();
    const id = await manage((tx, a, now) => createSender(tx, a, { ...p.data, code }, now));
    return ok(id, { code: code.code });
  } catch (e) {
    return actionError(e);
  }
}

const Enable = z.object({ senderId: uuid, fingerprint: z.string().trim().min(8).max(80) });
/** B3: the lead types the fingerprint the machine shows; a partner also needs its signed legal record (PT-4). */
export async function enableSenderAction(raw: unknown): Promise<ActionResult> {
  const p = Enable.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh()))
    return {
      ok: false,
      code: "forbidden",
      error: "reauth: enter your authenticator code to enable it.",
    };
  try {
    await manage((tx, a, now) => enableSender(tx, a, p.data, now));
    return ok(p.data.senderId);
  } catch (e) {
    return actionError(e);
  }
}

export async function revokeSenderAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ senderId: uuid }).safeParse(raw);
  if (!p.success) return bad(p.error);
  try {
    await manage((tx, a, now) => revokeSender(tx, a, p.data, now));
    return ok(p.data.senderId);
  } catch (e) {
    return actionError(e);
  }
}

const Dead = z.object({ messageId: uuid, action: z.enum(["retry", "set_aside"]), reason });
/** EX-4: retry a message that stopped trying (after fixing the cause), or set it aside; nothing is purged. */
export async function retryOrSetAsideAction(raw: unknown): Promise<ActionResult> {
  const p = Dead.safeParse(raw);
  if (!p.success) return bad(p.error);
  try {
    await manage((tx, a, now) => retryOrSetAside(tx, a, p.data, now));
    return ok(p.data.messageId);
  } catch (e) {
    return actionError(e);
  }
}

/** EX-9, S35: the raw message with an audited reason. It is returned to the pop-up only, never logged. */
export async function openRawAction(raw: unknown): Promise<ActionResult<{ raw: string }>> {
  const p = z.object({ messageId: uuid, reason }).safeParse(raw);
  if (!p.success) return bad(p.error);
  try {
    const text = await manage((tx, a, now) => openRaw(tx, a, p.data, now));
    return ok(p.data.messageId, { raw: text });
  } catch (e) {
    return actionError(e);
  }
}

/** RB-10, D-LAB4-11: a lab user files a matched partner result on its referral's order (idempotent). */
export async function fileElectronicResultAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ messageId: uuid, clientKey: z.string().min(8).max(120) }).safeParse(raw);
  if (!p.success) return bad(p.error);
  try {
    const actor = await requireEmrActor("lab");
    if (!labExchangeLiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "Connections are not switched on here.");
    const perms = new Set(actor.labPermissions ?? []);
    if (!perms.has("lab.refer.result") && !perms.has("lab.result.enter"))
      throw new EmrWriteError("forbidden", "You do not enter results.");
    const patient = await asClinicalWriter(actor, async (tx) => {
      const [row] = rowsOf<{ p: string }>(
        await tx.execute(sql`SELECT r.patient_user_id AS p FROM exchange_events e
          JOIN lab_referrals r ON r.id = (e.detail->>'referralId')::uuid
         WHERE e.message_id = ${p.data.messageId} AND e.hospital_id = ${actor.hospitalId} AND e.state = 'matched'
         ORDER BY e.id DESC LIMIT 1`),
      );
      if (!row) throw new EmrWriteError("not_found", "That result is not waiting to be filed.");
      return row.p;
    });
    const r = await withPatientWrite(actor, patient, (ctx) => fileElectronicResult(ctx, p.data));
    return ok(r.id);
  } catch (e) {
    return actionError(e);
  }
}
