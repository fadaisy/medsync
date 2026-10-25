import type { Metadata } from "next";
import { readingsFrom } from "@patient-core/log";

import { PageHeader } from "@/components/tide/shell";
import { CARE_COPY } from "@/content/patient/care";
import { loadProducts, usdaByIds } from "@/lib/patient-web/care-move";
import { loadLog } from "@/lib/patient-web/day";
import { requirePatientScope } from "@/lib/patient/scope";
import { RetryButton } from "../../_components/home-bits";
import { MoveView } from "./_components/move-view";

export const metadata: Metadata = { title: "Move and eat · MedSync" };
export const dynamic = "force-dynamic";

const C = CARE_COPY.move;

/**
 * Move and eat (the phone's care/activity.tsx): steps synced from the phone, activities timed or logged, the
 * safety card, the plate guide, meals from the Ugandan food list (USDA and Open Food Facts as the phone uses
 * them) and water. The rows go to the page, which reads the days on the patient's own clock as the phone does.
 */
export default async function MovePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [scope, { tab }] = await Promise.all([requirePatientScope(), searchParams]);
  const back = { href: "/patient/care", label: CARE_COPY.backToCare };
  const data = await Promise.all([loadLog(scope.userId, 60), loadProducts(scope.userId)]).catch(
    () => null,
  );
  if (!data)
    return (
      <>
        <PageHeader title={C.title} area="readings" back={back} />
        <div className="flex flex-col items-start gap-3">
          <p className="text-pw-ink-2 text-[17px]">{C.failed}</p>
          <RetryButton />
        </div>
      </>
    );
  const [log, products] = data;
  const weight = readingsFrom(log).find((r) => r.input.kind === "weight")?.input;
  // The last eight days are enough for the week and today; the weight comes from the longer read.
  const since = new Date().getTime() - 8 * 86_400_000;
  const rows = log.filter((r) => new Date(r.recordedAt).getTime() >= since);
  return (
    <>
      <PageHeader title={C.title} area="readings" back={back} />
      <MoveView
        startTab={tab === "eat" ? "eat" : "move"}
        rows={rows}
        weightKg={weight?.kind === "weight" ? weight.value : null}
        products={products}
        usda={usdaByIds(rows.flatMap((r) => (r.kind === "meal" && r.unit ? [r.unit] : [])))}
      />
    </>
  );
}
