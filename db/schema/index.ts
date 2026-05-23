/**
 * Drizzle schema barrel. Tables ship in Phase 0.4 (this file); RLS policies
 * in 0.5; audit triggers in 0.6; encryption columns in Phase 1+.
 *
 * Phase 1 onboarding additions (migrations 0008-0010): reference data
 * (geography + clinical catalog), lifecycle state machine, staff
 * affiliations, and server-side signup drafts.
 */

export * from "./_auth";
export * from "./users";
export * from "./hospitals";
export * from "./hospital-departments";
export * from "./user-roles";
export * from "./consent-records";
export * from "./audit-log";
export * from "./interest-signups";

// Phase 1 onboarding
export * from "./lifecycle";
export * from "./reference-geography";
export * from "./reference-clinical-catalog";
export * from "./staff-affiliations";
export * from "./signup-drafts";
export * from "./patient-profiles";
export * from "./hospital-applications";
