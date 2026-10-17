import "server-only";

import type { SignedConfig } from "./signed-config";
import type { EmrTx } from "@/lib/emr/db";
import type { PartnerTests } from "@/lib/exchange/partners";
import type { ReferralState } from "@/lib/exchange/types";
import { and, asc, desc, eq, gte, inArray, lt, notInArray, or } from "drizzle-orm";

import { containerWords, specimenWords } from "@/components/emr/orders/model";
import {
  encounterOrders,
  labManifestItems,
  labManifestPrints,
  labManifests,
  labPartners,
  labReferralEvents,
  labReferrals,
  labResultAttachments,
  specimens,
  testCatalogue,
  users,
} from "@/db/schema";
import { reviewState } from "@/lib/exchange/partners";
import { loadConfigs } from "./catalogue-v2";
import { expectedBy, overdue } from "./referral";
import { inForce } from "./signed-config";

/**
 * What the referral screens read (Lab Phase 4 §5.1–5.5, §5.10). Hospital-scoped by every query; the pages gate
 * the viewer first. Nothing here writes. Overdue is computed at read time, never stored (RF-5).
 */

type Kind = "partner_tests" | "partner_packing" | "partner_legal" | "partner_fields";
export type ConfigState = {
  state: "signed" | "draft" | "missing";
  draftId: string | null;
  signedId: string | null;
  payload: unknown;
};

const stateOf = (
  configs: readonly SignedConfig[],
  kind: Kind | "referral_wording" | "referral_ops" | "results_consent_notice",
  key: string,
  now: Date,
): ConfigState => {
  const signed = inForce(configs, kind, key, now);
  const draft = configs
    .filter((c) => c.kind === kind && c.key === key && c.status === "draft")
    .sort((a, b) => b.version - a.version)[0];
  return {
    state: signed ? "signed" : draft ? "draft" : "missing",
    draftId: draft?.id ?? null,
    signedId: signed?.id ?? null,
    payload: draft?.payload ?? signed?.payload ?? null,
  };
};

export interface PartnerRow {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  contacts: { role: string; name: string; phone?: string | null; email?: string | null }[];
  transport: { code: string; words: string }[];
  resultsReturn: { channel: string; words: string }[];
  tests: ConfigState;
  packing: Record<string, ConfigState>;
  legal: ConfigState;
  fields: ConfigState;
  review: "ok" | "review_passed" | "pdpo_expired" | null;
  leavesUganda: boolean;
}

/** §5.10: the register with each partner's signed configuration and its review state. */
export async function loadPartners(
  tx: EmrTx,
  hospitalId: string,
  now = new Date(),
): Promise<PartnerRow[]> {
  const [rows, configs] = await Promise.all([
    tx
      .select()
      .from(labPartners)
      .where(eq(labPartners.hospitalId, hospitalId))
      .orderBy(asc(labPartners.name)),
    loadConfigs(tx, hospitalId),
  ]);
  const today = now.toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  return rows.map((p) => {
    const tests = stateOf(configs, "partner_tests", p.id, now);
    const legal = stateOf(configs, "partner_legal", p.id, now);
    const categories = new Set(
      ((tests.payload as PartnerTests | null)?.tests ?? []).map((t) => t.category),
    );
    const signedLegal = legal.signedId
      ? (inForce(configs, "partner_legal", p.id, now)?.payload ?? null)
      : null;
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      active: p.active,
      contacts: p.contacts as PartnerRow["contacts"],
      transport: p.transport as PartnerRow["transport"],
      resultsReturn: p.resultsReturn as PartnerRow["resultsReturn"],
      tests,
      packing: Object.fromEntries(
        [...categories].map((c) => [c, stateOf(configs, "partner_packing", `${p.id}:${c}`, now)]),
      ),
      legal,
      fields: stateOf(configs, "partner_fields", p.id, now),
      review: signedLegal ? reviewState(signedLegal, today) : null,
      leavesUganda: p.kind === "abroad" || !!signedLegal?.crossBorder,
    };
  });
}

/** The hospital-wide referral wording and settings (IPC lead, lab lead). */
export async function loadReferralSettings(tx: EmrTx, hospitalId: string, now = new Date()) {
  const configs = await loadConfigs(tx, hospitalId);
  return {
    wording: stateOf(configs, "referral_wording", "high_risk", now),
    ops: stateOf(configs, "referral_ops", "settings", now),
    // Lab Phase 5 (PR-12): the data protection lead's results consent wording, on the same desk.
    consent: stateOf(configs, "results_consent_notice", "hospital", now),
  };
}

export interface SendSpecimen {
  specimenId: string;
  labNumber: string | null;
  specimenType: string | null;
  container: string | null;
  collectedAt: Date;
  /** Referrals already on this tube (RF-2). */
  referredTo: { partnerId: string; state: string }[];
}

