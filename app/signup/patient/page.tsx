import type { DistrictOption, SubcountyOption } from "./_form";
import type { Metadata } from "next";

import { listDistricts, listSubcounties } from "@/lib/reference-data";
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

  // Until the full UBOS subcounty pull lands (GATE G), only Kampala's
  // divisions are seeded — load those eagerly so the cascading combobox
  // has data without an extra round-trip. Other districts fall back to
  // a single "Subcounty list coming soon — leave blank" combobox state.
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
          Patient signup
        </span>
        <h1
          className="font-display text-foreground text-[30px] leading-[1.1] tracking-[-0.025em] text-balance sm:text-[42px]"
          style={{ fontWeight: 400 }}
        >
          Create your account.
        </h1>
        <p className="text-muted-foreground max-w-[58ch] text-[15px] leading-[1.55] sm:text-[16.5px]">
          A few details so your hospital and care team can find your record. You can update
          everything else from the dashboard later.
        </p>
      </div>

      <PatientSignupForm districts={districtOptions} subcounties={subcountyOptions} />
    </div>
  );
}
