import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import {
  loadDepartments,
  loadPlaces,
  loadStaffPool,
  loadWards,
  nursingPool,
} from "@/lib/services/data";
import { WardsView } from "../_components/wards-view";

export const dynamic = "force-dynamic";

/** Wards & beds (§5.4). Occupancy waits for the inpatient module — one honest line, no number. */
export default async function WardsPage() {
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  const [wards, departments, pool, places] = await Promise.all([
    loadWards(h),
    loadDepartments(h),
    loadStaffPool(h),
    loadPlaces(h),
  ]);
  return (
    <WardsView
      wards={wards}
      departments={departments
        .filter((d) => d.parentId === null && !d.archived)
        .map((d) => ({ id: d.id, name: d.name }))}
      nurses={[
        ...new Map(
          nursingPool(pool).map((p) => [
            p.userId,
            { userId: p.userId, name: p.name, cadre: p.cadre },
          ]),
        ).values(),
      ]}
      places={places.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
