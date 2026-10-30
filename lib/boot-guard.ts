/**
 * Pharmacy rework S13 (H1): development switches never run in production. `register()` refuses to start when any is set.
 */
export const DEV_OVERRIDES = ["PHARMACY_DEV_HOSPITALS", "DEV_SKIP_MFA"] as const;

export function productionOverrides(env: Record<string, string | undefined> = process.env): string[] {
  if (env.VERCEL_ENV !== "production") return [];
  return DEV_OVERRIDES.filter((k) => (env[k] ?? "").trim() !== "");
}

/** The overrides switched on here (any environment), for the staff-visible band. */
export function overridesOn(env: Record<string, string | undefined> = process.env): string[] {
  return DEV_OVERRIDES.filter((k) => (env[k] ?? "").trim() !== "");
}
