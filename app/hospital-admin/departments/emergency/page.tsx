import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { loadCapabilities } from "@/lib/services/data";
import { EmergencyView } from "../_components/emergency-view";

export const dynamic = "force-dynamic";

/**
 * Emergency & support (§5.7). One page, numbered sections, no Next. Routing values (CAP-4) change
 * only through a second person (CAP-5); the emergency pathway's own columns are edited here and
 * written only on verification (CAP-2). "Is this pending change mine?" is decided on the server —
 * the client never receives a user id (contract §3).
 */
export default async function EmergencyPage() {
  const scope = await requireHospitalAdminScope();
  const caps = await loadCapabilities(scope.hospitalId);
  return (
    <EmergencyView
      caps={caps.map((c) => ({
        key: c.key,
        value: c.value,
        pendingValue: c.pendingValue,
        pending: c.pending
          ? {
              byName: c.pending.byName,
              at: c.pending.at,
              mine: c.pending.byUserId === scope.userId,
            }
          : null,
        verified: c.verified,
        derived: c.derived,
      }))}
    />
  );
}
