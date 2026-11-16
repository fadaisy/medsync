import type { Metadata } from "next";

import { LiveClinics } from "@/components/clinics-schedule/entry";
import { CS } from "@/content/clinics-schedule/copy";
import { loadClinicsSchedule } from "@/lib/clinics-schedule/load";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { adminNavFor } from "../_lib/admin-nav";

export const metadata: Metadata = { title: CS.label };

/** Clinics & schedule (ADR 0501): one workspace over the engine's records, with the one admin menu (ADR 0520). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; clinic?: string; tab?: string }>;
}) {
  const scope = await requireHospitalAdminScope();
  const [data, nav] = await Promise.all([
    loadClinicsSchedule(scope),
    adminNavFor(scope.hospitalId),
  ]);
  const sp = await searchParams;
  const one = (v: unknown) => (typeof v === "string" ? v : undefined);
  return (
    <LiveClinics
      data={data}
      view={one(sp.view)}
      clinic={one(sp.clinic)}
      tab={one(sp.tab)}
      groups={nav.groups}
    />
  );
}
