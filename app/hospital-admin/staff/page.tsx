import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { PlaceholderSurface } from "../_components/placeholder-surface";

/**
 * Staff management — scoped pending-approval queue + directory.
 *
 * Placeholder: the real surface lands in its own dedicated prompt.
 * The shell already wires the sidebar badge from this hospital's
 * `staff_affiliations.state = 'pending_approval'` count (see
 * `_lib/staff-pending-count.ts`), so the chrome shows live numbers
 * even while the surface itself is a placeholder.
 */
export default async function StaffPage() {
  const scope = await requireHospitalAdminScope();

  return (
    <PlaceholderSurface
      title="Staff"
      description={`Pending affiliation approvals, the directory of verified clinicians, role/department assignment, suspend / deactivate / reset-MFA, and bulk onboarding — all scoped to ${scope.hospitalName}.`}
      upcoming={[
        "Pending approval queue (currently shown as the sidebar badge)",
        "Verified-staff directory with cadre + department filters",
        "Role + department reassignment with an audited trail",
        "Per-user actions: suspend, deactivate, reset MFA",
        "Bulk onboarding via CSV",
      ]}
    />
  );
}
