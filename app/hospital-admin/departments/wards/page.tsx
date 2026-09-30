import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import {
  loadDepartments,
  loadPlaces,
  loadStaffPool,
  loadWards,
  nursingPool,
} from "@/lib/services/data";
import { layoutStatusByWard } from "@/lib/wards/data";
import { wardBuilderLiveFor } from "@/lib/wards/feature";
import { WardsView } from "../_components/wards-view";

export const dynamic = "force-dynamic";

/**
 * Wards & beds (§5.4). With WARD_BUILDER on, each ward opens its layout and its live bed board
 * (ADRs 0191–0194); occupancy lives on the board, never in this list.
 */
export default async function WardsPage() {
  const scope = await requireHospitalAdminScope();
  const h = scope.hospitalId;
  const builder = wardBuilderLiveFor(h);
  const [wards, departments, pool, places, layouts] = await Promise.all([
    loadWards(h),
    loadDepartments(h),
    loadStaffPool(h),
    loadPlaces(h),
    // ADR 0191 §6: the layout tables are read only when the ward builder is on (migration 0090).
    builder ? layoutStatusByWard(h) : Promise.resolve(null),
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
      layouts={layouts}
    />
  );
}
