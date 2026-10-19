import "server-only";

import type { OpenManifest, ReferRow, SendPartner } from "../_components/send-panel";
import type { PartnerTests } from "@/lib/exchange/partners";
import type { ReferralState } from "@/lib/exchange/types";
import type { LabTechScope } from "@/lib/lab-tech/scope";
import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { encounterOrders, testCatalogue } from "@/db/schema";
import { identitiesFor } from "@/lib/emr/read/results";
import { highRiskFor } from "@/lib/lab/collection-store";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { menuToday } from "@/lib/lab/one-menu-read";
import { loadLabWorklist } from "@/lib/lab/read";
import { loadOpenManifests, loadPartners, loadSendSpecimens } from "@/lib/lab/referral-read";

/**
 * To refer (Lab Phase 2 §5.5, OM-7; Lab Phase 4 §5.1), moved out of the old /lab/refer page so the board and the
 * old page read the same rows: specimens on the worklist whose test the hub marks as referred, or whose analyser
 * is down, today. `send` is null while the referral flow is off (Phase 2's plain list).
 */
export async function loadToRefer(scope: LabTechScope) {
  const referral = labReferralLiveFor(scope.hospitalId);
  const { inputs, restricted } = await loadLabWorklist(scope.hospitalId);
  const testIds = [...new Set(inputs.map((i) => i.testId).filter((t): t is string => !!t))];
  const data = await db.transaction(async (tx) => {
    const codes = new Map(
      (testIds.length
        ? await tx
            .select({ id: testCatalogue.id, code: testCatalogue.code })
            .from(testCatalogue)
            .where(inArray(testCatalogue.id, testIds))
        : []
      ).map((t) => [t.id, t.code]),
    );
    const today = await menuToday(tx, scope.hospitalId);
    const rows = inputs
      .map((i) => ({ i, code: i.testId ? (codes.get(i.testId) ?? null) : null }))
      .map((r) => ({ ...r, d: r.code ? today(r.code) : null }))
      .filter((r) => r.d && (r.d.state === "referred" || r.d.state === "down_referred"));
    if (!referral) return { rows, extra: null };
    const orderIds = rows.map((r) => r.i.orderId);
    const encounters = orderIds.length
      ? await tx
          .select({ id: encounterOrders.id, encounterId: encounterOrders.encounterId })
          .from(encounterOrders)
          .where(inArray(encounterOrders.id, orderIds))
      : [];
    const encOf = new Map(encounters.map((e) => [e.id, e.encounterId]));
    const [risk, specimens, partners, manifests] = await Promise.all([
      highRiskFor(tx, [
        ...new Set(encounters.map((e) => e.encounterId).filter((e): e is string => !!e)),
      ]),
      loadSendSpecimens(
        tx,
        scope.hospitalId,
        rows.map((r) => r.i.specimenId).filter((s): s is string => !!s),
      ),
      loadPartners(tx, scope.hospitalId),
      loadOpenManifests(tx, scope.hospitalId),
    ]);
    return { rows, extra: { encOf, risk, specimens, partners, manifests } };
  });
  const ids = await identitiesFor(
    scope,
    data.rows.map((r) => r.i.patientUserId),
    "lab_to_refer",
  );
  const canRefer =
    scope.access.permissions.has("lab.refer") || scope.access.permissions.has("lab.manage");
  if (!data.extra) return { plain: data.rows, ids, restricted, send: null, canRefer };

  const { encOf, risk, specimens, partners, manifests } = data.extra;
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const sendPartners: SendPartner[] = partners
    .filter((p) => p.active)
    .map((p) => {
      const tests = (p.tests.state === "signed" ? p.tests.payload : null) as PartnerTests | null;
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        transport: p.transport,
        ready: p.legal.state === "signed" && p.fields.state === "signed",
        tests: Object.fromEntries(
          (tests?.tests ?? []).map((t) => [
            t.testCode,
            {
              theirCode: t.theirCode,
              category: t.category,
              requiredIds: t.requiredIds.map((r) => ({ key: r.key, words: r.words })),
            },
          ]),
        ),
        packing: Object.fromEntries(
          Object.entries(p.packing)
            .filter(([, c]) => c.state === "signed")
            .map(([cat, c]) => [
              cat,
              (c.payload as { items: { key: string; words: string }[] }).items,
            ]),
        ),
      };
    });
  // A tube that has left (handed over, or further) is tracked under Referrals, not here; one still on the bench
  // (draft, packed) stays, and so does one whose referral ended without a result (rejected, failed, lost).
  const AWAY = new Set([
    "handed_over",
    "at_hub",
    "received_by_lab",
    "accepted",
    "in_progress",
    "on_hold",
    "completed",
  ]);
  const atBench = data.rows.filter(
    ({ i }) =>
      !(i.specimenId && specimens.get(i.specimenId)?.referredTo.some((r) => AWAY.has(r.state))),
  );
  const rows: (ReferRow & { states: ReferralState[] })[] = atBench.map(({ i, code, d }) => {
    const s = i.specimenId ? specimens.get(i.specimenId) : undefined;
    const id = ids.get(i.patientUserId);
    const enc = encOf.get(i.orderId);
    return {
      orderId: i.orderId,
      specimenId: i.specimenId,
      labNumber: s?.labNumber ?? null,
      specimen: s?.specimenType ?? null,
      patientName: id?.name ?? "Name withheld",
      patientMrn: id?.mrn ?? "",
      test: i.test,
      testCode: code,
      restricted: restricted.has(i.orderId),
      highRisk: !!(enc && risk.get(enc)),
      why: d!.state === "down_referred" ? ("analyser_down" as const) : ("not_done_here" as const),
      whyWords: d!.words ?? "",
      waitingSince: i.receivedAt ?? i.collectedAt,
      referredTo: (s?.referredTo ?? []).map((r) => partnerName.get(r.partnerId) ?? "Another lab"),
      states: (s?.referredTo ?? []).map((r) => r.state as ReferralState),
    };
  });
  const open: OpenManifest[] = manifests;
  return {
    plain: data.rows,
    ids,
    restricted,
    send: { rows, partners: sendPartners, manifests: open },
    canRefer,
  };
}
