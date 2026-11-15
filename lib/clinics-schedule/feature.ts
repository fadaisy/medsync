import { CLINICS_SCHEDULE_COPY_STATUS } from "@/content/clinics-schedule/copy";

/**
 * Clinics & schedule (ADR 0501): off until the owner applies migration 0296. `CLINICS_SCHEDULE=1` turns it on
 * everywhere; a comma-separated list of hospital ids, for those only. In production it also needs the copy signed.
 * Off, `/hospital-admin/clinics` 404s and the old scheduling and department pages are unchanged.
 */
export function clinicsScheduleLiveFor(
  hospitalId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env.CLINICS_SCHEDULE?.trim();
  if (!value) return false;
  if (env.VERCEL_ENV === "production" && CLINICS_SCHEDULE_COPY_STATUS.status !== "signed")
    return false;
  return value === "1" || value.split(",").some((id) => id.trim() === hospitalId);
}
