import "server-only";

import type { Jwk } from "./jwt";
import type { InboundResult, ReferralState } from "./types";
import type { EmrTx } from "@/lib/emr/db";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { ResultValueInput } from "@/lib/emr/write/results";
import { and, asc, eq, inArray, lte, notInArray, or, sql } from "drizzle-orm";

import {
  encounterOrders,
  exchangeEvents,
  exchangeJti,
  exchangeMessages,
  exchangeOutbox,
  exchangeSenders,
  exchangeTokens,
  labMatchItems,
  labPartners,
  labReferrals,
  specimens,
  testCatalogue,
} from "@/db/schema";
import { referralSystems } from "@/lib/emr/fhir";
import { EmrWriteError } from "@/lib/emr/write/context";
import { enterReferredResult } from "@/lib/emr/write/results";
import { decrypt, encrypt } from "@/lib/encryption";
import { loadConfigs } from "@/lib/lab/catalogue-v2";
import { unitsRangesLive } from "@/lib/lab/criticals/readiness";
import { alertAfterRelease } from "@/lib/lab/criticals/store";
import { stateForTask } from "@/lib/lab/referral";
import { patientForCompare } from "@/lib/lab/referral-results-store";
import { appendEvent } from "@/lib/lab/referral-store";
import { inForce } from "@/lib/lab/signed-config";
import { fhirReceive } from "./adapter";
import {
  codeHash,
  keyFingerprint,
  mintToken,
  sameHash,
  TOKEN_SECONDS,
  tokenHash,
  verifyAssertion,
} from "./jwt";
import { matchPartnerResult } from "./match";
import { contentHash, nextAttempt } from "./outbox";
import { electronicSendAllowed, PartnerLegalPayload } from "./partners";

/**
 * The exchange on the database (Lab Phase 4 §6.4–6.5, §8 machine endpoints; EX-1..EX-10, MA-1..MA-7, D-LAB4-11,
 * D-LAB4-13, D-LAB4-15). Machines never get a database role: a route checks a token here, then stores through
 * `private.exchange_store_inbound`, whose hospital comes from the sender row. Processing runs after the
 * acknowledgement, idempotently: a message whose processing died is picked up again and processed once (S29).
 */

type Actor = { userId: string; hospitalId: string };
const SYSTEM = (hospitalId: string): Actor => ({
  userId: "00000000-0000-0000-0000-000000000000",
  hospitalId,
});
export const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? r : ((r as { rows: T[] }).rows ?? []);
export const SCOPE = {
  inbound: "system/exchange.inbound.write",
  config: "system/exchange.config.read",
  heartbeat: "system/exchange.heartbeat.write",
} as const;
/** Operational (GATE S): pairing codes expire, and lock after this many wrong tries. */
export const PAIRING = { minutes: 30, failures: 10 } as const;

/* ─── Tokens (D-LAB4-15) ─────────────────────────────────────────────── */

export async function issueToken(
  tx: EmrTx,
  i: { senderId: string; assertion: string; audience: string; scope: string | null; now: Date },
): Promise<{ token: string; expiresIn: number; scope: string } | { error: string }> {
  const [s] = await tx.select().from(exchangeSenders).where(eq(exchangeSenders.id, i.senderId));
  if (!s || s.state !== "active" || !s.jwks) return { error: "invalid_client" };
  const keys = ((s.jwks as { keys?: Jwk[] }).keys ?? []) as Jwk[];
  const v = verifyAssertion(i.assertion, {
    senderId: s.id,
    audience: i.audience,
    keys,
    now: i.now,
  });
  if (!v.ok) return { error: "invalid_client" };
  // Single use: the jti is the replay cache's key (a second use fails the insert).
  const used = await tx
    .insert(exchangeJti)
    .values({ jti: v.claims.jti, senderId: s.id, expiresAt: new Date(v.claims.exp * 1000) })
    .onConflictDoNothing()
    .returning({ jti: exchangeJti.jti });
  if (!used.length) return { error: "invalid_client" };
  const asked = (i.scope ?? "").split(/\s+/).filter(Boolean);
  const scopes = asked.length ? s.scopes.filter((x) => asked.includes(x)) : s.scopes;
  if (!scopes.length) return { error: "invalid_scope" };
  const { token, hash } = mintToken();
  await tx.insert(exchangeTokens).values({
    tokenHash: hash,
    senderId: s.id,
    scopes,
    issuedAt: i.now,
    expiresAt: new Date(i.now.getTime() + TOKEN_SECONDS * 1000),
  });
  return { token, expiresIn: TOKEN_SECONDS, scope: scopes.join(" ") };
}

