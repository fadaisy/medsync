import type { Metadata } from "next";
import { weekCounts } from "@patient-core/medicines";

import { PageHeader } from "@/components/tide/shell";
import { CARE_COPY } from "@/content/patient/care";
import { loadCareMedicines, loadGiven } from "@/lib/patient-web/care-medicines";
import { myMedicines } from "@/lib/patient-web/care-view";
import { today } from "@/lib/patient-web/day";
import { requirePatientScope } from "@/lib/patient/scope";
import { RetryButton } from "../../_components/home-bits";
import { MedicinesView } from "./_components/medicines-view";

export const metadata: Metadata = { title: "Medicines" };
export const dynamic = "force-dynamic";

const C = CARE_COPY.meds;

/**
 * Medicines (the phone's care/medicines.tsx): today's ring and timeline, the Now and done cards, the week,
 * My medicines with Pause, Resume and Stop, Add a medicine, and the hospital pharmacy's "What you were
 * given" where it is live. Names, times of day and "As your clinician prescribed" only (L5, S15).
 */
export default async function MedicinesPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const [scope, { add }] = await Promise.all([requirePatientScope(), searchParams]);
  const now = new Date();
  const [data, given] = await Promise.all([
    loadCareMedicines(scope.userId).catch(() => null),
    loadGiven(scope.userId).catch(() => null),
  ]);
  const back = { href: "/patient/care", label: CARE_COPY.backToCare };
  if (!data)
    return (
      <>
        <PageHeader title={C.title} area="medicines" back={back} />
        <div className="flex flex-col items-start gap-3">
          <p className="text-pw-ink-2 text-[17px]">{C.failed}</p>
          <RetryButton />
        </div>
      </>
    );
  const day = today(data.meds, data.takes, now);
  const week = weekCounts(data.meds, data.takes, now);
  return (
    <>
      <PageHeader title={C.title} area="medicines" back={back} />
      <MedicinesView
        nowIso={now.toISOString()}
        day={day}
        week={week.taken}
        weekTotals={week.totals}
        mine={myMedicines(data.meds, new Set(given?.covered ?? []))}
        given={given}
        adding={add === "1"}
      />
    </>
  );
}