/** §5.1: the tubes behind To refer's rows, and where each already goes. */
export async function loadSendSpecimens(
  tx: EmrTx,
  hospitalId: string,
  specimenIds: string[],
): Promise<Map<string, SendSpecimen>> {
  if (!specimenIds.length) return new Map();
  const [rows, refs] = await Promise.all([
    tx
      .select({
        id: specimens.id,
        labNumber: specimens.labelNo,
        type: specimens.specimenType,
        container: specimens.container,
        collectedAt: specimens.collectedAt,
      })
      .from(specimens)
      .where(and(eq(specimens.hospitalId, hospitalId), inArray(specimens.id, specimenIds))),
    tx
      .select({
        specimenId: labReferrals.specimenId,
        partnerId: labReferrals.partnerId,
        state: labReferrals.state,
      })
      .from(labReferrals)
      .where(
        and(eq(labReferrals.hospitalId, hospitalId), inArray(labReferrals.specimenId, specimenIds)),
      ),
  ]);
  return new Map(
    rows.map((s) => [
      s.id,
      {
        specimenId: s.id,
        labNumber: s.labNumber,
        specimenType: specimenWords(s.type),
        container: containerWords(s.container),
        collectedAt: s.collectedAt,
        referredTo: refs.filter((r) => r.specimenId === s.id && r.state !== "cancelled"),
      },
    ]),
  );
}

export interface ReferralRow {
  id: string;
  number: string;
  patientUserId: string;
  orderId: string;
  test: string;
  restricted: boolean;
  partnerId: string;
  partner: string;
  routine: boolean;
  state: ReferralState;
  cancelRequested: boolean;
  sentAt: Date | null;
  completedAt: Date | null;
  expected: Date | null;
  overdueDays: number | null;
  /** The reference lab's reason, when it rejected the specimen (RF-9). */
  reasonCode: string | null;
  createdAt: Date;
}

/** §5.3: referrals created in the period (or still open), with expected and overdue computed now (RF-5). */
export async function loadReferrals(
  tx: EmrTx,
  hospitalId: string,
  o: {
    from: Date;
    to: Date;
    partnerId?: string | null;
    patientUserIds?: string[];
    referralIds?: string[];
    now?: Date;
  },
): Promise<ReferralRow[]> {
  const now = o.now ?? new Date();
  const rows = await tx
    .select({
      r: labReferrals,
      partner: labPartners.name,
      test: testCatalogue.display,
      testCode: testCatalogue.code,
      sensitivity: encounterOrders.sensitivity,
    })
    .from(labReferrals)
    .innerJoin(labPartners, eq(labPartners.id, labReferrals.partnerId))
    .innerJoin(specimens, eq(specimens.id, labReferrals.specimenId))
    .innerJoin(encounterOrders, eq(encounterOrders.id, specimens.orderId))
    .leftJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
    .where(
      and(
        eq(labReferrals.hospitalId, hospitalId),
        // The period's referrals, and every one still open whenever it was made (§5.3 "Waiting").
        or(
          and(gte(labReferrals.createdAt, o.from), lt(labReferrals.createdAt, o.to)),
          notInArray(labReferrals.state, ["completed", "failed", "lost", "cancelled", "rejected"]),
        ),
        o.partnerId ? eq(labReferrals.partnerId, o.partnerId) : undefined,
        o.patientUserIds
          ? inArray(
              labReferrals.patientUserId,
              o.patientUserIds.length ? o.patientUserIds : ["00000000-0000-0000-0000-000000000000"],
            )
          : undefined,
        o.referralIds
          ? inArray(
              labReferrals.id,
              o.referralIds.length ? o.referralIds : ["00000000-0000-0000-0000-000000000000"],
            )
          : undefined,
      ),
    )
    .orderBy(desc(labReferrals.createdAt));
  const configs = await loadConfigs(tx, hospitalId);
  const byId = new Map(configs.map((c) => [c.id, c]));
  const rejected = rows.filter(({ r }) => r.state === "rejected").map(({ r }) => r.id);
  const reasons = new Map(
    rejected.length
      ? (
          await tx
            .select({ id: labReferralEvents.referralId, code: labReferralEvents.reasonCode })
            .from(labReferralEvents)
            .where(
              and(
                inArray(labReferralEvents.referralId, rejected),
                eq(labReferralEvents.kind, "rejected"),
              ),
            )
        ).map((e) => [e.id, e.code] as const)
      : [],
  );
  return rows.map(({ r, partner, test, testCode, sensitivity }) => {
    const tests = (
      r.partnerTestsConfigId ? byId.get(r.partnerTestsConfigId)?.payload : null
    ) as PartnerTests | null;
    const t = tests?.tests.find((x) => x.testCode === testCode);
    const expected = r.sentAt
      ? expectedBy(r.sentAt, t?.turnaround ?? null, { holidays: tests?.holidays ?? [] })
      : null;
    const late = overdue(now, expected, r.state as ReferralState);
    return {
      id: r.id,
      number: r.number,
      patientUserId: r.patientUserId,
      orderId: r.orderIds[0]!,
      test: test ?? "Test",
      restricted: sensitivity === "restricted",
      partnerId: r.partnerId,
      partner,
      routine: r.routine,
      state: r.state as ReferralState,
      cancelRequested: r.cancelRequested,
      sentAt: r.sentAt,
      completedAt: r.completedAt,
      expected,
      overdueDays: late.overdue ? late.days : null,
      reasonCode: reasons.get(r.id) ?? null,
      createdAt: r.createdAt,
    };
  });
}

