/**
 * Where a signed-in user lands (Lab Phase 0, ADR 0223; LD-1..LD-6). One pure function over facts
 * the sign-in loader gathers (app/(auth)/sign-in/landing.ts), so every landing is a table test.
 * Resolution order: superadmin → /admin; hospital admin → /hospital-admin; a clinical role → the
 * doctor workspace for a doctor cadre, the lab for an active lab affiliation, the pharmacy for an
 * active pharmacy affiliation where the pharmacy workspace is on, else /clinician; a
 * pending hospital applicant → their status page; the latest affiliation, by cadre, or its pending
 * page; a patient → /patient; else the landing page.
 *
 * `next` (the ?redirect= a protected page asked for) wins when it is a same-origin path and, for
 * the workspaces whose gate these facts can see, the user may open it (LD-4). Other paths pass to
 * their own page's guard, as before.
 */

/**
 * `pharmacy` is assigned by the loader only where PHARMACY_WORKSPACE is on for the affiliation's
 * hospital (Pharmacy Phase 0 LD-P1); elsewhere a pharmacy cadre stays `other`, as before.
 */
export type CadreGroup = "doctor" | "nurse" | "reception" | "lab" | "pharmacy" | "other";

export interface LandingFacts {
  roles: readonly string[];
  /** Groups of the user's approved or active affiliations. */
  active: { doctor: boolean; lab: boolean; pharmacy?: boolean };
  /** The most recent affiliation of any state. */
  latestAffiliation: { state: string; group: CadreGroup } | null;
  hospitalApplicationState: string | null;
  hasPatientProfile: boolean;
}

export interface Landing {
  target: string;
  reason: string;
  /** A `next` was given and refused (logged by the caller, path prefix only). */
  refusedNext?: string;
}

const CLINICAL_ROLES = ["clinician", "nurse", "pharmacist", "lab_tech", "pharmacy_staff"];
const PENDING_APPLICATION = ["pending_approval", "under_review", "verified", "rejected"];
const ACTIVE = ["approved", "active"];
const GROUP_PATH: Record<CadreGroup, string> = {
  doctor: "/doctor",
  nurse: "/nurse",
  reception: "/reception",
  lab: "/lab",
  pharmacy: "/pharmacy",
  other: "/clinician",
};
const GROUP_REASON: Record<CadreGroup, string> = {
  doctor: "doctor-cadre",
  nurse: "nurse-cadre",
  reception: "reception-cadre",
  lab: "lab-cadre",
  pharmacy: "pharmacy-cadre",
  other: "non-doctor",
};

export function defaultLanding(f: LandingFacts): Landing {
  if (f.roles.includes("superadmin")) return { target: "/admin", reason: "superadmin-role" };
  if (f.roles.includes("hospital_admin"))
    return { target: "/hospital-admin", reason: "hospital-admin-role" };
  if (f.roles.some((r) => CLINICAL_ROLES.includes(r))) {
    if (f.active.doctor) return { target: "/doctor", reason: "doctor-cadre" };
    // The role only carries the workspace; the affiliation is the source (LD-2).
    if (f.roles.includes("lab_tech") && f.active.lab)
      return { target: "/lab", reason: "lab-tech-role" };
    if (f.roles.includes("pharmacy_staff") && f.active.pharmacy)
      return { target: "/pharmacy", reason: "pharmacy-role" };
    return { target: "/clinician", reason: "clinician-role" };
  }
  if (f.hospitalApplicationState && PENDING_APPLICATION.includes(f.hospitalApplicationState))
    return {
      target: "/onboarding/hospital-pending",
      reason: `hospital-application-${f.hospitalApplicationState}`,
    };
  const aff = f.latestAffiliation;
  if (aff) {
    if (ACTIVE.includes(aff.state))
      return {
        target: GROUP_PATH[aff.group],
        reason: `staff-affiliation-${aff.state}-${GROUP_REASON[aff.group]}`,
      };
    return { target: "/onboarding/clinical-pending", reason: `staff-affiliation-${aff.state}` };
  }
  if (f.hasPatientProfile) return { target: "/patient", reason: "patient-profile" };
  return { target: "/", reason: "no-affiliation-or-patient-profile" };
}

/** Same-origin path only: one leading slash, no scheme, no `//` or `/\` (open-redirect guard). */
export function isSameOriginPath(path: string | null | undefined): path is string {
  return !!path && /^\/(?![/\\])\S*$/.test(path);
}

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** Workspaces whose gate the landing facts can answer. Anything else is left to its own guard. */
function mayOpen(path: string, f: LandingFacts): boolean {
  if (under(path, "/admin")) return f.roles.includes("superadmin");
  if (under(path, "/hospital-admin")) return f.roles.includes("hospital_admin");
  if (under(path, "/doctor")) return f.active.doctor;
  if (under(path, "/lab")) return f.active.lab;
  if (under(path, "/pharmacy")) return !!f.active.pharmacy;
  return true;
}

export function resolveLanding(f: LandingFacts, next?: string | null): Landing {
  const landing = defaultLanding(f);
  if (!isSameOriginPath(next)) return landing;
  if (mayOpen(next, f)) return { target: next, reason: "redirect" };
  return { ...landing, refusedNext: `/${next.split(/[/?#]/)[1] ?? ""}` };
}