/** A bearer token, for one scope, for the sender and hospital the URL names; the sender must still be active. */
export async function authenticate(
  tx: EmrTx,
  i: { token: string; scope: string; senderId: string; hospitalId: string; now: Date },
): Promise<{
  senderId: string;
  hospitalId: string;
  zone: string;
  partnerId: string | null;
} | null> {
  const [t] = await tx
    .select()
    .from(exchangeTokens)
    .where(eq(exchangeTokens.tokenHash, tokenHash(i.token)));
  if (!t || t.expiresAt <= i.now || t.senderId !== i.senderId || !t.scopes.includes(i.scope))
    return null;
  const [s] = await tx.select().from(exchangeSenders).where(eq(exchangeSenders.id, t.senderId));
  if (!s || s.state !== "active" || s.hospitalId !== i.hospitalId) return null;
  return { senderId: s.id, hospitalId: s.hospitalId, zone: s.zone, partnerId: s.partnerId };
}

/* ─── Store before acknowledge (EX-1..EX-3) ──────────────────────────── */

export async function storeInbound(
  tx: EmrTx,
  i: {
    senderId: string;
    channel: "fhir" | "hl7v2" | "astm" | "file";
    contentType: string;
    raw: string;
    externalId: string | null;
    senderTime: string | null;
    senderTimeUtc: Date | null;
  },
): Promise<{ messageId: string; duplicate: boolean }> {
  const about = `${i.channel.toUpperCase()} message from the sender`;
  const r = rowsOf<{ message_id: string; duplicate: boolean }>(
    await tx.execute(sql`SELECT * FROM private.exchange_store_inbound(${i.senderId}::uuid, ${i.channel}, ${i.contentType},
      ${encrypt(i.raw)}, NULL, ${contentHash(i.raw)}, ${i.externalId}, ${about}, ${i.senderTime},
      ${i.senderTimeUtc ? i.senderTimeUtc.toISOString() : null}::timestamptz)`),
  )[0]!;
  return { messageId: r.message_id, duplicate: r.duplicate };
}

/* ─── Processing (EX-5, EX-7, MA-1..MA-5, D-LAB4-11) ─────────────────── */

async function lastState(tx: EmrTx, messageId: string) {
  const [e] = rowsOf<{ state: string }>(
    await tx.execute(sql`SELECT state FROM exchange_events WHERE message_id = ${messageId}
      AND state NOT IN ('duplicate','raw_viewed') ORDER BY id DESC LIMIT 1`),
  );
  return e?.state ?? null;
}
const event = (
  tx: EmrTx,
  hospitalId: string,
  messageId: string,
  state: string,
  detail?: Record<string, unknown>,
) => tx.insert(exchangeEvents).values({ hospitalId, messageId, state, detail: detail ?? null });

