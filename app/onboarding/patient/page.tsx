import type { Metadata } from "next";

import { InterestForm } from "../_components/interest-form";

export const metadata: Metadata = {
  title: "For patients · Express interest",
  description: "MedSync is in early access. Tell us a little and we'll let you know when it opens.",
};

export default function PatientOnboardingPage() {
  return (
    <InterestForm
      audience="patient"
      title="For patients"
      subtitle="MedSync isn't open yet. Leave your details and we'll let you know the moment you can use it."
    />
  );
}
