import { PageHeader, PatientShell } from "@/components/tide/shell";
import { GALLERY_SHELL } from "../v2-shell";
import { VisitV2Fixtures } from "./fixtures";

/**
 * Patient app v2 Visit mode on the web (Step 5) on fixtures: `?screen=book|visits|day`. Public, no patient data
 * (L1: the Demo data pill); used for screenshots, the clicks-to-booking count (S11) and the axe pass (S12).
 */
export default async function VisitV2Gallery({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>;
}) {
  const { screen = "day" } = await searchParams;
  const title =
    screen === "pay"
      ? "Paying"
      : screen === "book"
        ? "Book a visit"
        : screen === "visits"
          ? "Visits"
          : "Your visit";
  return (
    <PatientShell v2={GALLERY_SHELL}>
      <PageHeader overline="Kit · v2" area="visits" title={title} demo />
      <VisitV2Fixtures screen={screen} />
    </PatientShell>
  );
}
