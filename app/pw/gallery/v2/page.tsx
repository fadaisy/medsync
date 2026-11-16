import { PageHeader, PatientShell } from "@/components/tide/shell";
import { GalleryV2 } from "./gallery-v2";

/**
 * Patient app v2 kit harness (Step 3b): every new component and state on fixtures (L1: the Demo data pill),
 * for light and dark screenshots. Public, shows no patient data. Names are the prompt's invented ones.
 */
export default function GalleryV2Page() {
  return (
    <PatientShell>
      <PageHeader
        overline="Kit · v2"
        area="me"
        title="Patient app v2 components"
        subtitle="Every state, on sample data."
        demo
      />
      <GalleryV2 />
    </PatientShell>
  );
}
