import type { ReadingKind } from "@/lib/patient/self-tracking-constants";
import type { Metadata } from "next";

import { PatientPageHeader } from "@/app/patient/_components/page-header";
import { requirePatientScope } from "@/lib/patient/scope";
import { suggestedReadingKinds } from "@/lib/patient/self-tracking";
import { READING_KINDS } from "@/lib/patient/self-tracking-constants";
import { LogReadingForm } from "../_components/log-reading-form";

export const metadata: Metadata = { title: "Log a reading · MedSync" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ kind?: string }>;
}

export default async function LogReadingPage({ searchParams }: PageProps) {
  const { kind: kindParam } = await searchParams;
  const scope = await requirePatientScope();
  const suggested = await suggestedReadingKinds(scope.userId);

  // The same tuple the form's picker and `logReadingAction`'s zod enum read,
  // so an unknown `?kind=` can't open a field set the action would then reject.
  // This only picks which fields open first; the action re-validates regardless.
  const defaultKind: ReadingKind = isReadingKind(kindParam)
    ? kindParam
    : (READING_KINDS.find((k) => k === suggested[0]) ?? "glucose");

  return (
    <div className="flex flex-col gap-6">
      <PatientPageHeader
        eyebrow="MedSync · Tracking"
        title="Log a reading"
        description="A small entry is better than a perfect one. Only you can see this."
        backHref="/patient/track"
        backLabel="Back to tracking"
      />

      <LogReadingForm defaultKind={defaultKind} suggestedKinds={suggested} />
    </div>
  );
}

function isReadingKind(value: string | undefined): value is ReadingKind {
  return (READING_KINDS as ReadonlyArray<string>).includes(value ?? "");
}