/** The open referrals a partner's result can match, with what MA-1 compares (in memory only). */
async function candidates(tx: EmrTx, hospitalId: string, partnerId: string) {
  const rows = await tx
    .select({
      id: labReferrals.id,
      externalIds: labReferrals.externalIds,
      labNumber: specimens.labelNo,
      patientUserId: labReferrals.patientUserId,
      state: labReferrals.state,
    })
    .from(labReferrals)
    .innerJoin(specimens, eq(specimens.id, labReferrals.specimenId))
    .where(
      and(
        eq(labReferrals.hospitalId, hospitalId),
        eq(labReferrals.partnerId, partnerId),
        notInArray(labReferrals.state, [
          "completed",
          "failed",
          "lost",
          "cancelled",
          "rejected",
          "draft",
        ]),
      ),
    );
  const out = [];
  for (const r of rows)
    out.push({
      referralId: r.id,
      hospitalId,
      theirNumbers: Object.values((r.externalIds ?? {}) as Record<string, string>),
      labNumber: r.labNumber ?? "",
      open: true,
      patient: await patientForCompare(tx, r.patientUserId),
    });
  return out;
}

/** Whether this partner may send to us electronically (PT-4: complete, signed legal record in force). */
async function partnerEnabled(tx: EmrTx, hospitalId: string, partnerId: string, now: Date) {
  const [p] = await tx
    .select({ kind: labPartners.kind })
    .from(labPartners)
    .where(eq(labPartners.id, partnerId));
  const legal = inForce(await loadConfigs(tx, hospitalId), "partner_legal", partnerId, now);
  const parsed = legal ? PartnerLegalPayload.safeParse(legal.payload) : null;
  const today = now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  return electronicSendAllowed({
    legal: parsed?.success ? parsed.data : null,
    legalSigned: !!legal,
    partnerKind: p?.kind ?? "",
    consentRef: "inbound",
    today,
    stopSendingDaysAfterReview: 30,
  }).ok;
}

/**
 * EX-5: process one stored message, once. Status updates move the referral (RF-3 by the Task table; a late one is
 * kept, not applied, EX-7). A result that meets MA-1 lands as "back, to file" (a lab user files it, D-LAB4-11);
 * anything else waits with its reason, one item per component, no values in it (MA-3, MA-5).
 */
export async function processInbound(tx: EmrTx, messageId: string, now: Date): Promise<string> {
  const [m] = await tx
    .select()
    .from(exchangeMessages)
    .where(eq(exchangeMessages.id, messageId))
    .for("update");
  if (!m || m.direction !== "in") return "missing";
  const last = await lastState(tx, messageId);
  if (last !== "received") return last ?? "missing";
  const [s] = m.senderId
    ? await tx.select().from(exchangeSenders).where(eq(exchangeSenders.id, m.senderId))
    : [];
  if (!s?.partnerId || m.channel !== "fhir") {
    await event(tx, m.hospitalId, m.id, "unreadable", {
      error: "no adapter for this sender (Step 9/10 gap)",
    });
    return "unreadable";
  }
  const sys = referralSystems(m.hospitalId, s.partnerId);
  const parsed = fhirReceive(decrypt(m.payloadCiphertext!), {
    referralSystem: sys.referral,
    formSystem: sys.partnerForm,
  });
  if (parsed.every((p) => p.kind === "unreadable")) {
    await event(tx, m.hospitalId, m.id, "unreadable", {
      error: parsed[0]?.kind === "unreadable" ? parsed[0].error : "unreadable",
    });
    return "unreadable";
  }
  await event(tx, m.hospitalId, m.id, "parsed", {
    conformant: parsed.every((p) => p.kind !== "result" || p.result.conformant),
  });
  let outcome = "parsed";
  const enabled = await partnerEnabled(tx, m.hospitalId, s.partnerId, now);
  for (const p of parsed) {
    if (p.kind === "status") {
      const [ref] = await tx
        .select({ id: labReferrals.id })
        .from(labReferrals)
        .where(
          and(
            eq(labReferrals.hospitalId, m.hospitalId),
            eq(labReferrals.number, p.update.referralNumber),
            eq(labReferrals.partnerId, s.partnerId),
          ),
        );
      const state = stateForTask(p.update.status, p.update.businessStatus);
      if (!ref || !state || state === "draft") continue;
      await appendEvent(
        tx,
        SYSTEM(m.hospitalId),
        ref.id,
        {
          kind: state as Exclude<ReferralState, "draft">,
          eventAt: p.update.eventAt,
          source: "partner_message",
          messageId: m.id,
          note: p.update.businessStatus ?? null,
          reasonCode: p.update.statusReason ?? null,
        },
        now,
      );
      outcome = "matched";
      continue;
    }
    if (p.kind !== "result") continue;
    const match = matchPartnerResult(p.result, await candidates(tx, m.hospitalId, s.partnerId), {
      hospitalId: m.hospitalId,
      partnerEnabled: enabled,
    });
    if ("file" in match) {
      await event(tx, m.hospitalId, m.id, "matched", { referralId: match.file, backToFile: true });
      outcome = "matched";
    } else if ("wait" in match) {
      for (const c of p.result.components.length ? p.result.components : [{ key: "result" }])
        await tx
          .insert(labMatchItems)
          .values({
            hospitalId: m.hospitalId,
            messageId: m.id,
            componentKey: c.key,
            reason: match.wait,
            candidateReferralId: match.candidate,
            comparison: match.comparison,
            state: "waiting",
            createdAt: now,
          })
          .onConflictDoNothing();
      await event(tx, m.hospitalId, m.id, "waiting_match", { reason: match.wait });
      outcome = "waiting_match";
    }
  }
  return outcome;
}

