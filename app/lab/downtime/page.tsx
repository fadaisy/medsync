import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { clinicianOptions } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { formLabel, loadDowntime } from "@/lib/lab/downtime-store";
import { labDowntimeLiveFor } from "@/lib/lab/feature";
import { labTests } from "@/lib/lab/measures-setup";
import { LAB_TIME_ZONE, requestNow } from "@/lib/lab/page-data";
import { startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { PrintForms, RecordDowntime, RecordDrill } from "./_components/downtime-forms";
import { EnterForm } from "./_components/enter-form";

export const metadata: Metadata = { title: "Downtime entry · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Downtime entry (Lab Phase 1 §5.9, artboard 13): enter the paper forms written while MedSync was
 * down, record the downtime itself, print blank numbered forms, record a drill. Paper is a first-
 * class path: entering a form should take less time than writing it did.
 */
export default async function DowntimePage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labDowntimeLiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.result.release")) notFound();
  const now = requestNow();
  const [data, tests, clinicians] = await Promise.all([
    db.transaction((tx) =>
      loadDowntime(tx as never, scope.hospitalId, startOfLocalDay(now, LAB_TIME_ZONE)),
    ),
    db.transaction((tx) => labTests(tx as never, scope.hospitalId)),
    clinicianOptions(scope.hospitalId),
  ]);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Downtime entry"
        subline={`${data.unused.length} printed ${data.unused.length === 1 ? "form" : "forms"} still to enter.`}
      />
      <EnterForm
        unused={data.unused.map((u) => u.number)}
        tests={tests.map((t) => ({ id: t.id, display: t.display }))}
        clinicians={clinicians}
        timeZone={LAB_TIME_ZONE}
      />
      {data.entries.length ? (
        <section aria-labelledby="entered-today" className="flex flex-col gap-2">
          <h2 id="entered-today" className="text-heading-s">
            Entered today
          </h2>
          <ul className="text-body-s flex flex-col gap-1">
            {data.entries.map((e) => (
              <li key={e.reportId}>
                {formLabel(e.formNumber)} · resulted {fmt.format(e.resultedAt)} · entered{" "}
                {fmt.format(e.enteredAt)} · released on paper by {e.releasedOnPaperBy}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-labelledby="record-downtime" className="flex flex-col gap-3">
        <h2 id="record-downtime" className="text-heading-s">
          Record a downtime
        </h2>
        <RecordDowntime />
        {data.periods.length ? (
          <ul className="text-body-s text-muted-foreground flex flex-col gap-0.5">
            {data.periods.slice(0, 5).map((p) => (
              <li key={p.id}>
                {fmt.format(p.startsAt)} to {fmt.format(p.endsAt)} · {p.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section aria-labelledby="print" className="flex flex-col gap-3">
        <h2 id="print" className="text-heading-s">
          Print blank forms
        </h2>
        <p className="text-body-s text-muted-foreground">
          Each sheet carries one number, reserved here before printing, so no form is lost or
          entered twice.
        </p>
        <PrintForms />
      </section>
      <section aria-labelledby="drill" className="flex flex-col gap-3">
        <h2 id="drill" className="text-heading-s">
          Record a drill
        </h2>
        <RecordDrill />
        {data.drills.length ? (
          <p className="text-body-s text-muted-foreground">Last drill: {data.drills[0]!.heldOn}.</p>
        ) : null}
      </section>
    </div>
  );
}
