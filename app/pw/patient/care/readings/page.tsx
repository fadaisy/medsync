import type { ReadingKind } from "@patient-core/readings";

import { careModeOn, patientFlag } from "@/lib/patient-web/flags";
import { recentReadingsAction } from "@/lib/patient-web/reading-actions";
import { ReadingsBody } from "./_components/readings-body";

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
    <ReadingsBody
      initialKind={KINDS.find((k) => k === kind) ?? "bp"}
      recent={recent}
      sayIt={patientFlag("sayIt")}
      careFlow={careModeOn()}
    />
  );
}
