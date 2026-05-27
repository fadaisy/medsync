import type { Metadata } from "next";
import { ActivityIcon } from "lucide-react";

import { listOpenAlertsForDoctor } from "@/lib/doctor/alerts";
import { requireDoctorScope } from "@/lib/doctor/scope";

export const metadata: Metadata = { title: "Alerts · Doctor · MedSync" };
export const dynamic = "force-dynamic";

export default async function DoctorAlertsPage() {
  const scope = await requireDoctorScope();
  const alerts = await listOpenAlertsForDoctor({
    doctorUserId: scope.userId,
    doctorDepartmentId: scope.departmentId,
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 lg:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          Monitoring alerts
        </span>
        <h1 className="font-display text-foreground text-[26px] leading-[1.15] font-medium tracking-[-0.015em]">
          Alerts for your patients
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px] leading-relaxed">
          Threshold breaches (glucose, BP, SpO₂, temperature) for patients you have a clinical
          relationship with. Prioritised, never drowning — calm-but-clear severity.
        </p>
      </header>

      {alerts.length === 0 ? (
        <section className="border-border bg-card flex flex-col items-start gap-3 rounded-xl border p-6">
          <span
            aria-hidden
            className="inline-flex size-10 items-center justify-center rounded-full bg-teal-50 text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/40"
          >
            <ActivityIcon className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-foreground text-[14px] font-medium">
              Monitoring connects here
            </span>
            <p className="text-muted-foreground max-w-[56ch] text-[12.5px] leading-relaxed">
              The monitoring engine ships separately. Today this panel is wired to its future
              interface — the moment alerts land, prioritised threshold breaches for your patients
              will appear here, deep-linking into the patient summary and the urgent-appointment
              flow.
            </p>
          </div>
        </section>
      ) : (
        // The shape is ready; the engine just needs to populate.
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="border-border bg-card flex items-center justify-between gap-3 rounded-xl border p-4"
            >
              <div className="flex flex-col">
                <span className="text-foreground text-[14px] font-medium">{a.patientCode}</span>
                <span className="text-muted-foreground text-[12px]">
                  {a.metric} · {a.reading}
                </span>
              </div>
              <span className="font-mono text-[10.5px] tracking-[0.1em] uppercase">
                {a.severity}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
