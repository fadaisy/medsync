import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { PlaceholderSurface } from "../_components/placeholder-surface";

/**
 * Admins & succession — primary + backup admin roster + audited transfer
 * of the primary admin role.
 *
 * Placeholder. The hospital_admin_roster table (migration 0022) already
 * carries the primary/backup distinction with a full succession trail
 * (succeeded_at / succeeded_by / succession_reason). The surface lands
 * in its own prompt.
 */
export default async function AdminsPage() {
  const scope = await requireHospitalAdminScope();

  const currentDesignation = scope.designation
    ? `You are signed in as the ${scope.designation} admin for ${scope.hospitalName}.`
    : `Your designation isn't recorded in the roster yet — it will be once succession lands.`;

  return (
    <PlaceholderSurface
      title="Admins & succession"
      description={`Primary and backup admin for ${scope.hospitalName}, with a fully audited transfer for the primary role. ${currentDesignation}`}
      upcoming={[
        "View the current primary + backup admins (sourced from hospital_admin_roster)",
        "Designate a new backup admin (audited)",
        "Transfer the primary role to a backup — requires reason + double confirmation",
        "Full succession history with who-did-what-when",
      ]}
    />
  );
}
