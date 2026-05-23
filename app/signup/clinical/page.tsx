import type { ClinicalRefData } from "./_form";
import type { Metadata } from "next";

import {
  listCadres,
  listCouncils,
  listHospitalDepartments,
  listHospitals,
  listRoles,
  listSpecialties,
} from "@/lib/reference-data";
import { ClinicalSignupForm } from "./_form";

export const metadata: Metadata = {
  title: "Medical-staff signup",
  robots: { index: false, follow: false },
};

// Render at request time, not at build. The reference catalog is
// finite but we don't want to bake an empty placeholder at build if
// the DB isn't reachable, and the form is interactive anyway.
export const dynamic = "force-dynamic";

/**
 * /signup/clinical — server entry. Loads:
 *
 *   - Councils (4) — segmented control
 *   - Cadres (all) — cascading from council
 *   - Hospitals + their departments — combobox + cascading combobox
 *   - Specialties (top-level + IM sub-specialties) — optional combobox
 *   - Roles (all) — cascading from cadre
 *
 * Sizes are small enough to ship in the initial HTML (councils=4,
 * cadres~20, roles~60, top-level specialties~14). The form filters
 * client-side via CascadingCombobox's sync mode.
 */
export default async function ClinicalSignupPage() {
  // listSpecialties() without args returns top-level + sub-specialties
  // (no parent filter), which is what the picker needs — users should
  // be able to choose either "Internal Medicine" or "Cardiology".
  const [councils, cadres, hospitals, departments, allSpecialties, roles] = await Promise.all([
    listCouncils(),
    listCadres(),
    listHospitals(),
    listHospitalDepartments(),
    listSpecialties(),
    listRoles(),
  ]);

  const refData: ClinicalRefData = {
    councils: councils.map((c) => ({ value: c.id, label: c.name, description: c.shortName })),
    cadres: cadres.map((c) => ({
      value: c.id,
      label: c.name,
      parentValue: c.councilId,
    })),
    hospitals: hospitals.map((h) => ({
      value: h.id,
      label: h.name,
      description: h.level.replace(/_/g, " "),
    })),
    departments: departments.map((d) => ({
      value: d.id,
      label: d.name,
      parentValue: d.hospitalId,
    })),
    specialties: allSpecialties.map((s) => ({
      value: s.id,
      label: s.name,
    })),
    roles: roles.map((r) => ({
      value: r.id,
      label: r.name,
      parentValue: r.cadreId,
    })),
  };

  return (
    <div className="mx-auto flex w-full max-w-200 flex-col gap-7 px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Medical-staff signup
        </span>
        <h1
          className="font-display text-foreground text-[30px] leading-[1.1] tracking-[-0.025em] text-balance sm:text-[42px]"
          style={{ fontWeight: 400 }}
        >
          Verify your council registration.
        </h1>
        <p className="text-muted-foreground max-w-[58ch] text-[15px] leading-[1.55] sm:text-[16.5px]">
          Council registration anchors the verification. Each hospital affiliation is approved
          separately by the hospital admin. MFA is mandatory before any clinical access.
        </p>
      </div>

      <ClinicalSignupForm refData={refData} />
    </div>
  );
}
