import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import {
  loadCapabilities,
  loadClinics,
  loadClosures,
  loadDepartments,
  loadHolidays,
  loadPlaces,
  loadWards,
} from "@/lib/services/data";
import { HoursView } from "../_components/hours-view";

export const dynamic = "force-dynamic";

/** Hours & places (§5.9): OPD hours, the year's public holidays (with source), closures, places. */
export default async function HoursPage() {
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  const year = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" }).slice(0, 4);
  const [caps, holidays, closures, places, departments, wards, clinics] = await Promise.all([
    loadCapabilities(h),
    loadHolidays(`${year}-01-01`, `${Number(year) + 1}-12-31`),
    loadClosures(h),
    loadPlaces(h),
    loadDepartments(h),
    loadWards(h),
    loadClinics(h),
  ]);
  return (
    <HoursView
      opdHours={
        (caps.find((c) => c.key === "opd_hours")?.value as Record<
          string,
          { from: string; to: string }[]
        > | null) ?? null
      }
      holidays={holidays.map((x) => ({
        date: x.holidayDate,
        name: x.name,
        provisional: x.provisional,
        source: x.source,
      }))}
      closures={closures}
      places={places}
      targets={{
        department: departments
          .filter((d) => d.parentId === null && !d.archived)
          .map((d) => ({ id: d.id, name: d.name })),
        ward: wards.filter((w) => !w.archived).map((w) => ({ id: w.id, name: w.name })),
        clinic: clinics
          .filter((c) => c.status !== "archived")
          .map((c) => ({ id: c.id, name: c.name })),
      }}
    />
  );
}