/** Messages whose processing never ran (a crash after the acknowledgement): processed now, once each (S29). */
export async function sweepUnprocessed(tx: EmrTx, now: Date, limit = 50): Promise<number> {
  const ids = rowsOf<{ id: string }>(
    await tx.execute(sql`SELECT m.id FROM exchange_messages m WHERE m.direction = 'in' AND (
        SELECT e.state FROM exchange_events e WHERE e.message_id = m.id AND e.state NOT IN ('duplicate','raw_viewed')
         ORDER BY e.id DESC LIMIT 1) = 'received' ORDER BY m.received_at LIMIT ${limit}`),
  );
  for (const { id } of ids) await processInbound(tx, id, now);
  return ids.length;
}

/** The results waiting to be filed by a lab user (RB-10, D-LAB4-11), with no values. */
export async function backToFile(tx: EmrTx, hospitalId: string) {
  return rowsOf<{
    messageId: string;
    referralId: string;
    number: string;
    partner: string;
    receivedAt: string;
  }>(
    await tx.execute(sql`SELECT m.id AS "messageId", (e.detail->>'referralId')::uuid AS "referralId", r.number, p.name AS partner,
        m.received_at AS "receivedAt"
      FROM exchange_messages m
      JOIN LATERAL (SELECT state, detail FROM exchange_events x WHERE x.message_id = m.id
             AND x.state NOT IN ('duplicate','raw_viewed') ORDER BY x.id DESC LIMIT 1) e ON e.state = 'matched'
      JOIN lab_referrals r ON r.id = (e.detail->>'referralId')::uuid
      JOIN lab_partners p ON p.id = r.partner_id
     WHERE m.hospital_id = ${hospitalId} AND (e.detail->>'backToFile')::boolean ORDER BY m.received_at`),
  );
}

/**
 * RB-10, EX-6, S38: a lab user files a partner's result on its referral's original order, as an interfaced,
 * external report. Idempotent: one match item per component (unique), so a second filing returns the same report.
 */
