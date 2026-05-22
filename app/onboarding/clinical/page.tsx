import type { Metadata } from "next";

import { InterestForm } from "../_components/interest-form";

export const metadata: Metadata = {
  title: "For clinicians · Express interest",
  description:
    "Are you a Ugandan clinician — doctor, nurse, pharmacist? Tell us about you and the patients you'd want MedSync for.",
};

export default function ClinicalOnboardingPage() {
  return (
    <InterestForm
      audience="clinical"
      title="For clinicians"
      subtitle="Doctor, nurse, pharmacist, lab tech — tell us about you and the patients you'd want MedSync for."
    />
  );
}
