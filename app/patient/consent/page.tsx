import type { Metadata } from "next";
import { ShieldIcon } from "lucide-react";

import { requirePatientScope } from "@/lib/patient/scope";
import { PatientPlaceholderScreen } from "../_components/placeholder-screen";

export const metadata: Metadata = { title: "Consent & sharing · MedSync" };
export const dynamic = "force-dynamic";

export default async function PatientConsentPage() {
  await requirePatientScope();

  return (
    <PatientPlaceholderScreen
      eyebrow="MedSync · Consent"
      title="Consent & sharing"
      blurb="A single place to see who can see what — your hospital, individual clinicians, and any caregivers you've granted access to. Today, your self-tracking stays personal."
      Icon={ShieldIcon}
      backHref="/patient/menu"
      backLabel="Back to More"
      upcoming={[
        "Your primary hospital and what they can access",
        "Per-clinician access — granted via appointments + visits",
        "Caregiver invitations — share with family if you choose",
        "Revoke any of the above; full history in your audit log",
      ]}
    />
  );
}
