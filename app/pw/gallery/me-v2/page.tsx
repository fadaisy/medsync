import { PageHeader, PatientShell } from "@/components/tide/shell";
import { MeV2Fixtures } from "./fixtures";

/** Patient app v2 Me on fixtures (Step 10): the card, the plans, the trial and paying. No patient data. */
export default function MeV2Gallery() {
  return (
    <PatientShell>
      <PageHeader overline="Kit · v2" area="me" title="Me" demo />
      <MeV2Fixtures />
    </PatientShell>
  );
}
