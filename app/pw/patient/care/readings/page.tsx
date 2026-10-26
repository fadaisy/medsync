import type { ReadingKind } from "@patient-core/readings";

import { ReadingForm } from "@/components/tide/reading-dialog";
import { PageHeader } from "@/components/tide/shell";
import { READINGS_COPY } from "@/content/patient/readings";
import { patientFlag } from "@/lib/patient-web/flags";
import { recentReadingsAction } from "@/lib/patient-web/reading-actions";

const KINDS: readonly ReadingKind[] = ["bp", "sugar", "pulse", "weight"];

/** Log a reading, full page (/patient/care/readings, `?kind=` preselects). The dialog shares the form. */
export default async function ReadingsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const recent = await recentReadingsAction();
  return (
    <>
      <PageHeader
        title={READINGS_COPY.title}
        area="readings"
        back={{ href: "/patient/care", label: READINGS_COPY.backToCare }}
      />
      <div className="w-full max-w-[720px]">
        <ReadingForm
          initialKind={KINDS.find((k) => k === kind) ?? "bp"}
          recent={recent}
          sayIt={patientFlag("sayIt")}
        />
      </div>
    </>
  );
}
