import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCapIcon } from "lucide-react";

import { listMySupervisees } from "@/lib/doctor/cosign";
import { requireDoctorScope } from "@/lib/doctor/scope";

export const metadata: Metadata = { title: "Supervisees · Doctor · MedSync" };
export const dynamic = "force-dynamic";

export default async function DoctorSuperviseesPage() {
  const scope = await requireDoctorScope();
  if (!scope.isConsultantLevel) {
    redirect("/doctor");
  }

  const supervisees = await listMySupervisees({
    supervisorAffiliationId: scope.affiliationId,
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 lg:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          Supervisees
        </span>
        <h1 className="font-display text-foreground text-[26px] leading-[1.15] font-medium tracking-[-0.015em]">
          Who you supervise
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          Interns and clinical officers paired to you in {scope.departmentName}. Their flagged
          actions land in your{" "}
          <a href="/doctor/cosign-queue" className="underline-offset-2 hover:underline">
            review queue
          </a>
          .
        </p>
      </header>

      {supervisees.length === 0 ? (
        <div className="border-border bg-card flex items-start gap-3 rounded-xl border p-5">
          <span
            aria-hidden
            className="inline-flex size-10 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/40"
          >
            <GraduationCapIcon className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-foreground text-[14px] font-medium">
              No supervisees paired yet
            </span>
            <p className="text-muted-foreground max-w-[56ch] text-[12.5px] leading-relaxed">
              Your hospital admin pairs interns and clinical officers to a supervisor when
              they&rsquo;re approved. When that happens, they show up here and their flagged actions
              route to you for review.
            </p>
          </div>
        </div>
      ) : (
        <ul className="border-border bg-card divide-border/60 divide-y rounded-xl border">
          {supervisees.map((s) => (
            <li
              key={s.superviseeAffiliationId}
              className="flex items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="flex flex-col">
                <span className="text-foreground text-[14px] font-medium">
                  {s.superviseeName ?? "—"}
                </span>
                <span className="text-muted-foreground text-[12px]">
                  {s.cadreName} · {s.departmentName}
                </span>
              </div>
              <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.1em] uppercase">
                {s.relationshipKind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
