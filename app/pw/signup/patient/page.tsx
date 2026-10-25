import type { Metadata } from "next";

import { PatientShell } from "@/components/tide/shell";
import { patientFlag } from "@/lib/patient-web/flags";
import { SignupFlow } from "./_components/signup-flow";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

/**
 * Create an account (the phone's sign-up.tsx, Tide v1 F-03): four steps and the done preview, on the one
 * patient onboarding path `/api/mobile/patient-signup`, exactly as the phone calls it. Public: proxy.ts
 * gates the URL the patient asked for (`/signup/patient`, a public prefix) before the rewrite.
 */
export default function PatientSignupPage() {
  return (
    <PatientShell bare>
      <SignupFlow phoneCodeOn={patientFlag("mobilePhoneOtp")} />
    </PatientShell>
  );
}
