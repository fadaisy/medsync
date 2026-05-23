import type { DistrictOption, SubcountyOption } from "./_form";
import type { Metadata } from "next";

import { listDistricts, listSubcounties } from "@/lib/reference-data";
import { HospitalSignupForm } from "./_form";

export const metadata: Metadata = {
  title: "Hospital application",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /signup/hospital — full hospital application. Distinct from the
 * landing-page "express interest" capture (which lives at
 * /onboarding/hospital and just lands an email in interest_signups).
 * This is the path for a facility that's ready to apply for a pilot.
 *
 * Loads the same district subset GATE C seeded; Kampala-division
 * subcounties for the cascading combobox. Form is a three-step
 * collection of (1) hospital basics, (2) registration + location,
 * (3) applicant + account.
 */
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
    <div className="mx-auto flex w-full max-w-200 flex-col gap-7 px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col gap-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="size-1 rounded-full bg-teal-500" />
          Hospital application
        </span>
        <h1
          className="font-display text-foreground text-[30px] leading-[1.1] tracking-[-0.025em] text-balance sm:text-[42px]"
          style={{ fontWeight: 400 }}
        >
          Apply for a pilot.
        </h1>
        <p className="text-muted-foreground max-w-[58ch] text-[15px] leading-[1.55] sm:text-[16.5px]">
          Submit your facility for review. We confirm registration with the relevant authority and
          your role at the institution. On approval you become hospital admin scoped to your
          facility — your clinicians sign up separately and you approve their affiliations.
        </p>
      </div>

      <HospitalSignupForm districts={districtOptions} subcounties={subcountyOptions} />
    </div>
  );
}
