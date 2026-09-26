import type { DepartmentKind, VerificationState } from "@/supabase/functions/_shared/services-hub";

import { capabilityKey } from "@/supabase/functions/_shared/services-hub";

/**
 * The capability profile (PRF-1…PRF-3, ADR 0159): what the rest of MedSync reads about a hospital's
 * departments, clinics, diagnostics, verified capabilities, availability, hours, places and holidays.
 *
 * Pure builder — no personal data can enter it because none is passed in: no user ids, names,
 * authors or verifiers; only institutional facts and each routing value's verification STATE.
 * tests/hospital-services/profile.test.ts proves the key set and snapshots each audience.
 */

export type Audience = "internal" | "network" | "public";
export const PROFILE_VERSION = "capability-profile.v1" as const;

export interface ProfileInput {
  hospitalId: string;
  generatedAt: string;
  departments: {
    code: string | null;
    name: string;
    kind: DepartmentKind;
    live: boolean;
    archived: boolean;
    isStart: boolean;
    units: string[];
  }[];
  clinics: {
    code: string | null;
    name: string;
    department: string;
    audience: "patients" | "referral" | "staff";
    confidential: boolean;
    live: boolean;
    place: { name: string; directions: string | null } | null;
    days: { weekday: number; start: string; end: string; pattern: string }[];
  }[];
  diagnostics: {
    kind: "lab" | "imaging";
    code: string;
    name: string;
    where: "in_house" | "referred" | "not_offered";
    hours: string | null;
    statedTurnaround: string | null;
    referredTo: string | null;
    confirmed: boolean;
  }[];
  capabilities: {
    key: string;
    value: unknown;
    derived: boolean;
    verification: VerificationState | null; // null for non-routing keys
  }[];
  availability: {
    kind: string;
    label: string;
    state: "unavailable" | "limited" | "unconfirmed";
    since: string;
    lastConfirmedAt: string;
  }[];
  opdHours: Record<string, { from: string; to: string }[]> | null;
  places: { name: string; directions: string | null }[];
  holidays: { date: string; name: string }[];
}

/** Keys the public profile may carry (patients): opening facts only. */
const PUBLIC_CAPABILITY_KEYS = new Set(["emergency_capability", "arrival_directions"]);

export function buildCapabilityProfile(input: ProfileInput, audience: Audience) {
  const isPublic = audience === "public";
  const liveDepartments = input.departments.filter((d) => d.live && !d.archived);
  const clinics = input.clinics.filter(
    (c) => c.live && (!isPublic || (c.audience === "patients" && !c.confidential)),
  );
  return {
    version: PROFILE_VERSION,
    audience,
    hospitalId: input.hospitalId,
    generatedAt: input.generatedAt,
    departments: liveDepartments.map((d) => ({
      code: d.code,
      name: d.name,
      kind: d.kind,
      ...(isPublic ? {} : { isStart: d.isStart, units: d.units }),
    })),
    clinics: clinics.map((c) => ({
      code: c.code,
      // D-SVC-08: a confidential clinic is never named outside the hospital's own staff.
      name: c.confidential && audience !== "internal" ? "Clinic" : c.name,
      department: c.department,
      audience: c.audience,
      confidential: c.confidential,
      place: c.place,
      days: c.days,
    })),
    diagnostics: input.diagnostics
      .filter((d) => d.confirmed && (!isPublic || d.where !== "not_offered"))
      .map((d) => ({
        kind: d.kind,
        code: d.code,
        name: d.name,
        where: d.where,
        hours: d.hours,
        statedTurnaround: d.statedTurnaround,
        referredTo: isPublic ? null : d.referredTo,
      })),
    capabilities: input.capabilities
      .filter((c) => !isPublic || PUBLIC_CAPABILITY_KEYS.has(c.key))
      .map((c) => ({
        key: c.key,
        label: capabilityKey(c.key)?.label ?? c.key,
        value: c.value,
        derived: c.derived,
        routing: capabilityKey(c.key)?.routing ?? false,
        verification: c.verification,
      })),
    availabilityNow: input.availability
      .filter((a) => !isPublic || a.kind === "clinic" || a.kind === "imaging" || a.kind === "test")
      .map((a) => ({
        kind: a.kind,
        label: a.label,
        state: a.state,
        since: a.since,
        lastConfirmedAt: a.lastConfirmedAt,
      })),
    hours: { opd: input.opdHours },
    places: input.places,
    holidays: input.holidays,
  };
}

export type CapabilityProfile = ReturnType<typeof buildCapabilityProfile>;
