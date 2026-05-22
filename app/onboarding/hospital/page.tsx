import type { Metadata } from "next";

import { InterestForm } from "../_components/interest-form";

export const metadata: Metadata = {
  title: "Request a hospital pilot",
  description:
    "We're inviting founding hospital partners in Uganda. Tell us about your facility and we'll be in touch.",
};

export default function HospitalOnboardingPage() {
  return (
    <InterestForm
      audience="hospital"
      title="Request a pilot"
      subtitle="We're inviting founding hospital partners in Uganda. Tell us about your facility and the gap you want MedSync to close."
    />
  );
}