export async function fileElectronicResult(
  ctx: WriteCtx,
  i: { messageId: string; clientKey: string },
): Promise<{ id: string }> {
  const { tx, actor, now } = ctx;
  const [m] = await tx
    .select()
    .from(exchangeMessages)
    .where(
      and(eq(exchangeMessages.id, i.messageId), eq(exchangeMessages.hospitalId, actor.hospitalId)),
    )
    .for("update");
  if (!m) throw new EmrWriteError("not_found", "That message was not found.");
  const [done] = await tx
    .select({ reportId: labMatchItems.reportId })
    .from(labMatchItems)
    .where(and(eq(labMatchItems.messageId, m.id), eq(labMatchItems.state, "filed")));
  if (done?.reportId) return { id: done.reportId };
  if ((await lastState(tx, m.id)) !== "matched")
    throw new EmrWriteError("conflict", "This message is not waiting to be filed.");
  const [s] = await tx.select().from(exchangeSenders).where(eq(exchangeSenders.id, m.senderId!));
  const sys = referralSystems(m.hospitalId, s!.partnerId!);
  const result = fhirReceive(decrypt(m.payloadCiphertext!), {
    referralSystem: sys.referral,
    formSystem: sys.partnerForm,
  }).find((p) => p.kind === "result");
  if (!result || result.kind !== "result")
    throw new EmrWriteError("conflict", "This message has no result.");
  const r = await targetReferral(tx, actor.hospitalId, result.result, s!.partnerId!);
  const values = await componentValues(tx, actor.hospitalId, r, result.result, now);
  const [p] = await tx
    .select({ name: labPartners.name })
    .from(labPartners)
    .where(eq(labPartners.id, r.partnerId));
  const report = await enterReferredResult(ctx, {
    patientUserId: r.patientUserId,
    orderId: r.orderId,
    referralId: r.id,
    performerLabName: p!.name,
    entryMode: "interface",
    values,
    checkedByUserId: null,
    provenance: {
      partner: p!.name,
      messageId: m.id,
      theirReport: result.result.report?.number ?? null,
      reportedAt: result.result.report?.issued ?? null,
      authorisedBy: result.result.report?.authorisedBy ?? null,
      enteredBy: actor.userId,
      checkedBy: null,
      oneEntrant: false,
      cancelledAfterSending: r.cancelRequested,
      filedAfterMismatch: null,
      checkTaskId: null,
      conformant: result.result.conformant,
    },
    clientKey: i.clientKey,
  });
  for (const c of result.result.components)
    await tx
      .insert(labMatchItems)
      .values({
        hospitalId: actor.hospitalId,
        messageId: m.id,
        componentKey: c.key,
        reason: null,
        candidateReferralId: r.id,
        state: "filed",
        reportId: report.id,
        createdAt: now,
        decidedAt: now,
      })
      .onConflictDoNothing();
  // RB-5: Phase 1's critical flow on the value in this hospital's unit, as for paper.
  if (await unitsRangesLive(actor.hospitalId))
    await alertAfterRelease(ctx, {
      patientUserId: r.patientUserId,
      orderId: r.orderId,
      reportId: report.id,
      marks: [],
      note: null,
      clientKey: i.clientKey,
      autoCheck: {
        check: { kind: "checked_not_repeated" },
        sampleChecked: false,
        secondCheckerId: null,
        soloReason: `Filed from ${p!.name}'s system`,
      },
    });
  await event(tx, actor.hospitalId, m.id, "filed", { reportId: report.id });
  const a = { userId: actor.userId, hospitalId: actor.hospitalId };
  await appendEvent(
    tx,
    a,
    r.id,
    { kind: "completed", eventAt: now, source: "partner_message", messageId: m.id },
    now,
  );
  await appendEvent(
    tx,
    a,
    r.id,
    { kind: "result_filed", eventAt: now, source: "person", document: "their_portal", note: m.id },
    now,
  );
  return { id: report.id };
}

async function targetReferral(
  tx: EmrTx,
  hospitalId: string,
  result: InboundResult,
  partnerId: string,
) {
  const match = matchPartnerResult(result, await candidates(tx, hospitalId, partnerId), {
    hospitalId,
    partnerEnabled: true,
  });
  if (!("file" in match))
    throw new EmrWriteError("conflict", "This result no longer matches one open referral.");
  const [r] = await tx.select().from(labReferrals).where(eq(labReferrals.id, match.file));
  return { ...r!, orderId: r!.orderIds[0]! };
}

