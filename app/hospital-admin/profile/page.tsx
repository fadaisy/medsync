import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { hospitalClinicalSettings } from "@/db/schema/clerking";
import { fetchEmergencySettings } from "@/lib/emergency/queries";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { ProfileView } from "./_components/profile-view";

export const metadata: Metadata = { title: "Profile · Hospital admin · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The hospital's profile, in the Tether desk (ADR 0520, phase 2): the identity the scope already carries
 * (read-only; the superadmin owns those fields), the emergency settings (routing values read-only since ADR 0158,
 * the coordinates editable, ADR 0098 ruling 5) and outbreak mode (D-CV-06). Every read pins `scope.hospitalId`;
 * Drizzle bypasses RLS. The admin's own designation moved to People › Admins.
 */
export default async function ProfilePage() {
  const scope = await requireHospitalAdminScope();
  const settings = await fetchEmergencySettings(scope.hospitalId);
  // Before migration 0076 the table does not exist: the card says so (null).
  const outbreak = await db
    .select({
      on: hospitalClinicalSettings.outbreakMode,
      reason: hospitalClinicalSettings.outbreakReason,
    })
    .from(hospitalClinicalSettings)
    .where(eq(hospitalClinicalSettings.hospitalId, scope.hospitalId))
    .then((r) => r[0] ?? { on: false, reason: null })
    .catch(() => null);

  return (
    <ProfileView
      identity={{
        name: scope.hospitalName,
        level: scope.level,
        state: scope.state,
        slug: scope.hospitalSlug,
      }}
      settings={settings}
      outbreak={{ on: outbreak?.on ?? null, reason: outbreak?.reason ?? null }}
    />
  );
}
