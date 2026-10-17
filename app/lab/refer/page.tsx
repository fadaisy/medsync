import type { SendPartner } from "./_components/send-panel";
import type { PartnerTests } from "@/lib/exchange/partners";
import type { WorklistInput } from "@/lib/lab/worklist";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { encounterOrders, testCatalogue } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { identitiesFor } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { highRiskFor } from "@/lib/lab/collection-store";
import { labOneMenuLiveFor, labReferralLiveFor } from "@/lib/lab/feature";
import { menuToday } from "@/lib/lab/one-menu-read";
import { loadLabWorklist } from "@/lib/lab/read";
import { loadOpenManifests, loadPartners, loadSendSpecimens } from "@/lib/lab/referral-read";
import { PatientNameMrn, RecordList } from "../_components/record-list";
import { SendPanel } from "./_components/send-panel";

export const metadata: Metadata = { title: "To refer · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * To refer (Lab Phase 2 §5.5, OM-7; Lab Phase 4 §5.1): specimens on the worklist whose test the hub marks as
 * referred, or whose analyser is down, today. With `labReferral` on, the send panel records where each goes,
 * on a manifest with no patient names, and an outbreak referral for a high-risk specimen; off, it is Phase 2's
 * list. An order is never cancelled because availability changed or because it was sent.
 */
export default async function ToReferPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labOneMenuLiveFor(scope.hospitalId)
  )
    notFound();
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
    if (!referral) return { rows, codes, extra: null };
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
    return { rows, codes, extra: { encOf, risk, specimens, partners, manifests } };
  });
  const ids = await identitiesFor(
    scope,
    data.rows.map((r) => r.i.patientUserId),
    "lab_to_refer",
  );

  if (!data.extra)
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="To refer" />
        <p className="text-body-s text-muted-foreground max-w-3xl">
          Specimens for tests the Departments and services hub marks as referred, or whose analyser
          is down, today. Sending them out is recorded on paper until the referral flow arrives.
        </p>
        <RecordList<{
          i: WorklistInput;
          d: { words: string | null; referredTo?: string | null } | null;
        }>
          caption="To refer"
          rows={data.rows}
          rowKey={(r) => r.i.orderId}
          empty="Nothing to refer today."
          columns={[
            {
              id: "patient",
              header: "Patient",
              cell: (r) => <PatientNameMrn identity={ids.get(r.i.patientUserId)} />,
            },
            {
              id: "test",
              header: "Test",
              cell: (r) => (
                <span className="inline-flex flex-col">
                  <Link
                    href={`/lab/results/${r.i.orderId}`}
                    prefetch={false}
                    className="underline-offset-4 hover:underline"
                  >
                    {r.i.test}
                  </Link>
                  {restricted.has(r.i.orderId) ? (
                    <span className="text-caption text-muted-foreground">Restricted</span>
                  ) : null}
                </span>
              ),
            },
            { id: "why", header: "Why", cell: (r) => <span>{r.d?.words}</span> },
            {
              id: "to",
              header: "Referred to",
              cell: (r) => <span>{r.d?.referredTo ?? "Not named in the hub"}</span>,
            },
          ]}
        />
      </div>
    );

  const { encOf, risk, specimens, partners, manifests } = data.extra;
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const send: SendPartner[] = partners
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
  const rows = atBench.map(({ i, code, d }) => {
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
    };
  });
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="To refer" />
      {rows.length === 0 && manifests.length === 0 ? (
        <p className="border-border text-body-s text-muted-foreground rounded-lg border border-dashed p-8 text-center">
          Nothing to refer today.
        </p>
      ) : (
        <SendPanel
          rows={rows}
          partners={send}
          manifests={manifests}
          canRefer={
            scope.access.permissions.has("lab.refer") || scope.access.permissions.has("lab.manage")
          }
        />
      )}
    </div>
  );
}
