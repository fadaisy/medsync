import type { Metadata } from "next";

import { StubPanel } from "@/app/signup/_components/stub-panel";

export const metadata: Metadata = {
  title: "Medical-staff signup",
  robots: { index: false, follow: false },
};

export default function ClinicalSignupPage() {
  return (
    <StubPanel
      title="Medical-staff signup"
      intro="Council registration is the verification anchor. Each hospital × department × role affiliation is approved independently. MFA is mandatory before any clinical access."
      gate="D"
      bullets={[
        "Account basics: title, name, phone, institutional email, password",
        "Professional identity: council, registration number, licence document upload, expiry",
        "Affiliation(s): hospital + department + cadre + role + employment type (add multiple)",
        "Role-specific details (vary by cadre: specialty, ward/unit, dispensing scope, scope confirmation)",
        "MFA enrolment (mandatory) → pending_approval holding screen",
      ]}
    />
  );
}
