import type { LandingFacts } from "@/lib/auth/landing";
import { describe, expect, it } from "vitest";

import { defaultLanding, isSameOriginPath, resolveLanding } from "@/lib/auth/landing";

/**
 * Lab Phase 0 — one pure landing resolver (LD-1..LD-6, ADR 0223). The table is every branch the
 * sign-in action had at STOP 0 (STOP-REPORTS Q7), each with its result then; only the row marked
 * CHANGED differs, by GATE A §3.
 */
const none: LandingFacts = {
  roles: [],
  active: { doctor: false, lab: false },
  latestAffiliation: null,
  hospitalApplicationState: null,
  hasPatientProfile: false,
};
const f = (o: Partial<LandingFacts>): LandingFacts => ({ ...none, ...o });

const TABLE: [string, LandingFacts, string, string][] = [
  ["superadmin", f({ roles: ["superadmin"] }), "/admin", "superadmin-role"],
  [
    "superadmin outranks hospital admin",
    f({ roles: ["hospital_admin", "superadmin"] }),
    "/admin",
    "superadmin-role",
  ],
  ["hospital admin", f({ roles: ["hospital_admin"] }), "/hospital-admin", "hospital-admin-role"],
  [
    "clinical role + doctor cadre",
    f({ roles: ["clinician"], active: { doctor: true, lab: false } }),
    "/doctor",
    "doctor-cadre",
  ],
  [
    "lab_tech role + lab affiliation",
    f({ roles: ["lab_tech"], active: { doctor: false, lab: true } }),
    "/lab",
    "lab-tech-role",
  ],
  [
    "doctor outranks lab",
    f({ roles: ["lab_tech", "clinician"], active: { doctor: true, lab: true } }),
    "/doctor",
    "doctor-cadre",
  ],
  // CHANGED (LD-2): before, /lab and then a bounce to /.
  ["lab_tech role, no lab affiliation", f({ roles: ["lab_tech"] }), "/clinician", "clinician-role"],
  ["nurse role only (unchanged quirk)", f({ roles: ["nurse"] }), "/clinician", "clinician-role"],
  ["pharmacist role", f({ roles: ["pharmacist"] }), "/clinician", "clinician-role"],
  ...(["pending_approval", "under_review", "verified", "rejected"].map((state) => [
    `hospital application ${state}`,
    f({ hospitalApplicationState: state }),
    "/onboarding/hospital-pending",
    `hospital-application-${state}`,
  ]) as [string, LandingFacts, string, string][]),
  [
    "hospital application approved falls through",
    f({ hospitalApplicationState: "approved", hasPatientProfile: true }),
    "/patient",
    "patient-profile",
  ],
  ...(
    [
      ["doctor", "/doctor", "doctor-cadre"],
      ["nurse", "/nurse", "nurse-cadre"],
      ["reception", "/reception", "reception-cadre"],
      ["lab", "/lab", "lab-cadre"],
      ["other", "/clinician", "non-doctor"],
    ] as const
  ).flatMap(([group, path, reason]) =>
    (["approved", "active"] as const).map(
      (state) =>
        [
          `no role, ${state} ${group} affiliation`,
          f({ latestAffiliation: { state, group } }),
          path,
          `staff-affiliation-${state}-${reason}`,
        ] as [string, LandingFacts, string, string],
    ),
  ),
  ...(["pending_approval", "under_review", "rejected", "suspended"].map((state) => [
    `no role, ${state} affiliation`,
    f({ latestAffiliation: { state, group: "lab" } }),
    "/onboarding/clinical-pending",
    `staff-affiliation-${state}`,
  ]) as [string, LandingFacts, string, string][]),
  // LD-6: staff before patient, unchanged.
  [
    "staff who is also a patient",
    f({ latestAffiliation: { state: "active", group: "lab" }, hasPatientProfile: true }),
    "/lab",
    "staff-affiliation-active-lab-cadre",
  ],
  ["patient", f({ hasPatientProfile: true }), "/patient", "patient-profile"],
  ["nobody", none, "/", "no-affiliation-or-patient-profile"],
];

describe("landing", () => {
  it.each(TABLE)("LD-1: %s", (_name, facts, target, reason) => {
    expect(defaultLanding(facts)).toEqual({ target, reason });
  });

  it("LD-2: an approved lab professional lands on /lab, by role or by affiliation", () => {
    expect(
      defaultLanding(f({ roles: ["lab_tech"], active: { doctor: false, lab: true } })).target,
    ).toBe("/lab");
    expect(
      defaultLanding(f({ latestAffiliation: { state: "approved", group: "lab" } })).target,
    ).toBe("/lab");
  });

  it("LD-3, D-LAB0-05: several workspaces keep today's precedence (doctor, lab, clinician)", () => {
    expect(
      defaultLanding(f({ roles: ["clinician", "lab_tech"], active: { doctor: true, lab: true } }))
        .target,
    ).toBe("/doctor");
  });

  describe("LD-4: ?redirect=", () => {
    const lab = f({ roles: ["lab_tech"], active: { doctor: false, lab: true } });
    it("is honoured for a same-origin path the user may open", () => {
      expect(resolveLanding(lab, "/lab/results/abc")).toEqual({
        target: "/lab/results/abc",
        reason: "redirect",
      });
      expect(resolveLanding(lab, "/feedback")).toEqual({ target: "/feedback", reason: "redirect" });
    });
    it("is refused for a workspace the facts say the user cannot open, with the prefix only", () => {
      expect(resolveLanding(lab, "/admin/audit?x=1")).toEqual({
        target: "/lab",
        reason: "lab-tech-role",
        refusedNext: "/admin",
      });
      expect(resolveLanding(f({ roles: ["nurse"] }), "/lab")).toMatchObject({
        target: "/clinician",
        refusedNext: "/lab",
      });
      expect(resolveLanding(lab, "/doctor")).toMatchObject({
        target: "/lab",
        refusedNext: "/doctor",
      });
    });
    it("is ignored when it is not a same-origin path", () => {
      for (const bad of [
        "https://evil.test",
        "//evil.test",
        "/\\evil.test",
        "lab",
        "",
        null,
        undefined,
      ]) {
        expect(isSameOriginPath(bad)).toBe(false);
        expect(resolveLanding(lab, bad)).toEqual({ target: "/lab", reason: "lab-tech-role" });
      }
    });
  });
});
