import type { Metadata } from "next";
import { SettingsIcon } from "lucide-react";

import { requirePatientScope } from "@/lib/patient/scope";
import { PatientPlaceholderScreen } from "../_components/placeholder-screen";

export const metadata: Metadata = { title: "Settings · MedSync" };
export const dynamic = "force-dynamic";

export default async function PatientSettingsPage() {
  await requirePatientScope();

  return (
    <PatientPlaceholderScreen
      eyebrow="MedSync · Settings"
      title="Settings"
      blurb="Choose how MedSync reaches you and tighten up sign-in security if you'd like to."
      Icon={SettingsIcon}
      backHref="/patient/menu"
      backLabel="Back to More"
      upcoming={[
        "Notification preferences (in-app + SMS dispatcher arrives separately)",
        "Two-factor sign-in — optional for patients; opt in here",
        "Preferred language",
        "Download a copy of your data",
      ]}
    />
  );
}