/** FX-3 with the signed component map; RB-3 and RB-4 apply to the values exactly as to paper. */
async function componentValues(
  tx: EmrTx,
  hospitalId: string,
  r: { orderId: string; partnerTestsConfigId: string | null },
  result: InboundResult,
  now: Date,
): Promise<ResultValueInput[]> {
  const [o] = await tx
    .select({ code: testCatalogue.code, components: testCatalogue.components })
    .from(encounterOrders)
    .leftJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
    .where(eq(encounterOrders.id, r.orderId));
  const configs = await loadConfigs(tx, hospitalId);
  const tests = r.partnerTestsConfigId
    ? (configs.find((c) => c.id === r.partnerTestsConfigId)?.payload as
        | { tests: { testCode: string; components?: Record<string, string> }[] }
        | undefined)
    : undefined;
  const map = tests?.tests.find((t) => t.testCode === o?.code)?.components ?? {};
  const only =
    o?.components?.length === 1 && result.components.length === 1 ? o.components[0]! : null;
  void now;
  return result.components.map((c) => {
    const conceptId = map[c.code] ?? only;
    if (!conceptId)
      throw new EmrWriteError(
        "conflict",
        `Their code ${c.code} has no signed mapping to our test's components.`,
      );
    return {
      conceptId,
      value: c.value,
      ...((c.ucum ?? c.unit) ? { unit: c.ucum ?? c.unit } : {}),
      unitConfirmed: true,
      extraContext: { printed: { range: c.rangeText ?? null, flag: c.flagText ?? null } },
    };
  });
}

/* ─── The outbox (EX-4) ──────────────────────────────────────────────── */

