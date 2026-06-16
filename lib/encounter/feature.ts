import "server-only";

import type { AgentConfig } from "@/lib/clerkship/agent/types";

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

/**
 * Is the queryable problem-list synthesis projection live?
 *
 * Migration 0049 adds nullable kind/status/linked_to/provenance columns to
 * `problem_list` so the Assessment's richer modelling is queryable without
 * parsing the versioned section_data. It is GATED — until the owner applies it
 * those columns do not exist, so the WRITES that populate them gate on this flag
 * (the reads already select an explicit pre-0049 projection, so they are safe
 * either way). After `npm run db:migrate` applies 0049, set
 * `PROBLEM_LIST_SYNTHESIS_LIVE=1` to start populating them — no redeploy of
 * logic. Requires ENCOUNTER_ENGINE_LIVE (the columns live on the encounter spine).
 */
export function problemListSynthesisLive(): boolean {
  return process.env.PROBLEM_LIST_SYNTHESIS_LIVE === "1" && encounterEngineLive();
}

/**
 * Is the lab-technician manual results-entry + verify/release workflow live?
 *
 * Migration 0050 adds the nullable specimen/critical/quality/release columns to
 * `encounter_results`. It is GATED — until the owner applies it those columns do
 * not exist, so the WRITES (the lab result-entry/verify-release path) gate on this
 * flag; the existing clinician read (`loadEncounterOrders`) selects only the
 * pre-0050 columns, so it is safe either way. After `npm run db:migrate` applies
 * 0050, set `LAB_RESULTS_LIVE=1` to switch the lab write workflow on — no redeploy
 * of logic. Requires ENCOUNTER_ENGINE_LIVE (results live on the encounter spine).
 * The critical-value alerting additionally gates on CRITICAL_VALUES_CSO_SIGNED.
 */
export function labResultsLive(): boolean {
  return process.env.LAB_RESULTS_LIVE === "1" && encounterEngineLive();
}

/**
 * Is the clerkship agent (the live clinical-reasoning layer) on?
 *
 * The agent is a pure client-side engine (lib/clerkship/agent) that runs over
 * the live clerkship state and surfaces decision-support insights. It needs no
 * migration — committed working diagnoses persist through the existing
 * ClerkSynthesis fields — but it gates on this master flag so it ships dark
 * until the CSO turns it on. Requires ENCOUNTER_ENGINE_LIVE. See ADR / the
 * GATE-A spec docs/design/clerkship-agent-gate-a.md.
 */
export function clerkshipAgentLive(): boolean {
  return process.env.CLERKSHIP_AGENT_LIVE === "1" && encounterEngineLive();
}

/**
 * The agent run-config the server hands to the (client) clerkship form. The
 * reasoning maps are already CSO-approved, so they activate with the master
 * flag; the three NEW packs are sourced + CSO-signed separately and each gates
 * on its own signed flag (dark until ratified). Flags stay server-only here;
 * the client only ever receives the resolved booleans.
 */
export function clerkshipAgentConfig(): AgentConfig {
  const enabled = clerkshipAgentLive();
  return {
    enabled,
    activePacks: {
      maps: enabled,
      vitalsEscalation: enabled && process.env.AGENT_VITALS_ESCALATION_CSO_SIGNED === "1",
      incompatibilities: enabled && process.env.AGENT_INCOMPATIBILITIES_CSO_SIGNED === "1",
      dependencies: enabled && process.env.AGENT_DEPENDENCIES_CSO_SIGNED === "1",
    },
  };
}
