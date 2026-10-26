import type { ReactNode } from "react";

import { PatientShell } from "@/components/tide/shell";
import { loadAddDialogDay } from "@/lib/patient-web/day";
import { dataProcessingConsent, resolvePatientScope } from "@/lib/patient/scope";
import { AddButton } from "../_components/add-dialog";
import { DeviceChoice } from "./_components/device-choice";
import { readDeviceChoice } from "./_lib/device";

/**
 * The signed-in shell. `resolvePatientScope`, not `require`, as the old shell: pages carry the consent gate
 * (ADR 0094) and redirect to /patient/consent, which renders here; while the gate is closed the rail goes.
 */
export default async function PatientWebShell({ children }: { children: ReactNode }) {
  const scope = await resolvePatientScope();
  const consent = await dataProcessingConsent(scope.userId);
  const gated = consent !== null && consent.acceptedAt === null;
  const name = scope.primaryHospitalName;
  const place = name ? { name, initials: initialsOf(name) } : undefined;
  // The plus's "Right now" dose and the rail's Care badge come from the same day (S5).
  const day = gated ? null : await loadAddDialogDay(scope.userId).catch(() => null);
  return (
    <PatientShell
      bare={gated}
      plus={<AddButton day={day} />}
      dosesDue={day?.today.dueNow.length ?? 0}
      place={place}
    >
      {/* Asked once the first-run redirects (consent, then a hospital) are behind them: the layout renders
          before a page's redirect lands, so asking earlier flashes the question on a page that leaves. */}
      <DeviceChoice
        choice={await readDeviceChoice()}
        ask={!gated && scope.primaryHospitalId !== null}
      />
      {children}
    </PatientShell>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
