"use server";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import {
  loadClinics,
  loadDepartments,
  loadOfferings,
  loadTestCatalogue,
  loadWards,
} from "@/lib/services/data";

/**
 * ⌘K entity search for Departments & services (contract §6, §5.11) — the first feature to register
 * entities, so the palette fetches these once when it opens. Pre-scoped: the hospital comes from
 * the server scope, never the client; no cross-tenant entity can appear.
 */
export async function hubPaletteEntries(): Promise<
  { id: string; group: string; label: string; hint: string; href: string }[]
> {
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  const [departments, wards, clinics, tests, offerings] = await Promise.all([
    loadDepartments(h),
    loadWards(h),
    loadClinics(h),
    loadTestCatalogue(),
    loadOfferings(h),
  ]);
  const base = "/hospital-admin/departments";
  return [
    ...departments
      .filter((d) => !d.archived)
      .map((d) => ({
        id: `dep-${d.id}`,
        group: "Departments",
        label: d.name,
        hint: d.parentId ? "Unit" : d.live ? "Live" : "Not on MedSync yet",
        href: `${base}?open=${d.parentId ?? d.id}`,
      })),
    ...wards
      .filter((w) => !w.archived)
      .map((w) => ({
        id: `ward-${w.id}`,
        group: "Wards",
        label: w.name,
        hint: `${w.bedCount} beds`,
        href: `${base}/wards?open=${w.id}`,
      })),
    ...clinics
      .filter((c) => c.status !== "archived")
      .map((c) => ({
        id: `clinic-${c.id}`,
        group: "Clinics",
        label: c.name,
        hint: c.status === "live" ? "Live" : "Planned",
        href: `${base}/clinics?open=${c.id}`,
      })),
    ...tests.map((t) => {
      const o = offerings.find((x) => x.kind === "lab" && x.code === t.code);
      const where =
        !o || !o.confirmedAt
          ? "Not set"
          : o.provision === "in_house"
            ? "In-house"
            : o.provision === "referred"
              ? "Referred out"
              : "Not offered";
      return {
        id: `test-${t.code}`,
        group: "Tests",
        label: t.name,
        hint: where,
        href: `${base}/diagnostics?test=${encodeURIComponent(t.code)}`,
      };
    }),
  ];
}
