import "server-only";

import type { ConfigKind } from "./signed-config";
import type { EmrTx } from "@/lib/emr/db";
import type { ReferralEvent, ReferralEventKind, ReferralState } from "@/lib/exchange/types";
import { and, arrayOverlaps, asc, eq, sql } from "drizzle-orm";

import {
  encounterOrders,
  labManifestItems,
  labManifestPrints,
  labManifests,
  labPartners,
  labReferralEvents,
  labReferrals,
  specimenEvents,
  specimens,
  testCatalogue,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { legalMissing, PartnerFieldsPayload, testFor } from "@/lib/exchange/partners";
import { loadConfigs } from "./catalogue-v2";
import { highRiskFor } from "./collection-store";
import { ipcLabFeedLiveFor } from "./feature";
import { manifestNumber, readiness, receiptOutcome } from "./manifest";
import { openAutomaticNc } from "./nc-store";
import { menuToday } from "./one-menu-read";
import {
  cancelEffect,
  destinationCheck,
  markLostErrors,
  outbreakReferralErrors,
  projectReferral,
  referrable,
  referralNumber,
} from "./referral";
import { inForce } from "./signed-config";

/**
 * Referrals and manifests on the database (Lab Phase 4 §6.1–6.2, §8; gate-a-proposal §3.2, §5.1–5.2). Every write
 * runs in the caller's transaction as the clinical writer (audited by trigger). The referral's state is never
 * written by itself: an event is appended and the projection (lib/lab/referral.ts) rewrites the cached columns
 * in the same transaction (RF-4, EX-7).
 */

export type Actor = { userId: string; hospitalId: string; cadreCode?: string | null };
const invalid = (m: string) => new EmrWriteError("invalid", m);
const year = (now: Date) =>
  Number(now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" }).slice(0, 4));

/** Per hospital and year, under a transaction lock so two writers never take the same number. */
async function nextNumber(tx: EmrTx, a: Actor, prefix: "RF" | "MF", now: Date): Promise<string> {
  const y = year(now);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${a.hospitalId}`}))`);
  const table = prefix === "RF" ? labReferrals : labManifests;
  const [r] = (await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(
      and(eq(table.hospitalId, a.hospitalId), sql`${table.number} LIKE ${`${prefix}-${y}-%`}`),
    )) as [{ n: number }];
  return prefix === "RF" ? referralNumber(y, r.n + 1) : manifestNumber(y, r.n + 1);
}

/* ─── Signed partner configuration in force ─────────────────────────── */

export async function partnerConfig<K extends ConfigKind>(
  tx: EmrTx,
  hospitalId: string,
  kind: K,
  key: string,
  now: Date,
) {
  return inForce(await loadConfigs(tx, hospitalId), kind, key, now);
}

/* ─── Partners (PT-1) ───────────────────────────────────────────────── */

export interface PartnerInput {
  id?: string;
  name: string;
  kind: "national_reference" | "public_lab" | "private_lab" | "abroad" | "outbreak" | "hub";
  contacts: { role: string; name: string; phone?: string | null; email?: string | null }[];
  transport: { code: string; words: string }[];
  resultsReturn: { channel: "paper" | "portal_print" | "sms" | "electronic"; words: string }[];
  active: boolean;
}

export async function savePartner(
  tx: EmrTx,
  a: Actor,
  p: PartnerInput,
  now: Date,
): Promise<string> {
  if (p.id) {
    const [r] = await tx
      .update(labPartners)
      .set({ ...p, id: undefined, updatedBy: a.userId, updatedAt: now })
      .where(and(eq(labPartners.id, p.id), eq(labPartners.hospitalId, a.hospitalId)))
      .returning({ id: labPartners.id });
    if (!r) throw new EmrWriteError("not_found", "That partner was not found.");
    return r.id;
  }
  const [r] = await tx
    .insert(labPartners)
    .values({ ...p, hospitalId: a.hospitalId, createdBy: a.userId, createdAt: now })
    .returning({ id: labPartners.id });
  return r!.id;
}

async function partnerOf(tx: EmrTx, a: Actor, id: string) {
  const [p] = await tx
    .select()
    .from(labPartners)
    .where(and(eq(labPartners.id, id), eq(labPartners.hospitalId, a.hospitalId)));
  if (!p) throw new EmrWriteError("not_found", "That partner was not found.");
  if (!p.active) throw new EmrWriteError("conflict", "That partner is not active.");
  return p;
}

/* ─── Events and the projection (RF-4, EX-7) ────────────────────────── */

export interface NewEvent {
  kind: ReferralEventKind;
  eventAt: Date;
  source: "person" | "partner_message" | "system";
  document?:
    | "rider_log"
    | "phone_call"
    | "signed_manifest"
    | "their_portal"
    | "their_paper"
    | "sms"
    | "in_person"
    | "other";
  messageId?: string | null;
  reasonCode?: string | null;
  note?: string | null;
}

/** Append one event, then rewrite the referral's cached state from all of them. Returns whether it applied. */
export async function appendEvent(
  tx: EmrTx,
  a: Actor,
  referralId: string,
  e: NewEvent,
  now: Date,
): Promise<boolean> {
  const [ref] = await tx
    .select({ id: labReferrals.id })
    .from(labReferrals)
    .where(and(eq(labReferrals.id, referralId), eq(labReferrals.hospitalId, a.hospitalId)))
    .for("update");
  if (!ref) throw new EmrWriteError("not_found", "That referral was not found.");
  const prior = await tx
    .select()
    .from(labReferralEvents)
    .where(eq(labReferralEvents.referralId, referralId))
    .orderBy(asc(labReferralEvents.seq));
  const asEvent = (r: {
    kind: string;
    eventAt: Date;
    seq: number | null;
    source: string;
  }): ReferralEvent => ({
    kind: r.kind as ReferralEventKind,
    eventAt: r.eventAt,
    seq: r.seq ?? 0,
    source: r.source as ReferralEvent["source"],
  });
  const next: ReferralEvent = {
    kind: e.kind,
    eventAt: e.eventAt,
    seq: Number.MAX_SAFE_INTEGER,
    source: e.source,
  };
  const p = projectReferral([...prior.map(asEvent), next]);
  const applied = p.applied.at(-1)!;
  await tx.insert(labReferralEvents).values({
    hospitalId: a.hospitalId,
    referralId,
    kind: e.kind,
    eventAt: e.eventAt,
    source: e.source,
    actorUserId: e.source === "person" ? a.userId : null,
    document: e.document ?? null,
    messageId: e.messageId ?? null,
    reasonCode: e.reasonCode ?? null,
    note: e.note ?? null,
    applied,
    recordedAt: now,
  });
  await tx
    .update(labReferrals)
    .set({
      state: p.state,
      stateAt: p.stateAt ?? now,
      sentAt: p.sentAt,
      completedAt: p.completedAt,
      cancelRequested: p.cancelRequested,
    })
    .where(eq(labReferrals.id, referralId));
  return applied;
}

/* ─── Creating a referral from To refer (RF-1, RF-2, RF-6, RF-7, PT-5) ─ */

interface SpecimenCtx {
  id: string;
  orderId: string;
  patientUserId: string;
  encounterId: string;
  labNumber: string | null;
  testCode: string | null;
  sensitivity: string;
}

async function specimenCtx(tx: EmrTx, a: Actor, specimenId: string): Promise<SpecimenCtx> {
  const [s] = await tx
    .select({
      id: specimens.id,
      orderId: specimens.orderId,
      patientUserId: specimens.patientUserId,
      encounterId: encounterOrders.encounterId,
      labNumber: specimens.labelNo,
      testCode: testCatalogue.code,
      sensitivity: encounterOrders.sensitivity,
    })
    .from(specimens)
    .innerJoin(encounterOrders, eq(encounterOrders.id, specimens.orderId))
    .leftJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
    .where(and(eq(specimens.id, specimenId), eq(specimens.hospitalId, a.hospitalId)));
  if (!s) throw new EmrWriteError("not_found", "That specimen was not found.");
  return { ...s, encounterId: s.encounterId!, sensitivity: s.sensitivity ?? "standard" };
}

/** What the server checks before a specimen joins a manifest; the same rule the send panel shows (RF-6). */
export async function sendCheck(
  tx: EmrTx,
  a: Actor,
  i: {
    specimenId: string;
    partnerId: string;
    externalIds: Record<string, string>;
    packing: string[];
  },
  now: Date,
) {
  const s = await specimenCtx(tx, a, i.specimenId);
  const partner = await partnerOf(tx, a, i.partnerId);
  if (partner.kind === "outbreak")
    throw invalid("An outbreak destination takes outbreak referrals only.");
  const today = (await menuToday(tx, a.hospitalId))(s.testCode ?? "");
  if (!referrable({ availability: today.state, nationalProgrammeTest: false }))
    throw invalid("This test is not on To refer today.");
  const risk = (await highRiskFor(tx, [s.encounterId])).get(s.encounterId);
  if (risk)
    throw new EmrWriteError("forbidden", "A high-risk specimen never goes on a routine manifest.");
  const tests = await partnerConfig(tx, a.hospitalId, "partner_tests", partner.id, now);
  const legal = await partnerConfig(tx, a.hospitalId, "partner_legal", partner.id, now);
  const fields = await partnerConfig(tx, a.hospitalId, "partner_fields", partner.id, now);
  if (!legal || !fields || legalMissing(legal.payload).includes("legal_record"))
    throw invalid(
      "The data protection lead has not signed this partner's legal record and field list.",
    );
  PartnerFieldsPayload.parse(fields.payload);
  const mapped = testFor(tests?.payload ?? null, s.testCode ?? "");
  const packing =
    tests && "category" in mapped
      ? await partnerConfig(
          tx,
          a.hospitalId,
          "partner_packing",
          `${partner.id}:${mapped.category}`,
          now,
        )
      : null;
  const r = readiness({
    requiredIds: "requiredIds" in mapped ? mapped.requiredIds.map((x) => x.key) : [],
    scanned: i.externalIds,
    packingItems: packing?.payload.items.map((x) => x.key) ?? [],
    ticked: i.packing,
    unmappedTests: "mapBeforeSending" in mapped ? [s.testCode ?? ""] : [],
  });
  return { s, partner, tests, mapped, r };
}

export async function addToManifest(
  tx: EmrTx,
  a: Actor,
  i: {
    partnerId: string;
    transport: string;
    items: {
      specimenId: string;
      externalIds: Record<string, string>;
      packing: string[];
      consentRef: string | null;
    }[];
    clientKey: string;
  },
  now: Date,
): Promise<string> {
  const [done] = await tx
    .select({ id: labManifestItems.manifestId })
    .from(labReferrals)
    .innerJoin(labManifestItems, eq(labManifestItems.referralId, labReferrals.id))
    .where(
      and(
        eq(labReferrals.hospitalId, a.hospitalId),
        eq(labReferrals.clientKey, `${i.clientKey}:0`),
      ),
    );
  if (done) return done.id;
  // One open manifest per partner and transport; a sealed one never changes (MF-3).
  let [m] = await tx
    .select({ id: labManifests.id })
    .from(labManifests)
    .where(
      and(
        eq(labManifests.hospitalId, a.hospitalId),
        eq(labManifests.partnerId, i.partnerId),
        eq(labManifests.transport, i.transport),
        eq(labManifests.state, "open"),
      ),
    )
    .for("update");
  if (!m)
    [m] = await tx
      .insert(labManifests)
      .values({
        hospitalId: a.hospitalId,
        number: await nextNumber(tx, a, "MF", now),
        partnerId: i.partnerId,
        transport: i.transport,
        createdBy: a.userId,
        createdAt: now,
      })
      .returning({ id: labManifests.id });
  const [{ n }] = (await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(labManifestItems)
    .where(eq(labManifestItems.manifestId, m!.id))) as [{ n: number }];
  let position = n;
  for (const [k, item] of i.items.entries()) {
    const c = await sendCheck(tx, a, { ...item, partnerId: i.partnerId }, now);
    if (!c.r.ready)
      throw invalid(
        c.r.reason ?? `${c.s.labNumber ?? "A specimen"}: map the test for this partner first.`,
      );
    if (c.partner.kind === "abroad" && !item.consentRef)
      throw new EmrWriteError(
        "forbidden",
        "Record the patient's consent or the safeguards before sending abroad.",
      );
    const existing = await tx
      .select({ partnerId: labReferrals.partnerId, state: labReferrals.state })
      .from(labReferrals)
      .where(eq(labReferrals.specimenId, item.specimenId));
    const where = destinationCheck(
      existing as { partnerId: string; state: ReferralState }[],
      i.partnerId,
    );
    if (where === "already_referred_there")
      throw new EmrWriteError("conflict", "This specimen is already going there.");
    if (where === "needs_aliquot")
      throw invalid(
        "This tube is already referred elsewhere: make an aliquot for this destination.",
      );
    const [ref] = await tx
      .insert(labReferrals)
      .values({
        hospitalId: a.hospitalId,
        number: await nextNumber(tx, a, "RF", now),
        specimenId: item.specimenId,
        patientUserId: c.s.patientUserId,
        orderIds: [c.s.orderId],
        partnerId: i.partnerId,
        routine: true,
        externalIds: item.externalIds,
        packing: Object.fromEntries(
          item.packing.map((p) => [p, { by: a.userId, at: now.toISOString() }]),
        ),
        partnerTestsConfigId: c.tests?.id ?? null,
        consentRef: item.consentRef,
        clientKey: `${i.clientKey}:${k}`,
        createdBy: a.userId,
        createdAt: now,
        state: "draft",
        stateAt: now,
      })
      .returning({ id: labReferrals.id });
    await appendEvent(tx, a, ref!.id, { kind: "created", eventAt: now, source: "person" }, now);
    await tx.insert(labManifestItems).values({
      manifestId: m!.id,
      referralId: ref!.id,
      hospitalId: a.hospitalId,
      position: ++position,
      addedBy: a.userId,
      addedAt: now,
    });
  }
  return m!.id;
}

async function manifestOf(tx: EmrTx, a: Actor, id: string) {
  const [m] = await tx
    .select()
    .from(labManifests)
    .where(and(eq(labManifests.id, id), eq(labManifests.hospitalId, a.hospitalId)))
    .for("update");
  if (!m) throw new EmrWriteError("not_found", "That manifest was not found.");
  const items = await tx
    .select({ referralId: labManifestItems.referralId })
    .from(labManifestItems)
    .where(eq(labManifestItems.manifestId, id));
  return { m, referralIds: items.map((x) => x.referralId) };
}

/** MF-3: sealed when printed and every item ready; each referral moves to packed. */
export async function sealManifest(
  tx: EmrTx,
  a: Actor,
  i: { manifestId: string; packages: number },
  now: Date,
) {
  const { m, referralIds } = await manifestOf(tx, a, i.manifestId);
  if (m.state !== "open") throw new EmrWriteError("conflict", "This manifest is already sealed.");
  if (referralIds.length === 0) throw invalid("Add a specimen first.");
  await tx
    .update(labManifests)
    .set({ state: "sealed", sealedBy: a.userId, sealedAt: now, packages: i.packages })
    .where(eq(labManifests.id, m.id));
  for (const r of referralIds)
    await appendEvent(tx, a, r, { kind: "packed", eventAt: now, source: "person" }, now);
  return m.id;
}

/** MF-4: every print is recorded; a reprint is a copy. */
export async function printManifest(
  tx: EmrTx,
  a: Actor,
  i: { manifestId: string },
  now: Date,
): Promise<{ copy: boolean }> {
  const { m } = await manifestOf(tx, a, i.manifestId);
  if (m.state === "open") throw invalid("Seal the manifest before printing it.");
  const [{ n }] = (await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(labManifestPrints)
    .where(eq(labManifestPrints.manifestId, m.id))) as [{ n: number }];
  await tx.insert(labManifestPrints).values({
    hospitalId: a.hospitalId,
    manifestId: m.id,
    copy: n > 0,
    printedBy: a.userId,
    printedAt: now,
  });
  return { copy: n > 0 };
}

/** MF-3: the courier's or rider's name and time; every referral on it moves to handed over. */
export async function recordHandover(
  tx: EmrTx,
  a: Actor,
  i: { manifestId: string; handedTo: string; handedAt: Date },
  now: Date,
) {
  const { m, referralIds } = await manifestOf(tx, a, i.manifestId);
  if (m.state !== "sealed")
    throw new EmrWriteError("conflict", "Seal and print the manifest before handing it over.");
  if (m.sealedAt && i.handedAt < m.sealedAt)
    throw invalid("The handover time is before the manifest was sealed.");
  if (i.handedAt.getTime() > now.getTime() + 5 * 60_000)
    throw invalid("The handover time is in the future.");
  await tx
    .update(labManifests)
    .set({ state: "handed_over", handedTo: i.handedTo, handedAt: i.handedAt })
    .where(eq(labManifests.id, m.id));
  for (const r of referralIds)
    await appendEvent(
      tx,
      a,
      r,
      {
        kind: "handed_over",
        eventAt: i.handedAt,
        source: "person",
        document: "signed_manifest",
        note: i.handedTo,
      },
      now,
    );
  return m.id;
}

/** MF-3, S11: receipt from the signed copy, a call or a message; any damage or shortfall is a discrepancy. */
export async function recordManifestReceipt(
  tx: EmrTx,
  a: Actor,
  i: {
    manifestId: string;
    how: "signed_copy" | "phone" | "message";
    receivedBy: string;
    receivedAt: Date;
    condition: ("intact" | "leaking" | "broken" | "missing")[];
    count: number;
    affected: string[];
    note: string | null;
  },
  now: Date,
) {
  const { m, referralIds } = await manifestOf(tx, a, i.manifestId);
  if (m.state !== "handed_over")
    throw new EmrWriteError("conflict", "Only a manifest that has left can be received.");
  const outcome = receiptOutcome({
    condition: i.condition,
    sent: referralIds.length,
    received: i.count,
  });
  await tx
    .update(labManifests)
    .set({
      state: outcome,
      received: {
        how: i.how,
        by: i.receivedBy,
        at: i.receivedAt.toISOString(),
        condition: i.condition,
        count: i.count,
        note: i.note,
      },
    })
    .where(eq(labManifests.id, m.id));
  const doc =
    i.how === "signed_copy" ? "signed_manifest" : i.how === "phone" ? "phone_call" : "other";
  for (const r of referralIds)
    await appendEvent(
      tx,
      a,
      r,
      {
        kind: i.affected.includes(r) ? "note" : "received_by_lab",
        eventAt: i.receivedAt,
        source: "person",
        document: doc,
        note: i.affected.includes(r)
          ? `Arrived ${i.condition.filter((c) => c !== "intact").join(", ")}`
          : null,
      },
      now,
    );
  if (outcome === "discrepancy")
    await openAutomaticNc(
      tx,
      a.hospitalId,
      {
        source: "manifest",
        sourceRef: m.number,
        deviceId: null,
        title: `Manifest ${m.number} arrived with a discrepancy`,
        whatHappened: `${i.condition.join(", ")}; ${i.count} of ${referralIds.length} received.`,
      },
      now,
    );
  return m.id;
}

/* ─── Updates, cancel, lost, outbreak (RF-7..RF-10) ─────────────────── */

export async function recordReferralEvent(
  tx: EmrTx,
  a: Actor,
  i: {
    referralId: string;
    kind: ReferralEventKind;
    eventAt: Date;
    document: NonNullable<NewEvent["document"]>;
    reasonCode: string | null;
    note: string | null;
  },
  now: Date,
): Promise<{ applied: boolean }> {
  if (
    i.kind === "lost" ||
    i.kind === "created" ||
    i.kind === "result_filed" ||
    i.kind === "packed" ||
    i.kind === "handed_over"
  )
    throw invalid("That update has its own action.");
  if (i.kind === "rejected" && !i.reasonCode)
    throw invalid("Say why the reference lab rejected it.");
  const applied = await appendEvent(
    tx,
    a,
    i.referralId,
    {
      kind: i.kind,
      eventAt: i.eventAt,
      source: "person",
      document: i.document,
      reasonCode: i.reasonCode,
      note: i.note,
    },
    now,
  );
  return { applied };
}

/** RF-8: the doctor's cancel reaches the referral; after handover it is a request the destination decides on. */
export async function requestCancel(
  tx: EmrTx,
  a: Actor,
  i: { referralId: string; note: string },
  now: Date,
) {
  const [r] = await tx
    .select({ state: labReferrals.state })
    .from(labReferrals)
    .where(and(eq(labReferrals.id, i.referralId), eq(labReferrals.hospitalId, a.hospitalId)));
  if (!r) throw new EmrWriteError("not_found", "That referral was not found.");
  const effect = cancelEffect(r.state as ReferralState);
  if (effect === "too_late")
    throw new EmrWriteError("conflict", "This referral has already finished.");
  await appendEvent(
    tx,
    a,
    i.referralId,
    {
      kind: effect === "cancel_now" ? "cancelled" : "cancel_requested",
      eventAt: now,
      source: "person",
      note: i.note,
    },
    now,
  );
}

/** RF-10: lost needs the last known event and the call made; a nonconformity opens. */
export async function markLost(
  tx: EmrTx,
  a: Actor & { canRefer: boolean },
  i: { referralId: string; callNote: string },
  now: Date,
) {
  const [r] = await tx
    .select({ state: labReferrals.state, number: labReferrals.number })
    .from(labReferrals)
    .where(and(eq(labReferrals.id, i.referralId), eq(labReferrals.hospitalId, a.hospitalId)));
  if (!r) throw new EmrWriteError("not_found", "That referral was not found.");
  const [last] = await tx
    .select({ id: labReferralEvents.id })
    .from(labReferralEvents)
    .where(and(eq(labReferralEvents.referralId, i.referralId), eq(labReferralEvents.applied, true)))
    .limit(1);
  const errors = markLostErrors({
    state: r.state as ReferralState,
    lastKnownEvent: !!last,
    callNote: i.callNote,
    hasPermission: a.canRefer,
  });
  if (errors.length)
    throw invalid(
      errors.includes("not_in_transit")
        ? "Only a specimen that has left can be lost."
        : "Record the call you made first.",
    );
  await appendEvent(
    tx,
    a,
    i.referralId,
    { kind: "lost", eventAt: now, source: "person", document: "phone_call", note: i.callNote },
    now,
  );
  await openAutomaticNc(
    tx,
    a.hospitalId,
    {
      source: "referral",
      sourceRef: r.number,
      deviceId: null,
      title: `Referred specimen ${r.number} lost`,
      whatHappened: i.callNote,
    },
    now,
  );
}

/** RF-7, Law 10: a high-risk specimen's outbreak referral; who was informed is required; no manifest. */
export async function recordOutbreakReferral(
  tx: EmrTx,
  a: Actor,
  i: {
    specimenId: string;
    partnerId: string;
    informed: { ipcLead: string; surveillanceFocal: string };
    handedAt: Date;
    note: string | null;
    clientKey: string;
  },
  now: Date,
): Promise<string> {
  const [replay] = await tx
    .select({ id: labReferrals.id })
    .from(labReferrals)
    .where(and(eq(labReferrals.hospitalId, a.hospitalId), eq(labReferrals.clientKey, i.clientKey)));
  if (replay) return replay.id;
  const s = await specimenCtx(tx, a, i.specimenId);
  const partner = await partnerOf(tx, a, i.partnerId);
  const errors = outbreakReferralErrors({ partnerKind: partner.kind, informed: i.informed });
  if (errors.length)
    throw invalid(
      errors[0] === "partner_not_outbreak"
        ? "Choose the outbreak destination."
        : "Record who was informed: the IPC lead and the district surveillance focal person.",
    );
  const [ref] = await tx
    .insert(labReferrals)
    .values({
      hospitalId: a.hospitalId,
      number: await nextNumber(tx, a, "RF", now),
      specimenId: s.id,
      patientUserId: s.patientUserId,
      orderIds: [s.orderId],
      partnerId: partner.id,
      routine: false,
      informed: { ...i.informed, at: now.toISOString(), by: a.userId },
      clientKey: i.clientKey,
      createdBy: a.userId,
      createdAt: now,
      state: "draft",
      stateAt: now,
    })
    .returning({ id: labReferrals.id });
  await appendEvent(tx, a, ref!.id, { kind: "created", eventAt: now, source: "person" }, now);
  await appendEvent(
    tx,
    a,
    ref!.id,
    { kind: "packed", eventAt: i.handedAt, source: "person", note: "Packed by the outbreak team" },
    now,
  );
  await appendEvent(
    tx,
    a,
    ref!.id,
    {
      kind: "handed_over",
      eventAt: i.handedAt,
      source: "person",
      document: "in_person",
      note: i.note ?? "Handed to the outbreak team",
    },
    now,
  );
  // Lab Phase 5 (IC-2, S18): the outbreak referral reaches infection prevention at once, before any result.
  if (ipcLabFeedLiveFor(a.hospitalId)) {
    const { raiseForOutbreakReferral } = await import("@/lib/ipc/store");
    const [enc] = await tx
      .select({ e: encounterOrders.encounterId })
      .from(encounterOrders)
      .where(eq(encounterOrders.id, s.orderId));
    await raiseForOutbreakReferral(tx, {
      hospitalId: a.hospitalId,
      patientUserId: s.patientUserId,
      referralId: ref!.id,
      encounterId: enc?.e ?? null,
      at: now,
    });
  }
  return ref!.id;
}

/** RF-2: an aliquot — a child tube of the same order with its own lab number, received by the lab. */
export async function createAliquot(
  tx: EmrTx,
  a: Actor,
  i: { specimenId: string },
  now: Date,
): Promise<string> {
  const [p] = await tx
    .select()
    .from(specimens)
    .where(and(eq(specimens.id, i.specimenId), eq(specimens.hospitalId, a.hospitalId)));
  if (!p) throw new EmrWriteError("not_found", "That specimen was not found.");
  const { id: _id, recordedAt: _r, clientKey: _k, labelNo: _l, parentSpecimenId: _p, ...rest } = p;
  const [child] = await tx
    .insert(specimens)
    .values({
      ...rest,
      parentSpecimenId: p.id,
      labelNo: sql`'L' || lpad(nextval('public.lab_label_seq')::text, 8, '0')`,
      recordedAt: now,
    })
    .returning({ id: specimens.id });
  await tx.insert(specimenEvents).values({
    specimenId: child!.id,
    hospitalId: a.hospitalId,
    patientUserId: p.patientUserId,
    kind: "received",
    actorUserId: a.userId,
    actorCadre: a.cadreCode ?? "LAB_TECH",
    recordedAt: now,
    receivedVia: "click",
    receiveReason: "Aliquot for a second destination",
  });
  return child!.id;
}

/** The referrals on these orders, for the doctor's order line (RF-11). */
export async function referralsForOrders(tx: EmrTx, hospitalId: string, orderIds: string[]) {
  if (!orderIds.length) return [];
  return tx
    .select()
    .from(labReferrals)
    .where(
      and(eq(labReferrals.hospitalId, hospitalId), arrayOverlaps(labReferrals.orderIds, orderIds)),
    );
}
