import type { WorklistInput } from "@/lib/lab/worklist";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { testCatalogue } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { identitiesFor } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labOneMenuLiveFor } from "@/lib/lab/feature";
import { menuToday } from "@/lib/lab/one-menu-read";
import { loadLabWorklist } from "@/lib/lab/read";
import { PatientNameMrn, RecordList } from "../_components/record-list";

export const metadata: Metadata = { title: "To refer · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * To refer (Lab Phase 2 §5.5, OM-7): specimens on the worklist whose test the hub marks as referred, or
 * whose analyser is down, today. A list only: sending out and results back are Phase 4. An order is never
 * cancelled because availability changed after it was placed.
 */
export default async function ToReferPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labOneMenuLiveFor(scope.hospitalId)
  )
    notFound();
  const { inputs, restricted } = await loadLabWorklist(scope.hospitalId);
  const testIds = [...new Set(inputs.map((i) => i.testId).filter((t): t is string => !!t))];
  const [codes, today] = await db.transaction(
    async (tx) =>
      [
        new Map(
          (testIds.length
            ? await tx
                .select({ id: testCatalogue.id, code: testCatalogue.code })
                .from(testCatalogue)
                .where(inArray(testCatalogue.id, testIds))
            : []
          ).map((t) => [t.id, t.code]),
        ),
        await menuToday(tx, scope.hospitalId),
      ] as const,
  );
  const rows = inputs
    .map((i) => ({ i, d: i.testId && codes.get(i.testId) ? today(codes.get(i.testId)!) : null }))
    .filter((r) => r.d && (r.d.state === "referred" || r.d.state === "down_referred"));
  const ids = await identitiesFor(
    scope,
    rows.map((r) => r.i.patientUserId),
    "lab_to_refer",
  );
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="To refer" />
      <p className="text-body-s text-muted-foreground max-w-3xl">
        Specimens for tests the Departments and services hub marks as referred, or whose analyser is
        down, today. Sending them out is recorded on paper until the referral flow arrives.
      </p>
      <RecordList<{ i: WorklistInput; d: ReturnType<typeof today> | null }>
        caption="To refer"
        rows={rows}
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
}
