import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/medsync/page-header";
import { EmptyState } from "@/components/tide/work/kit";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { encounterOrders, encounterResults } from "@/db/schema/encounter";
import { encounters } from "@/db/schema/scheduling";
import { identitiesFor } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { legacyWritesOpen } from "@/lib/lab/cutover-store";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { PatientNameMrn } from "../../_components/record-list";

/**
 * Older results (Lab Phase 1 CO-4): after the switch to one result path, the old list, read-only.
 * Nothing here writes; every old write action refuses for this hospital.
 */
const STATE: Record<string, string> = {
  entered: "Entered",
  released: "Released",
  rejected: "Rejected",
};

export async function OlderView({ v2 = false }: { v2?: boolean }) {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || (await legacyWritesOpen(scope.hospitalId))) notFound();
  const rows = await db
    .select({
      id: encounterResults.id,
      patientUserId: encounterOrders.patientUserId,
      test: encounterOrders.text,
      value: encounterResults.value,
      unit: encounterResults.unit,
      status: encounterResults.qualityStatus,
      releasedAt: encounterResults.releasedAt,
      resultedAt: encounterResults.resultedAt,
    })
    .from(encounterResults)
    .innerJoin(encounterOrders, eq(encounterOrders.id, encounterResults.orderId))
    // Legacy orders may carry no hospital_id: the encounter places them, as on the old list.
    .innerJoin(encounters, eq(encounters.id, encounterOrders.encounterId))
    .where(
      and(eq(encounters.hospitalId, scope.hospitalId), eq(encounterOrders.lifecycle, "legacy")),
    )
    .orderBy(desc(encounterResults.resultedAt))
    .limit(200);
  const ids = await identitiesFor(
    scope,
    rows.map((r) => r.patientUserId),
    "lab_older_results",
  );
  const fmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  return (
    <div
      className={
        v2
          ? "flex flex-col gap-4"
          : "mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6"
      }
    >
      {v2 ? null : (
        <PageHeader
          place={`${scope.hospitalName} · ${LAB.place}`}
          placeInTopBar
          title="Older results"
          subline="The old list, read-only since this hospital moved to one result path."
        />
      )}
      {rows.length === 0 ? (
        <EmptyState title="No older results." />
      ) : (
        <table className="border-border bg-card w-full border-collapse rounded-lg border text-left">
          <caption className="sr-only">Older results</caption>
          <thead>
            <tr className="bg-muted text-ink-600 text-caption">
              {["Patient", "Test", "Result", "State", "When"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-border h-[34px] border-b px-3 font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-ink-150 text-body-s border-b last:border-b-0">
                <td className="px-3 py-2">
                  <PatientNameMrn identity={ids.get(r.patientUserId)} />
                </td>
                <td className="px-3 py-2">{r.test}</td>
                <td className="px-3 py-2 tabular-nums">
                  {r.value}
                  {r.unit ? ` ${r.unit}` : ""}{" "}
                  <span className="text-caption text-muted-foreground font-sans">as typed</span>
                </td>
                <td className="px-3 py-2">{STATE[r.status ?? ""] ?? "Entered"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {fmt.format(r.releasedAt ?? r.resultedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
