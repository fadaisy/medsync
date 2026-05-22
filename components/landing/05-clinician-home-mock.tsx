import { SectionStub } from "./_section-stub";

/**
 * §05b — "Clinician Home" mock. The hero's centerpiece app surface.
 * Built rich at GATE B from real design-system components, with obviously
 * fictional sample data ("Amina N.", "Dr. Okello"), marked illustrative.
 */
export function ClinicianHomeMock() {
  return (
    <SectionStub
      n={5}
      name="Clinician Home mock (hero surface)"
      intent="Dominant product mock under the hero — sidebar + Good morning header + Today panel + Patient detail with vitals trend + critical alert + auto-suggested urgent slot + care-team avatars."
      runtime="server"
      buildAt="GATE B"
      todo={[
        "Left sidebar: logo, nav, alerts badge, sections, CmdK affordance",
        'Main: "Good morning, Dr. Okello" + clinical command bar',
        "Today panel: 3 schedule rows (ward round, OPD, tele-follow-up)",
        "Detail: Amina N. patient card + vitals trend (mmol/L, mono) + critical alert + urgent-slot suggestion + care-team avatars",
        'Mark "illustrative" affordance somewhere visible',
        "Reduced-motion: alert pulse becomes static",
      ]}
    />
  );
}
