import type { Metadata } from "next";

import { StubPanel } from "@/app/signup/_components/stub-panel";

export const metadata: Metadata = {
  title: "Hospital application",
  robots: { index: false, follow: false },
};

export default function HospitalSignupPage() {
  return (
    <StubPanel
      title="Hospital application"
      intro="Full application creates an account + a hospital record for review by MedSync. Once approved, your account is elevated to hospital admin, scoped to that hospital only. Not ready to commit? Express interest via the landing page instead."
      gate="E"
      bullets={[
        "Official hospital name, facility level, ownership",
        "Licence / registration identifiers (institutional proof)",
        "District + subcounty, physical address",
        "Official institutional email domain (verification signal)",
        "Applicant: name, role at facility, phone, authorisation document upload",
        "Password → verify → MFA → pending_approval (reviewed by superadmin)",
      ]}
    />
  );
}