/** §5.3 side panel: the referral's events, each with who said so and from what. */
export async function loadReferralEvents(tx: EmrTx, hospitalId: string, referralId: string) {
  return tx
    .select({
      id: labReferralEvents.id,
      kind: labReferralEvents.kind,
      eventAt: labReferralEvents.eventAt,
      source: labReferralEvents.source,
      document: labReferralEvents.document,
      reasonCode: labReferralEvents.reasonCode,
      note: labReferralEvents.note,
      applied: labReferralEvents.applied,
      messageId: labReferralEvents.messageId,
      who: users.fullName,
    })
    .from(labReferralEvents)
    .leftJoin(users, eq(users.id, labReferralEvents.actorUserId))
    .where(
      and(
        eq(labReferralEvents.hospitalId, hospitalId),
        eq(labReferralEvents.referralId, referralId),
      ),
    )
    .orderBy(desc(labReferralEvents.eventAt), desc(labReferralEvents.seq));
}

/** §5.2: the manifest, its rows (no patient fields at all, MF-1) and whether a print exists. */
export async function loadManifest(tx: EmrTx, hospitalId: string, manifestId: string) {
  const [m] = await tx
    .select({ m: labManifests, partner: labPartners.name })
    .from(labManifests)
    .innerJoin(labPartners, eq(labPartners.id, labManifests.partnerId))
    .where(and(eq(labManifests.id, manifestId), eq(labManifests.hospitalId, hospitalId)));
  if (!m) return null;
  const items = await tx
    .select({
      position: labManifestItems.position,
      referralId: labReferrals.id,
      externalIds: labReferrals.externalIds,
      partnerTestsConfigId: labReferrals.partnerTestsConfigId,
      labNumber: specimens.labelNo,
      type: specimens.specimenType,
      collectedAt: specimens.collectedAt,
      test: testCatalogue.display,
      testCode: testCatalogue.code,
      sensitivity: encounterOrders.sensitivity,
    })
    .from(labManifestItems)
    .innerJoin(labReferrals, eq(labReferrals.id, labManifestItems.referralId))
    .innerJoin(specimens, eq(specimens.id, labReferrals.specimenId))
    .innerJoin(encounterOrders, eq(encounterOrders.id, specimens.orderId))
    .leftJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
    .where(eq(labManifestItems.manifestId, manifestId))
    .orderBy(asc(labManifestItems.position));
  const configs = await loadConfigs(tx, hospitalId);
  const byId = new Map(configs.map((c) => [c.id, c]));
  const [prints] = await tx
    .select({ id: labManifestPrints.id })
    .from(labManifestPrints)
    .where(eq(labManifestPrints.manifestId, manifestId))
    .limit(1);
  return {
    manifest: m.m,
    partner: m.partner,
    printed: !!prints,
    items: items.map((i) => {
      const tests = (
        i.partnerTestsConfigId ? byId.get(i.partnerTestsConfigId)?.payload : null
      ) as PartnerTests | null;
      return {
        referralId: i.referralId,
        labNumber: i.labNumber ?? "—",
        theirIds: Object.values((i.externalIds ?? {}) as Record<string, string>),
        specimenWords: specimenWords(i.type) ?? "Specimen",
        containers: 1,
        testWords: i.test ?? "Test",
        partnerCode: tests?.tests.find((t) => t.testCode === i.testCode)?.theirCode ?? null,
        restricted: i.sensitivity === "restricted",
        collectedAt: i.collectedAt,
      };
    }),
  };
}

/** The open manifests to seal, print and hand over (§5.1–5.2). */
export async function loadOpenManifests(tx: EmrTx, hospitalId: string) {
  return tx
    .select({
      id: labManifests.id,
      number: labManifests.number,
      state: labManifests.state,
      transport: labManifests.transport,
      partner: labPartners.name,
      createdAt: labManifests.createdAt,
    })
    .from(labManifests)
    .innerJoin(labPartners, eq(labPartners.id, labManifests.partnerId))
    .where(
      and(
        eq(labManifests.hospitalId, hospitalId),
        inArray(labManifests.state, ["open", "sealed", "handed_over"]),
      ),
    )
    .orderBy(desc(labManifests.createdAt));
}

