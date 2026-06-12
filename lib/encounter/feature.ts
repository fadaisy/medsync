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

/**
 * Is clerkship working-draft autosave (W3) live?
 *
 * Migration 0048 (the mutable `clerkship_drafts` scratchpad) is GATED — until the
 * owner applies it the table does not exist. All draft reads/writes gate on this
 * flag so the app deploys safely dark: when off, the page loads no draft and the
 * form's autosave is inert. After `npm run db:migrate` applies 0048, set
 * `CLERKSHIP_DRAFTS_LIVE=1` to switch autosave on — no redeploy of logic.
 * Requires ENCOUNTER_ENGINE_LIVE too (drafts reference the encounter spine).
 */
export function clerkshipDraftsLive(): boolean {
  return process.env.CLERKSHIP_DRAFTS_LIVE === "1" && encounterEngineLive();
}
