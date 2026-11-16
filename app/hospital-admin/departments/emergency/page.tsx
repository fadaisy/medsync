import type { Metadata } from "next";

import { EMERG } from "@/content/hospital-admin/emergency";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { loadCapabilities } from "@/lib/services/data";
import { EmergencyDesk } from "./_components/emergency-desk";
import { loadEmergencyExtras } from "./_lib/load";

export const metadata: Metadata = { title: EMERG.title };
export const dynamic = "force-dynamic";

/**
 * Emergency and support (ADR 0516 phase 2), one page in the Tether desk: whether the hospital receives emergencies,
 * the changes waiting for a second admin, the routing values and what the hospital can take in, what the public
 * Help screen shows, and the hospital's point on the map. Routing values (CAP-4) change only through a second
 * person (CAP-5); "is this pending change mine?" is decided here, so the client never receives a user id.
 */
export default async function EmergencyPage() {
  const scope = await requireHospitalAdminScope();
  const [caps, extras] = await Promise.all([
    loadCapabilities(scope.hospitalId),
    loadEmergencyExtras(scope.hospitalId),
  ]);
  return (
    <EmergencyDesk
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
        derivedFrom: c.derivedFrom,
      }))}
      location={extras.location}
      help={extras.help}
    />
  );
}
