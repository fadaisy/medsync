import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { PlaceholderSurface } from "./_components/placeholder-surface";

/**
 * Overview (index) — operational command centre.
 *
 * Placeholder: the real surface (bed occupancy, ALOS, admissions /
 * discharges, turnover, OPD:IP ratio, readmission, mortality, NCD
 * case-mix framed neutrally) lands in its own dedicated prompt.
 *
 * This page demonstrates the integration contract end-to-end:
 *   1. The shell layout has already resolved the tenant scope and
 *      bounced any unauthorised access. Re-calling
 *      `requireHospitalAdminScope()` here is idempotent and gets us
 *      the typed scope for any feature query — features must use this
 *      accessor, not derive hospital_id from request params.
 *   2. The page renders inside the shell's HospitalScopeProvider, so
 *      any client component placed here can read scope via
 *      `useHospitalScope()` without re-fetching.
 *   3. The eyebrow names the tenant. When the real Overview lands, the
 *      same scope drives every KPI query.
 */
export default async function HospitalAdminOverviewPage() {
  const scope = await requireHospitalAdminScope();

  return (
    <PlaceholderSurface
      title="Operational overview"
      description={`Glanceable, Uganda-HMIS-grounded KPIs for ${scope.hospitalName}. Bed occupancy, ALOS, admissions/discharges, turnover, OPD:IP ratio, readmission, mortality — operations-only, never decrypted clinical content.`}
      eyebrow={`${scope.hospitalName} · Reserved · feature prompt to follow`}
      upcoming={[
        "Bed occupancy + turnover by ward (live)",
        "Today's admissions / discharges / transfers",
        "Average length of stay — trailing 7 / 30 days",
        "OPD : inpatient ratio",
        "30-day readmission rate",
        "Mortality + NCD case-mix (aggregate, neutrally framed)",
      ]}
    />
  );
}
