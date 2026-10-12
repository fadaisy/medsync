import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { PinnedCriticals } from "../_components/critical-alerts";
import { PageHeader } from "../_components/page-header";
import { myCriticals } from "../_lib/criticals";

export const metadata: Metadata = { title: "Critical results · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Critical results (Lab Phase 1 §5.4): the header count lands here. Every open alert sent to me,
 * phone acknowledgements naming me today, and what I acknowledged today, on any hospital setting.
 */
export default async function DoctorCriticalsPage() {
  const scope = await requireDoctorScope();
  const c = await myCriticals(scope.userId, scope.hospitalId);
  if (!c) notFound();
  const n = c.alerts.open.length;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader
        place={[scope.hospitalName, scope.departmentName].filter(Boolean).join(" · ")}
        placeInTopBar
        title="Critical results"
        subline={
          n === 0
            ? "No critical result is waiting for you."
            : `${n} waiting for your acknowledgement.`
        }
      />
      <PinnedCriticals alerts={c.alerts} ids={c.ids} now={c.now} time={c.time} />
    </div>
  );
}
