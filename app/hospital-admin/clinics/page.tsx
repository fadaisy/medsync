import type { Metadata } from "next";

import { LiveClinics } from "@/components/clinics-schedule/entry";
import { CS } from "@/content/clinics-schedule/copy";
import { loadClinicsSchedule } from "@/lib/clinics-schedule/load";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";

export const metadata: Metadata = { title: CS.label };

/** Clinics & schedule (ADR 0501): one workspace over the engine's records (cut over: always on). */
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const scope = await requireHospitalAdminScope();
  const data = await loadClinicsSchedule(scope);
  return <LiveClinics data={data} view={(await searchParams).view} />;
}
