import type { Metadata } from "next";
import { weekCounts } from "@patient-core/medicines";

import { Card, SectionHead } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { PATIENT_PRICES } from "@/content/patient-prices";
import { CARE_COPY } from "@/content/patient/care";
import { loadMedicineCosts } from "@/lib/patient-web/care-medicine-costs";
import { loadCareMedicines, loadGiven } from "@/lib/patient-web/care-medicines";
import { myMedicines } from "@/lib/patient-web/care-view";
import { today } from "@/lib/patient-web/day";
import { requirePatientScope } from "@/lib/patient/scope";
import { ChargeWords, CostTotal } from "../../_components/cost-bits";
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
  // ADR 0527: what the given medicines cost, only for medicines this page already lists. A failed read shows none.
  const costs = given
    ? await loadMedicineCosts(
        scope.userId,
        given.groups.flatMap((g) =>
          g.medicines.map((m) => ({ lineId: m.lineId, name: m.medicine })),
        ),
      ).catch(() => null)
    : null;
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
      {costs ? (
        <section
          aria-labelledby="meds-cost"
          className="mt-5 flex w-full max-w-[720px] flex-col gap-3"
        >
          <SectionHead id="meds-cost" title={PATIENT_PRICES.medicines.cap} />
          <Card className="p-0">
            <ul>
              {costs.lines.map((l) => (
                <li
                  key={l.key}
                  className="border-pw-surface-3 flex items-baseline justify-between gap-3 border-t px-4 py-3 first:border-t-0"
                >
                  <span className="text-[17px] font-semibold">{l.name}</span>
                  <ChargeWords charge={l.charge} />
                </li>
              ))}
            </ul>
            <CostTotal
              costs={costs}
              total={PATIENT_PRICES.medicines.total}
              partial={PATIENT_PRICES.medicines.partial}
            />
          </Card>
        </section>
      ) : null}
    </>
  );
}