/** Whether the referral has a scan of the paper report yet (RB-6). */
export async function scansFor(tx: EmrTx, hospitalId: string, referralId: string) {
  return tx
    .select({
      id: labResultAttachments.id,
      theirReport: labResultAttachments.theirReport,
      uploadedAt: labResultAttachments.uploadedAt,
      path: labResultAttachments.path,
    })
    .from(labResultAttachments)
    .where(
      and(
        eq(labResultAttachments.hospitalId, hospitalId),
        eq(labResultAttachments.referralId, referralId),
      ),
    )
    .orderBy(desc(labResultAttachments.uploadedAt));
}

/**
 * RF-11, §5.5: the doctor's order line for each referred order (Appendix A wording), and whether it warns
 * (overdue, rejected, lost: amber with a word). Read through the clinician's own RLS (their patients).
 */
export async function referralLinesForOrders(
  tx: EmrTx,
  hospitalId: string,
  orderIds: string[],
  now = new Date(),
): Promise<Map<string, { text: string; caution: boolean }>> {
  if (!orderIds.length) return new Map();
  const { arrayOverlaps } = await import("drizzle-orm");
  const rows = await tx
    .select({ r: labReferrals, partner: labPartners.name, testCode: testCatalogue.code })
    .from(labReferrals)
    .innerJoin(labPartners, eq(labPartners.id, labReferrals.partnerId))
    .innerJoin(specimens, eq(specimens.id, labReferrals.specimenId))
    .innerJoin(encounterOrders, eq(encounterOrders.id, specimens.orderId))
    .leftJoin(testCatalogue, eq(testCatalogue.id, encounterOrders.testId))
    .where(
      and(eq(labReferrals.hospitalId, hospitalId), arrayOverlaps(labReferrals.orderIds, orderIds)),
    )
    .orderBy(desc(labReferrals.createdAt));
  if (!rows.length) return new Map();
  const configs = await loadConfigs(tx, hospitalId);
  const byId = new Map(configs.map((c) => [c.id, c]));
  const { orderLineWords } = await import("./referral-words");
  const out = new Map<string, { text: string; caution: boolean }>();
  for (const { r, partner, testCode } of rows) {
    if (r.state === "cancelled" || r.state === "completed") continue;
    const tests = (
      r.partnerTestsConfigId ? byId.get(r.partnerTestsConfigId)?.payload : null
    ) as PartnerTests | null;
    const t = tests?.tests.find((x) => x.testCode === testCode);
    const expected = r.sentAt
      ? expectedBy(r.sentAt, t?.turnaround ?? null, { holidays: tests?.holidays ?? [] })
      : null;
    const late = overdue(now, expected, r.state as ReferralState);
    const [rejectedEvent] =
      r.state === "rejected"
        ? await tx
            .select({ reasonCode: labReferralEvents.reasonCode })
            .from(labReferralEvents)
            .where(
              and(eq(labReferralEvents.referralId, r.id), eq(labReferralEvents.kind, "rejected")),
            )
            .limit(1)
        : [];
    const text = orderLineWords({
      destination: partner,
      sentAt: r.sentAt,
      expected,
      overdueSince: late.overdue ? late.since : null,
      state: r.state as ReferralState,
      reasonCode: rejectedEvent?.reasonCode ?? null,
    });
    for (const o of r.orderIds)
      if (orderIds.includes(o) && !out.has(o))
        out.set(o, { text, caution: late.overdue || r.state === "rejected" || r.state === "lost" });
  }
  return out;
}

/**
 * §5.5 "Sent out, waiting": open referrals of the patients this clinician may open. The ids come through the
 * clinician's own RLS (lab_referrals: their patients); names and turnaround are then read for those ids only.
 */
export async function loadSentOutForClinician(
  scope: { userId: string; hospitalId: string },
  now = new Date(),
) {
  const { asClinicalReader } = await import("@/lib/emr/db");
  const { db } = await import("@/db");
  const ids = await asClinicalReader(scope, async (tx) =>
    (
      await tx
        .select({ id: labReferrals.id })
        .from(labReferrals)
        .where(
          notInArray(labReferrals.state, ["completed", "failed", "lost", "cancelled", "rejected"]),
        )
    ).map((r) => r.id),
  );
  if (!ids.length) return [];
  return db.transaction((tx) =>
    loadReferrals(tx as unknown as EmrTx, scope.hospitalId, {
      from: new Date(0),
      to: now,
      referralIds: ids,
      now,
    }),
  );
}
