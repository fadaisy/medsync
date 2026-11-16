/**
 * Activity (ADR 0517): what admins changed at one hospital, read from `sa_audit_log` the way a department's History
 * tab already does (`loadItemHistory`). Only the admin actions below are ever read: an action about a patient
 * (bookings, visits, observations, resus, triage) never reaches this page, so it shows no health information.
 * Client-safe: the loader lives in `activity-load.ts`.
 */

export type ActivityArea = "schedule" | "people" | "hospital";

/** The admin actions Activity shows, each with its area and a past-tense line. Nothing else is read. */
export const ACTIVITY_ACTIONS: Readonly<Record<string, readonly [ActivityArea, string]>> = {
  // People
  approve_staff_affiliation: ["people", "Approved a staff member"],
  reject_staff_affiliation: ["people", "Declined a request to join"],
  request_staff_info: ["people", "Asked a staff member for more information"],
  invite_staff: ["people", "Invited staff"],
  revoke_staff_invitation: ["people", "Revoked an invitation"],
  suspend_staff_affiliation: ["people", "Suspended a staff member"],
  deactivate_staff_affiliation: ["people", "Removed a staff member"],
  reactivate_staff_affiliation: ["people", "Brought a staff member back"],
  reset_staff_mfa: ["people", "Reset a staff member's authenticator"],
  assign_staff_role: ["people", "Changed a staff member's role"],
  hospital_admin_claimed: ["people", "Claimed the hospital admin account"],
  // Hospital
  update_department: ["hospital", "Changed a department"],
  set_department_live: ["hospital", "Set a department live or off Tether"],
  set_start_department: ["hospital", "Changed where new patients start"],
  assign_department_head: ["hospital", "Named a head of department"],
  end_department_head: ["hospital", "Ended a head of department"],
  update_department_policy: ["hospital", "Changed a department's booking rules"],
  archive_structure: ["hospital", "Archived a department, unit or ward"],
  unarchive_structure: ["hospital", "Restored a department, unit or ward"],
  update_ward: ["hospital", "Changed a ward"],
  update_beds: ["hospital", "Changed a ward's beds"],
  assign_ward_in_charge: ["hospital", "Named a ward's nurse in charge"],
  end_ward_in_charge: ["hospital", "Ended a ward's nurse in charge"],
  save_ward_layout: ["hospital", "Saved a ward layout draft"],
  publish_ward_layout: ["hospital", "Published a ward layout"],
  update_place: ["hospital", "Changed a place"],
  update_diagnostics: ["hospital", "Changed tests and imaging"],
  set_capability: ["hospital", "Proposed a change to emergency or support"],
  verify_capability: ["hospital", "Verified a change to emergency or support"],
  reject_capability: ["hospital", "Rejected a change to emergency or support"],
  set_emergency_phone: ["hospital", "Changed an emergency number"],
  verify_emergency_contact: ["hospital", "Verified an emergency number"],
  set_hospital_emergency_settings: ["hospital", "Changed the emergency settings"],
  report_availability: ["hospital", "Reported a service unavailable or back"],
  apply_service_preset: ["hospital", "Started services from a preset"],
  import_legacy_services: ["hospital", "Imported services from the application"],
  update_service_line: ["hospital", "Changed a service"],
  set_service_line_fee: ["hospital", "Changed a fee"],
  // Schedule
  add_closure: ["schedule", "Added a closure"],
  lift_closure: ["schedule", "Lifted a closure"],
  update_session_template: ["schedule", "Changed a session"],
  cancel_session: ["schedule", "Cancelled a session"],
  set_session_delay: ["schedule", "Told patients a session runs late"],
  cs_publish: ["schedule", "Published the schedule"],
  cs_schedule: ["schedule", "Scheduled a publish"],
  cs_cancel_schedule: ["schedule", "Cancelled a scheduled publish"],
  cs_undo: ["schedule", "Undid a schedule change"],
  cs_restore: ["schedule", "Brought back an earlier schedule"],
  cs_pause: ["schedule", "Paused bookings"],
  cs_leave_decision: ["schedule", "Decided on a clinician's leave"],
  cs_pair_device: ["schedule", "Paired a desk or screen"],
  cs_unpair_device: ["schedule", "Unpaired a desk or screen"],
};

export const ACTIVITY_ACTION_KEYS = Object.keys(ACTIVITY_ACTIONS);

/** How far back the page reads, and the most rows it ships. */
export const ACTIVITY_DAYS = 90;
export const ACTIVITY_LIMIT = 300;

export interface ActivityRow {
  id: number;
  area: ActivityArea;
  what: string;
  who: string | null;
  at: string;
  reason: string;
}

/** One audited action as the page prints it, or null for anything outside the allowlist. */
export function activityLine(action: string): readonly [ActivityArea, string] | null {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_ACTIONS, action)
    ? ACTIVITY_ACTIONS[action]!
    : null;
}
