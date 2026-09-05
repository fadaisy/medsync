import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, PillIcon } from "lucide-react";

import { requirePatientScope } from "@/lib/patient/scope";
import {
  expectedDosesPerDay,
  listActiveMedications,
  listTakesToday,
  SCHEDULE_PATTERN_LABEL,
} from "@/lib/patient/self-tracking";
import { MarkTakenButton } from "../_components/mark-taken-button";
import { AddMedicationForm } from "./_components/add-medication-form";
import { StopMedicationButton } from "./_components/stop-medication-button";

export const metadata: Metadata = { title: "Medications · MedSync" };
export const dynamic = "force-dynamic";

export default async function PatientMedicationsPage() {
  const scope = await requirePatientScope();
  const [meds, takesToday] = await Promise.all([
    listActiveMedications(scope.userId),
    listTakesToday(scope.userId),
  ]);

  const takesByMed = new Map<string, number>();
  for (const t of takesToday) {
    takesByMed.set(t.medicationId, (takesByMed.get(t.medicationId) ?? 0) + 1);
  }

  return (
    <div className="stagger-children relative mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <div
        aria-hidden
        className="bg-brand-500/5 dark:bg-brand-400/4 pointer-events-none absolute -top-20 left-1/2 -z-10 h-56 w-md max-w-full -translate-x-1/2 rounded-full blur-3xl"
      />
      <Link
        href="/patient/track"
        className="text-muted-foreground hover:text-foreground group inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon
          className="size-3.5 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
        Back to tracking
      </Link>

      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="bg-brand-500 ring-brand-500/20 size-1 rounded-full ring-2" />
          MedSync · Medications
        </span>
        <h1 className="font-display text-foreground sm:text-heading-l text-[24px] leading-[1.15] font-medium tracking-[-0.015em]">
          What you take
        </h1>
        <p className="text-muted-foreground text-[12.5px] leading-relaxed">
          A list you manage yourself. Mark doses as you take them; we&rsquo;ll keep a quiet running
          tally.
        </p>
      </header>

      {meds.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
            Active
          </h2>
          <ul className="border-border bg-card divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
            {meds.map((m) => {
              const expected = expectedDosesPerDay(m.schedulePattern);
              const taken = takesByMed.get(m.id) ?? 0;
              const completed =
                expected > 0
                  ? taken >= expected
                  : m.schedulePattern === "as_needed"
                    ? false
                    : taken > 0;
              return (
                <li
                  key={m.id}
                  className="hover:bg-muted/30 flex flex-col gap-3 px-4 py-3.5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-foreground text-[14.5px] font-medium">{m.name}</span>
                      <span className="text-muted-foreground text-[12px]">
                        {[m.dose, SCHEDULE_PATTERN_LABEL[m.schedulePattern]]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {m.instructions ? (
                        <span className="text-muted-foreground/90 text-[12px]">
                          {m.instructions}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground/80 mt-1 font-mono text-[10.5px] tabular-nums">
                        {expected > 0 ? `${taken}/${expected} taken today` : `${taken} taken today`}
                      </span>
                    </div>
                    <MarkTakenButton medicationId={m.id} showCompleted={completed} />
                  </div>
                  <div className="flex items-center justify-end">
                    <StopMedicationButton medicationId={m.id} medicationName={m.name} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="border-border bg-card flex items-start gap-3 rounded-xl border p-4">
          <span
            aria-hidden
            className="scale-in bg-brand-50 text-brand-700 ring-brand-200/70 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-800/40 inline-flex size-9 shrink-0 items-center justify-center rounded-full ring-1"
          >
            <PillIcon className="size-4" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-foreground text-[13.5px] font-medium">No medications yet</span>
            <span className="text-muted-foreground max-w-[44ch] text-[12px] leading-relaxed">
              Add what you take regularly so the home tab can show today&rsquo;s doses and you can
              tap to mark them taken.
            </span>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
          Add a medication
        </h2>
        <AddMedicationForm />
      </section>
    </div>
  );
}
