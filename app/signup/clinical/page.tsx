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
import { SignupShell } from "../_components/signup-shell";
import { ClinicalSignupForm } from "./_form";

export const metadata: Metadata = {
  title: "Medical-staff signup",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ClinicalSignupPage() {
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
    <SignupShell
      pathSegments={["signup", "clinical"]}
      eyebrow="Medical staff · approval-gated"
      title={
        <>
          Council registration{" "}
          <span className="text-teal-700 italic dark:text-teal-300">is the anchor.</span>
        </>
      }
      subtitle={
        <>
          We verify against UMDPC, UNMC, AHPC, or PSU. Every hospital affiliation is approved
          separately by that hospital&apos;s admin. MFA is mandatory before any clinical access
          opens up.
        </>
      }
    >
      <ClinicalSignupForm refData={refData} />
    </SignupShell>
  );
}
