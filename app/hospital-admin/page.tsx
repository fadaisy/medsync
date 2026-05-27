import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { PlaceholderSurface } from "./_components/placeholder-surface";
import { SchedulingOverviewCard } from "./_components/scheduling-overview-card";
import { StaffOverviewCard } from "./_components/staff-overview-card";

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

  // The Overview surface itself lands in its own prompt. Until then,
  // we render the staff card alongside the placeholder so the admin's
  // landing isn't empty — they see real numbers for the one feature
  // that already ships (Staff) and the upcoming-bits list for the
  // KPIs to come.
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex w-fit items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · Overview
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.15] font-medium tracking-[-0.015em] sm:text-[28px]">
          Operational overview
        </h1>
        <p className="text-muted-foreground max-w-2xl text-[13.5px] leading-relaxed">
          Glanceable, Uganda-HMIS-grounded KPIs for {scope.hospitalName}. Operations-only, never
          decrypted clinical content.
        </p>
        <div className="h-px w-10 bg-teal-500/60 dark:bg-teal-400/50" aria-hidden />
      </header>

      <StaffOverviewCard hospitalId={scope.hospitalId} variant="panel" />
      <SchedulingOverviewCard hospitalId={scope.hospitalId} variant="panel" />

      <PlaceholderSurface
        title="The rest of the overview"
        description="Bed occupancy, ALOS, admissions / discharges, turnover, OPD:IP ratio, 30-day readmission, mortality, and NCD case-mix land in the Overview feature prompt. The Staff tile above is the first piece in place."
        upcoming={[
          "Bed occupancy + turnover by ward (live)",
          "Today's admissions / discharges / transfers",
          "Average length of stay — trailing 7 / 30 days",
          "OPD : inpatient ratio",
          "30-day readmission rate",
          "Mortality + NCD case-mix (aggregate, neutrally framed)",
        ]}
      />
    </div>
  );
}
