import "server-only";

/**
 * Is the encounter / EMR engine live?
 *
 * Migration 0040 (the clinical-data spine) is GATED — until it is applied to a
 * database, the encounter tables do not exist and any read would throw. Surfaces
 * gate on this flag so the app deploys safely BEFORE the migration: when off,
 * they render an honest "activates with the clinical module" state and make no
 * encounter query. At GATE E, after `npm run db:migrate` applies 0040, set
 * `ENCOUNTER_ENGINE_LIVE=1` and the surfaces light up — no redeploy of logic.
 */
export function encounterEngineLive(): boolean {
  return process.env.ENCOUNTER_ENGINE_LIVE === "1";
}
