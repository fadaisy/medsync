import type { Metadata } from "next";

import { TriageWorklist } from "@/app/nurse/triage/_components/triage-worklist";
import { requireTriageScope } from "@/lib/triage/scope";
import { fetchTriageWorklist } from "@/lib/triage/worklist";

export const metadata: Metadata = {
  title: "Triage · MedSync",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * /doctor/triage — the triage worklist for doctors. Same surface as
 * /nurse/triage; requireTriageScope already authorises doctor cadres
 * (clinical_cosign_policies seed grants triage_patient + triage_downgrade to
 * the doctor set). Reuses the TriageWorklist with the /doctor base paths so
 * desk links + open-resus stay inside the doctor workspace.
 */
export default async function DoctorTriagePage() {
  const scope = await requireTriageScope();
  const rows = await fetchTriageWorklist({
    hospitalId: scope.hospitalId,
    departmentId: scope.departmentId,
    clinicianUserId: scope.userId,
    limit: 100,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-9">
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · {scope.departmentName} · Triage
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          Triage worklist
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13px] leading-relaxed">
          Assess each waiting patient and assign an acuity. The score is decision-support — you
          confirm or override every result, and the engine biases up when uncertain.
        </p>
        <div className="h-px w-10 bg-teal-500/60 dark:bg-teal-400/50" aria-hidden />
      </header>

      <TriageWorklist
        rows={rows}
        departmentName={scope.departmentName}
        basePath="/doctor/triage"
        resusBasePath="/doctor/resus"
      />
    </div>
  );
}
