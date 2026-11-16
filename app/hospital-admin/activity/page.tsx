import { loadActivity } from "@/lib/hospital-admin/activity-load";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { ActivityView } from "./_components/activity-view";

export const dynamic = "force-dynamic";

/**
 * Activity (ADR 0517): the read-only record of what admins changed at this hospital, from the audited admin
 * actions only. Schedule drafts and versions, with undo, stay in Clinics & schedule's History.
 */
export default async function ActivityPage() {
  const scope = await requireHospitalAdminScope();
  const { rows, cut, failed } = await loadActivity(scope.hospitalId);
  return <ActivityView rows={rows} cut={cut} failed={failed} />;
}
