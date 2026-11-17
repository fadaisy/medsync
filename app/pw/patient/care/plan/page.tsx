import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/tide/shell";
import { CARE_V2_COPY } from "@/content/patient-app/care";
import { careModeOn } from "@/lib/patient-web/flags";
import { requirePatientScope } from "@/lib/patient/scope";
import { loadToday } from "../_v2/data";
import { PlanClient } from "../_v2/today";

export const metadata: Metadata = { title: "Your plan" };

/** The Plan page, Care mode v2 (Step 9): the day as a vertical timeline with ticks, and the week. */
export default async function PlanPage() {
  if (!careModeOn()) notFound();
  const scope = await requirePatientScope();
  const t = await loadToday(scope.userId, new Date());
  return (
    <>
      <PageHeader
        title={CARE_V2_COPY.plan.title}
        back={{ href: "/patient/care", label: CARE_V2_COPY.hero.title }}
      />
      {t ? (
        <PlanClient slots={t.slots} week={t.week} planVersionId={t.care.planVersionId} />
      ) : (
        <p>{CARE_V2_COPY.plan.empty}</p>
      )}
    </>
  );
}
