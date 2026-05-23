import type { DistrictOption, SubcountyOption } from "./_form";
import type { Metadata } from "next";

import { listDistricts, listSubcounties } from "@/lib/reference-data";
import { SignupShell } from "../_components/signup-shell";
import { HospitalSignupForm } from "./_form";

export const metadata: Metadata = {
  title: "Hospital application",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function HospitalSignupPage() {
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
      pathSegments={["signup", "hospital"]}
      eyebrow="Hospital application · reviewed by MedSync"
      title={
        <>
          Apply for <span className="text-teal-700 italic dark:text-teal-300">a pilot.</span>
        </>
      }
      subtitle={
        <>
          Submit your facility for review. We confirm registration with the relevant authority and
          your role at the institution. On approval you become hospital admin scoped to your
          facility — clinicians sign up separately and you approve their affiliations.
        </>
      }
    >
      <HospitalSignupForm districts={districtOptions} subcounties={subcountyOptions} />
    </SignupShell>
  );
}
