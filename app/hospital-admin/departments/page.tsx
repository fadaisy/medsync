import type { EmrDb } from "@/lib/emr/db";

import { db } from "@/db";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { isDemoHospital } from "@/lib/lab/demo";
import { loadDispensingServes } from "@/lib/pharmacy/dispensing-points";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import {
  loadClinics,
  loadDepartmentCounts,
  loadDepartments,
  loadHeads,
  loadHubState,
  loadLegacyAnswers,
  loadPlaces,
  loadStaffPool,
  loadWards,
} from "@/lib/services/data";
import {
  planLegacyImport,
  planPreset,
  signedPresetFor,
} from "@/supabase/functions/_shared/services-hub";
import { DepartmentsView } from "./_components/departments-view";

export const dynamic = "force-dynamic";

/**
 * Departments tab (§5.3): grouped by kind, one tap to the panel. First run (§5.2) offers the signed
 * MoH standard for this level, the application's old answers (only where the old form left some),
 * and the catalogue.
 */
export default async function DepartmentsPage() {
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  const [departments, heads, counts, pool, places, hub, clinics, wards, points] = await Promise.all(
    [
      loadDepartments(h),
      loadHeads(h),
      loadDepartmentCounts(h),
      loadStaffPool(h),
      loadPlaces(h),
      loadHubState(h),
      loadClinics(h),
      loadWards(h),
      loadDispensingServes(h),
    ],
  );

  const top = departments.filter((d) => d.parentId === null && !d.archived);
  const lab = top.find((d) => d.catalogueCode === "LABORATORY");
  const have = {
    departmentCodes: new Set(
      top.filter((d) => d.catalogueCode).map((d) => d.catalogueCode as string),
    ),
    labSectionCodes: new Set(
      departments
        .filter((d) => lab && d.parentId === lab.id && d.catalogueCode)
        .map((d) => d.catalogueCode as string),
    ),
    clinicCodes: new Set(
      clinics.filter((c) => c.catalogueCode).map((c) => c.catalogueCode as string),
    ),
    imagingCodes: new Set<string>(),
  };
  const preset = signedPresetFor(scope.level);
  const presetPlan = preset ? planPreset(preset, have) : null;
  const legacy =
    hub.legacy === "offered" || hub.legacy === "declined" ? await loadLegacyAnswers(h) : null;
  const legacyPlan = legacy
    ? planLegacyImport({
        specialisedClinics: legacy.specialisedClinics,
        specialisedClinicsOther: legacy.specialisedClinicsOther,
        diagnosticServices: legacy.diagnosticServices,
        supportServices: legacy.supportServices,
        servicesOffered: legacy.servicesOffered,
        hasOnsitePharmacy: legacy.hasOnsitePharmacy,
      })
    : null;

  const goLive = pharmacyDispensingLiveFor(h);
  // ADR 0450: a demo hospital reaches the pharmacy demo from here, before it has any pharmacy units.
  const pharmacyDemo = goLive && (await isDemoHospital(db as unknown as EmrDb, h));
  const obj = (m: Map<string, number>) => Object.fromEntries(m);
  return (
    <DepartmentsView
      departments={departments}
      points={points}
      goLive={goLive}
      pharmacyDemo={pharmacyDemo}
      heads={heads}
      counts={{
        staff: obj(counts.staff),
        wards: obj(counts.wards),
        clinics: obj(counts.clinics),
        bookedSessions: obj(counts.bookedSessions),
      }}
      pool={pool.map((p) => ({
        userId: p.userId,
        name: p.name,
        departmentId: p.departmentId,
        cadre: p.cadre,
      }))}
      places={places.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name }))}
      clinics={clinics.map((c) => ({
        id: c.id,
        name: c.name,
        departmentId: c.departmentId,
        unitId: c.unitId,
        status: c.status,
      }))}
      wards={wards.map((w) => ({
        id: w.id,
        name: w.name,
        departmentId: w.departmentId,
        bedCount: w.bedCount,
        archived: w.archived,
      }))}
      firstRun={{
        preset: preset
          ? {
              levelLabel: preset.levelLabel,
              version: preset.version,
              section: preset.section,
              source: preset.source,
              add: presetPlan?.add ?? [],
              skip: presetPlan?.skip.length ?? 0,
            }
          : null,
        legacy: hub.legacy,
        legacyPlan,
      }}
    />
  );
}
