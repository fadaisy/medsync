import type { ReactNode } from "react";

import { PatientShell } from "@/components/tide/shell";
import { dataProcessingConsent, resolvePatientScope } from "@/lib/patient/scope";
import { AddButton } from "../_components/add-dialog";

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
  return (
    <PatientShell bare={gated} plus={<AddButton />} place={place}>
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
