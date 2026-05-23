import type { DistrictOption, SubcountyOption } from "./_form";
import type { Metadata } from "next";

import { listDistricts, listSubcounties } from "@/lib/reference-data";
import { SignupShell } from "../_components/signup-shell";
import { PatientSignupForm } from "./_form";

export const metadata: Metadata = {
  title: "Patient signup",
  robots: { index: false, follow: false },
};

/**
 * /signup/patient — server entry. Loads reference data (districts + the
 * Kampala-division subcounty subset that's seeded today) and hands it
 * to the client form. No PHI passes through the server here; only
 * public reference data.
 */
export default async function PatientSignupPage() {
  const districts = await listDistricts();
  const districtOptions: DistrictOption[] = districts.map((d) => ({
    value: d.id,
    label: d.name,
    description: d.isCity ? "City" : undefined,
  }));

  const kampala = districts.find((d) => d.code === "KAMPALA");
  let subcountyOptions: SubcountyOption[] = [];
  if (kampala) {
    const subs = await listSubcounties({ districtId: kampala.id });
    subcountyOptions = subs.map((s) => ({
      value: s.id,
      label: s.name,
      parentValue: kampala.id,
    }));
  }

  return (
    <SignupShell
      pathSegments={["signup", "patient"]}
      eyebrow="Patient signup · ~3 minutes"
      title={
        <>
          Your record,{" "}
          <span className="text-teal-700 italic dark:text-teal-300">in your hands.</span>
        </>
      }
      subtitle={
        <>
          A few details so your hospital and care team can find you. Everything else lives on the
          dashboard you&apos;ll land on in a minute.
        </>
      }
    >
      <PatientSignupForm districts={districtOptions} subcounties={subcountyOptions} />
    </SignupShell>
  );
}