export type Transport = (m: {
  messageId: string;
  senderId: string;
  contentType: string;
  body: string;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

/** Claim due rows (a conditional update, so two workers never send one message), send, record the outcome. */
export async function drainOutbox(
  tx: EmrTx,
  send: Transport,
  now: Date,
  random = Math.random,
): Promise<{ sent: number; failed: number }> {
  const due = await tx
    .select()
    .from(exchangeOutbox)
    .where(
      and(
        inArray(exchangeOutbox.state, ["pending", "retrying"]),
        lte(exchangeOutbox.nextAt, now),
        or(sql`${exchangeOutbox.claimedUntil} IS NULL`, lte(exchangeOutbox.claimedUntil, now)),
      ),
    )
    .orderBy(asc(exchangeOutbox.nextAt))
    .limit(25);
  let sent = 0;
  let failed = 0;
  for (const o of due) {
    const claimed = await tx
      .update(exchangeOutbox)
      .set({ state: "sending", claimedUntil: new Date(now.getTime() + 60_000), updatedAt: now })
      .where(
        and(
          eq(exchangeOutbox.messageId, o.messageId),
          inArray(exchangeOutbox.state, ["pending", "retrying"]),
        ),
      )
      .returning({ id: exchangeOutbox.messageId });
    if (!claimed.length) continue;
    const [m] = await tx
      .select()
      .from(exchangeMessages)
      .where(eq(exchangeMessages.id, o.messageId));
    await event(tx, o.hospitalId, o.messageId, "sending", { attempt: o.attempts + 1 });
    const r = await send({
      messageId: o.messageId,
      senderId: o.senderId,
      contentType: m!.contentType,
      body: decrypt(m!.payloadCiphertext!),
    }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (r.ok) {
      await tx
        .update(exchangeOutbox)
        .set({
          state: "delivered",
          attempts: o.attempts + 1,
          nextAt: null,
          lastError: null,
          claimedUntil: null,
          updatedAt: now,
        })
        .where(eq(exchangeOutbox.messageId, o.messageId));
      await event(tx, o.hospitalId, o.messageId, "delivered");
      sent++;
      continue;
    }
    const next = nextAttempt({ attempts: o.attempts + 1, now, random });
    await tx
      .update(exchangeOutbox)
      .set({
        state: next.state,
        attempts: o.attempts + 1,
        nextAt: next.state === "retrying" ? next.nextAt : null,
        lastError: r.error.slice(0, 300),
        claimedUntil: null,
        updatedAt: now,
      })
      .where(eq(exchangeOutbox.messageId, o.messageId));
    await event(tx, o.hospitalId, o.messageId, next.state, {
      attempt: o.attempts + 1,
      error: r.error.slice(0, 120),
    });
    failed++;
  }
  return { sent, failed };
}

/** EX-4: a person retries a dead message, or sets one aside, with a reason; nothing is ever purged. */
export async function retryOrSetAside(
  tx: EmrTx,
  a: Actor,
  i: { messageId: string; action: "retry" | "set_aside"; reason: string },
  now: Date,
) {
  const [o] = await tx
    .select()
    .from(exchangeOutbox)
    .where(
      and(eq(exchangeOutbox.messageId, i.messageId), eq(exchangeOutbox.hospitalId, a.hospitalId)),
    )
    .for("update");
  const [m] = o
    ? []
    : await tx
        .select({ id: exchangeMessages.id })
        .from(exchangeMessages)
        .where(
          and(eq(exchangeMessages.id, i.messageId), eq(exchangeMessages.hospitalId, a.hospitalId)),
        );
  if (!o && !m) throw new EmrWriteError("not_found", "That message was not found.");
  if (o) {
    if (o.state !== "dead")
      throw new EmrWriteError(
        "conflict",
        "Only a message that stopped trying is retried or set aside here.",
      );
    await tx
      .update(exchangeOutbox)
      .set(
        i.action === "retry"
          ? { state: "pending", attempts: 0, nextAt: now, updatedAt: now }
          : { state: "set_aside", updatedAt: now },
      )
      .where(eq(exchangeOutbox.messageId, o.messageId));
  }
  await tx.insert(exchangeEvents).values({
    hospitalId: a.hospitalId,
    messageId: i.messageId,
    state: i.action === "retry" ? "retried_by_person" : "set_aside",
    detail: { reason: i.reason },
    actorUserId: a.userId,
    at: now,
  });
  if (!o && i.action === "retry")
    await tx
      .insert(exchangeEvents)
      .values({ hospitalId: a.hospitalId, messageId: i.messageId, state: "received", at: now });
}

/** EX-9, S35: the raw message, for lab.exchange.manage, with a reason; every opening is an event. */
export async function openRaw(
  tx: EmrTx,
  a: Actor,
  i: { messageId: string; reason: string },
  now: Date,
): Promise<string> {
  const [m] = await tx
    .select()
    .from(exchangeMessages)
    .where(
      and(eq(exchangeMessages.id, i.messageId), eq(exchangeMessages.hospitalId, a.hospitalId)),
    );
  if (!m?.payloadCiphertext) throw new EmrWriteError("not_found", "That message was not found.");
  await tx.insert(exchangeEvents).values({
    hospitalId: a.hospitalId,
    messageId: m.id,
    state: "raw_viewed",
    detail: { reason: i.reason },
    actorUserId: a.userId,
    at: now,
  });
  return decrypt(m.payloadCiphertext);
}

/* ─── Pairing and identities (AB-6, B3, PT-4) ────────────────────────── */

export async function createSender(
  tx: EmrTx,
  a: Actor,
  i: { kind: "partner" | "bridge"; partnerId: string | null; name: string; code: { hash: string } },
  now: Date,
): Promise<string> {
  if (i.kind === "partner") {
    const [p] = await tx
      .select({ id: labPartners.id })
      .from(labPartners)
      .where(and(eq(labPartners.id, i.partnerId ?? ""), eq(labPartners.hospitalId, a.hospitalId)));
    if (!p) throw new EmrWriteError("not_found", "That partner was not found.");
  }
  const [s] = await tx
    .insert(exchangeSenders)
    .values({
      hospitalId: a.hospitalId,
      kind: i.kind,
      partnerId: i.kind === "partner" ? i.partnerId : null,
      name: i.name,
      state: "pairing",
      scopes: Object.values(SCOPE),
      pairingHash: i.code.hash,
      pairingExpiresAt: new Date(now.getTime() + PAIRING.minutes * 60_000),
      createdBy: a.userId,
      createdAt: now,
    })
    .returning({ id: exchangeSenders.id });
  return s!.id;
}

/** The machine presents the code and its public key; the lab lead then compares the fingerprint (B3). */
export async function pairSender(
  tx: EmrTx,
  i: { senderId: string; code: string; jwk: Jwk; now: Date },
): Promise<{ fingerprint: string } | { error: string }> {
  const [s] = await tx
    .select()
    .from(exchangeSenders)
    .where(eq(exchangeSenders.id, i.senderId))
    .for("update");
  if (!s || s.state !== "pairing" || !s.pairingHash) return { error: "not_pairing" };
  if (s.pairingFailures >= PAIRING.failures) return { error: "locked" };
  if (!s.pairingExpiresAt || s.pairingExpiresAt <= i.now) return { error: "expired" };
  if (!sameHash(codeHash(i.code), s.pairingHash)) {
    await tx
      .update(exchangeSenders)
      .set({ pairingFailures: s.pairingFailures + 1 })
      .where(eq(exchangeSenders.id, s.id));
    return { error: "wrong_code" };
  }
  const fingerprint = keyFingerprint(i.jwk);
  await tx
    .update(exchangeSenders)
    .set({
      jwks: { keys: [i.jwk] },
      keyFingerprint: fingerprint,
      pairingHash: null,
      pairingExpiresAt: null,
    })
    .where(eq(exchangeSenders.id, s.id));
  return { fingerprint };
}

/** The lab lead enables a paired machine after comparing its fingerprint; a partner needs PT-4's legal record. */
export async function enableSender(
  tx: EmrTx,
  a: Actor,
  i: { senderId: string; fingerprint: string },
  now: Date,
) {
  const [s] = await tx
    .select()
    .from(exchangeSenders)
    .where(and(eq(exchangeSenders.id, i.senderId), eq(exchangeSenders.hospitalId, a.hospitalId)))
    .for("update");
  if (!s || s.state !== "pairing" || !s.jwks)
    throw new EmrWriteError("conflict", "Pair the machine first.");
  if (s.keyFingerprint !== i.fingerprint.trim().toUpperCase())
    throw new EmrWriteError("invalid", "The fingerprint does not match what the machine shows.");
  if (s.kind === "partner" && !(await partnerEnabled(tx, a.hospitalId, s.partnerId!, now)))
    throw new EmrWriteError(
      "forbidden",
      "The data protection lead has not completed and signed this partner's legal record.",
    );
  await tx
    .update(exchangeSenders)
    .set({ state: "active", enabledBy: a.userId, enabledAt: now })
    .where(eq(exchangeSenders.id, s.id));
}

/** Revoked at once: every later request re-reads the sender (authenticate), and its tokens die with it. */
export async function revokeSender(tx: EmrTx, a: Actor, i: { senderId: string }, now: Date) {
  const r = await tx
    .update(exchangeSenders)
    .set({ state: "revoked", revokedBy: a.userId, revokedAt: now })
    .where(
      and(
        eq(exchangeSenders.id, i.senderId),
        eq(exchangeSenders.hospitalId, a.hospitalId),
        inArray(exchangeSenders.state, ["pairing", "active"]),
      ),
    )
    .returning({ id: exchangeSenders.id });
  if (!r.length) throw new EmrWriteError("not_found", "That connection was not found.");
  await tx.delete(exchangeTokens).where(eq(exchangeTokens.senderId, i.senderId));
}

export async function heartbeat(tx: EmrTx, senderId: string, now: Date) {
  await tx
    .update(exchangeSenders)
    .set({ lastHeardAt: now })
    .where(eq(exchangeSenders.id, senderId));
}
