import type { Metadata } from "next";

import { StubPanel } from "@/app/signup/_components/stub-panel";

export const metadata: Metadata = {
  title: "Patient signup",
  robots: { index: false, follow: false },
};

export default function PatientSignupPage() {
  return (
    <StubPanel
      title="Patient signup"
      intro="Phone-verified account, optional MFA, active immediately. From your dashboard you'll be able to join queues, pick a primary facility, and see your history."
      gate="C"
      bullets={[
        "Name, sex, date of birth",
        "ID type + number (NIN / passport / none) — encrypted at rest",
        "Phone (primary, +256) and optional email",
        "District + subcounty of residence",
        "Optional: preferred language, primary facility, known conditions, next of kin",
        "Consent + password → OTP verify",
      ]}
    />
  );
}
